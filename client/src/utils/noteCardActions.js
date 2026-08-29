/**
 * The state-changing actions a note card offers, as data.
 *
 * Three surfaces render this list: the note card's hover bar and the list row's hover bar
 * (both after their own color and tag buttons), and the mobile long-press strip. Sharing one
 * definition is what keeps them from drifting apart.
 *
 * `actions` is the NoteActionsContext value. Each entry's `run` is a zero-arg callback ready
 * to hand straight to an onClick.
 */
export const buildNoteStateActions = ({ note, view, actions }) => {
  const isArchived = note?.is_archived === true;
  const isDeleted = note?.is_deleted === true;
  const list = [];

  if (isArchived) {
    list.push({ key: 'unarchive', icon: 'unarchive', title: 'Unarchive', run: () => actions.unarchiveNote(note.id) });
  } else if (!isDeleted) {
    list.push({ key: 'archive', icon: 'archive', title: 'Archive', run: () => actions.archiveNote(note.id) });
  }

  list.push({
    key: 'pin',
    icon: note.is_pinned ? 'pinned' : 'pin',
    title: note.is_pinned ? 'Unpin' : 'Pin',
    run: () => actions.togglePin(note.id),
  });

  if (view === 'trash') {
    list.push({ key: 'restore', icon: 'restore', title: 'Restore', run: () => actions.restoreNote(note.id) });
    list.push({ key: 'deleteForever', icon: 'deleteForever', title: 'Delete permanently', run: () => actions.deleteNote(note.id) });
  } else if (view === 'main' || view === 'archive') {
    list.push({ key: 'trash', icon: 'trash', title: 'Move to trash', run: () => actions.trashNote(note.id) });
  }

  return list;
};
