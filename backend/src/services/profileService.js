/**
 * Profile Service — manages global player profiles and achievement badges.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const BADGE_TYPES = {
  first_concept:    { label: '初出茅庐', desc: '第一次提交通过验证的概念' },
  ten_accepted:     { label: '博学多才', desc: '累计通过 10 个概念' },
  fifty_accepted:   { label: '学富五车', desc: '累计通过 50 个概念' },
  century_accepted: { label: '百科全书', desc: '累计通过 100 个概念' },
  five_games:       { label: '常客', desc: '参与 5 场游戏' },
  high_accuracy:    { label: '精准达人', desc: '提交通过率超过 90%（至少 10 次提交）' },
};

/**
 * Ensure a global profile exists for this player.
 */
function ensureProfile(playerId, playerName, color = '#6366f1') {
  try {
    db.upsertGlobalPlayer.run(playerId, playerName, color);
  } catch (err) {
    console.warn(`[Profile] ensureProfile failed: ${err.message}`);
  }
}

/**
 * Update player stats after a concept validation.
 * @param {string} playerId
 * @param {boolean} accepted - whether the concept was accepted
 * @param {boolean} newGame - whether this is the first action in a new session
 */
function recordConceptResult(playerId, accepted, newGame = false) {
  try {
    db.updatePlayerStats.run(
      1,                        // total_submitted
      accepted ? 1 : 0,        // total_accepted
      newGame ? 1 : 0,         // games_played
      playerId
    );
    checkAndGrantAchievements(playerId);
  } catch (err) {
    console.warn(`[Profile] recordConceptResult failed: ${err.message}`);
  }
}

/**
 * Check which achievements the player has earned and grant new ones.
 */
function checkAndGrantAchievements(playerId) {
  try {
    const profile = db.getGlobalPlayer.get(playerId);
    if (!profile) return;

    const existing = new Set(db.getAchievements.all(playerId).map(a => a.badge_type));

    const toGrant = [];

    if (profile.total_accepted >= 1 && !existing.has('first_concept')) {
      toGrant.push('first_concept');
    }
    if (profile.total_accepted >= 10 && !existing.has('ten_accepted')) {
      toGrant.push('ten_accepted');
    }
    if (profile.total_accepted >= 50 && !existing.has('fifty_accepted')) {
      toGrant.push('fifty_accepted');
    }
    if (profile.total_accepted >= 100 && !existing.has('century_accepted')) {
      toGrant.push('century_accepted');
    }
    if (profile.games_played >= 5 && !existing.has('five_games')) {
      toGrant.push('five_games');
    }
    if (
      profile.total_submitted >= 10 &&
      profile.total_accepted / profile.total_submitted >= 0.9 &&
      !existing.has('high_accuracy')
    ) {
      toGrant.push('high_accuracy');
    }

    for (const badge of toGrant) {
      db.insertAchievement.run(uuidv4(), playerId, badge);
      console.log(`[Profile] Achievement granted: playerId=${playerId} badge=${badge}`);
    }
  } catch (err) {
    console.warn(`[Profile] checkAndGrantAchievements failed: ${err.message}`);
  }
}

/**
 * Get a player's full profile including achievements.
 */
function getProfile(playerId) {
  const profile = db.getGlobalPlayer.get(playerId);
  if (!profile) return null;

  const achievements = db.getAchievements.all(playerId).map(a => ({
    ...a,
    ...BADGE_TYPES[a.badge_type],
  }));

  const acceptanceRate = profile.total_submitted > 0
    ? Math.round((profile.total_accepted / profile.total_submitted) * 1000) / 10
    : 0;

  return { ...profile, achievements, acceptanceRate };
}

/**
 * Get leaderboard rankings.
 * @param {number} limit
 */
function getLeaderboard(limit = 50) {
  return db.listLeaderboard.all(limit).map((row, idx) => ({
    ...row,
    rank: idx + 1,
    achievements: db.getAchievements.all(row.id).map(a => ({
      ...a,
      ...BADGE_TYPES[a.badge_type],
    })),
  }));
}

module.exports = {
  ensureProfile,
  recordConceptResult,
  getProfile,
  getLeaderboard,
  BADGE_TYPES,
};
