/**
 * Lightweight ring-buffer logger.
 *
 * Intercepts console.log / .warn / .error so every existing log line is
 * automatically captured and available via getLogs() for the admin UI.
 *
 * Usage:
 *   require('./logger');   // install interceptors (call once at startup)
 *   const logger = require('./logger');
 *   logger.getLogs(100);   // last 100 entries, newest first
 */

const MAX_ENTRIES = 1000;

/** @type {{ ts: string, level: string, msg: string }[]} */
const entries = [];

const _orig = {
  log:   console.log.bind(console),
  warn:  console.warn.bind(console),
  error: console.error.bind(console),
};

function capture(level, args) {
  const msg = args
    .map(a => {
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    })
    .join(' ');

  entries.push({ ts: new Date().toISOString(), level, msg });
  if (entries.length > MAX_ENTRIES) entries.shift();
}

// Install interceptors
console.log = (...args) => { capture('info',  args); _orig.log(...args); };
console.warn  = (...args) => { capture('warn',  args); _orig.warn(...args); };
console.error = (...args) => { capture('error', args); _orig.error(...args); };

module.exports = {
  /**
   * Return up to `limit` recent log entries, newest first.
   * @param {number} limit
   * @param {'info'|'warn'|'error'|null} level  filter by level (null = all)
   */
  getLogs(limit = 200, level = null) {
    let result = entries;
    if (level) result = result.filter(e => e.level === level);
    return result.slice(-limit).reverse();
  },
};
