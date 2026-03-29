# 历史接龙 (History-Loong) — Project Guide for Claude

## What This Project Is

A real-time multiplayer Chinese history knowledge chain game. Players submit historical concepts (events, figures, dynasties), an AI validates them and places them on a shared timeline. Built with React + TypeScript frontend, Node.js + Socket.io backend, SQLite database.

## Repository Structure

```
history-loong/
├── frontend/          # React + TypeScript + Tailwind + Zustand
│   └── src/
│       ├── index.css          # Theme system + all animations
│       ├── ThemeContext.tsx   # Theme state (4 themes), localStorage persistence
│       ├── main.tsx / App.tsx
│       ├── pages/
│       │   ├── Home.tsx       # Create/join room
│       │   ├── Game.tsx       # Main game page (all game logic UI)
│       │   └── Admin.tsx      # Admin dashboard (AI config, knowledge base)
│       ├── components/
│       │   ├── Chat.tsx       # Message list + concept/chat input
│       │   ├── Timeline.tsx   # Timeline with era grouping + pending concepts
│       │   ├── PlayerList.tsx
│       │   ├── ExportPanel.tsx
│       │   └── ThemeSwitcher.tsx
│       ├── services/
│       │   ├── socket.ts      # Socket.io client wrapper (all game actions)
│       │   └── api.ts         # REST API wrapper
│       ├── store/gameStore.ts # Zustand global state
│       └── types/index.ts     # All TypeScript interfaces
│
├── backend/           # Node.js + Express + Socket.io + SQLite
│   └── src/
│       ├── server.js
│       ├── socket/index.js    # All real-time game logic
│       ├── services/
│       │   ├── aiService.js   # Multi-provider AI (Anthropic, OpenAI-compatible)
│       │   ├── timelineService.js  # Era/dynasty mapping
│       │   ├── knowledgeService.js # FTS5 knowledge base
│       │   └── exportService.js
│       ├── routes/            # REST: games, admin, export
│       ├── db/index.js        # SQLite schema + prepared statements
│       └── plugins/index.js   # Game mode plugin system
│
├── CLAUDE.md          # This file
└── package.json       # npm workspaces (run both with `npm run dev`)
```

## Dev Commands

```bash
npm run dev          # Start both frontend (Vite :5173) + backend (:3000) concurrently
npm run dev:frontend # Frontend only
npm run dev:backend  # Backend only
```

Frontend proxies `/api/*` and socket connections to `localhost:3000`.

## Theme System

**4 themes** defined in `frontend/src/index.css` via CSS custom properties on `:root` / `[data-theme="X"]`:

| Theme | data-theme | Name | Palette |
|-------|-----------|------|---------|
| Light | (none) | 清雅 | Indigo on white |
| Dark  | `dark`  | 墨韵 | Indigo on dark navy |
| Gold  | `gold`  | 锦绣 | Amber on cream |
| Jade  | `jade`  | 竹青 | Green on light sage |

**CSS variables**: `--brand`, `--brand-dark`, `--brand-light`, `--bg-page`, `--bg-card`, `--bg-muted`, `--bg-muted2`, `--text-primary`, `--text-secondary`, `--text-muted`, `--border`, `--border-subtle`, `--shadow`, `--nav-bg`, `--nav-text`, `--nav-active`

**How it works**:
1. `index.html` has an inline `<script>` that reads `localStorage('hl-theme')` and sets `data-theme` on `<html>` before React loads (prevents FOUC)
2. `ThemeContext.tsx` manages state, persists to `localStorage`, and calls `applyTheme()` on changes
3. Tailwind utility classes (e.g. `bg-white`, `text-slate-800`) are globally overridden per-theme in `index.css` with `!important`
4. `ThemeSwitcher.tsx` reads `THEMES` array from `ThemeContext.tsx` — just add an entry there to add a new theme

**Adding a new theme**: add CSS vars block to `index.css` + add entry to `THEMES` in `ThemeContext.tsx` + add Tailwind class overrides in `index.css`.

