const express = require('express');
const router = express.Router();
const settingsService = require('../services/settings');
const backupScheduler = require('../services/backupScheduler');

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

module.exports = router;
