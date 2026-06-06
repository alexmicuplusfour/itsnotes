const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const os = require('os');
const archiver = require('archiver');
const unzipper = require('unzipper');
const settingsService = require('../services/settings');
const backupScheduler = require('../services/backupScheduler');
const { blockInDemo } = require('../middleware/demoGuard');

const UPLOADS_PATH = path.join(__dirname, '../../uploads');
const getAutoBackupPath = () => process.env.BACKUP_PATH || path.join(__dirname, '../../backups');

// Configure multer for zip file uploads
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

// Helper to build pg_dump command
const buildPgDumpCommand = (config) => {
  const dockerContainer = process.env.DOCKER_DB_CONTAINER;

  if (dockerContainer) {
    return `docker exec ${dockerContainer} pg_dump -U ${config.user} -d ${config.database} --clean --if-exists --no-owner --no-privileges`;
  } else {
    const pgDumpPath = process.env.PG_DUMP_PATH || 'pg_dump';
    return `PGPASSWORD="${config.password}" ${pgDumpPath} -h ${config.host} -p ${config.port} -U ${config.user} -d ${config.database} --clean --if-exists --no-owner --no-privileges`;
  }
};

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

// POST /api/backup/export - Create and download backup zip (DB + uploads)
router.post('/export', async (req, res) => {
  const config = getDbConfig();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const zipFilename = `itsnotes-backup-${timestamp}.zip`;
  const tempSqlPath = path.join(os.tmpdir(), `itsnotes-db-${timestamp}.sql`);

  try {
    console.log('[BACKUP] Starting export...');

    // Generate the SQL dump
    const command = `${buildPgDumpCommand(config)} > "${tempSqlPath}"`;
    await execPromise(command, { maxBuffer: 100 * 1024 * 1024 });
    console.log('[BACKUP] SQL dump created');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });

    archive.on('error', (err) => {
      console.error('[BACKUP] Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error creating backup archive' });
      }
    });

    archive.pipe(res);
    archive.file(tempSqlPath, { name: 'database.sql' });

    try {
      await fs.access(UPLOADS_PATH);
      archive.directory(UPLOADS_PATH, 'uploads');
      console.log('[BACKUP] Including uploads folder');
    } catch {
      console.log('[BACKUP] No uploads folder found, skipping');
    }

    await archive.finalize();
    console.log('[BACKUP] Export complete');

    try {
      await fs.unlink(tempSqlPath);
    } catch (err) {
      console.error('[BACKUP] Error cleaning up temp SQL file:', err);
    }

  } catch (error) {
    console.error('[BACKUP] Error creating backup:', error);
    try { await fs.unlink(tempSqlPath); } catch {}
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create backup', details: error.message });
    }
  }
});

