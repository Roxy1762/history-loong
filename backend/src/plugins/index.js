/**
 * Plugin System
 * Plugins can extend: AI providers, export formatters, era presets,
 * game modes, and event hooks.
 *
 * A plugin is a module that exports a default object with:
 *   { name, version, setup(context) }
 *
 * context provides:
 *   - registerAIProvider(name, ProviderClass)
 *   - registerExportFormatter(name, fn)
 *   - registerEraPreset(name, eras)
 *   - registerGameMode(name, modeConfig)
 *   - on(event, handler)       // lifecycle hooks
 */

const path = require('path');
const { PROVIDERS } = require('../services/aiService');
const { ExportService } = require('../services/exportService');
const { TimelineService } = require('../services/timelineService');

// ── Event emitter for plugin hooks ────────────────────────────────────────────

const EventEmitter = require('events');
const pluginEvents = new EventEmitter();

// ── Game mode registry ────────────────────────────────────────────────────────

const GAME_MODES = {
  free: {
    label: '自由接龙',
    description: '每位玩家可自由提交与主题相关的历史概念，无顺序限制',
  },
  chain: {
    label: '关联接龙',
    description: '每个新概念必须与上一个概念有明确的历史关联',
  },
  ordered: {
    label: '时序接龙',
    description: '所有概念必须按时间先后顺序提交',
  },
  relay: {
    label: '接力接龙',
    description: '每轮每人只能提交一个概念，所有人都提交后开启下一轮',
  },
  'turn-order': {
    label: '轮流接龙',
    description: '玩家按加入顺序严格轮流提交，等待轮到自己才能提交',
  },
  'score-race': {
    label: '积分竞速',
    description: '越冷僻的历史概念得分越高（AI评级1-5星），比拼谁得分最多',
  },
  challenge: {
    label: '挑战接龙',
    description: '每轮有随机挑战卡（如"提交军事事件""提交女性人物"），完成挑战获得额外积分',
  },
};

// ── Plugin context ────────────────────────────────────────────────────────────

const pluginContext = {
  registerAIProvider(name, ProviderClass) {
    PROVIDERS[name] = ProviderClass;
    console.log(`[Plugin] Registered AI provider: ${name}`);
  },
  registerExportFormatter(name, fn) {
    ExportService.registerFormatter(name, fn);
    console.log(`[Plugin] Registered export formatter: ${name}`);
  },
  registerEraPreset(name, eras) {
    TimelineService.registerEraPreset(name, eras);
    console.log(`[Plugin] Registered era preset: ${name}`);
  },
  registerGameMode(name, config) {
    GAME_MODES[name] = config;
    console.log(`[Plugin] Registered game mode: ${name}`);
  },
  on(event, handler) {
    pluginEvents.on(event, handler);
  },
};

// ── Loader ────────────────────────────────────────────────────────────────────

function loadPlugins() {
  const enabled = (process.env.ENABLED_PLUGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const name of enabled) {
    try {
      const pluginPath = path.resolve(__dirname, '../../plugins', name);
      const plugin = require(pluginPath);
      plugin.setup(pluginContext);
      console.log(`[Plugin] Loaded: ${plugin.name || name} v${plugin.version || '?'}`);
    } catch (err) {
      console.warn(`[Plugin] Failed to load "${name}": ${err.message}`);
    }
  }
}

module.exports = { loadPlugins, pluginEvents, pluginContext, GAME_MODES };
