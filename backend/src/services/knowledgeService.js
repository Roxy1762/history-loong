/**
 * Knowledge Base Service
 * Ingests documents into SQLite FTS5 and retrieves relevant context
 * for AI prompts.
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('../db');

const CHUNK_SIZE = 400; // characters per chunk
const DEFAULT_SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1';
const EMBEDDING_CACHE_MAX = Math.max(100, parseInt(process.env.KB_EMBED_CACHE_MAX || '2000', 10) || 2000);
const embeddingCache = new Map();

// ── Ingest ────────────────────────────────────────────────────────────────────

/**
 * Ingest a text document into the knowledge base.
 * @param {string} title    Display name
 * @param {string} filename Original filename
 * @param {string} content  Full text content
 * @returns {{ docId, chunks }}
 */
function ingestDocument(title, filename, content) {
  const docId = uuidv4();
  const chunks = splitIntoChunks(content, CHUNK_SIZE);

  // Transaction for atomicity
  const insertAll = db.db.transaction(() => {
    db.insertDoc.run(docId, title, filename, chunks.length);

    for (let i = 0; i < chunks.length; i++) {
      const chunkId = uuidv4();
      db.insertChunk.run(chunkId, docId, i, chunks[i]);
      db.insertFTS.run(chunks[i], chunkId);
    }
  });

  insertAll();
  return { docId, chunks: chunks.length };
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
    const safeQuery = query.replace(/['"*()]/g, ' ').trim();
    if (!safeQuery) return '';

    const rows = db.searchFTS.all(safeQuery, topN);
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
  if (!query) return '';
  try {
    const candidates = searchChunksByFTS(query, Math.max(12, topN * 4));
    if (!candidates.length) return '';
    const ranked = await rankChunks(query, candidates, topN);
    const texts = ranked.map(r => r.content).filter(Boolean);
    return texts.join('\n---\n');
  } catch {
    return searchContext(query, topN);
  }
}

/**
 * Advanced combined context for a concept submission.
 */
async function getContextForConceptAdvanced(concept, topic) {
  const [byTopic, byConcept] = await Promise.all([
    searchContextAdvanced(topic, 1),
    searchContextAdvanced(concept, 2),
  ]);
  const combined = [byTopic, byConcept].filter(Boolean).join('\n---\n');
  return combined ? combined.slice(0, 800) : '';
}

function searchChunksByFTS(query, limit = 20) {
  const safeQuery = String(query || '').replace(/['"*()]/g, ' ').trim();
  if (!safeQuery) return [];

  const rows = db.searchFTS.all(safeQuery, limit);
  if (!rows.length) return [];

  return rows
    .map((r, idx) => {
      const chunk = db.getChunkById.get(r.chunk_id);
      if (!chunk || !chunk.content) return null;
      return { chunk_id: r.chunk_id, content: chunk.content, ftsRank: idx };
    })
    .filter(Boolean);
}

function getActiveKnowledgeOverrides() {
  try {
    const row = db.getActiveAIConfig.get();
    if (!row) return {};
    const extra = JSON.parse(row.extra || '{}');
    return {
      provider: typeof extra.kb_provider === 'string' ? extra.kb_provider.trim() : '',
      enabled: typeof extra.kb_enabled === 'boolean' ? extra.kb_enabled : null,
      apiKey: typeof extra.kb_api_key === 'string' ? extra.kb_api_key.trim() : '',
      baseUrl: typeof extra.kb_base_url === 'string' ? extra.kb_base_url.trim() : '',
      embeddingModel: typeof extra.kb_embedding_model === 'string' ? extra.kb_embedding_model.trim() : '',
      rerankModel: typeof extra.kb_rerank_model === 'string' ? extra.kb_rerank_model.trim() : '',
      rerankInstruction: typeof extra.kb_rerank_instruction === 'string' ? extra.kb_rerank_instruction.trim() : '',
    };
  } catch {
    return {};
  }
}

function getSiliconFlowConfig() {
  const overrides = getActiveKnowledgeOverrides();
  const apiKey = overrides.apiKey || process.env.SILICONFLOW_API_KEY || '';
  const baseUrl = (overrides.baseUrl || process.env.SILICONFLOW_BASE_URL || DEFAULT_SILICONFLOW_BASE_URL).replace(/\/$/, '');
  const embeddingModel = overrides.embeddingModel || process.env.SILICONFLOW_EMBED_MODEL || '';
  const rerankModel = overrides.rerankModel || process.env.SILICONFLOW_RERANK_MODEL || '';
  const rerankInstruction = overrides.rerankInstruction || process.env.SILICONFLOW_RERANK_INSTRUCTION || '';
  const enabledByEnv = String(process.env.KB_USE_SILICONFLOW || '').toLowerCase();
  const allowEnhancement = overrides.enabled == null
    ? enabledByEnv !== '0' && enabledByEnv !== 'false'
    : overrides.enabled;
  const provider = overrides.provider || 'siliconflow';

  return {
    apiKey,
    baseUrl,
    embeddingModel,
    rerankModel,
    rerankInstruction,
    enableEmbedding: Boolean(provider === 'siliconflow' && apiKey && embeddingModel && allowEnhancement),
    enableRerank: Boolean(provider === 'siliconflow' && apiKey && rerankModel && allowEnhancement),
  };
}

async function rankChunks(query, candidates, topN) {
  const config = getSiliconFlowConfig();
  let ranked = candidates.slice();

  if (config.enableEmbedding) {
    try {
      const [queryVec] = await embedTexts(config, [query]);
      const docVecs = await embedTexts(config, ranked.map(c => c.content));
      ranked = ranked
        .map((c, idx) => ({ ...c, score: cosineSimilarity(queryVec, docVecs[idx]) }))
        .sort((a, b) => b.score - a.score);
    } catch (err) {
      console.warn(`[KB] Embedding ranking failed, fallback to FTS: ${err.message}`);
      ranked = ranked.map((c, idx) => ({ ...c, score: -idx }));
    }
  } else {
    ranked = ranked.map((c, idx) => ({ ...c, score: -idx }));
  }

  const rerankPoolSize = Math.max(topN * 4, topN);
  let pool = ranked.slice(0, rerankPoolSize);
  if (config.enableRerank && pool.length > 1) {
    try {
      const reranked = await rerankWithSiliconFlow(config, query, pool, topN);
      if (reranked.length > 0) pool = reranked;
    } catch (err) {
      console.warn(`[KB] Rerank failed, keep embedding/FTS order: ${err.message}`);
    }
  }
  return pool.slice(0, topN);
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
    const safeQuery = normalized.replace(/['"*()]/g, ' ').trim();
    if (!safeQuery) return { confident: false };

    const rows = db.searchFTS.all(safeQuery, 3);
    if (rows.length === 1) {
      // Only one hit — check if it belongs to an ai_confirmed doc with matching title
      const chunk = db.getChunkById.get(rows[0].chunk_id);
      if (chunk) {
        const docRow = db.db.prepare(
          `SELECT * FROM knowledge_docs WHERE id = ? AND source = 'ai_confirmed'`
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

function splitIntoChunks(text, maxChars) {
  // Split on double newlines (paragraphs), then re-combine respecting maxChars
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';

  for (const p of paragraphs) {
    if (current && (current.length + p.length + 2) > maxChars) {
      chunks.push(current.trim());
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // If no paragraph breaks, fall back to sliding window
  if (chunks.length === 0 && text.trim()) {
    for (let i = 0; i < text.length; i += maxChars) {
      chunks.push(text.slice(i, i + maxChars));
    }
  }

  return chunks;
}

module.exports = {
  ingestDocument,
  deleteDocument,
  searchContext,
  getContextForConcept,
  searchContextAdvanced,
  getContextForConceptAdvanced,
  listDocuments,
  vectorizeDocument,
  ingestAIConfirmedConcept,
  listAIConfirmedDocs,
  validateFromKnowledge,
  parseKBContent,
};
