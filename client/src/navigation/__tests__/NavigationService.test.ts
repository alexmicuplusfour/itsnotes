/**
 * NavigationService Tests
 *
 * Comprehensive tests for the NavigationService.
 * Tests all navigation scenarios from the logs.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NavigationService } from '../NavigationService';

describe('NavigationService', () => {
  let service: NavigationService;
  let currentParams: URLSearchParams;
  let navigateCalls: Array<{ search: string; replace: boolean }>;
  let saveNoteCalls: string[];
  let fetchNoteCalls: string[];

  // Mock navigate function
  const mockNavigate = (
    url: string | { search: string },
    options: { replace?: boolean } = {}
  ) => {
    const search = typeof url === 'string' ? url : url.search;
    navigateCalls.push({
      search,
      replace: options.replace ?? false,
    });

    // Update currentParams to simulate URL change
    currentParams = new URLSearchParams(search);
  };

  // Mock getCurrentParams function
  const mockGetCurrentParams = () => currentParams;

  beforeEach(() => {
    currentParams = new URLSearchParams('');
    navigateCalls = [];
    saveNoteCalls = [];
    fetchNoteCalls = [];

    service = new NavigationService(mockNavigate, mockGetCurrentParams);

    // Set up callbacks
    service.onSaveNote(async (noteId) => {
      saveNoteCalls.push(noteId);
    });

    service.onFetchNote(async (noteId) => {
      fetchNoteCalls.push(noteId);
    });

    // Default to grid view
    service.setViewType('grid');
  });

  describe('openNote', () => {
    it('opens a note from card click (Scenario 1)', async () => {
      await service.openNote('abc123', 'card');

      expect(navigateCalls).toHaveLength(1);
      expect(navigateCalls[0].search).toBe('note=abc123');
      expect(navigateCalls[0].replace).toBe(false);
      expect(fetchNoteCalls).toEqual(['abc123']);
    });

    it('replaces open note when opening from card', async () => {
      // Open first note
      currentParams = new URLSearchParams('?note=first');
      await service.openNote('second', 'card');

      expect(saveNoteCalls).toEqual(['first']);
      expect(navigateCalls[0].search).toBe('note=second');
    });

    it('opens note from starred tab (Scenario 5)', async () => {
      await service.openNote('abc123', 'starred-tab');

      expect(navigateCalls[0].search).toBe('note=abc123');
      expect(fetchNoteCalls).toEqual(['abc123']);
    });

    it('switches notes via starred tabs (Scenario 6)', async () => {
      currentParams = new URLSearchParams('?note=noteA');
      await service.openNote('noteB', 'starred-tab');

      expect(saveNoteCalls).toEqual(['noteA']);
      expect(navigateCalls[0].search).toBe('note=noteB');
    });

    it('opens note from list view (Scenario 22)', async () => {
      service.setViewType('list');
      await service.openNote('abc123', 'list-item');

      expect(navigateCalls[0].search).toBe('note=abc123');
      // First note should NOT replace (list view first-open behavior)
      expect(navigateCalls[0].replace).toBe(false);
    });

    it('uses replace for second note in list view (Scenario 23)', async () => {
      service.setViewType('list');

      // First note
      await service.openNote('first', 'list-item');
      currentParams = new URLSearchParams(navigateCalls[0].search);

      // Second note
      await service.openNote('second', 'list-item');

      expect(navigateCalls).toHaveLength(2);
      expect(navigateCalls[1].replace).toBe(true); // Should replace!
    });

    it('clears scroll position when opening new note', async () => {
      currentParams = new URLSearchParams('?note=first&scroll=first:688');
      await service.openNote('second', 'card');

      const params = new URLSearchParams(navigateCalls[0].search);
      expect(params.get('scroll')).toBeNull();
    });

    it('throws error if trying to use openNote for references', async () => {
      await expect(
        service.openNote('abc123', 'reference')
      ).rejects.toThrow('Use openReferencedNote()');
    });

    it('respects replaceHistory option', async () => {
      await service.openNote('abc123', 'card', { replaceHistory: true });

      expect(navigateCalls[0].replace).toBe(true);
    });

    it('skips autosave when disabled', async () => {
      currentParams = new URLSearchParams('?note=first');
      await service.openNote('second', 'card', { autoSave: false });

      expect(saveNoteCalls).toHaveLength(0);
    });
  });

  describe('openReferencedNote', () => {
    it('opens referenced note and creates stack (Scenario 7)', async () => {
      currentParams = new URLSearchParams('?note=noteA');
      await service.openReferencedNote('noteB', 688);

      expect(navigateCalls[0].search).toBe('note=noteA%2CnoteB&scroll=noteA%3A688%2CnoteB%3A0');
      expect(navigateCalls[0].replace).toBe(false); // Always push for references
      expect(fetchNoteCalls).toEqual(['noteB']);
    });

    it('saves scroll position of current note', async () => {
      currentParams = new URLSearchParams('?note=noteA');
      await service.openReferencedNote('noteB', 250);

      const params = new URLSearchParams(navigateCalls[0].search);
      expect(params.get('scroll')).toContain('noteA:250');
    });

    it('creates deep stack (Scenario 9: A→B→C)', async () => {
      currentParams = new URLSearchParams('?note=noteA');
      await service.openReferencedNote('noteB', 100);

      currentParams = new URLSearchParams(navigateCalls[0].search);
      await service.openReferencedNote('noteC', 200);

      const params = new URLSearchParams(navigateCalls[1].search);
      expect(params.get('note')).toBe('noteA,noteB,noteC');
      expect(params.get('scroll')).toContain('noteB:200');
    });

    it('prevents circular references (Scenario 45)', async () => {
      currentParams = new URLSearchParams('?note=noteA,noteB');
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await service.openReferencedNote('noteA', 100); // Try to add A again

      expect(navigateCalls).toHaveLength(0); // Should not navigate
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Circular reference detected')
      );

      consoleWarn.mockRestore();
    });

    it('allows circular references when preventCircular=false', async () => {
      currentParams = new URLSearchParams('?note=noteA,noteB');
      await service.openReferencedNote('noteA', 100, { preventCircular: false });

      expect(navigateCalls).toHaveLength(1);
      const params = new URLSearchParams(navigateCalls[0].search);
      expect(params.get('note')).toBe('noteA,noteB,noteA');
    });

    it('saves current note before opening referenced note', async () => {
      currentParams = new URLSearchParams('?note=noteA');
      await service.openReferencedNote('noteB', 100);

      expect(saveNoteCalls).toEqual(['noteA']);
    });
  });

  describe('closeNote', () => {
    it('closes single note (Scenario 2)', async () => {
      currentParams = new URLSearchParams('?note=abc123');
      await service.closeNote('close-button');

      expect(saveNoteCalls).toEqual(['abc123']);
      expect(navigateCalls[0].search).toBe('');
      expect(navigateCalls[0].replace).toBe(false);
    });

    it('pops note from stack (Scenario 8)', async () => {
      currentParams = new URLSearchParams('?note=noteA,noteB&scroll=noteA:688,noteB:0');
      await service.closeNote('close-button');

      const params = new URLSearchParams(navigateCalls[0].search);
      expect(params.get('note')).toBe('noteA');
      expect(params.get('scroll')).toBe('noteA:688'); // Scroll restored!
    });

    it('pops from deep stack (Scenario 10)', async () => {
      currentParams = new URLSearchParams('?note=noteA,noteB,noteC');
      await service.closeNote('back-button');

      const params = new URLSearchParams(navigateCalls[0].search);
      expect(params.get('note')).toBe('noteA,noteB');
    });

    it('does nothing if no note open', async () => {
      currentParams = new URLSearchParams('');
      await service.closeNote('close-button');

      expect(navigateCalls).toHaveLength(0);
    });

    it('handles different close triggers', async () => {
      currentParams = new URLSearchParams('?note=abc123');

      await service.closeNote('click-outside');
      expect(navigateCalls).toHaveLength(1);

      currentParams = new URLSearchParams('?note=abc123');
      await service.closeNote('escape-key');
      expect(navigateCalls).toHaveLength(2);
    });

    it('skips autosave when disabled', async () => {
      currentParams = new URLSearchParams('?note=abc123');
      await service.closeNote('close-button', { autoSave: false });

      expect(saveNoteCalls).toHaveLength(0);
    });
  });

  describe('closeAllNotes', () => {
    it('closes all notes in stack (Scenario 11)', async () => {
      currentParams = new URLSearchParams('?note=noteA,noteB,noteC');
      await service.closeAllNotes();

      expect(navigateCalls[0].search).toBe('');
    });

    it('preserves search query when closing notes', async () => {
      currentParams = new URLSearchParams('?note=abc123&q=search');
      await service.closeAllNotes();

      const params = new URLSearchParams(navigateCalls[0].search);
      expect(params.get('q')).toBe('search');
      expect(params.get('note')).toBeNull();
    });

    it('saves current note before closing all', async () => {
      currentParams = new URLSearchParams('?note=noteA,noteB');
      await service.closeAllNotes();

      expect(saveNoteCalls).toEqual(['noteB']); // Saves current (last in stack)
    });
  });

  describe('navigateToSearch', () => {
    it('closes note in grid view (Scenario 13)', () => {
      service.setViewType('grid');
      currentParams = new URLSearchParams('?note=abc123');

      service.navigateToSearch('#tagname');

      const params = new URLSearchParams(navigateCalls[0].search);
      expect(params.get('q')).toBe('#tagname');
      expect(params.get('note')).toBeNull(); // Note closed!
      expect(navigateCalls[0].replace).toBe(true);
    });

    it('preserves note in list view (Scenario 28)', () => {
      service.setViewType('list');
      currentParams = new URLSearchParams('?note=abc123');

      service.navigateToSearch('#attachment');

      const params = new URLSearchParams(navigateCalls[0].search);
      expect(params.get('q')).toBe('#attachment');
      expect(params.get('note')).toBe('abc123'); // Note preserved!
    });

    it('handles tag search', () => {
      currentParams = new URLSearchParams('');
      service.navigateToSearch('#tagname');

      const params = new URLSearchParams(navigateCalls[0].search);
      expect(params.get('q')).toBe('#tagname');
    });

    it('handles color search', () => {
      currentParams = new URLSearchParams('');
      service.navigateToSearch('red');

      const params = new URLSearchParams(navigateCalls[0].search);
      expect(params.get('q')).toBe('red');
    });

    it('handles book search', () => {
      currentParams = new URLSearchParams('');
      service.navigateToSearch('{Attachment}');

      const params = new URLSearchParams(navigateCalls[0].search);
      expect(params.get('q')).toBe('{Attachment}');
    });

    it('can override preserveNote option', () => {
      service.setViewType('list');
      currentParams = new URLSearchParams('?note=abc123');

      // Override list view default
      service.navigateToSearch('#tag', { preserveNoteOnSearch: false });

      const params = new URLSearchParams(navigateCalls[0].search);
      expect(params.get('note')).toBeNull();
    });
  });

  describe('clearSearch', () => {
    it('clears search query (Scenario 31)', () => {
      currentParams = new URLSearchParams('?q=search&note=abc123');
      service.clearSearch();

      const params = new URLSearchParams(navigateCalls[0].search);
      expect(params.get('q')).toBeNull();
      expect(params.get('note')).toBe('abc123'); // Note preserved
    });

    it('uses replace history', () => {
      currentParams = new URLSearchParams('?q=search');
      service.clearSearch();

      expect(navigateCalls[0].replace).toBe(true);
    });
  });

  describe('updateScrollPosition', () => {
    it('updates scroll position using replace', () => {
      currentParams = new URLSearchParams('?note=abc123');
      service.updateScrollPosition(688);

      // Should use navigate with replace: true
      expect(navigateCalls).toHaveLength(1);
      expect(navigateCalls[0].replace).toBe(true);

      // Check URL was updated
      const params = new URLSearchParams(navigateCalls[0].search);
      expect(params.get('scroll')).toBe('abc123:688');
    });

    it('does nothing if no note open', () => {
      currentParams = new URLSearchParams('');
      service.updateScrollPosition(688);

      expect(navigateCalls).toHaveLength(0);
    });

    it('updates scroll for current note in stack', () => {
      currentParams = new URLSearchParams('?note=noteA,noteB&scroll=noteA:100,noteB:0');
      service.updateScrollPosition(250);

      expect(navigateCalls).toHaveLength(1);
      const params = new URLSearchParams(navigateCalls[0].search);
      expect(params.get('scroll')).toContain('noteB:250');
    });
  });

  describe('getScrollPosition', () => {
    it('returns scroll position for note', () => {
      currentParams = new URLSearchParams('?note=abc123&scroll=abc123:688');
      const position = service.getScrollPosition('abc123');

      expect(position).toBe(688);
    });

    it('returns 0 for note without scroll', () => {
      currentParams = new URLSearchParams('?note=abc123');
      const position = service.getScrollPosition('abc123');

      expect(position).toBe(0);
    });

    it('returns current note scroll position', () => {
      currentParams = new URLSearchParams('?note=abc123&scroll=abc123:688');
      const position = service.getCurrentScrollPosition();

      expect(position).toBe(688);
    });

    it('returns 0 when no note open', () => {
      currentParams = new URLSearchParams('');
      const position = service.getCurrentScrollPosition();

      expect(position).toBe(0);
    });
  });

  describe('getState', () => {
    it('returns current navigation state', () => {
      currentParams = new URLSearchParams('?note=abc123,def456&scroll=abc123:688,def456:0&q=search');
      const state = service.getState();

      expect(state).toEqual({
        noteStack: [
          { id: 'abc123', scrollPosition: 688 },
          { id: 'def456', scrollPosition: 0 },
        ],
        searchQuery: 'search',
        currentNoteId: 'def456',
        hasNoteOpen: true,
        isSearchActive: true,
      });
    });
  });

  describe('subscribe', () => {
    it('notifies subscribers on state change', async () => {
      const states: any[] = [];
      service.subscribe((state) => states.push(state));

      await service.openNote('abc123', 'card');

      expect(states).toHaveLength(1);
      expect(states[0].currentNoteId).toBe('abc123');
    });

    it('returns unsubscribe function', async () => {
      const states: any[] = [];
      const unsubscribe = service.subscribe((state) => states.push(state));

      await service.openNote('abc123', 'card');
      expect(states).toHaveLength(1);

      unsubscribe();
      currentParams = new URLSearchParams(navigateCalls[0].search);
      await service.openNote('def456', 'card');

      expect(states).toHaveLength(1); // Not called after unsubscribe
    });
  });

  describe('handleBrowserBack', () => {
    it('notifies subscribers without navigating', async () => {
      const states: any[] = [];
      service.subscribe((state) => states.push(state));

      currentParams = new URLSearchParams('?note=abc123');
      await service.handleBrowserBack();

      expect(navigateCalls).toHaveLength(0); // No navigation
      expect(states).toHaveLength(1); // But subscribers notified
    });
  });

  describe('view configurations', () => {
    it('applies grid view config', () => {
      service.setViewType('grid');
      currentParams = new URLSearchParams('?note=abc123');

      service.navigateToSearch('#tag');

      const params = new URLSearchParams(navigateCalls[0].search);
      expect(params.get('note')).toBeNull(); // Note not preserved
    });

    it('applies list view config', () => {
      service.setViewType('list');
      currentParams = new URLSearchParams('?note=abc123');

      service.navigateToSearch('#tag');

      const params = new URLSearchParams(navigateCalls[0].search);
      expect(params.get('note')).toBe('abc123'); // Note preserved
    });

    it('applies stacked view config', () => {
      service.setViewType('stacked');
      currentParams = new URLSearchParams('?note=abc123');

      service.navigateToSearch('#tag');

      const params = new URLSearchParams(navigateCalls[0].search);
      expect(params.get('note')).toBeNull(); // Note not preserved
    });
  });

  describe('error handling', () => {
    it('continues navigation if save fails', async () => {
      service.onSaveNote(async () => {
        throw new Error('Save failed');
      });

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      currentParams = new URLSearchParams('?note=first');

      await service.openNote('second', 'card');

      expect(navigateCalls).toHaveLength(1); // Navigation still happened
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe('session management', () => {
    it('tracks first note in list view session', async () => {
      service.setViewType('list');

      await service.openNote('first', 'list-item');
      expect(navigateCalls[0].replace).toBe(false); // First note pushes

      currentParams = new URLSearchParams(navigateCalls[0].search);
      await service.openNote('second', 'list-item');
      expect(navigateCalls[1].replace).toBe(true); // Second replaces

      service.resetSession();
      currentParams = new URLSearchParams(navigateCalls[1].search);
      await service.openNote('third', 'list-item');
      expect(navigateCalls[2].replace).toBe(false); // First after reset pushes
    });
  });
});
