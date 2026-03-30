import { io, Socket } from 'socket.io-client';
import type {
  JoinPayload, JoinResponse, Message, Concept, Player,
  ConceptNewEvent, ConceptPendingEvent, ConceptValidatingEvent,
  ConceptSettledEvent, SettleStartEvent, SettleDoneEvent,
  TurnUpdateEvent, ScoresUpdateEvent, ChallengeUpdateEvent,
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

// ── Connection health state ───────────────────────────────────────────────────
// Track reconnect attempt count so UI can show progressive feedback
let _reconnectAttempts = 0;
const _connListeners: Array<(state: ConnectionState) => void> = [];

export type ConnectionState =
  | { status: 'connected'; transport: string }
  | { status: 'disconnected'; reason: string }
  | { status: 'reconnecting'; attempt: number }
  | { status: 'failed' };

function notifyConnListeners(state: ConnectionState) {
  _connListeners.forEach(fn => { try { fn(state); } catch { /* ignore */ } });
}

export function onConnectionState(fn: (s: ConnectionState) => void): () => void {
  _connListeners.push(fn);
  return () => {
    const i = _connListeners.indexOf(fn);
    if (i !== -1) _connListeners.splice(i, 1);
  };
}

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
      reconnectionAttempts: 30,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.4,
      // Connection handshake timeout (ms)
      timeout: 20000,
    });

    socket.on('connect', () => {
      _reconnectAttempts = 0;
      slog('info', `Connected  id=${socket?.id}  transport=${getTransport()}`);
      notifyConnListeners({ status: 'connected', transport: getTransport() });
    });
    socket.on('disconnect', (reason) => {
      slog('warn', `Disconnected  reason=${reason}  transport=${getTransport()}`);
      notifyConnListeners({ status: 'disconnected', reason });
    });
    socket.on('connect_error', (err) => {
      slog('error', `connect_error  msg="${err.message}"  transport=${getTransport()}`);
    });
    socket.on('reconnect_attempt', (attempt) => {
      _reconnectAttempts = attempt;
      slog('info', `Reconnect attempt #${attempt}  transport=${getTransport()}`);
      notifyConnListeners({ status: 'reconnecting', attempt });
    });
    socket.on('reconnect', (attempt) => {
      _reconnectAttempts = 0;
      slog('info', `Reconnected after ${attempt} attempts  transport=${getTransport()}`);
      notifyConnListeners({ status: 'connected', transport: getTransport() });
    });
    socket.on('reconnect_failed', () => {
      slog('error', 'Reconnection failed after all attempts');
      notifyConnListeners({ status: 'failed' });
    });

    // Log when transport upgrades from polling → websocket
    (socket.io as unknown as { on: (event: string, cb: (arg: unknown) => void) => void }).on('upgrade', (transport) => {
      slog('info', `Transport upgraded → ${(transport as { name?: string }).name ?? String(transport)}`);
    });
    (socket.io as unknown as { on: (event: string, cb: (arg: unknown) => void) => void }).on('upgradeError', (err) => {
      slog('warn', `Transport upgrade failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }
  return socket;
}

export function getReconnectAttempts() { return _reconnectAttempts; }

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
  _reconnectAttempts = 0;
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

/** Batch-settle all pending concepts. endGame=true also ends the game session.
 *  conceptIds — if provided, only validate those specific pending concepts (multi-select). */
export function settleConcepts(endGame = false, conceptIds?: string[]): Promise<{ ok?: boolean; error?: string; total?: number }> {
  slog('info', `settleConcepts emit endGame=${endGame} ids=${conceptIds?.length ?? 'all'}`);
  return new Promise(resolve => getSocket().emit('game:settle', { endGame, conceptIds }, resolve));
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

/** Skip the current challenge card and pick a new one */
export function skipChallenge(): Promise<{ ok?: boolean; error?: string; card?: { id: string; text: string; tag: string } }> {
  slog('info', 'skipChallenge emit');
  return new Promise(resolve => getSocket().emit('challenge:skip', {}, (res: { ok?: boolean; error?: string; card?: { id: string; text: string; tag: string } }) => {
    if (res.error) slog('error', `skipChallenge error: ${res.error}`);
    else slog('info', `skipChallenge OK`);
    resolve(res);
  }));
}

/** Validate a single pending concept without ending the game (free-validation mode) */
export function validateSingleConcept(conceptId: string): Promise<{ ok?: boolean; error?: string }> {
  slog('info', `validateSingleConcept conceptId=${conceptId}`);
  return new Promise(resolve => getSocket().emit('concept:validate_single', { conceptId }, (res: { ok?: boolean; error?: string }) => {
    if (res.error) slog('error', `validateSingleConcept error: ${res.error}`);
    else slog('info', `validateSingleConcept OK conceptId=${conceptId}`);
    resolve(res);
  }));
}

/** Edit a concept's raw input (own pending concept, or any if admin) */
export function editConcept(conceptId: string, newInput: string): Promise<{ ok?: boolean; error?: string }> {
  slog('info', `editConcept conceptId=${conceptId}`);
  return new Promise(resolve => getSocket().emit('concept:edit', { conceptId, newInput }, (res: { ok?: boolean; error?: string }) => {
    if (res.error) slog('error', `editConcept error: ${res.error}`);
    else slog('info', `editConcept OK`);
    resolve(res);
  }));
}

/** Delete a concept (own pending concept, or any if admin) */
export function deleteConcept(conceptId: string): Promise<{ ok?: boolean; error?: string }> {
  slog('info', `deleteConcept conceptId=${conceptId}`);
  return new Promise(resolve => getSocket().emit('concept:delete', { conceptId }, (res: { ok?: boolean; error?: string }) => {
    if (res.error) slog('error', `deleteConcept error: ${res.error}`);
    else slog('info', `deleteConcept OK`);
    resolve(res);
  }));
}

/** Elevate current socket session to admin (requires admin key) */
export function adminJoinGame(gameId: string, adminKey: string): Promise<{ ok?: boolean; error?: string }> {
  slog('info', `adminJoinGame gameId=${gameId}`);
  return new Promise(resolve => getSocket().emit('admin:join', { gameId, adminKey }, (res: { ok?: boolean; error?: string }) => {
    if (res.error) slog('error', `adminJoinGame error: ${res.error}`);
    else slog('info', `adminJoinGame OK`);
    resolve(res);
  }));
}

// ── Event listeners ───────────────────────────────────────────────────────────

export type SocketEventMap = {
  'message:new':         (msg: Message) => void;
  'concept:new':         (e: ConceptNewEvent) => void;
  'concept:pending':     (e: ConceptPendingEvent) => void;
  'concept:validating':  (e: ConceptValidatingEvent) => void;
  'concept:settled':     (e: ConceptSettledEvent) => void;
  'concept:edited':      (e: { concept: import('../types').Concept }) => void;
  'concept:deleted':     (e: { conceptId: string }) => void;
  'game:settle:start':   (e: SettleStartEvent) => void;
  'game:settle:progress':(e: { done: number; total: number }) => void;
  'game:settle:done':    (e: SettleDoneEvent) => void;
  'players:update':      (e: { players: Player[] }) => void;
  'game:finished':       () => void;
  'game:deleted':        () => void;
  'game:restored':       () => void;
  // Mode events
  'turn:update':         (e: TurnUpdateEvent) => void;
  'scores:update':       (e: ScoresUpdateEvent) => void;
  'challenge:update':    (e: ChallengeUpdateEvent) => void;
  'relay:round_reset':   (e: Record<string, never>) => void;
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

