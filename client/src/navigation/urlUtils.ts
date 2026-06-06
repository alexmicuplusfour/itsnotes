/**
 * URL Utilities
 *
 * Pure functions for parsing and building navigation URLs.
 * All URL manipulation goes through these functions for consistency.
 */

import { NavigationState, NoteStackItem } from './types';

/**
 * Parse URL search params into NavigationState
 *
 * Handles formats:
 * - /?note=abc123
 * - /?note=abc123,def456
 * - /?note=abc123,def456&scroll=abc123:688,def456:0
 * - /?q=searchterm
 * - /?note=abc123&q=searchterm
 */
export function parseUrlToNavigationState(
  searchParams: URLSearchParams
): NavigationState {
  const noteParam = searchParams.get('note');
  const scrollParam = searchParams.get('scroll');
  const searchQuery = searchParams.get('q');

  // Parse note stack
  const noteStack = parseNoteStack(noteParam, scrollParam);

  // Compute derived properties
  const currentNoteId = noteStack.length > 0
    ? noteStack[noteStack.length - 1].id
    : null;
  const hasNoteOpen = noteStack.length > 0;
  const isSearchActive = searchQuery !== null && searchQuery.trim() !== '';

  return {
    noteStack,
    searchQuery,
    currentNoteId,
    hasNoteOpen,
    isSearchActive,
  };
}

/**
 * Build URL search params from NavigationState
 *
 * Returns a URLSearchParams object ready to be used with navigate()
 */
export function buildUrlFromNavigationState(
  state: NavigationState,
  preserveOtherParams?: URLSearchParams
): URLSearchParams {
  const params = new URLSearchParams(preserveOtherParams);

  // Add note param if we have notes in stack
  if (state.noteStack.length > 0) {
    params.set('note', buildNoteStackParam(state.noteStack));

    // Add scroll param if any notes have scroll positions
    const scrollParam = buildScrollParam(state.noteStack);
    if (scrollParam) {
      params.set('scroll', scrollParam);
    } else {
      params.delete('scroll');
    }
  } else {
    params.delete('note');
    params.delete('scroll');
  }

  // Add search param if active
  if (state.searchQuery) {
    params.set('q', state.searchQuery);
  } else {
    params.delete('q');
  }

  return params;
}

/**
 * Parse note stack from URL params
 *
 * noteParam: "abc123" or "abc123,def456"
 * scrollParam: "abc123:688,def456:0" or null
 */
function parseNoteStack(
  noteParam: string | null,
  scrollParam: string | null
): NoteStackItem[] {
  if (!noteParam) {
    return [];
  }

  // Split note IDs
  const noteIds = noteParam.split(',').filter(id => id.trim() !== '');

  // Parse scroll positions into a map
  const scrollPositions = parseScrollPositions(scrollParam);

  // Build stack items
  return noteIds.map(id => ({
    id: id.trim(),
    scrollPosition: scrollPositions.get(id.trim()) || 0,
  }));
}

/**
 * Parse scroll positions from URL param into a Map
 *
 * Input: "abc123:688,def456:0"
 * Output: Map { 'abc123' => 688, 'def456' => 0 }
 */
function parseScrollPositions(scrollParam: string | null): Map<string, number> {
  const positions = new Map<string, number>();

  if (!scrollParam) {
    return positions;
  }

  const pairs = scrollParam.split(',');
  pairs.forEach(pair => {
    const [id, pos] = pair.split(':');
    if (id && pos) {
      const position = parseInt(pos, 10);
      if (!isNaN(position)) {
        positions.set(id.trim(), position);
      }
    }
  });

  return positions;
}

/**
 * Build note stack param for URL
 *
 * Input: [{ id: 'abc123' }, { id: 'def456' }]
 * Output: "abc123,def456"
 */
function buildNoteStackParam(stack: NoteStackItem[]): string {
  return stack.map(item => item.id).join(',');
}

/**
 * Build scroll param for URL
 *
 * Input: [{ id: 'abc123', scrollPosition: 688 }, { id: 'def456', scrollPosition: 0 }]
 * Output: "abc123:688,def456:0" or null if no meaningful scroll positions
 */
