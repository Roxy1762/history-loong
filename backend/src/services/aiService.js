/**
 * AI Service — multi-provider, DB-driven configuration.
 *
 * Supported provider types:
 *   'anthropic'        — Anthropic Claude (native SDK)
 *   'openai-compatible' — Any OpenAI-compatible API (OpenAI, DeepSeek, Qwen, Ollama, etc.)
 *   'google'           — Google AI Studio / Gemini
 *   'glm'              — 智谱AI (BigModel) API
 *
 * Resolution order for active config:
 *   1. Active row in ai_configs table
 *   2. Environment variables (ANTHROPIC_API_KEY / OPENAI_BASE_URL / GOOGLE_AI_KEY / GLM_API_KEY)
 *
 * Token optimisation:
 *   • Validation prompt trimmed to ~120 tokens input, 150 tokens output
 *   • Hints prompt trimmed to ~80 tokens input, 80 tokens output
 *   • system_prompt (per-config) prepended when set
 */

const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');
const cacheService = require('./cacheService');

// ── Provider implementations ──────────────────────────────────────────────────

async function callAnthropic(config, prompt, maxTokens) {
  const client = new Anthropic({ apiKey: config.api_key });
  const msgParams = {
    model: config.model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };
  // Use system param for system_prompt (saves input tokens vs embedding in user message)
  if (config.system_prompt) {
    msgParams.system = config.system_prompt;
  }
  const resp = await client.messages.create(msgParams);
  return resp.content[0].text.trim();
}

async function callOpenAICompatible(config, prompt, maxTokens) {
  const base = (config.base_url || '').replace(/\/$/, '');
  if (!base) throw new Error('OpenAI-compatible 配置缺少 base_url');
  const url = `${base}/chat/completions`;

  const messages = [];
  if (config.system_prompt) {
    messages.push({ role: 'system', content: config.system_prompt });
  }
  messages.push({ role: 'user', content: prompt });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const requestBody = {
      model: config.model,
      messages,
      temperature: 0.2,
    };
    // Use max_tokens as the standard parameter; some providers may require it
    if (maxTokens) {
      requestBody.max_tokens = maxTokens;
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      const errMsg = `API ${resp.status}: ${body.slice(0, 300)}`;
      console.error(`[AI] OpenAI-compatible error at ${url}: ${errMsg}`);
      throw new Error(errMsg);
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

async function callGoogle(config, prompt, maxTokens) {
  const model = config.model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.api_key}`;

  const contents = [];
  // Google doesn't have a separate system field in the same way; prepend as user turn if set
  if (config.system_prompt) {
    contents.push({
      role: 'user',
      parts: [{ text: config.system_prompt }],
    });
    contents.push({
      role: 'model',
      parts: [{ text: '好的，我已理解。' }],
    });
  }
  contents.push({
    role: 'user',
    parts: [{ text: prompt }],
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.2,
        },
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Google AI ${resp.status}: ${body.slice(0, 300)}`);
    }
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Google AI returned empty response');
    return text.trim();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Google AI 请求超时（30秒）');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function callGLM(config, prompt, maxTokens) {
  // GLM (智谱AI) — OpenAI-compatible endpoint at https://open.bigmodel.cn/api/paas/v4
  const rawBase = (config.base_url || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/$/, '');
  // If base_url already contains the completions path (user pasted full URL), use it directly
  const url = rawBase.includes('/chat/completions')
    ? rawBase
    : `${rawBase}/chat/completions`;

  const messages = [];
  if (config.system_prompt) {
    messages.push({ role: 'system', content: config.system_prompt });
  }
  messages.push({ role: 'user', content: prompt });

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
        messages,
        max_tokens: maxTokens,
        temperature: 0.2,
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      const errorMsg = `GLM API ${resp.status}: ${body.slice(0, 200)}`;
      console.error(`[AI] ${errorMsg}`);
      throw new Error(errorMsg);
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('GLM returned empty response');
    return content.trim();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('GLM 请求超时（30秒），请检查网络连接或 API 地址是否正确');
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
  google: callGoogle,
  glm: callGLM,
};

/** Register a custom provider handler (for plugins) */
function registerProviderHandler(type, fn) {
  PROVIDER_HANDLERS[type] = fn;
}

// ── Config resolution with failover chain ─────────────────────────────────────

