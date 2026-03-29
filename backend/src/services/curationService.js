/**
 * Curation Service — manage knowledge base concepts lifecycle:
 * approve, edit, reject, merge, categorize.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { deleteDocument } = require('./knowledgeService');

/**
 * Get pending (draft) auto-ingested concepts awaiting curation.
 * @param {number} limit
 */
function getPendingIngestions(limit = 50) {
  return db.listKBDocsByStatus.all('draft', '').slice(0, limit).map(d => ({
    ...d,
    categories: db.getConceptCategories.all(d.id),
  }));
}

/**
 * Get all active knowledge base concepts (ai_confirmed).
 */
function getActiveConcepts(status = 'active') {
  return db.listKBDocsByStatus.all(status, status).map(d => ({
    ...d,
    categories: db.getConceptCategories.all(d.id),
  }));
}

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
 * Update the title/filename of a knowledge doc (lightweight edit).
 * For full content update, delete + re-upload is required.
 * @param {string} docId
 * @param {object} patches - { title? }
 */
function editConcept(docId, patches = {}) {
  const doc = db.getDoc.get(docId);
  if (!doc) throw new Error('文档不存在');
  const newTitle = patches.title ? String(patches.title).slice(0, 200) : doc.title;
  db.db.prepare(`UPDATE knowledge_docs SET title=? WHERE id=?`).run(newTitle, docId);
  console.log(`[Curation] Edited doc id=${docId} newTitle="${newTitle}"`);
  return { ok: true };
}

/**
 * Assign a knowledge concept to a category.
 * @param {string} docId
 * @param {string} categoryId
 */
function assignCategory(docId, categoryId) {
  db.assignConceptToCategory.run(docId, categoryId);
  return { ok: true };
}

/**
 * Remove a knowledge concept from a category.
 * @param {string} docId
 * @param {string} categoryId
 */
function removeFromCategory(docId, categoryId) {
  db.removeConceptFromCategory.run(docId, categoryId);
  return { ok: true };
}

/**
 * List all concept categories.
 */
function listCategories() {
  return db.listCategories.all();
}

/**
 * Create a new category.
 * @param {string} name
 * @param {string} color
 * @param {number} sortOrder
 */
function createCategory(name, color = '#6366f1', sortOrder = 0) {
  const id = uuidv4();
  db.insertCategory.run(id, name, color, sortOrder);
  return { id, name, color, sortOrder };
}

/**
 * Delete a category (does not delete associated concepts).
 * @param {string} categoryId
 */
function deleteCategory(categoryId) {
  db.deleteCategory.run(categoryId);
  return { ok: true };
}

/**
 * Bulk approve all pending (draft) concepts.
 */
function approveAll() {
  const pending = getPendingIngestions(500);
  for (const doc of pending) {
    try {
      approveConcept(doc.id);
    } catch { /* non-fatal */ }
  }
  return { approved: pending.length };
}

module.exports = {
  getPendingIngestions,
  getActiveConcepts,
  approveConcept,
  archiveConcept,
  rejectConcept,
  editConcept,
  assignCategory,
  removeFromCategory,
  listCategories,
  createCategory,
  deleteCategory,
  approveAll,
};
