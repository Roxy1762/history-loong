/**
 * Settlement Service — tracks and recovers incomplete batch settlement operations.
 *
 * When a game:settle starts, we persist the state to DB so that on server
 * restart we can detect and recover/abandon stuck settlements.
 */

const db = require('../db');
const { getGameSettings } = require('../utils/game');

/**
 * Mark a game as currently settling (persisted to DB).
 */
function startSettlement(gameId) {
  try {
    db.startSettlement.run(gameId);
    console.log(`[Settlement] started gameId=${gameId}`);
  } catch (err) {
    console.warn(`[Settlement] startSettlement failed: ${err.message}`);
  }
}

/**
 * Mark settlement as complete (clears the settle columns).
 */
function completeSettlement(gameId) {
  try {
    db.completeSettlement.run(gameId);
    console.log(`[Settlement] completed gameId=${gameId}`);
  } catch (err) {
    console.warn(`[Settlement] completeSettlement failed: ${err.message}`);
  }
}

/**
 * Mark settlement as failed (e.g. after error, leaves concepts as pending).
 */
function failSettlement(gameId) {
  try {
    db.failSettlement.run(gameId);
    console.log(`[Settlement] failed gameId=${gameId}`);
  } catch (err) {
    console.warn(`[Settlement] failSettlement failed: ${err.message}`);
  }
}

/**
 * Get all games with incomplete (stuck) settlements.
 * Returns games with settle_status='started'.
 */
function getIncompleteSettlements() {
  try {
    return db.getIncompleteSettlements.all().map(g => ({
      ...g,
      settings: getGameSettings(g, {}),
      pendingCount: db.getPendingConceptCount.get(g.id)?.count ?? 0,
      // stale if started more than 2 hours ago
      isStale: g.settle_started_at
        ? (Date.now() - new Date(g.settle_started_at).getTime()) > 2 * 60 * 60 * 1000
        : false,
    }));
  } catch (err) {
    console.error(`[Settlement] getIncompleteSettlements failed: ${err.message}`);
    return [];
  }
}

/**
 * On server startup, find and handle stuck settlements:
 * - stale (>2h old) → mark as failed so players can re-join
 * - recent (<2h old) → leave as-is for manual admin recovery
 */
function recoverOnStartup() {
  const incomplete = getIncompleteSettlements();
  if (!incomplete.length) return;

  console.log(`[Settlement] Startup recovery check: ${incomplete.length} incomplete settlements found`);

  for (const game of incomplete) {
    if (game.isStale) {
      failSettlement(game.id);
      console.warn(`[Settlement] Stale settlement auto-failed gameId=${game.id} started_at=${game.settle_started_at}`);
    } else {
      console.warn(`[Settlement] Recent incomplete settlement gameId=${game.id} started_at=${game.settle_started_at} — requires admin recovery`);
    }
  }
}

/**
 * Admin rollback: clear settle_status and revert pending concepts to allow re-submission.
 * Does NOT delete concepts; they stay as pending.
 */
function rollbackSettlement(gameId) {
  completeSettlement(gameId); // clears settle columns
  console.log(`[Settlement] Admin rollback for gameId=${gameId} — pending concepts preserved`);
  return { ok: true };
}

module.exports = {
  startSettlement,
  completeSettlement,
  failSettlement,
  getIncompleteSettlements,
  recoverOnStartup,
  rollbackSettlement,
};
