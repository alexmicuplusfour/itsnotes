const cron = require('node-cron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const archiver = require('archiver');

const UPLOADS_PATH = path.join(__dirname, '../../uploads');

const getBackupPath = () => process.env.BACKUP_PATH || path.join(__dirname, '../../backups');

const getDbConfig = () => ({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || '5432',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'itsnotes'
});

const buildPgDumpCommand = (config) => {
  const dockerContainer = process.env.DOCKER_DB_CONTAINER;
  if (dockerContainer) {
    return `docker exec ${dockerContainer} pg_dump -U ${config.user} -d ${config.database} --clean --if-exists --no-owner --no-privileges`;
  }
  const pgDumpPath = process.env.PG_DUMP_PATH || 'pg_dump';
  return `PGPASSWORD="${config.password}" ${pgDumpPath} -h ${config.host} -p ${config.port} -U ${config.user} -d ${config.database} --clean --if-exists --no-owner --no-privileges`;
};

const intervalToCron = (hours) => {
  const h = parseInt(hours) || 24;
  if (h >= 168) return '0 2 * * 0';
  if (h === 48)  return '0 2 */2 * *';
  if (h === 24)  return '0 2 * * *';
  if (h === 12)  return '0 */12 * * *';
  return '0 */6 * * *';
};

class BackupScheduler {
  constructor() {
    this.cronTask = null;
  }

  async init() {
    await fs.mkdir(getBackupPath(), { recursive: true }).catch(() => {});

    if (process.env.AUTO_BACKUP_ENABLED !== 'true') {
      console.log('[BACKUP SCHEDULER] Auto-backup disabled');
      return;
    }

    const cronExpr = intervalToCron(process.env.AUTO_BACKUP_INTERVAL_HOURS || '24');
    console.log(`[BACKUP SCHEDULER] Scheduling with cron: ${cronExpr}`);
    this.cronTask = cron.schedule(cronExpr, () => {
      this.runBackup().catch(err => console.error('[BACKUP SCHEDULER] Scheduled backup failed:', err));
    });
  }

  restart() {
    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
      console.log('[BACKUP SCHEDULER] Stopped existing task');
    }
    this.init();
  }

  async runBackup() {
    const backupPath = getBackupPath();
    await fs.mkdir(backupPath, { recursive: true }).catch(() => {});

    const config = getDbConfig();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipFilename = `itsnotes-backup-${timestamp}.zip`;
    const zipPath = path.join(backupPath, zipFilename);
    const tempSqlPath = path.join(os.tmpdir(), `itsnotes-autobackup-${timestamp}.sql`);

    try {
      console.log(`[BACKUP SCHEDULER] Running backup: ${zipFilename}`);

      const command = `${buildPgDumpCommand(config)} > "${tempSqlPath}"`;
      await execPromise(command, { maxBuffer: 100 * 1024 * 1024 });
      console.log('[BACKUP SCHEDULER] SQL dump created');

      let includeUploads = false;
      try {
        await fs.access(UPLOADS_PATH);
        includeUploads = true;
      } catch {}

      await new Promise((resolve, reject) => {
        const output = fsSync.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 6 } });

        output.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(output);
        archive.file(tempSqlPath, { name: 'database.sql' });

        if (includeUploads) {
          archive.directory(UPLOADS_PATH, 'uploads');
          console.log('[BACKUP SCHEDULER] Including uploads folder');
        }

        archive.finalize();
      });

      console.log(`[BACKUP SCHEDULER] Backup written: ${zipFilename}`);
      await this._applyRetention(backupPath);
    } catch (error) {
      try { await fs.unlink(zipPath); } catch {}
      throw error;
    } finally {
      try { await fs.unlink(tempSqlPath); } catch {}
    }
  }

  async _applyRetention(backupPath) {
    const retention = parseInt(process.env.AUTO_BACKUP_RETENTION_COUNT) || 5;
    try {
      const entries = await fs.readdir(backupPath);
      const files = entries
        .filter(f => f.startsWith('itsnotes-backup-') && f.endsWith('.zip'))
        .sort(); // ISO timestamp names sort chronologically

      const toDelete = files.slice(0, Math.max(0, files.length - retention));
      for (const file of toDelete) {
        await fs.unlink(path.join(backupPath, file));
        console.log(`[BACKUP SCHEDULER] Deleted old backup: ${file}`);
      }
    } catch (error) {
      console.error('[BACKUP SCHEDULER] Error applying retention:', error);
    }
  }
}

module.exports = new BackupScheduler();
