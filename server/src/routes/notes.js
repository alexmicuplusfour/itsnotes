const express = require('express');
const Note = require('../models/Note');
const Tag = require('../models/Tag');
const NoteImage = require('../models/NoteImage');
const UserObject = require('../models/UserObject');
const db = require('../db');
const axios = require('axios');
const { chromium } = require('playwright');
//const puppeteer = require('puppeteer');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const router = express.Router();
const archiver = require('archiver');
const { htmlToText } = require('html-to-text');
const path = require('path');
const sharp = require('sharp');
const ogs = require('open-graph-scraper');
const { extractExternalId } = require('../utils/extractExternalId');
require('dotenv').config();


// Get all notes (with pagination)
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 80, 
      archived = false, 
      deleted = false, 
      oldestFirst = false,
      includeDetails = false,
      truncateContent = true,
      contentLimit = 401,
      sortCriteria = null
    } = req.query;
    
    const notes = await Note.findAll({
      page: parseInt(page),
      limit: parseInt(limit),
      archived: archived === 'true',
      deleted: deleted === 'true',
      oldestFirst: oldestFirst === 'true',
      includeDetails: includeDetails === 'true',
      truncateContent: truncateContent === 'true' || truncateContent === true,
      contentLimit: parseInt(contentLimit) || 601,
      sortCriteria: sortCriteria
    });

    // Always add objects to notes
    if (notes.length > 0) {
      await Note.addObjects(notes);
    }

    const totalCount = await Note.getCount({
      archived: archived === 'true',
      deleted: deleted === 'true'
    });

    res.json({
      notes,
      totalCount,
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ message: 'Error fetching notes', error: error.message });
  }
});

// Search notes
router.get('/search', async (req, res) => {
  try {
    // Accept sortOrder instead of oldestFirst
    const {
      query,
      page = 1,
      limit = 80,
      sortOrder = 'updatedAt_desc',
      includeDetails = false,
      truncateContent = true,
      contentLimit = 601,
      tagIds
    } = req.query;

    console.log('[ROUTE /search] Received query:', query);

    if (!query) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    let tagIdMap = {};
    if (tagIds) {
      try { tagIdMap = JSON.parse(tagIds); } catch (e) { /* ignore malformed */ }
    }

    // Pass sortOrder directly to Note.search
    const notes = await Note.search(
      query,
      parseInt(page),
      parseInt(limit),
      sortOrder,
      truncateContent === 'true' || truncateContent === true,
      parseInt(contentLimit) || 601,
      tagIdMap
    );

    // Include tags and images if requested
    if (includeDetails === 'true' && notes.length > 0) {
      await Note.addTagsAndImages(notes);
    }

    // Always add objects to notes
    if (notes.length > 0) {
      await Note.addObjects(notes);
    }

    const totalCount = await Note.getSearchCount(query, tagIdMap);
    
    res.json({
      notes,
      totalCount,
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error('Error searching notes:', error);
    res.status(500).json({ message: 'Error searching notes', error: error.message });
  }
});

// Get ALL trashed notes (for empty trash functionality)
router.get('/all-trashed', async (req, res) => {
  try {
    console.log('Getting all trashed notes for empty trash operation');
    
    // Get all trashed notes without pagination
    const notes = await Note.findAll({
      page: 1,
      limit: 999999, // Very high limit to get all
      archived: false,
      deleted: true,
      oldestFirst: false,
      includeDetails: false, // We only need IDs
      truncateContent: true,
      contentLimit: 1 // Minimal content since we only need IDs
    });
    
    // Extract just the IDs for bulk deletion
    const noteIds = notes.map(note => note.id);
    
    console.log(`Found ${noteIds.length} trashed notes for bulk deletion`);
    
    res.json({
      noteIds,
      count: noteIds.length
    });
  } catch (error) {
    console.error('Error fetching all trashed notes:', error);
    res.status(500).json({ message: 'Error fetching all trashed notes', error: error.message });
  }
});

// Get a single note by ID
router.get('/:id', async (req, res) => {
  try {
    const { includeDetails = false, fullImages = false } = req.query;
    const note = await Note.findById(
      req.params.id, 
      includeDetails === 'true', 
      fullImages === 'true'
    );
    
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }
    res.json(note);
  } catch (error) {
    console.error('Error fetching note:', error);
    res.status(500).json({ message: 'Error fetching note', error: error.message });
  }
});

// Create a new note
router.post('/', async (req, res) => {
  try {
    const { title, content, is_pinned, color, created_at } = req.body;
    if (!content && !title) {
      //return res.status(400).json({ message: 'Note must have a title or content' });
    }
    
    const note = await Note.create({
      title: title || '',
      content: content || '',
      is_pinned: is_pinned || false,
      color: color || 'default',
      created_at: created_at
    });

    // Sync object cards to note_objects table
    if (content) {
      try {
        const UserObject = require('../models/UserObject');
        const { JSDOM } = require('jsdom');

        // Parse HTML and extract object cards (not mentions)
        const dom = new JSDOM(content);
        const objectCards = dom.window.document.querySelectorAll('div[data-type="object-card"]');

        const objectIds = [];
        objectCards.forEach(card => {
          const objectId = card.getAttribute('objectid');
          if (objectId && !objectIds.includes(objectId)) {
            objectIds.push(objectId);
          }
        });

        // Sync the links
        if (objectIds.length > 0) {
          await UserObject.syncNoteLinks(note.id, objectIds);
          console.log(`[Object Links] Synced ${objectIds.length} object links for new note ${note.id}`);
        }
      } catch (error) {
        console.error(`[Object Links] Error syncing object links for new note ${note.id}:`, error);
        // Don't fail the whole creation if object syncing fails
      }
    }

    // For debugging the socket.io connection
    console.log('[SERVER] Broadcasting new note created:', note);
    req.app.get('io').emit('note_created', note);

    res.status(201).json({ note });
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ message: 'Error creating note', error: error.message });
  }
});

