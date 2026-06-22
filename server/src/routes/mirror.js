const express = require('express');
const mirrorWorker = require('../mirror/mirrorWorker');

const router = express.Router();

// Current mirror state for the Settings UI.
router.get('/status', async (req, res) => {
  try {
    res.json(await mirrorWorker.getStatus());
  } catch (error) {
    console.error('[md-mirror] status failed:', error);
    res.status(500).json({ message: 'Failed to read mirror status', error: error.message });
  }
});

// Trigger an immediate reconcile sweep, then return the refreshed status.
router.post('/sync', async (req, res) => {
  try {
    const result = await mirrorWorker.runOnce();
    const status = await mirrorWorker.getStatus();
    res.json({ result, status });
  } catch (error) {
    console.error('[md-mirror] manual sync failed:', error);
    res.status(500).json({ message: 'Mirror sync failed', error: error.message });
  }
});

// Read-only dry run: classify on-disk files against the DB without changing anything.
router.post('/import/preview', async (req, res) => {
  try {
    res.json(await mirrorWorker.previewImport());
  } catch (error) {
    console.error('[md-mirror] import preview failed:', error);
    res.status(500).json({ message: 'Import preview failed', error: error.message });
  }
});

// Apply the import (writes to the DB), then return the result counts + fresh status.
router.post('/import/apply', async (req, res) => {
  try {
    const result = await mirrorWorker.applyImport();
    await mirrorWorker.broadcastImportResult(result);
    const status = await mirrorWorker.getStatus();
    res.json({ result, status });
  } catch (error) {
    console.error('[md-mirror] import apply failed:', error);
    res.status(500).json({ message: 'Import apply failed', error: error.message });
  }
});

module.exports = router;
