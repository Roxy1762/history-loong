import { io, Socket } from 'socket.io-client';
import type {
  JoinPayload, JoinResponse, Message, Concept, Player,
  ConceptNewEvent, ConceptPendingEvent, ConceptValidatingEvent,
  ConceptSettledEvent, SettleStartEvent, SettleDoneEvent, SettleProgressEvent,
} from '../types';

// ── Socket singleton ──────────────────────────────────────────────────────────

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    console.log('[Socket] Creating new socket connection');
    socket = io('/', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    // Global connection lifecycle logging
    socket.on('connect', () => {
      console.log(`[Socket] Connected id=${socket?.id}`);
    });
    socket.on('disconnect', (reason) => {
      console.warn(`[Socket] Disconnected reason=${reason}`);
    });
    socket.on('connect_error', (err) => {
      console.error(`[Socket] Connection error: ${err.message}`);
    });
    socket.on('reconnect_attempt', (attempt) => {
      console.log(`[Socket] Reconnect attempt #${attempt}`);
    });
    socket.on('reconnect', (attempt) => {
      console.log(`[Socket] Reconnected after ${attempt} attempts`);
    });
    socket.on('reconnect_failed', () => {
      console.error('[Socket] Reconnection failed after all attempts');
    });
  }
  return socket;
}

export function disconnectSocket() {
  console.log('[Socket] disconnectSocket called');
  socket?.disconnect();
  socket = null;
}

// ── Game actions ──────────────────────────────────────────────────────────────

export function joinGame(payload: JoinPayload): Promise<JoinResponse> {
  console.log(`[Socket] joinGame gameId=${payload.gameId} playerName=${payload.playerName}`);
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      console.error('[Socket] joinGame TIMEOUT (15s)');
      resolve({ error: '连接超时，请检查网络后刷新重试' });
    }, 15000);
    getSocket().emit('game:join', payload, (res: JoinResponse) => {
      clearTimeout(timer);
      if (res.error) {
        console.error(`[Socket] joinGame error: ${res.error}`);
      } else {
        console.log(`[Socket] joinGame OK gameId=${payload.gameId}`);
      }
      resolve(res);
    });
  });
}

export function submitConcept(rawInput: string): Promise<{ ok?: boolean; error?: string; pending?: boolean; concept?: Concept }> {
  console.log(`[Socket] submitConcept input="${rawInput}"`);
  return new Promise(resolve => getSocket().emit('concept:submit', { rawInput }, (res: { ok?: boolean; error?: string; pending?: boolean; concept?: Concept }) => {
    if (res.error) console.error(`[Socket] submitConcept error: ${res.error}`);
    else console.log(`[Socket] submitConcept OK pending=${res.pending}`);
    resolve(res);
  }));
}

export function settleConcepts(): Promise<{ ok?: boolean; error?: string; total?: number }> {
  console.log('[Socket] settleConcepts');
  return new Promise(resolve => getSocket().emit('game:settle', {}, resolve));
}

export function sendMessage(content: string): Promise<{ ok?: boolean; error?: string }> {
  return new Promise(resolve => getSocket().emit('message:send', { content }, resolve));
}

export function requestHints(): Promise<{ ok?: boolean; error?: string; hints?: string[] }> {
  console.log('[Socket] requestHints');
  return new Promise(resolve => getSocket().emit('game:hint', {}, resolve));
}

export function finishGame(): Promise<{ ok?: boolean; error?: string }> {
  console.log('[Socket] finishGame');
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
  'game:deleted':        () => void;
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