// Update a note
router.put('/:id', async (req, res) => {
  const noteId = req.params.id;
  const { title, content, is_pinned, is_archived, is_deleted, color } = req.body;
  const MAX_VERSIONS_TO_KEEP = 8; // Keep your existing constants
  const VERSION_INTERVAL_MS = 30 * 60 * 1000;

  try {
    // 1. Fetch the current state BEFORE any updates (as you already do)
    const currentNote = await Note.findById(noteId); // Fetch without details initially is fine here

    if (!currentNote) {
      return res.status(404).json({ message: 'Note not found for update' });
    }

    // --- Version History Logic (Keep your existing logic here) ---
    let versionSaved = false;
    const incomingTitle = title !== undefined ? title : currentNote.title;
    const incomingContent = content !== undefined ? content : currentNote.content;
    const contentActuallyChanged = incomingTitle !== currentNote.title || incomingContent !== currentNote.content;

    if (contentActuallyChanged) {
      const now = new Date();
      const lastVersionQuery = `SELECT id, created_at FROM note_versions WHERE note_id = $1 ORDER BY created_at DESC LIMIT 1`;
      const lastVersionResult = await db.query(lastVersionQuery, [noteId]);

      // Check time since the last version was created (not the note's last update)
      // This prevents the 30-min window from staying open indefinitely with continuous edits
      const shouldCreateNewVersion = !lastVersionResult.rows.length ||
        (now.getTime() - new Date(lastVersionResult.rows[0].created_at).getTime() > VERSION_INTERVAL_MS);

      // Convert HTML content to plain text for version storage
      const { convertHtmlToPlainText } = require('../utils/htmlToPlainText');
      const textToConvert = incomingContent; // Use the new content being saved
      const plainContent = textToConvert ? convertHtmlToPlainText(textToConvert) : '';
      
      // Don't create/update a version if both content and title are empty or just whitespace
      const contentIsEmpty = !plainContent.trim();
      const titleIsEmpty = !incomingTitle?.trim();
      
      if (!contentIsEmpty || !titleIsEmpty) {
        if (shouldCreateNewVersion) {
          // Create a NEW version with both plain text and raw HTML content
          const insertVersionQuery = `INSERT INTO note_versions (note_id, title, content, raw_content) VALUES ($1, $2, $3, $4)`;
          await db.query(insertVersionQuery, [noteId, incomingTitle, plainContent, incomingContent]);
          versionSaved = true;
          console.log(`[Version History] Created new version for note ${noteId}.`);

          // Pruning logic - remove old versions beyond the limit
          const pruneQuery = `DELETE FROM note_versions WHERE id IN (SELECT id FROM note_versions WHERE note_id = $1 ORDER BY created_at DESC OFFSET $2)`;
          await db.query(pruneQuery, [noteId, MAX_VERSIONS_TO_KEEP]);
        } else {
          // Update the MOST RECENT version with the new content (both plain and raw)
          // Note: We do NOT update created_at, so the 30-min window closes after 30 actual minutes
          const lastVersionId = lastVersionResult.rows[0].id;
          const updateVersionQuery = `UPDATE note_versions SET title = $1, content = $2, raw_content = $3 WHERE id = $4`;
          await db.query(updateVersionQuery, [incomingTitle, plainContent, incomingContent, lastVersionId]);
          versionSaved = true;
          console.log(`[Version History] Updated most recent version for note ${noteId} (within time threshold).`);
        }
      } else {
        console.log(`[Version History] Skipping version save/update for note ${noteId} - content is empty.`);
      }
    } else {
      console.log(`[Version History] Skipping version save for note ${noteId}: No content change.`);
    }
    // --- End Version History Logic ---

    // 7. Determine if the main table needs an update (as you already do)
    const needsMainTableUpdate =
         contentActuallyChanged ||
         (color !== undefined && color !== currentNote.color) ||
         (is_pinned !== undefined && is_pinned !== currentNote.is_pinned) ||
         (is_archived !== undefined && is_archived !== currentNote.is_archived) ||
         (is_deleted !== undefined && is_deleted !== currentNote.is_deleted);

    // 8. Update the main 'notes' table ONLY if necessary (as you already do)
    if (needsMainTableUpdate) {
      console.log(`[Main Table] Updating main note record for ${noteId}.`);
      // Note.update only modifies the DB, doesn't need to return full details here
      const updateSuccess = await Note.update(noteId, {
        title: incomingTitle,
        content: incomingContent,
        is_pinned,
        is_archived,
        is_deleted,
        color
        // Assuming Note.update handles undefined values correctly
      });

      if (!updateSuccess) {
         // Handle case where Note.update itself indicates failure if it returns boolean/null
         console.error(`[ERROR] Note.update function reported failure for note ${noteId}.`);
         return res.status(500).json({ message: 'Failed to update note record in database.' });
      }
      console.log(`[Main Table] Main record update successful for ${noteId}.`);

    } else {
       console.log(`[Main Table] Skipping main note update for ${noteId} as no changes needed.`);
    }

    // Sync object cards to note_objects table
    if (contentActuallyChanged && incomingContent) {
      try {
        const UserObject = require('../models/UserObject');
        const { JSDOM } = require('jsdom');

        // Parse HTML and extract object cards (not mentions)
        const dom = new JSDOM(incomingContent);
        const objectCards = dom.window.document.querySelectorAll('div[data-type="object-card"]');

        console.log(`[Object Links] Found ${objectCards.length} object cards in HTML`);

        const objectIds = [];
        objectCards.forEach((card, index) => {
          const objectId = card.getAttribute('objectid');
          const objectType = card.getAttribute('objecttype');
          console.log(`[Object Links] Card ${index}: objectid="${objectId}", objecttype="${objectType}"`);
          console.log(`[Object Links] Card ${index} HTML:`, card.outerHTML);
          if (objectId && !objectIds.includes(objectId)) {
            objectIds.push(objectId);
          }
        });

        // Sync the links
        await UserObject.syncNoteLinks(noteId, objectIds);
        console.log(`[Object Links] Synced ${objectIds.length} object links for note ${noteId}:`, objectIds);
      } catch (error) {
        console.error(`[Object Links] Error syncing object links for note ${noteId}:`, error);
        // Don't fail the whole update if object syncing fails
      }
    }

    // *** 9. CRITICAL FIX: ALWAYS Fetch the final state WITH DETAILS ***
    // Regardless of whether the main table was updated or just a version was saved,
    // fetch the note again with includeDetails=true to get the latest full state.
    console.log(`[Final Fetch] Fetching complete details for note ${noteId} before responding.`);
    const finalNoteWithDetails = await Note.findById(noteId, true); // includeDetails = true

    if (!finalNoteWithDetails) {
      // Defensive check: This shouldn't happen if the note existed initially
      console.error(`[ERROR] Could not fetch final details for note ${noteId} after update operations.`);
      return res.status(404).json({ message: 'Note could not be found after update process.' });
    }

    // Add objects to the note
    await Note.addObjects([finalNoteWithDetails]);

    // 10. Emit socket event ONLY if the main note record was actually changed
    if (needsMainTableUpdate) {
      console.log('[SERVER] Broadcasting note updated:', finalNoteWithDetails);
      // Send the FULL note object with details in the socket event
      req.app.get('io').emit('note_updated', finalNoteWithDetails);
    }

    // 11. Respond with the complete note object including images/tags
    console.log(`[Response] Sending final note details for ${noteId}. Images count: ${finalNoteWithDetails.images?.length}`);
    res.json({ note: finalNoteWithDetails });

  } catch (error) {
    console.error(`Error updating note ${noteId}:`, error);
    // Avoid sending generic 500 if it was a 404 handled earlier
    if (res.headersSent) return;
    if (error.message.includes('Note not found')) {
        return res.status(404).json({ message: 'Note not found during update process', error: error.message });
    }
    res.status(500).json({ message: 'Error updating note', error: error.message });
  }
});


// Delete a note permanently
router.delete('/:id', async (req, res) => {
  try {
    // First, check if the note exists and if it's archived
    const existingNote = await Note.findById(req.params.id);
    if (!existingNote) {
      return res.status(404).json({ message: 'Note not found' });
    }
    
    // If the note is archived, unarchive it first
    // This ensures we can permanently delete it
    if (existingNote.is_archived) {
      console.log(`Note ${req.params.id} is archived. Unarchiving before deletion.`);
      // Just update is_archived status in the database directly to avoid socket events
      await db.query('UPDATE notes SET is_archived = false WHERE id = $1', [req.params.id]);
    }
    
    // Now permanently delete the note
    const note = await Note.delete(req.params.id);
    
    // For debugging the socket.io connection
    console.log('[SERVER] Broadcasting note deleted:', note.id);
    req.app.get('io').emit('note_deleted', note.id);
    
    res.json({ message: 'Note deleted successfully', note });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ message: 'Error deleting note', error: error.message });
  }
});

// Archive a note
router.patch('/:id/archive', async (req, res) => {
  try {
    const note = await Note.update(req.params.id, { is_archived: true });
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }
    
    // For debugging the socket.io connection
    console.log('[SERVER] Broadcasting note archived:', note);
    req.app.get('io').emit('note_updated', note);
    
    res.json({ note });
  } catch (error) {
    console.error('Error archiving note:', error);
    res.status(500).json({ message: 'Error archiving note', error: error.message });
  }
});

// Unarchive a note
router.patch('/:id/unarchive', async (req, res) => {
  try {
    const note = await Note.update(req.params.id, { is_archived: false });
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }
    
    // For debugging the socket.io connection
    console.log('[SERVER] Broadcasting note unarchived:', note);
    req.app.get('io').emit('note_updated', note);
    
    res.json({ note });
  } catch (error) {
    console.error('Error unarchiving note:', error);
    res.status(500).json({ message: 'Error unarchiving note', error: error.message });
  }
});