function buildScrollParam(stack: NoteStackItem[]): string | null {
  // Filter out notes with no scroll (position 0)
  const notesWithScroll = stack.filter(item => item.scrollPosition > 0);

  if (notesWithScroll.length === 0) {
    return null;
  }

  return stack.map(item => `${item.id}:${item.scrollPosition}`).join(',');
}

/**
 * Update a specific note's scroll position in the URL
 *
 * This is used when the user scrolls - we update just the scroll param
 * without triggering a full navigation.
 */
export function updateScrollInUrl(
  currentParams: URLSearchParams,
  noteId: string,
  scrollPosition: number
): URLSearchParams {
  const state = parseUrlToNavigationState(currentParams);

  // Find the note in the stack and update its scroll position
  const updatedStack = state.noteStack.map(item =>
    item.id === noteId
      ? { ...item, scrollPosition }
      : item
  );

  return buildUrlFromNavigationState({
    ...state,
    noteStack: updatedStack,
  });
}

/**
 * Get scroll position for a specific note from URL
 */
export function getScrollPositionFromUrl(
  searchParams: URLSearchParams,
  noteId: string
): number {
  const scrollParam = searchParams.get('scroll');
  const positions = parseScrollPositions(scrollParam);
  return positions.get(noteId) || 0;
}

/**
 * Check if a note is already in the stack (for circular reference detection)
 */
export function isNoteInStack(
  searchParams: URLSearchParams,
  noteId: string
): boolean {
  const state = parseUrlToNavigationState(searchParams);
  return state.noteStack.some(item => item.id === noteId);
}

/**
 * Add a note to the stack (for reference navigation)
 *
 * Updates the current note's scroll position and adds the new note
 */
export function pushNoteToStack(
  currentParams: URLSearchParams,
  newNoteId: string,
  currentScrollPosition: number
): URLSearchParams {
  const state = parseUrlToNavigationState(currentParams);

  // Update scroll position of current note if there is one
  const updatedStack = state.currentNoteId
    ? state.noteStack.map(item =>
        item.id === state.currentNoteId
          ? { ...item, scrollPosition: currentScrollPosition }
          : item
      )
    : state.noteStack;

  // Add new note to stack
  const newStack = [...updatedStack, { id: newNoteId, scrollPosition: 0 }];

  return buildUrlFromNavigationState({
    ...state,
    noteStack: newStack,
  });
}

/**
 * Pop the last note from the stack (for closing a referenced note)
 *
 * Returns null if stack would be empty
 */
export function popNoteFromStack(
  currentParams: URLSearchParams
): URLSearchParams | null {
  const state = parseUrlToNavigationState(currentParams);

  if (state.noteStack.length === 0) {
    return null;
  }

  if (state.noteStack.length === 1) {
    // Last note - return params with note cleared
    return buildUrlFromNavigationState({
      ...state,
      noteStack: [],
    });
  }

  // Pop last note from stack
  const newStack = state.noteStack.slice(0, -1);

  return buildUrlFromNavigationState({
    ...state,
    noteStack: newStack,
  });
}

/**
 * Clear all notes from URL
 */
export function clearNotesFromUrl(
  currentParams: URLSearchParams
): URLSearchParams {
  const state = parseUrlToNavigationState(currentParams);

  return buildUrlFromNavigationState({
    ...state,
    noteStack: [],
  });
}

/**
 * Set search query in URL
 *
 * Can optionally preserve or clear notes based on view type
 */
export function setSearchInUrl(
  currentParams: URLSearchParams,
  searchQuery: string,
  preserveNotes: boolean = false
): URLSearchParams {
  const state = parseUrlToNavigationState(currentParams);

  return buildUrlFromNavigationState({
    ...state,
    noteStack: preserveNotes ? state.noteStack : [],
    searchQuery: searchQuery.trim() || null,
  });
}

/**
 * Clear search query from URL
 */
export function clearSearchFromUrl(
  currentParams: URLSearchParams
): URLSearchParams {
  const state = parseUrlToNavigationState(currentParams);

  return buildUrlFromNavigationState({
    ...state,
    searchQuery: null,
  });
}
