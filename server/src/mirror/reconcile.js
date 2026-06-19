'use strict';

// Pure desired-state reconciler for the Markdown mirror.
//
// Given the target state (every live note, already rendered + hashed + assigned a
// rel_path) and the current state (the note_files rows + which files exist on disk),
// it computes the minimal list of filesystem actions to converge. No I/O, no DB —
// the worker executes the returned plan. This is the correctness core, so it's pure
// and unit-tested in isolation.
//
// See docs/md-mirroring-roadmap.md → "Phase 2 — One-way export".

// Action types:
//   create — write a new file at relPath (no prior file, or the prior file vanished)
//   update — rewrite the file at relPath (same path, content changed)
//   rename — move oldPath → relPath; rewrite too when content changed
//   delete — remove oldPath (the note no longer exists)
//
// desired:  Array<{ noteId, relPath, hash }>      // target file for each live note
// tracked:  Map<noteId, { relPath, hash }>        // current note_files rows
// onDisk:   Set<string>                           // rel paths actually present on disk
function planReconcile({ desired, tracked, onDisk }) {
  const actions = [];
  const seen = new Set();

  for (const note of desired) {
    seen.add(note.noteId);
    const prev = tracked.get(note.noteId);

    if (!prev) {
      actions.push({ type: 'create', noteId: note.noteId, relPath: note.relPath, hash: note.hash });
      continue;
    }

    const pathChanged = prev.relPath !== note.relPath;
    const hashChanged = prev.hash !== note.hash;

    if (pathChanged) {
      // If the old file is actually there, move it (git sees a rename); otherwise
      // there's nothing to move, so just create the new file.
      if (onDisk.has(prev.relPath)) {
        actions.push({
          type: 'rename',
          noteId: note.noteId,
          oldPath: prev.relPath,
          relPath: note.relPath,
          hash: note.hash,
          rewrite: hashChanged,
        });
      } else {
        actions.push({ type: 'create', noteId: note.noteId, relPath: note.relPath, hash: note.hash });
      }
      continue;
    }

    // Same path: rewrite if content drifted or the file was deleted out from under us.
    if (hashChanged || !onDisk.has(note.relPath)) {
      actions.push({ type: 'update', noteId: note.noteId, relPath: note.relPath, hash: note.hash });
    }
  }

  // Tracked notes that are no longer live → delete their files.
  for (const [noteId, prev] of tracked) {
    if (!seen.has(noteId)) {
      actions.push({ type: 'delete', noteId, oldPath: prev.relPath });
    }
  }

  return actions;
}

module.exports = { planReconcile };