// Move a note to trash
router.patch('/:id/trash', async (req, res) => {
  try {
    const note = await Note.update(req.params.id, { is_deleted: true });
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }
    
    // For debugging the socket.io connection
    console.log('[SERVER] Broadcasting note trashed:', note);
    req.app.get('io').emit('note_updated', note);
    
    res.json({ note });
  } catch (error) {
    console.error('Error trashing note:', error);
    res.status(500).json({ message: 'Error trashing note', error: error.message });
  }
});

// Restore a note from trash
router.patch('/:id/restore', async (req, res) => {
  try {
    const note = await Note.update(req.params.id, { is_deleted: false });
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }
    
    // For debugging the socket.io connection
    console.log('[SERVER] Broadcasting note restored:', note);
    req.app.get('io').emit('note_updated', note);
    
    res.json({ note });
  } catch (error) {
    console.error('Error restoring note:', error);
    res.status(500).json({ message: 'Error restoring note', error: error.message });
  }
});

// Pin/unpin a note
router.patch('/:id/pin', async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }
    
    const newPinStatus = !note.is_pinned;
    const now = 'CURRENT_TIMESTAMP';
    let setClauses = ['is_pinned = $1', 'updated_at = ' + now];
    let queryParams = [newPinStatus];

    if (newPinStatus) { // Pinning
      setClauses.push(`pinned_at = ${now}`);
      setClauses.push(`unpinned_at = NULL`);
    } else { // Unpinning
      setClauses.push(`unpinned_at = ${now}`);
      setClauses.push(`pinned_at = NULL`);
    }

    queryParams.push(req.params.id); // Add the note ID as the last parameter

    const query = `
      UPDATE notes 
      SET ${setClauses.join(', ')}
      WHERE id = $${queryParams.length} 
      RETURNING *
    `;
    
    const result = await db.query(query, queryParams);
    
    // Ensure the note was actually updated before proceeding
    if (result.rows.length === 0) {
        // This case might occur if the ID was valid initially but deleted concurrently
        console.error(`[Pin Toggle] Failed to update note ${req.params.id}, possibly deleted concurrently.`);
        return res.status(404).json({ message: 'Note not found during pin update' });
    }
    
    const updatedNote = result.rows[0];

    // Fetch full details (tags/images/objects) for the socket event and response
    // Use the Note model's method for consistency
    await Note.addTagsAndImages([updatedNote]);
    await Note.addObjects([updatedNote]);

    // For debugging the socket.io connection
    console.log('[SERVER] Broadcasting note pin toggled:', updatedNote);
    req.app.get('io').emit('note_updated', updatedNote);

    res.json({ note: updatedNote });
  } catch (error) {
    console.error('Error toggling pin status:', error);
    res.status(500).json({ message: 'Error toggling pin status', error: error.message });
  }
});

// Change note color
router.patch('/:id/color', async (req, res) => {
  try {
    const { color } = req.body;
    if (!color) {
      return res.status(400).json({ message: 'Color is required' });
    }
    
    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }
    
    await Note.update(req.params.id, { color });
    
    // Fetch the complete note with details (tags, images, metadata) for socket event
    const updatedNoteWithDetails = await Note.findById(req.params.id, true);
    
    // For debugging the socket.io connection
    console.log('[SERVER] Broadcasting note color changed:', updatedNoteWithDetails);
    req.app.get('io').emit('note_updated', updatedNoteWithDetails);
    
    res.json({ note: updatedNoteWithDetails });
  } catch (error) {
    console.error('Error changing note color:', error);
    res.status(500).json({ message: 'Error changing note color', error: error.message });
  }
});

// --- Bulk Actions ---

// Bulk Archive Notes
router.post('/bulk/archive', async (req, res) => {
  try {
    const { noteIds } = req.body;
    if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
      return res.status(400).json({ message: 'Note IDs array is required.' });
    }
    // 1. Perform the bulk update
    const count = await Note.bulkUpdate(noteIds, { is_archived: true });

    // --- START ADDED CODE ---
    // 2. Fetch the updated notes (important to get latest state like updated_at)
    //    Use includeDetails: true so the socket event sends the same structure
    //    as individual updates.
    const updatedNotes = await Note.findManyByIds(noteIds, true); // Fetch with details

    // 3. Emit individual 'note_updated' events
    updatedNotes.forEach(note => {
      console.log(`[SOCKET] Emitting note_updated for bulk archived note: ${note.id}`);
      req.app.get('io').emit('note_updated', note);
    });
    // --- END ADDED CODE ---

    res.json({ message: `${count} notes archived successfully.` });
  } catch (error) {
    console.error('Error bulk archiving notes:', error);
    res.status(500).json({ message: 'Error bulk archiving notes', error: error.message });
  }
});

// Bulk Unarchive Notes
router.post('/bulk/unarchive', async (req, res) => {
  try {
    const { noteIds } = req.body;
    if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
      return res.status(400).json({ message: 'Note IDs array is required.' });
    }
    // 1. Perform the bulk update
    const count = await Note.bulkUpdate(noteIds, { is_archived: false });

    // --- START ADDED CODE ---
    // 2. Fetch the updated notes
    const updatedNotes = await Note.findManyByIds(noteIds, true); // Fetch with details

    // 3. Emit individual 'note_updated' events
    updatedNotes.forEach(note => {
      console.log(`[SOCKET] Emitting note_updated for bulk unarchived note: ${note.id}`);
      req.app.get('io').emit('note_updated', note);
    });
    // --- END ADDED CODE ---

    res.json({ message: `${count} notes unarchived successfully.` });
  } catch (error) {
    console.error('Error bulk unarchiving notes:', error);
    res.status(500).json({ message: 'Error bulk unarchiving notes', error: error.message });
  }
});


// Bulk Trash Notes
router.post('/bulk/trash', async (req, res) => {
  try {
    const { noteIds } = req.body;
    if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
      return res.status(400).json({ message: 'Note IDs array is required.' });
    }
    // 1. Perform the bulk update
    const count = await Note.bulkUpdate(noteIds, { is_deleted: true });

    // --- START ADDED CODE ---
    // 2. Fetch the updated notes
    const updatedNotes = await Note.findManyByIds(noteIds, true); // Fetch with details

    // 3. Emit individual 'note_updated' events
    updatedNotes.forEach(note => {
      console.log(`[SOCKET] Emitting note_updated for bulk trashed note: ${note.id}`);
      req.app.get('io').emit('note_updated', note);
    });
    // --- END ADDED CODE ---

    res.json({ message: `${count} notes moved to trash successfully.` });
  } catch (error) {
    console.error('Error bulk trashing notes:', error);
    res.status(500).json({ message: 'Error bulk trashing notes', error: error.message });
  }
});


// Bulk Restore Notes from Trash
router.post('/bulk/restore', async (req, res) => {
  try {
    const { noteIds } = req.body;
    if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
      return res.status(400).json({ message: 'Note IDs array is required.' });
    }
    // 1. Perform the bulk update
    const count = await Note.bulkUpdate(noteIds, { is_deleted: false });

    // --- START ADDED CODE ---
    // 2. Fetch the updated notes
    const updatedNotes = await Note.findManyByIds(noteIds, true); // Fetch with details

    // 3. Emit individual 'note_updated' events
    updatedNotes.forEach(note => {
      console.log(`[SOCKET] Emitting note_updated for bulk restored note: ${note.id}`);
      req.app.get('io').emit('note_updated', note);
    });
    // --- END ADDED CODE ---

    res.json({ message: `${count} notes restored successfully.` });
  } catch (error) {
    console.error('Error bulk restoring notes:', error);
    res.status(500).json({ message: 'Error bulk restoring notes', error: error.message });
  }
});

