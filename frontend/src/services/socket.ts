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
    console.log('[Socket] Creating new socket connection to /');
    socket = io('/', {
      // Prefer WebSocket, fall back to long-polling if WS upgrade fails
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      // Connection handshake timeout (ms)
      timeout: 20000,
    });

    // Global connection lifecycle logging
    socket.on('connect', () => {
      console.log(`[Socket] Connected id=${socket?.id} transport=${(socket as unknown as { conn?: { transport?: { name?: string } } })?.conn?.transport?.name}`);
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

/** Wait for socket to be connected, resolving immediately if already connected. */
function waitConnected(timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    if (s.connected) { resolve(); return; }
    const timer = setTimeout(() => {
      s.off('connect', onConnect);
      s.off('connect_error', onError);
      reject(new Error('连接服务器超时，请检查网络后刷新重试'));
    }, timeoutMs);
    function onConnect() {
      clearTimeout(timer);
      s.off('connect_error', onError);
      resolve();
    }
    function onError(err: Error) {
      clearTimeout(timer);
      s.off('connect', onConnect);
      reject(new Error(`无法连接到服务器：${err.message}`));
    }
    s.once('connect', onConnect);
    s.once('connect_error', onError);
  });
}

export function disconnectSocket() {
  console.log('[Socket] disconnectSocket called');
  socket?.disconnect();
  socket = null;
}

// ── Game actions ──────────────────────────────────────────────────────────────

export async function joinGame(payload: JoinPayload): Promise<JoinResponse> {
  console.log(`[Socket] joinGame START gameId=${payload.gameId} playerName=${payload.playerName}`);
  try {
    // Ensure the socket is connected before attempting to join
    await waitConnected(15000);
    console.log(`[Socket] joinGame socket connected, emitting game:join`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '连接超时，请检查网络后刷新重试';
    console.error(`[Socket] joinGame connection failed: ${msg}`);
    return { error: msg };
  }

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      console.error('[Socket] joinGame ack TIMEOUT (15s) — server did not respond');
      resolve({ error: '服务器响应超时，请刷新页面重试' });
    }, 15000);
    getSocket().emit('game:join', payload, (res: JoinResponse) => {
      clearTimeout(timer);
      if (res.error) {
        console.error(`[Socket] joinGame error: ${res.error}`);
      } else {
        console.log(`[Socket] joinGame OK gameId=${payload.gameId} player=${res.player?.name}`);
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
