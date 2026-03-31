/**
 * AI Service — multi-provider, DB-driven configuration.
 *
 * Supported provider types:
 *   'anthropic'        — Anthropic Claude (native SDK), supports custom base_url
 *   'openai-compatible' — Any OpenAI-compatible API (OpenAI, DeepSeek, Qwen, Ollama, etc.)
 *   'google'           — Google AI Studio / Gemini, supports custom base_url
 *   'glm'              — 智谱AI (BigModel) API, supports custom base_url
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
  // Support custom base_url for Anthropic (e.g. proxy or alternative endpoint)
  const clientOpts = { apiKey: config.api_key };
  if (config.base_url) {
    clientOpts.baseURL = config.base_url.replace(/\/$/, '');
  }
  const client = new Anthropic(clientOpts);
  const msgParams = {
    model: config.model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };
  if (config.system_prompt) {
    msgParams.system = config.system_prompt;
  }
  const resp = await client.messages.create(msgParams);
  return resp.content[0].text.trim();
}

async function callOpenAICompatible(config, prompt, maxTokens) {
  const base = (config.base_url || '').replace(/\/$/, '');
  if (!base) throw new Error('OpenAI-compatible 配置缺少 base_url');
  // If full URL with path provided, use it; otherwise append /chat/completions
  const url = base.includes('/chat/completions') ? base : `${base}/chat/completions`;

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
  // Support custom base_url for Google (e.g. proxy)
  const rawBase = (config.base_url || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  // If base_url already contains the full generateContent path, use it directly
  const url = rawBase.includes('/generateContent')
    ? rawBase
    : `${rawBase}/models/${model}:generateContent?key=${config.api_key}`;

  const contents = [];
  if (config.system_prompt) {
    contents.push({ role: 'user', parts: [{ text: config.system_prompt }] });
    contents.push({ role: 'model', parts: [{ text: '好的，我已理解。' }] });
  }
  contents.push({ role: 'user', parts: [{ text: prompt }] });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    // For custom proxy that may need Authorization header
    const headers = { 'Content-Type': 'application/json' };
    if (config.base_url) {
      headers['Authorization'] = `Bearer ${config.api_key}`;
    }
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contents,
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 },
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
    if (err.name === 'AbortError') throw new Error('Google AI 请求超时（30秒）');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function callGLM(config, prompt, maxTokens) {
  const rawBase = (config.base_url || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/$/, '');
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

// ── Provider registry ─────────────────────────────────────────────────────────

const PROVIDER_HANDLERS = {
  anthropic: callAnthropic,
  'openai-compatible': callOpenAICompatible,
  google: callGoogle,
  glm: callGLM,
};

function registerProviderHandler(type, fn) {
  PROVIDER_HANDLERS[type] = fn;
}

// ── Config resolution ─────────────────────────────────────────────────────────

function resolveConfigs() {
  const configs = [];

  try {
    const rows = db.listAIConfigsSorted.all();
    configs.push(...rows.map(r => ({ ...r, extra: JSON.parse(r.extra || '{}') })));
  } catch { /* DB may not be ready yet */ }

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

// ── Core call ─────────────────────────────────────────────────────────────────

async function complete(prompt, maxTokens = 300) {
  return completeWithFailover(prompt, maxTokens);
}

async function testConfig(configRow) {
  const handler = PROVIDER_HANDLERS[configRow.provider_type];
  if (!handler) throw new Error(`未知类型: ${configRow.provider_type}`);
  const text = await handler(configRow, '请回复"连接成功"四个字，不要其他内容。', 30);
  return text;
}

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

// ── Theme era inference ───────────────────────────────────────────────────────
/**
 * Infer the implied time period from a game topic string.
 * Returns a hint string to embed in the validation prompt so AI places concepts
 * in the correct era rather than defaulting to the most famous epoch.
 *
 * Examples:
 *   "资本主义世界殖民体系" → "（主题涉及近代，概念应定位在1500-1950年）"
 *   "古埃及文明" → "（主题涉及古代，概念应定位在公元前3100-30年）"
 */
