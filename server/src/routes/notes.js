const express = require('express');
const Note = require('../models/Note');
const Tag = require('../models/Tag');
const db = require('../db');
const { blockInDemo, limitNoteSizeInDemo } = require('../middleware/demoGuard');
const { extractLinkUrls } = require('../utils/extractLinkUrls');
const router = express.Router();

// Pull unique object-card ids out of note HTML without spinning up a full DOM.
// Each card is a `<div data-type="object-card" objectid="..." ...>`; we scan the
// opening tags so attribute order doesn't matter.
function extractObjectCardIds(html) {
  const ids = [];
  if (!html) return ids;
  const tagRegex = /<div\b[^>]*\bdata-type=["']object-card["'][^>]*>/gi;
  let tag;
  while ((tag = tagRegex.exec(html)) !== null) {
    const idMatch = /\bobjectid=["']([^"']+)["']/i.exec(tag[0]);
    if (idMatch && !ids.includes(idMatch[1])) {
      ids.push(idMatch[1]);
    }
  }
  return ids;
}

// Sync a note's URL link-preview rows to match its current content, then fetch
// OG previews for any newly added links in the background. Passing content with no
// URLs clears out link rows whose URLs were removed. Best-effort: never lets a link
// failure break the note save.
async function syncLinkPreviews(noteId, content, io) {
  try {
    const NoteLink = require('../models/NoteLink');
    const urls = extractLinkUrls(content);
    const newLinks = await NoteLink.syncNoteLinks(noteId, urls);
    if (newLinks.length > 0) {
      io.emit('link_preview_fetching', { noteId, count: newLinks.length });
      setImmediate(() => fetchAndEmitLinkPreviews(newLinks, noteId, io));
    }
  } catch (e) {
    console.error(`[Link Preview] Error syncing links for note ${noteId}:`, e.message);
  }
}

// Fetch OG metadata for newly inserted note_links rows and broadcast the updated note.
async function fetchAndEmitLinkPreviews(newLinks, noteId, io) {
  try {
    const { fetchLinkPreview } = require('../utils/fetchLinkPreview');
    const NoteLink = require('../models/NoteLink');

    await Promise.all(newLinks.map(async (link) => {
      const preview = await fetchLinkPreview(link.url, link.id);
      await NoteLink.updatePreview(link.id, preview);
    }));

    const updatedNote = await Note.findById(noteId, true);
    if (updatedNote) {
      io.emit('note_updated', updatedNote);
    }
  } catch (e) {
    console.error('[Link Preview] Background fetch failed:', e.message);
  }
}

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

    // Always add objects and link previews to notes
    if (notes.length > 0) {
      await Note.addObjects(notes);
      await Note.addLinks(notes);
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

    // The result set and the total count are independent queries, so run them
    // concurrently. The count scans the table on its own and doesn't need the
    // fetched notes, so it overlaps with the search + tag/image/object enrichment.
    const [notes, totalCount] = await Promise.all([
      (async () => {
        const results = await Note.search(
          query,
          parseInt(page),
          parseInt(limit),
          sortOrder,
          truncateContent === 'true' || truncateContent === true,
          parseInt(contentLimit) || 601,
          tagIdMap
        );

        // Include tags and images if requested
        if (includeDetails === 'true' && results.length > 0) {
          await Note.addTagsAndImages(results);
        }

        // Always add objects and link previews to notes
        if (results.length > 0) {
          await Note.addObjects(results);
          await Note.addLinks(results);
        }

        return results;
      })(),
      Note.getSearchCount(query, tagIdMap)
    ]);

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

// Get per-month note counts for the calendar browser
router.get('/month-counts', async (req, res) => {
  try {
    const counts = await Note.getMonthCounts();
    res.json({ counts });
  } catch (error) {
    console.error('Error fetching note month counts:', error);
    res.status(500).json({ message: 'Error fetching note month counts', error: error.message });
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
router.post('/', limitNoteSizeInDemo, async (req, res) => {
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

    // Sync link previews for any URLs in the note content
    const io = req.app.get('io');
    if (content) {
      await syncLinkPreviews(note.id, content, io);
    }

    // For debugging the socket.io connection
    console.log('[SERVER] Broadcasting new note created:', note);
    io.emit('note_created', note);

    res.status(201).json({ note });
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ message: 'Error creating note', error: error.message });
  }
});

// Duplicate a note (server-side deep copy: row + images + tags + object links)
router.post('/:id/duplicate', async (req, res) => {
  try {
    const copy = await Note.duplicate(req.params.id);
    if (!copy) {
      return res.status(404).json({ message: 'Note not found' });
    }

    // Relink object cards from the copied HTML, same as the create path.
    if (copy.content) {
      try {
        const UserObject = require('../models/UserObject');
        const { JSDOM } = require('jsdom');

        const dom = new JSDOM(copy.content);
        const objectCards = dom.window.document.querySelectorAll('div[data-type="object-card"]');

        const objectIds = [];
        objectCards.forEach(card => {
          const objectId = card.getAttribute('objectid');
          if (objectId && !objectIds.includes(objectId)) {
            objectIds.push(objectId);
          }
        });

        if (objectIds.length > 0) {
          await UserObject.syncNoteLinks(copy.id, objectIds);
          console.log(`[Object Links] Synced ${objectIds.length} object links for copy ${copy.id}`);
        }
      } catch (error) {
        console.error(`[Object Links] Error syncing object links for copy ${copy.id}:`, error);
        // Don't fail the duplication if object syncing fails
      }
    }

    // Enrich with tags/images/objects so the card renders fully on arrival
    // (the socket payload is otherwise just the raw note row).
    await Note.addTagsAndImages([copy]);
    await Note.addObjects([copy]);

    console.log('[SERVER] Broadcasting duplicated note created:', copy.id);
    req.app.get('io').emit('note_created', copy);

    res.status(201).json({ note: copy });
  } catch (error) {
    console.error('Error duplicating note:', error);
    res.status(500).json({ message: 'Error duplicating note', error: error.message });
  }
});

// Update a note
router.put('/:id', limitNoteSizeInDemo, async (req, res) => {
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

    // Convert the incoming HTML to plain text once and reuse it for both the
    // version snapshot and the main-table update, so we don't parse it twice.
    // When the content didn't change, the existing plain_content still applies.
    const { convertHtmlToPlainText } = require('../utils/htmlToPlainText');
    const plainContent = contentActuallyChanged
      ? (incomingContent ? convertHtmlToPlainText(incomingContent) : '')
      : currentNote.plain_content;

    if (contentActuallyChanged) {
      const now = new Date();
      const lastVersionQuery = `SELECT id, created_at FROM note_versions WHERE note_id = $1 ORDER BY created_at DESC LIMIT 1`;
      const lastVersionResult = await db.query(lastVersionQuery, [noteId]);

      // Check time since the last version was created (not the note's last update)
      // This prevents the 30-min window from staying open indefinitely with continuous edits
      const shouldCreateNewVersion = !lastVersionResult.rows.length ||
        (now.getTime() - new Date(lastVersionResult.rows[0].created_at).getTime() > VERSION_INTERVAL_MS);

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
        plain_content: plainContent, // precomputed above to avoid a second parse
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
        const objectIds = extractObjectCardIds(incomingContent);
        await UserObject.syncNoteLinks(noteId, objectIds);
      } catch (error) {
        console.error(`[Object Links] Error syncing object links for note ${noteId}:`, error);
        // Don't fail the whole update if object syncing fails
      }

      // Sync URL link previews
      await syncLinkPreviews(noteId, incomingContent, req.app.get('io'));
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

    // 10. The res.json interceptor (index.js) broadcasts note_updated for the
    // { note } response below. If the main record didn't actually change (e.g. a
    // forced save of an unchanged note), suppress that broadcast — there's nothing
    // for other clients to update.
    if (!needsMainTableUpdate) {
      res.locals.skipNoteBroadcast = true;
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

// Re-fetch a note with tags/images/objects so socket broadcasts carry the full
// shape clients need to render correctly in cross-view scenarios (archiving on
// one device while another is sitting in the archive view, etc.).
async function loadNoteWithDetails(id) {
  const note = await Note.findById(id, true);
  if (note) await Note.addObjects([note]);
  return note;
}

// Archive a note
router.patch('/:id/archive', async (req, res) => {
  try {
    const updated = await Note.update(req.params.id, { is_archived: true });
    if (!updated) {
      return res.status(404).json({ message: 'Note not found' });
    }
    const note = await loadNoteWithDetails(req.params.id);

    // note_updated is broadcast centrally by the res.json interceptor (index.js).
    res.json({ note });
  } catch (error) {
    console.error('Error archiving note:', error);
    res.status(500).json({ message: 'Error archiving note', error: error.message });
  }
});

// Unarchive a note
router.patch('/:id/unarchive', async (req, res) => {
  try {
    const updated = await Note.update(req.params.id, { is_archived: false });
    if (!updated) {
      return res.status(404).json({ message: 'Note not found' });
    }
    const note = await loadNoteWithDetails(req.params.id);

    // note_updated is broadcast centrally by the res.json interceptor (index.js).
    res.json({ note });
  } catch (error) {
    console.error('Error unarchiving note:', error);
    res.status(500).json({ message: 'Error unarchiving note', error: error.message });
  }
});

// Move a note to trash
router.patch('/:id/trash', async (req, res) => {
  try {
    const updated = await Note.update(req.params.id, { is_deleted: true });
    if (!updated) {
      return res.status(404).json({ message: 'Note not found' });
    }
    const note = await loadNoteWithDetails(req.params.id);

    // note_updated is broadcast centrally by the res.json interceptor (index.js).
    res.json({ note });
  } catch (error) {
    console.error('Error trashing note:', error);
    res.status(500).json({ message: 'Error trashing note', error: error.message });
  }
});

// Restore a note from trash
router.patch('/:id/restore', async (req, res) => {
  try {
    const updated = await Note.update(req.params.id, { is_deleted: false });
    if (!updated) {
      return res.status(404).json({ message: 'Note not found' });
    }
    const note = await loadNoteWithDetails(req.params.id);

    // note_updated is broadcast centrally by the res.json interceptor (index.js).
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

    // note_updated is broadcast centrally by the res.json interceptor (index.js).
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

    const updatedNoteWithDetails = await loadNoteWithDetails(req.params.id);

    // note_updated is broadcast centrally by the res.json interceptor (index.js).
    res.json({ note: updatedNoteWithDetails });
  } catch (error) {
    console.error('Error changing note color:', error);
    res.status(500).json({ message: 'Error changing note color', error: error.message });
  }
});

// --- Bulk Actions ---

// Bulk Archive Notes
router.post('/bulk/archive', blockInDemo, async (req, res) => {
  try {
    const { noteIds } = req.body;
    if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
      return res.status(400).json({ message: 'Note IDs array is required.' });
    }
    // 1. Perform the bulk update
    const count = await Note.bulkUpdate(noteIds, { is_archived: true });

    // 2. Fetch the updated notes (with details so the payload matches single updates)
    const updatedNotes = await Note.findManyByIds(noteIds, true);

    // 3. Emit a single batched event so clients apply all updates in one render.
    req.app.get('io').emit('notes_bulk_updated', { notes: updatedNotes });

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

    // 2. Fetch the updated notes (with details so the payload matches single updates)
    const updatedNotes = await Note.findManyByIds(noteIds, true);

    // 3. Emit a single batched event so clients apply all updates in one render.
    req.app.get('io').emit('notes_bulk_updated', { notes: updatedNotes });

    res.json({ message: `${count} notes unarchived successfully.` });
  } catch (error) {
    console.error('Error bulk unarchiving notes:', error);
    res.status(500).json({ message: 'Error bulk unarchiving notes', error: error.message });
  }
});


// Bulk Trash Notes
router.post('/bulk/trash', blockInDemo, async (req, res) => {
  try {
    const { noteIds } = req.body;
    if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
      return res.status(400).json({ message: 'Note IDs array is required.' });
    }
    // 1. Perform the bulk update
    const count = await Note.bulkUpdate(noteIds, { is_deleted: true });

    // 2. Fetch the updated notes (with details so the payload matches single updates)
    const updatedNotes = await Note.findManyByIds(noteIds, true);

    // 3. Emit a single batched event so clients apply all updates in one render.
    req.app.get('io').emit('notes_bulk_updated', { notes: updatedNotes });

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

    // 2. Fetch the updated notes (with details so the payload matches single updates)
    const updatedNotes = await Note.findManyByIds(noteIds, true);

    // 3. Emit a single batched event so clients apply all updates in one render.
    req.app.get('io').emit('notes_bulk_updated', { notes: updatedNotes });

    res.json({ message: `${count} notes restored successfully.` });
  } catch (error) {
    console.error('Error bulk restoring notes:', error);
    res.status(500).json({ message: 'Error bulk restoring notes', error: error.message });
  }
});

// Bulk Delete Notes Permanently
router.post('/bulk/delete-permanently', blockInDemo, async (req, res) => {
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

    // 2. Emit a single batched event so clients remove all in one render.
    req.app.get('io').emit('notes_bulk_deleted', { noteIds: idsToDelete });

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

    // 2. Fetch updated notes (with details so the payload matches single updates)
    const updatedNotes = await Note.findManyByIds(noteIds, true);

    // 3. Emit a single batched event so clients apply all updates in one render.
    req.app.get('io').emit('notes_bulk_updated', { notes: updatedNotes });

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

// Mount sub-routers for content extraction and version history.
// Both live under the same /api/notes prefix and use distinct path patterns
// (/extract-*, /:id/versions, /bulk-download) that don't collide with the routes above.
router.use('/', require('./noteExtract'));
router.use('/', require('./noteVersions'));

module.exports = router;
