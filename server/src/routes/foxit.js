/**
 * Foxit Snooper Integration Routes
 * 
 * Provides API endpoints to interact with the Foxit Snooper Python application.
 * The snooper runs locally and monitors Foxit PDF Reader for document/page info.
 */

const express = require('express');
const router = express.Router();
const UserObject = require('../models/UserObject');

// Default Foxit snooper URL (Python app runs on Windows machine)
const DEFAULT_SNOOPER_URL = process.env.FOXIT_SNOOPER_URL || 'http://192.168.100.110:3456';

/**
 * Get the snooper URL, allowing override via query param or header
 */
function getSnooperUrl(req) {
  // Check for custom URL in query param or header
  const customUrl = req.query.snooperUrl || req.headers['x-foxit-snooper-url'];
  if (customUrl && customUrl.trim()) {
    // Validate it looks like a URL
    try {
      new URL(customUrl);
      return customUrl.trim().replace(/\/$/, ''); // Remove trailing slash
    } catch (e) {
      // Invalid URL, use default
    }
  }
  return DEFAULT_SNOOPER_URL;
}

/**
 * Helper to fetch from Foxit snooper
 */
async function fetchFromSnooper(path, req) {
  const snooperUrl = getSnooperUrl(req);
  try {
    const response = await fetch(`${snooperUrl}${path}`);
    if (!response.ok) {
      throw new Error(`Snooper returned ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    // Snooper not running or not reachable
    throw new Error(`Foxit snooper not available: ${error.message}`);
  }
}

/**
 * GET /api/foxit/books
 * Get books for the snooper mapping UI (no auth required, uses user 1)
 */
router.get('/books', async (req, res) => {
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
router.get('/info', async (req, res) => {
  try {
    const data = await fetchFromSnooper('/info', req);
    res.json(data);
  } catch (error) {
    // Return a structured response even when snooper is not available
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
router.get('/documents', async (req, res) => {
  try {
    const data = await fetchFromSnooper('/documents', req);
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
router.get('/mappings', async (req, res) => {
  try {
    const data = await fetchFromSnooper('/mappings', req);
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
router.post('/mapping', async (req, res) => {
  try {
    const { document_title, object_id, book_title } = req.body;
    const snooperUrl = getSnooperUrl(req);
    
    if (!document_title || !object_id) {
      return res.status(400).json({ error: 'document_title and object_id are required' });
    }
    
    const response = await fetch(`${snooperUrl}/mapping`, {
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
router.delete('/mapping', async (req, res) => {
  try {
    const { doc } = req.query;
    const snooperUrl = getSnooperUrl(req);
    
    if (!doc) {
      return res.status(400).json({ error: 'doc query parameter is required' });
    }
    
    const response = await fetch(`${snooperUrl}/mapping?doc=${encodeURIComponent(doc)}`, {
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
router.get('/health', async (req, res) => {
  try {
    const data = await fetchFromSnooper('/health', req);
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
router.get('/page-for-object/:id', async (req, res) => {
  try {
    const data = await fetchFromSnooper(`/page-for-object?id=${req.params.id}`, req);
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
 * Receive progress update pushed from the Foxit snooper
 * Body: { object_id, current_page, document_title }
 * 
 * This endpoint is called by the snooper when auto-push is enabled.
 * It updates the book's reading progress in the database.
 */
router.post('/push-progress', async (req, res) => {
  try {
    const { object_id, current_page, document_title } = req.body;
    
    // Optional: Verify snooper token for security
    // const token = req.headers['x-snooper-token'];
    // if (token !== process.env.FOXIT_SNOOPER_TOKEN) {
    //   return res.status(401).json({ error: 'Invalid snooper token' });
    // }
    
    if (!object_id || current_page === undefined) {
      return res.status(400).json({ error: 'object_id and current_page are required' });
    }
    
    // First, get the object to retrieve page_count for percent calculation
    const existingObject = await UserObject.findById(object_id);
    if (!existingObject) {
      return res.status(404).json({ error: 'Object not found' });
    }
    
    const pageNum = parseInt(current_page, 10);
    const pageCount = existingObject.metadata?.source?.page_count;
    
    // Calculate percent if we have page_count
    let percent = null;
    if (pageCount && pageCount > 0) {
      percent = Math.round((pageNum / pageCount) * 100);
    }
    
    console.log(`[Foxit Push] Updating ${object_id} to page ${pageNum}/${pageCount} (${percent}%) - ${document_title}`);
    
    // Update the object's user state (progress.current_page and progress.percent)
    // updateUserState merges at the 'user' level, so we need to nest inside 'progress'
    const userState = {
      progress: {
        current_page: pageNum,
        ...(percent !== null && { percent })
      }
    };
    
    const object = await UserObject.updateUserState(object_id, userState);
    
    // Emit socket event to notify connected clients
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
