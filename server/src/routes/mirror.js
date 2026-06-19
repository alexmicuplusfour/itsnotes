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

module.exports = router;
