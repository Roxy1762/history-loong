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

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatHTML(data) {
  const { game, timeline } = data;
  const ts = new TimelineService();

  // Group timeline by era
  const groups = [];
  for (const c of timeline) {
    const era = c.eraLabel || '年代不详';
    const last = groups[groups.length - 1];
    if (last && last.era === era) last.concepts.push(c);
    else groups.push({ era, concepts: [c] });
  }

  const timelineHTML = groups.length === 0
    ? '<p style="color:#94a3b8;text-align:center;padding:2rem">暂无有效概念</p>'
    : groups.map(({ era, concepts }) => {
        const items = concepts.map(c => `
        <div class="concept">
          <div class="dot"></div>
          <div class="card">
            <div class="card-header">
              <span class="name">${esc(c.name)}</span>
              ${c.dynasty ? `<span class="badge">${esc(c.dynasty)}</span>` : ''}
            </div>
            <div class="meta">${esc(ts.formatYear(c.year))}${c.period && c.period !== ts.formatYear(c.year) ? ' · ' + esc(c.period) : ''}</div>
            ${c.description ? `<div class="desc">${esc(c.description)}</div>` : ''}
            ${(c.tags || []).length ? `<div class="tags">${c.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
            <div class="player">— ${esc(c.player_name)}</div>
          </div>
        </div>`).join('');
        return `
      <div class="era-section">
        <div class="era-label">${esc(era)}</div>
        <div class="concepts">${items}</div>
      </div>`;
      }).join('');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>历史接龙：${esc(game.topic)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#1e293b;padding:2rem 1rem}
.container{max-width:700px;margin:0 auto}
h1{font-size:1.75rem;font-weight:800;color:#1e293b;margin-bottom:.25rem}
.subtitle{color:#64748b;font-size:.9rem;margin-bottom:2.5rem}
.era-section{margin-bottom:2rem}
.era-label{display:flex;align-items:center;gap:.75rem;font-size:.75rem;font-weight:700;color:#6366f1;letter-spacing:.05em;text-transform:uppercase;margin-bottom:1rem}
.era-label::before,.era-label::after{content:'';flex:1;height:1px;background:#e2e8f0}
.concepts{position:relative;padding-left:1.75rem}
.concepts::before{content:'';position:absolute;left:6px;top:8px;bottom:8px;width:2px;background:#e2e8f0;border-radius:2px}
.concept{position:relative;margin-bottom:.75rem}
.dot{position:absolute;left:-1.5rem;top:1rem;width:12px;height:12px;border-radius:50%;background:#6366f1;border:2px solid #fff;box-shadow:0 0 0 2px #e0e7ff}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:1rem;padding:1rem 1.25rem;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.card-header{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.4rem}
.name{font-weight:700;font-size:1rem;color:#1e293b}
.badge{font-size:.7rem;padding:.15rem .6rem;background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd;border-radius:999px;font-weight:600}
.meta{font-size:.75rem;color:#94a3b8;font-variant-numeric:tabular-nums;margin-bottom:.4rem}
.desc{font-size:.85rem;color:#475569;line-height:1.5;margin-bottom:.5rem}
.tags{display:flex;flex-wrap:wrap;gap:.35rem;margin-bottom:.4rem}
.tag{font-size:.7rem;padding:.15rem .5rem;background:#eef2ff;color:#4f46e5;border-radius:999px;border:1px solid #e0e7ff}
.player{font-size:.72rem;color:#cbd5e1}
footer{text-align:center;font-size:.75rem;color:#94a3b8;margin-top:3rem;padding-top:1.5rem;border-top:1px solid #e2e8f0}
</style>
</head>
<body>
<div class="container">
  <h1>历史接龙：${esc(game.topic)}</h1>
  <p class="subtitle">模式：${esc(game.mode)} &nbsp;|&nbsp; 共 ${timeline.length} 个有效概念 &nbsp;|&nbsp; 创建于 ${esc((game.created_at || '').slice(0, 10))}</p>
  <div class="timeline">${timelineHTML}</div>
  <footer>由 History-Loong 导出 · ${new Date().toLocaleDateString('zh-CN')}</footer>
</div>
</body>
</html>`;

  return { content: html, mimeType: 'text/html', ext: 'html' };
}

// ── Formatter registry (extension point) ─────────────────────────────────────

const FORMATTERS = {
  json: formatJSON,
  markdown: formatMarkdown,
  md: formatMarkdown,
  csv: formatCSV,
  html: formatHTML,
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
