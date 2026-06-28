'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const unzipper = require('unzipper');
const { processObsidianImport } = require('../import-obsidian');
const { blockInDemo } = require('../middleware/demoGuard');

const tempDir = process.env.NODE_ENV === 'production'
  ? '/tmp/itsnotes-obsidian'
  : path.join(os.tmpdir(), 'itsnotes-obsidian');

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tempDir),
  filename: (req, file, cb) => {
    const rand = Math.random().toString(36).slice(2, 8);
    cb(null, `${Date.now()}-${rand}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
  fileFilter: (req, file, cb) => {
    const isZip = file.mimetype === 'application/zip' || file.originalname.endsWith('.zip');
    const isMd = file.originalname.endsWith('.md')
      || file.mimetype === 'text/markdown'
      || file.mimetype === 'text/plain';
    if (isZip || isMd) return cb(null, true);
    cb(new Error('Only .zip and .md files are accepted'));
  },
});

function cleanup(...paths) {
  for (const p of paths) {
    try {
      if (!p) continue;
      const stat = fs.statSync(p);
      if (stat.isDirectory()) fs.rmSync(p, { recursive: true, force: true });
      else fs.unlinkSync(p);
    } catch (_) {}
  }
}

// Recursively collect all .md files under a directory
function collectMdFiles(dir) {
  const results = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...collectMdFiles(full));
      else if (entry.isFile() && entry.name.endsWith('.md')) results.push(full);
    }
  } catch (_) {}
  return results;
}

// Build resourceMap: basename and relative path → absolute path, for all non-.md files.
// Used to resolve ![[embed]] references to actual files on disk.
function buildResourceMap(dir) {
  const map = {};
  function walk(current) {
    try {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && !entry.name.endsWith('.md')) {
          map[entry.name] = full;
          const rel = path.relative(dir, full).replace(/\\/g, '/');
          map[rel] = full;
        }
      }
    } catch (_) {}
  }
  walk(dir);
  return map;
}

// POST /api/import/obsidian
// Accepts: multipart/form-data with either:
//   archive: a single .zip file (Obsidian vault export)
//   files:   one or more .md files
router.post('/', blockInDemo, upload.fields([
  { name: 'archive', maxCount: 1 },
  { name: 'files' },
]), async (req, res) => {
  const uploaded = req.files || {};
  const archiveFiles = uploaded['archive'] || [];
  const mdFiles = uploaded['files'] || [];

  if (!archiveFiles.length && !mdFiles.length) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  req.setTimeout(3600000);
  res.setTimeout(3600000);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const send = (event, data) => res.write(`data: ${JSON.stringify({ event, data })}\n\n`);

  const uploadedPaths = [...archiveFiles, ...mdFiles].map((f) => f.path);
  let extractDir = null;

  try {
    let importFiles = [];
    let resourceMap = {};
    let origNameMap = {};

    if (archiveFiles.length) {
      const zipPath = archiveFiles[0].path;
      extractDir = path.join(tempDir, `extract-${Date.now()}`);
      fs.mkdirSync(extractDir, { recursive: true });

      send('status', { message: 'Extracting archive...' });
      const zipDir = await unzipper.Open.file(zipPath);
      await zipDir.extract({ path: extractDir, concurrency: 4 });

      importFiles = collectMdFiles(extractDir);
      resourceMap = buildResourceMap(extractDir);

      if (!importFiles.length) {
        send('error', { message: 'No .md files found in the uploaded archive.' });
        cleanup(...uploadedPaths, extractDir);
        return res.end();
      }
    } else {
      // Direct .md uploads — no resource map (images not available without zip)
      importFiles = mdFiles.map((f) => f.path);
      origNameMap = Object.fromEntries(mdFiles.map((f) => [f.path, f.originalname]));
    }

    const count = importFiles.length;
    send('status', { message: `Found ${count} note${count !== 1 ? 's' : ''} to import` });

    let lastPercent = 0;
    const onProgress = (current, total) => {
      const percent = Math.floor((current / total) * 100);
      if (percent >= lastPercent + 5 || percent === 100) {
        lastPercent = percent;
        send('progress', { current, total, percent });
      }
    };

    const onStatus = (message) => send('status', { message });
    const result = await processObsidianImport(importFiles, resourceMap, onProgress, origNameMap, onStatus);

    cleanup(...uploadedPaths, extractDir);

    send('complete', { success: true, message: 'Import complete', result });
    res.end();
  } catch (e) {
    console.error('Obsidian import route error:', e);
    cleanup(...uploadedPaths, extractDir);
    send('error', { message: e.message || 'Import failed' });
    res.end();
  }
});

module.exports = router;
