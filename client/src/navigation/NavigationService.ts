/**
 * NavigationService
 *
 * Centralized navigation service for the entire application.
 * All navigation actions go through this service.
 *
 * Philosophy:
 * - URL is the single source of truth
 * - No direct history manipulation outside this service
 * - View-specific behavior via configuration
 * - Validates all actions (circular refs, etc.)
 */

import {
  NavigationState,
  NavigationOptions,
  NavigationContext,
  CloseTrigger,
  ViewType,
} from './types';
import {
  parseUrlToNavigationState,
  buildUrlFromNavigationState,
  isNoteInStack,
  pushNoteToStack,
  clearNotesFromUrl,
  setSearchInUrl,
  clearSearchFromUrl,
  updateScrollInUrl,
  getScrollPositionFromUrl,
} from './urlUtils';
import { getViewConfig } from './viewConfigs';

type NavigateFunction = (
  url: string | { search: string },
  options?: { replace?: boolean }
) => void;

type StateChangeCallback = (state: NavigationState) => void;

export class NavigationService {
  private navigate: NavigateFunction;
  private getCurrentParams: () => URLSearchParams;
  private currentView: ViewType = 'grid';
  private subscribers: Set<StateChangeCallback> = new Set();
  private isFirstNoteInSession = true;
  private previousState?: NavigationState;

  // Callbacks for external actions
  private saveNoteCallback?: (noteId: string) => Promise<void>;
  private fetchNoteCallback?: (noteId: string) => Promise<void>;
  private closeNoteCallback?: () => Promise<void>;
  private searchCallback?: (query: string) => Promise<void>;
  private clearSearchCallback?: () => Promise<void>;
  private viewChangeCallback?: (view: 'main' | 'archive' | 'trash') => Promise<void>;

  constructor(
    navigate: NavigateFunction,
    getCurrentParams: () => URLSearchParams
  ) {
    this.navigate = navigate;
    this.getCurrentParams = getCurrentParams;
  }

  // ============ CONFIGURATION ============

  /**
   * Set the current view type (called when user switches views)
   */
  setViewType(viewType: ViewType): void {
    this.currentView = viewType;
  }

  /**
   * Set callback for saving notes
   */
  onSaveNote(callback: (noteId: string) => Promise<void>): void {
    this.saveNoteCallback = callback;
  }

  /**
   * Set callback for fetching notes
   */
  onFetchNote(callback: (noteId: string) => Promise<void>): void {
    this.fetchNoteCallback = callback;
  }

  /**
   * Set callback for closing notes
   */
  onCloseNote(callback: () => Promise<void>): void {
    this.closeNoteCallback = callback;
  }

  /**
   * Set callback for search
   */
  onSearch(callback: (query: string) => Promise<void>): void {
    this.searchCallback = callback;
  }

  /**
   * Set callback for clearing search
   */
  onClearSearch(callback: () => Promise<void>): void {
    this.clearSearchCallback = callback;
  }

  /**
   * Set callback for view changes (main/archive/trash)
   */
  onViewChange(callback: (view: 'main' | 'archive' | 'trash') => Promise<void>): void {
    this.viewChangeCallback = callback;
  }

  // ============ STATE ============

  /**
   * Get current navigation state
   */
  getState(): NavigationState {
    return parseUrlToNavigationState(this.getCurrentParams());
  }

  /**
   * Subscribe to state changes
   */
  subscribe(callback: StateChangeCallback): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Notify subscribers of state change
   */
  private notifySubscribers(): void {
    const state = this.getState();

    // Reset first note tracking when note is closed (for list view back button)
    // This ensures next note opened in list view pushes to history instead of replacing
    if (!state.hasNoteOpen && this.previousState?.hasNoteOpen) {
      console.log('[NavigationService] Note closed, resetting isFirstNoteInSession to true');
      this.isFirstNoteInSession = true;
    }

    // Track previous state for next notification
    this.previousState = state;

    this.subscribers.forEach(callback => callback(state));
  }

  // ============ OPEN NOTES ============

