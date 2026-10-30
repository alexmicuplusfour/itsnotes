import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NoteSelectionProvider, useNoteSelection } from './NoteSelectionContext';
import { useNotes } from './NotesContext';
import { tagsApi } from '../services/api';

vi.mock('./NotesContext', () => ({ useNotes: vi.fn() }));
vi.mock('./TagsContext', () => ({ useTags: () => ({ hiddenTagIds: new Set() }) }));
vi.mock('../services/api', () => ({
  notesApi: {},
  tagsApi: { bulkAddTagToNotes: vi.fn(), bulkRemoveTagFromNotes: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('bulk tag failure reporting', () => {
  it.each(['bulkAddTagToNotes', 'bulkRemoveTagFromNotes'])(
    '%s reports the failure to both the UI and the caller',
    async action => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Offline');
      const setError = vi.fn();
      const updateNotesFromServer = vi.fn();
      useNotes.mockReturnValue({ notes: [], setError, updateNotesFromServer });
      tagsApi[action].mockRejectedValueOnce(error);

      const { result } = renderHook(() => useNoteSelection(), {
        wrapper: ({ children }) => (
          <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <NoteSelectionProvider>{children}</NoteSelectionProvider>
          </MemoryRouter>
        ),
      });

      await expect(result.current[action](['note-1'], 'folder')).rejects.toBe(error);
      expect(setError).toHaveBeenCalled();
      expect(updateNotesFromServer).not.toHaveBeenCalled();
    }
  );
});