function resolveConfigs() {
  const configs = [];

  // 1. DB configs (sorted by priority, active first)
  try {
    const rows = db.listAIConfigsSorted.all();
    configs.push(...rows.map(r => ({ ...r, extra: JSON.parse(r.extra || '{}') })));
  } catch { /* DB may not be ready yet */ }

  // 2. Environment fallback
  if (process.env.ANTHROPIC_API_KEY) {
    configs.push({
      id: 'env_anthropic',
      provider_type: 'anthropic',
      api_key: process.env.ANTHROPIC_API_KEY,
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      is_active: configs.length === 0 ? 1 : 0,
      extra: {},
    });
  }
  if (process.env.OPENAI_API_KEY || process.env.AI_API_KEY) {
    configs.push({
      id: 'env_openai',
      provider_type: 'openai-compatible',
      base_url: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      api_key: process.env.OPENAI_API_KEY || process.env.AI_API_KEY,
      model: process.env.AI_MODEL || 'gpt-4o',
      is_active: configs.length === 0 ? 1 : 0,
      extra: {},
    });
  }
  if (process.env.GOOGLE_AI_KEY) {
    configs.push({
      id: 'env_google',
      provider_type: 'google',
      api_key: process.env.GOOGLE_AI_KEY,
      model: process.env.GOOGLE_AI_MODEL || 'gemini-2.0-flash',
      is_active: configs.length === 0 ? 1 : 0,
      extra: {},
    });
  }
  if (process.env.GLM_API_KEY) {
    configs.push({
      id: 'env_glm',
      provider_type: 'glm',
      base_url: process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
      api_key: process.env.GLM_API_KEY,
      model: process.env.GLM_MODEL || 'glm-4.5-flash',
      is_active: configs.length === 0 ? 1 : 0,
      extra: {},
    });
  }

  return configs;
}

function resolveConfig() {
  const configs = resolveConfigs();
  return configs.length > 0 ? configs[0] : null;
}

// ── Core call (deprecated, use completeWithFailover) ────────────────────────

async function complete(prompt, maxTokens = 300) {
  return completeWithFailover(prompt, maxTokens);
}

// ── Test connection ───────────────────────────────────────────────────────────

async function testConfig(configRow) {
  const handler = PROVIDER_HANDLERS[configRow.provider_type];
  if (!handler) throw new Error(`未知类型: ${configRow.provider_type}`);
  const text = await handler(configRow, '请回复"连接成功"四个字，不要其他内容。', 30);
  return text;
}

// ── AI call with failover chain ───────────────────────────────────────────────

async function completeWithFailover(prompt, maxTokens = 300) {
  const configs = resolveConfigs();
  if (!configs.length) {
    throw new Error('未配置 AI 服务，请在后台管理界面添加 AI 配置');
  }

  let lastError = null;
  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    const handler = PROVIDER_HANDLERS[config.provider_type];
    if (!handler) {
      console.warn(`[AI] Unknown provider type: ${config.provider_type}, skipping`);
      continue;
    }

    try {
      const result = await handler(config, prompt, maxTokens);
      console.log(`[AI] Success with config ${i} (${config.name || config.id})`);
      return result;
    } catch (err) {
      lastError = err;
      console.warn(`[AI] Config ${i} (${config.name || config.id}) failed: ${err.message}, trying next...`);
    }
  }

  throw lastError || new Error('All AI providers failed');
}

// ── Game AI methods ───────────────────────────────────────────────────────────

/**
 * Optimised single-concept validation prompt (~100 input tokens, 150 output tokens).
 * system_prompt is passed to the provider separately when available.
 */
async function validateConcept(concept, topic, existing = [], gameMode = {}, knowledgeContext = '') {
  // Check cache first (same input + topic = same output always)
  const cached = cacheService.get(concept, topic);
  if (cached) {
    console.log(`[AI] Cache HIT for concept="${concept}" topic="${topic}"`);
    return cached;
  }

  // Last 5 accepted concepts only (saves tokens)
  const recentNames = existing.slice(-5).map(c => c.name).join('、') || '无';

  const modeHint = gameMode.mode === 'ordered'
    ? '时序模式：须晚于已有最新时间。'
    : gameMode.mode === 'chain'
    ? '关联模式：须与上一概念有历史关联。'
    : '';

  const kb = knowledgeContext ? `参考：${knowledgeContext.slice(0, 200)}\n` : '';

  // Compact prompt — uses fewer tokens while preserving accuracy
  const prompt = `历史接龙。主题：${topic}。已有：${recentNames}。${modeHint}
${kb}验证「${concept}」是否为有效历史概念，返回JSON（禁止markdown）：
有效：{"valid":true,"name":"标准名","year":-356,"dynasty":"朝代","period":"时段","description":"简介≤30字","tags":["标签"],"difficulty":3}
无效：{"valid":false,"reason":"原因"}
year：BC负数，AD正数，时间段取起始，不确定null。difficulty：概念冷僻程度1(常见)~5(冷僻)。`;

  const text = await completeWithFailover(prompt, 1024);
  const result = extractJSON(text);

  if (result && result.valid) {
    cacheService.set(concept, topic, result, resolveConfig()?.model);
  }

  return result;
}

