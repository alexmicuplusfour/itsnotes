const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const os = require('os');
const unzipper = require('unzipper');
const settingsService = require('./settings');
const { execFileAsync } = require('../utils/childProcess');

const UPLOADS_PATH = path.join(__dirname, '../../uploads');

const getDbConfig = () => ({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || '5432',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'itsnotes'
});

async function copyDir(src, dest) {
  const entries = await fsPromises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await fsPromises.mkdir(destPath, { recursive: true });
      await copyDir(srcPath, destPath);
    } else {
      await fsPromises.copyFile(srcPath, destPath);
    }
  }
}

async function restoreFromZip(zipFilePath) {
  const config = getDbConfig();
  const dockerContainer = process.env.DOCKER_DB_CONTAINER;
  const extractDir = path.join(os.tmpdir(), `itsnotes-demo-restore-${Date.now()}`);

  try {
    console.log('[DEMO RESET] Extracting seed archive...');
    await fsPromises.mkdir(extractDir, { recursive: true });
    await fs.createReadStream(zipFilePath)
      .pipe(unzipper.Extract({ path: extractDir }))
      .promise();

    const sqlFilePath = path.join(extractDir, 'database.sql');
    const extractedUploadsPath = path.join(extractDir, 'uploads');

    await fsPromises.access(sqlFilePath);

    console.log('[DEMO RESET] Restoring database...');
    if (dockerContainer) {
      const containerSqlPath = `/tmp/itsnotes-demo-restore-${Date.now()}.sql`;
      await execFileAsync('docker', ['cp', sqlFilePath, `${dockerContainer}:${containerSqlPath}`]);
      try {
        const result = await execFileAsync('docker', [
          'exec', dockerContainer,
          'psql', '-U', config.user, '-d', config.database, '-f', containerSqlPath,
        ], { maxBuffer: 100 * 1024 * 1024 });
        if (result.stderr) console.log('[DEMO RESET] psql stderr:', result.stderr);
      } finally {
        await execFileAsync('docker', ['exec', dockerContainer, 'rm', '-f', containerSqlPath]).catch(() => {});
      }
    } else {
      const psqlPath = process.env.PSQL_PATH || 'psql';
      const result = await execFileAsync(psqlPath, [
        '-h', config.host, '-p', String(config.port),
        '-U', config.user, '-d', config.database, '-f', sqlFilePath,
      ], {
        maxBuffer: 100 * 1024 * 1024,
        env: { ...process.env, PGPASSWORD: config.password },
      });
      if (result.stderr) console.log('[DEMO RESET] psql stderr:', result.stderr);
    }

    await settingsService.init();

    try {
      await fsPromises.access(extractedUploadsPath);
      const existing = await fsPromises.readdir(UPLOADS_PATH).catch(() => []);
      await Promise.all(
        existing.map(e => fsPromises.rm(path.join(UPLOADS_PATH, e), { recursive: true, force: true }))
      );
      await copyDir(extractedUploadsPath, UPLOADS_PATH);
      console.log('[DEMO RESET] Uploads restored');
    } catch {
      // No uploads folder in seed — fine
    }
  } finally {
    await fsPromises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
  }
}

class DemoResetService {
  constructor() {
    this.io = null;
    this.intervalHandle = null;
    this.nextResetAt = null;
    this.intervalMs = 0;
    this.seedZipPath = null;
    this.enabled = false;
  }

  init(io) {
    this.enabled = process.env.DEMO_MODE === 'true';
    if (!this.enabled) return;

    this.io = io;
    this.seedZipPath = process.env.DEMO_SEED_FILE || '/app/demo-data/seed.zip';
    this.intervalMs = parseFloat(process.env.DEMO_RESET_MINUTES || '60') * 60 * 1000;
    this.nextResetAt = new Date(Date.now() + this.intervalMs);

    this.intervalHandle = setInterval(() => this._doReset(), this.intervalMs);

    console.log(`[DEMO] Mode enabled. Seed file: ${this.seedZipPath}`);
    console.log(`[DEMO] Reset every ${process.env.DEMO_RESET_MINUTES || 60}min. Next reset at ${this.nextResetAt.toISOString()}`);

    // Warn immediately if seed file is missing
    fsPromises.access(this.seedZipPath).catch(() => {
      console.warn(`[DEMO] WARNING: Seed file not found at ${this.seedZipPath}. Place your seed.zip there before the first reset.`);
    });
  }

  async _doReset() {
    console.log('[DEMO] Performing scheduled reset...');
    // Update nextResetAt before the async work so clients always see a valid future time
    this.nextResetAt = new Date(Date.now() + this.intervalMs);
    try {
      await restoreFromZip(this.seedZipPath);
      console.log('[DEMO] Reset complete. Reloading all clients...');
      if (this.io) {
        this.io.emit('demo_reset', { nextResetAt: this.nextResetAt.toISOString() });
      }
    } catch (err) {
      console.error('[DEMO] Reset failed:', err);
    }
  }

  getNextResetAt() {
    return this.nextResetAt ? this.nextResetAt.toISOString() : null;
  }

  isEnabled() {
    return this.enabled;
  }
}

module.exports = new DemoResetService();
