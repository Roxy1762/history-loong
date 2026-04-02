/**
 * Knowledge Base Service
 * Ingests documents into SQLite FTS5 and retrieves relevant context
 * for AI prompts.
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('../db');

const CHUNK_SIZE = 400; // characters per chunk
const CHUNK_OVERLAP = 80; // overlap between adjacent chunks (characters)

// Matches typical Chinese textbook heading lines:
//   第X章/节/课/单元  |  一、二、三、  |  (一)(二)  |  【标题】
const TEXTBOOK_HEADING_RE = /^(?:第[零一二三四五六七八九十百千万\d]+[章节课单元]\s|[（(]?[一二三四五六七八九十]+[）)]?[、．.]\s?|【[^】]+】|\d+\.\s)/;
const DEFAULT_SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1';
const EMBEDDING_CACHE_MAX = Math.max(100, parseInt(process.env.KB_EMBED_CACHE_MAX || '2000', 10) || 2000);
const embeddingCache = new Map();

// ── Ingest ────────────────────────────────────────────────────────────────────

/**
 * Ingest a text document into the knowledge base.
 * @param {string} title      Display name
 * @param {string} filename   Original filename
 * @param {string} content    Full text content
 * @param {string} [strategy] Chunking strategy: 'auto' | 'textbook' | 'plain' (default: 'auto')
 * @returns {{ docId, chunks, strategy }}
 */
function ingestDocument(title, filename, content, strategy = 'auto') {
  const docId = uuidv4();
  const effectiveStrategy = strategy === 'auto' ? detectChunkStrategy(content) : strategy;
  const chunks = splitIntoChunks(content, CHUNK_SIZE, effectiveStrategy);

  // Transaction for atomicity
  const insertAll = db.db.transaction(() => {
    db.insertDocWithStrategy.run(docId, title, filename, chunks.length, effectiveStrategy);

    for (let i = 0; i < chunks.length; i++) {
      const chunkId = uuidv4();
      db.insertChunk.run(chunkId, docId, i, chunks[i]);
      db.insertFTS.run(chunks[i], chunkId);
    }
  });

  insertAll();
  return { docId, chunks: chunks.length, strategy: effectiveStrategy };
}

/**
 * Delete a document and all its chunks from the knowledge base.
 */
function deleteDocument(docId) {
  const del = db.db.transaction(() => {
    // FTS entries reference chunk IDs; delete FTS first
    const chunks = db.db.prepare(`SELECT id FROM knowledge_chunks WHERE doc_id = ?`).all(docId);
    for (const c of chunks) {
      db.db.prepare(`DELETE FROM knowledge_fts WHERE chunk_id = ?`).run(c.id);
    }
    db.deleteChunksByDoc.run(docId);
    db.deleteDoc.run(docId);
  });
  del();
}

/**
 * Manually pre-vectorize all chunks for a document.
 * This warms embedding cache for faster/stabler subsequent retrieval.
 */
async function vectorizeDocument(docId) {
  const doc = db.getDoc.get(docId);
  if (!doc) throw new Error('文档不存在');

  const config = getSiliconFlowConfig();
  if (!config.enableEmbedding) {
    throw new Error('当前未启用可用的嵌入模型，请先在 AI 配置中开启知识库 Embedding');
  }

  const chunks = db.db.prepare(
    `SELECT content FROM knowledge_chunks WHERE doc_id = ? ORDER BY chunk_idx ASC`
  ).all(docId);
  if (chunks.length === 0) return { docId, chunks: 0, vectorized: 0 };

  const batchSize = 64;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const texts = chunks.slice(i, i + batchSize).map(c => c.content || '');
    await embedTexts(config, texts);
  }

  db.markDocVectorized.run(docId);

  return { docId, chunks: chunks.length, vectorized: chunks.length };
}

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Search the knowledge base for chunks relevant to a query.
 * Returns plain text suitable for injecting into an AI prompt.
 *
 * @param {string} query   Search query (concept name or topic)
 * @param {number} topN    Max chunks to return
 * @returns {string}       Concatenated relevant text
 */
function searchContext(query, topN = 4) {
  if (!query) return '';
  try {
    // FTS5 match syntax — escape special chars
    const safeQuery = normalizeSearchInput(query);
    if (!safeQuery) return '';

    const rows = db.searchFTSVisible.all(safeQuery, topN);
    if (!rows.length) return '';

    const texts = rows.map((r) => {
      const chunk = db.getChunkById.get(r.chunk_id);
      return chunk ? chunk.content : '';
    }).filter(Boolean);

    return texts.join('\n---\n');
  } catch {
    return '';
  }
}

