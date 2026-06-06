const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const UserObject = require('../models/UserObject');

// Get all objects for the current user
// GET /api/objects?type=book
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.id || 1; // Default to user 1 if no auth
    const { type } = req.query;
    
    const objects = await UserObject.findByUserId(userId, type || null);
    res.json(objects);
  } catch (error) {
    console.error('Error fetching objects:', error);
    res.status(500).json({ message: 'Error fetching objects', error: error.message });
  }
});

// Search objects (for @mention autocomplete)
// GET /api/objects/search?q=haunted&type=book
router.get('/search', async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const { q, type, limit } = req.query;
    
    if (!q || q.trim().length === 0) {
      return res.json([]);
    }
    
    const objects = await UserObject.search(userId, q.trim(), type || null, limit || 10);
    res.json(objects);
  } catch (error) {
    console.error('Error searching objects:', error);
    res.status(500).json({ message: 'Error searching objects', error: error.message });
  }
});

// Get a single object by ID
// GET /api/objects/:id
router.get('/:id', async (req, res) => {
  try {
    const object = await UserObject.findById(req.params.id);
    
    if (!object) {
      return res.status(404).json({ message: 'Object not found' });
    }
    
    res.json(object);
  } catch (error) {
    console.error('Error fetching object:', error);
    res.status(500).json({ message: 'Error fetching object', error: error.message });
  }
});

// Create a new object
// POST /api/objects
router.post('/', async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const { type, title, thumbnail_url, source_url, metadata } = req.body;
    
    if (!type || !title) {
      return res.status(400).json({ message: 'Type and title are required' });
    }
    
    const object = await UserObject.create({
      user_id: userId,
      type,
      title,
      thumbnail_url,
      source_url,
      metadata
    });
    
    res.status(201).json(object);
  } catch (error) {
    // Handle unique constraint violation (duplicate source_url)
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Object with this source URL already exists' });
    }
    console.error('Error creating object:', error);
    res.status(500).json({ message: 'Error creating object', error: error.message });
  }
});

// Find or create object (upsert by source_url)
// POST /api/objects/find-or-create
router.post('/find-or-create', async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const { type, title, thumbnail_url, source_url, metadata } = req.body;
    
    if (!type || !title) {
      return res.status(400).json({ message: 'Type and title are required' });
    }
    
    const { object, created } = await UserObject.findOrCreate({
      user_id: userId,
      type,
      title,
      thumbnail_url,
      source_url,
      metadata
    });
    
    res.status(created ? 201 : 200).json({ object, created });
  } catch (error) {
    console.error('Error finding/creating object:', error);
    res.status(500).json({ message: 'Error finding/creating object', error: error.message });
  }
});

// Update an object
// PATCH /api/objects/:id
router.patch('/:id', async (req, res) => {
  try {
    const { title, thumbnail_url, metadata } = req.body;
    
    const object = await UserObject.update(req.params.id, {
      title,
      thumbnail_url,
      metadata
    });
    
    if (!object) {
      return res.status(404).json({ message: 'Object not found' });
    }
    
    res.json(object);
  } catch (error) {
    console.error('Error updating object:', error);
    res.status(500).json({ message: 'Error updating object', error: error.message });
  }
});

// Update user state (reading progress, etc.)
// PATCH /api/objects/:id/user-state
router.patch('/:id/user-state', async (req, res) => {
  try {
    console.log(`[USER-STATE] PATCH request received for object ${req.params.id}`);
    console.log(`[USER-STATE] Request body:`, req.body);

    const userState = req.body;

    if (!userState || Object.keys(userState).length === 0) {
      console.log(`[USER-STATE] Empty user state, returning 400`);
      return res.status(400).json({ message: 'User state updates required' });
    }

    const object = await UserObject.updateUserState(req.params.id, userState);
    console.log(`[USER-STATE] Updated object:`, object?.id);

    if (!object) {
      return res.status(404).json({ message: 'Object not found' });
    }

    res.json({ object });
  } catch (error) {
    console.error('Error updating object user state:', error);
    res.status(500).json({ message: 'Error updating object user state', error: error.message });
  }
});

// Delete an object
// DELETE /api/objects/:id
router.delete('/:id', async (req, res) => {
  try {
    const object = await UserObject.delete(req.params.id);
    
    if (!object) {
      return res.status(404).json({ message: 'Object not found' });
    }
    
    res.json({ message: 'Object deleted successfully', object });
  } catch (error) {
    console.error('Error deleting object:', error);
    res.status(500).json({ message: 'Error deleting object', error: error.message });
  }
});

// Get all notes referencing an object (backlinks)
// GET /api/objects/:id/notes
router.get('/:id/notes', async (req, res) => {
  try {
    const notes = await UserObject.getReferencingNotes(req.params.id);
    res.json(notes);
  } catch (error) {
    console.error('Error fetching object backlinks:', error);
    res.status(500).json({ message: 'Error fetching object backlinks', error: error.message });
  }
});

// Link object to note
// POST /api/objects/:id/link/:noteId
router.post('/:id/link/:noteId', async (req, res) => {
  try {
    const link = await UserObject.linkToNote(req.params.id, req.params.noteId);
    res.status(201).json(link);
  } catch (error) {
    console.error('Error linking object to note:', error);
    res.status(500).json({ message: 'Error linking object to note', error: error.message });
  }
});