  /**
   * Open a note
   *
   * Handles all note opening scenarios:
   * - From card: Replaces any open note
   * - From reference: Pushes to stack
   * - From starred tab: Replaces any open note
   * - From list: Follows view config
   */
  async openNote(
    noteId: string,
    context: NavigationContext,
    options: NavigationOptions = {}
  ): Promise<void> {
    const {
      replaceHistory = false,
      autoSave = true,
      preventCircular = true,
      scrollPosition,
    } = options;

    const currentState = this.getState();
    const config = getViewConfig(this.currentView);

    // Save current note if needed
    if (autoSave && currentState.currentNoteId) {
      await this.saveCurrentNote();
    }

    // Handle reference navigation separately (uses stack)
    if (context === 'reference') {
      // This is handled by openReferencedNote()
      throw new Error('Use openReferencedNote() for reference navigation');
    }

    // For all other contexts, replace the current note
    const newParams = new URLSearchParams(this.getCurrentParams());
    newParams.set('note', noteId);

    // Handle scroll position
    if (scrollPosition !== undefined && scrollPosition > 0) {
      // Restore specific scroll position (e.g., from starred tabs)
      newParams.set('scroll', `${noteId}:${scrollPosition}`);
      console.log(`[NavigationService] Opening note with scroll position: ${scrollPosition}`);
    } else {
      // Reset scroll for new note (start at top)
      newParams.delete('scroll');
    }

    // Determine if we should replace history
    let shouldReplace = replaceHistory;

    // List view uses replace-after-first strategy
    if (
      this.currentView === 'list' &&
      config.historyStrategy === 'replace-after-first'
    ) {
      console.log('[NavigationService] List view - isFirstNoteInSession:', this.isFirstNoteInSession);
      shouldReplace = !this.isFirstNoteInSession;
      this.isFirstNoteInSession = false;
      console.log('[NavigationService] shouldReplace:', shouldReplace);
    }

    // Navigate
    this.navigate(
      { search: newParams.toString() },
      { replace: shouldReplace }
    );

    // Fetch note if callback provided
    if (this.fetchNoteCallback) {
      await this.fetchNoteCallback(noteId);
    }

    this.notifySubscribers();
  }

  /**
   * Open a note from a reference link (within another note)
   *
   * This pushes to the note stack and saves scroll position
   */
  async openReferencedNote(
    noteId: string,
    currentScrollPosition: number,
    options: NavigationOptions = {}
  ): Promise<void> {
    const { preventCircular = true, autoSave = true } = options;

    const currentParams = this.getCurrentParams();

    // Check for circular reference
    if (preventCircular && isNoteInStack(currentParams, noteId)) {
      console.warn(`[NavigationService] Circular reference detected: ${noteId} already in stack`);

      // Option: Could navigate to that note in the stack instead
      // For now, just prevent the duplicate
      return;
    }

    // Save current note if needed
    const currentState = this.getState();
    if (autoSave && currentState.currentNoteId) {
      await this.saveCurrentNote();
    }

    // CRITICAL: Update current history entry with scroll position BEFORE pushing new entry
    // This ensures that when we use back button, it has the correct scroll position
    const currentNoteWithScroll = updateScrollInUrl(
      currentParams,
      currentState.currentNoteId || '',
      currentScrollPosition
    );

    console.log('[NavigationService] Updating current history entry with scroll position:', currentScrollPosition);
    this.navigate({ search: currentNoteWithScroll.toString() }, { replace: true });

    // Small delay to ensure the replace completes before pushing
    await new Promise(resolve => setTimeout(resolve, 0));

    // Now push note to stack with current scroll position
    const newParams = pushNoteToStack(
      currentNoteWithScroll,
      noteId,
      currentScrollPosition
    );

    // Push to history for reference navigation
    console.log('[NavigationService] Pushing new note to stack');
    this.navigate({ search: newParams.toString() }, { replace: false });

    // Fetch note if callback provided
    if (this.fetchNoteCallback) {
      await this.fetchNoteCallback(noteId);
    }

    this.notifySubscribers();
  }

  // ============ CLOSE NOTES ============

