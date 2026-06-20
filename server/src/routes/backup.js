const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const os = require('os');
const unzipper = require('unzipper');
const settingsService = require('../services/settings');
const backupScheduler = require('../services/backupScheduler');
const { runMigrations } = require('../migrate');
const { blockInDemo } = require('../middleware/demoGuard');
const { rotateJwtSecret, resetUsersExistCache } = require('../middleware/auth');
const { execFileAsync } = require('../utils/childProcess');

const UPLOADS_PATH = path.join(__dirname, '../../uploads');
const getAutoBackupPath = () => process.env.BACKUP_PATH || path.join(__dirname, '../../backups');

// Configure multer for zip file uploads (restore-from-file)
const upload = multer({
  dest: os.tmpdir(),
  limits: {
    fileSize: 1000 * 1024 * 1024 // 1GB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' ||
        file.mimetype === 'application/x-zip-compressed' ||
        file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only .zip backup files are allowed'));
    }
  }
});

// Helper to get database connection info from environment
const getDbConfig = () => {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || '5432',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'itsnotes'
  };
};

// The DB credentials reach psql as argv (no shell), and PGPASSWORD is passed
// via env on the native path — so special characters in DB_PASSWORD/DB_NAME/etc.
// are safe.
async function runPsqlFile(config, sqlFilePath) {
  const dockerContainer = process.env.DOCKER_DB_CONTAINER;
  if (dockerContainer) {
    const containerSqlPath = `/tmp/itsnotes-restore-${Date.now()}.sql`;
    await execFileAsync('docker', ['cp', sqlFilePath, `${dockerContainer}:${containerSqlPath}`]);
    try {
      return await execFileAsync('docker', [
        'exec', dockerContainer,
        'psql', '-v', 'ON_ERROR_STOP=1', '-U', config.user, '-d', config.database, '-f', containerSqlPath,
      ], { maxBuffer: 100 * 1024 * 1024 });
    } finally {
      await execFileAsync('docker', ['exec', dockerContainer, 'rm', '-f', containerSqlPath]).catch(() => {});
    }
  }
  const psqlPath = process.env.PSQL_PATH || 'psql';
  return execFileAsync(psqlPath, [
    '-h', config.host, '-p', String(config.port),
    '-v', 'ON_ERROR_STOP=1', '-U', config.user, '-d', config.database, '-f', sqlFilePath,
  ], {
    maxBuffer: 100 * 1024 * 1024,
    env: { ...process.env, PGPASSWORD: config.password },
  });
}

// Wipe the public schema before replaying a dump. A pg_dump made with
// --clean only drops the objects that existed when the backup was taken, so
// restoring an older backup into a newer schema fails when a newly-added table
// (e.g. note_files) holds a foreign key into a table the dump tries to drop.
// Dropping and recreating the schema guarantees a clean slate regardless of
// drift between backup-time and restore-time.
async function resetPublicSchema(config) {
  const sql = 'DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\n';
  const tempPath = path.join(os.tmpdir(), `itsnotes-schemareset-${Date.now()}.sql`);
  await fs.writeFile(tempPath, sql);
  try {
    await runPsqlFile(config, tempPath);
  } finally {
    try { await fs.unlink(tempPath); } catch {}
  }
}

