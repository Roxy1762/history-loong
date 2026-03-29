// ── Core domain types ─────────────────────────────────────────────────────────

export interface Game {
  id: string;
  topic: string;
  mode: GameMode;
  status: 'waiting' | 'playing' | 'finished';
  settings: GameSettings;
  created_at: string;
  updated_at: string;
}

export type GameMode =
  | 'free'
  | 'chain'
  | 'ordered'
  | 'relay'
  | 'turn-order'
  | 'score-race'
  | 'challenge'
  | string;

export type ValidationMode = 'realtime' | 'deferred';

export interface GameSettings {
  validationMode?: ValidationMode;
  [key: string]: unknown;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  score?: number; // present in score-race / challenge modes
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
  validated: number;  // 1 = accepted
  rejected: number;   // 1 = rejected
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

// ── Turn state (turn-order mode) ──────────────────────────────────────────────

export interface TurnState {
  currentPlayerId: string | null;
  currentPlayerName: string | null;
  turnIndex: number;
  order: string[];
}

// ── Challenge card (challenge mode) ──────────────────────────────────────────

export interface ChallengeCard {
  id: string;
  text: string;
  tag: string;
}

// ── Socket event payloads ─────────────────────────────────────────────────────

export interface JoinPayload { gameId: string; playerName: string; }

export interface JoinResponse {
  ok?: boolean;
  error?: string;
  game?: Game;
  player?: Player;
  timeline?: Concept[];
  pendingConcepts?: Concept[];
  messages?: Message[];
  scores?: Record<string, number>;
  turnState?: TurnState | null;
  challengeCard?: ChallengeCard | null;
}

export interface ConceptNewEvent     { concept: Concept; }
export interface ConceptPendingEvent { concept: Concept; }
export interface ConceptValidatingEvent { playerId: string; playerName: string; rawInput: string; }

export interface ConceptSettledEvent {
  conceptId: string;
  accepted: boolean;
  concept?: Concept;
  reason?: string;
  playerName?: string;
  rawInput?: string;
}

export interface SettleStartEvent { total: number; }
export interface SettleDoneEvent  { accepted: number; rejected: number; endGame?: boolean; }

export interface TurnUpdateEvent extends TurnState {}

export interface ScoresUpdateEvent { scores: Record<string, number>; }

export interface ChallengeUpdateEvent {
  card: ChallengeCard | null;
  round: number;
}

// ── Export ────────────────────────────────────────────────────────────────────

export type ExportFormat = 'json' | 'markdown' | 'csv' | 'html' | string;
