/**
 * Migration Service
 * Full snapshot export / restore of the entire server state, used to migrate
 * a History-Loong deployment to a new server with no data loss.
 *
 * Snapshot includes:
 *   - Every persistent SQLite table (games, players, concepts, messages,
 *     ai_configs, users, knowledge base, audit logs, settings, groups, ...)
 *   - User-uploaded avatar files (base64-encoded)
 *
 * Skipped:
 *   - knowledge_fts (virtual table — rebuilt from knowledge_chunks on import)
 *   - migration_tokens setting (in-flight tokens are not portable)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');
const { resolveAvatarsDir } = require('../utils/avatarStorage');

const SNAPSHOT_MAGIC = 'history-loong-migration';
const SNAPSHOT_VERSION = 1;

// Tables to export, in dependency order. Order is reversed for delete-on-import.
const EXPORT_TABLES = [
  'system_settings',
  'users',
  'user_groups',
  'user_group_members',
  'group_permissions',
  'ai_configs',
  'games',
  'players',
  'concepts',
  'messages',
  'messages_archive',
  'ai_decisions',
  'concept_overrides',
  'validation_cache',
  'players_global',
  'achievements',
  'concept_categories',
  'concept_in_category',
  'admin_audit_log',
  'knowledge_docs',
  'knowledge_chunks',
];

// system_settings keys that are runtime-only and must NOT be carried over.
const TRANSIENT_SETTING_KEYS = new Set(['migration_tokens']);

const AVATARS_DIR = resolveAvatarsDir(path.join(__dirname, '../../../data/avatars'));

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAllRows(table) {
  return db.db.prepare(`SELECT * FROM ${table}`).all();
}

function getColumns(table) {
  return db.db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
}

function readAvatars() {
  if (!AVATARS_DIR) return [];
  let entries = [];
  try {
    entries = fs.readdirSync(AVATARS_DIR);
  } catch {
    return [];
  }
  const result = [];
  for (const name of entries) {
    if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(name)) continue;
    const full = path.join(AVATARS_DIR, name);
    try {
      const buf = fs.readFileSync(full);
      result.push({ filename: name, base64: buf.toString('base64') });
    } catch { /* skip unreadable */ }
  }
  return result;
}