// Recursively copy a directory
async function copyDir(src, dest) {
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

// POST /api/backup/reset - Truncate all tables and clear uploads
router.post('/reset', blockInDemo, async (req, res) => {
  const config = getDbConfig();
  const tempSqlPath = path.join(os.tmpdir(), `itsnotes-reset-${Date.now()}.sql`);

  try {
    console.log('[RESET] Starting full reset...');

    const sql = `DO $$ DECLARE r RECORD; BEGIN FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE'; END LOOP; END $$;\n`;
    await fs.writeFile(tempSqlPath, sql);

    await runPsqlFile(config, tempSqlPath);

    try { await fs.unlink(tempSqlPath); } catch {}

    console.log('[RESET] Database truncated');

    // The truncate wiped the users table and the persisted JWT_SECRET. Issue a
    // new secret so every existing session (now pointing at a deleted user) is
    // invalidated, and clear the cached user-existence flag so the app falls
    // back to the setup flow.
    await rotateJwtSecret();
    resetUsersExistCache();
    console.log('[RESET] JWT secret rotated, sessions invalidated');

    // Clear uploads folder contents (keep the directory itself)
    try {
      const entries = await fs.readdir(UPLOADS_PATH);
      await Promise.all(
        entries.map(entry => fs.rm(path.join(UPLOADS_PATH, entry), { recursive: true, force: true }))
      );
      console.log('[RESET] Uploads folder cleared');
    } catch {
      console.log('[RESET] No uploads folder to clear');
    }

    res.json({ message: 'Reset complete' });

  } catch (error) {
    console.error('[RESET] Error:', error);
    res.status(500).json({ error: 'Failed to reset', details: error.message });
  }
});

// GET /api/backup/info - Get backup/restore system info
router.get('/info', async (req, res) => {
  const config = getDbConfig();
  const dockerContainer = process.env.DOCKER_DB_CONTAINER;

  try {
    let pgDumpAvailable = false;
    let psqlAvailable = false;
    let dockerAvailable = false;
    let mode = 'local';

    if (dockerContainer) {
      mode = 'docker';
      try {
        await execFileAsync('docker', ['--version']);
        dockerAvailable = true;

        try {
          await execFileAsync('docker', ['exec', dockerContainer, 'pg_dump', '--version']);
          pgDumpAvailable = true;
        } catch (err) {
          console.log('[BACKUP INFO] pg_dump not found in container');
        }

        try {
          await execFileAsync('docker', ['exec', dockerContainer, 'psql', '--version']);
          psqlAvailable = true;
        } catch (err) {
          console.log('[BACKUP INFO] psql not found in container');
        }
      } catch (err) {
        console.log('[BACKUP INFO] Docker not available or container not accessible');
      }
    } else {
      const pgDumpPath = process.env.PG_DUMP_PATH || 'pg_dump';
      const psqlPath = process.env.PSQL_PATH || 'psql';

      try {
        await execFileAsync(pgDumpPath, ['--version']);
        pgDumpAvailable = true;
      } catch (err) {
        console.log('[BACKUP INFO] pg_dump not found');
      }

      try {
        await execFileAsync(psqlPath, ['--version']);
        psqlAvailable = true;
      } catch (err) {
        console.log('[BACKUP INFO] psql not found');
      }
    }

    res.json({
      available: pgDumpAvailable && psqlAvailable,
      pgDumpAvailable,
      psqlAvailable,
      dockerAvailable,
      mode,
      dockerContainer: dockerContainer || null,
      database: config.database,
      host: config.host,
      port: config.port
    });

  } catch (error) {
    console.error('[BACKUP INFO] Error checking backup availability:', error);
    res.status(500).json({
      error: 'Failed to check backup system availability',
      details: error.message
    });
  }
});

// GET /api/backup/auto/files - list saved auto-backup files
router.get('/auto/files', async (req, res) => {
  const backupPath = getAutoBackupPath();
  try {
    await fs.mkdir(backupPath, { recursive: true });
    const entries = await fs.readdir(backupPath);
    const files = await Promise.all(
      entries
        .filter(f => f.startsWith('itsnotes-backup-') && f.endsWith('.zip'))
        .map(async (filename) => {
          const stat = await fs.stat(path.join(backupPath, filename));
          return { filename, size: stat.size, createdAt: stat.mtime.toISOString() };
        })
    );
    files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ files, path: backupPath });
  } catch (error) {
    console.error('[BACKUP] Error listing auto-backup files:', error);
    res.status(500).json({ error: 'Failed to list backup files' });
  }
});

// GET /api/backup/auto/download/:filename - download a specific auto-backup
router.get('/auto/download/:filename', async (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!filename.startsWith('itsnotes-backup-') || !filename.endsWith('.zip')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = path.join(getAutoBackupPath(), filename);
  try {
    await fs.access(filePath);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    require('fs').createReadStream(filePath).pipe(res);
  } catch {
    res.status(404).json({ error: 'Backup file not found' });
  }
});

// DELETE /api/backup/auto/files/:filename - delete a specific auto-backup
router.delete('/auto/files/:filename', async (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!filename.startsWith('itsnotes-backup-') || !filename.endsWith('.zip')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = path.join(getAutoBackupPath(), filename);
  try {
    await fs.unlink(filePath);
    res.json({ message: 'Backup deleted' });
  } catch {
    res.status(404).json({ error: 'Backup file not found' });
  }
});