## Validation Modes

| Mode | How it works |
|------|-------------|
| **realtime** (default) | Each submitted concept is immediately AI-validated. Takes 2-5s per concept. |
| **deferred** | Concepts saved as pending. Player clicks "结算" → batch AI validation → game ends. |
| **free** (new) | Like deferred, but players can click "立即验证" on individual pending concepts at any time. Game does not end after validation. |

The `validationMode` is stored in `game.settings` (JSON). The deferred "结算" button still works as before.

## Socket Events Reference

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `game:join` | `{ gameId, playerName }` | Join room |
| `concept:submit` | `{ rawInput }` | Submit concept |
| `concept:validate_single` | `{ conceptId }` | Validate one pending concept (free validation) |
| `game:settle` | `{}` | Batch validate all pending + end game |
| `game:hint` | `{}` | Get AI suggestions |
| `game:finish` | `{}` | End game (realtime mode) |
| `message:send` | `{ content }` | Send chat message |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `concept:new` | `{ concept }` | Validated concept added to timeline |
| `concept:pending` | `{ concept }` | Concept saved as pending |
| `concept:validating` | `{ playerId, playerName, rawInput }` | AI validation started |
| `concept:settled` | `{ conceptId, accepted, concept?, reason? }` | One concept validated (batch OR single) |
| `game:settle:start` | `{ total }` | Batch settle started |
| `game:settle:done` | `{ accepted, rejected }` | Batch settle finished |
| `game:finished` | — | Game ended |
| `message:new` | `Message` | New chat/system message |
| `players:update` | `{ players }` | Player list changed |

## AI Service

**File**: `backend/src/services/aiService.js`

Supports two provider types:
- `anthropic` — Native Anthropic SDK
- `openai-compatible` — OpenAI, DeepSeek, Qwen, Ollama, any OpenAI-compatible API

Config is stored in the `ai_configs` SQLite table, managed from the Admin page. Falls back to env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`).

AI returns structured JSON: `{ valid, name, year, dynasty, period, description, tags }`. Negative year = BC.

## Database (SQLite)

**Key tables**: `games`, `concepts`, `messages`, `players`, `ai_configs`, `knowledge_docs`, `knowledge_chunks`, `knowledge_fts` (FTS5)

`concepts` table flags: `validated=1, rejected=0` = accepted; `validated=0, rejected=0` = pending; `validated=0, rejected=1` = rejected.

## State Management

Zustand store at `frontend/src/store/gameStore.ts`. Key state:
- `timeline` — validated concepts (sorted by year)
- `pendingConcepts` — unvalidated pending concepts
- `validating` — current AI-validating indicator
- `settle` — batch settle progress state (`running`, `total`, `done`, `accepted`, `rejected`)

## Animations

All animations defined in `frontend/src/index.css`. Key classes:
- `.animate-fade-in` — opacity fade
- `.animate-slide-up` — slide from below
- `.animate-spring-in` — spring bounce entrance (use for new items)
- `.animate-pop-in` — scale pop (for badges/toasts)
- `.animate-slide-down` — slide from above (for expanded content)
- `.animate-float` — continuous gentle float
- `.stagger-1` through `.stagger-5` — animation-delay classes for lists
- `.timeline-dot-new` — pulse ring on new timeline dots
- `.hover-lift` — hover translate-Y + shadow

## Known Patterns

- Socket handlers in `Game.tsx` are registered **once** in a `useEffect([], [])` and use `useRef` for fresh component values (avoids stale closure bugs)
- Zustand store actions (e.g. `addConcept`, `removePendingConcept`) are safe to call from one-time `useEffect` closures because Zustand's `set(s => ...)` always reads current state
- `useGameStore.getState()` can be used outside React components or in one-time closures to read current Zustand state
- Backend `concept:settled` event is reused for both batch settle and single free validation. Frontend checks `useGameStore.getState().settle.running` to decide whether to count toward batch progress
