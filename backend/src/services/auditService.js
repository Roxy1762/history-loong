/**
 * Audit Service — logs AI validation decisions and handles admin overrides.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db');

/**
 * Log an AI or KB validation decision for a concept.
 * @param {string} conceptId
 * @param {string} gameId
 * @param {'ai'|'kb'|'cache'} method
 * @param {object} opts - { prompt, response, provider, model, ms }
 */
function logDecision(conceptId, gameId, method, opts = {}) {
  try {
    const id = uuidv4();
    db.insertAIDecision.run(
      id,
      conceptId,
      gameId,
      method,
      opts.prompt || null,
      opts.response || null,
      opts.provider || null,
      opts.model || null,
      opts.ms || null
    );
  } catch (err) {
    console.warn(`[Audit] logDecision failed (non-fatal): ${err.message}`);
  }
}

/**
 * Get the decision record for a concept.
 */
function getDecision(conceptId) {
  return db.getAIDecision.get(conceptId) || null;
}

/**
 * List recent decisions, optionally filtered.
 * @param {{ gameId?, method?, outcome? }} filters
 */
function listDecisions(filters = {}) {
  let rows;
  if (filters.gameId) {
    rows = db.listAIDecisionsByGame.all(filters.gameId);
  } else {
    rows = db.listAIDecisions.all();
  }

  if (filters.method) {
    rows = rows.filter(r => r.validation_method === filters.method);
  }
  if (filters.outcome === 'accepted') {
    rows = rows.filter(r => r.validated === 1);
  } else if (filters.outcome === 'rejected') {
    rows = rows.filter(r => r.rejected === 1);
  }

  return rows;
}

/**
 * Override a concept's accept/reject decision.
 * @param {string} conceptId
 * @param {'accepted'|'rejected'} newDecision
 * @param {string} reason
 */
function overrideConcept(conceptId, newDecision, reason) {
  const concept = db.getConcept.get(conceptId);
  if (!concept) throw new Error('概念不存在');

  const originalDecision = concept.validated ? 'accepted' : 'rejected';

  db.insertConceptOverride.run(
    conceptId,
    originalDecision,
    newDecision,
    reason || null
  );

  if (newDecision === 'accepted') {
    db.acceptConcept.run(
      concept.name || concept.raw_input,
      concept.period || null,
      concept.year ?? null,
      concept.dynasty || null,
      concept.description || null,
      concept.tags || '[]',
      concept.extra || '{}',
      conceptId
    );
  } else {
    db.rejectConcept.run(reason || '管理员驳回', conceptId);
  }

  // Log override decision
  logDecision(conceptId, concept.game_id, 'admin_override', {
    response: JSON.stringify({ decision: newDecision, reason }),
  });

  return { ok: true, originalDecision, newDecision };
}

/**
 * Get override info for a concept (if any).
 */
function getOverride(conceptId) {
  return db.getConceptOverride.get(conceptId) || null;
}

module.exports = { logDecision, getDecision, listDecisions, overrideConcept, getOverride };