function inferThemeEraHint(topic) {
  const t = topic || '';

  // Modern/colonial topics
  if (/殖民|帝国主义|资本主义扩张|工业革命|鸦片战争|近现代|19世纪|20世纪/.test(t)) {
    return '（注意：主题涉及近代（1500-1950年），请将概念定位到该时代，而非更早的古代文明）';
  }
  // Cold War / contemporary
  if (/冷战|二战|一战|世界大战|当代|现代史/.test(t)) {
    return '（注意：主题涉及现当代（1900年至今），请将概念定位到该时代）';
  }
  // Renaissance / early modern
  if (/文艺复兴|大航海|地理大发现|宗教改革|启蒙运动/.test(t)) {
    return '（注意：主题涉及近代早期（1400-1800年），请将概念定位到该时代）';
  }
  // Medieval
  if (/中世纪|封建|拜占庭|十字军|蒙古|黑死病/.test(t)) {
    return '（注意：主题涉及中世纪（500-1500年），请将概念定位到该时代）';
  }
  // Ancient Chinese dynasties
  if (/秦汉|三国|唐朝|宋朝|明朝|清朝|隋唐|两汉/.test(t)) {
    return '（注意：主题涉及中国古代史，请将概念定位到相应朝代）';
  }
  // Ancient civilizations
  if (/古埃及|古希腊|古罗马|古巴比伦|美索不达米亚|先秦|上古/.test(t)) {
    return '（注意：主题涉及上古/古代文明（公元前3000-公元500年），请将概念定位到该时代）';
  }
  return '';
}

// ── Game AI methods ───────────────────────────────────────────────────────────

/**
 * Optimised single-concept validation.
 * Includes theme-era hint to prevent misclassification (e.g. Egypt → ancient when topic is colonial).
 */
async function validateConcept(concept, topic, existing = [], gameMode = {}, knowledgeContext = '') {
  const traced = await validateConceptWithTrace(concept, topic, existing, gameMode, knowledgeContext);
  return traced.result;
}

async function validateConceptWithTrace(concept, topic, existing = [], gameMode = {}, knowledgeContext = '') {
  const cached = cacheService.get(concept, topic);
  if (cached) {
    console.log(`[AI] Cache HIT for concept="${concept}" topic="${topic}"`);
    return {
      result: cached,
      trace: {
        source: 'cache',
        ragUsed: false,
        knowledgeContext: '',
        prompt: null,
        rawOutput: JSON.stringify(cached),
      },
    };
  }

  const recentNames = existing.slice(-5).map(c => c.name).join('、') || '无';

  const activeModes = new Set([
    gameMode.mode,
    ...(Array.isArray(gameMode.modes) ? gameMode.modes : []),
  ].filter(Boolean));

  const modeHints = [];
  if (activeModes.has('ordered')) modeHints.push('时序模式：须晚于已有最新时间。');
  if (activeModes.has('chain')) modeHints.push('关联模式：须与上一概念有历史关联。');
  const modeHint = modeHints.join('');

  const kb = knowledgeContext ? `参考：${knowledgeContext.slice(0, 200)}\n` : '';

  // Theme-era hint to prevent misclassification across eras
  const eraHint = inferThemeEraHint(topic);

  const prompt = `历史接龙。主题：${topic}。${eraHint}已有：${recentNames}。${modeHint}
${kb}验证「${concept}」是否为与该主题相关的有效历史概念，返回JSON（禁止markdown）：
有效：{"valid":true,"name":"标准名","year":-356,"dynasty":"朝代","period":"时段","description":"简介≤30字","tags":["标签"],"difficulty":3}
无效：{"valid":false,"reason":"原因"}
year：BC负数，AD正数，时间段取起始，不确定null。difficulty：概念冷僻程度1(常见)~5(冷僻)。`;

  const text = await completeWithFailover(prompt, 1024);
  const result = extractJSON(text);
  const active = resolveConfig();

  if (result && result.valid) {
    cacheService.set(concept, topic, result, resolveConfig()?.model);
  }

  return {
    result,
    trace: {
      source: 'ai',
      ragUsed: Boolean(knowledgeContext),
      knowledgeContext,
      prompt,
      rawOutput: text,
      parsedOutput: result,
      provider: active?.provider_type || null,
      model: active?.model || null,
    },
  };
}

/**
 * Batch validate — 10 per call, includes theme-era hint.
 */
