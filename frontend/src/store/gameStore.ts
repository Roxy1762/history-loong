import { create } from 'zustand';
import type { Game, Player, Concept, Message, TurnState, ChallengeCard } from '../types';

interface ValidatingState {
  playerId: string;
  playerName: string;
  rawInput: string;
}

export interface SettleState {
  running: boolean;
  total: number;
  done: number;
  accepted: number;
  rejected: number;
}

interface GameState {
  // Connection
  connected: boolean;
  setConnected: (v: boolean) => void;

  // Current player
  me: Player | null;
  setMe: (p: Player | null) => void;

  // Game
  game: Game | null;
  setGame: (g: Game | null) => void;

  // Players (includes score field for score-race/challenge)
  players: Player[];
  setPlayers: (p: Player[]) => void;

  // Validated timeline
  timeline: Concept[];
  setTimeline: (t: Concept[]) => void;
  addConcept: (c: Concept) => void;

  // Pending concepts (deferred mode)
  pendingConcepts: Concept[];
  setPendingConcepts: (p: Concept[]) => void;
  addPendingConcept: (c: Concept) => void;
  removePendingConcept: (id: string) => void;

  // Multi-select for batch validation
  selectedPendingIds: Set<string>;
  toggleSelectedPending: (id: string) => void;
  clearSelectedPending: () => void;

  // Messages
  messages: Message[];
  setMessages: (m: Message[]) => void;
  addMessage: (m: Message) => void;

  // Real-time validating indicator
  validating: ValidatingState | null;
  setValidating: (v: ValidatingState | null) => void;

  // Settlement state
  settle: SettleState;
  setSettleRunning: (total: number) => void;
  incrementSettleDone: (accepted: boolean) => void;
  resetSettle: () => void;

  // Turn-order mode
  turnState: TurnState | null;
  setTurnState: (t: TurnState | null) => void;

  // Score-race / challenge mode
  scores: Record<string, number>;
  setScores: (s: Record<string, number>) => void;

  // Challenge card
  challengeCard: ChallengeCard | null;
  setChallengeCard: (c: ChallengeCard | null) => void;

  // UI
  activeTab: 'chat' | 'timeline';
  setActiveTab: (t: 'chat' | 'timeline') => void;

  // Reset
  reset: () => void;
}

const sortByYear = (a: Concept, b: Concept) => {
  if (a.year == null && b.year == null) return 0;
  if (a.year == null) return 1;
  if (b.year == null) return -1;
  return a.year - b.year;
};

const INITIAL_SETTLE: SettleState = { running: false, total: 0, done: 0, accepted: 0, rejected: 0 };

export const useGameStore = create<GameState>((set) => ({
  connected: false,
  setConnected: v => set({ connected: v }),

  me: null,
  setMe: p => set({ me: p }),

  game: null,
  setGame: g => set({ game: g }),

  players: [],
  setPlayers: p => set({ players: p }),

  timeline: [],
  setTimeline: t => set({ timeline: t }),
  addConcept: c => set(s => ({ timeline: [...s.timeline, c].sort(sortByYear) })),

  pendingConcepts: [],
  setPendingConcepts: p => set({ pendingConcepts: p }),
  addPendingConcept: c => set(s => ({ pendingConcepts: [...s.pendingConcepts, c] })),
  removePendingConcept: id => set(s => ({
    pendingConcepts: s.pendingConcepts.filter(c => c.id !== id),
    selectedPendingIds: new Set([...s.selectedPendingIds].filter(sid => sid !== id)),
  })),

  selectedPendingIds: new Set(),
  toggleSelectedPending: (id) => set(s => {
    const next = new Set(s.selectedPendingIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { selectedPendingIds: next };
  }),
  clearSelectedPending: () => set({ selectedPendingIds: new Set() }),

  messages: [],
  setMessages: m => set({ messages: m }),
  addMessage: m => set(s => ({
    messages: s.messages.length >= 500
      ? [...s.messages.slice(-499), m]
      : [...s.messages, m],
  })),

  validating: null,
  setValidating: v => set({ validating: v }),

  settle: INITIAL_SETTLE,
  setSettleRunning: total => set({ settle: { ...INITIAL_SETTLE, running: true, total } }),
  incrementSettleDone: accepted => set(s => ({
    settle: {
      ...s.settle,
      done: s.settle.done + 1,
      accepted: s.settle.accepted + (accepted ? 1 : 0),
      rejected: s.settle.rejected + (accepted ? 0 : 1),
    },
  })),
  resetSettle: () => set({ settle: INITIAL_SETTLE }),

  turnState: null,
  setTurnState: t => set({ turnState: t }),

  scores: {},
  setScores: s => set({ scores: s }),

  challengeCard: null,
  setChallengeCard: c => set({ challengeCard: c }),

  activeTab: 'chat',
  setActiveTab: t => set({ activeTab: t }),

  reset: () => set({
    me: null, game: null, players: [],
    timeline: [], pendingConcepts: [],
    selectedPendingIds: new Set(),
    messages: [], validating: null,
    settle: INITIAL_SETTLE,
    turnState: null, scores: {}, challengeCard: null,
    activeTab: 'chat',
  }),
}));
