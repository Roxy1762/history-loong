const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../../data/history-loong.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id          TEXT PRIMARY KEY,
    topic       TEXT NOT NULL,
    mode        TEXT NOT NULL DEFAULT 'free',
    status      TEXT NOT NULL DEFAULT 'waiting',
    settings    TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS players (
    id          TEXT NOT NULL,
    game_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#6366f1',
    joined_at   TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id, game_id),
    FOREIGN KEY (game_id) REFERENCES games(id)
  );

  CREATE TABLE IF NOT EXISTS concepts (
    id          TEXT PRIMARY KEY,
    game_id     TEXT NOT NULL,
    player_id   TEXT NOT NULL,
    player_name TEXT NOT NULL,
    raw_input   TEXT NOT NULL,
    name        TEXT,
    period      TEXT,
    year        INTEGER,
    dynasty     TEXT,
    description TEXT,
    tags        TEXT NOT NULL DEFAULT '[]',
    validated   INTEGER NOT NULL DEFAULT 0,
    rejected    INTEGER NOT NULL DEFAULT 0,
    reject_reason TEXT,
    extra       TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (game_id) REFERENCES games(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    game_id     TEXT NOT NULL,
    player_id   TEXT,
    player_name TEXT,
    type        TEXT NOT NULL DEFAULT 'text',
    content     TEXT NOT NULL,
    meta        TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (game_id) REFERENCES games(id)
  );

  -- AI provider configurations (supports Anthropic + any OpenAI-compatible)
  CREATE TABLE IF NOT EXISTS ai_configs (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    provider_type TEXT NOT NULL DEFAULT 'openai-compatible',
    base_url     TEXT,
    api_key      TEXT NOT NULL,
    model        TEXT NOT NULL,
    is_active    INTEGER NOT NULL DEFAULT 0,
    extra        TEXT NOT NULL DEFAULT '{}',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Knowledge base documents
  CREATE TABLE IF NOT EXISTS knowledge_docs (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    filename     TEXT NOT NULL,
    total_chunks INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Knowledge chunks with full-text search
  CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id         TEXT PRIMARY KEY,
    doc_id     TEXT NOT NULL,
    chunk_idx  INTEGER NOT NULL,
    content    TEXT NOT NULL,
    FOREIGN KEY (doc_id) REFERENCES knowledge_docs(id)
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts
    USING fts5(content, chunk_id UNINDEXED, tokenize='unicode61');

  CREATE INDEX IF NOT EXISTS idx_concepts_game ON concepts(game_id);
  CREATE INDEX IF NOT EXISTS idx_messages_game ON messages(game_id);
  CREATE INDEX IF NOT EXISTS idx_players_game  ON players(game_id);
  CREATE INDEX IF NOT EXISTS idx_chunks_doc    ON knowledge_chunks(doc_id);
`);

// ── Helpers ───────────────────────────────────────────────────────────────────

const stmt = (sql) => db.prepare(sql);

module.exports = {
  db,

  // Games
  createGame:        stmt(`INSERT INTO games (id, topic, mode, settings) VALUES (?, ?, ?, ?)`),
  getGame:           stmt(`SELECT * FROM games WHERE id = ?`),
  updateGameStatus:  stmt(`UPDATE games SET status = ?, updated_at = datetime('now') WHERE id = ?`),
  updateGameSettings:stmt(`UPDATE games SET settings = ?, updated_at = datetime('now') WHERE id = ?`),
  listGames:         stmt(`SELECT id, topic, mode, status, created_at FROM games ORDER BY created_at DESC LIMIT 50`),
  listAllGames:      stmt(`SELECT * FROM games ORDER BY created_at DESC LIMIT 100`),
  listGamesByStatus: stmt(`SELECT * FROM games WHERE status = ? ORDER BY created_at DESC LIMIT 100`),
  deleteGame:        stmt(`DELETE FROM games WHERE id = ?`),

  // Players
  upsertPlayer: stmt(`INSERT OR REPLACE INTO players (id, game_id, name, color) VALUES (?, ?, ?, ?)`),
  getPlayers:   stmt(`SELECT * FROM players WHERE game_id = ?`),
  getPlayerCount: stmt(`SELECT COUNT(*) as count FROM players WHERE game_id = ?`),
  deletePlayersByGame: stmt(`DELETE FROM players WHERE game_id = ?`),

  // Concepts
  insertConcept: stmt(`
    INSERT INTO concepts (id, game_id, player_id, player_name, raw_input, name, period,
      year, dynasty, description, tags, validated, rejected, reject_reason, extra)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getConceptsByGame: stmt(`SELECT * FROM concepts WHERE game_id = ? ORDER BY year ASC, created_at ASC`),
  getPendingConcepts:stmt(`SELECT * FROM concepts WHERE game_id = ? AND validated = 0 AND rejected = 0 ORDER BY created_at ASC`),
  getConceptCount:   stmt(`SELECT COUNT(*) as count FROM concepts WHERE game_id = ? AND validated = 1`),
  getPendingConceptCount: stmt(`SELECT COUNT(*) as count FROM concepts WHERE game_id = ? AND validated = 0 AND rejected = 0`),
  deleteConceptsByGame: stmt(`DELETE FROM concepts WHERE game_id = ?`),
  acceptConcept: stmt(`
    UPDATE concepts SET validated=1, rejected=0, name=?, period=?, year=?, dynasty=?,
      description=?, tags=?, extra=? WHERE id=?
  `),
  rejectConcept: stmt(`UPDATE concepts SET validated=0, rejected=1, reject_reason=? WHERE id=?`),

  // Messages
  insertMessage:    stmt(`INSERT INTO messages (id, game_id, player_id, player_name, type, content, meta) VALUES (?, ?, ?, ?, ?, ?, ?)`),
  getMessagesByGame:stmt(`SELECT * FROM messages WHERE game_id = ? ORDER BY created_at ASC`),
  getMessageCount:  stmt(`SELECT COUNT(*) as count FROM messages WHERE game_id = ?`),
  deleteMessagesByGame: stmt(`DELETE FROM messages WHERE game_id = ?`),

  // AI configs
  listAIConfigs:   stmt(`SELECT * FROM ai_configs ORDER BY created_at DESC`),
  getActiveAIConfig:stmt(`SELECT * FROM ai_configs WHERE is_active = 1 LIMIT 1`),
  getAIConfig:     stmt(`SELECT * FROM ai_configs WHERE id = ?`),
  insertAIConfig:  stmt(`INSERT INTO ai_configs (id, name, provider_type, base_url, api_key, model, is_active, extra) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
  updateAIConfig:  stmt(`UPDATE ai_configs SET name=?, provider_type=?, base_url=?, api_key=?, model=?, extra=? WHERE id=?`),
  setAllAIInactive:stmt(`UPDATE ai_configs SET is_active = 0`),
  setAIActive:     stmt(`UPDATE ai_configs SET is_active = 1 WHERE id = ?`),
  deleteAIConfig:  stmt(`DELETE FROM ai_configs WHERE id = ?`),

  // Knowledge docs
  listDocs:       stmt(`SELECT id, title, filename, total_chunks, created_at FROM knowledge_docs ORDER BY created_at DESC`),
  getDoc:         stmt(`SELECT * FROM knowledge_docs WHERE id = ?`),
  insertDoc:      stmt(`INSERT INTO knowledge_docs (id, title, filename, total_chunks) VALUES (?, ?, ?, ?)`),
  deleteDoc:      stmt(`DELETE FROM knowledge_docs WHERE id = ?`),

  // Knowledge chunks
  insertChunk:    stmt(`INSERT INTO knowledge_chunks (id, doc_id, chunk_idx, content) VALUES (?, ?, ?, ?)`),
  deleteChunksByDoc:stmt(`DELETE FROM knowledge_chunks WHERE doc_id = ?`),
  insertFTS:      stmt(`INSERT INTO knowledge_fts (content, chunk_id) VALUES (?, ?)`),
  deleteFTSByChunkIds: db.prepare(`DELETE FROM knowledge_fts WHERE chunk_id IN (SELECT id FROM knowledge_chunks WHERE doc_id = ?)`),
  searchFTS:      stmt(`SELECT chunk_id, snippet(knowledge_fts, 0, '<b>', '</b>', '...', 20) as snippet FROM knowledge_fts WHERE content MATCH ? ORDER BY rank LIMIT ?`),
  getChunkById:   stmt(`SELECT * FROM knowledge_chunks WHERE id = ?`),

  // Stats
  stats: stmt(`
    SELECT
      (SELECT COUNT(*) FROM games) as total_games,
      (SELECT COUNT(*) FROM concepts WHERE validated = 1) as total_concepts,
      (SELECT COUNT(*) FROM knowledge_docs) as total_docs,
      (SELECT COUNT(*) FROM ai_configs) as total_ai_configs
  `),
};