async function batchValidateConcepts(concepts, topic, knowledgeContext = '') {
  if (!concepts.length) return [];

  const BATCH = 10;
  const results = [];
  const eraHint = inferThemeEraHint(topic);

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

      const prompt = `批量验证历史接龙（主题：${topic}）。${eraHint}${kb}验证${toValidate.length}项，返回等长JSON数组（禁止markdown）：
${list}
格式：[{"index":1,"valid":true,"name":"名","year":-356,"dynasty":"朝","period":"时","description":"≤30字","tags":["t"],"difficulty":3},{"index":2,"valid":false,"reason":"原因"}]`;

      const text = await completeWithFailover(prompt, 1024);
      const arr = extractJSON(text);
      if (!Array.isArray(arr)) throw new Error('Batch AI returned non-array');
      const active = resolveConfig();

      for (let j = 0; j < toValidate.length; j++) {
        const r = arr.find(x => x.index === j + 1) || arr[j] || { valid: false, reason: 'AI未返回结果' };
        const fullResult = {
          id: toValidate[j].id,
          ...r,
          _trace: {
            source: 'ai-batch',
            ragUsed: Boolean(knowledgeContext),
            knowledgeContext,
            prompt,
            rawOutput: text,
            parsedOutput: r,
            provider: active?.provider_type || null,
            model: active?.model || null,
          },
        };
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
 * Generate topic-specific challenge cards.
 * Cards include period hints so they can actually appear on the timeline.
 */
async function generateChallengeCards(topic, count = 10) {
  const eraHint = inferThemeEraHint(topic);
  const prompt = `你是历史接龙游戏的出题人。当前游戏主题是「${topic}」。${eraHint}
请针对该主题生成${count}个挑战卡，每个挑战卡是一个具体的子类别或角度，要求与主题及其时代紧密相关。
返回JSON数组（禁止markdown）：
[{"id":"card1","text":"提交一个[具体描述]相关概念","tag":"[简短标签]","periodHint":"[时代提示，如\"19世纪\"或\"明朝\"]"},...]
要求：
1. 每张卡的text必须和主题「${topic}」直接相关，且涉及主题所处的历史时代
2. tag是1-4个字的简短分类词
3. 覆盖多种角度（人物、事件、制度、地区等），避免重复
4. text格式统一：以"提交一个"或"提交一位"开头
5. 卡片内容必须是可以在时间轴上体现的历史概念`;

  try {
    const text = await completeWithFailover(prompt, 1024);
    const arr = extractJSON(text);
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.map((c, i) => ({
        id: c.id || `topic_${i}`,
        text: c.text || '',
        tag: c.tag || '',
        periodHint: c.periodHint || '',
      })).filter(c => c.text && c.tag);
    }
  } catch (err) {
    console.warn(`[AI] generateChallengeCards failed: ${err.message}`);
  }
  return null;
}

async function suggestConcepts(topic, existing = [], count = 3) {
  const existingNames = existing.slice(-8).map(c => c.name).join('、') || '无';
  const eraHint = inferThemeEraHint(topic);
  const prompt = `历史接龙主题：${topic}。${eraHint}已有：${existingNames}。推荐${count}个未出现的、与主题时代相符的历史概念，每行一个名称，不加编号。`;
  const text = await complete(prompt, 1024);
  return text.split('\n').map(s => s.trim()).filter(Boolean).slice(0, count);
}

async function polishRagContext(context, maxChars = 1200) {
  const raw = String(context || '').trim();
  if (!raw) return '';
  const safeMax = Math.max(200, Math.min(4000, parseInt(String(maxChars), 10) || 1200));
  const prompt = `请将以下教材检索片段做“轻度润色与去冗余”：
1) 尽量完整保留事实与原文信息，不要新增任何事实；
2) 只删除重复、噪音、无关句；
3) 保持中文自然可读；
4) 输出纯文本，不要Markdown，不要解释；
5) 最长不超过${safeMax}字。

原文：
${raw}`;
  try {
    const text = await completeWithFailover(prompt, 1024);
    return String(text || '').trim().slice(0, safeMax) || raw.slice(0, safeMax);
  } catch {
    return raw.slice(0, safeMax);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractJSON(text) {
  const clean = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(clean); } catch { /* fall through */ }
  const obj = clean.match(/\{[\s\S]*\}/);
  if (obj) { try { return JSON.parse(obj[0]); } catch { /* fall through */ } }
  const arr = clean.match(/\[[\s\S]*\]/);
  if (arr) { try { return JSON.parse(arr[0]); } catch { /* fall through */ } }
  throw new Error('Cannot parse AI response as JSON');
}

module.exports = {
  complete,
  validateConcept,
  validateConceptWithTrace,
  batchValidateConcepts,
  suggestConcepts,
  polishRagContext,
  generateChallengeCards,
  inferThemeEraHint,
  testConfig,
  resolveConfig,
  resolveConfigs,
  registerProviderHandler,
  PROVIDER_HANDLERS,
};
