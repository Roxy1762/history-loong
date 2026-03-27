import { io, Socket } from 'socket.io-client';
import type {
  JoinPayload, JoinResponse, Message, Concept, Player,
  ConceptNewEvent, ConceptPendingEvent, ConceptValidatingEvent,
  ConceptSettledEvent, SettleStartEvent, SettleDoneEvent, SettleProgressEvent,
} from '../types';

// ── Socket singleton ──────────────────────────────────────────────────────────

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket || !socket.connected) {
    socket = io('/', { transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

// ── Game actions ──────────────────────────────────────────────────────────────

export function joinGame(payload: JoinPayload): Promise<JoinResponse> {
  return new Promise(resolve => getSocket().emit('game:join', payload, resolve));
}

export function submitConcept(rawInput: string): Promise<{ ok?: boolean; error?: string; pending?: boolean; concept?: Concept }> {
  return new Promise(resolve => getSocket().emit('concept:submit', { rawInput }, resolve));
}

export function settleConcepts(): Promise<{ ok?: boolean; error?: string; total?: number }> {
  return new Promise(resolve => getSocket().emit('game:settle', {}, resolve));
}

export function sendMessage(content: string): Promise<{ ok?: boolean; error?: string }> {
  return new Promise(resolve => getSocket().emit('message:send', { content }, resolve));
}

export function requestHints(): Promise<{ ok?: boolean; error?: string; hints?: string[] }> {
  return new Promise(resolve => getSocket().emit('game:hint', {}, resolve));
}

export function finishGame(): Promise<{ ok?: boolean; error?: string }> {
  return new Promise(resolve => getSocket().emit('game:finish', {}, resolve));
}

// ── Event listeners ───────────────────────────────────────────────────────────

export type SocketEventMap = {
  'message:new':         (msg: Message) => void;
  'concept:new':         (e: ConceptNewEvent) => void;
  'concept:pending':     (e: ConceptPendingEvent) => void;
  'concept:validating':  (e: ConceptValidatingEvent) => void;
  'concept:settled':     (e: ConceptSettledEvent) => void;
  'game:settle:start':   (e: SettleStartEvent) => void;
  'game:settle:progress':(e: SettleProgressEvent) => void;
  'game:settle:done':    (e: SettleDoneEvent) => void;
  'players:update':      (e: { players: Player[] }) => void;
  'game:finished':       () => void;
  'connect':             () => void;
  'disconnect':          (reason: string) => void;
  'connect_error':       (err: Error) => void;
};

export function onSocket<K extends keyof SocketEventMap>(
  event: K,
  handler: SocketEventMap[K]
): () => void {
  const s = getSocket();
  s.on(event as string, handler as (...args: unknown[]) => void);
  return () => s.off(event as string, handler as (...args: unknown[]) => void);
}
