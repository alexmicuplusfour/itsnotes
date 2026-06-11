const express = require('express');
const archiver = require('archiver');
const db = require('../db');

const router = express.Router();

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

module.exports = router;
