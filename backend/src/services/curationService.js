/**
 * Curation Service — manage knowledge base concepts lifecycle:
 * approve, edit, reject, merge, categorize.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { deleteDocument, parseKBContent } = require('./knowledgeService');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Read the first chunk of a doc and parse its structured content.
 * @param {object} doc - knowledge_docs row
 */
function enrichWithContent(doc) {
  const chunk = db.db.prepare(
    `SELECT content FROM knowledge_chunks WHERE doc_id = ? LIMIT 1`
  ).get(doc.id);
  const parsed = chunk ? parseKBContent(chunk.content, doc.title) : null;
  return {
    ...doc,
    categories:  db.getConceptCategories.all(doc.id),
    dynasty:     parsed?.dynasty     ?? null,
    period:      parsed?.period      ?? null,
    year:        parsed?.year        ?? null,
    description: parsed?.description ?? null,
    tags:        parsed?.tags        ?? [],
    rag_content: doc.rag_content     ?? null,
  };
}

/**
 * Regenerate the compact text stored in a concept's chunk from structured fields.
 * Mirrors the format used by ingestAIConfirmedConcept.
 */
function buildContent({ name, dynasty, period, year, description, tags }) {
  const lines = [
    `【历史概念】${name}`,
    dynasty     ? `朝代/时期：${dynasty}`   : '',
    period      ? `历史分期：${period}`     : '',
    year != null ? `年份：${year < 0 ? `公元前 ${Math.abs(year)}` : `公元 ${year}`} 年` : '',
    description ? `简介：${description}`   : '',
    Array.isArray(tags) && tags.length ? `标签：${tags.join('、')}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Get pending (draft) auto-ingested concepts awaiting curation.
 * @param {number} limit
 */
function getPendingIngestions(limit = 100) {
  // Use (status=? AND ?=?) form so only draft docs are returned
  const rows = db.db.prepare(
    `SELECT * FROM knowledge_docs WHERE source='ai_confirmed' AND status='draft' ORDER BY created_at DESC LIMIT ?`
  ).all(limit);
  return rows.map(enrichWithContent);
}

/**
 * Get knowledge base concepts by status.
 * @param {'active'|'archived'} status
 */
function getActiveConcepts(status = 'active') {
  const rows = db.db.prepare(
    `SELECT * FROM knowledge_docs WHERE source='ai_confirmed' AND status=? ORDER BY created_at DESC LIMIT 200`
  ).all(status);
  return rows.map(enrichWithContent);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * Approve a draft concept — move to active status.
 * @param {string} docId
 */
function approveConcept(docId) {
  const doc = db.getDoc.get(docId);
  if (!doc) throw new Error('文档不存在');
  db.updateKBDocStatus.run('active', docId);
  console.log(`[Curation] Approved doc id=${docId} title="${doc.title}"`);
  return { ok: true };
}

/**
 * Archive (soft-delete) a concept — keeps it in DB but hidden from KB search.
 * @param {string} docId
 */
function archiveConcept(docId) {
  const doc = db.getDoc.get(docId);
  if (!doc) throw new Error('文档不存在');
  db.updateKBDocStatus.run('archived', docId);
  console.log(`[Curation] Archived doc id=${docId} title="${doc.title}"`);
  return { ok: true };
}

/**
 * Permanently delete a knowledge base concept.
 * @param {string} docId
 */
function rejectConcept(docId) {
  const doc = db.getDoc.get(docId);
  if (!doc) throw new Error('文档不存在');
  deleteDocument(docId);
  console.log(`[Curation] Deleted doc id=${docId} title="${doc.title}"`);
  return { ok: true };
}

/**
 * Edit a knowledge base concept's metadata and regenerate its chunk content.
 * Supports: title (name), dynasty, period, year, description, tags.
 * @param {string} docId
 * @param {object} patches
 */
function editConcept(docId, patches = {}) {
  const doc = db.getDoc.get(docId);
  if (!doc) throw new Error('文档不存在');

  const newTitle = patches.title ? String(patches.title).slice(0, 200) : doc.title;
  db.db.prepare(`UPDATE knowledge_docs SET title=? WHERE id=?`).run(newTitle, docId);

  // Handle rag_content update
  if ('rag_content' in patches) {
    const ragVal = patches.rag_content != null ? String(patches.rag_content) : null;
    db.db.prepare(`UPDATE knowledge_docs SET rag_content=? WHERE id=?`).run(ragVal, docId);
  }

  // If any content fields are present, regenerate the chunk
  const contentKeys = ['dynasty', 'period', 'year', 'description', 'tags'];
  const hasContentChange = contentKeys.some(k => k in patches);

  if (hasContentChange) {
    const chunk = db.db.prepare(
      `SELECT * FROM knowledge_chunks WHERE doc_id = ? LIMIT 1`
    ).get(docId);

    if (chunk) {
      const current = parseKBContent(chunk.content, doc.title) || {};
      const updated = {
        name:        newTitle,
        dynasty:     'dynasty'     in patches ? patches.dynasty     : (current.dynasty     ?? null),
        period:      'period'      in patches ? patches.period      : (current.period      ?? null),
        year:        'year'        in patches ? patches.year        : (current.year        ?? null),
        description: 'description' in patches ? patches.description : (current.description ?? null),
        tags:        'tags'        in patches ? patches.tags        : (current.tags        ?? []),
      };

      const newContent = buildContent(updated);
      db.db.prepare(`UPDATE knowledge_chunks SET content=? WHERE id=?`).run(newContent, chunk.id);
      db.db.prepare(`DELETE FROM knowledge_fts WHERE chunk_id=?`).run(chunk.id);
      db.insertFTS.run(newContent, chunk.id);
    }
  }

  console.log(`[Curation] Edited doc id=${docId} newTitle="${newTitle}"`);
  return { ok: true };
}

// ── Merge ─────────────────────────────────────────────────────────────────────

/**
 * Merge duplicate concepts: keep one doc, permanently delete the others.
 * @param {string} keepId   - ID of the doc to retain
 * @param {string[]} mergeIds - IDs of docs to delete (must not include keepId)
 */
function mergeConcepts(keepId, mergeIds) {
  if (!keepId) throw new Error('请提供 keepId');
  if (!Array.isArray(mergeIds) || mergeIds.length === 0) throw new Error('请提供要合并的文档列表');

  const keepDoc = db.getDoc.get(keepId);
  if (!keepDoc) throw new Error('保留文档不存在');

  let deleted = 0;
  for (const id of mergeIds) {
    if (id === keepId) continue;
    try {
      deleteDocument(id);
      deleted++;
    } catch (e) {
      console.warn(`[Curation] Merge: could not delete doc id=${id}: ${e.message}`);
    }
  }

  console.log(`[Curation] Merged ${deleted} doc(s) into id=${keepId} title="${keepDoc.title}"`);
  return { ok: true, kept: keepId, deleted };
}

// ── Categories ────────────────────────────────────────────────────────────────

function assignCategory(docId, categoryId) {
  db.assignConceptToCategory.run(docId, categoryId);
  return { ok: true };
}

function removeFromCategory(docId, categoryId) {
  db.removeConceptFromCategory.run(docId, categoryId);
  return { ok: true };
}

function listCategories() {
  return db.listCategories.all();
}

function createCategory(name, color = '#6366f1', sortOrder = 0) {
  const id = uuidv4();
  db.insertCategory.run(id, name, color, sortOrder);
  return { id, name, color, sort_order: sortOrder };
}

function deleteCategory(categoryId) {
  db.deleteCategory.run(categoryId);
  return { ok: true };
}

// ── Batch ─────────────────────────────────────────────────────────────────────

/**
 * Bulk approve all pending (draft) concepts.
 */
function approveAll() {
  const pending = getPendingIngestions(500);
  let approved = 0;
  for (const doc of pending) {
    try {
      approveConcept(doc.id);
      approved++;
    } catch { /* non-fatal */ }
  }
  return { approved };
}

module.exports = {
  getPendingIngestions,
  getActiveConcepts,
  approveConcept,
  archiveConcept,
  rejectConcept,
  editConcept,
  mergeConcepts,
  assignCategory,
  removeFromCategory,
  listCategories,
  createCategory,
  deleteCategory,
  approveAll,
};