  /**
   * Close the current note
   *
   * Handles:
   * - Single note: Clears note entirely
   * - Note stack: Pops last note and restores previous
   */
  async closeNote(
    trigger: CloseTrigger,
    options: NavigationOptions = {}
  ): Promise<void> {
    const { autoSave = true } = options;

    const currentState = this.getState();

    // Nothing to close
    if (!currentState.hasNoteOpen) {
      return;
    }

    // Save current note if needed - MUST capture noteId before any URL changes
    const noteIdToSave = currentState.currentNoteId;
    if (autoSave && noteIdToSave && this.saveNoteCallback) {
      console.log('[NavigationService] Saving note before close:', noteIdToSave);
      try {
        await this.saveNoteCallback(noteIdToSave);
      } catch (error) {
        console.error('[NavigationService] Failed to save note on close:', error);
      }
    }

    // If stack has multiple notes, go back in history
    // The previous history entry now has the correct scroll position (set in openReferencedNote)
    if (currentState.noteStack.length > 1) {
      console.log('[NavigationService] Closing stacked note, going back in history');

      // Use browser back - the history entry was updated with scroll position when we opened the reference
      window.history.back();

      // Call close callback to update NotesContext
      if (this.closeNoteCallback) {
        await this.closeNoteCallback();
      }

      this.notifySubscribers();
      return;
    }

    // Single note - need to determine the best way to close based on context
    const currentParams = this.getCurrentParams();
    const hasSearchActive = currentState.isSearchActive;

    // If search is active (e.g., in list view), clear the note but preserve search
    // This handles: /?q=search&note=abc → /?q=search
    if (hasSearchActive) {
      console.log('[NavigationService] Closing note with active search, clearing note from URL');
      const newParams = clearNotesFromUrl(currentParams);
      // Use replace to avoid adding another history entry
      this.navigate({ search: newParams.toString() }, { replace: true });
    } else {
      // No search active - use browser back to properly remove the note entry from history
      // This avoids accumulating ghost history entries when opening/closing multiple notes
      console.log('[NavigationService] Closing single note, going back in history');
      window.history.back();
    }

    // Reset first note tracking for list view
    // When user closes a note and returns to list view, the next note they open
    // should be treated as the first note in this session (push to history, not replace)
    this.isFirstNoteInSession = true;

    // Call close callback to update NotesContext
    if (this.closeNoteCallback) {
      await this.closeNoteCallback();
    }

    this.notifySubscribers();
  }

  /**
   * Close all notes (used by clicking outside in grid view)
   */
  async closeAllNotes(options: NavigationOptions = {}): Promise<void> {
    const { autoSave = true } = options;

    const currentState = this.getState();

    if (!currentState.hasNoteOpen) {
      return;
    }

    // Save current note if needed - MUST capture noteId before any URL changes
    const noteIdToSave = currentState.currentNoteId;
    if (autoSave && noteIdToSave && this.saveNoteCallback) {
      console.log('[NavigationService] Saving note before closeAll:', noteIdToSave);
      try {
        await this.saveNoteCallback(noteIdToSave);
      } catch (error) {
        console.error('[NavigationService] Failed to save note on closeAll:', error);
      }
    }

    // Determine the best way to close based on context
    const currentParams = this.getCurrentParams();
    const hasSearchActive = currentState.isSearchActive;

    // If search is active (e.g., in list view), clear the note but preserve search
    // This handles: /?q=search&note=abc → /?q=search
    if (hasSearchActive) {
      console.log('[NavigationService] Closing all notes with active search, clearing notes from URL');
      const newParams = clearNotesFromUrl(currentParams);
      // Use replace to avoid adding another history entry
      this.navigate({ search: newParams.toString() }, { replace: true });
    } else {
      // No search active - use browser back to properly remove the note entry from history
      // This avoids accumulating ghost history entries when clicking outside multiple times
      console.log('[NavigationService] Closing all notes, going back in history');
      window.history.back();
    }

    // Call close callback to update NotesContext
    if (this.closeNoteCallback) {
      await this.closeNoteCallback();
    }

    this.notifySubscribers();
  }

  // ============ SEARCH ============

  /**
   * Navigate to search
   *
   * View-specific behavior:
   * - Grid/stacked: Closes note
   * - List: Preserves note
   */
  navigateToSearch(query: string, options: NavigationOptions = {}): void {
    const config = getViewConfig(this.currentView);
    const preserveNote = options.preserveNoteOnSearch ?? config.preserveNoteOnSearch;
    const replaceHistory = options.replaceHistory ?? true; // Default to replace for backward compatibility

    console.log('[NavigationService.navigateToSearch] currentView:', this.currentView, 'preserveNote:', preserveNote, 'query:', query);

    const currentParams = this.getCurrentParams();
    const newParams = setSearchInUrl(currentParams, query, preserveNote);

    console.log('[NavigationService.navigateToSearch] New URL params:', newParams.toString());

    this.navigate({ search: newParams.toString() }, { replace: replaceHistory });
    this.notifySubscribers();
  }

