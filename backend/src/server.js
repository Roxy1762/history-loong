require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const gamesRouter = require('./routes/games');
const exportRouter = require('./routes/export');
const adminRouter  = require('./routes/admin');
const setupSocket  = require('./socket');
const { loadPlugins, GAME_MODES } = require('./plugins');

// ── App setup ─────────────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const PORT = parseInt(process.env.PORT || '3001', 10);

// In production the frontend is co-hosted by this server, so any same-origin
// WebSocket request is valid regardless of hostname. Restricting origins here
// would break deployments where PUBLIC_URL isn't configured (e.g., accessed
// via IP). In dev we keep the explicit allowlist.
const corsOrigins = process.env.NODE_ENV === 'production'
  ? true
  : [FRONTEND_URL, 'http://localhost:4173'];

const io = new Server(server, {
  cors: { origin: corsOrigins, methods: ['GET', 'POST'] },
  // Keep connections alive: ping every 25s, disconnect if no pong within 20s
  pingInterval: 25000,
  pingTimeout: 20000,
  // Allow up to 1 MB per message
  maxHttpBufferSize: 1e6,
});

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({ origin: corsOrigins }));
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`[HTTP] ${req.method} ${req.path}`);
  }
  next();
});

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  let distPath = path.join(__dirname, '../../frontend/dist');
  if (!require('fs').existsSync(distPath)) {
    distPath = path.join(__dirname, '../frontend/dist');
  }
  app.use(express.static(distPath));
}

// ── API Routes ────────────────────────────────────────────────────────────────

app.use('/api/games', gamesRouter);
app.use('/api/export', exportRouter);
app.use('/api/admin', adminRouter);

app.get('/api/modes', (_req, res) => res.json({ modes: GAME_MODES }));

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

// SPA fallback
if (process.env.NODE_ENV === 'production') {
  app.get('*', (_req, res) => {
    let indexPath = path.join(__dirname, '../../frontend/dist/index.html');
    if (!require('fs').existsSync(indexPath)) {
      indexPath = path.join(__dirname, '../frontend/dist/index.html');
    }
    res.sendFile(indexPath);
  });
}

// ── Socket.io ─────────────────────────────────────────────────────────────────

// Log total connected clients on connect/disconnect
io.on('connection', (socket) => {
  const clientCount = io.engine.clientsCount;
  console.log(`[IO] client connected  id=${socket.id} total=${clientCount} transport=${socket.conn?.transport?.name}`);
  socket.on('disconnect', (reason) => {
    const remaining = io.engine.clientsCount;
    console.log(`[IO] client disconnected id=${socket.id} reason=${reason} remaining=${remaining}`);
  });
});

setupSocket(io);

// ── Plugins ───────────────────────────────────────────────────────────────────

loadPlugins();

// ── Start ─────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  const adminKey = process.env.ADMIN_KEY || 'admin';
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   历史接龙 History-Loong Server          ║
  ║   App:   http://localhost:${PORT}           ║
  ║   Admin: http://localhost:${PORT}/admin     ║
  ║   Key:   ${adminKey.padEnd(30)} ║
  ╚══════════════════════════════════════════╝
  `);
});
