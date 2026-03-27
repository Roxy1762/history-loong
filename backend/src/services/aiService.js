/**
 * AI Service — multi-provider, DB-driven configuration.
 *
 * Supported provider types:
 *   'anthropic'        — Anthropic Claude (native SDK)
 *   'openai-compatible' — Any OpenAI-compatible API (OpenAI, DeepSeek, Qwen, Ollama, etc.)
 *
 * Resolution order for active config:
 *   1. Active row in ai_configs table
 *   2. Environment variables (ANTHROPIC_API_KEY / OPENAI_BASE_URL)
 */

const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');

// ── Provider implementations ──────────────────────────────────────────────────

async function callAnthropic(config, prompt, maxTokens) {
  const client = new Anthropic({ apiKey: config.api_key });
  const resp = await client.messages.create({
    model: config.model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return resp.content[0].text.trim();
}

async function callOpenAICompatible(config, prompt, maxTokens) {
  const base = (config.base_url || '').replace(/\/$/, '');
  const url = `${base}/chat/completions`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.api_key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`API ${resp.status}: ${body.slice(0, 200)}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from API');
  return content.trim();
}

// ── Provider registry (extension point) ──────────────────────────────────────

const PROVIDER_HANDLERS = {
  anthropic: callAnthropic,
  'openai-compatible': callOpenAICompatible,
};

/** Register a custom provider handler (for plugins) */
function registerProviderHandler(type, fn) {
  PROVIDER_HANDLERS[type] = fn;
}

// ── Config resolution ─────────────────────────────────────────────────────────

function resolveConfig() {
  // 1. DB active config
  try {
    const row = db.getActiveAIConfig.get();
    if (row) {
      return { ...row, extra: JSON.parse(row.extra || '{}') };
    }
  } catch { /* DB may not be ready yet */ }

  // 2. Environment fallback
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider_type: 'anthropic',
      api_key: process.env.ANTHROPIC_API_KEY,
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
    };
  }
  if (process.env.OPENAI_API_KEY || process.env.AI_API_KEY) {
    return {
      provider_type: 'openai-compatible',
      base_url: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      api_key: process.env.OPENAI_API_KEY || process.env.AI_API_KEY,
      model: process.env.AI_MODEL || 'gpt-4o',
    };
  }
  return null;
}

// ── Core call ─────────────────────────────────────────────────────────────────

async function complete(prompt, maxTokens = 800) {
  const config = resolveConfig();
  if (!config) {
    throw new Error('未配置 AI 服务，请在后台管理界面添加 AI 配置');
  }
  const handler = PROVIDER_HANDLERS[config.provider_type];
  if (!handler) {
    throw new Error(`未知的 AI 提供商类型: ${config.provider_type}`);
  }
  return handler(config, prompt, maxTokens);
}

// ── Test connection ───────────────────────────────────────────────────────────

async function testConfig(configRow) {
  const handler = PROVIDER_HANDLERS[configRow.provider_type];
  if (!handler) throw new Error(`未知类型: ${configRow.provider_type}`);
  const text = await handler(configRow, '请回复"连接成功"四个字，不要其他内容。', 50);
  return text;
}

// ── Game AI methods ───────────────────────────────────────────────────────────

async function validateConcept(concept, topic, existing = [], gameMode = {}, knowledgeContext = '') {
  const existingText = existing.length
    ? existing.map((c) => `- ${c.name}（${c.period || '年代不明'}）`).join('\n')
    : '（暂无）';

  const modeHint = gameMode.mode === 'ordered'
    ? '注意：本局为时间顺序模式，新概念必须晚于已有概念中最新的时间。'
    : gameMode.mode === 'chain'
    ? '注意：本局为接龙模式，新概念应与上一个概念有明确的历史关联。'
    : '';

  const knowledgeSection = knowledgeContext
    ? `\n【参考资料】\n${knowledgeContext}\n`
    : '';

  const prompt = `你是一位严谨的历史学专家，正在主持一场历史知识接龙游戏。
${knowledgeSection}
游戏主题：${topic}
游戏已有概念列表：
${existingText}

${modeHint}

玩家新提交的内容：「${concept}」

请判断该内容是否为与主题相关的有效历史概念/事件/人物/制度/思想流派，并提取其时间信息。
返回严格的 JSON（不要 markdown 代码块，不要额外文字）：

{
  "valid": true,
  "name": "标准化名称",
  "period": "时间描述（如：公元前356年—公元前350年）",
  "year": -356,
  "dynasty": "所属朝代/时期",
  "description": "一句话简介，不超过60字",
  "tags": ["政治", "改革"],
  "extra": {}
}

若无效，则返回：
{
  "valid": false,
  "reason": "说明原因"
}

year 字段：公元前用负数，公元后用正数，若为时间段取起始年，无法确定填 null。`;

  const text = await complete(prompt, 600);
  return extractJSON(text);
}

/**
 * Batch validate multiple concepts in a single AI call.
 * concepts: [{ id, raw_input }]
 * Returns: [{ id, valid, name?, year?, dynasty?, period?, description?, tags?, reason? }]
 */
async function batchValidateConcepts(concepts, topic, knowledgeContext = '') {
  if (!concepts.length) return [];

  const BATCH = 8; // concepts per AI call
  const results = [];

  for (let i = 0; i < concepts.length; i += BATCH) {
    const slice = concepts.slice(i, i + BATCH);
    const list = slice.map((c, idx) => `${idx + 1}. ${c.raw_input}`).join('\n');

    const knowledgeSection = knowledgeContext
      ? `\n【参考资料】\n${knowledgeContext}\n` : '';

    const prompt = `你是历史学专家，正在批量验证历史接龙游戏中的概念提交。
游戏主题：${topic}
${knowledgeSection}
请依次验证以下 ${slice.length} 个提交内容，判断每项是否为与主题相关的真实历史概念：

${list}

以 JSON 数组返回（不要 markdown 代码块），数组长度必须与上方条目数相同：
[
  {
    "index": 1,
    "valid": true,
    "name": "标准化名称",
    "year": -356,
    "dynasty": "战国·秦",
    "period": "公元前356年",
    "description": "一句话简介，不超过50字",
    "tags": ["政治"]
  },
  {
    "index": 2,
    "valid": false,
    "reason": "拒绝原因"
  }
]

year 规则：公元前用负数，公元后用正数，若为时间段取起始年，无法确定填 null。`;

    const text = await complete(prompt, 1200);
    const arr = extractJSON(text);
    if (!Array.isArray(arr)) throw new Error('Batch AI returned non-array');

    for (let j = 0; j < slice.length; j++) {
      const r = arr.find(x => x.index === j + 1) || arr[j] || { valid: false, reason: 'AI未返回结果' };
      results.push({ id: slice[j].id, ...r });
    }
  }

  return results;
}

async function suggestConcepts(topic, existing = [], count = 3) {
  const existingNames = existing.map((c) => c.name).join('、') || '无';
  const prompt = `历史接龙游戏主题：${topic}。已出现的概念：${existingNames}。
请推荐 ${count} 个尚未出现的、与主题相关的历史概念，每行一个，只写名称，不要编号或解释。`;
  const text = await complete(prompt, 200);
  return text.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, count);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractJSON(text) {
  const clean = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(clean); } catch { /* fall through */ }
  const m = clean.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error('Cannot parse AI response as JSON');
}

module.exports = {
  complete,
  validateConcept,
  batchValidateConcepts,
  suggestConcepts,
  testConfig,
  resolveConfig,
  registerProviderHandler,
  PROVIDER_HANDLERS,
};
