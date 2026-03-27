require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const gamesRouter = require('./routes/games');
const exportRouter = require('./routes/export');
const setupSocket = require('./socket');
const { loadPlugins, GAME_MODES } = require('./plugins');

// ── App setup ─────────────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const PORT = parseInt(process.env.PORT || '3001', 10);

const io = new Server(server, {
  cors: {
    origin: [FRONTEND_URL, 'http://localhost:4173'],
    methods: ['GET', 'POST'],
  },
});

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({ origin: [FRONTEND_URL, 'http://localhost:4173'] }));
app.use(express.json());

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(distPath));
}

// ── API Routes ────────────────────────────────────────────────────────────────

app.use('/api/games', gamesRouter);
app.use('/api/export', exportRouter);

app.get('/api/modes', (_req, res) => res.json({ modes: GAME_MODES }));

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

// SPA fallback
if (process.env.NODE_ENV === 'production') {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  });
}

// ── Socket.io ─────────────────────────────────────────────────────────────────

setupSocket(io);

// ── Plugins ───────────────────────────────────────────────────────────────────

loadPlugins();

// ── Start ─────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║   历史接龙 History-Loong Server      ║
  ║   http://localhost:${PORT}              ║
  ╚══════════════════════════════════════╝
  `);
});
