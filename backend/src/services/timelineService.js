/**
 * Timeline Service
 * Builds, sorts, and formats the timeline from validated concepts.
 * Extension point: add custom era mappings or rendering strategies.
 */

// ── Era definitions (extension point) ────────────────────────────────────────

const ERA_PRESETS = {
  china: [
    { name: '夏', start: -2070, end: -1600 },
    { name: '商', start: -1600, end: -1046 },
    { name: '西周', start: -1046, end: -771 },
    { name: '春秋', start: -770, end: -476 },
    { name: '战国', start: -475, end: -221 },
    { name: '秦', start: -221, end: -206 },
    { name: '西汉', start: -206, end: 9 },
    { name: '新', start: 9, end: 23 },
    { name: '东汉', start: 25, end: 220 },
    { name: '三国', start: 220, end: 280 },
    { name: '西晋', start: 265, end: 317 },
    { name: '东晋', start: 317, end: 420 },
    { name: '南北朝', start: 420, end: 589 },
    { name: '隋', start: 581, end: 618 },
    { name: '唐', start: 618, end: 907 },
    { name: '五代十国', start: 907, end: 960 },
    { name: '宋', start: 960, end: 1279 },
    { name: '元', start: 1271, end: 1368 },
    { name: '明', start: 1368, end: 1644 },
    { name: '清', start: 1644, end: 1912 },
    { name: '中华民国', start: 1912, end: 1949 },
    { name: '中华人民共和国', start: 1949, end: 9999 },
  ],
  world: [
    { name: '上古', start: -3000, end: -500 },
    { name: '古典时代', start: -500, end: 500 },
    { name: '中世纪', start: 500, end: 1500 },
    { name: '近代早期', start: 1500, end: 1800 },
    { name: '近代', start: 1800, end: 1945 },
    { name: '当代', start: 1945, end: 9999 },
  ],
};

// ── TimelineService ───────────────────────────────────────────────────────────

class TimelineService {
  constructor(eraPreset = 'china') {
    this.eras = ERA_PRESETS[eraPreset] || ERA_PRESETS.china;
  }

  /**
   * Given an array of validated concept rows from DB,
   * return a sorted timeline with era grouping.
   */
  buildTimeline(concepts) {
    const valid = concepts.filter((c) => c.validated && !c.rejected);

    // Sort: concepts with year first (ascending), then null-year ones
    const withYear = valid.filter((c) => c.year != null).sort((a, b) => a.year - b.year);
    const noYear = valid.filter((c) => c.year == null);

    const sorted = [...withYear, ...noYear];

    // Attach era label
    const enriched = sorted.map((c) => ({
      ...c,
      tags: this._parseTags(c.tags),
      extra: this._parseJSON(c.extra, {}),
      eraLabel: this.getEraLabel(c.year, c.dynasty),
    }));

    return enriched;
  }

  /**
   * @param {number|null} year
   * @param {string} [dynasty] - AI-supplied dynasty string (e.g. "清朝"); matched first
   */
  getEraLabel(year, dynasty = '') {
    // Prefer dynasty field: find the first era whose name appears in the dynasty string
    if (dynasty) {
      for (const era of this.eras) {
        if (dynasty.includes(era.name)) return era.name;
      }
    }
    if (year == null) return '年代不详';
    for (const era of this.eras) {
      if (year >= era.start && year < era.end) return era.name;
    }
    return '年代不详';
  }

  /** Format year number to human-readable string */
  formatYear(year) {
    if (year == null) return '年代不详';
    if (year < 0) return `公元前 ${Math.abs(year)} 年`;
    return `公元 ${year} 年`;
  }

  /** Register a custom era preset (plugin extension point) */
  static registerEraPreset(name, eras) {
    ERA_PRESETS[name] = eras;
  }

  _parseTags(val) {
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val || '[]'); } catch { return []; }
  }

  _parseJSON(val, fallback) {
    if (typeof val === 'object' && val !== null) return val;
    try { return JSON.parse(val || '{}'); } catch { return fallback; }
  }
}

module.exports = { TimelineService, ERA_PRESETS };
