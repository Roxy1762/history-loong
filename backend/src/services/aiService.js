/**
 * AI Service — adapter pattern.
 * Add new providers by implementing the same interface and registering below.
 */

const Anthropic = require('@anthropic-ai/sdk');

// ── Provider: Claude ──────────────────────────────────────────────────────────

class ClaudeProvider {
  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
  }

  async complete(prompt, maxTokens = 800) {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0].text.trim();
  }
}

// ── Provider registry (extension point) ──────────────────────────────────────

const PROVIDERS = {
  claude: ClaudeProvider,
  // openai: OpenAIProvider,   // future
  // mock:   MockProvider,     // for testing
};

// ── AIService ─────────────────────────────────────────────────────────────────

class AIService {
  constructor() {
    const name = process.env.AI_PROVIDER || 'claude';
    const Cls = PROVIDERS[name];
    if (!Cls) throw new Error(`Unknown AI provider: ${name}`);
    this.provider = new Cls();
    this.name = name;
  }

  /**
   * Validate a submitted concept and extract timeline metadata.
   *
   * @param {string} concept   Raw player input
   * @param {string} topic     Game topic
   * @param {Array}  existing  Already-validated concepts [{name, period}]
   * @param {object} gameMode  Game mode settings
   * @returns {object}  { valid, reason, name, period, year, dynasty, description, tags, extra }
   */
  async validateConcept(concept, topic, existing = [], gameMode = {}) {
    const existingText = existing.length
      ? existing.map((c) => `- ${c.name}（${c.period || '年代不明'}）`).join('\n')
      : '（暂无）';

    const modeHint = gameMode.mode === 'ordered'
      ? '注意：本局为时间顺序模式，新概念必须晚于已有概念中最新的时间。'
      : gameMode.mode === 'chain'
      ? '注意：本局为接龙模式，新概念应与上一个概念有明确的历史关联。'
      : '';

    const prompt = `你是一位严谨的历史学专家，正在主持一场历史知识接龙游戏。

游戏主题：${topic}
游戏已有概念列表：
${existingText}

${modeHint}

玩家新提交的内容：「${concept}」

请判断该内容是否为与主题相关的有效历史概念/事件/人物/制度/思想流派，并提取其时间信息。
返回严格的 JSON（不要 markdown 代码块，不要额外文字）：

{
  "valid": true,
  "name": "标准化名称（如：商鞅变法）",
  "period": "时间描述（如：公元前356年—公元前350年）",
  "year": -356,
  "dynasty": "所属朝代/时期（如：战国·秦）",
  "description": "一句话简介，不超过60字",
  "tags": ["政治", "改革"],
  "extra": {}
}

若无效，则返回：
{
  "valid": false,
  "reason": "说明原因（如：与主题无关、不是真实历史概念等）"
}

year 字段规则：公元前用负数（如公元前356年 → -356），公元后用正数。
若为时间段，取起始年。若无法确定，填 null。`;

    try {
      const text = await this.provider.complete(prompt, 600);
      const json = this._extractJSON(text);
      return json;
    } catch (err) {
      console.error('[AIService] validateConcept error:', err.message);
      throw new Error('AI 服务暂时不可用，请稍后重试');
    }
  }

  /**
   * Generate a hint or suggest related concepts for a topic.
   * Extension point for richer game features.
   */
  async suggestConcepts(topic, existing = [], count = 3) {
    const existingNames = existing.map((c) => c.name).join('、') || '无';
    const prompt = `历史接龙游戏主题：${topic}。
已出现的概念：${existingNames}。
请推荐 ${count} 个尚未出现的、与主题相关的历史概念，每行一个，只写名称，不要编号或解释。`;

    const text = await this.provider.complete(prompt, 200);
    return text.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, count);
  }

  // ── private ─────────────────────────────────────────────────────────────────

  _extractJSON(text) {
    // Remove markdown code fences if present
    const clean = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    // Try direct parse
    try {
      return JSON.parse(clean);
    } catch {
      // Extract first {...} block
      const m = clean.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
      throw new Error('Cannot parse AI response as JSON');
    }
  }
}

// Singleton
let _instance = null;
function getAIService() {
  if (!_instance) _instance = new AIService();
  return _instance;
}

module.exports = { getAIService, PROVIDERS };