// Restore the database + uploads from a backup zip, streaming heartbeats to the
// client while the (potentially long) restore runs. A large restore can run for
// minutes, so we stream whitespace so the connection never idles out at a proxy
// and the client can apply an idle timeout instead of a blind total-request
// timeout. The final response body is a single JSON object (leading whitespace
// is ignored by JSON.parse). When deleteSource is set, the zip is removed after
// (used for the temp file multer wrote for an uploaded restore).
async function streamRestoreFromZip(req, res, zipPath, displayName, { deleteSource = false } = {}) {
  const config = getDbConfig();
  const extractDir = path.join(os.tmpdir(), `itsnotes-restore-${Date.now()}`);

  req.setTimeout(3600000);
  res.setTimeout(3600000);
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  const heartbeat = setInterval(() => res.write(' '), 15000);
  const sendFinal = (statusOk, payload) => {
    clearInterval(heartbeat);
    res.write(JSON.stringify({ ...payload, ok: statusOk }));
    res.end();
  };
  const cleanupSource = async () => {
    if (deleteSource) { try { await fs.unlink(zipPath); } catch {} }
  };

  try {
    console.log('[RESTORE] Extracting backup:', displayName);

    await fs.mkdir(extractDir, { recursive: true });
    await require('fs').createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: extractDir }))
      .promise();

    const sqlFilePath = path.join(extractDir, 'database.sql');
    const extractedUploadsPath = path.join(extractDir, 'uploads');

    try {
      await fs.access(sqlFilePath);
    } catch {
      throw new Error('Backup archive does not contain database.sql');
    }

    console.log('[RESTORE] Resetting public schema for a clean restore...');
    await resetPublicSchema(config);

    console.log('[RESTORE] Restoring database...');
    const result = await runPsqlFile(config, sqlFilePath);
    if (result.stdout) console.log('[RESTORE] stdout:', result.stdout);
    if (result.stderr) console.log('[RESTORE] stderr:', result.stderr);
    console.log('[RESTORE] Database restored successfully');

    // The backup may predate the current schema (it captures whatever migrations
    // were applied when it was taken). Run migrations to bring the restored DB up
    // to the current schema before the app touches it.
    console.log('[RESTORE] Applying pending migrations...');
    await runMigrations();

    // Re-initialize settings from the restored DB so process.env reflects the
    // restored state without requiring a server restart
    await settingsService.init();

    // Restore uploads folder (full replace)
    let uploadsRestored = false;
    let extractedUploadsExists = false;
    try {
      await fs.access(extractedUploadsPath);
      extractedUploadsExists = true;
    } catch {}

    if (extractedUploadsExists) {
      console.log('[RESTORE] Restoring uploads folder...');
      try {
        // Clear existing contents without removing the directory itself (safe for Docker volumes)
        try {
          const existing = await fs.readdir(UPLOADS_PATH);
          await Promise.all(
            existing.map(entry => fs.rm(path.join(UPLOADS_PATH, entry), { recursive: true, force: true }))
          );
        } catch {
          await fs.mkdir(UPLOADS_PATH, { recursive: true });
        }
        await copyDir(extractedUploadsPath, UPLOADS_PATH);
        uploadsRestored = true;
        console.log('[RESTORE] Uploads folder restored');
      } catch (err) {
        console.error('[RESTORE] Error restoring uploads folder:', err);
      }
    } else {
      console.log('[RESTORE] No uploads folder in backup, skipping');
    }

    await fs.rm(extractDir, { recursive: true, force: true });
    await cleanupSource();

    sendFinal(true, { message: 'Backup restored successfully', filename: displayName, uploadsRestored });

  } catch (error) {
    console.error('[RESTORE] Error restoring backup:', error);
    try { await fs.rm(extractDir, { recursive: true, force: true }); } catch {}
    await cleanupSource();
    sendFinal(false, { error: 'Failed to restore backup', details: error.message });
  }
}

// POST /api/backup/restore - restore from an uploaded backup zip
router.post('/restore', blockInDemo, upload.single('backup'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No backup file uploaded' });
  }
  await streamRestoreFromZip(req, res, req.file.path, req.file.originalname, { deleteSource: true });
});

// POST /api/backup/auto/restore/:filename - restore from a saved backup file
router.post('/auto/restore/:filename', blockInDemo, async (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!filename.startsWith('itsnotes-backup-') || !filename.endsWith('.zip')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const zipPath = path.join(getAutoBackupPath(), filename);
  try {
    await fs.access(zipPath);
  } catch {
    return res.status(404).json({ error: 'Backup file not found' });
  }
  await streamRestoreFromZip(req, res, zipPath, filename, { deleteSource: false });
});

// POST /api/backup/auto/now - trigger an immediate auto-backup
router.post('/auto/now', async (req, res) => {
  try {
    await backupScheduler.runBackup();
    res.json({ message: 'Backup complete' });
  } catch (error) {
    console.error('[BACKUP] Manual trigger failed:', error);
    res.status(500).json({ error: 'Backup failed', details: error.message });
  }
});

module.exports = router;
