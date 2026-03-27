/**
 * Export Service
 * Converts game data into various export formats.
 * Extension point: register new formatters via ExportService.registerFormatter().
 */

const fs = require('fs');
const path = require('path');
const { TimelineService } = require('./timelineService');

// ── Built-in formatters ───────────────────────────────────────────────────────

function formatJSON(data) {
  return {
    content: JSON.stringify(data, null, 2),
    mimeType: 'application/json',
    ext: 'json',
  };
}

function formatMarkdown(data) {
  const { game, timeline, messages } = data;
  const ts = new TimelineService();
  const lines = [];

  lines.push(`# 历史接龙：${game.topic}`);
  lines.push(`\n> 模式：${game.mode} | 创建时间：${game.created_at}\n`);

  // Timeline section
  lines.push('## 时间轴');
  lines.push('');
  if (timeline.length === 0) {
    lines.push('_（暂无有效概念）_');
  } else {
    let lastEra = null;
    for (const c of timeline) {
      if (c.eraLabel !== lastEra) {
        lines.push(`\n### ${c.eraLabel}`);
        lastEra = c.eraLabel;
      }
      const yearStr = ts.formatYear(c.year);
      const tags = (c.tags || []).map((t) => `\`${t}\``).join(' ');
      lines.push(`- **${c.name}** (${yearStr}) — ${c.description || ''} ${tags}`);
      lines.push(`  > _由 ${c.player_name} 提交，所属时期：${c.dynasty || c.period || '未知'}_`);
    }
  }

  // Chat section
  lines.push('\n## 游戏记录');
  lines.push('');
  for (const m of messages) {
    const time = m.created_at.replace('T', ' ').slice(0, 19);
    if (m.type === 'system') {
      lines.push(`> [系统 ${time}] ${m.content}`);
    } else {
      lines.push(`**${m.player_name || '匿名'}** _${time}_: ${m.content}`);
    }
  }

  return {
    content: lines.join('\n'),
    mimeType: 'text/markdown',
    ext: 'md',
  };
}

function formatCSV(data) {
  const { timeline } = data;
  const ts = new TimelineService();
  const header = ['概念名称', '朝代/时期', '年份', '年份文字', '时代标签', '简介', '提交玩家', '标签'];
  const rows = [header.join(',')];

  for (const c of timeline) {
    const row = [
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${(c.dynasty || c.period || '').replace(/"/g, '""')}"`,
      c.year ?? '',
      `"${ts.formatYear(c.year)}"`,
      `"${c.eraLabel || ''}"`,
      `"${(c.description || '').replace(/"/g, '""')}"`,
      `"${(c.player_name || '').replace(/"/g, '""')}"`,
      `"${(c.tags || []).join('、').replace(/"/g, '""')}"`,
    ];
    rows.push(row.join(','));
  }

  return {
    content: rows.join('\n'),
    mimeType: 'text/csv',
    ext: 'csv',
  };
}

// ── Formatter registry (extension point) ─────────────────────────────────────

const FORMATTERS = {
  json: formatJSON,
  markdown: formatMarkdown,
  md: formatMarkdown,
  csv: formatCSV,
};

// ── ExportService ─────────────────────────────────────────────────────────────

class ExportService {
  /**
   * Export game data in the requested format.
   * @param {object} data      { game, timeline, messages }
   * @param {string} format    'json' | 'markdown' | 'csv'
   * @returns {{ content, mimeType, ext, filename }}
   */
  export(data, format = 'json') {
    const formatter = FORMATTERS[format.toLowerCase()];
    if (!formatter) {
      throw new Error(`Unknown export format: ${format}. Available: ${Object.keys(FORMATTERS).join(', ')}`);
    }
    const result = formatter(data);
    const safeTopic = (data.game.topic || 'game').replace(/[^\u4e00-\u9fa5a-zA-Z0-9-]/g, '_');
    result.filename = `history-loong_${safeTopic}_${Date.now()}.${result.ext}`;
    return result;
  }

  /** Register a custom export formatter (plugin extension point) */
  static registerFormatter(name, fn) {
    FORMATTERS[name] = fn;
  }

  listFormats() {
    return Object.keys(FORMATTERS);
  }
}

module.exports = { ExportService, FORMATTERS };
