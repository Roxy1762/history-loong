const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../../data/history-loong.db');

// Ensure directory exists
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

// Enable WAL mode for better concurrency
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

  CREATE INDEX IF NOT EXISTS idx_concepts_game ON concepts(game_id);
  CREATE INDEX IF NOT EXISTS idx_messages_game ON messages(game_id);
  CREATE INDEX IF NOT EXISTS idx_players_game  ON players(game_id);
`);

// ── Helpers ───────────────────────────────────────────────────────────────────

const stmt = (sql) => db.prepare(sql);

module.exports = {
  db,
  // Games
  createGame: stmt(`
    INSERT INTO games (id, topic, mode, settings) VALUES (?, ?, ?, ?)
  `),
  getGame: stmt(`SELECT * FROM games WHERE id = ?`),
  updateGameStatus: stmt(`
    UPDATE games SET status = ?, updated_at = datetime('now') WHERE id = ?
  `),
  updateGameSettings: stmt(`
    UPDATE games SET settings = ?, updated_at = datetime('now') WHERE id = ?
  `),

  // Players
  upsertPlayer: stmt(`
    INSERT OR REPLACE INTO players (id, game_id, name, color) VALUES (?, ?, ?, ?)
  `),
  getPlayers: stmt(`SELECT * FROM players WHERE game_id = ?`),

  // Concepts
  insertConcept: stmt(`
    INSERT INTO concepts (id, game_id, player_id, player_name, raw_input, name, period,
      year, dynasty, description, tags, validated, rejected, reject_reason, extra)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getConceptsByGame: stmt(`
    SELECT * FROM concepts WHERE game_id = ? ORDER BY year ASC, created_at ASC
  `),
  getConceptCount: stmt(`SELECT COUNT(*) as count FROM concepts WHERE game_id = ? AND validated = 1`),

  // Messages
  insertMessage: stmt(`
    INSERT INTO messages (id, game_id, player_id, player_name, type, content, meta)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  getMessagesByGame: stmt(`SELECT * FROM messages WHERE game_id = ? ORDER BY created_at ASC`),
};
