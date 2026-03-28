import { io, Socket } from 'socket.io-client';
import type {
  JoinPayload, JoinResponse, Message, Concept, Player,
  ConceptNewEvent, ConceptPendingEvent, ConceptValidatingEvent,
  ConceptSettledEvent, SettleStartEvent, SettleDoneEvent, SettleProgressEvent,
} from '../types';

// ── Tiny client-side log buffer (last 200 entries, viewable in devtools) ──────

interface LogEntry { ts: string; level: string; msg: string; }
const _logBuf: LogEntry[] = [];
const MAX_LOG = 200;

function slog(level: 'info' | 'warn' | 'error', msg: string) {
  const entry: LogEntry = { ts: new Date().toISOString().slice(11, 23), level, msg };
  _logBuf.push(entry);
  if (_logBuf.length > MAX_LOG) _logBuf.shift();
  const prefix = `[Socket][${entry.ts}]`;
  if (level === 'error') console.error(`${prefix} ${msg}`);
  else if (level === 'warn')  console.warn(`${prefix} ${msg}`);
  else                        console.log(`${prefix} ${msg}`);
}

/** Expose log buffer for debugging: window.__socketLogs() in browser console */
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__socketLogs = () => {
    console.table(_logBuf.map(e => ({ time: e.ts, level: e.level, msg: e.msg })));
    return _logBuf;
  };
}

// ── Socket singleton ──────────────────────────────────────────────────────────

let socket: Socket | null = null;

function getTransport() {
  return (socket as unknown as { conn?: { transport?: { name?: string } } })?.conn?.transport?.name ?? 'unknown';
}

function getSocket(): Socket {
  if (!socket) {
    slog('info', 'Creating new socket connection to /');
    socket = io('/', {
      // Start with polling (more reliable through proxies), then upgrade to WebSocket.
      // This avoids "websocket error" causing immediate failure before polling fallback.
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      // Connection handshake timeout (ms)
      timeout: 20000,
    });

    socket.on('connect', () => {
      slog('info', `Connected  id=${socket?.id}  transport=${getTransport()}`);
    });
    socket.on('disconnect', (reason) => {
      slog('warn', `Disconnected  reason=${reason}  transport=${getTransport()}`);
    });
    socket.on('connect_error', (err) => {
      slog('error', `connect_error  msg="${err.message}"  transport=${getTransport()}`);
    });
    socket.on('reconnect_attempt', (attempt) => {
      slog('info', `Reconnect attempt #${attempt}  transport=${getTransport()}`);
    });
    socket.on('reconnect', (attempt) => {
      slog('info', `Reconnected after ${attempt} attempts  transport=${getTransport()}`);
    });
    socket.on('reconnect_failed', () => {
      slog('error', 'Reconnection failed after all attempts');
    });

    // Log when transport upgrades from polling → websocket
    socket.io.on('upgrade', (transport) => {
      slog('info', `Transport upgraded → ${(transport as { name?: string }).name ?? transport}`);
    });
    socket.io.on('upgradeError', (err) => {
      slog('warn', `Transport upgrade failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }
  return socket;
}

/**
 * Wait for socket to be connected, resolving immediately if already connected.
 * Does NOT reject on connect_error — Socket.IO will retry automatically.
 * Only rejects on reconnect_failed (all attempts exhausted) or timeout.
 */
function waitConnected(timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    if (s.connected) {
      slog('info', `waitConnected: already connected  transport=${getTransport()}`);
      resolve();
      return;
    }

    slog('info', `waitConnected: waiting up to ${timeoutMs}ms …`);

    const timer = setTimeout(() => {
      s.off('connect', onConnect);
      s.off('reconnect_failed', onFailed);
      slog('error', `waitConnected: TIMEOUT after ${timeoutMs}ms`);
      reject(new Error('连接服务器超时，请检查网络后刷新重试'));
    }, timeoutMs);

    function onConnect() {
      clearTimeout(timer);
      s.off('reconnect_failed', onFailed);
      slog('info', `waitConnected: resolved  transport=${getTransport()}`);
      resolve();
    }

    function onFailed() {
      clearTimeout(timer);
      s.off('connect', onConnect);
      slog('error', 'waitConnected: rejected — reconnect_failed');
      reject(new Error('无法连接到服务器，已达到最大重连次数，请刷新页面重试'));
    }

    s.once('connect', onConnect);
    s.once('reconnect_failed', onFailed);
  });
}

export function disconnectSocket() {
  slog('info', 'disconnectSocket called');
  socket?.disconnect();
  socket = null;
}

// ── Game actions ──────────────────────────────────────────────────────────────

export async function joinGame(payload: JoinPayload): Promise<JoinResponse> {
  slog('info', `joinGame START  gameId=${payload.gameId}  playerName=${payload.playerName}`);
  try {
    await waitConnected(15000);
    slog('info', `joinGame emitting game:join  transport=${getTransport()}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '连接超时，请检查网络后刷新重试';
    slog('error', `joinGame connection failed: ${msg}`);
    return { error: msg };
  }

  return new Promise(resolve => {
    const t0 = Date.now();
    const timer = setTimeout(() => {
      slog('error', `joinGame ack TIMEOUT (15s)  elapsed=${Date.now() - t0}ms — server did not respond`);
      resolve({ error: '服务器响应超时，请刷新页面重试' });
    }, 15000);

    getSocket().emit('game:join', payload, (res: JoinResponse) => {
      clearTimeout(timer);
      const elapsed = Date.now() - t0;
      if (res.error) {
        slog('error', `joinGame error="${res.error}"  elapsed=${elapsed}ms`);
      } else {
        slog('info', `joinGame OK  gameId=${payload.gameId}  player=${res.player?.name}  elapsed=${elapsed}ms`);
      }
      resolve(res);
    });
  });
}

export function submitConcept(rawInput: string): Promise<{ ok?: boolean; error?: string; pending?: boolean; concept?: Concept }> {
  slog('info', `submitConcept input="${rawInput}"`);
  return new Promise(resolve => getSocket().emit('concept:submit', { rawInput }, (res: { ok?: boolean; error?: string; pending?: boolean; concept?: Concept }) => {
    if (res.error) slog('error', `submitConcept error: ${res.error}`);
    else slog('info', `submitConcept OK pending=${res.pending}`);
    resolve(res);
  }));
}

export function settleConcepts(): Promise<{ ok?: boolean; error?: string; total?: number }> {
  slog('info', 'settleConcepts emit');
  return new Promise(resolve => getSocket().emit('game:settle', {}, resolve));
}

export function sendMessage(content: string): Promise<{ ok?: boolean; error?: string }> {
  return new Promise(resolve => getSocket().emit('message:send', { content }, resolve));
}

export function requestHints(): Promise<{ ok?: boolean; error?: string; hints?: string[] }> {
  slog('info', 'requestHints emit');
  return new Promise(resolve => getSocket().emit('game:hint', {}, resolve));
}

export function finishGame(): Promise<{ ok?: boolean; error?: string }> {
  slog('info', 'finishGame emit');
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

