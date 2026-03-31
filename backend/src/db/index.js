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

// ── Migrations ────────────────────────────────────────────────────────────────

// v1.1.0: add source column to knowledge_docs (manual | ai_confirmed)
try {
  db.exec(`ALTER TABLE knowledge_docs ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'`);
} catch { /* column already exists */ }

// v1.1.0: add game_id column to knowledge_docs for tracing AI-confirmed origin
try {
  db.exec(`ALTER TABLE knowledge_docs ADD COLUMN game_id TEXT`);
} catch { /* column already exists */ }

// v1.2.0: add notes column to games for admin annotations
try {
  db.exec(`ALTER TABLE games ADD COLUMN notes TEXT NOT NULL DEFAULT ''`);
} catch { /* column already exists */ }

// v1.3.0: AI validation audit log
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_decisions (
    id               TEXT PRIMARY KEY,
    concept_id       TEXT NOT NULL,
    game_id          TEXT NOT NULL,
    validation_method TEXT NOT NULL DEFAULT 'ai',
    ai_prompt        TEXT,
    ai_response      TEXT,
    ai_provider      TEXT,
    ai_model         TEXT,
    decision_made_at TEXT NOT NULL DEFAULT (datetime('now')),
    decision_ms      INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_ai_decisions_game ON ai_decisions(game_id);
  CREATE INDEX IF NOT EXISTS idx_ai_decisions_concept ON ai_decisions(concept_id);
`);

// v1.3.0: concept admin overrides
db.exec(`
  CREATE TABLE IF NOT EXISTS concept_overrides (
    concept_id        TEXT PRIMARY KEY,
    original_decision TEXT NOT NULL,
    override_decision TEXT NOT NULL,
    override_reason   TEXT,
    overridden_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// v1.3.0: validation result cache
db.exec(`
  CREATE TABLE IF NOT EXISTS validation_cache (
    input_hash  TEXT NOT NULL,
    topic       TEXT NOT NULL,
    result      TEXT NOT NULL,
    model_used  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT NOT NULL,
    PRIMARY KEY (input_hash, topic)
  );
`);

// v1.3.0: global player profiles (persists across games)
db.exec(`
  CREATE TABLE IF NOT EXISTS players_global (
    id                      TEXT PRIMARY KEY,
    name                    TEXT NOT NULL,
    avatar_color            TEXT NOT NULL DEFAULT '#6366f1',
    total_submitted         INTEGER NOT NULL DEFAULT 0,
    total_accepted          INTEGER NOT NULL DEFAULT 0,
    games_played            INTEGER NOT NULL DEFAULT 0,
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS achievements (
    id         TEXT PRIMARY KEY,
    player_id  TEXT NOT NULL,
    badge_type TEXT NOT NULL,
    earned_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_achievements_player ON achievements(player_id);
`);

// v1.3.0: message archive table
db.exec(`
  CREATE TABLE IF NOT EXISTS messages_archive (
    id          TEXT PRIMARY KEY,
    game_id     TEXT NOT NULL,
    player_id   TEXT,
    player_name TEXT,
    type        TEXT NOT NULL DEFAULT 'text',
    content     TEXT NOT NULL,
    meta        TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    archived_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_msgs_archive_game ON messages_archive(game_id);
`);

// v1.3.0: knowledge base curation
db.exec(`
  CREATE TABLE IF NOT EXISTS concept_categories (
    id         TEXT PRIMARY KEY,
    name       TEXT UNIQUE NOT NULL,
    color      TEXT NOT NULL DEFAULT '#6366f1',
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS concept_in_category (
    concept_id  TEXT NOT NULL,
    category_id TEXT NOT NULL,
    PRIMARY KEY (concept_id, category_id)
  );
`);

// v1.3.0: admin action audit log
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_audit_log (
    id            TEXT PRIMARY KEY,
    action        TEXT NOT NULL,
    resource_type TEXT,
    resource_id   TEXT,
    changes       TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_admin_audit_time ON admin_audit_log(created_at);
`);

// v1.3.0: settlement recovery columns on games
try {
  db.exec(`ALTER TABLE games ADD COLUMN settle_started_at TEXT`);
} catch { /* already exists */ }
try {
  db.exec(`ALTER TABLE games ADD COLUMN settle_status TEXT`);
} catch { /* already exists */ }

// v1.3.0: priority + fallback on ai_configs
try {
  db.exec(`ALTER TABLE ai_configs ADD COLUMN priority INTEGER NOT NULL DEFAULT 0`);
} catch { /* already exists */ }
try {
  db.exec(`ALTER TABLE ai_configs ADD COLUMN is_fallback INTEGER NOT NULL DEFAULT 0`);
} catch { /* already exists */ }

// v1.4.0: system_prompt for AI configs (custom validation prompt template)
try {
  db.exec(`ALTER TABLE ai_configs ADD COLUMN system_prompt TEXT`);
} catch { /* already exists */ }

// v1.4.0: turn/relay/score/challenge state on games (JSON blob)
try {
  db.exec(`ALTER TABLE games ADD COLUMN turn_state TEXT NOT NULL DEFAULT '{}'`);
} catch { /* already exists */ }
try {
  db.exec(`ALTER TABLE games ADD COLUMN scores TEXT NOT NULL DEFAULT '{}'`);
} catch { /* already exists */ }
try {
  db.exec(`ALTER TABLE games ADD COLUMN challenge_state TEXT NOT NULL DEFAULT '{}'`);
} catch { /* already exists */ }

// v1.3.0: status column on knowledge_docs (active | draft | archived)
try {
  db.exec(`ALTER TABLE knowledge_docs ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`);
} catch { /* already exists */ }

// v1.5.0: vectorization status on knowledge_docs
try {
  db.exec(`ALTER TABLE knowledge_docs ADD COLUMN vectorized_at TEXT`);
} catch { /* already exists */ }

// ── Helpers ───────────────────────────────────────────────────────────────────

const stmt = (sql) => db.prepare(sql);

module.exports = {
  db,

  // Games
  createGame:        stmt(`INSERT INTO games (id, topic, mode, settings) VALUES (?, ?, ?, ?)`),
  getGame:           stmt(`SELECT * FROM games WHERE id = ?`),
  updateGameStatus:  stmt(`UPDATE games SET status = ?, updated_at = datetime('now') WHERE id = ?`),
  updateGameMode:    stmt(`UPDATE games SET mode = ?, updated_at = datetime('now') WHERE id = ?`),
  updateGameSettings:stmt(`UPDATE games SET settings = ?, updated_at = datetime('now') WHERE id = ?`),
  updateGameNotes:   stmt(`UPDATE games SET notes = ?, updated_at = datetime('now') WHERE id = ?`),
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
  getConceptById: stmt(`SELECT * FROM concepts WHERE id = ?`),

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
  listDocs:       stmt(`SELECT id, title, filename, total_chunks, created_at, source, vectorized_at FROM knowledge_docs WHERE source = 'manual' ORDER BY created_at DESC`),
  listAllDocs:    stmt(`SELECT id, title, filename, total_chunks, created_at, source, game_id, vectorized_at FROM knowledge_docs ORDER BY created_at DESC`),
  listAIConfirmedDocs: stmt(`SELECT id, title, filename, total_chunks, created_at, source, game_id, vectorized_at FROM knowledge_docs WHERE source = 'ai_confirmed' ORDER BY created_at DESC`),
  getDoc:         stmt(`SELECT * FROM knowledge_docs WHERE id = ?`),
  insertDoc:      stmt(`INSERT INTO knowledge_docs (id, title, filename, total_chunks) VALUES (?, ?, ?, ?)`),
  insertDocFull:  stmt(`INSERT INTO knowledge_docs (id, title, filename, total_chunks, source, game_id) VALUES (?, ?, ?, ?, ?, ?)`),
  insertDocDraft: stmt(`INSERT INTO knowledge_docs (id, title, filename, total_chunks, source, game_id, status) VALUES (?, ?, ?, ?, ?, ?, 'draft')`),
  deleteDoc:      stmt(`DELETE FROM knowledge_docs WHERE id = ?`),
  markDocVectorized: stmt(`UPDATE knowledge_docs SET vectorized_at = datetime('now') WHERE id = ?`),

  // Knowledge chunks
  insertChunk:    stmt(`INSERT INTO knowledge_chunks (id, doc_id, chunk_idx, content) VALUES (?, ?, ?, ?)`),
  deleteChunksByDoc:stmt(`DELETE FROM knowledge_chunks WHERE doc_id = ?`),
  insertFTS:      stmt(`INSERT INTO knowledge_fts (content, chunk_id) VALUES (?, ?)`),
  deleteFTSByChunkIds: db.prepare(`DELETE FROM knowledge_fts WHERE chunk_id IN (SELECT id FROM knowledge_chunks WHERE doc_id = ?)`),
  searchFTS:      stmt(`SELECT chunk_id, snippet(knowledge_fts, 0, '<b>', '</b>', '...', 20) as snippet FROM knowledge_fts WHERE content MATCH ? ORDER BY rank LIMIT ?`),
  searchFTSVisible: stmt(`
    SELECT f.chunk_id,
           snippet(knowledge_fts, 0, '<b>', '</b>', '...', 20) as snippet
      FROM knowledge_fts f
      JOIN knowledge_chunks kc ON kc.id = f.chunk_id
      JOIN knowledge_docs kd ON kd.id = kc.doc_id
     WHERE f.content MATCH ?
       AND kd.status != 'archived'
       AND NOT (kd.source = 'ai_confirmed' AND kd.status = 'draft')
     ORDER BY rank
     LIMIT ?
  `),
  searchChunksByLikeVisible: stmt(`
    SELECT kc.id as chunk_id
      FROM knowledge_chunks kc
      JOIN knowledge_docs kd ON kd.id = kc.doc_id
     WHERE kc.content LIKE ?
       AND kd.status != 'archived'
       AND NOT (kd.source = 'ai_confirmed' AND kd.status = 'draft')
     ORDER BY kd.created_at DESC, kc.chunk_idx ASC
     LIMIT ?
  `),
  getChunkById:   stmt(`SELECT * FROM knowledge_chunks WHERE id = ?`),

  // Stats
  stats: stmt(`
    SELECT
      (SELECT COUNT(*) FROM games) as total_games,
      (SELECT COUNT(*) FROM games WHERE status = 'playing') as active_games,
      (SELECT COUNT(*) FROM concepts WHERE validated = 1) as total_concepts,
      (SELECT COUNT(*) FROM knowledge_docs WHERE source = 'manual') as total_docs,
      (SELECT COUNT(*) FROM knowledge_docs WHERE source = 'ai_confirmed') as total_ai_confirmed,
      (SELECT COUNT(*) FROM knowledge_docs WHERE source = 'ai_confirmed' AND status = 'active') as total_kb_active,
      (SELECT COUNT(*) FROM knowledge_docs WHERE source = 'ai_confirmed' AND status = 'draft') as pending_curation,
      (SELECT COUNT(*) FROM ai_configs) as total_ai_configs,
      (SELECT COUNT(DISTINCT id) FROM players) as total_players
  `),

  // AI Decisions (audit log)
  insertAIDecision: stmt(`
    INSERT INTO ai_decisions (id, concept_id, game_id, validation_method, ai_prompt, ai_response, ai_provider, ai_model, decision_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getAIDecision:          stmt(`SELECT * FROM ai_decisions WHERE concept_id = ?`),
  listAIDecisions:        stmt(`SELECT d.*, c.name, c.validated, c.rejected, c.player_name, c.raw_input FROM ai_decisions d LEFT JOIN concepts c ON c.id = d.concept_id ORDER BY d.decision_made_at DESC LIMIT 200`),
  listAIDecisionsByGame:  stmt(`SELECT d.*, c.name, c.validated, c.rejected, c.player_name, c.raw_input FROM ai_decisions d LEFT JOIN concepts c ON c.id = d.concept_id WHERE d.game_id = ? ORDER BY d.decision_made_at DESC`),

  // Concept overrides
  insertConceptOverride: stmt(`INSERT OR REPLACE INTO concept_overrides (concept_id, original_decision, override_decision, override_reason) VALUES (?, ?, ?, ?)`),
  getConceptOverride:    stmt(`SELECT * FROM concept_overrides WHERE concept_id = ?`),

  // Validation cache
  getCachedValidation:   stmt(`SELECT * FROM validation_cache WHERE input_hash = ? AND topic = ? AND expires_at > datetime('now')`),
  insertValidationCache: stmt(`INSERT OR REPLACE INTO validation_cache (input_hash, topic, result, model_used, expires_at) VALUES (?, ?, ?, ?, datetime('now', '+90 days'))`),
  cleanExpiredCache:     stmt(`DELETE FROM validation_cache WHERE expires_at <= datetime('now')`),
  clearAllCache:         stmt(`DELETE FROM validation_cache`),
  getCacheStats:         stmt(`SELECT COUNT(*) as total, COUNT(CASE WHEN expires_at > datetime('now') THEN 1 END) as active FROM validation_cache`),

  // Global player profiles
  upsertGlobalPlayer:   stmt(`INSERT INTO players_global (id, name, avatar_color) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now')`),
  getGlobalPlayer:      stmt(`SELECT * FROM players_global WHERE id = ?`),
  getGlobalPlayerByName:stmt(`SELECT * FROM players_global WHERE name = ?`),
  updatePlayerStats:    stmt(`UPDATE players_global SET total_submitted=total_submitted+?, total_accepted=total_accepted+?, games_played=games_played+?, updated_at=datetime('now') WHERE id=?`),
  listLeaderboard:      stmt(`SELECT *, CASE WHEN total_submitted>0 THEN ROUND(1.0*total_accepted/total_submitted*100,1) ELSE 0 END as acceptance_rate FROM players_global ORDER BY total_accepted DESC, total_submitted ASC LIMIT ?`),
  insertAchievement:    stmt(`INSERT OR IGNORE INTO achievements (id, player_id, badge_type) VALUES (?, ?, ?)`),
  getAchievements:      stmt(`SELECT * FROM achievements WHERE player_id = ? ORDER BY earned_at ASC`),

  // Message archive
  archiveMessages:      stmt(`INSERT INTO messages_archive SELECT *, datetime('now') FROM messages WHERE game_id=? AND created_at < datetime('now','-30 days')`),
  deleteArchivedMessages:stmt(`DELETE FROM messages WHERE game_id=? AND created_at < datetime('now','-30 days')`),
  getArchivedMessages:  stmt(`SELECT * FROM messages_archive WHERE game_id=? ORDER BY created_at ASC LIMIT ? OFFSET ?`),
  getArchivedMessageCount: stmt(`SELECT COUNT(*) as count FROM messages_archive WHERE game_id=?`),
  getRecentMessages:    stmt(`SELECT * FROM messages WHERE game_id=? ORDER BY created_at ASC LIMIT ? OFFSET ?`),
  getLatestMessages:    stmt(`SELECT * FROM messages WHERE game_id=? ORDER BY created_at DESC LIMIT ?`),
  getRecentMessageCount:stmt(`SELECT COUNT(*) as count FROM messages WHERE game_id=?`),

  // Concept categories (curation)
  listCategories:          stmt(`SELECT * FROM concept_categories ORDER BY sort_order ASC, name ASC`),
  insertCategory:          stmt(`INSERT INTO concept_categories (id, name, color, sort_order) VALUES (?, ?, ?, ?)`),
  deleteCategory:          stmt(`DELETE FROM concept_categories WHERE id=?`),
  assignConceptToCategory: stmt(`INSERT OR IGNORE INTO concept_in_category (concept_id, category_id) VALUES (?, ?)`),
  removeConceptFromCategory:stmt(`DELETE FROM concept_in_category WHERE concept_id=? AND category_id=?`),
  getConceptCategories:    stmt(`SELECT c.* FROM concept_categories c JOIN concept_in_category cc ON cc.category_id=c.id WHERE cc.concept_id=?`),
  listKBDocsByStatus:      stmt(`SELECT * FROM knowledge_docs WHERE source='ai_confirmed' AND (status=? OR ?='') ORDER BY created_at DESC LIMIT 100`),
  updateKBDocStatus:       stmt(`UPDATE knowledge_docs SET status=? WHERE id=?`),

  // Admin audit log
  insertAdminAudit: stmt(`INSERT INTO admin_audit_log (id, action, resource_type, resource_id, changes) VALUES (?, ?, ?, ?, ?)`),
  listAdminAudit:   stmt(`SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT ?`),

  // Settlement recovery
  startSettlement:     stmt(`UPDATE games SET settle_started_at=datetime('now'), settle_status='started', updated_at=datetime('now') WHERE id=?`),
  completeSettlement:  stmt(`UPDATE games SET settle_started_at=NULL, settle_status=NULL, updated_at=datetime('now') WHERE id=?`),
  failSettlement:      stmt(`UPDATE games SET settle_status='failed', updated_at=datetime('now') WHERE id=?`),
  getIncompleteSettlements: stmt(`SELECT * FROM games WHERE settle_status='started' ORDER BY settle_started_at ASC`),

  // AI configs with priority
  listAIConfigsSorted: stmt(`SELECT * FROM ai_configs ORDER BY CASE WHEN is_active=1 THEN 0 ELSE 1 END, priority ASC, created_at DESC`),
  updateAIConfigPriority: stmt(`UPDATE ai_configs SET priority=?, is_fallback=? WHERE id=?`),
  updateAIConfigSystemPrompt: stmt(`UPDATE ai_configs SET system_prompt=? WHERE id=?`),
  getConcept:          stmt(`SELECT * FROM concepts WHERE id=?`),

  // Turn / relay / score / challenge state (in-DB persistence)
  updateGameTurnState:      stmt(`UPDATE games SET turn_state=?, updated_at=datetime('now') WHERE id=?`),
  updateGameScores:         stmt(`UPDATE games SET scores=?, updated_at=datetime('now') WHERE id=?`),
  updateGameChallengeState: stmt(`UPDATE games SET challenge_state=?, updated_at=datetime('now') WHERE id=?`),
};
