/**
 * URL Utilities Tests
 *
 * Comprehensive tests for URL parsing and building functions.
 * Tests cover all scenarios from the navigation logs.
 */

import { describe, it, expect } from 'vitest';
import {
  parseUrlToNavigationState,
  buildUrlFromNavigationState,
  updateScrollInUrl,
  getScrollPositionFromUrl,
  isNoteInStack,
  pushNoteToStack,
  popNoteFromStack,
  clearNotesFromUrl,
  setSearchInUrl,
  clearSearchFromUrl,
} from '../urlUtils';
import { NavigationState } from '../types';

describe('urlUtils', () => {
  describe('parseUrlToNavigationState', () => {
    it('parses empty URL', () => {
      const params = new URLSearchParams('');
      const state = parseUrlToNavigationState(params);

      expect(state).toEqual({
        noteStack: [],
        searchQuery: null,
        currentNoteId: null,
        hasNoteOpen: false,
        isSearchActive: false,
      });
    });

    it('parses single note URL', () => {
      const params = new URLSearchParams('?note=abc123');
      const state = parseUrlToNavigationState(params);

      expect(state).toEqual({
        noteStack: [{ id: 'abc123', scrollPosition: 0 }],
        searchQuery: null,
        currentNoteId: 'abc123',
        hasNoteOpen: true,
        isSearchActive: false,
      });
    });

    it('parses note stack URL (Scenario 7)', () => {
      const params = new URLSearchParams(
        '?note=d3008ec2-53e2-497b-ab45-33f9d14e1a00,23cf356d-c598-4d52-bbfb-bb8b47332643'
      );
      const state = parseUrlToNavigationState(params);

      expect(state.noteStack).toEqual([
        { id: 'd3008ec2-53e2-497b-ab45-33f9d14e1a00', scrollPosition: 0 },
        { id: '23cf356d-c598-4d52-bbfb-bb8b47332643', scrollPosition: 0 },
      ]);
      expect(state.currentNoteId).toBe('23cf356d-c598-4d52-bbfb-bb8b47332643');
      expect(state.hasNoteOpen).toBe(true);
    });

    it('parses note with scroll position (Scenario 64)', () => {
      const params = new URLSearchParams(
        '?note=097fd291-7f28-4d2c-aff0-67d26e489425&scroll=097fd291-7f28-4d2c-aff0-67d26e489425:688'
      );
      const state = parseUrlToNavigationState(params);

      expect(state.noteStack).toEqual([
        { id: '097fd291-7f28-4d2c-aff0-67d26e489425', scrollPosition: 688 },
      ]);
    });

    it('parses note stack with scroll positions', () => {
      const params = new URLSearchParams(
        '?note=abc123,def456&scroll=abc123:688,def456:150'
      );
      const state = parseUrlToNavigationState(params);

      expect(state.noteStack).toEqual([
        { id: 'abc123', scrollPosition: 688 },
        { id: 'def456', scrollPosition: 150 },
      ]);
    });

    it('parses search query', () => {
      const params = new URLSearchParams('?q=test%20search');
      const state = parseUrlToNavigationState(params);

      expect(state.searchQuery).toBe('test search');
      expect(state.isSearchActive).toBe(true);
    });

    it('parses note with search query (Scenario 28 - List view)', () => {
      const params = new URLSearchParams(
        '?q=%23attachment&note=d3008ec2-53e2-497b-ab45-33f9d14e1a00'
      );
      const state = parseUrlToNavigationState(params);

      expect(state.searchQuery).toBe('#attachment');
      expect(state.currentNoteId).toBe('d3008ec2-53e2-497b-ab45-33f9d14e1a00');
      expect(state.hasNoteOpen).toBe(true);
      expect(state.isSearchActive).toBe(true);
    });

    it('handles partial scroll positions (some notes have scroll, others don\'t)', () => {
      const params = new URLSearchParams(
        '?note=abc123,def456,ghi789&scroll=abc123:688,ghi789:250'
      );
      const state = parseUrlToNavigationState(params);

      expect(state.noteStack).toEqual([
        { id: 'abc123', scrollPosition: 688 },
        { id: 'def456', scrollPosition: 0 },   // No scroll position
        { id: 'ghi789', scrollPosition: 250 },
      ]);
    });

    it('handles malformed scroll parameter gracefully', () => {
      const params = new URLSearchParams('?note=abc123&scroll=invalid');
      const state = parseUrlToNavigationState(params);

      expect(state.noteStack).toEqual([
        { id: 'abc123', scrollPosition: 0 },
      ]);
    });

    it('handles empty search query as inactive', () => {
      const params = new URLSearchParams('?q=');
      const state = parseUrlToNavigationState(params);

      expect(state.searchQuery).toBe('');
      expect(state.isSearchActive).toBe(false);
    });

    it('handles whitespace-only search query as inactive', () => {
      const params = new URLSearchParams('?q=%20%20');
      const state = parseUrlToNavigationState(params);

      expect(state.searchQuery).toBe('  ');
      expect(state.isSearchActive).toBe(false);
    });

    it('handles deep note stack (Scenario 9: A→B→C)', () => {
      const params = new URLSearchParams(
        '?note=d3008ec2-53e2-497b-ab45-33f9d14e1a00,23cf356d-c598-4d52-bbfb-bb8b47332643,325165aa-74d2-456c-8253-a5cfc0ec4b1b'
      );
      const state = parseUrlToNavigationState(params);

      expect(state.noteStack.length).toBe(3);
      expect(state.currentNoteId).toBe('325165aa-74d2-456c-8253-a5cfc0ec4b1b');
    });
  });

  describe('buildUrlFromNavigationState', () => {
    it('builds URL with single note', () => {
      const state: NavigationState = {
        noteStack: [{ id: 'abc123', scrollPosition: 0 }],
        searchQuery: null,
        currentNoteId: 'abc123',
        hasNoteOpen: true,
        isSearchActive: false,
      };

      const params = buildUrlFromNavigationState(state);

      expect(params.get('note')).toBe('abc123');
      expect(params.get('scroll')).toBeNull();
      expect(params.get('q')).toBeNull();
    });

    it('builds URL with note stack', () => {
      const state: NavigationState = {
        noteStack: [
          { id: 'abc123', scrollPosition: 0 },
          { id: 'def456', scrollPosition: 0 },
        ],
        searchQuery: null,
        currentNoteId: 'def456',
        hasNoteOpen: true,
        isSearchActive: false,
      };

      const params = buildUrlFromNavigationState(state);

      expect(params.get('note')).toBe('abc123,def456');
      expect(params.get('scroll')).toBeNull(); // All positions are 0
    });

    it('builds URL with scroll positions', () => {
      const state: NavigationState = {
        noteStack: [
          { id: 'abc123', scrollPosition: 688 },
          { id: 'def456', scrollPosition: 150 },
        ],
        searchQuery: null,
        currentNoteId: 'def456',
        hasNoteOpen: true,
        isSearchActive: false,
      };

      const params = buildUrlFromNavigationState(state);

      expect(params.get('note')).toBe('abc123,def456');
      expect(params.get('scroll')).toBe('abc123:688,def456:150');
    });

    it('builds URL with search query', () => {
      const state: NavigationState = {
        noteStack: [],
        searchQuery: 'test search',
        currentNoteId: null,
        hasNoteOpen: false,
        isSearchActive: true,
      };

      const params = buildUrlFromNavigationState(state);

      expect(params.get('q')).toBe('test search');
      expect(params.get('note')).toBeNull();
    });

    it('builds URL with note and search (List view)', () => {
      const state: NavigationState = {
        noteStack: [{ id: 'abc123', scrollPosition: 0 }],
        searchQuery: '#tag',
        currentNoteId: 'abc123',
        hasNoteOpen: true,
        isSearchActive: true,
      };

      const params = buildUrlFromNavigationState(state);

      expect(params.get('note')).toBe('abc123');
      expect(params.get('q')).toBe('#tag');
    });

    it('builds empty URL when no state', () => {
      const state: NavigationState = {
        noteStack: [],
        searchQuery: null,
        currentNoteId: null,
        hasNoteOpen: false,
        isSearchActive: false,
      };

      const params = buildUrlFromNavigationState(state);

      expect(params.toString()).toBe('');
    });

    it('preserves other URL params', () => {
      const existing = new URLSearchParams('?other=value&another=param');
      const state: NavigationState = {
        noteStack: [{ id: 'abc123', scrollPosition: 0 }],
        searchQuery: null,
        currentNoteId: 'abc123',
        hasNoteOpen: true,
        isSearchActive: false,
      };

      const params = buildUrlFromNavigationState(state, existing);

      expect(params.get('note')).toBe('abc123');
      expect(params.get('other')).toBe('value');
      expect(params.get('another')).toBe('param');
    });

    it('omits scroll param when all positions are 0', () => {
      const state: NavigationState = {
        noteStack: [
          { id: 'abc123', scrollPosition: 0 },
          { id: 'def456', scrollPosition: 0 },
        ],
        searchQuery: null,
        currentNoteId: 'def456',
        hasNoteOpen: true,
        isSearchActive: false,
      };

      const params = buildUrlFromNavigationState(state);

      expect(params.get('scroll')).toBeNull();
    });

    it('includes scroll param when at least one note has scroll position', () => {
      const state: NavigationState = {
        noteStack: [
          { id: 'abc123', scrollPosition: 688 },
          { id: 'def456', scrollPosition: 0 },
        ],
        searchQuery: null,
        currentNoteId: 'def456',
        hasNoteOpen: true,
        isSearchActive: false,
      };

      const params = buildUrlFromNavigationState(state);

      expect(params.get('scroll')).toBe('abc123:688,def456:0');
    });
  });

  describe('updateScrollInUrl', () => {
    it('updates scroll position for current note', () => {
      const current = new URLSearchParams('?note=abc123');
      const updated = updateScrollInUrl(current, 'abc123', 688);

      expect(updated.get('note')).toBe('abc123');
      expect(updated.get('scroll')).toBe('abc123:688');
    });

    it('updates scroll position in note stack', () => {
      const current = new URLSearchParams('?note=abc123,def456');
      const updated = updateScrollInUrl(current, 'abc123', 688);

      expect(updated.get('scroll')).toBe('abc123:688,def456:0');
    });

    it('updates scroll position for second note in stack', () => {
      const current = new URLSearchParams('?note=abc123,def456&scroll=abc123:688,def456:0');
      const updated = updateScrollInUrl(current, 'def456', 250);

      expect(updated.get('scroll')).toBe('abc123:688,def456:250');
    });

    it('preserves other params', () => {
      const current = new URLSearchParams('?note=abc123&q=search');
      const updated = updateScrollInUrl(current, 'abc123', 688);

      expect(updated.get('q')).toBe('search');
    });
  });

  describe('getScrollPositionFromUrl', () => {
    it('returns scroll position for note', () => {
      const params = new URLSearchParams('?note=abc123&scroll=abc123:688');
      const position = getScrollPositionFromUrl(params, 'abc123');

      expect(position).toBe(688);
    });

    it('returns 0 for note without scroll position', () => {
      const params = new URLSearchParams('?note=abc123');
      const position = getScrollPositionFromUrl(params, 'abc123');

      expect(position).toBe(0);
    });

    it('returns 0 for note not in URL', () => {
      const params = new URLSearchParams('?note=abc123');
      const position = getScrollPositionFromUrl(params, 'xyz789');

      expect(position).toBe(0);
    });

    it('returns correct position from note stack', () => {
      const params = new URLSearchParams('?note=abc123,def456&scroll=abc123:688,def456:250');

      expect(getScrollPositionFromUrl(params, 'abc123')).toBe(688);
      expect(getScrollPositionFromUrl(params, 'def456')).toBe(250);
    });
  });

  describe('isNoteInStack', () => {
    it('returns true when note is in stack', () => {
      const params = new URLSearchParams('?note=abc123');

      expect(isNoteInStack(params, 'abc123')).toBe(true);
    });

    it('returns false when note is not in stack', () => {
      const params = new URLSearchParams('?note=abc123');

      expect(isNoteInStack(params, 'def456')).toBe(false);
    });

    it('returns false when no note is open', () => {
      const params = new URLSearchParams('');

      expect(isNoteInStack(params, 'abc123')).toBe(false);
    });

    it('detects note in multi-item stack (Scenario 45 - circular ref detection)', () => {
      const params = new URLSearchParams('?note=abc123,def456');

      expect(isNoteInStack(params, 'abc123')).toBe(true);
      expect(isNoteInStack(params, 'def456')).toBe(true);
      expect(isNoteInStack(params, 'ghi789')).toBe(false);
    });
  });

  describe('pushNoteToStack', () => {
    it('adds note to empty stack', () => {
      const current = new URLSearchParams('');
      const updated = pushNoteToStack(current, 'abc123', 0);

      expect(updated.get('note')).toBe('abc123');
    });

    it('adds note to existing stack and saves scroll position', () => {
      const current = new URLSearchParams('?note=abc123');
      const updated = pushNoteToStack(current, 'def456', 688);

      expect(updated.get('note')).toBe('abc123,def456');
      expect(updated.get('scroll')).toBe('abc123:688,def456:0');
    });

    it('handles deep stack (Scenario 9)', () => {
      const current = new URLSearchParams('?note=abc123,def456&scroll=abc123:100,def456:0');
      const updated = pushNoteToStack(current, 'ghi789', 250);

      expect(updated.get('note')).toBe('abc123,def456,ghi789');
      expect(updated.get('scroll')).toBe('abc123:100,def456:250,ghi789:0');
    });

    it('preserves search query when pushing note', () => {
      const current = new URLSearchParams('?q=search');
      const updated = pushNoteToStack(current, 'abc123', 0);

      expect(updated.get('note')).toBe('abc123');
      expect(updated.get('q')).toBe('search');
    });
  });

  describe('popNoteFromStack', () => {
    it('returns null for empty stack', () => {
      const current = new URLSearchParams('');
      const updated = popNoteFromStack(current);

      expect(updated).toBeNull();
    });

    it('clears note param when popping last note', () => {
      const current = new URLSearchParams('?note=abc123');
      const updated = popNoteFromStack(current);

      expect(updated).not.toBeNull();
      expect(updated!.get('note')).toBeNull();
      expect(updated!.get('scroll')).toBeNull();
    });

    it('pops last note from stack (Scenario 8)', () => {
      const current = new URLSearchParams('?note=abc123,def456');
      const updated = popNoteFromStack(current);

      expect(updated).not.toBeNull();
      expect(updated!.get('note')).toBe('abc123');
    });

    it('restores scroll position when popping (Scenario 65)', () => {
      const current = new URLSearchParams('?note=abc123,def456&scroll=abc123:688,def456:0');
      const updated = popNoteFromStack(current);

      expect(updated).not.toBeNull();
      expect(updated!.get('note')).toBe('abc123');
      expect(updated!.get('scroll')).toBe('abc123:688');
    });

    it('handles deep stack pop (Scenario 10)', () => {
      const current = new URLSearchParams('?note=abc123,def456,ghi789');
      const updated = popNoteFromStack(current);

      expect(updated).not.toBeNull();
      expect(updated!.get('note')).toBe('abc123,def456');
    });

    it('preserves search query when popping', () => {
      const current = new URLSearchParams('?note=abc123,def456&q=search');
      const updated = popNoteFromStack(current);

      expect(updated).not.toBeNull();
      expect(updated!.get('q')).toBe('search');
    });
  });

  describe('clearNotesFromUrl', () => {
    it('clears single note', () => {
      const current = new URLSearchParams('?note=abc123');
      const updated = clearNotesFromUrl(current);

      expect(updated.get('note')).toBeNull();
      expect(updated.get('scroll')).toBeNull();
    });

    it('clears note stack', () => {
      const current = new URLSearchParams('?note=abc123,def456&scroll=abc123:688,def456:0');
      const updated = clearNotesFromUrl(current);

      expect(updated.get('note')).toBeNull();
      expect(updated.get('scroll')).toBeNull();
    });

    it('preserves search query', () => {
      const current = new URLSearchParams('?note=abc123&q=search');
      const updated = clearNotesFromUrl(current);

      expect(updated.get('note')).toBeNull();
      expect(updated.get('q')).toBe('search');
    });
  });

  describe('setSearchInUrl', () => {
    it('sets search query and clears notes by default', () => {
      const current = new URLSearchParams('?note=abc123');
      const updated = setSearchInUrl(current, 'test search');

      expect(updated.get('q')).toBe('test search');
      expect(updated.get('note')).toBeNull();
    });

    it('sets search query and preserves notes when specified (List view)', () => {
      const current = new URLSearchParams('?note=abc123');
      const updated = setSearchInUrl(current, '#tag', true);

      expect(updated.get('q')).toBe('#tag');
      expect(updated.get('note')).toBe('abc123');
    });

    it('trims whitespace from search query', () => {
      const current = new URLSearchParams('');
      const updated = setSearchInUrl(current, '  test  ');

      expect(updated.get('q')).toBe('test');
    });

    it('treats empty string as null', () => {
      const current = new URLSearchParams('');
      const updated = setSearchInUrl(current, '');

      expect(updated.get('q')).toBeNull();
    });

    it('preserves scroll position when preserving notes', () => {
      const current = new URLSearchParams('?note=abc123&scroll=abc123:688');
      const updated = setSearchInUrl(current, '#tag', true);

      expect(updated.get('scroll')).toBe('abc123:688');
    });
  });

  describe('clearSearchFromUrl', () => {
    it('clears search query', () => {
      const current = new URLSearchParams('?q=search');
      const updated = clearSearchFromUrl(current);

      expect(updated.get('q')).toBeNull();
    });

    it('preserves notes when clearing search', () => {
      const current = new URLSearchParams('?note=abc123&q=search');
      const updated = clearSearchFromUrl(current);

      expect(updated.get('note')).toBe('abc123');
      expect(updated.get('q')).toBeNull();
    });

    it('preserves scroll positions', () => {
      const current = new URLSearchParams('?note=abc123&scroll=abc123:688&q=search');
      const updated = clearSearchFromUrl(current);

      expect(updated.get('scroll')).toBe('abc123:688');
      expect(updated.get('q')).toBeNull();
    });
  });

  describe('round-trip consistency', () => {
    it('parse → build → parse produces same state', () => {
      const original = new URLSearchParams(
        '?note=abc123,def456&scroll=abc123:688,def456:150&q=search'
      );

      const state1 = parseUrlToNavigationState(original);
      const rebuilt = buildUrlFromNavigationState(state1);
      const state2 = parseUrlToNavigationState(rebuilt);

      expect(state2).toEqual(state1);
    });

    it('handles all scenarios from logs', () => {
      const scenarios = [
        '?note=d3008ec2-53e2-497b-ab45-33f9d14e1a00',
        '?note=d3008ec2-53e2-497b-ab45-33f9d14e1a00,23cf356d-c598-4d52-bbfb-bb8b47332643',
        '?note=097fd291-7f28-4d2c-aff0-67d26e489425&scroll=097fd291-7f28-4d2c-aff0-67d26e489425:688',
        '?q=%23attachment&note=d3008ec2-53e2-497b-ab45-33f9d14e1a00',
        '?q=%23tagname',
      ];

      scenarios.forEach(scenario => {
        const original = new URLSearchParams(scenario);
        const state = parseUrlToNavigationState(original);
        const rebuilt = buildUrlFromNavigationState(state);
        const stateCopy = parseUrlToNavigationState(rebuilt);

        expect(stateCopy).toEqual(state);
      });
    });
  });
});
