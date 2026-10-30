import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TagPicker } from './NoteTagPicker';
import { useTags } from '../contexts/TagsContext';
import { useNotes } from '../contexts/NotesContext';
import { useNoteSelection } from '../contexts/NoteSelectionContext';
import { tagsApi } from '../services/api';
import { clearTagCache } from '../hooks/useNoteTagsModal';

vi.mock('../contexts/TagsContext', () => ({ useTags: vi.fn() }));
vi.mock('../contexts/NotesContext', () => ({ useNotes: vi.fn() }));
vi.mock('../contexts/NoteSelectionContext', () => ({ useNoteSelection: vi.fn() }));
vi.mock('../contexts/UIPreferencesContext', () => ({
  useUIPreferences: () => ({ aiEnabled: false }),
}));
vi.mock('../contexts/AutoTaggingContext', () => ({
  AUTO_TAG_FEATURES: { AI_GENERATED: 'ai' },
  useAutoTagging: () => ({ getFeatureSettings: () => ({ enabled: false }) }),
}));
vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('../services/api', () => ({
  tagsApi: { addTagToNote: vi.fn(), removeTagFromNote: vi.fn(), getNoteTags: vi.fn() },
  aiApi: {},
}));
vi.mock('../hooks/useNoteTagsModal', () => ({ clearTagCache: vi.fn() }));

const parent = { id: 'parent', name: 'Photoshop', is_folder: true, parent_id: null };
const archive = { id: 'archive', name: 'Archive', is_folder: true, parent_id: parent.id };
const future = { id: 'future', name: 'Future', is_folder: true, parent_id: parent.id };
const unrelated = { id: 'other', name: 'Projects', is_folder: true, parent_id: null };
const tag = { id: 'tag', name: 'design', is_folder: false, parent_id: null };
const allTags = [parent, archive, future, unrelated, tag];

let bulkAddTagToNotes;
let bulkRemoveTagFromNotes;
let refreshTags;

beforeEach(() => {
  vi.clearAllMocks();
  bulkAddTagToNotes = vi.fn().mockResolvedValue(undefined);
  bulkRemoveTagFromNotes = vi.fn().mockResolvedValue(undefined);
  refreshTags = vi.fn();
  useTags.mockReturnValue({ tags: allTags, loading: false, error: null });
  useNotes.mockReturnValue({ allNotesUnfiltered: [], setNotes: vi.fn() });
  useNoteSelection.mockReturnValue({ bulkAddTagToNotes, bulkRemoveTagFromNotes });
  tagsApi.addTagToNote.mockResolvedValue({});
  tagsApi.removeTagFromNote.mockResolvedValue({});
  tagsApi.getNoteTags.mockResolvedValue({ tags: [] });
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const openPicker = ({ selected = [], notes = null } = {}) => {
  if (notes) {
    useNotes.mockReturnValue({ allNotesUnfiltered: notes, setNotes: vi.fn() });
  }
  render(
    <TagPicker
      noteId="note-1"
      onClose={vi.fn()}
      triggerRef={React.createRef()}
      forwardedRef={React.createRef()}
      overlayRef={React.createRef()}
      isMobile={false}
      prefetchedNoteTags={selected}
      isBulkMode={!!notes}
      selectedNoteIds={new Set(notes?.map(note => note.id))}
      refreshTags={refreshTags}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Folders' }));
};

const checkbox = folder => screen.getByRole('checkbox', { name: folder.name });
const expectChecked = (folder, checked) => {
  expect(checkbox(folder).getAttribute('aria-checked')).toBe(String(checked));
};
const waitForSave = folder => waitFor(() => {
  expect(checkbox(folder).getAttribute('aria-disabled')).toBeNull();
});

describe('folder selection for one note', () => {
  it('unchecks the parent when a subfolder is checked', async () => {
    openPicker({ selected: [parent, unrelated, tag] });
    fireEvent.click(checkbox(archive));
    await waitForSave(archive);

    await waitFor(() => expect(tagsApi.addTagToNote).toHaveBeenCalledWith('note-1', archive.id));
    expect(tagsApi.removeTagFromNote).toHaveBeenCalledTimes(1);
    expect(tagsApi.removeTagFromNote).toHaveBeenCalledWith('note-1', parent.id);
    expectChecked(parent, false);
    expectChecked(archive, true);
    expectChecked(unrelated, true);
    expect(clearTagCache).toHaveBeenCalledWith('note-1');
    expect(refreshTags).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Tags' }));
    expectChecked(tag, true);
  });

  it('unchecks all selected subfolders when their parent is checked', async () => {
    openPicker({ selected: [archive, future, unrelated] });
    fireEvent.click(checkbox(parent));
    await waitForSave(parent);

    await waitFor(() => expect(tagsApi.addTagToNote).toHaveBeenCalledWith('note-1', parent.id));
    expect(tagsApi.removeTagFromNote).toHaveBeenCalledTimes(2);
    expect(tagsApi.removeTagFromNote).toHaveBeenCalledWith('note-1', archive.id);
    expect(tagsApi.removeTagFromNote).toHaveBeenCalledWith('note-1', future.id);
    expectChecked(parent, true);
    expectChecked(archive, false);
    expectChecked(future, false);
    expectChecked(unrelated, true);
  });

  it('keeps sibling folders selected', async () => {
    openPicker({ selected: [archive] });
    fireEvent.click(checkbox(future));
    await waitForSave(future);

    await waitFor(() => expect(tagsApi.addTagToNote).toHaveBeenCalledWith('note-1', future.id));
    expect(tagsApi.removeTagFromNote).not.toHaveBeenCalled();
    expectChecked(archive, true);
    expectChecked(future, true);
  });

  it('only removes the clicked folder when unchecking it', async () => {
    openPicker({ selected: [archive, unrelated] });
    fireEvent.click(checkbox(archive));
    await waitForSave(archive);

    await waitFor(() => expect(tagsApi.removeTagFromNote).toHaveBeenCalledWith('note-1', archive.id));
    expect(tagsApi.addTagToNote).not.toHaveBeenCalled();
    expectChecked(archive, false);
    expectChecked(parent, false);
    expectChecked(unrelated, true);
  });

  it('keeps the original folder when adding the destination fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    tagsApi.addTagToNote.mockRejectedValueOnce(new Error('Offline'));
    tagsApi.getNoteTags.mockResolvedValueOnce({ tags: [parent, unrelated] });
    openPicker({ selected: [parent, unrelated] });
    fireEvent.click(checkbox(archive));
    await waitForSave(archive);

    expect(tagsApi.removeTagFromNote).not.toHaveBeenCalled();
    expectChecked(parent, true);
    expectChecked(archive, false);
    expectChecked(unrelated, true);
    expect(window.alert).toHaveBeenCalled();
  });

  it('reloads the saved memberships after a partial failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    tagsApi.removeTagFromNote.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Offline'));
    tagsApi.getNoteTags.mockResolvedValueOnce({ tags: [parent, future, unrelated] });
    openPicker({ selected: [archive, future, unrelated] });
    fireEvent.click(checkbox(parent));
    await waitForSave(parent);

    expectChecked(parent, true);
    expectChecked(archive, false);
    expectChecked(future, true);
    expectChecked(unrelated, true);
    expect(clearTagCache).toHaveBeenCalledWith('note-1');
    expect(refreshTags).toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalled();
  });

  it('blocks overlapping folder clicks and keyboard changes until the save finishes', async () => {
    let finishAdding;
    tagsApi.addTagToNote.mockImplementationOnce(() => new Promise(resolve => { finishAdding = resolve; }));
    openPicker({ selected: [parent] });
    fireEvent.click(checkbox(archive));
    expect(checkbox(parent).getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(checkbox(parent));
    fireEvent.keyDown(checkbox(future), { key: 'Enter' });
    expect(tagsApi.addTagToNote).toHaveBeenCalledTimes(1);
    expect(tagsApi.removeTagFromNote).not.toHaveBeenCalled();

    await act(async () => { finishAdding({}); });
    await waitForSave(archive);
    expectChecked(parent, false);
    expectChecked(archive, true);
    expectChecked(future, false);
  });
});