function writeAvatars(avatars = []) {
  if (!AVATARS_DIR) return 0;
  // Clear current avatar files to guarantee identical state
  try {
    for (const name of fs.readdirSync(AVATARS_DIR)) {
      if (/\.(jpg|jpeg|png|gif|webp)$/i.test(name)) {
        try { fs.unlinkSync(path.join(AVATARS_DIR, name)); } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }

  let n = 0;
  for (const item of avatars) {
    if (!item || typeof item.filename !== 'string' || typeof item.base64 !== 'string') continue;
    const safe = path.basename(item.filename);
    if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(safe)) continue;
    try {
      fs.writeFileSync(path.join(AVATARS_DIR, safe), Buffer.from(item.base64, 'base64'));
      n++;
    } catch { /* ignore individual failures */ }
  }
  return n;
}

function rebuildFTS() {
  db.db.exec(`DELETE FROM knowledge_fts`);
  const insert = db.db.prepare(`INSERT INTO knowledge_fts (content, chunk_id) VALUES (?, ?)`);
  const chunks = db.db.prepare(`SELECT id, content FROM knowledge_chunks`).all();
  for (const c of chunks) insert.run(c.content || '', c.id);
}

// ── Snapshot creation ─────────────────────────────────────────────────────────

function buildSnapshot({ includeAvatars = true } = {}) {
  const tables = {};
  for (const t of EXPORT_TABLES) {
    let rows;
    try {
      rows = getAllRows(t);
    } catch (err) {
      console.warn(`[Migration] Skipping missing table ${t}: ${err.message}`);
      continue;
    }
    if (t === 'system_settings') {
      rows = rows.filter(r => !TRANSIENT_SETTING_KEYS.has(r.key));
    }
    tables[t] = rows;
  }

  const counts = {};
  for (const [t, rows] of Object.entries(tables)) counts[t] = rows.length;

  return {
    magic: SNAPSHOT_MAGIC,
    version: SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: 'dev0.3.0',
    counts,
    avatarCount: includeAvatars ? undefined : 0,
    data: {
      tables,
      avatars: includeAvatars ? readAvatars() : [],
    },
  };
}

// ── Snapshot restore ──────────────────────────────────────────────────────────

function restoreSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('迁移文件无效：内容缺失');
  }
  if (snapshot.magic !== SNAPSHOT_MAGIC) {
    throw new Error('迁移文件无效：magic 字段不匹配');
  }
  if (Number(snapshot.version) !== SNAPSHOT_VERSION) {
    throw new Error(`迁移文件版本不兼容（期望 v${SNAPSHOT_VERSION}，得到 v${snapshot.version}）`);
  }
  const tables = snapshot?.data?.tables || {};
  const avatars = snapshot?.data?.avatars || [];

  const summary = { tables: {}, avatars: 0 };

  // Disable FK enforcement during the bulk wipe + reinsert.
  db.db.pragma('foreign_keys = OFF');

  const txn = db.db.transaction(() => {
    // Delete in reverse dependency order.
    db.db.exec(`DELETE FROM knowledge_fts`);
    for (const t of [...EXPORT_TABLES].reverse()) {
      try { db.db.prepare(`DELETE FROM ${t}`).run(); } catch (err) {
        console.warn(`[Migration] Failed to clear ${t}: ${err.message}`);
      }
    }

    // Insert in declared order.
    for (const t of EXPORT_TABLES) {
      const rows = Array.isArray(tables[t]) ? tables[t] : [];
      if (rows.length === 0) { summary.tables[t] = 0; continue; }

      const cols = getColumns(t);
      if (cols.length === 0) {
        console.warn(`[Migration] Table ${t} not present locally, skipping`);
        summary.tables[t] = 0;
        continue;
      }

      const colList = cols.map(c => `"${c}"`).join(', ');
      const placeholders = cols.map(() => '?').join(', ');
      const stmt = db.db.prepare(`INSERT INTO ${t} (${colList}) VALUES (${placeholders})`);

      let inserted = 0;
      for (const row of rows) {
        if (t === 'system_settings' && TRANSIENT_SETTING_KEYS.has(row?.key)) continue;
        const values = cols.map(c => (row && Object.prototype.hasOwnProperty.call(row, c)) ? row[c] : null);
        try {
          stmt.run(...values);
          inserted++;
        } catch (err) {
          console.warn(`[Migration] Skipping row in ${t}: ${err.message}`);
        }
      }
      summary.tables[t] = inserted;
    }

    rebuildFTS();
  });

  try {
    txn();
  } finally {
    db.db.pragma('foreign_keys = ON');
  }

  summary.avatars = writeAvatars(avatars);
  return summary;
}

// ── Token store (for online migration) ────────────────────────────────────────
//
// Stored persistently in system_settings under key "migration_tokens" as a JSON
// array of { token, createdAt, expiresAt, note } so tokens survive restarts.

const TOKENS_KEY = 'migration_tokens';

function loadTokens() {
  try {
    const row = db.getSetting.get(TOKENS_KEY);
    if (!row || !row.value) return [];
    const arr = JSON.parse(row.value);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveTokens(list) {
  db.setSetting.run(TOKENS_KEY, JSON.stringify(list));
}

function purgeExpired(list = loadTokens()) {
  const now = Date.now();
  return list.filter(t => new Date(t.expiresAt).getTime() > now);
}

function listTokens() {
  const tokens = purgeExpired();
  saveTokens(tokens);
  return tokens.map(t => ({
    token: t.token,
    createdAt: t.createdAt,
    expiresAt: t.expiresAt,
    note: t.note || '',
    ttlSec: Math.max(0, Math.floor((new Date(t.expiresAt).getTime() - Date.now()) / 1000)),
  }));
}

function createToken({ ttlMinutes = 30, note = '' } = {}) {
  const ttl = Math.max(1, Math.min(60 * 24, Math.trunc(Number(ttlMinutes) || 30)));
  const tokens = purgeExpired();
  const token = 'mig_' + crypto.randomBytes(24).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + ttl * 60_000);
  const entry = {
    token,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    note: String(note || '').slice(0, 100),
  };
  tokens.push(entry);
  saveTokens(tokens);
  return entry;
}

function revokeToken(token) {
  const tokens = purgeExpired().filter(t => t.token !== token);
  saveTokens(tokens);
}

function consumeToken(token) {
  if (!token) return null;
  const tokens = purgeExpired();
  const found = tokens.find(t => t.token === token);
  if (!found) {
    saveTokens(tokens);
    return null;
  }
  return found;
}

module.exports = {
  SNAPSHOT_MAGIC,
  SNAPSHOT_VERSION,
  buildSnapshot,
  restoreSnapshot,
  // Token API
  listTokens,
  createToken,
  revokeToken,
  consumeToken,
};
