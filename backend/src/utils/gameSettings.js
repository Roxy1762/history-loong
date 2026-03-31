const { parseObject, toBoundedInt, toBoolean } = require('./json');

function normalizeRagJoinSeparator(value) {
  return value === 'double_newline' ? 'double_newline' : 'rule';
}

function normalizeGameSettings(input = {}, fallback = {}) {
  const base = parseObject(fallback, {});
  const raw = parseObject(input, {});
  const merged = { ...base, ...raw };

  merged.ragTopicTopN = toBoundedInt(merged.ragTopicTopN, { defaultValue: 1, min: 1, max: 10 });
  merged.ragConceptTopN = toBoundedInt(merged.ragConceptTopN, { defaultValue: 2, min: 1, max: 12 });
  merged.ragContextMaxChars = toBoundedInt(merged.ragContextMaxChars, { defaultValue: 800, min: 200, max: 4000 });
  merged.ragFtsCandidateMultiplier = toBoundedInt(merged.ragFtsCandidateMultiplier, { defaultValue: 4, min: 1, max: 20 });
  merged.ragFtsMinCandidates = toBoundedInt(merged.ragFtsMinCandidates, { defaultValue: 12, min: 1, max: 200 });
  merged.ragShowPolishedInChat = toBoolean(merged.ragShowPolishedInChat, false);
  merged.ragJoinSeparator = normalizeRagJoinSeparator(merged.ragJoinSeparator);

  return merged;
}

module.exports = {
  normalizeGameSettings,
  normalizeRagJoinSeparator,
};