  /**
   * Clear search
   */
  clearSearch(): void {
    const currentParams = this.getCurrentParams();
    const newParams = clearSearchFromUrl(currentParams);

    this.navigate({ search: newParams.toString() }, { replace: true });
    this.notifySubscribers();
  }

  // ============ SCROLL ============

  /**
   * Update scroll position for current note
   *
   * This updates the URL without triggering navigation
   * Uses replace to avoid adding to history stack
   */
  updateScrollPosition(position: number): void {
    const currentState = this.getState();

    if (!currentState.currentNoteId) {
      return;
    }

    const currentParams = this.getCurrentParams();
    const newParams = updateScrollInUrl(
      currentParams,
      currentState.currentNoteId,
      position
    );

    // Use navigate with replace to update URL without adding to history
    this.navigate({ search: newParams.toString() }, { replace: true });
  }

  /**
   * Get scroll position for a specific note
   */
  getScrollPosition(noteId: string): number {
    return getScrollPositionFromUrl(this.getCurrentParams(), noteId);
  }

  /**
   * Get scroll position for current note
   */
  getCurrentScrollPosition(): number {
    const state = this.getState();
    if (!state.currentNoteId) {
      return 0;
    }
    return this.getScrollPosition(state.currentNoteId);
  }

  // ============ HISTORY ============

  /**
   * Handle browser back button
   *
   * This is called when URL changes but not from our navigate() calls
   */
  async handleBrowserBack(): Promise<void> {
    // The URL has already changed - we just need to react to it
    // Auto-save is handled by the component watching the URL change
    this.notifySubscribers();
  }

  /**
   * Handle browser forward button
   */
  async handleBrowserForward(): Promise<void> {
    // Same as back - URL already changed
    this.notifySubscribers();
  }

  // ============ VIEW NAVIGATION ============

  /**
   * Change view (main/archive/trash)
   * Clears notes and search from URL and navigates to new path
   */
  changeView(view: 'main' | 'archive' | 'trash'): void {
    const paths = {
      main: '/',
      archive: '/archive',
      trash: '/trash',
    };

    const targetPath = paths[view];
    console.log(`[NavigationService] Changing view to: ${view} (${targetPath})`);

    // Clear search and notes from URL - start fresh for new view
    this.navigate(targetPath, { replace: false });
    this.notifySubscribers();

    // Trigger view change callback to notify NotesContext
    if (this.viewChangeCallback) {
      console.log(`[NavigationService] Triggering viewChangeCallback for: ${view}`);
      this.viewChangeCallback(view);
    }
  }

  // ============ SPECIALIZED SEARCH METHODS ============

  /**
   * Search by note ID (formats as !noteId)
   */
  searchById(noteId: string, options: NavigationOptions = {}): void {
    console.log(`[NavigationService] Searching by ID: !${noteId}`);
    this.navigateToSearch(`!${noteId}`, options);
  }

  /**
   * Search by tag (formats as #tagName)
   */
  searchByTag(tagName: string, options: NavigationOptions = {}): void {
    console.log(`[NavigationService] Searching by tag: #${tagName}`);
    this.navigateToSearch(`#${tagName}`, options);
  }

  /**
   * Search by color (formats as $colorName)
   */
  searchByColor(colorName: string, options: NavigationOptions = {}): void {
    console.log(`[NavigationService] Searching by color: $${colorName}`);
    this.navigateToSearch(`$${colorName}`, options);
  }

  /**
   * Search by book (formats as {bookTitle})
   */
  searchByBook(bookTitle: string, options: NavigationOptions = {}): void {
    console.log(`[NavigationService] Searching by book: {${bookTitle}}`);
    this.navigateToSearch(`{${bookTitle}}`, options);
  }

  // ============ PRIVATE HELPERS ============

  /**
   * Save the current note
   */
  private async saveCurrentNote(): Promise<void> {
    const state = this.getState();
    if (!state.currentNoteId || !this.saveNoteCallback) {
      return;
    }

    try {
      await this.saveNoteCallback(state.currentNoteId);
    } catch (error) {
      console.error('[NavigationService] Failed to save note:', error);
      // Don't block navigation on save failure
    }
  }

  /**
   * Reset session state (for testing)
   */
  resetSession(): void {
    this.isFirstNoteInSession = true;
  }
}
