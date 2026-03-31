const { parseArray, parseObject } = require('./json');

function getGameSettings(game, fallback = {}) {
  return parseObject(game?.settings, fallback);
}

function withGameSettings(game, fallback = {}) {
  if (!game) return game;
  return { ...game, settings: getGameSettings(game, fallback) };
}

function parseConceptRecord(row) {
  return {
    ...row,
    tags: parseArray(row?.tags, []),
    extra: parseObject(row?.extra, {}),
  };
}

function parseMessageRecord(row) {
  return {
    ...row,
    meta: parseObject(row?.meta, {}),
  };
}

function buildValidationOptions(game, settings = {}) {
  const extraModes = Array.isArray(settings.extraModes) ? settings.extraModes : [];
  const modes = [...new Set([game?.mode, ...extraModes].filter(Boolean))];
  return { mode: game?.mode, modes, ...settings };
}

module.exports = {
  getGameSettings,
  withGameSettings,
  parseConceptRecord,
  parseMessageRecord,
  buildValidationOptions,
};
