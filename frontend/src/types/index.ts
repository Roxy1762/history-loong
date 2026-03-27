// ── Core domain types ─────────────────────────────────────────────────────────

export interface Game {
  id: string;
  topic: string;
  mode: GameMode;
  status: 'waiting' | 'playing' | 'finished';
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type GameMode = 'free' | 'chain' | 'ordered' | string; // extensible

export interface Player {
  id: string;
  name: string;
  color: string;
}

export interface Concept {
  id: string;
  game_id: string;
  player_id: string;
  player_name: string;
  raw_input: string;
  name: string;
  period: string;
  year: number | null;
  dynasty: string;
  description: string;
  tags: string[];
  extra: Record<string, unknown>;
  validated: number;
  rejected: number;
  eraLabel?: string;
  created_at: string;
}

export interface Message {
  id: string;
  game_id: string;
  player_id: string | null;
  player_name: string | null;
  type: 'text' | 'system' | 'concept_attempt' | string;
  content: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface GameModeConfig {
  label: string;
  description: string;
}

// ── Socket event payloads ─────────────────────────────────────────────────────

export interface JoinPayload {
  gameId: string;
  playerName: string;
}

export interface JoinResponse {
  ok?: boolean;
  error?: string;
  game?: Game;
  player?: Player;
  timeline?: Concept[];
  messages?: Message[];
}

export interface ConceptNewEvent {
  concept: Concept;
}

export interface ConceptValidatingEvent {
  playerId: string;
  playerName: string;
  rawInput: string;
}

// ── Export ────────────────────────────────────────────────────────────────────

export type ExportFormat = 'json' | 'markdown' | 'csv' | string;