// Unlink object from note
// DELETE /api/objects/:id/link/:noteId
router.delete('/:id/link/:noteId', async (req, res) => {
  try {
    await UserObject.unlinkFromNote(req.params.id, req.params.noteId);
    res.json({ message: 'Object unlinked from note' });
  } catch (error) {
    console.error('Error unlinking object from note:', error);
    res.status(500).json({ message: 'Error unlinking object from note', error: error.message });
  }
});

// Migration endpoint: Convert legacy bookCard nodes to objectCard nodes
// POST /api/objects/migrate-book-cards
router.post('/migrate-book-cards', async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const db = require('../db');
    const { JSDOM } = require('jsdom');
    
    console.log('[migrate-book-cards] Starting migration...');
    
    // Find all notes with bookCard in their content (HTML format)
    const notesResult = await db.query(`
      SELECT id, content FROM notes 
      WHERE content LIKE '%data-type="book-card"%'
         OR content LIKE '%data-type=\\"book-card\\"%'
    `);
    
    const notes = notesResult.rows;
    console.log(`[migrate-book-cards] Found ${notes.length} notes with book cards`);
    
    let migratedCount = 0;
    let objectsCreated = 0;
    const errors = [];
    
    for (const note of notes) {
      try {
        let content = note.content;
        if (!content) continue;
        
        // Parse HTML content
        const dom = new JSDOM(`<body>${content}</body>`);
        const doc = dom.window.document;
        
        // Find all book-card divs
        const bookCards = doc.querySelectorAll('div[data-type="book-card"]');
        
        if (bookCards.length === 0) {
          console.log(`[migrate-book-cards] Note ${note.id}: No book cards found in DOM`);
          continue;
        }
        
        console.log(`[migrate-book-cards] Note ${note.id}: Found ${bookCards.length} book cards`);
        
        for (const cardDiv of bookCards) {
          // Extract attributes from the div
          const attrs = {
            title: cardDiv.getAttribute('title'),
            author: cardDiv.getAttribute('author'),
            cover: cardDiv.getAttribute('cover'),
            url: cardDiv.getAttribute('url'),
            rating: cardDiv.getAttribute('rating'),
            pages: cardDiv.getAttribute('pages'),
            total_pages: cardDiv.getAttribute('total_pages'),
            current_page: cardDiv.getAttribute('current_page'),
            published_year: cardDiv.getAttribute('published_year'),
            is_finished: cardDiv.getAttribute('is_finished') === 'true'
          };
          
          console.log(`[migrate-book-cards] Processing book: ${attrs.title}`);
          
          // Create or find object
          const { object, created } = await UserObject.findOrCreate({
            user_id: userId,
            type: 'book',
            title: attrs.title || 'Unknown Book',
            thumbnail_url: attrs.cover,
            source_url: attrs.url,
            metadata: {
              source: {
                title: attrs.title,
                author: attrs.author,
                year: attrs.published_year ? parseInt(attrs.published_year) : null,
                rating: attrs.rating ? parseFloat(attrs.rating) : null,
                cover_url: attrs.cover,
                goodreads_url: attrs.url,
                page_count: attrs.total_pages ? parseInt(attrs.total_pages) : null
              },
              user: {
                status: attrs.is_finished ? 'finished' : (attrs.current_page ? 'reading' : 'want_to_read'),
                progress: attrs.current_page ? {
                  current_page: parseInt(attrs.current_page) || 0,
                  percent: attrs.total_pages ? Math.round((parseInt(attrs.current_page) / parseInt(attrs.total_pages)) * 100) : 0
                } : null,
                finished_at: attrs.is_finished ? new Date().toISOString() : null
              }
            }
          });
          
          if (created) {
            objectsCreated++;
            console.log(`[migrate-book-cards] Created object ${object.id} for "${attrs.title}"`);
          } else {
            console.log(`[migrate-book-cards] Found existing object ${object.id} for "${attrs.title}"`);
          }
          
          // Replace the book-card div with object-card div
          const newDiv = doc.createElement('div');
          newDiv.setAttribute('data-type', 'object-card');
          newDiv.setAttribute('objectid', object.id);
          newDiv.setAttribute('objecttype', 'book');
          
          cardDiv.parentNode.replaceChild(newDiv, cardDiv);
        }
        
        // Get updated HTML (without the wrapper body tag)
        const newContent = doc.body.innerHTML;
        
        if (newContent !== content) {
          // Update the note
          await db.query(
            'UPDATE notes SET content = $1, updated_at = NOW() WHERE id = $2',
            [newContent, note.id]
          );
          migratedCount++;
          console.log(`[migrate-book-cards] Updated note ${note.id}`);
        }
      } catch (noteError) {
        console.error(`[migrate-book-cards] Error processing note ${note.id}:`, noteError);
        errors.push({ noteId: note.id, error: noteError.message });
      }
    }
    
    console.log(`[migrate-book-cards] Migration complete. Notes: ${migratedCount}, Objects created: ${objectsCreated}`);
    
    res.json({
      success: true,
      notesScanned: notes.length,
      notesMigrated: migratedCount,
      objectsCreated,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('[migrate-book-cards] Migration failed:', error);
    res.status(500).json({ message: 'Error migrating book cards', error: error.message });
  }
});

module.exports = router;