// Bulk Delete Notes Permanently
router.post('/bulk/delete-permanently', async (req, res) => {
  try {
    const { noteIds } = req.body;
    if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
      return res.status(400).json({ message: 'Note IDs array is required.' });
    }

    // Check for archived notes first and unarchive them before deletion
    const archivedNoteIds = [];
    if (noteIds.length > 0) {
      const placeholders = noteIds.map((_, i) => `$${i + 1}`).join(',');
      const query = `SELECT id FROM notes WHERE id IN (${placeholders}) AND is_archived = true`;
      const result = await db.query(query, noteIds);
      
      if (result.rows.length > 0) {
        archivedNoteIds.push(...result.rows.map(row => row.id));
      }
    }
    
    // Unarchive any archived notes that need to be deleted
    if (archivedNoteIds.length > 0) {
      console.log(`Unarchiving ${archivedNoteIds.length} archived notes before bulk deletion`);
      const placeholders = archivedNoteIds.map((_, i) => `$${i + 1}`).join(',');
      await db.query(`UPDATE notes SET is_archived = false WHERE id IN (${placeholders})`, archivedNoteIds);
    }
    
    // 1. Perform the bulk delete
    // IMPORTANT: Keep a copy of the IDs before deleting, as you can't fetch them afterwards.
    const idsToDelete = [...noteIds]; // Make a copy
    const count = await Note.bulkDelete(idsToDelete);

    // 2. Emit individual 'note_deleted' events using the copied IDs
    idsToDelete.forEach(noteId => {
      console.log(`[SOCKET] Emitting note_deleted for bulk deleted note: ${noteId}`);
      req.app.get('io').emit('note_deleted', noteId); // Emit only the ID
    });

    res.json({ message: `${count} notes permanently deleted.` });
  } catch (error) {
    console.error('Error bulk deleting notes permanently:', error);
    res.status(500).json({ message: 'Error bulk deleting notes permanently', error: error.message });
  }
});

// Bulk Change Color
router.post('/bulk/color', async (req, res) => {
  try {
    const { noteIds, color } = req.body;
    if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
      return res.status(400).json({ message: 'Note IDs array is required.' });
    }
    if (!color) {
      return res.status(400).json({ message: 'Color is required.' });
    }
    // 1. Perform bulk update
    const count = await Note.bulkUpdate(noteIds, { color });

    // --- START ADDED CODE ---
    // 2. Fetch updated notes
    const updatedNotes = await Note.findManyByIds(noteIds, true); // Fetch with details

    // 3. Emit individual 'note_updated' events
    updatedNotes.forEach(note => {
      console.log(`[SOCKET] Emitting note_updated for bulk color change: ${note.id}`);
      req.app.get('io').emit('note_updated', note);
    });
    // --- END ADDED CODE ---

    res.json({ message: `Color changed for ${count} notes successfully.` });
  } catch (error) {
    console.error('Error bulk changing note color:', error);
    res.status(500).json({ message: 'Error bulk changing note color', error: error.message });
  }
});

// Tags relationship routes
// Get tags for a note
router.get('/:id/tags', async (req, res) => {
  try {
    const tags = await Tag.findTagsByNoteId(req.params.id);
    res.json({ tags });
  } catch (error) {
    console.error('Error fetching note tags:', error);
    res.status(500).json({ message: 'Error fetching note tags', error: error.message });
  }
});

// Add a tag to a note
router.post('/:id/tags', async (req, res) => {
  try {
    const { tagId } = req.body;
    
    if (!tagId) {
      return res.status(400).json({ message: 'Tag ID is required' });
    }
    
    // Verify both note and tag exist
    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }
    
    const tag = await Tag.findById(tagId);
    if (!tag) {
      return res.status(404).json({ message: 'Tag not found' });
    }
    
    // Add the tag to the note
    await Tag.addTagToNote(req.params.id, tagId);
    
    // Get all tags for the note
    const tags = await Tag.findTagsByNoteId(req.params.id);

    // Fetch the complete note with details (tags, images, objects, metadata) for socket event
    const updatedNoteWithDetails = await Note.findById(req.params.id, true);
    await Note.addObjects([updatedNoteWithDetails]);

    // Emit socket event with complete note details
    req.app.get('io').emit('note_updated', updatedNoteWithDetails);

    res.json({ tags });
  } catch (error) {
    console.error('Error adding tag to note:', error);
    res.status(500).json({ message: 'Error adding tag to note', error: error.message });
  }
});

// Remove a tag from a note
router.delete('/:id/tags/:tagId', async (req, res) => {
  try {
    // Verify both note and tag exist
    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }
    
    const tag = await Tag.findById(req.params.tagId);
    if (!tag) {
      return res.status(404).json({ message: 'Tag not found' });
    }
    
    // Remove the tag from the note
    await Tag.removeTagFromNote(req.params.id, req.params.tagId);
    
    // Get all tags for the note
    const tags = await Tag.findTagsByNoteId(req.params.id);

    // Fetch the complete note with details (tags, images, objects, metadata) for socket event
    const updatedNoteWithDetails = await Note.findById(req.params.id, true);
    await Note.addObjects([updatedNoteWithDetails]);

    // Emit socket event with complete note details
    req.app.get('io').emit('note_updated', updatedNoteWithDetails);

    res.json({ tags });
  } catch (error) {
    console.error('Error removing tag from note:', error);
    res.status(500).json({ message: 'Error removing tag from note', error: error.message });
  }
});

