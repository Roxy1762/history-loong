/**
 * Cache Service — caches AI concept validation results to avoid redundant API calls.
 * Uses SHA-256 hash of (raw_input + topic) as cache key. TTL: 90 days.
 */

const crypto = require('crypto');
const db = require('../db');

/**
 * Hash input+topic to a stable cache key.
 */
function hashKey(rawInput, topic) {
  return crypto
    .createHash('sha256')
    .update(`${rawInput.trim().toLowerCase()}::${topic.trim().toLowerCase()}`)
    .digest('hex');
}

/**
 * Look up a cached validation result.
 * Returns parsed result object or null on miss/expiry.
 */
function get(rawInput, topic) {
  try {
    const hash = hashKey(rawInput, topic);
    const row = db.getCachedValidation.get(hash, topic);
    if (!row) return null;
    return JSON.parse(row.result);
  } catch (err) {
    console.warn(`[Cache] get failed (non-fatal): ${err.message}`);
    return null;
  }
}

/**
 * Store a validation result in the cache.
 * @param {string} rawInput
 * @param {string} topic
 * @param {object} result - The validated concept data
 * @param {string} modelUsed - Which AI model produced this
 */
function set(rawInput, topic, result, modelUsed = null) {
  try {
    const hash = hashKey(rawInput, topic);
    db.insertValidationCache.run(hash, topic, JSON.stringify(result), modelUsed);
  } catch (err) {
    console.warn(`[Cache] set failed (non-fatal): ${err.message}`);
  }
}

/**
 * Remove all expired cache entries.
 */
function cleanExpired() {
  try {
    const info = db.cleanExpiredCache.run();
    if (info.changes > 0) {
      console.log(`[Cache] Cleaned ${info.changes} expired entries`);
    }
    return info.changes;
  } catch (err) {
    console.warn(`[Cache] cleanExpired failed: ${err.message}`);
    return 0;
  }
}

/**
 * Clear the entire cache.
 */
function clearAll() {
  try {
    const info = db.clearAllCache.run();
    console.log(`[Cache] Cleared all ${info.changes} entries`);
    return info.changes;
  } catch (err) {
    console.warn(`[Cache] clearAll failed: ${err.message}`);
    return 0;
  }
}

/**
 * Get cache statistics.
 */
function getStats() {
  try {
    return db.getCacheStats.get();
  } catch {
    return { total: 0, active: 0 };
  }
}

module.exports = { get, set, cleanExpired, clearAll, getStats };
