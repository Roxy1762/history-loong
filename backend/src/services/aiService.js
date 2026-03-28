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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
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
      signal: controller.signal,
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`API ${resp.status}: ${body.slice(0, 200)}`);
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from API');
    return content.trim();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('AI 请求超时（30秒），请检查网络连接或 API 地址是否正确');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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
  // Limit existing list to last 10, compact format
  const recentExisting = existing.slice(-10);
  const existingText = recentExisting.length
    ? recentExisting.map((c) => `${c.name}(${c.year ?? '?'})`).join('、')
    : '无';

  const modeHint = gameMode.mode === 'ordered'
    ? '时间顺序模式：新概念须晚于已有最新时间。'
    : gameMode.mode === 'chain'
    ? '接龙模式：新概念须与上一概念有明确历史关联。'
    : '';

  const knowledgeSection = knowledgeContext
    ? `【参考资料】\n${knowledgeContext}\n`
    : '';

  const prompt = `历史接龙游戏验证。主题：${topic}。已有：${existingText}。${modeHint}
${knowledgeSection}
玩家提交：「${concept}」

判断是否为与主题相关的有效历史概念，返回JSON（禁止markdown）：
有效：{"valid":true,"name":"标准名","period":"时间描述","year":-356,"dynasty":"朝代","description":"简介不超40字","tags":["标签"],"extra":{}}
无效：{"valid":false,"reason":"原因"}
year：公元前负数，公元后正数，时间段取起始年，不确定填null。`;

  const text = await complete(prompt, 400);
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
      ? `【参考资料】\n${knowledgeContext}\n` : '';

    const prompt = `批量验证历史接龙概念。主题：${topic}。
${knowledgeSection}验证以下${slice.length}项，返回等长JSON数组（禁止markdown）：
${list}

格式：[{"index":1,"valid":true,"name":"标准名","year":-356,"dynasty":"朝代","period":"时间","description":"简介不超40字","tags":["标签"]},{"index":2,"valid":false,"reason":"原因"}]
year：公元前负数，公元后正数，时间段取起始年，不确定填null。`;

    const text = await complete(prompt, 700);
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