// --- Conversion Options for 'article' extraction (Axios FALLBACK path, WITH custom li) ---
// Used only if Puppeteer fails
const articleConversionOptions = {
    preserveNewlines: true,
    wordwrap: false,
    selectors: [
        { selector: 'p', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        // ... other h1-h6, br selectors ...
        { selector: 'h1', options: { uppercase: false, leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        { selector: 'h2', options: { uppercase: false, leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        { selector: 'h3', options: { uppercase: false, leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        { selector: 'h4', options: { uppercase: false, leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        { selector: 'h5', options: { uppercase: false, leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        { selector: 'h6', options: { uppercase: false, leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        { selector: 'br', format: 'lineBreak' },
        // *** Custom 'li' selector ENABLED for FALLBACK path ***
        {
            selector: 'li',
            format: 'listItem', // <<<< POTENTIAL ERROR SOURCE
            options: { itemPrefix: ' * ', leadingLineBreaks: 0, trailingLineBreaks: 1 }
        },
        // ******************************************************
        { selector: 'img', format: 'skip' },
        { selector: 'script', format: 'skip' },
        { selector: 'style', format: 'skip' },
        { selector: 'a', format: 'skip' }
    ]
};

// --- Conversion Options for PRIMARY (Puppeteer path, WITHOUT custom li) ---
const textConversionOptions = {
    preserveNewlines: true,
    wordwrap: false,
    selectors: [
        { selector: 'p', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        // ... other h1-h6, br selectors ...
        { selector: 'h1', options: { uppercase: false, leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        { selector: 'h2', options: { uppercase: false, leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        { selector: 'h3', options: { uppercase: false, leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        { selector: 'h4', options: { uppercase: false, leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        { selector: 'h5', options: { uppercase: false, leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        { selector: 'h6', options: { uppercase: false, leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        { selector: 'br', format: 'lineBreak' },
        // No specific 'li' selector - use html-to-text default handling
        { selector: 'img', format: 'skip' },
        { selector: 'script', format: 'skip' },
        { selector: 'style', format: 'skip' },
        { selector: 'a', format: 'skip' }
    ]
};
// --- End Conversion Options Definitions ---

// --- Image Processing Helper Functions ---
/**
 * Download an image from a URL and convert to base64
 */
async function downloadImageAsBase64(imageUrl, maxSize = 5 * 1024 * 1024) {
    try {
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 15000,
            maxContentLength: maxSize,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            }
        });

        // Check if it's actually an image by content type
        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.startsWith('image/')) {
            console.warn(`Invalid content type for image ${imageUrl}: ${contentType}`);
            return null;
        }

        // Convert to base64
        const base64 = Buffer.from(response.data).toString('base64');
        const dataUrl = `data:${contentType};base64,${base64}`;
        
        return {
            data: dataUrl,
            type: contentType,
            size: response.data.length
        };
    } catch (error) {
        console.error(`Failed to download image ${imageUrl}:`, error.message);
        return null;
    }
}

/**
 * Create a small thumbnail from base64 image data (160px for gallery/preview)
 */
async function createThumbnail(base64Data, size = 160) {
    try {
        // Remove data URL prefix to get just the base64 data
        const base64Image = base64Data.split(',')[1];
        const imageBuffer = Buffer.from(base64Image, 'base64');
        
        // Use sharp to create a square thumbnail
        const thumbnailBuffer = await sharp(imageBuffer)
            .resize(size, size, { 
                fit: 'cover',
                position: 'center'
            })
            .jpeg({ quality: 60 }) // Reasonable quality for small thumbnails
            .toBuffer();
            
        return `data:image/jpeg;base64,${thumbnailBuffer.toString('base64')}`;
    } catch (error) {
        console.error('Failed to create thumbnail:', error.message);
        // Return a smaller version of the original if thumbnail creation fails
        return base64Data;
    }
}

/**
 * Create a resized "full resolution" image for extracted content (700px width max, for inline display)
 */
async function createExtractedFullImage(base64Data) {
    try {
        // Remove data URL prefix to get just the base64 data
        const base64Image = base64Data.split(',')[1];
        const imageBuffer = Buffer.from(base64Image, 'base64');
        
        // Use sharp to resize to 700px width max, preserving aspect ratio
        const resizedBuffer = await sharp(imageBuffer)
            .resize(700, null, { 
                fit: 'inside',
                withoutEnlargement: true // Don't enlarge images smaller than 700px
            })
            .jpeg({ quality: 30 }) // Low quality for database storage
            .toBuffer();
            
        return `data:image/jpeg;base64,${resizedBuffer.toString('base64')}`;
    } catch (error) {
        console.error('Failed to create extracted full image:', error.message);
        // Return the original if resizing fails
        return base64Data;
    }
}

/**
 * Extract image URLs from HTML content
 */
function extractImageUrls(html, baseUrl) {
    const dom = new JSDOM(html);
    const images = dom.window.document.querySelectorAll('img');
    const imageUrls = [];
    
    images.forEach(img => {
        let src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
        if (src) {
            try {
                // Convert relative URLs to absolute
                const absoluteUrl = new URL(src, baseUrl).href;
                // Basic filtering - skip very small images, icons, etc.
                const width = parseInt(img.width) || 0;
                const height = parseInt(img.height) || 0;
                const alt = img.alt || '';
                
                // Skip tiny images, likely icons or tracking pixels
                if ((width > 0 && width < 50) || (height > 0 && height < 50)) {
                    return;
                }
                
                // Skip common icon/favicon patterns
                if (src.includes('favicon') || src.includes('icon') || 
                    src.includes('logo') && (width < 100 || height < 100)) {
                    return;
                }
                
                imageUrls.push({
                    url: absoluteUrl,
                    alt: alt,
                    width: width || null,
                    height: height || null
                });
            } catch (urlError) {
                console.warn(`Invalid image URL: ${src}`);
            }
        }
    });
    
    return imageUrls;
}

/**
 * Process and upload images for a note
 */
async function processAndUploadImages(imageUrls, noteId, maxImages = 10) {
    const uploadedImages = [];
    const processPromises = [];
    
    // Limit the number of images to process
    const imagesToProcess = imageUrls.slice(0, maxImages);
    
    for (const imageInfo of imagesToProcess) {
        const processPromise = (async () => {
            try {
                console.log(`Processing image: ${imageInfo.url}`);
                
                // Download the image
                const imageData = await downloadImageAsBase64(imageInfo.url);
                if (!imageData) {
                    console.warn(`Skipping image due to download failure: ${imageInfo.url}`);
                    return null;
                }
                
                // Create full resolution image (700px max width) for inline display
                const fullImage = await createExtractedFullImage(imageData.data);
                
                // Create small thumbnail (160px) for gallery/preview
                const thumbnail = await createThumbnail(imageData.data);
                
                // Create the image record
                const image = await NoteImage.create({
                    note_id: noteId,
                    data: fullImage, // Store the 700px version as "full resolution"
                    thumbnail: thumbnail, // Store the 160px version as thumbnail
                    name: imageInfo.alt || path.basename(new URL(imageInfo.url).pathname) || 'Extracted Image',
                    type: 'image/jpeg', // Since we're converting to JPEG
                    size: Buffer.from(fullImage.split(',')[1], 'base64').length
                });
                
                console.log(`Successfully uploaded image ${image.id} for note ${noteId}`);
                
                return {
                    id: image.id,
                    thumbnail: fullImage, // Return full image for inline display (not the small thumbnail)
                    originalUrl: imageInfo.url,
                    alt: imageInfo.alt,
                    width: imageInfo.width,
                    height: imageInfo.height
                };
            } catch (error) {
                console.error(`Failed to process image ${imageInfo.url}:`, error.message);
                return null;
            }
        })();
        
        processPromises.push(processPromise);
    }
    
    // Wait for all images to be processed
    const results = await Promise.all(processPromises);
    
    // Filter out failed uploads
    return results.filter(result => result !== null);
}
// --- End Image Processing Helper Functions ---


// Extract content from URL - Puppeteer first, Axios fallback
router.post('/extract-url', async (req, res) => {
    const { url, noteId, includeImages = false } = req.body;

    // --- Input validation ---
    if (!url) { return res.status(400).json({ message: 'URL is required' }); }
    try { new URL(url); } catch (_) { return res.status(400).json({ message: 'Invalid URL format provided.' }); }

    // If includeImages is true, noteId is required
    if (includeImages && !noteId) {
        return res.status(400).json({ message: 'Note ID is required when includeImages is true' });
    }
    // --- End Input Validation ---

    // --- Check if this is a Goodreads URL and book already exists ---
    if (url.includes('goodreads.com/book/show/')) {
        const userId = req.user?.id || 1;
        const externalId = extractExternalId(url);

        if (externalId) {
            const existingBook = await UserObject.findByExternalId(userId, externalId);
            if (existingBook) {
                console.log(`[extract-url] Book already exists (external_id: ${externalId}), skipping full extraction`);
                return res.json({
                    message: 'Book already exists',
                    exists: true,
                    book: existingBook,
                    title: existingBook.title,
                    content: '' // Don't extract content for existing books
                });
            }
        }
    }
    // --- End Goodreads check ---

    let extractedContent = null;
    let extractedTitle = null;
    let browser = null; // Playwright browser instance
    let finalError = null;

    // --- Get executable path from environment variable ---
    const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH; // Using same env var name

    // --- Attempt 1: Playwright Method (only if path is configured) ---
    if (chromiumPath) {
        console.log(`Using Chromium path for Playwright: ${chromiumPath}`);
        try {
            console.log(`Attempting extraction via Playwright for ${url}...`);
            browser = await chromium.launch({
                headless: true,
                executablePath: chromiumPath,
                args: [ '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage' ]
            });

            // *** FIX IS HERE: Set userAgent during page creation ***
            const page = await browser.newPage({
                 userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36' // Your UA String
            });
            // *******************************************************

            console.log(`Navigating (Playwright) to ${url}...`);
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            console.log(`Getting rendered content (Playwright) for ${url}...`);
            const html = await page.content();
            await page.close();
            console.log(`Page closed for ${url}.`);

            // --- JSDOM + Readability part ---
            const doc = new JSDOM(html, { url });
            const reader = new Readability(doc.window.document.cloneNode(true));
            const article = reader.parse();

            if (article && article.content) {
                extractedContent = article.content; // Return HTML directly instead of converting to text
                extractedTitle = article.title;
                console.log(`Extraction successful via Playwright for ${url}.`);
            } else {
                console.warn(`Readability (Playwright) failed for ${url}, falling back to rendered body text.`);
                const bodyHtml = doc.window.document.body ? doc.window.document.body.innerHTML : '';
                extractedContent = bodyHtml || "";
                extractedTitle = doc.window.document.title || '';
                if (extractedContent === null) extractedContent = "";
            }
            // --- End JSDOM part ---

        } catch (playwrightError) {
            console.error(`Playwright extraction failed for ${url} (even with path set):`, playwrightError.message);
            finalError = playwrightError;
            if (browser) { try { await browser.close(); browser = null; } catch (e) { console.error("Error closing browser post-Playwright error:", e); } }
        } finally {
            if (browser) {
                try {
                    console.log(`Closing Playwright browser instance for ${url}...`);
                    await browser.close();
                    browser = null;
                    console.log(`Playwright browser closed for ${url}.`);
                } catch (e) { console.error("Error closing Playwright browser in finally:", e); }
            }
        }
    } else {
        console.warn("PUPPETEER_EXECUTABLE_PATH not set. Skipping Playwright attempt...");
    }

    // --- Attempt 2: Axios Fallback Method (remains the same) ---
    if (extractedContent === null) {
        console.log(`Attempting Axios fallback extraction for ${url}...`);
        try {
            // ... Axios logic ...
            const response = await axios.get(url, { /* ... */ });
            const html = response.data;
            const doc = new JSDOM(html, { url });
            const reader = new Readability(doc.window.document.cloneNode(true));
            const article = reader.parse();

            if (article && article.content) {
                 extractedContent = article.content; // Return HTML directly instead of converting to text
                 extractedTitle = article.title;
                 console.log(`Extraction successful via Axios fallback for ${url}.`);
                 finalError = null;
            } else {
                 console.warn(`Readability (Axios fallback) failed for ${url}, trying body text.`);
                 const bodyHtml = doc.window.document.body ? doc.window.document.body.innerHTML : '';
                 extractedContent = bodyHtml || "";
                 extractedTitle = doc.window.document.title || '';
                 finalError = null;
                 if (extractedContent === null) extractedContent = "";
             }
        } catch (axiosError) {
            console.error(`Axios fallback extraction also failed for ${url}:`, axiosError.message);
            if (!finalError) finalError = axiosError;
        }
    }

    // --- Final Response with Image Processing ---
    if (extractedContent !== null) {
        let uploadedImages = [];
        
        // Process images if requested and noteId is provided
        if (includeImages && noteId) {
            try {
                console.log(`Extracting images from ${url} for note ${noteId}`);
                
                // Extract image URLs from the content
                const imageUrls = extractImageUrls(extractedContent, url);
                console.log(`Found ${imageUrls.length} images in content`);
                
                if (imageUrls.length > 0) {
                    // Process and upload images
                    uploadedImages = await processAndUploadImages(imageUrls, noteId);
                    console.log(`Successfully uploaded ${uploadedImages.length} images`);
                }
            } catch (imageError) {
                console.error(`Failed to process images for ${url}:`, imageError.message);
                // Don't fail the entire request if image processing fails
            }
        }
        
        res.json({ 
            title: (extractedTitle || '').trim(), 
            content: extractedContent.trim(),
            images: uploadedImages
        });
    } else {
        // ... Error reporting logic using finalError ...
        console.error(`All extraction methods failed for ${url}. Reporting last error.`);
        let errorMessage = 'Failed to extract content after trying multiple methods.';
        let statusCode = 500;
        const detailedErrorMsg = finalError ? finalError.message : 'Unknown extraction failure.';
        // ... map finalError to statusCode ...
        res.status(statusCode).json({ message: errorMessage, error: detailedErrorMsg });
    }
});


// --- Version History Routes ---

// Get list of versions for a note
router.get('/:id/versions', async (req, res) => {
  const noteId = req.params.id;
  try {
    const query = `
      SELECT id, created_at 
      FROM note_versions 
      WHERE note_id = $1 
      ORDER BY created_at DESC
    `;
    const result = await db.query(query, [noteId]);
    res.json({ versions: result.rows });
  } catch (error) {
    console.error(`Error fetching versions for note ${noteId}:`, error);
    res.status(500).json({ message: 'Error fetching note versions', error: error.message });
  }
});

// Download a specific note version (supports both HTML and plain text formats)
router.get('/:id/versions/:version_id/download', async (req, res) => {
  const { id: noteId, version_id: versionId } = req.params;
  const format = req.query.format || 'html'; // Default to HTML format

  try {
    const query = `
      SELECT title, content, raw_content, created_at
      FROM note_versions
      WHERE id = $1 AND note_id = $2
    `;
    const result = await db.query(query, [versionId, noteId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Note version not found' });
    }

    const version = result.rows[0];
    const timestamp = new Date(version.created_at).toISOString().replace(/[:.]/g, '-');

    if (format === 'html') {
      // Download as HTML with full formatting
      const filename = `note_${noteId}_version_${timestamp}.html`;
      const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${version.title || 'Note Version'}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.6;
      color: #333;
    }
    h1 {
      border-bottom: 2px solid #e0e0e0;
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    .timestamp {
      color: #666;
      font-size: 0.9em;
      margin-bottom: 20px;
    }
    .content {
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <h1>${version.title || 'Untitled'}</h1>
  <div class="timestamp">Version created: ${new Date(version.created_at).toLocaleString()}</div>
  <div class="content">
    ${version.raw_content || version.content || '<p><em>No content</em></p>'}
  </div>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(htmlContent);
    } else {
      // Download as plain text (legacy support)
      const filename = `note_${noteId}_version_${timestamp}.txt`;
      let textContent = '';
      if (version.title) {
        textContent += `Title: ${version.title}\n\n`;
      }
      textContent += version.content || '';

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(textContent);
    }

  } catch (error) {
    console.error(`Error downloading version ${versionId} for note ${noteId}:`, error);
    res.status(500).json({ message: 'Error downloading note version', error: error.message });
  }
});

// Restore a specific note version (creates a new version as a copy)
router.post('/:id/versions/:version_id/restore', async (req, res) => {
  const { id: noteId, version_id: versionId } = req.params;

  try {
    // Fetch the version to restore
    const versionQuery = `
      SELECT title, content, raw_content
      FROM note_versions
      WHERE id = $1 AND note_id = $2
    `;
    const versionResult = await db.query(versionQuery, [versionId, noteId]);

    if (versionResult.rows.length === 0) {
      return res.status(404).json({ message: 'Note version not found' });
    }

    const version = versionResult.rows[0];

    // Update the current note with the restored content
    // Schema mapping:
    // - notes table: content (HTML), plain_content (plain text)
    // - note_versions table: raw_content (HTML), content (plain text)
    const updateQuery = `
      UPDATE notes
      SET title = $1, content = $2, plain_content = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `;
    const updateResult = await db.query(updateQuery, [
      version.title,
      version.raw_content, // HTML from version -> content in notes
      version.content,     // Plain text from version -> plain_content in notes
      noteId
    ]);

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ message: 'Note not found' });
    }

    const updatedNote = updateResult.rows[0];

    // Create a new version entry for this restoration (this becomes the new current version)
    const createVersionQuery = `
      INSERT INTO note_versions (note_id, title, content, raw_content)
      VALUES ($1, $2, $3, $4)
      RETURNING id, created_at
    `;
    await db.query(createVersionQuery, [
      noteId,
      version.title,
      version.content,
      version.raw_content
    ]);

    // Clean up old versions (keep only 8 versions)
    const cleanupQuery = `
      DELETE FROM note_versions
      WHERE note_id = $1
      AND id NOT IN (
        SELECT id FROM note_versions
        WHERE note_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      )
    `;
    await db.query(cleanupQuery, [noteId, 8]);

    // Emit socket event for real-time updates
    req.app.get('io').emit('note_updated', updatedNote);

    res.json({ note: updatedNote });

  } catch (error) {
    console.error(`Error restoring version ${versionId} for note ${noteId}:`, error);
    res.status(500).json({ message: 'Error restoring note version', error: error.message });
  }
});

// Bulk download notes
router.post('/bulk-download', async (req, res) => {
  const { noteIds } = req.body;

  if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
    return res.status(400).json({ message: 'Invalid note IDs provided' });
  }

  try {
    // Fetch full content of selected notes
    const query = `
      SELECT id, title, content, created_at
      FROM notes
      WHERE id = ANY($1)
    `;
    const result = await db.query(query, [noteIds]);
    const notes = result.rows;

    if (notes.length === 0) {
      return res.status(404).json({ message: 'No notes found' });
    }

    // Set headers for zip download
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `itsnotes_notes_${timestamp}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const archive = archiver('zip', {
      zlib: { level: 9 } // Sets the compression level.
    });

    // Listen for all archive data to be written
    // 'close' event is fired only when a file descriptor is involved
    res.on('close', function() {
      console.log(archive.pointer() + ' total bytes');
      console.log('archiver has been finalized and the output file descriptor has closed.');
    });

    // This event is fired when the data source is drained no matter what was the data source.
    // It is not part of this library but rather from the NodeJS Stream API.
    // @see: https://nodejs.org/api/stream.html#stream_event_end
    res.on('end', function() {
      console.log('Data has been drained');
    });

    // good practice to catch warnings (ie stat failures and other non-blocking errors)
    archive.on('warning', function(err) {
      if (err.code === 'ENOENT') {
        // log warning
        console.warn('Archiver warning:', err);
      } else {
        // throw error
        throw err;
      }
    });

    // good practice to catch this error explicitly
    archive.on('error', function(err) {
      throw err;
    });

    // Pipe archive data to the response
    archive.pipe(res);

    // Add files to the archive
    const usedFilenames = new Set();

    for (const note of notes) {
      // Create HTML content (same format as individual note download)
      const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${note.title || 'Untitled Note'}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.6;
      color: #333;
    }
    h1 {
      border-bottom: 2px solid #e0e0e0;
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    .timestamp {
      color: #666;
      font-size: 0.9em;
      margin-bottom: 20px;
    }
    .content {
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <h1>${note.title || 'Untitled'}</h1>
  <div class="timestamp">Created: ${new Date(note.created_at).toLocaleString()}</div>
  <div class="content">
    ${note.content || '<p><em>No content</em></p>'}
  </div>
</body>
</html>`;

      // Create a filename
      let baseFilename = note.title ? note.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50) : `note_${note.id}`;
      if (!baseFilename) baseFilename = `note_${note.id}`;

      let finalFilename = `${baseFilename}.html`;
      let counter = 1;

      while (usedFilenames.has(finalFilename)) {
        finalFilename = `${baseFilename}_${counter}.html`;
        counter++;
      }
      usedFilenames.add(finalFilename);

      archive.append(htmlContent, { name: finalFilename });
    }

    // Finalize the archive (ie we are done appending files but streams have to finish yet)
    // 'close', 'end' or 'finish' may be fired right after calling this method so register to them beforehand
    await archive.finalize();

  } catch (error) {
    console.error('Error bulk downloading notes:', error);
    // If headers haven't been sent, send error response
    if (!res.headersSent) {
      res.status(500).json({ message: 'Error downloading notes', error: error.message });
    } else {
      // If streaming started, we can't send a JSON response, just end the stream
      res.end();
    }
  }
});

// --- End Version History Routes ---

// Helper to decode HTML entities
const decodeHtml = (text) => {
    if (!text) return text;
    try {
        const dom = new JSDOM(text);
        return dom.window.document.body.textContent;
    } catch (e) {
        return text;
    }
};

// --- Goodreads Extraction Endpoint ---
router.post('/extract-goodreads', async (req, res) => {
    const { url } = req.body;

    if (!url) { return res.status(400).json({ message: 'URL is required' }); }
    try { new URL(url); } catch (_) { return res.status(400).json({ message: 'Invalid URL format provided.' }); }

    try {
        // Check if book already exists
        const userId = req.user?.id || 1;
        console.log('[extract-goodreads] extractExternalId type:', typeof extractExternalId);
        const externalId = extractExternalId(url);

        if (externalId) {
            const existingBook = await UserObject.findByExternalId(userId, externalId);
            if (existingBook) {
                console.log(`Book already exists (external_id: ${externalId}), skipping extraction`);
                // Return data in the same format as a new extraction
                const source = existingBook.metadata?.source || {};
                return res.json({
                    title: existingBook.title,
                    author: source.author,
                    cover: existingBook.thumbnail_url || source.cover_url,
                    url: existingBook.source_url,
                    rating: source.rating,
                    publishedYear: source.year,
                    total_pages: source.page_count,
                    description: source.description,
                    exists: true // Flag to indicate this was from cache
                });
            }
        }

        console.log(`Attempting Goodreads extraction (OGS) for ${url}...`);
        
        const { result } = await ogs({ url });
        
        if (!result.success) {
            throw new Error('Open Graph Scraper failed to fetch data.');
        }

        const data = {
            title: decodeHtml(result.ogTitle),
            description: decodeHtml(result.ogDescription),
            cover: result.ogImage?.[0]?.url,
            url: result.ogUrl || url
        };

        // Extract specifics from JSON-LD
        if (result.jsonLD) {
            // Goodreads sometimes returns an array of JSON-LD objects
            const ld = Array.isArray(result.jsonLD) ? result.jsonLD.find(item => item['@type'] === 'Book') || result.jsonLD[0] : result.jsonLD;
            
            if (ld) {
                // Prefer JSON-LD data if available
                if (ld.name) data.title = decodeHtml(ld.name);
                if (ld.image) data.cover = ld.image;
                
                if (ld.author) {
                    const authors = Array.isArray(ld.author) ? ld.author : [ld.author];
                    data.author = decodeHtml(authors.map(a => a.name).join(', '));
                }
                
                if (ld.aggregateRating) {
                    data.rating = ld.aggregateRating.ratingValue;
                }
                
                if (ld.numberOfPages) {
                    data.pages = `${ld.numberOfPages} pages`;
                    data.total_pages = parseInt(ld.numberOfPages, 10);
                }

                if (ld.datePublished) {
                    data.publishedDate = ld.datePublished;
                    const match = ld.datePublished.match(/\d{4}/);
                    if (match) {
                        data.publishedYear = match[0];
                    }
                }
            }
        }

        // --- Enhancement: Try to fetch full description and details if OGS result is truncated ---
        try {
            // Only attempt if we have a URL and (description is short OR we are missing published year)
            if (url && ((!data.description || data.description.endsWith('…') || data.description.endsWith('...')) || !data.publishedYear)) {
                console.log('Attempting to fetch full details via Axios...');
                const response = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5'
                    },
                    timeout: 5000 // Short timeout to not delay response too much
                });

                const dom = new JSDOM(response.data);
                const doc = dom.window.document;
                
                // Goodreads selectors for description
                // 1. New design: div[data-testid="description"]
                // 2. Old design: #description
                const descContainer = doc.querySelector('div[data-testid="description"]') || doc.querySelector('#description');
                
                if (descContainer) {
                    // Check for hidden span (common in older Goodreads layout for "Show more")
                    const hiddenSpan = descContainer.querySelector('span[style*="display:none"]');
                    if (hiddenSpan) {
                        data.description = decodeHtml(hiddenSpan.textContent.trim());
                    } else {
                        // Newer layout or no hidden span
                        data.description = decodeHtml(descContainer.textContent.trim());
                    }
                    console.log('Successfully extracted full description via Axios/JSDOM');
                }

                // Try to extract published year if missing
                if (!data.publishedYear) {
                    // New design: p[data-testid="publicationInfo"]
                    const pubInfo = doc.querySelector('p[data-testid="publicationInfo"]');
                    if (pubInfo) {
                        const match = pubInfo.textContent.match(/\d{4}/);
                        if (match) data.publishedYear = match[0];
                    } else {
                        // Old design: look for "First published" or "Published" in details
                        // Often in #details .row or similar
                        const details = doc.body.textContent; // Fallback to searching body text if specific selector fails
                        const pubMatch = details.match(/(?:First published|Published)\s+(?:in\s+)?([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+)?(\d{4})/i);
                        if (pubMatch) {
                             // The year is usually the last capturing group or the one that looks like a year
                             // Group 2 is likely the year in the regex above
                             data.publishedYear = pubMatch[2];
                        }
                    }
                }
            }
        } catch (enhancementError) {
            // Silently fail enhancement and stick with OGS data
            console.warn('Full description extraction failed (using OGS fallback):', enhancementError.message);
        }
        // --- End Enhancement ---

        // Truncate description to 300 characters
        if (data.description && data.description.length > 300) {
            data.description = data.description.substring(0, 300) + '...';
        }

        console.log('Goodreads extraction result:', data);

        if (!data.title) {
            throw new Error('Could not extract book title.');
        }

        res.json(data);

    } catch (error) {
        console.error(`Goodreads extraction failed for ${url}:`, error.message);
        res.status(500).json({ message: 'Goodreads extraction failed', error: error.message });
    }
});

// --- TMDB URL Extraction Endpoint (Movies & TV Shows) ---
router.post('/extract-tmdb', async (req, res) => {
    const { url } = req.body;

    if (!url) { return res.status(400).json({ message: 'URL is required' }); }
    try { new URL(url); } catch (_) { return res.status(400).json({ message: 'Invalid URL format provided.' }); }

    try {
        console.log(`[extract-tmdb] Attempting TMDB extraction for ${url}...`);

        const tmdbMatch = url.match(/\/(movie|tv)\/(\d+)/);
        if (!tmdbMatch) {
            throw new Error('Could not extract TMDB ID from URL. Please provide a valid TMDB movie or TV URL.');
        }
        const [, mediaType, tmdbId] = tmdbMatch;
        console.log(`[extract-tmdb] Extracted type: ${mediaType}, ID: ${tmdbId}`);

        const TMDB_API_KEY = process.env.TMDB_API_KEY;

        if (mediaType === 'movie') {
            const detailsResponse = await axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}`, {
                params: { api_key: TMDB_API_KEY, append_to_response: 'credits' }
            });

            const movie = detailsResponse.data;
            console.log(`[extract-tmdb] Got movie details:`, movie.title);

            let director = null;
            if (movie.credits && movie.credits.crew) {
                const directors = movie.credits.crew.filter(member => member.job === 'Director');
                if (directors.length > 0) {
                    director = directors.map(d => d.name).join(', ');
                }
            }

            const data = {
                type: 'movie',
                title: movie.title,
                poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
                url: url,
                year: movie.release_date ? movie.release_date.substring(0, 4) : null,
                rating: movie.vote_average || null,
                director: director
            };

            console.log('[extract-tmdb] Movie extraction result:', data);

            if (!data.title) { throw new Error('Could not extract movie title.'); }
            return res.json(data);

        } else {
            const detailsResponse = await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}`, {
                params: { api_key: TMDB_API_KEY }
            });

            const show = detailsResponse.data;
            console.log(`[extract-tmdb] Got show details:`, show.name);

            const data = {
                type: 'show',
                title: show.name,
                poster: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : null,
                url: url,
                startYear: show.first_air_date ? show.first_air_date.substring(0, 4) : null,
                endYear: show.status === 'Ended' && show.last_air_date ? show.last_air_date.substring(0, 4) : null,
                rating: show.vote_average || null,
                seasons: show.number_of_seasons || null,
                episodes: show.number_of_episodes || null,
                creator: show.created_by && show.created_by.length > 0
                    ? show.created_by.map(c => c.name).join(', ')
                    : null
            };

            console.log('[extract-tmdb] TV show extraction result:', data);

            if (!data.title) { throw new Error('Could not extract TV show title.'); }
            return res.json(data);
        }

    } catch (error) {
        console.error(`[extract-tmdb] TMDB extraction failed for ${url}:`, error);
        res.status(500).json({
            message: 'TMDB extraction failed',
            error: error?.message || error?.toString() || 'Unknown error'
        });
    }
});

// --- Unified IMDb Extraction Endpoint (Movies & TV Shows) ---
router.post('/extract-imdb', async (req, res) => {
    const { url } = req.body;

    if (!url) { return res.status(400).json({ message: 'URL is required' }); }
    try { new URL(url); } catch (_) { return res.status(400).json({ message: 'Invalid URL format provided.' }); }

    try {
        console.log(`[extract-imdb] Attempting IMDb extraction for ${url}...`);

        // Extract IMDb ID from URL
        const imdbIdMatch = url.match(/title\/(tt\d+)/);
        if (!imdbIdMatch) {
            throw new Error('Could not extract IMDb ID from URL. Please provide a valid IMDb title URL.');
        }
        const imdbId = imdbIdMatch[1];
        console.log(`[extract-imdb] Extracted IMDb ID: ${imdbId}`);

        // Use TMDB API to find content by IMDb ID
        const TMDB_API_KEY = process.env.TMDB_API_KEY;

        const findResponse = await axios.get(`https://api.themoviedb.org/3/find/${imdbId}`, {
            params: {
                api_key: TMDB_API_KEY,
                external_source: 'imdb_id'
            }
        });

        const movieResults = findResponse.data.movie_results || [];
        const tvResults = findResponse.data.tv_results || [];

        // Determine if it's a movie or TV show
        if (movieResults.length > 0) {
            // It's a movie
            const tmdbId = movieResults[0].id;
            console.log(`[extract-imdb] Found movie with TMDB ID: ${tmdbId}`);

            // Get full movie details with credits
            const detailsResponse = await axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}`, {
                params: {
                    api_key: TMDB_API_KEY,
                    append_to_response: 'credits'
                }
            });

            const movie = detailsResponse.data;
            console.log(`[extract-imdb] Got movie details:`, movie.title);

            // Extract director from credits
            let director = null;
            if (movie.credits && movie.credits.crew) {
                const directors = movie.credits.crew.filter(member => member.job === 'Director');
                if (directors.length > 0) {
                    director = directors.map(d => d.name).join(', ');
                }
            }

            const data = {
                type: 'movie',
                title: movie.title,
                poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
                url: url,
                year: movie.release_date ? movie.release_date.substring(0, 4) : null,
                rating: movie.vote_average || null,
                director: director
            };

            console.log('[extract-imdb] Movie extraction result:', data);

            if (!data.title) {
                throw new Error('Could not extract movie title.');
            }

            return res.json(data);

        } else if (tvResults.length > 0) {
            // It's a TV show
            const tmdbId = tvResults[0].id;
            console.log(`[extract-imdb] Found TV show with TMDB ID: ${tmdbId}`);

            // Get full TV show details
            const detailsResponse = await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}`, {
                params: {
                    api_key: TMDB_API_KEY
                }
            });

            const show = detailsResponse.data;
            console.log(`[extract-imdb] Got show details:`, show.name);

            const data = {
                type: 'show',
                title: show.name,
                poster: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : null,
                url: url,
                startYear: show.first_air_date ? show.first_air_date.substring(0, 4) : null,
                endYear: show.status === 'Ended' && show.last_air_date ? show.last_air_date.substring(0, 4) : null,
                rating: show.vote_average || null,
                seasons: show.number_of_seasons || null,
                episodes: show.number_of_episodes || null,
                creator: show.created_by && show.created_by.length > 0
                    ? show.created_by.map(c => c.name).join(', ')
                    : null
            };

            console.log('[extract-imdb] TV show extraction result:', data);

            if (!data.title) {
                throw new Error('Could not extract TV show title.');
            }

            return res.json(data);

        } else {
            throw new Error('No movie or TV show found in TMDB for this IMDb ID');
        }

    } catch (error) {
        console.error(`[extract-imdb] IMDb extraction failed for ${url}:`, error);
        res.status(500).json({
            message: 'IMDb extraction failed',
            error: error?.message || error?.toString() || 'Unknown error'
        });
    }
});

module.exports = router;
