/**
 * Foxit Snooper Integration Routes
 *
 * Provides API endpoints to interact with the Foxit Snooper Python application.
 * The snooper runs locally and monitors Foxit PDF Reader for document/page info.
 *
 * Auth model:
 *   - Browser-initiated forwarders (UI calls server, server calls snooper) require
 *     a logged-in user via `optionalAuth`. Same posture as the rest of the API.
 *   - Snooper-initiated routes (`/books`, `/push-progress`) require a shared
 *     token via `X-Snooper-Token` matching `FOXIT_SNOOPER_TOKEN`. If the env var
 *     is unset, the routes accept anonymous requests and log a one-time warning
 *     so existing setups keep working but admins know to lock down.
 *   - The snooper URL is read from `FOXIT_SNOOPER_URL` only — no query/header
 *     override — to prevent SSRF.
 */

const express = require('express');
const router = express.Router();
const UserObject = require('../models/UserObject');
const { optionalAuth } = require('../middleware/auth');

const SNOOPER_FETCH_TIMEOUT_MS = 10000;

function getSnooperUrl() {
  const url = process.env.FOXIT_SNOOPER_URL || 'http://192.168.100.110:3456';
  return url.replace(/\/$/, '');
}

async function snooperFetch(path, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SNOOPER_FETCH_TIMEOUT_MS);
  try {
    return await fetch(`${getSnooperUrl()}${path}`, {
      redirect: 'manual',
      signal: controller.signal,
      ...init,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFromSnooper(path) {
  try {
    const response = await snooperFetch(path);
    if (!response.ok) {
      throw new Error(`Snooper returned ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    throw new Error(`Foxit snooper not available: ${error.message}`);
  }
}

let warnedUnsetToken = false;
const requireSnooperToken = (req, res, next) => {
  const expected = process.env.FOXIT_SNOOPER_TOKEN;
  if (!expected) {
    if (!warnedUnsetToken) {
      console.warn('[foxit] FOXIT_SNOOPER_TOKEN is not set — snooper endpoints accept anonymous requests. Set this env var to require a token.');
      warnedUnsetToken = true;
    }
    return next();
  }
  const token = req.headers['x-snooper-token'];
  if (!token || token !== expected) {
    return res.status(401).json({ error: 'Invalid snooper token' });
  }
  next();
};

/**
 * GET /api/foxit/books
 * Get books for the snooper mapping UI. Called BY the snooper, so uses
 * token auth instead of user JWT.
 */
router.get('/books', requireSnooperToken, async (req, res) => {
  try {
    const { q } = req.query;
    const userId = 1; // Default user for snooper

    let objects;
    if (q && q.trim().length > 0) {
      objects = await UserObject.search(userId, q.trim(), 'book', 50);
    } else {
      objects = await UserObject.findByUserId(userId, 'book');
    }

    res.json(objects);
  } catch (error) {
    console.error('Error fetching books for snooper:', error);
    res.status(500).json({ message: 'Error fetching books', error: error.message });
  }
});

/**
 * GET /api/foxit/info
 * Get current Foxit state (document title, page number, etc.)
 */
router.get('/info', optionalAuth, async (req, res) => {
  try {
    const data = await fetchFromSnooper('/info');
    res.json(data);
  } catch (error) {
    res.json({
      foxit_running: false,
      document_title: null,
      current_page: null,
      total_pages: null,
      snooper_available: false,
      error: error.message
    });
  }
});

/**
 * GET /api/foxit/documents
 * Get all documents that have been seen by the snooper
 */
router.get('/documents', optionalAuth, async (req, res) => {
  try {
    const data = await fetchFromSnooper('/documents');
    res.json(data);
  } catch (error) {
    res.json({
      snooper_available: false,
      error: error.message
    });
  }
});

/**
 * GET /api/foxit/mappings
 * Get all document-to-book object mappings
 */
router.get('/mappings', optionalAuth, async (req, res) => {
  try {
    const data = await fetchFromSnooper('/mappings');
    res.json(data);
  } catch (error) {
    res.json({
      snooper_available: false,
      error: error.message
    });
  }
});

/**
 * POST /api/foxit/mapping
 * Create or update a document-to-book mapping
 * Body: { document_title, object_id, book_title }
 */
router.post('/mapping', optionalAuth, async (req, res) => {
  try {
    const { document_title, object_id, book_title } = req.body;

    if (!document_title || !object_id) {
      return res.status(400).json({ error: 'document_title and object_id are required' });
    }

    const response = await snooperFetch('/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_title, object_id, book_title })
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(503).json({
      snooper_available: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/foxit/mapping
 * Delete a document mapping
 * Query: ?doc=document_title
 */
router.delete('/mapping', optionalAuth, async (req, res) => {
  try {
    const { doc } = req.query;

    if (!doc) {
      return res.status(400).json({ error: 'doc query parameter is required' });
    }

    const response = await snooperFetch(`/mapping?doc=${encodeURIComponent(doc)}`, {
      method: 'DELETE'
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(503).json({
      snooper_available: false,
      error: error.message
    });
  }
});

/**
 * GET /api/foxit/health
 * Check if the Foxit snooper is running
 */
router.get('/health', optionalAuth, async (req, res) => {
  try {
    const data = await fetchFromSnooper('/health');
    res.json({ ...data, snooper_available: true });
  } catch (error) {
    res.json({
      status: 'unavailable',
      snooper_available: false,
      error: error.message
    });
  }
});

/**
 * GET /api/foxit/page-for-object/:id
 * Get page number for a specific book object (reverse lookup from mapping)
 */
router.get('/page-for-object/:id', optionalAuth, async (req, res) => {
  try {
    const data = await fetchFromSnooper(`/page-for-object?id=${encodeURIComponent(req.params.id)}`);
    res.json(data);
  } catch (error) {
    res.json({
      found: false,
      snooper_available: false,
      error: error.message
    });
  }
});

/**
 * POST /api/foxit/push-progress
 * Receive progress update pushed from the Foxit snooper.
 * Called BY the snooper, so uses token auth instead of user JWT.
 * Body: { object_id, current_page, document_title }
 */
router.post('/push-progress', requireSnooperToken, async (req, res) => {
  try {
    const { object_id, current_page, document_title } = req.body;

    if (!object_id || current_page === undefined) {
      return res.status(400).json({ error: 'object_id and current_page are required' });
    }

    const existingObject = await UserObject.findById(object_id);
    if (!existingObject) {
      return res.status(404).json({ error: 'Object not found' });
    }

    const pageNum = parseInt(current_page, 10);
    const pageCount = existingObject.metadata?.source?.page_count;

    let percent = null;
    if (pageCount && pageCount > 0) {
      percent = Math.round((pageNum / pageCount) * 100);
    }

    console.log(`[Foxit Push] Updating ${object_id} to page ${pageNum}/${pageCount} (${percent}%) - ${document_title}`);

    const userState = {
      progress: {
        current_page: pageNum,
        ...(percent !== null && { percent })
      }
    };

    const object = await UserObject.updateUserState(object_id, userState);

    const io = req.app.get('io');
    if (io) {
      io.emit('object_updated', object);
    }

    res.json({
      success: true,
      message: `Updated to page ${pageNum} (${percent}%)`,
      object_id: object.id
    });
  } catch (error) {
    console.error('[Foxit Push] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
