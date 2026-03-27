import { create } from 'zustand';
import type { Game, Player, Concept, Message } from '../types';

interface ValidatingState {
  playerId: string;
  playerName: string;
  rawInput: string;
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

  // Players
  players: Player[];
  setPlayers: (p: Player[]) => void;

  // Timeline
  timeline: Concept[];
  setTimeline: (t: Concept[]) => void;
  addConcept: (c: Concept) => void;

  // Messages
  messages: Message[];
  setMessages: (m: Message[]) => void;
  addMessage: (m: Message) => void;

  // Validating indicator
  validating: ValidatingState | null;
  setValidating: (v: ValidatingState | null) => void;

  // UI
  activeTab: 'chat' | 'timeline';
  setActiveTab: (t: 'chat' | 'timeline') => void;

  // Reset
  reset: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  connected: false,
  setConnected: (v) => set({ connected: v }),

  me: null,
  setMe: (p) => set({ me: p }),

  game: null,
  setGame: (g) => set({ game: g }),

  players: [],
  setPlayers: (p) => set({ players: p }),

  timeline: [],
  setTimeline: (t) => set({ timeline: t }),
  addConcept: (c) =>
    set((s) => ({
      timeline: [...s.timeline, c].sort((a, b) => {
        if (a.year == null && b.year == null) return 0;
        if (a.year == null) return 1;
        if (b.year == null) return -1;
        return a.year - b.year;
      }),
    })),

  messages: [],
  setMessages: (m) => set({ messages: m }),
  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),

  validating: null,
  setValidating: (v) => set({ validating: v }),

  activeTab: 'chat',
  setActiveTab: (t) => set({ activeTab: t }),

  reset: () =>
    set({
      me: null, game: null, players: [],
      timeline: [], messages: [],
      validating: null, activeTab: 'chat',
    }),
}));
