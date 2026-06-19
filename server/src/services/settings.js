const db = require('../db');

const KNOWN_KEYS = [
  'AI_ENABLED',
  'MCP_ENABLED',
  'AI_PROVIDER',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'PUSHOVER_USER',
  'PUSHOVER_TOKEN',
  'PUSHBULLET_TOKEN',
  'NTFY_SERVER',
  'NTFY_TOPIC',
  'PUPPETEER_EXECUTABLE_PATH',
  'TMDB_API_KEY',
  'FOXIT_ENABLED',
  'FOXIT_SNOOPER_URL',
  'FOXIT_SNOOPER_TOKEN',
  'AUTO_TAGGING_SETTINGS',
  'COLOR_LABELS',
  'BACKGROUND_ENABLED',
  'CACHE_MAX_SIZE',
  'PREFETCH_BATCH_SIZE',
  'BATCH_DELAY_MS',
  'CACHE_TTL_MS',
  'PAGE_SIZE',
  'AI_PROMPT_SUMMARIZE',
  'AI_PROMPT_OCR',
  'AI_PROMPT_REMINDER',
  'AI_PROMPT_AUTO_TAG',
  'AI_PROMPT_SUMMARIZE_CUSTOM',
  'AI_PROMPT_OCR_CUSTOM',
  'AI_PROMPT_REMINDER_CUSTOM',
  'AI_PROMPT_AUTO_TAG_CUSTOM',
  'AI_MODEL_SUMMARIZE',
  'AI_MODEL_OCR',
  'AI_MODEL_REMINDER',
  'AI_MODEL_AUTO_TAG',
  'AUTO_BACKUP_ENABLED',
  'AUTO_BACKUP_INTERVAL_HOURS',
  'AUTO_BACKUP_RETENTION_COUNT',
  'MD_MIRROR_ENABLED',
  'MD_MIRROR_PATH'
];

class SettingsService {
  async init() {
    try {
      const result = await db.query('SELECT key, value FROM settings');
      result.rows.forEach(row => {
        // JWT_SECRET is owned by ensureJwtSecret() — don't clobber an explicit .env value
        if (row.key === 'JWT_SECRET') return;
        if (row.value) {
          process.env[row.key] = row.value;
        }
      });
      console.log('SettingsService: Loaded settings from database');
    } catch (error) {
      console.error('SettingsService: Error loading settings:', error);
    }
  }

  async getAll() {
    const settings = {};
    KNOWN_KEYS.forEach(key => {
      settings[key] = process.env[key] || '';
    });
    return settings;
  }

  async update(settings) {
    console.log('SettingsService.update called with:', JSON.stringify(settings, null, 2));
    console.log('KNOWN_KEYS:', KNOWN_KEYS);
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      
      for (const [key, value] of Object.entries(settings)) {
        console.log(`Processing key: ${key}, value: ${value}, is known: ${KNOWN_KEYS.includes(key)}`);
        if (KNOWN_KEYS.includes(key)) {
          // Update process.env
          if (value) {
            process.env[key] = value;
          } else {
            delete process.env[key];
          }

          // Update DB
          console.log(`Inserting/updating DB: ${key} = ${value}`);
          await client.query(
            `INSERT INTO settings (key, value) 
             VALUES ($1, $2) 
             ON CONFLICT (key) 
             DO UPDATE SET value = EXCLUDED.value`,
            [key, value]
          );
        }
      }

      await client.query('COMMIT');
      console.log('Transaction committed');
      return await this.getAll();
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Transaction rolled back:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new SettingsService();
