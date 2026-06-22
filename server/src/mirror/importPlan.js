'use strict';

// Pure change-detector for the reverse direction (folder → DB import).
//
// planReconcile (export side) asks "what files must I write to match the DB?".
// This asks the mirror image: "which files on disk did a human edit since we last
// wrote them, and what should the import do about each?". No I/O, no DB — the
// caller gathers the disk state (read + hash + parse frontmatter) and the tracked
// state (note_files rows), and this sorts every file into a bucket. The buckets
// double as the dry-run preview shown before anything is applied.
//
// See docs/md-mirroring-roadmap.md → "Phase 3 — Import (folder → DB)".

// Buckets:
//   unchanged — disk hash equals the hash we last wrote: skip, nothing to import.
//   edited    — same tracked path, file drifted but the DB note did not: import it.
//   conflict  — the file AND the DB note both drifted since last sync to *different*
//               content: we can't know which is newer, so the caller keeps the DB
//               version and writes the file's contents to a conflict file (nothing
//               is lost). Only populated when `dbHashes` is supplied.
//   created   — a file we don't track by path or id: hand-made or unknown origin.
//   renamed   — frontmatter id matches a tracked note now living at a new path
//               (alsoEdited flags that the body/meta drifted in the move too).
//   missing   — a tracked note whose file is gone from disk (caller ignores it; the
//               next export simply re-creates the file).
//
// tracked:   Map<noteId, { relPath, hash }>   // current note_files rows (last sync)
// diskFiles: Array<{ relPath, hash, id }>      // id = frontmatter id or null
// dbHashes:  Map<noteId, hash>                 // current render hash of each live note
//                                              // (optional; enables conflict detection)
function planImport({ diskFiles, tracked, dbHashes = new Map() }) {
  const byPath = new Map();
  for (const [noteId, prev] of tracked) {
    byPath.set(prev.relPath, { noteId, hash: prev.hash });
  }

  const unchanged = [];
  const edited = [];
  const conflict = [];
  const created = [];
  const renamed = [];
  const seenNoteIds = new Set();

  // Did the DB note diverge from what we last wrote? Unknown id (no live note) is
  // treated as no divergence — the caller skips any note that no longer exists.
  const dbChanged = (noteId, syncedHash) =>
    dbHashes.has(noteId) && dbHashes.get(noteId) !== syncedHash;

  for (const file of diskFiles) {
    const atPath = byPath.get(file.relPath);

    // 1) A file sitting where we last wrote it: unchanged, edited, or conflicted.
    if (atPath) {
      seenNoteIds.add(atPath.noteId);
      const diverged = dbChanged(atPath.noteId, atPath.hash);
      if (atPath.hash === file.hash) {
        unchanged.push({ noteId: atPath.noteId, relPath: file.relPath });
      } else if (diverged && dbHashes.get(atPath.noteId) === file.hash) {
        // Both sides independently arrived at the same content → nothing to import.
        unchanged.push({ noteId: atPath.noteId, relPath: file.relPath });
      } else if (diverged) {
        // Both sides moved, to different content → genuine conflict.
        conflict.push({ noteId: atPath.noteId, relPath: file.relPath, hash: file.hash });
      } else {
        // Only the file moved → import it.
        edited.push({ noteId: atPath.noteId, relPath: file.relPath, hash: file.hash });
      }
      continue;
    }

    // 2) Not at a tracked path, but its frontmatter id names a note we track
    //    elsewhere and haven't matched yet → the human moved/renamed the file.
    const moved = file.id != null ? tracked.get(file.id) : undefined;
    if (moved && !seenNoteIds.has(file.id)) {
      seenNoteIds.add(file.id);
      renamed.push({
        noteId: file.id,
        oldPath: moved.relPath,
        relPath: file.relPath,
        hash: file.hash,
        alsoEdited: moved.hash !== file.hash,
      });
      continue;
    }

    // 3) Nothing ties it to a tracked note → a newly added file.
    created.push({ relPath: file.relPath, hash: file.hash, id: file.id ?? null });
  }

  // Tracked notes whose file we never encountered on disk → it was deleted/moved away.
  const missing = [];
  for (const [noteId, prev] of tracked) {
    if (!seenNoteIds.has(noteId)) {
      missing.push({ noteId, relPath: prev.relPath });
    }
  }

  return { unchanged, edited, conflict, created, renamed, missing };
}

module.exports = { planImport };
