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

module.exports = { ingestDocument, deleteDocument, searchContext, getContextForConcept, listDocuments };
