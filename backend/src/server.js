// Auto-create .env from .env.example if not present (allows starting without manual setup)
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '../../.env');
const envExamplePath = path.join(__dirname, '../../.env.example');
if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  fs.copyFileSync(envExamplePath, envPath);
  console.log('[Setup] .env not found — auto-created from .env.example (API key not yet configured)');
}

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const gamesRouter = require('./routes/games');
const exportRouter = require('./routes/export');
const adminRouter  = require('./routes/admin');
const setupSocket  = require('./socket');
const { loadPlugins, GAME_MODES } = require('./plugins');
const ai = require('./services/aiService');

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
app.use('/api/admin', adminRouter);

app.get('/api/modes', (_req, res) => res.json({ modes: GAME_MODES }));

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

// Public status endpoint — lets the frontend know if AI is configured
// No auth required so the UI can show a setup banner for first-time users
app.get('/api/status', (_req, res) => {
  const config = ai.resolveConfig();
  res.json({
    ok: true,
    aiConfigured: !!config,
    version: require('../../package.json').version || '1.0.0',
  });
});

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
  const adminKey = process.env.ADMIN_KEY || 'admin';
  const aiConfigured = !!ai.resolveConfig();
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   🐉 历史接龙 History-Loong             ║
  ║   App:   http://localhost:${PORT}           ║
  ║   Admin: http://localhost:${PORT}/admin     ║
  ║   Key:   ${adminKey.padEnd(30)} ║
  ╚══════════════════════════════════════════╝`);
  if (!aiConfigured) {
    console.log(`
  ⚠️  AI 未配置 — 游戏可以正常进行，但 AI 验证/提示功能暂不可用。
     请访问 http://localhost:${PORT}/admin → AI 配置 页面添加 API Key。
     支持：Anthropic Claude、OpenAI、DeepSeek、Qwen、本地 Ollama 等。
`);
  }
});