// POST /api/backup/restore - Restore database and uploads from backup zip
router.post('/restore', blockInDemo, upload.single('backup'), async (req, res) => {
  const uploadedFile = req.file;

  if (!uploadedFile) {
    return res.status(400).json({ error: 'No backup file uploaded' });
  }

  const config = getDbConfig();
  const dockerContainer = process.env.DOCKER_DB_CONTAINER;
  const extractDir = path.join(os.tmpdir(), `itsnotes-restore-${Date.now()}`);

  try {
    console.log('[RESTORE] Extracting backup archive:', uploadedFile.originalname);
    console.log('[RESTORE] File size:', uploadedFile.size, 'bytes');

    await fs.mkdir(extractDir, { recursive: true });
    await require('fs').createReadStream(uploadedFile.path)
      .pipe(unzipper.Extract({ path: extractDir }))
      .promise();

    const sqlFilePath = path.join(extractDir, 'database.sql');
    const extractedUploadsPath = path.join(extractDir, 'uploads');

    try {
      await fs.access(sqlFilePath);
    } catch {
      throw new Error('Backup archive does not contain database.sql');
    }

    // Restore database
    console.log('[RESTORE] Restoring database...');
    if (dockerContainer) {
      const containerSqlPath = `/tmp/itsnotes-restore-db.sql`;
      await execPromise(`docker cp "${sqlFilePath}" ${dockerContainer}:${containerSqlPath}`);
      const result = await execPromise(
        `docker exec ${dockerContainer} psql -U ${config.user} -d ${config.database} -f ${containerSqlPath}`,
        { maxBuffer: 100 * 1024 * 1024 }
      );
      if (result.stdout) console.log('[RESTORE] stdout:', result.stdout);
      if (result.stderr) console.log('[RESTORE] stderr:', result.stderr);
      await execPromise(`docker exec ${dockerContainer} rm ${containerSqlPath}`);
    } else {
      const psqlPath = process.env.PSQL_PATH || 'psql';
      const command = `PGPASSWORD="${config.password}" ${psqlPath} -h ${config.host} -p ${config.port} -U ${config.user} -d ${config.database} -f "${sqlFilePath}"`;
      const result = await execPromise(command, { maxBuffer: 100 * 1024 * 1024 });
      if (result.stdout) console.log('[RESTORE] stdout:', result.stdout);
      if (result.stderr) console.log('[RESTORE] stderr:', result.stderr);
    }
    console.log('[RESTORE] Database restored successfully');

    // Re-initialize settings from the restored DB so process.env reflects the restored state
    // without requiring a server restart
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

    // Cleanup
    await fs.unlink(uploadedFile.path);
    await fs.rm(extractDir, { recursive: true, force: true });

    res.json({
      message: 'Backup restored successfully',
      filename: uploadedFile.originalname,
      uploadsRestored
    });

  } catch (error) {
    console.error('[RESTORE] Error restoring backup:', error);
    try { await fs.unlink(uploadedFile.path); } catch {}
    try { await fs.rm(extractDir, { recursive: true, force: true }); } catch {}
    res.status(500).json({ error: 'Failed to restore backup', details: error.message });
  }
});

// POST /api/backup/reset - Truncate all tables and clear uploads
router.post('/reset', blockInDemo, async (req, res) => {
  const config = getDbConfig();
  const dockerContainer = process.env.DOCKER_DB_CONTAINER;
  const tempSqlPath = path.join(os.tmpdir(), `itsnotes-reset-${Date.now()}.sql`);

  try {
    console.log('[RESET] Starting full reset...');

    const sql = `DO $$ DECLARE r RECORD; BEGIN FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE'; END LOOP; END $$;\n`;
    await fs.writeFile(tempSqlPath, sql);

    if (dockerContainer) {
      const containerSqlPath = `/tmp/itsnotes-reset.sql`;
      await execPromise(`docker cp "${tempSqlPath}" ${dockerContainer}:${containerSqlPath}`);
      await execPromise(
        `docker exec ${dockerContainer} psql -U ${config.user} -d ${config.database} -f ${containerSqlPath}`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      await execPromise(`docker exec ${dockerContainer} rm ${containerSqlPath}`);
    } else {
      const psqlPath = process.env.PSQL_PATH || 'psql';
      const command = `PGPASSWORD="${config.password}" ${psqlPath} -h ${config.host} -p ${config.port} -U ${config.user} -d ${config.database} -f "${tempSqlPath}"`;
      await execPromise(command, { maxBuffer: 10 * 1024 * 1024 });
    }

    try { await fs.unlink(tempSqlPath); } catch {}

    console.log('[RESET] Database truncated');

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
        await execPromise('docker --version');
        dockerAvailable = true;

        try {
          await execPromise(`docker exec ${dockerContainer} pg_dump --version`);
          pgDumpAvailable = true;
        } catch (err) {
          console.log('[BACKUP INFO] pg_dump not found in container');
        }

        try {
          await execPromise(`docker exec ${dockerContainer} psql --version`);
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
        await execPromise(`${pgDumpPath} --version`);
        pgDumpAvailable = true;
      } catch (err) {
        console.log('[BACKUP INFO] pg_dump not found');
      }

      try {
        await execPromise(`${psqlPath} --version`);
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
