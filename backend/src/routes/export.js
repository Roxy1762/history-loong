const express = require('express');
const db = require('../db');
const { ExportService } = require('../services/exportService');
const { TimelineService } = require('../services/timelineService');

const router = express.Router();
const exportService = new ExportService();

// GET /api/export/:gameId?format=json|markdown|csv
router.get('/:gameId', (req, res) => {
  const gameId = req.params.gameId.toUpperCase();
  const format = req.query.format || 'json';

  const game = db.getGame.get(gameId);
  if (!game) return res.status(404).json({ error: '房间不存在' });
  game.settings = JSON.parse(game.settings || '{}');

  const conceptRows = db.getConceptsByGame.all(gameId);
  const messageRows = db.getMessagesByGame.all(gameId);

  const ts = new TimelineService();
  const timeline = ts.buildTimeline(conceptRows);
  const messages = messageRows.map((m) => ({ ...m, meta: JSON.parse(m.meta || '{}') }));

  try {
    const result = exportService.export({ game, timeline, messages }, format);
    res.setHeader('Content-Type', result.mimeType + '; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/export/formats — list supported formats
router.get('/formats/list', (_req, res) => {
  res.json({ formats: exportService.listFormats() });
});

module.exports = router;
