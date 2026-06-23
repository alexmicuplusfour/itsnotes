/**
 * Import Google Keep notes from Takeout export
 *
 * This script reads JSON files from the Google Keep Takeout export
 * and imports them into the database with proper field mappings.
 */

const fs = require('fs');
const path = require('path');
const { db } = require('./knex');
const { keepNoteToContent } = require('./utils/keepNoteToContent');

// Color mapping from Google Keep to our app
const COLOR_MAP = {
  'PINK': 'blossom',
  'GRAY': 'chalk',
  'BROWN': 'clay',
  'RED': 'coral',
  'DEFAULT': 'default',
  'PURPLE': 'dusk',
  'BLUE': 'fog',
  'GREEN': 'mint',
  'ORANGE': 'peach',
  'TEAL': 'sage',
  'YELLOW': 'sand',
  'CERULEAN': 'storm'
};

// Find an existing tag or create it, race-safely.
//
// Tag uniqueness is enforced by `tags_name_parent_unique`, a CASE-INSENSITIVE,
// parent-scoped index — LOWER(name) + COALESCE(parent_id, <zero-uuid>). Keep
// labels are always imported as top-level tags (parent_id NULL), so we match
// the same way. A plain INSERT of a case-variant ("work" vs an existing "Work")
// would raise a unique violation and poison the whole note transaction; using
// ON CONFLICT DO NOTHING keeps the transaction alive and lets us re-select the
// winner.
async function findOrCreateTag(trx, labelName) {
  const existing = await trx('tags')
    .whereRaw('LOWER(name) = LOWER(?)', [labelName])
    .whereNull('parent_id')
    .first();
  if (existing) return existing.id;

  const inserted = await trx.raw(
    `INSERT INTO tags (name) VALUES (?)
     ON CONFLICT (LOWER(name), COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid))
     DO NOTHING
     RETURNING id`,
    [labelName]
  );
  if (inserted.rows.length > 0) return inserted.rows[0].id;

  // Conflict (a case-variant already exists) — re-select the existing row.
  const winner = await trx('tags')
    .whereRaw('LOWER(name) = LOWER(?)', [labelName])
    .whereNull('parent_id')
    .first();
  return winner ? winner.id : null;
}

// Keep timestamps are microseconds since the epoch. Guard against missing or
// non-numeric values: `new Date(NaN).toISOString()` throws, which would
// otherwise fail the whole note over one absent field. Falls back to the
// provided ISO string, or to "now".
function usecToIso(usec, fallbackIso) {
  const ms = Number(usec) / 1000;
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  return fallbackIso || new Date().toISOString();
}