/**
 * Get combined search context for a concept submission.
 * Queries both the topic and the concept name.
 */
function getContextForConcept(concept, topic) {
  const byTopic   = searchContext(topic,   1);
  const byConcept = searchContext(concept, 2);

  const combined = [byTopic, byConcept].filter(Boolean).join('\n---\n');
  return combined ? combined.slice(0, 800) : ''; // cap at 800 chars
}

/**
 * Advanced context search with optional SiliconFlow embedding + rerank.
 * Falls back to plain FTS when config is missing or remote calls fail.
 */
async function searchContextAdvanced(query, topN = 4) {
  const { context } = await searchContextAdvancedWithTrace(query, topN);
  return context;
}

async function searchContextAdvancedWithTrace(query, topN = 4, runtimeOverrides = {}) {
  const runtime = getRagRuntimeConfig(runtimeOverrides);
  if (!query) return { context: '', trace: { query: '', stage: 'empty', candidates: 0, ranked: [] } };
  try {
    const candidates = searchChunksByFTS(
      query,
      Math.max(runtime.ftsMinCandidates, topN * runtime.candidateMultiplier),
    );
    if (!candidates.length) return { context: '', trace: { query, stage: 'fts', candidates: 0, ranked: [] } };
    const ranked = await rankChunks(query, candidates, topN, runtime);
    const texts = ranked.map(r => r.content).filter(Boolean);
    return {
      context: texts.join(runtime.joinSeparator),
      trace: {
        query,
        stage: 'advanced',
        candidates: candidates.length,
        ranked: ranked.map((r, idx) => ({
          rank: idx + 1,
          score: Number.isFinite(r.finalScore) ? Number(r.finalScore.toFixed(6)) : null,
          embedScore: Number.isFinite(r.embedScore) ? Number(r.embedScore.toFixed(6)) : null,
          rerankScore: Number.isFinite(r.rerankScore) ? Number(r.rerankScore.toFixed(6)) : null,
          ftsRank: r.ftsRank,
          preview: String(r.content || '').slice(0, 80),
        })),
      },
    };
  } catch {
    const fallback = searchContext(query, topN);
    return {
      context: fallback,
      trace: { query, stage: 'fallback_fts', candidates: 0, ranked: [] },
    };
  }
}

/**
 * Advanced combined context for a concept submission.
 */
async function getContextForConceptAdvanced(concept, topic) {
  const { context } = await getContextForConceptAdvancedWithTrace(concept, topic);
  return context;
}

async function getContextForConceptAdvancedWithTrace(concept, topic, runtimeOverrides = {}) {
  const runtime = getRagRuntimeConfig(runtimeOverrides);
  const conceptQuery = runtimeOverrides?.conceptQuery || concept;
  const topicQuery = runtimeOverrides?.topicQuery || topic;
  const useTopicSearch = runtimeOverrides?.useTopicSearch !== false;
  const byTopicPromise = useTopicSearch
    ? searchContextAdvancedWithTrace(topicQuery, runtime.topicTopN, runtime)
    : Promise.resolve({
      context: '',
      trace: {
        query: topicQuery,
        stage: 'skipped_topic',
        candidates: 0,
        ranked: [],
      },
    });
  const [byTopic, byConcept] = await Promise.all([
    byTopicPromise,
    searchContextAdvancedWithTrace(conceptQuery, runtime.conceptTopN, runtime),
  ]);
  const combined = [byTopic.context, byConcept.context].filter(Boolean).join(runtime.joinSeparator);
  return {
    context: combined ? combined.slice(0, runtime.contextMaxChars) : '',
    trace: {
      topic: byTopic.trace,
      concept: byConcept.trace,
      topicQuery,
      conceptQuery,
      useTopicSearch,
      runtime,
    },
  };
}

function searchChunksByFTS(query, limit = 20) {
  const safeQuery = normalizeSearchInput(query);
  if (!safeQuery) return [];

  let rows = db.searchFTSVisible.all(safeQuery, limit);
  if (!rows.length) {
    const likeQuery = `%${safeQuery.replace(/\s+/g, '')}%`;
    rows = db.searchChunksByLikeVisible.all(likeQuery, limit);
  }
  if (!rows.length) return [];

  return rows
    .map((r, idx) => {
      const chunk = db.getChunkById.get(r.chunk_id);
      if (!chunk || !chunk.content) return null;

      // Metadata enrichment: look up document title and prepend as context header
      let content = chunk.content;
      try {
        const doc = db.db.prepare(
          `SELECT title FROM knowledge_docs WHERE id = ?`
        ).get(chunk.doc_id);
        if (doc && doc.title && !content.startsWith(`【${doc.title}】`)) {
          content = `【${doc.title}】\n${content}`;
        }
      } catch { /* non-fatal */ }

      return { chunk_id: r.chunk_id, content, ftsRank: idx };
    })
    .filter(Boolean);
}

