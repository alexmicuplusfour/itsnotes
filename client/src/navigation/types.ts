/**
 * Navigation System Types
 *
 * Core data structures for the centralized navigation system.
 */

export interface NoteStackItem {
  id: string;
  scrollPosition: number;  // Pixel position
}

export interface NavigationState {
  noteStack: NoteStackItem[];
  searchQuery: string | null;

  // Derived properties (computed from noteStack)
  currentNoteId: string | null;  // Last item in stack
  hasNoteOpen: boolean;
  isSearchActive: boolean;
}

export interface NavigationOptions {
  // History behavior
  replaceHistory?: boolean;  // Default: false

  // Save behavior
  autoSave?: boolean;  // Default: true

  // Validation
  preventCircular?: boolean;  // Default: true

  // Scroll position (for restoring scroll when opening from starred tabs, etc.)
  scrollPosition?: number;  // Default: undefined (start at top)
}

export type NavigationContext =
  | 'card'           // Clicked from note card in grid/stacked view
  | 'reference'      // Clicked note reference link within another note
  | 'starred-tab'    // Clicked starred tab at top
  | 'list-item'      // Clicked from list view sidebar
  | 'direct-url';    // Direct URL navigation

export type CloseTrigger =
  | 'close-button'
  | 'click-outside'
  | 'back-button'
  | 'escape-key';

export type ViewType = 'grid' | 'stacked' | 'list';

export interface ViewConfig {
  preserveNoteOnSearch: boolean;
  closeNoteOnOutsideClick: boolean;
  historyStrategy: 'push' | 'replace-after-first';
}
