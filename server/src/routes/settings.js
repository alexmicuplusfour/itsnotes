const express = require('express');
const axios = require('axios');
const router = express.Router();
const settingsService = require('../services/settings');
const backupScheduler = require('../services/backupScheduler');
const { blockInDemo } = require('../middleware/demoGuard');

// Get all settings
router.get('/', async (req, res) => {
  try {
    const settings = await settingsService.getAll();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ message: 'Error fetching settings', error: error.message });
  }
});

// Update settings
router.post('/', async (req, res) => {
  try {
    const settings = req.body;
    console.log('Settings POST received:', JSON.stringify(settings, null, 2));
    const updatedSettings = await settingsService.update(settings);
    console.log('Settings updated, returning:', JSON.stringify(updatedSettings, null, 2));

    const backupKeys = ['AUTO_BACKUP_ENABLED', 'AUTO_BACKUP_INTERVAL_HOURS', 'AUTO_BACKUP_RETENTION_COUNT'];
    if (backupKeys.some(k => k in settings)) {
      backupScheduler.restart();
    }

    res.json(updatedSettings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ message: 'Error updating settings', error: error.message });
  }
});

// --- Notification service tests ---------------------------------------------
// Send a one-off "it works" notification so users can verify their credentials
// before relying on them for reminders. Each tester accepts the values from the
// settings form (which may not be saved yet) and falls back to the saved env.
const TEST_TITLE = 'itsnotes';
const TEST_MESSAGE = '✅ Test notification from itsnotes — your settings work!';
const HTTP_OPTS = { timeout: 10000 };

async function testPushover(cfg) {
  const user = (cfg.user || process.env.PUSHOVER_USER || '').trim();
  const token = (cfg.token || process.env.PUSHOVER_TOKEN || '').trim();
  if (!user || !token) return { ok: false, message: 'Enter both a User Key and an API Token first.' };
  try {
    const res = await axios.post('https://api.pushover.net/1/messages.json', {
      token, user, message: TEST_MESSAGE, title: TEST_TITLE,
    }, HTTP_OPTS);
    if (res.data && res.data.status === 1) return { ok: true };
    return { ok: false, message: (res.data && res.data.errors || ['Pushover rejected the request.']).join(' ') };
  } catch (e) {
    const errs = e.response && e.response.data && e.response.data.errors;
    return { ok: false, message: errs ? errs.join(' ') : (e.message || 'Could not reach Pushover.') };
  }
}

async function testPushbullet(cfg) {
  const token = (cfg.token || process.env.PUSHBULLET_TOKEN || '').trim();
  if (!token) return { ok: false, message: 'Enter an Access Token first.' };
  try {
    await axios.post('https://api.pushbullet.com/v2/pushes',
      { type: 'note', title: TEST_TITLE, body: TEST_MESSAGE },
      { ...HTTP_OPTS, headers: { 'Access-Token': token } });
    return { ok: true };
  } catch (e) {
    const apiMsg = e.response && e.response.data && e.response.data.error && e.response.data.error.message;
    if (apiMsg) return { ok: false, message: apiMsg };
    if (e.response && e.response.status === 401) return { ok: false, message: 'Invalid access token.' };
    return { ok: false, message: e.message || 'Could not reach Pushbullet.' };
  }
}

async function testNtfy(cfg) {
  const server = (cfg.server || process.env.NTFY_SERVER || '').trim().replace(/\/+$/, '');
  // Mirror the scheduler: an unset topic falls back to the default.
  const topic = (cfg.topic || process.env.NTFY_TOPIC || 'itsnotes-reminders').trim();
  if (!server) return { ok: false, message: 'Enter a Server URL first.' };
  try {
    await axios.post(`${server}/${topic}`, TEST_MESSAGE, {
      ...HTTP_OPTS, headers: { Title: TEST_TITLE, Priority: '3' },
    });
    return { ok: true };
  } catch (e) {
    const apiMsg = e.response && e.response.data && e.response.data.error;
    return { ok: false, message: apiMsg || e.message || 'Could not reach the ntfy server.' };
  }
}

const NOTIFICATION_TESTERS = {
  pushover: testPushover,
  pushbullet: testPushbullet,
  ntfy: testNtfy,
};

// Check whether a proxy agent is currently connected.
router.get('/proxy-status', (req, res) => {
  const proxyHub = require('../services/proxyHub');
  res.json({ connected: proxyHub.isConnected() });
});

// Reset and re-fetch all link previews in-process (so the live proxyHub is used).
router.post('/refetch-link-previews', blockInDemo, async (req, res) => {
  const { backfillLinkPreviews } = require('../scripts/backfill-link-previews');
  const db = require('../db');
  const fs = require('fs');
  const path = require('path');

  try {
    await db.query('DELETE FROM note_links');
    const linksDir = path.join(__dirname, '../../uploads/links');
    if (fs.existsSync(linksDir)) {
      for (const file of fs.readdirSync(linksDir)) {
        fs.unlinkSync(path.join(linksDir, file));
      }
    }
    res.json({ ok: true, message: 'Reset done. Refetch running in background.' });
    const io = req.app.get('io');
    backfillLinkPreviews(io).catch(err =>
      console.error('[refetch-link-previews] Failed:', err.message)
    );
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// Send a test notification for a single service.
router.post('/test-notification', blockInDemo, async (req, res) => {
  const { service, config = {} } = req.body || {};
  const tester = NOTIFICATION_TESTERS[service];
  if (!tester) return res.status(400).json({ ok: false, message: 'Unknown notification service.' });
  try {
    const result = await tester(config);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    console.error(`Notification test failed for ${service}:`, error);
    res.status(500).json({ ok: false, message: 'Test failed unexpectedly.' });
  }
});

module.exports = router;
