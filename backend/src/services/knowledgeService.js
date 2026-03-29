/**
 * Knowledge Base Service
 * Ingests documents into SQLite FTS5 and retrieves relevant context
 * for AI prompts. No vector embeddings required.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const CHUNK_SIZE = 400; // characters per chunk

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

module.exports = { ingestDocument, deleteDocument, searchContext, getContextForConcept, listDocuments, ingestAIConfirmedConcept, listAIConfirmedDocs, validateFromKnowledge, parseKBContent };