/**
 * Batch validate — 10 per call (up from 8), shorter per-item prompt.
 */
async function batchValidateConcepts(concepts, topic, knowledgeContext = '') {
  if (!concepts.length) return [];

  const BATCH = 10;
  const results = [];

  for (let i = 0; i < concepts.length; i += BATCH) {
    const slice = concepts.slice(i, i + BATCH);

    const cached = [];
    const toValidate = [];
    for (const c of slice) {
      const hit = cacheService.get(c.raw_input, topic);
      if (hit) {
        cached.push({ id: c.id, ...hit, fromCache: true });
      } else {
        toValidate.push(c);
      }
    }

    if (toValidate.length > 0) {
      const list = toValidate.map((c, idx) => `${idx + 1}.${c.raw_input}`).join(' ');
      const kb = knowledgeContext ? `参考：${knowledgeContext.slice(0, 150)}\n` : '';

      const prompt = `批量验证历史接龙（主题：${topic}）。${kb}验证${toValidate.length}项，返回等长JSON数组（禁止markdown）：
${list}
格式：[{"index":1,"valid":true,"name":"名","year":-356,"dynasty":"朝","period":"时","description":"≤30字","tags":["t"],"difficulty":3},{"index":2,"valid":false,"reason":"原因"}]`;

      const text = await completeWithFailover(prompt, 1024);
      const arr = extractJSON(text);
      if (!Array.isArray(arr)) throw new Error('Batch AI returned non-array');

      for (let j = 0; j < toValidate.length; j++) {
        const r = arr.find(x => x.index === j + 1) || arr[j] || { valid: false, reason: 'AI未返回结果' };
        const fullResult = { id: toValidate[j].id, ...r };
        results.push(fullResult);

        if (r.valid) {
          cacheService.set(toValidate[j].raw_input, topic, r, resolveConfig()?.model);
        }
      }
    }

    results.push(...cached);
  }

  return results;
}

/**
 * Generate topic-specific challenge cards for challenge mode.
 * Returns an array of { id, text, tag } objects tailored to the game topic.
 */
async function generateChallengeCards(topic, count = 10) {
  const prompt = `你是历史接龙游戏的出题人。当前游戏主题是「${topic}」。
请针对该主题生成${count}个挑战卡，每个挑战卡是一个具体的子类别或角度，要求与主题紧密相关。
返回JSON数组（禁止markdown）：
[{"id":"card1","text":"提交一个[具体描述]相关概念","tag":"[简短标签]"},...]
要求：
1. 每张卡的text必须和主题「${topic}」直接相关
2. tag是1-4个字的简短分类词
3. 覆盖多种角度，避免重复
4. text格式统一：以"提交一个"或"提交一位"开头`;

  try {
    const text = await completeWithFailover(prompt, 1024);
    const arr = extractJSON(text);
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.map((c, i) => ({
        id: c.id || `topic_${i}`,
        text: c.text || '',
        tag: c.tag || '',
      })).filter(c => c.text && c.tag);
    }
  } catch (err) {
    console.warn(`[AI] generateChallengeCards failed: ${err.message}`);
  }
  return null; // caller falls back to default cards
}

async function suggestConcepts(topic, existing = [], count = 3) {
  const existingNames = existing.slice(-8).map(c => c.name).join('、') || '无';
  // Compact hints prompt
  const prompt = `历史接龙主题：${topic}。已有：${existingNames}。推荐${count}个未出现的相关历史概念，每行一个名称，不加编号。`;
  const text = await complete(prompt, 1024);
  return text.split('\n').map(s => s.trim()).filter(Boolean).slice(0, count);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractJSON(text) {
  const clean = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(clean); } catch { /* fall through */ }
  // Try object
  const obj = clean.match(/\{[\s\S]*\}/);
  if (obj) { try { return JSON.parse(obj[0]); } catch { /* fall through */ } }
  // Try array
  const arr = clean.match(/\[[\s\S]*\]/);
  if (arr) { try { return JSON.parse(arr[0]); } catch { /* fall through */ } }
  throw new Error('Cannot parse AI response as JSON');
}

module.exports = {
  complete,
  validateConcept,
  batchValidateConcepts,
  suggestConcepts,
  generateChallengeCards,
  testConfig,
  resolveConfig,
  resolveConfigs,
  registerProviderHandler,
  PROVIDER_HANDLERS,
};