// Process a single Google Keep note file in its own transaction.
async function processNoteFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const note = JSON.parse(data);

    // Map Google Keep fields to our database fields.
    // Keep notes carry their body either as plain `textContent` or as a
    // `listContent` checklist; keepNoteToContent handles both and returns the
    // HTML the app stores in `content` plus the raw text used for search.
    const { html, plainText } = keepNoteToContent(note);

    // Convert timestamps from microseconds to ISO; if a note's edited time is
    // missing, fall back to its created time, then to "now".
    const createdAt = usecToIso(note.createdTimestampUsec);
    const updatedAt = usecToIso(note.userEditedTimestampUsec, createdAt);

    const isPinned = note.isPinned || false;
    const isArchived = note.isArchived || false;
    const isDeleted = note.isTrashed || false;

    const mappedNote = {
      title: note.title || '',
      content: html,
      plain_content: plainText,
      is_pinned: isPinned,
      is_archived: isArchived,
      is_deleted: isDeleted,
      color: COLOR_MAP[note.color] || 'default',
      created_at: createdAt,
      updated_at: updatedAt,
      // Stamp the state-timestamp columns the app uses for trash/archive
      // ordering and trash auto-purge; left NULL when the state isn't active,
      // matching how the app stamps them on pin/archive/trash.
      pinned_at: isPinned ? updatedAt : null,
      archived_at: isArchived ? updatedAt : null,
      trashed_at: isDeleted ? updatedAt : null,
      labels: note.labels || []
    };

    // One transaction per note. db.transaction checks out its own connection
    // from the shared pool, so notes stay isolated from one another.
    const { id, labelsImported } = await db.transaction(async (trx) => {
      const inserted = await trx('notes')
        .insert({
          title: mappedNote.title,
          content: mappedNote.content,
          plain_content: mappedNote.plain_content,
          is_pinned: mappedNote.is_pinned,
          is_archived: mappedNote.is_archived,
          is_deleted: mappedNote.is_deleted,
          color: mappedNote.color,
          created_at: mappedNote.created_at,
          updated_at: mappedNote.updated_at,
          pinned_at: mappedNote.pinned_at,
          archived_at: mappedNote.archived_at,
          trashed_at: mappedNote.trashed_at
        })
        .returning('id');

      const noteId = inserted[0].id;
      let associated = 0;

      for (const label of mappedNote.labels) {
        const labelName = (typeof label === 'string' ? label : (label && label.name) || '').trim();
        if (!labelName) {
          console.warn(`Skipping empty label for note ${noteId}`);
          continue;
        }

        try {
          const tagId = await findOrCreateTag(trx, labelName);
          if (!tagId) continue;

          // Associate tag with note; ignore the duplicate if it already exists.
          await trx('note_tags')
            .insert({ note_id: noteId, tag_id: tagId })
            .onConflict(['note_id', 'tag_id'])
            .ignore();
          associated++;
        } catch (labelError) {
          // A bad label shouldn't sink the whole note — but note that throwing
          // here would still roll the transaction back, so we only swallow
          // errors that ON CONFLICT can't already absorb.
          console.warn(`Error processing label "${labelName}" for note ${noteId}:`, labelError.message);
          throw labelError;
        }
      }

      return { id: noteId, labelsImported: associated };
    });

    return {
      success: true,
      id,
      filename: path.basename(filePath),
      labels: labelsImported
    };
  } catch (error) {
    return {
      success: false,
      filename: path.basename(filePath),
      error: error.message
    };
  }
}

// Process all note files in the takeout directory
async function processGoogleKeepImport(directoryPath) {
  // Get all JSON files in the directory
  const files = fs.readdirSync(directoryPath)
    .filter(file => file.endsWith('.json'))
    .map(file => path.join(directoryPath, file));

  console.log(`Found ${files.length} notes to import`);

  const results = {
    total: files.length,
    successful: 0,
    failed: 0,
    labelsImported: 0,
    failures: []
  };

  // Process notes one at a time. Each runs in its own transaction on its own
  // pooled connection; sequential processing keeps tag creation race-free and
  // bounds load on the shared pool while the app is running.
  for (let i = 0; i < files.length; i++) {
    const result = await processNoteFile(files[i]);

    if (result.success) {
      results.successful++;
      results.labelsImported += result.labels || 0;
    } else {
      results.failed++;
      results.failures.push({ file: result.filename, error: result.error });
      console.error(`Failed to import ${result.filename}: ${result.error}`);
    }

    // Emit progress for the SSE route, which parses "Progress: X/Y".
    const processed = i + 1;
    if (processed === files.length || processed % 10 === 0) {
      console.log(`Progress: ${processed}/${files.length} notes processed.`);
    }
  }

  console.log('\nImport Summary:');
  console.log(`Total notes: ${results.total}`);
  console.log(`Successfully imported: ${results.successful}`);
  console.log(`Tags/labels imported: ${results.labelsImported}`);
  console.log(`Failed: ${results.failed}`);

  if (results.failures.length > 0) {
    console.log('\nFailed imports:');
    results.failures.forEach(failure => {
      console.log(`- ${failure.file}: ${failure.error}`);
    });
  }

  return results;
}

// Stand-alone execution when script is run directly
if (require.main === module) {
  const takeoutDir = path.resolve(__dirname, '../../itsnotes-takeout');

  // Check if directory exists
  if (!fs.existsSync(takeoutDir)) {
    console.error(`Directory not found: ${takeoutDir}`);
    process.exit(1);
  }

  // Run the import. Only tear the shared pool down here, in standalone mode —
  // when called from the API the server owns the pool's lifecycle.
  processGoogleKeepImport(takeoutDir)
    .then(() => {
      console.log('Import completed');
      return db.destroy();
    })
    .then(() => process.exit(0))
    .catch(async (error) => {
      console.error('Unhandled error:', error);
      try { await db.destroy(); } catch (_) { /* ignore */ }
      process.exit(1);
    });
}

// Export functions for use in the API
module.exports = {
  processGoogleKeepImport,
  usecToIso
};
