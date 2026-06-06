/**
 * NavigationContext Tests
 *
 * Tests React integration of NavigationService.
 * Verifies context provider, hooks, and state updates.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { BrowserRouter, useNavigate, useSearchParams } from 'react-router-dom';
import { NavigationProvider, useNavigationContext } from '../NavigationContext';
import { useNavigation } from '../useNavigation';

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
    useSearchParams: vi.fn(),
  };
});

describe('NavigationContext', () => {
  let mockNavigate: ReturnType<typeof vi.fn>;
  let mockSearchParams: URLSearchParams;
  let mockOnSaveNote: ReturnType<typeof vi.fn>;
  let mockOnFetchNote: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockNavigate = vi.fn();
    mockSearchParams = new URLSearchParams();
    mockOnSaveNote = vi.fn().mockResolvedValue(undefined);
    mockOnFetchNote = vi.fn().mockResolvedValue(undefined);

    (useNavigate as ReturnType<typeof vi.fn>).mockReturnValue(mockNavigate);
    (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue([mockSearchParams]);
  });

  const createWrapper = (
    onSaveNote = mockOnSaveNote,
    onFetchNote = mockOnFetchNote
  ) => {
    return ({ children }: { children: ReactNode }) => (
      <BrowserRouter>
        <NavigationProvider onSaveNote={onSaveNote} onFetchNote={onFetchNote}>
          {children}
        </NavigationProvider>
      </BrowserRouter>
    );
  };

  // ============ PROVIDER & HOOK ============

  describe('NavigationProvider', () => {
    it('provides navigation context to children', () => {
      const { result } = renderHook(() => useNavigationContext(), {
        wrapper: createWrapper(),
      });

      expect(result.current).toBeDefined();
      expect(result.current.state).toBeDefined();
      expect(result.current.openNote).toBeTypeOf('function');
      expect(result.current.closeNote).toBeTypeOf('function');
    });

    it('throws error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useNavigationContext());
      }).toThrow('useNavigationContext must be used within NavigationProvider');

      consoleError.mockRestore();
    });

    it('creates single service instance', () => {
      const { result, rerender } = renderHook(() => useNavigationContext(), {
        wrapper: createWrapper(),
      });

      const firstService = result.current.service;
      rerender();
      const secondService = result.current.service;

      expect(firstService).toBe(secondService);
    });

    it('sets up save callback', async () => {
      const { result } = renderHook(() => useNavigationContext(), {
        wrapper: createWrapper(),
      });

      mockSearchParams.set('note', 'abc123');
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue([mockSearchParams]);

      await act(async () => {
        await result.current.openNote('xyz789', 'card');
      });

      expect(mockOnSaveNote).toHaveBeenCalledWith('abc123');
    });

    it('sets up fetch callback', async () => {
      const { result } = renderHook(() => useNavigationContext(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.openNote('abc123', 'card');
      });

      expect(mockOnFetchNote).toHaveBeenCalledWith('abc123');
    });
  });

  describe('useNavigation hook', () => {
    it('is an alias for useNavigationContext', () => {
      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      expect(result.current).toBeDefined();
      expect(result.current.state).toBeDefined();
    });
  });

  // ============ STATE UPDATES ============

  describe('state updates', () => {
    it('initializes with empty state', () => {
      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      expect(result.current.state).toEqual({
        noteStack: [],
        searchQuery: null,
        currentNoteId: null,
        hasNoteOpen: false,
        isSearchActive: false,
      });
    });

    it('updates state when URL changes', () => {
      mockSearchParams = new URLSearchParams('?note=abc123');
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue([mockSearchParams]);

      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      expect(result.current.state.currentNoteId).toBe('abc123');
      expect(result.current.state.hasNoteOpen).toBe(true);
    });

    it('updates state when opening note', async () => {
      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.openNote('abc123', 'card');
      });

      // Simulate URL change
      mockSearchParams = new URLSearchParams('?note=abc123');
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue([mockSearchParams]);

      // Force re-render
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalled();
      });
    });

    it('updates state when closing note', async () => {
      mockSearchParams = new URLSearchParams('?note=abc123');
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue([mockSearchParams]);

      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.closeNote('button');
      });

      expect(mockNavigate).toHaveBeenCalled();
    });

    it('updates state when searching', async () => {
      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.navigateToSearch('test query');
      });

      expect(mockNavigate).toHaveBeenCalled();
    });
  });

  // ============ NAVIGATION ACTIONS ============

  describe('openNote', () => {
    it('opens note from card', async () => {
      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.openNote('abc123', 'card');
      });

      expect(mockNavigate).toHaveBeenCalledWith('?note=abc123', { replace: false });
      expect(mockOnFetchNote).toHaveBeenCalledWith('abc123');
    });

    it('opens note from starred tab', async () => {
      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.openNote('xyz789', 'starred-tab');
      });

      expect(mockNavigate).toHaveBeenCalledWith('?note=xyz789', { replace: false });
    });

    it('replaces open note', async () => {
      mockSearchParams = new URLSearchParams('?note=abc123');
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue([mockSearchParams]);

      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.openNote('xyz789', 'card');
      });

      expect(mockOnSaveNote).toHaveBeenCalledWith('abc123');
      expect(mockOnFetchNote).toHaveBeenCalledWith('xyz789');
    });
  });

  describe('openReferencedNote', () => {
    it('creates note stack', async () => {
      mockSearchParams = new URLSearchParams('?note=abc123');
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue([mockSearchParams]);

      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.openReferencedNote('xyz789', 688);
      });

      expect(mockNavigate).toHaveBeenCalledWith(
        '?note=abc123%2Cxyz789&scroll=abc123%3A688',
        { replace: false }
      );
      expect(mockOnSaveNote).toHaveBeenCalledWith('abc123');
      expect(mockOnFetchNote).toHaveBeenCalledWith('xyz789');
    });

    it('prevents circular references', async () => {
      mockSearchParams = new URLSearchParams('?note=abc123,xyz789');
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue([mockSearchParams]);

      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.openReferencedNote('abc123', 500);
      });

      // Should not navigate (circular ref prevented)
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockOnFetchNote).not.toHaveBeenCalled();
    });
  });

  describe('closeNote', () => {
    it('closes single note', async () => {
      mockSearchParams = new URLSearchParams('?note=abc123');
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue([mockSearchParams]);

      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.closeNote('button');
      });

      expect(mockNavigate).toHaveBeenCalledWith('?', { replace: false });
      expect(mockOnSaveNote).toHaveBeenCalledWith('abc123');
    });

    it('pops from note stack', async () => {
      mockSearchParams = new URLSearchParams('?note=abc123,xyz789&scroll=abc123:688');
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue([mockSearchParams]);

      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.closeNote('button');
      });

      expect(mockNavigate).toHaveBeenCalledWith('?note=abc123&scroll=abc123%3A688', {
        replace: false,
      });
      expect(mockOnSaveNote).toHaveBeenCalledWith('xyz789');
    });
  });

  describe('closeAllNotes', () => {
    it('closes entire stack', async () => {
      mockSearchParams = new URLSearchParams('?note=abc123,xyz789&scroll=abc123:688');
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue([mockSearchParams]);

      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.closeAllNotes();
      });

      expect(mockNavigate).toHaveBeenCalledWith('?', { replace: false });
      expect(mockOnSaveNote).toHaveBeenCalledWith('xyz789');
    });

    it('preserves search query', async () => {
      mockSearchParams = new URLSearchParams('?note=abc123&q=test');
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue([mockSearchParams]);

      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.closeAllNotes();
      });

      expect(mockNavigate).toHaveBeenCalledWith('?q=test', { replace: false });
    });
  });

  // ============ SEARCH ============

  describe('search', () => {
    it('navigates to search', async () => {
      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.navigateToSearch('test query');
      });

      expect(mockNavigate).toHaveBeenCalledWith('?q=test+query', { replace: true });
    });

    it('clears search', async () => {
      mockSearchParams = new URLSearchParams('?q=test');
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue([mockSearchParams]);

      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.clearSearch();
      });

      expect(mockNavigate).toHaveBeenCalledWith('?', { replace: true });
    });

    it('preserves note in list view', async () => {
      mockSearchParams = new URLSearchParams('?note=abc123');
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue([mockSearchParams]);

      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.setViewType('list');
        result.current.navigateToSearch('test');
      });

      expect(mockNavigate).toHaveBeenCalledWith('?note=abc123&q=test', { replace: true });
    });

    it('closes note in grid view', async () => {
      mockSearchParams = new URLSearchParams('?note=abc123');
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue([mockSearchParams]);

      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.setViewType('grid');
        result.current.navigateToSearch('test');
      });

      expect(mockNavigate).toHaveBeenCalledWith('?q=test', { replace: true });
    });
  });

  // ============ SCROLL ============

  describe('scroll', () => {
    it('updates scroll position', async () => {
      mockSearchParams = new URLSearchParams('?note=abc123');
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue([mockSearchParams]);

      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.updateScrollPosition(688);
      });

      expect(mockNavigate).toHaveBeenCalledWith('?note=abc123&scroll=abc123%3A688', {
        replace: true,
      });
    });

    it('gets scroll position for note', () => {
      mockSearchParams = new URLSearchParams('?note=abc123&scroll=abc123:688,xyz789:500');
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue([mockSearchParams]);

      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      expect(result.current.getScrollPosition('abc123')).toBe(688);
      expect(result.current.getScrollPosition('xyz789')).toBe(500);
      expect(result.current.getScrollPosition('unknown')).toBe(0);
    });

    it('gets current scroll position', () => {
      mockSearchParams = new URLSearchParams('?note=abc123&scroll=abc123:688');
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue([mockSearchParams]);

      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      expect(result.current.getCurrentScrollPosition()).toBe(688);
    });
  });

  // ============ VIEW CONFIGURATION ============

  describe('view configuration', () => {
    it('sets view type', async () => {
      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.setViewType('list');
      });

      // Verify view type affects behavior (list view preserves note on search)
      mockSearchParams = new URLSearchParams('?note=abc123');
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue([mockSearchParams]);

      await act(async () => {
        result.current.navigateToSearch('test');
      });

      expect(mockNavigate).toHaveBeenCalledWith('?note=abc123&q=test', { replace: true });
    });
  });

  // ============ STABLE REFERENCES ============

  describe('stable function references', () => {
    it('maintains stable references across re-renders', () => {
      const { result, rerender } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(),
      });

      const firstOpenNote = result.current.openNote;
      const firstCloseNote = result.current.closeNote;
      const firstNavigateToSearch = result.current.navigateToSearch;

      rerender();

      expect(result.current.openNote).toBe(firstOpenNote);
      expect(result.current.closeNote).toBe(firstCloseNote);
      expect(result.current.navigateToSearch).toBe(firstNavigateToSearch);
    });
  });

  // ============ ERROR HANDLING ============

  describe('error handling', () => {
    it('continues on save failure', async () => {
      const failingSave = vi.fn().mockRejectedValue(new Error('Save failed'));
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockSearchParams = new URLSearchParams('?note=abc123');
      (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue([mockSearchParams]);

      const { result } = renderHook(() => useNavigation(), {
        wrapper: createWrapper(failingSave),
      });

      await act(async () => {
        await result.current.openNote('xyz789', 'card');
      });

      // Should still navigate despite save failure
      expect(mockNavigate).toHaveBeenCalled();
      expect(mockOnFetchNote).toHaveBeenCalledWith('xyz789');

      consoleError.mockRestore();
    });
  });
});