function normalizeSearchInput(query) {
  return String(query || '')
    // Remove book/quote brackets, preserving the content inside
    .replace(/[「」『』《》〈〉]/g, ' ')
    // Remove general brackets
    .replace(/[【】（）()［］\[\]{}]/g, ' ')
    // Replace separators with space
    .replace(/[→·•\-–—·～~]/g, ' ')
    .replace(/['"*]/g, ' ')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

function getActiveKnowledgeOverrides() {
  try {
    const row = db.getActiveAIConfig.get();
    if (!row) return {};
    const extra = JSON.parse(row.extra || '{}');
    return {
      provider: typeof extra.kb_provider === 'string' ? extra.kb_provider.trim() : '',
      enabled: typeof extra.kb_enabled === 'boolean' ? extra.kb_enabled : null,
      minRelevanceScore: Number.isFinite(Number(extra.kb_min_relevance_score)) ? Number(extra.kb_min_relevance_score) : null,
      embeddingEnabled: typeof extra.kb_embedding_enabled === 'boolean' ? extra.kb_embedding_enabled : null,
      rerankEnabled: typeof extra.kb_rerank_enabled === 'boolean' ? extra.kb_rerank_enabled : null,
      apiKey: typeof extra.kb_api_key === 'string' ? extra.kb_api_key.trim() : '',
      baseUrl: typeof extra.kb_base_url === 'string' ? extra.kb_base_url.trim() : '',
      embeddingModel: typeof extra.kb_embedding_model === 'string' ? extra.kb_embedding_model.trim() : '',
      rerankModel: typeof extra.kb_rerank_model === 'string' ? extra.kb_rerank_model.trim() : '',
      rerankInstruction: typeof extra.kb_rerank_instruction === 'string' ? extra.kb_rerank_instruction.trim() : '',
      topicTopN: Number.isFinite(Number(extra.kb_topic_top_n)) ? Number(extra.kb_topic_top_n) : null,
      conceptTopN: Number.isFinite(Number(extra.kb_concept_top_n)) ? Number(extra.kb_concept_top_n) : null,
      candidateMultiplier: Number.isFinite(Number(extra.kb_candidate_multiplier)) ? Number(extra.kb_candidate_multiplier) : null,
      contextMaxChars: Number.isFinite(Number(extra.kb_context_max_chars)) ? Number(extra.kb_context_max_chars) : null,
      embeddingWeight: Number.isFinite(Number(extra.kb_embedding_weight)) ? Number(extra.kb_embedding_weight) : null,
      ftsWeight: Number.isFinite(Number(extra.kb_fts_weight)) ? Number(extra.kb_fts_weight) : null,
      rerankWeight: Number.isFinite(Number(extra.kb_rerank_weight)) ? Number(extra.kb_rerank_weight) : null,
      polishEnabled: typeof extra.kb_polish_enabled === 'boolean' ? extra.kb_polish_enabled : null,
      polishMaxChars: Number.isFinite(Number(extra.kb_polish_max_chars)) ? Number(extra.kb_polish_max_chars) : null,
      ftsMinCandidates: Number.isFinite(Number(extra.kb_fts_min_candidates)) ? Number(extra.kb_fts_min_candidates) : null,
      showPolishedInChat: typeof extra.kb_show_polished_in_chat === 'boolean' ? extra.kb_show_polished_in_chat : null,
      joinSeparator: typeof extra.kb_join_separator === 'string' ? extra.kb_join_separator : '',
    };
  } catch {
    return {};
  }
}

function buildSiliconFlowConfig(overrides = {}) {
  const apiKey = overrides.apiKey || process.env.SILICONFLOW_API_KEY || '';
  const baseUrl = (overrides.baseUrl || process.env.SILICONFLOW_BASE_URL || DEFAULT_SILICONFLOW_BASE_URL).replace(/\/$/, '');
  const embeddingModel = overrides.embeddingModel || process.env.SILICONFLOW_EMBED_MODEL || '';
  const rerankModel = overrides.rerankModel || process.env.SILICONFLOW_RERANK_MODEL || '';
  const rerankInstruction = overrides.rerankInstruction || process.env.SILICONFLOW_RERANK_INSTRUCTION || '';
  const enabledByEnv = String(process.env.KB_USE_SILICONFLOW || '').toLowerCase();
  const allowEnhancement = overrides.enabled == null
    ? enabledByEnv !== '0' && enabledByEnv !== 'false'
    : overrides.enabled;
  const allowEmbedding = overrides.embeddingEnabled == null ? allowEnhancement : overrides.embeddingEnabled;
  const allowRerank = overrides.rerankEnabled == null ? allowEnhancement : overrides.rerankEnabled;
  const provider = overrides.provider || 'siliconflow';

  return {
    apiKey,
    baseUrl,
    embeddingModel,
    rerankModel,
    rerankInstruction,
    enableEmbedding: Boolean(provider === 'siliconflow' && apiKey && embeddingModel && allowEmbedding),
    enableRerank: Boolean(provider === 'siliconflow' && apiKey && rerankModel && allowRerank),
  };
}

function getSiliconFlowConfig() {
  return buildSiliconFlowConfig(getActiveKnowledgeOverrides());
}

function clampInt(v, fallback, min, max) {
  const n = parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampNum(v, fallback, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeRagRuntimeOverrides(input = {}) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    topicTopN: src.ragTopicTopN ?? src.topicTopN,
    conceptTopN: src.ragConceptTopN ?? src.conceptTopN,
    candidateMultiplier: src.ragFtsCandidateMultiplier ?? src.candidateMultiplier,
    contextMaxChars: src.ragContextMaxChars ?? src.contextMaxChars,
    ftsMinCandidates: src.ragFtsMinCandidates ?? src.ftsMinCandidates,
    showPolishedInChat: src.ragShowPolishedInChat ?? src.showPolishedInChat,
    joinSeparator: src.ragJoinSeparator ?? src.joinSeparator,
    polishEnabled: src.ragPolishEnabled ?? src.polishEnabled,
    polishMaxChars: src.ragPolishMaxChars ?? src.polishMaxChars,
    minRelevanceScore: src.ragMinRelevanceScore ?? src.minRelevanceScore,
  };
}

function getRagRuntimeConfig(overridesInput = {}) {
  const o = { ...getActiveKnowledgeOverrides(), ...normalizeRagRuntimeOverrides(overridesInput) };
  const defaultEmbeddingWeight = 0.85;
  const defaultFtsWeight = 0.15;
  const embeddingWeight = clampNum(o.embeddingWeight, defaultEmbeddingWeight, 0, 1);
  const ftsWeight = clampNum(o.ftsWeight, defaultFtsWeight, 0, 1);
  const hybridSum = embeddingWeight + ftsWeight;
  return {
    topicTopN: clampInt(o.topicTopN, 1, 1, 10),
    conceptTopN: clampInt(o.conceptTopN, 2, 1, 12),
    candidateMultiplier: clampInt(o.candidateMultiplier, 4, 1, 10),
    contextMaxChars: clampInt(o.contextMaxChars, 800, 200, 4000),
    embeddingWeight: hybridSum > 0 ? embeddingWeight / hybridSum : defaultEmbeddingWeight,
    ftsWeight: hybridSum > 0 ? ftsWeight / hybridSum : defaultFtsWeight,
    rerankWeight: clampNum(o.rerankWeight, 0.8, 0, 1),
    polishEnabled: o.polishEnabled == null ? true : Boolean(o.polishEnabled),
    polishMaxChars: clampInt(o.polishMaxChars, 1200, 200, 4000),
    ftsMinCandidates: clampInt(o.ftsMinCandidates, 12, 1, 200),
    showPolishedInChat: Boolean(o.showPolishedInChat),
    joinSeparator: o.joinSeparator === 'double_newline' ? '\n\n' : '\n---\n',
    // Minimum final score to include a chunk in results (0 = no threshold = keep all)
    minRelevanceScore: clampNum(o.minRelevanceScore, 0, 0, 1),
  };
}

function normalizeKnowledgeOverrides(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const toNullableBool = (v) => (typeof v === 'boolean' ? v : null);
  const toTrimmed = (v) => (typeof v === 'string' ? v.trim() : '');
  return {
    provider: toTrimmed(source.provider || source.kb_provider || 'siliconflow') || 'siliconflow',
    enabled: toNullableBool(source.enabled ?? source.kb_enabled),
    embeddingEnabled: toNullableBool(source.embeddingEnabled ?? source.kb_embedding_enabled),
    rerankEnabled: toNullableBool(source.rerankEnabled ?? source.kb_rerank_enabled),
    apiKey: toTrimmed(source.apiKey || source.kb_api_key),
    baseUrl: toTrimmed(source.baseUrl || source.kb_base_url),
    embeddingModel: toTrimmed(source.embeddingModel || source.kb_embedding_model),
    rerankModel: toTrimmed(source.rerankModel || source.kb_rerank_model),
    rerankInstruction: toTrimmed(source.rerankInstruction || source.kb_rerank_instruction),
    topicTopN: source.topicTopN ?? source.kb_topic_top_n,
    conceptTopN: source.conceptTopN ?? source.kb_concept_top_n,
    candidateMultiplier: source.candidateMultiplier ?? source.kb_candidate_multiplier,
    contextMaxChars: source.contextMaxChars ?? source.kb_context_max_chars,
    embeddingWeight: source.embeddingWeight ?? source.kb_embedding_weight,
    ftsWeight: source.ftsWeight ?? source.kb_fts_weight,
    rerankWeight: source.rerankWeight ?? source.kb_rerank_weight,
    polishEnabled: typeof (source.polishEnabled ?? source.kb_polish_enabled) === 'boolean'
      ? Boolean(source.polishEnabled ?? source.kb_polish_enabled)
      : null,
    polishMaxChars: source.polishMaxChars ?? source.kb_polish_max_chars,
    ftsMinCandidates: source.ftsMinCandidates ?? source.kb_fts_min_candidates,
    showPolishedInChat: typeof (source.showPolishedInChat ?? source.kb_show_polished_in_chat) === 'boolean'
      ? Boolean(source.showPolishedInChat ?? source.kb_show_polished_in_chat)
      : null,
    joinSeparator: toTrimmed(source.joinSeparator || source.kb_join_separator),
    minRelevanceScore: source.minRelevanceScore ?? source.kb_min_relevance_score,
  };
}

async function testEmbeddingConnection(overridesInput) {
  const config = buildSiliconFlowConfig(normalizeKnowledgeOverrides(overridesInput || getActiveKnowledgeOverrides()));
  if (!config.enableEmbedding) {
    throw new Error('嵌入模型未启用或配置不完整（请检查 API Key、模型名和开关）');
  }
  await embedTexts(config, ['测试向量化连通性']);
  return {
    ok: true,
    model: config.embeddingModel,
    endpoint: `${config.baseUrl}/embeddings`,
  };
}

async function testRerankConnection(overridesInput) {
  const config = buildSiliconFlowConfig(normalizeKnowledgeOverrides(overridesInput || getActiveKnowledgeOverrides()));
  if (!config.enableRerank) {
    throw new Error('重排模型未启用或配置不完整（请检查 API Key、模型名和开关）');
  }
  const rows = await rerankWithSiliconFlow(
    config,
    '测试重排',
    [{ content: '隋朝建立于581年。' }, { content: '唐朝建立于618年。' }],
    1
  );
  return {
    ok: true,
    model: config.rerankModel,
    endpoint: `${config.baseUrl}/rerank`,
    topResult: rows[0]?.content || '',
  };
}

async function rankChunks(query, candidates, topN, runtimeOverrides = {}) {
  const config = getSiliconFlowConfig();
  const runtime = getRagRuntimeConfig(runtimeOverrides);
  let ranked = deduplicateCandidates(candidates);

  if (config.enableEmbedding) {
    try {
      const [queryVec] = await embedTexts(config, [query]);
      const docVecs = await embedTexts(config, ranked.map(c => c.content));
      ranked = ranked
        .map((c, idx) => {
          const embedScore = cosineSimilarity(queryVec, docVecs[idx]);
          const ftsPrior = 1 / (1 + (c.ftsRank ?? idx));
          const hybridScore = embedScore * runtime.embeddingWeight + ftsPrior * runtime.ftsWeight;
          return { ...c, embedScore, hybridScore };
        })
        .sort((a, b) => b.hybridScore - a.hybridScore);
    } catch (err) {
      console.warn(`[KB] Embedding ranking failed, fallback to FTS: ${err.message}`);
      ranked = ranked.map((c, idx) => ({ ...c, embedScore: null, hybridScore: -(idx + 1) }));
    }
  } else {
    ranked = ranked.map((c, idx) => ({ ...c, embedScore: null, hybridScore: -(idx + 1) }));
  }

  const rerankPoolSize = Math.max(topN * runtime.candidateMultiplier, topN);
  let pool = ranked.slice(0, rerankPoolSize);
  if (config.enableRerank && pool.length > 1) {
    try {
      const reranked = await rerankWithSiliconFlow(config, query, pool, topN);
      if (reranked.length > 0) pool = reranked;
    } catch (err) {
      console.warn(`[KB] Rerank failed, keep embedding/FTS order: ${err.message}`);
    }
  }
  let finalPool = pool.slice(0, topN).map((item, idx) => {
    const rerank = Number(item.rerankScore ?? 0);
    const hybrid = Number(item.hybridScore ?? 0);
    const finalScore = Number.isFinite(item.rerankScore)
      ? rerank * runtime.rerankWeight + hybrid * (1 - runtime.rerankWeight)
      : hybrid;
    return {
      ...item,
      finalScore,
      rank: idx + 1,
    };
  });

  // Apply minimum relevance threshold (only when embedding scoring is active)
  if (runtime.minRelevanceScore > 0 && config.enableEmbedding) {
    const filtered = finalPool.filter(item => Number(item.finalScore) >= runtime.minRelevanceScore);
    // Always keep at least 1 result even if nothing passes threshold
    if (filtered.length > 0) finalPool = filtered;
  }

  return finalPool;
}

async function embedTexts(config, texts) {
  const vectors = new Array(texts.length);
  const uncached = [];

  for (let i = 0; i < texts.length; i++) {
    const text = String(texts[i] || '');
    const key = `${config.embeddingModel}:${hashText(text)}`;
    const cached = embeddingCache.get(key);
    if (cached) vectors[i] = cached;
    else uncached.push({ idx: i, key, text });
  }

  if (uncached.length > 0) {
    const response = await fetch(`${config.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.embeddingModel,
        input: uncached.map(item => item.text),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`embedding API ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = await response.json();
    const rows = Array.isArray(data?.data) ? data.data : [];
    if (rows.length !== uncached.length) {
      throw new Error(`embedding count mismatch: expected=${uncached.length}, got=${rows.length}`);
    }

    for (let i = 0; i < uncached.length; i++) {
      const vector = rows[i]?.embedding;
      if (!Array.isArray(vector) || vector.length === 0) {
        throw new Error('embedding response missing vector');
      }
      const { idx, key } = uncached[i];
      vectors[idx] = vector;
      cacheEmbedding(key, vector);
    }
  }

  return vectors;
}

async function rerankWithSiliconFlow(config, query, candidates, topN) {
  const requestBody = {
    model: config.rerankModel,
    query,
    documents: candidates.map(c => c.content),
    top_n: topN,
    return_documents: false,
  };
  if (config.rerankInstruction) {
    requestBody.instruction = config.rerankInstruction;
  }

  const response = await fetch(`${config.baseUrl}/rerank`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`rerank API ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const rows = Array.isArray(data?.results)
    ? data.results
    : Array.isArray(data?.data)
      ? data.data
      : [];

  const normalized = rows
    .map((r, idx) => ({
      index: Number.isInteger(r?.index) ? r.index : idx,
      score: Number(r?.relevance_score ?? r?.score ?? 0),
    }))
    .filter(r => Number.isInteger(r.index) && r.index >= 0 && r.index < candidates.length)
    .sort((a, b) => b.score - a.score);

  return normalized.map(r => ({ ...candidates[r.index], rerankScore: r.score }));
}

function hashText(text) {
  return crypto.createHash('sha1').update(text).digest('hex');
}

function cacheEmbedding(key, vector) {
  embeddingCache.set(key, vector);
  if (embeddingCache.size > EMBEDDING_CACHE_MAX) {
    const oldestKey = embeddingCache.keys().next().value;
    if (oldestKey) embeddingCache.delete(oldestKey);
  }
}

function deduplicateCandidates(candidates) {
  const seen = new Set();
  const out = [];
  for (const item of candidates) {
    const key = hashText(String(item.content || '').slice(0, 300));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let i = 0; i < a.length; i++) {
    const av = Number(a[i]) || 0;
    const bv = Number(b[i]) || 0;
    dot += av * bv;
    aNorm += av * av;
    bNorm += bv * bv;
  }
  if (aNorm <= 0 || bNorm <= 0) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

// ── AI-Confirmed Knowledge Base ───────────────────────────────────────────────

/**
 * Automatically ingest an AI-validated concept into the knowledge base.
 * Each confirmed concept becomes a small searchable document.
 *
 * @param {object} concept  The validated concept object
 * @param {string} gameId   The game room ID (for traceability)
 */
function ingestAIConfirmedConcept(concept, gameId) {
  if (!concept || !concept.name) return;

  // Build a compact but rich text from the concept fields
  const lines = [
    `【历史概念】${concept.name}`,
    concept.dynasty ? `朝代/时期：${concept.dynasty}` : '',
    concept.period  ? `历史分期：${concept.period}`  : '',
    concept.year != null ? `年份：${concept.year < 0 ? `公元前 ${Math.abs(concept.year)}` : `公元 ${concept.year}`} 年` : '',
    concept.description ? `简介：${concept.description}` : '',
    Array.isArray(concept.tags) && concept.tags.length ? `标签：${concept.tags.join('、')}` : '',
  ].filter(Boolean);

  const content  = lines.join('\n');
  const docId    = uuidv4();
  const title    = concept.name;
  const filename = `ai_confirmed_${concept.id || docId}.txt`;

  const insertAll = db.db.transaction(() => {
    // Insert as 'draft' so new AI-confirmed concepts enter the curation queue
    // rather than going directly to the active knowledge base.
    db.insertDocDraft.run(docId, title, filename, 1, 'ai_confirmed', gameId || null);
    const chunkId = uuidv4();
    db.insertChunk.run(chunkId, docId, 0, content);
    db.insertFTS.run(content, chunkId);
  });

  insertAll();
  return docId;
}

/**
 * List AI-confirmed knowledge base entries.
 */
function listAIConfirmedDocs() {
  return db.listAIConfirmedDocs.all();
}

// ── Local validation (KB-first, no AI needed) ─────────────────────────────────

/**
 * Attempt to validate a concept purely from the local knowledge base.
 * Returns { confident, result } where:
 *   confident=true  → KB has a strong match; result has the full validated data
 *   confident=false → KB match is absent or ambiguous; caller should fall back to AI
 *
 * A "strong match" means an AI-confirmed entry whose title matches the concept
 * name exactly (case-insensitive), giving us year/dynasty/description without AI.
 */
function validateFromKnowledge(rawInput, topic) {
  if (!rawInput) return { confident: false };

  const normalized = rawInput.trim().toLowerCase();

  try {
    // 1. Look for an exact-title match in ai_confirmed docs
    const exactDoc = db.db.prepare(
      `SELECT kd.title, kc.content
         FROM knowledge_docs kd
         JOIN knowledge_chunks kc ON kc.doc_id = kd.id
        WHERE kd.source = 'ai_confirmed'
          AND kd.status = 'active'
          AND LOWER(kd.title) = ?
        LIMIT 1`
    ).get(normalized);

    if (exactDoc) {
      const result = parseKBContent(exactDoc.content, exactDoc.title);
      if (result) {
        return { confident: true, result: { ...result, valid: true } };
      }
    }

    // 2. FTS search — only accept if score is very high (single result, title starts with query)
    const safeQuery = normalizeSearchInput(normalized);
    if (!safeQuery) return { confident: false };

    const rows = db.searchFTSVisible.all(safeQuery, 3);
    if (rows.length === 1) {
      // Only one hit — check if it belongs to an ai_confirmed doc with matching title
      const chunk = db.getChunkById.get(rows[0].chunk_id);
      if (chunk) {
        const docRow = db.db.prepare(
          `SELECT * FROM knowledge_docs WHERE id = ? AND source = 'ai_confirmed' AND status = 'active'`
        ).get(chunk.doc_id);
        if (docRow && docRow.title.toLowerCase().startsWith(normalized)) {
          const result = parseKBContent(chunk.content, docRow.title);
          if (result) return { confident: true, result: { ...result, valid: true } };
        }
      }
    }
  } catch {
    // KB lookup errors are non-fatal
  }

  return { confident: false };
}

/**
 * Parse the compact text format stored by ingestAIConfirmedConcept back into
 * a structured result object.
 */
function parseKBContent(content, title) {
  try {
    const lines = content.split('\n');
    const get = (prefix) => {
      const line = lines.find(l => l.startsWith(prefix));
      return line ? line.slice(prefix.length).trim() : null;
    };

    const dynasty    = get('朝代/时期：');
    const period     = get('历史分期：');
    const yearStr    = get('年份：');
    const description = get('简介：');
    const tagsStr    = get('标签：');

    let year = null;
    if (yearStr) {
      // Format: "公元前 221 年" or "公元 618 年"
      const bcMatch  = yearStr.match(/公元前\s*(\d+)/);
      const adMatch  = yearStr.match(/公元\s*(\d+)/);
      if (bcMatch)  year = -parseInt(bcMatch[1]);
      else if (adMatch) year = parseInt(adMatch[1]);
    }

    const tags = tagsStr ? tagsStr.split('、').filter(Boolean) : [];

    return {
      name: title,
      dynasty: dynasty || null,
      period: period || null,
      year,
      description: description || null,
      tags,
      source: 'kb',
    };
  } catch {
    return null;
  }
}

// ── List ──────────────────────────────────────────────────────────────────────

function listDocuments() {
  return db.listDocs.all();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Auto-detect the best chunking strategy for a given text.
 * Returns 'textbook' if heading patterns are found, 'plain' otherwise.
 */
function detectChunkStrategy(text) {
  const sample = String(text || '').slice(0, 6000);
  // Count textbook-style heading lines
  const lines = sample.split('\n');
  let headingCount = 0;
  for (const line of lines) {
    if (TEXTBOOK_HEADING_RE.test(line.trim())) headingCount++;
  }
  return headingCount >= 2 ? 'textbook' : 'plain';
}

/**
 * Top-level chunker. Dispatches to textbook or plain strategy.
 * @param {string} text
 * @param {number} maxChars
 * @param {string} strategy  'textbook' | 'plain'
 * @param {number} [overlapChars]
 */
function splitIntoChunks(text, maxChars, strategy = 'plain', overlapChars = CHUNK_OVERLAP) {
  if (strategy === 'textbook') {
    return splitIntoChunksTextbook(text, maxChars, overlapChars);
  }
  return splitWithOverlap(text, maxChars, overlapChars);
}

/**
 * Plain chunker: split on paragraph breaks, re-combine respecting maxChars,
 * with trailing overlap between adjacent chunks.
 */
function splitWithOverlap(text, maxChars, overlapChars = CHUNK_OVERLAP) {
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';

  for (const p of paragraphs) {
    if (current && (current.length + p.length + 2) > maxChars) {
      chunks.push(current.trim());
      // Overlap: seed next chunk with tail of the current one
      const tail = current.slice(-overlapChars).trimStart();
      current = tail ? `${tail}\n\n${p}` : p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // Fallback: sliding window with overlap when no paragraph breaks
  if (chunks.length === 0 && text.trim()) {
    const step = Math.max(50, maxChars - overlapChars);
    for (let i = 0; i < text.length; i += step) {
      chunks.push(text.slice(i, i + maxChars));
    }
  }

  return chunks;
}

/**
 * Parse text into sections delimited by textbook-style heading lines.
 * Returns [{ heading, body }] where heading may be '' for pre-heading content.
 */
function splitOnHeadings(text) {
  const lines = text.split('\n');
  const sections = [];
  let currentHeading = '';
  let currentLines = [];

  for (const line of lines) {
    if (TEXTBOOK_HEADING_RE.test(line.trim()) && line.trim()) {
      // Flush previous section
      const body = currentLines.join('\n').trim();
      if (currentHeading || body) {
        sections.push({ heading: currentHeading, body });
      }
      currentHeading = line.trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  // Flush last section
  const body = currentLines.join('\n').trim();
  if (currentHeading || body) sections.push({ heading: currentHeading, body });

  return sections.filter(s => s.heading || s.body);
}

/**
 * Textbook-aware chunker.
 * Splits on heading lines; each chunk starts with its section heading for context.
 * Long sections are sub-split with paragraph overlap, heading repeated as prefix.
 */
function splitIntoChunksTextbook(text, maxChars, overlapChars = CHUNK_OVERLAP) {
  const sections = splitOnHeadings(text);

  // Fewer than 2 sections means headings weren't found — fall back
  if (sections.length < 2) {
    return splitWithOverlap(text, maxChars, overlapChars);
  }

  const chunks = [];

  for (const { heading, body } of sections) {
    const prefix = heading ? `${heading}\n` : '';
    const sectionText = (prefix + body).trim();

    if (!sectionText) continue;

    if (sectionText.length <= maxChars) {
      chunks.push(sectionText);
    } else {
      // Section too long: sub-split the body, repeating the heading as context prefix
      const bodyBudget = maxChars - prefix.length;
      const subChunks = splitWithOverlap(body, Math.max(100, bodyBudget), overlapChars);
      for (const sub of subChunks) {
        chunks.push((prefix + sub).trim());
      }
    }
  }

  return chunks.filter(Boolean);
}

module.exports = {
  ingestDocument,
  deleteDocument,
  searchContext,
  getContextForConcept,
  searchContextAdvanced,
  searchContextAdvancedWithTrace,
  getContextForConceptAdvanced,
  getContextForConceptAdvancedWithTrace,
  getRagRuntimeConfig,
  listDocuments,
  vectorizeDocument,
  testEmbeddingConnection,
  testRerankConnection,
  ingestAIConfirmedConcept,
  listAIConfirmedDocs,
  validateFromKnowledge,
  parseKBContent,
  detectChunkStrategy,
};