describe('folder selection for multiple notes', () => {
  it('clears a partially selected parent when a subfolder is checked', async () => {
    openPicker({ notes: [
      { id: 'note-1', tags: [parent, future, unrelated] },
      { id: 'note-2', tags: [unrelated] },
    ] });
    expectChecked(parent, 'mixed');
    fireEvent.click(checkbox(archive));
    await waitForSave(archive);

    await waitFor(() => expect(bulkAddTagToNotes).toHaveBeenCalledWith(['note-1', 'note-2'], archive.id));
    expect(bulkRemoveTagFromNotes).toHaveBeenCalledTimes(1);
    expect(bulkRemoveTagFromNotes).toHaveBeenCalledWith(['note-1', 'note-2'], parent.id);
    expectChecked(parent, false);
    expectChecked(archive, true);
    expectChecked(future, 'mixed');
    expectChecked(unrelated, true);
    expect(clearTagCache).toHaveBeenCalledWith('note-1');
    expect(clearTagCache).toHaveBeenCalledWith('note-2');
  });

  it('clears all partially selected subfolders when the parent is checked', async () => {
    openPicker({ notes: [
      { id: 'note-1', tags: [archive, unrelated] },
      { id: 'note-2', tags: [future, unrelated] },
    ] });
    fireEvent.click(checkbox(parent));
    await waitForSave(parent);

    await waitFor(() => expect(bulkAddTagToNotes).toHaveBeenCalledWith(['note-1', 'note-2'], parent.id));
    expect(bulkRemoveTagFromNotes).toHaveBeenCalledTimes(2);
    expect(bulkRemoveTagFromNotes).toHaveBeenCalledWith(['note-1', 'note-2'], archive.id);
    expect(bulkRemoveTagFromNotes).toHaveBeenCalledWith(['note-1', 'note-2'], future.id);
    expectChecked(parent, true);
    expectChecked(archive, false);
    expectChecked(future, false);
    expectChecked(unrelated, true);
  });

  it('keeps original memberships when the bulk add fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    bulkAddTagToNotes.mockRejectedValueOnce(new Error('Offline'));
    openPicker({ notes: [
      { id: 'note-1', tags: [parent] },
      { id: 'note-2', tags: [parent] },
    ] });
    fireEvent.click(checkbox(archive));
    await waitForSave(archive);

    expect(bulkRemoveTagFromNotes).not.toHaveBeenCalled();
    expectChecked(parent, true);
    expectChecked(archive, false);
    expect(window.alert).toHaveBeenCalled();
  });

  it('stops removing folders after a failed bulk removal and keeps the saved selection visible', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    bulkRemoveTagFromNotes.mockRejectedValueOnce(new Error('Offline'));
    openPicker({ notes: [
      { id: 'note-1', tags: [archive, future] },
      { id: 'note-2', tags: [archive, future] },
    ] });
    fireEvent.click(checkbox(parent));
    await waitForSave(parent);

    expect(bulkRemoveTagFromNotes).toHaveBeenCalledTimes(1);
    expectChecked(parent, true);
    expectChecked(archive, true);
    expectChecked(future, true);
    expect(window.alert).toHaveBeenCalled();
  });
});
