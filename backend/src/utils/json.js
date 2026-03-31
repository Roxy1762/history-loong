function safeJsonParse(raw, fallback = null) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function parseObject(raw, fallback = {}) {
  const parsed = safeJsonParse(raw, fallback);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
}

function parseArray(raw, fallback = []) {
  const parsed = safeJsonParse(raw, fallback);
  return Array.isArray(parsed) ? parsed : fallback;
}

function toBoundedInt(value, { defaultValue = 0, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return defaultValue;
  return Math.min(max, Math.max(min, n));
}

function toBoolean(value, defaultValue = false) {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

module.exports = {
  safeJsonParse,
  parseObject,
  parseArray,
  toBoundedInt,
  toBoolean,
};
