/**
 * Message Service — paginated retrieval and archival of game messages.
 */

const db = require('../db');
const { parseObject, toBoundedInt } = require('../utils/json');

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

/**
 * Get paginated messages for a game (active table).
 * @param {string} gameId
 * @param {number} limit
 * @param {number} offset
 */
function getMessages(gameId, limit = DEFAULT_PAGE_SIZE, offset = 0) {
  const safeLimit = toBoundedInt(limit, { defaultValue: DEFAULT_PAGE_SIZE, min: 1, max: MAX_PAGE_SIZE });
  const safeOffset = toBoundedInt(offset, { defaultValue: 0, min: 0, max: Number.MAX_SAFE_INTEGER });
  const rows = db.getRecentMessages.all(gameId, safeLimit, safeOffset);
  return rows.map(m => ({ ...m, meta: parseObject(m.meta, {}) }));
}

/**
 * Get total message count for a game.
 */
function getMessageCount(gameId) {
  return db.getRecentMessageCount.get(gameId)?.count ?? 0;
}

/**
 * Get archived messages for a game (older messages moved to archive).
 * @param {string} gameId
 * @param {number} limit
 * @param {number} offset
 */
function getArchivedMessages(gameId, limit = 50, offset = 0) {
  const safeLimit = toBoundedInt(limit, { defaultValue: 50, min: 1, max: MAX_PAGE_SIZE });
  const safeOffset = toBoundedInt(offset, { defaultValue: 0, min: 0, max: Number.MAX_SAFE_INTEGER });
  const rows = db.getArchivedMessages.all(gameId, safeLimit, safeOffset);
  return rows.map(m => ({ ...m, meta: parseObject(m.meta, {}) }));
}

/**
 * Archive messages older than 30 days for a given game and remove them from
 * the active table. Returns the number of messages archived.
 * @param {string} gameId
 */
function archiveOldMessages(gameId) {
  try {
    const archiveInfo = db.archiveMessages.run(gameId);
    if (archiveInfo.changes > 0) {
      db.deleteArchivedMessages.run(gameId);
      console.log(`[MessageService] Archived ${archiveInfo.changes} messages for game=${gameId}`);
    }
    return archiveInfo.changes;
  } catch (err) {
    console.warn(`[MessageService] archiveOldMessages failed: ${err.message}`);
    return 0;
  }
}

/**
 * Archive old messages for ALL games in a single maintenance sweep.
 */
function archiveAllOldMessages() {
  try {
    const games = db.listAllGames.all();
    let total = 0;
    for (const game of games) {
      total += archiveOldMessages(game.id);
    }
    console.log(`[MessageService] Global archive sweep complete: ${total} messages archived`);
    return total;
  } catch (err) {
    console.error(`[MessageService] archiveAllOldMessages failed: ${err.message}`);
    return 0;
  }
}

module.exports = {
  getMessages,
  getMessageCount,
  getArchivedMessages,
  archiveOldMessages,
  archiveAllOldMessages,
};
