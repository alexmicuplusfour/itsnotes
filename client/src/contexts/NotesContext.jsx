import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom'; // Temporary - for functions not yet migrated to NavigationService
import { isEqual } from 'lodash-es'; // Or use another deep comparison
import styled from 'styled-components';
import api, { notesApi, tagsApi } from '../services/api';
import socketService from '../services/socket';
import { useTags } from './TagsContext'; // Import useTags
import { useUIPreferences } from './UIPreferencesContext'; // Import useUIPreferences
import { useSorting, SORT_OPTIONS } from './SortingContext'; // Import unified sorting
import SuccessToast from '../components/SuccessToast'; // Import centralized SuccessToast component
import { updateNoteInCache } from '../components/TiptapNoteReferenceCard'; // Import cache update function 
import { useAutoTagging, AUTO_TAG_FEATURES } from './AutoTaggingContext'; // Import auto-tagging context
import { useSettings } from './SettingsContext';
import { usePrefetch } from '../hooks/usePrefetch'; // Import prefetch hook
import { useNavigationContext } from '../navigation/NavigationContext'; // Import navigation context

// --- Context Definition ---
const NotesContext = createContext();
export const useNotes = () => useContext(NotesContext);

// Loading state lives in its own context so that list/search loading toggles
// don't invalidate the main data context and re-render every note consumer.
const NotesLoadingContext = createContext({ listLoading: false });
export const useNotesLoading = () => useContext(NotesLoadingContext);

// --- Helper Hook for Stable Array Results ---
const useStableArrayResult = (factory, deps) => {
  const previousResultRef = useRef(null);
  const previousDepsRef = useRef(deps);

  let result = previousResultRef.current;

  // Check if dependencies have changed shallowly first
  // Ensure previousDepsRef.current exists before accessing length
  const depsChanged = !previousDepsRef.current || deps.length !== previousDepsRef.current.length || deps.some((dep, i) => !Object.is(dep, previousDepsRef.current[i]));

  if (depsChanged || result === null) {
    // Dependencies changed or first run, calculate new result
    const newResult = factory();
    // Only update if the new result is actually different from the previous one
    if (result === null || !isEqual(newResult, result)) {
      // console.log("useStableArrayResult: Result changed, returning new reference.");
      result = newResult;
    } else {
      // console.log("useStableArrayResult: Result content is the same, returning previous reference.");
    }
    previousResultRef.current = result;
    previousDepsRef.current = deps;
  } else {
    // console.log("useStableArrayResult: Dependencies stable, returning previous reference.");
  }


  return result;
};


// --- Constants ---
// Default Cache and Prefetch Configuration (fallback values)
const DEFAULT_CACHE_MAX_SIZE = 200;
const DEFAULT_PREFETCH_BATCH_SIZE = 10;
const DEFAULT_BATCH_DELAY_MS = 500;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 80;

// --- Provider Component ---
export const NotesProvider = ({ children }) => {
  // --- Cache/Prefetch Settings (derived from shared SettingsContext) ---
  const { settings: serverSettings, reloadSettings } = useSettings();

  const cacheSettings = useMemo(() => ({
    CACHE_MAX_SIZE: parseInt(serverSettings.CACHE_MAX_SIZE) || DEFAULT_CACHE_MAX_SIZE,
    PREFETCH_BATCH_SIZE: parseInt(serverSettings.PREFETCH_BATCH_SIZE) || DEFAULT_PREFETCH_BATCH_SIZE,
    BATCH_DELAY_MS: parseInt(serverSettings.BATCH_DELAY_MS) || DEFAULT_BATCH_DELAY_MS,
    CACHE_TTL_MS: parseInt(serverSettings.CACHE_TTL_MS) || DEFAULT_CACHE_TTL_MS,
    PAGE_SIZE: parseInt(serverSettings.PAGE_SIZE) || DEFAULT_PAGE_SIZE,
  }), [serverSettings]);

  // Keep a ref for cache settings to always get current values in closures
  const cacheSettingsRef = useRef(cacheSettings);
  useEffect(() => {
    cacheSettingsRef.current = cacheSettings;
  }, [cacheSettings]);

  // Temporary: Still need navigate for functions not yet migrated to NavigationService
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);

  const { tags: allTagsFromContext, hiddenTagIds } = useTags(); // Get all tags for lookup and hidden tags
  const { shouldAutoApply, shouldSuggestTag, getFeatureSettings } = useAutoTagging(); // Get auto-tagging settings
  const {
    savedSearches,
    layoutView,
    showQuickAccess,
    showMonthMarkers,
    showNoteTabs,
    saveSearch,
    removeSavedSearch,
    toggleLayoutView,
    changeLayoutView,
    toggleQuickAccess,
    toggleMonthMarkers,
    toggleNoteTabs,
  } = useUIPreferences(); // Get UI preferences from the context
  const {
    getSortForView,
    setSortForView,
    getAvailableSortsForView,
    convertToLegacyParams,
    SORT_LABELS
  } = useSorting(); // Get unified sorting functions

  // Get navigation context for search navigation
  const { navigateToSearch: navigateToSearchFromContext } = useNavigationContext();

  // Initialize prefetch hook
  const {
    addToCache,
    touchCacheEntry,
    removeFromCache,
    getCachedNote,
    isCacheValid,
    prefetchNoteToCache,
    cancelPendingPrefetches,
    getViewportPrefetchDelay,
    subscribeToCacheStatus,
    getNoteCacheStatus,
    fullNotesCacheRef
  } = usePrefetch(cacheSettings);

  const syncInProgressRef = useRef(false); // Ref for debouncing socket sync

  // --- State ---

  // View state - managed by NavigationService via pathname, exposed here for business logic
  // Initialize from URL so direct navigation to /archive or /trash loads the correct notes on first render
  // (otherwise the initial-load effect races with the path-change effect — the first loadNotes('main')
  // is still in flight when the path-change effect re-runs it, so the archive/trash fetch gets aborted)
  const [view, setView] = useState(() => {
    if (typeof window === 'undefined') return 'main';
    const pathname = window.location.pathname;
    return pathname === '/archive' ? 'archive' : pathname === '/trash' ? 'trash' : 'main';
  });

  // Core Data State
  const [notes, setNotes] = useState([]); // Main list of notes for the current view
  const [listLoading, setListLoading] = useState(true); // Loading indicator for list operations
  const [noteDetailLoading, setNoteDetailLoading] = useState(false); // Loading indicator for opening a single note
  const [error, setError] = useState(null); // Stores error messages
  const [savingNotes, setSavingNotes] = useState({}); // Tracks saving status per note { noteId: boolean }

  // Pagination State
  const [page, setPage] = useState(1); // Current page number for API requests
  const [hasMore, setHasMore] = useState(true); // Indicates if more notes can be loaded
  const [totalNotes, setTotalNotes] = useState(0); // Total count of notes for the current view/search
  // The query that `totalNotes` currently represents *as a search-result count*.
  // `totalNotes` is shared with the main-list DB total, so a non-search write (loadNotes)
  // sets this to null. The search header only trusts the count when this matches the live
  // query, otherwise a stale/DB total could flash before a slow search response lands.
  const [searchCountQuery, setSearchCountQuery] = useState(null);

  // View & Filtering State
  const [noteTags, setNoteTags] = useState({}); // Cache for tags associated with notes { noteId: Tag[] }
  const [filterByVisibleTags, setFilterByVisibleTags] = useState(true); // Toggles filtering by hidden tags (currently unused in filtering logic)
  // hiddenTagIds is now sourced from TagsContext

  // Search State
  const [searchMode, setSearchMode] = useState(false); // Is the app currently in search mode?
  const [searchResults, setSearchResults] = useState([]); // Notes matching the search query
  const [searchQuery, setSearchQuery] = useState(''); // The current search term
  const [searchBarActive, setSearchBarActive] = useState(false); // Visual state for the search bar
  const [resolvedTagIds, setResolvedTagIds] = useState({}); // State mirror of resolvedTagIdsRef for reactive components

  // Toast State
  const [showAutoTagSuccess, setShowAutoTagSuccess] = useState(false); // Show success toast for auto-tag
  const [autoTaggedTagName, setAutoTaggedTagName] = useState(''); // Store the tag name for the toast message
  
  // --- NEW: Success toast state for archive/delete operations ---
  const [showArchiveSuccess, setShowArchiveSuccess] = useState(false);
  const [showUnarchiveSuccess, setShowUnarchiveSuccess] = useState(false);
  const [showTrashSuccess, setShowTrashSuccess] = useState(false);
  const [showRestoreSuccess, setShowRestoreSuccess] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [showHiddenSuccess, setShowHiddenSuccess] = useState(false); // New toast for hidden notes
  const [operationCount, setOperationCount] = useState(1); // Track how many notes were affected
  const [lastArchivedNoteIds, setLastArchivedNoteIds] = useState([]);
  const [lastTrashedNoteIds, setLastTrashedNoteIds] = useState([]);
  // Captures full note objects (+ their search-result index) for the most recent
  // trash op so undo can re-insert them in place instead of refetching the search.
  const lastTrashedNotesRef = useRef([]);

  // Note Interaction State
  const [openedNote, setOpenedNote] = useState(null); // The note currently open in the editor/modal
  const [recentlyEditedNoteId, setRecentlyEditedNoteId] = useState(null); // Tracks the last closed note for potential UI effects

  // Track notes array length to detect actual changes
  const lastNotesLengthRef = useRef(0);

  // --- Refs for tracking API calls and debounce ---
  const loadNotesInProgressRef = useRef(false);
  const debouncedInProgressRef = useRef(false);
  const searchInProgressRef = useRef(false);
  const searchDebounceRef = useRef(false);
  const urlSyncInProgressRef = useRef(false);

  // Refs for stabilizing callbacks that depend on state lists/flags
  const searchModeRef = useRef(searchMode);
  const searchResultsRef = useRef(searchResults);
  const notesRef = useRef(notes);
  const openedNoteRef = useRef(openedNote); // Ref for openedNote as well
  const viewRef = useRef(view);
  const searchQueryRef = useRef(searchQuery);
  const pageRef = useRef(page);
  const hasMoreRef = useRef(hasMore);
  const openNoteByIdRef = useRef(null); // Ref for openNoteById to avoid circular dependency
  const resolvedTagIdsRef = useRef({}); // {tagNameLower: tagId} for tags navigated to by click
  const lastUsedTagIdsRef = useRef(''); // JSON snapshot of resolvedTagIds used in last actual search

  // Get current sort option for the active view/mode
  const currentSortOption = useMemo(() => {
    return getSortForView(searchMode ? 'search' : view);
  }, [getSortForView, searchMode, view]);
  
  // Get main view sort option (for effects that should only trigger on main view changes)
  const mainViewSortOption = useMemo(() => {
    return getSortForView(view);
  }, [getSortForView, view]);

  // --- Core Data Loading ---
  
  // Flag to prevent socket events from triggering updates during *user-initiated* manual refreshes
  const manualRefreshInProgressRef = useRef(false);

  const loadNotes = useCallback(async (refresh = false, extendedSocketBlock = false, explicitSortOption = null, isSocketSync = false, viewOverride = null) => {
    // Prevent multiple simultaneous API calls - track at the API request level
    if (loadNotesInProgressRef.current) {
      console.log("loadNotes: Aborted - API call already in progress");
      return Promise.resolve();
    }
     
    // Apply a short debounce to prevent rapid-fire loadNotes calls 
    if (debouncedInProgressRef.current && !refresh) {
      console.log("loadNotes: Debounced - Too soon after previous call");
      return Promise.resolve();
    }
    
    // If loading more, but hasMore is false, don't proceed
    if (!refresh && !hasMoreRef.current) {
      console.log("loadNotes: Aborted - Not refreshing and !hasMore.");
      return Promise.resolve();
    }

    // Skip if in search mode - search results are loaded separately
    if (searchModeRef.current && !refresh) {
      console.log("loadNotes: Aborted - In search mode and not explicitly refreshing");
      return Promise.resolve();
    }

    // Use explicit sort option if provided, otherwise compute current sort option from current state
    const sortOptionToUse = explicitSortOption || getSortForView(searchModeRef.current ? 'search' : viewRef.current);
    const { sortCriteria, oldestFirst, searchSortOrder } = convertToLegacyParams(sortOptionToUse);

    console.log(`loadNotes called: refresh=${refresh}, view=${viewRef.current}, sortOption=${sortOptionToUse}, converted to: sortCriteria=${sortCriteria}, oldestFirst=${oldestFirst}, searchSortOrder=${searchSortOrder}`);
    setListLoading(true); // Set loading for this operation
    setError(null);

    // Set debounce flag
    debouncedInProgressRef.current = true;
    // Clear debounce flag after a delay
    setTimeout(() => {
      debouncedInProgressRef.current = false;
    }, 300); // 300ms debounce

    // Set the manual refresh flag ONLY for user-initiated refreshes, not socket syncs
    if (refresh && !isSocketSync && !manualRefreshInProgressRef.current) {
      console.log("Setting manualRefreshInProgress flag for user-initiated refresh");
      manualRefreshInProgressRef.current = true;
    } else if (refresh && isSocketSync) {
      console.log("Skipping manualRefreshInProgress flag set for socket-triggered sync");
    }

    const currentPage = refresh ? 1 : pageRef.current;
    // Explicitly read the current view at execution time
    const currentView = viewOverride || viewRef.current;
    const isArchived = currentView === 'archive';
    const isDeleted = currentView === 'trash';

    const currentLimit = cacheSettingsRef.current.PAGE_SIZE;

    // Set the ref to indicate API call is in progress
    loadNotesInProgressRef.current = true;

    try {
      console.log(`Making API call for view: ${currentView}, isArchived=${isArchived}, isDeleted=${isDeleted}, oldestFirst=${oldestFirst}, sortCriteria=${sortCriteria}`);
      const response = await notesApi.getNotes(
        currentPage,
        currentLimit,
        isArchived,
        isDeleted,
        oldestFirst,
        true, // includeDetails
        sortCriteria, // pass sort criteria
        true, // truncateContent - enable content truncation for stacked view
        520   // contentLimit - limit content to 300 characters
      );

      const fetchedNotes = response.notes || [];
      const totalPages = response.totalPages || 1;
      const fetchedTotalCount = response.totalCount || 0;

      console.log(`loadNotes fetched ${fetchedNotes.length} notes for view ${currentView}. Total: ${fetchedTotalCount}, Page: ${currentPage}/${totalPages}`);

      // Verify that we're still in the same view before updating state
      // If viewOverride was used, skip this check since view state might be stale
      if (!viewOverride && currentView !== viewRef.current) {
        console.log(`View changed from ${currentView} to ${viewRef.current} during fetch. Ignoring results.`);
        return Promise.resolve();
      }

      // Check if we actually got new notes (only relevant for pagination)
      if (!refresh && fetchedNotes.length === 0) {
        console.log("No new notes returned for this page, disabling hasMore");
        setHasMore(false);
        return;
      }

      setTotalNotes(fetchedTotalCount);
      setSearchCountQuery(null); // This count is the DB total, not a search-result count

      if (refresh) {
        console.log("loadNotes (refresh): Replacing notes state.");
        setNotes(fetchedNotes);
        setPage(2);
      } else {
        console.log("loadNotes (pagination): Appending notes for page", currentPage);
        setNotes(prevNotes => {
          const existingIds = new Set(prevNotes.map(n => n.id));
          const uniqueNewNotes = fetchedNotes.filter(note => !existingIds.has(note.id));
          if (uniqueNewNotes.length === 0 && fetchedNotes.length > 0) {
            console.log("Warning: Got notes but they were all duplicates.");
          }
          console.log(`Appending ${uniqueNewNotes.length} new notes to ${prevNotes.length} existing notes`);
          if (uniqueNewNotes.length > 0) {
            console.log('First new note date:', uniqueNewNotes[0].created_at);
            console.log('Last new note date:', uniqueNewNotes[uniqueNewNotes.length - 1].created_at);
          }
          return [...prevNotes, ...uniqueNewNotes];
        });
        setPage(currentPage + 1);
      }

      const moreAvailable = currentPage < totalPages;
      setHasMore(moreAvailable);
      console.log(`loadNotes completed for view ${currentView}. hasMore: ${moreAvailable}`);
      return Promise.resolve();
    } catch (err) {
      console.error(`Error loading notes for view ${currentView}:`, err);
      setError(`Failed to load notes: ${err.message}`);
      if (refresh) setNotes([]); // Clear notes on error
      setHasMore(false);
      return Promise.reject(err);
    } finally {
      // Reset the API call progress flag
      loadNotesInProgressRef.current = false;
      setListLoading(false); // Ensure loading is set to false

      // Clear the manual refresh flag after a shorter delay UNLESS extended block is requested
      // Only clear if it was potentially set (i.e., not a socket sync)
      if (refresh && !isSocketSync && !extendedSocketBlock) {
        setTimeout(() => {
          manualRefreshInProgressRef.current = false;
          console.log("Cleared manualRefreshInProgress flag after user refresh (100ms delay)");
        }, 100); // Reduced delay
      }
    }
  }, [getSortForView, convertToLegacyParams]); // Removed: view, page, hasMore, searchMode, currentSortOption - now using refs
  
  // --- View Management ---

  // Handle view change with URL synchronization
  // Internal function to handle view change business logic (called when URL changes)
  const handleViewChange = useCallback((newView) => {
    // Only update if the view is actually changing
    if (newView !== view) {
      console.log(`Handling view change from ${view} to ${newView}`);

      // Exit search mode if active
      if (searchMode) {
        setSearchMode(false);
        setSearchResults([]);
        setSearchQuery('');
      }

      // Reset state for the new view - thorough cleanup
      setNotes([]);
      setPage(1);
      setHasMore(true);
      setListLoading(true);
      setError(null);

      // Set the view state
      setView(newView);

      // Reset scroll position to top
      window.scrollTo(0, 0);

      // Note: loadNotes(true) is handled by the Initial Load Effect when view changes
    }
  }, [view, searchMode]);

  // --- Note Opening/Closing ---

  // Close note without URL manipulation (for use with NavigationService)
  const closeNoteWithoutUrlUpdate = useCallback((options = {}) => {
    const { skipFlushSync = false } = options;
    console.log('[NotesContext] closeNoteWithoutUrlUpdate - closing note UI only');

    const noteId = openedNoteRef.current?.id;

    // PERFORMANCE: Use flushSync to force immediate synchronous render of the close
    // This makes the UI feel instant when closing manually (e.g., clicking outside)
    // Skip flushSync when called from React lifecycle (e.g., URL watcher effect)
    if (skipFlushSync) {
      setOpenedNote(null);
    } else {
      flushSync(() => {
        setOpenedNote(null);
      });
    }

    // PERFORMANCE: Defer non-critical updates to next tick to avoid blocking
    // This allows the UI to become interactive immediately
    if (noteId) {
      setTimeout(() => {
        console.log('[NotesContext] Deferred cleanup for note:', noteId);
        setRecentlyEditedNoteId(noteId);

        // Clear the 'recently edited' marker after a short delay
        setTimeout(() => setRecentlyEditedNoteId(null), 500);

        // Dispatch custom event for NoteCard bounce animation
        window.dispatchEvent(new CustomEvent('note-closed', {
          detail: { noteId }
        }));
      }, 0);
    }
  }, []);

  // --- Search Functionality ---

  // --- New function to get reference count without affecting UI state ---
  const getReferenceCount = useCallback(async (noteId) => {
    try {
      // Use unified sort system to get search sort order
      const { searchSortOrder } = convertToLegacyParams(getSortForView('search'));
      const searchResponse = await notesApi.searchNotes(noteId, 1, 1, searchSortOrder, false, true, 50); // Only need 1 result to get totalCount, truncate heavily
      
      // Return the total count minus 1 if the current note is included in the results
      // (since we want to count other notes that reference this one, not the note itself)
      let referenceCount = searchResponse?.totalCount || 0;
      
      // Check if the current note is included in search results and subtract it
      if (searchResponse?.notes?.some(note => note.id === noteId)) {
        referenceCount = Math.max(0, referenceCount - 1);
      }
      
      return referenceCount;
    } catch (e) {
      console.error("getReferenceCount: Error getting reference count:", e);
      return 0;
    }
  }, [getSortForView]);

  // Lightweight function to refresh just the search result count without fetching all results
  const refreshSearchCount = useCallback(async (query) => {
    if (!query) return;
    try {
      const { searchSortOrder } = convertToLegacyParams(getSortForView('search'));
      // Fetch only 1 result to get totalCount, with heavy truncation
      const response = await notesApi.searchNotes(query, 1, 1, searchSortOrder, true, true, 50, resolvedTagIdsRef.current);
      setTotalNotes(response.totalCount || 0);
      setSearchCountQuery(query);
      console.log(`refreshSearchCount: Updated count to ${response.totalCount} for query "${query}"`);
    } catch (e) {
      console.error("refreshSearchCount: Error refreshing count:", e);
    }
  }, [getSortForView]);

  // Specific search for Note ID
  const searchById = useCallback(async (noteId, pushHistory = true) => {
    if (openedNoteRef.current) closeNoteWithoutUrlUpdate();

    // Reset scroll position to top for new ID search
    window.scrollTo({ top: 0, behavior: 'instant' });

    const displayQuery = `!${noteId}`;
    console.log(`searchById: Searching for ID "${noteId}"`);

    // Update search state immediately
    setSearchMode(true);
    setSearchQuery(displayQuery);
    setSearchBarActive(true);
    setListLoading(true);
    setSearchResults([]); // Clear previous results
    setSearchCountQuery(null); // Count not yet valid for the new query
    setPage(1);
    setHasMore(false); // ID search usually doesn't paginate combined results

    if (pushHistory) {
      const newSearch = `?q=${encodeURIComponent(displayQuery)}`;
      if (window.location.search !== newSearch) {
        console.log("searchById: Pushing ID search query to URL:", newSearch);
        navigateRef.current(newSearch);
      }
    }

    try {
      let results = [];
      let foundIds = new Set();

      // 1. Try direct fetch
      try {
        const directResponse = await notesApi.getNoteById(noteId);
        const directNote = directResponse?.note || directResponse;
        if (directNote && directNote.id && !foundIds.has(directNote.id)) {
          console.log("searchById: Found via getNoteById:", directNote.id);
          results.push(directNote);
          foundIds.add(directNote.id);
        }
      } catch (e) {
        console.warn("searchById: getNoteById failed (might be normal if note doesn't exist):", e.message);
      }

      // 2. Search for references (limit to one page for ID search)
      try {
        // Use unified sort system to get search sort order
        const { searchSortOrder } = convertToLegacyParams(getSortForView('search'));
        const searchResponse = await notesApi.searchNotes(noteId, 1, cacheSettingsRef.current.PAGE_SIZE, searchSortOrder, true, false); // No truncation for ID search
        if (searchResponse?.notes) {
          console.log(`searchById: Found ${searchResponse.notes.length} notes via text search.`);
          searchResponse.notes.forEach(note => {
            if (!foundIds.has(note.id)) {
              results.push(note);
              foundIds.add(note.id);
            }
          });
        }
      } catch (e) {
        console.error("searchById: Error during text search for ID references:", e);
      }

      console.log(`searchById: Final results count: ${results.length}`);
      setSearchResults(results);
      setTotalNotes(results.length);
      setSearchCountQuery(displayQuery);
      setListLoading(false);
      return results;
    } catch (err) {
      console.error('Error searching by ID:', err);
      setError(`Failed to search for note ID ${noteId}`);
      setSearchResults([]);
      setTotalNotes(0);
      setListLoading(false);
      return [];
    }
  }, [closeNoteWithoutUrlUpdate, getSortForView]);

  // Central search handler
  const handleSearch = useCallback(async (query, refreshSearch = true, pushHistory = true, sortOverride = null, replaceHistory = false, forceRefresh = false) => {
    // Prevent multiple simultaneous search API calls
    if (searchInProgressRef.current) {
      console.log("handleSearch: Aborted - Search API call already in progress");
      return Promise.resolve();
    }
    
    const rawQuery = query || ''; // Keep the original query with spaces
    const trimmedQueryForChecks = rawQuery.trim(); // Use this for logical checks only

    // --- Exit Search Mode ---
    if (!trimmedQueryForChecks && searchMode) {
      console.log("handleSearch: Exiting search mode.");
      // Clear selection will be handled by NoteSelectionContext
      
      // Reset state for returning to the main view
      setSearchMode(false);
      setSearchResults([]);
      setSearchQuery('');
      setSearchCountQuery(null);
      setPage(1);
      resolvedTagIdsRef.current = {};
      lastUsedTagIdsRef.current = '';
      setResolvedTagIds({});
      setHasMore(true);
      setListLoading(true);
      
      if (pushHistory) {
        const targetPath = view === 'archive' ? '/archive' : view === 'trash' ? '/trash' : '/';
        // Preserve the note parameter if it exists (for list view)
        const currentParams = new URLSearchParams(window.location.search);
        const noteParam = currentParams.get('note');

        // If a note is open, use browser back to avoid creating a new history entry
        // This prevents the back button from reopening the search after closing the note
        if (noteParam) {
          console.log(`handleSearch: Note is open, using back() to exit search`);
          window.history.back();
        } else {
          // No note open - navigate normally
          const targetUrl = targetPath;
          console.log(`handleSearch: Navigating to ${targetUrl} on exit.`);
          if (window.location.pathname + window.location.search !== targetUrl) {
            navigateRef.current(targetUrl);
          }
        }
      }
      
      // Load notes for the correct view - determine from current path in case view state is stale
      const currentPath = window.location.pathname;
      const targetView = currentPath === '/archive' ? 'archive' : currentPath === '/trash' ? 'trash' : 'main';
      const targetViewSortOption = getSortForView(targetView);
      console.log(`handleSearch: Loading notes for target view "${targetView}" (current view state: "${view}", path: "${currentPath}")`);
      return loadNotes(true, false, targetViewSortOption, false, targetView);
    }

    // --- No Action Needed ---
    if (!trimmedQueryForChecks && !searchMode) {
      console.log("handleSearch: Already not searching and query is empty. Doing nothing.");
      return Promise.resolve();
    }
     
    // Prevent redundant refresh searches if query and resolved tag IDs are both unchanged
    if (!forceRefresh && rawQuery === searchQuery && searchMode && refreshSearch && !sortOverride &&
        JSON.stringify(resolvedTagIdsRef.current) === lastUsedTagIdsRef.current) {
      console.log("handleSearch: Query unchanged, refreshing, and NO sort override. Doing nothing.");
      return Promise.resolve();
    }

    // Set the search in progress flag
    searchInProgressRef.current = true;

    try {
      console.log(`handleSearch: Searching for \"${rawQuery}\". Refresh: ${refreshSearch}, PushHistory: ${pushHistory}`);
  
      // Reset scroll position to top only for new searches (refresh), not pagination
      if (refreshSearch) {
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
  
      if (rawQuery.startsWith('!')) {
        const noteId = rawQuery.substring(1);
        if (noteId) {
          console.log(`handleSearch: Detected ID search for \"${noteId}\". Calling searchById.`);
          return searchById(noteId, pushHistory);
        }
      }
  
      // Reset state for search
      setListLoading(true);
      if (refreshSearch) {
        setSearchResults([]); // Clear previous results only on refresh
        setSearchCountQuery(null); // Count not yet valid for the new query
        setPage(1); // Reset page only on refresh
        // Clear selection will be handled by NoteSelectionContext
      }
  
      // Update search state immediately if query changed or entering search mode
      if (rawQuery !== searchQuery || !searchMode) {
        // Clear main notes list when entering search mode to prevent flicker on exit
        if (!searchMode) {
          console.log("handleSearch: Entering search mode, clearing main notes list.");
          setNotes([]);
          // Clear selection will be handled by NoteSelectionContext
        }
        setSearchMode(true);
        setSearchQuery(rawQuery); // Use rawQuery to preserve spaces
      }

      if (pushHistory) {
        const currentParams = new URLSearchParams(window.location.search);
        const noteParam = currentParams.get('note');
        const existingQuery = currentParams.get('q');
        let newSearch = `?q=${encodeURIComponent(rawQuery)}`; // Use rawQuery
        // Preserve the note parameter if it exists (for list view)
        if (noteParam) {
          newSearch += `&note=${encodeURIComponent(noteParam)}`;
        }
        const targetPath = window.location.pathname;
        const newUrl = targetPath + newSearch;
        // Check if URL actually needs changing
        if (window.location.pathname + window.location.search !== newUrl) {
          // If a note is open AND we're already in search mode, use replace to avoid
          // stacking history entries for each search change while viewing a note
          const shouldReplace = replaceHistory || (!!noteParam && !!existingQuery);
          console.log(`handleSearch: ${shouldReplace ? 'Replacing' : 'Pushing'} search query to URL:`, newUrl);
          navigateRef.current(newUrl, { replace: shouldReplace });
        } else {
          console.log("handleSearch: URL is already correct, skipping navigation.");
        }
      }

      // Use unified sort system to get search sort order
      // Always use search view's sort option for search, regardless of sortOverride
      const searchSortOption = sortOverride || getSortForView('search');
      const { searchSortOrder } = convertToLegacyParams(searchSortOption);
      // Use the correct page number: 1 for refresh, current 'page' state for pagination
      // Use pageRef to avoid function recreation when page changes (pagination performance)
      const searchPage = refreshSearch ? 1 : pageRef.current;
      // Reconcile resolvedTagIds: drop any entries whose tag name is no longer in the query
      const queryTagTokens = new Set(
        (rawQuery.match(/#([^\s#]+)/g) || []).map(t => t.slice(1).toLowerCase())
      );
      const reconciledTagIds = {};
      for (const [name, id] of Object.entries(resolvedTagIdsRef.current)) {
        if (queryTagTokens.has(name)) reconciledTagIds[name] = id;
      }
      resolvedTagIdsRef.current = reconciledTagIds;
      lastUsedTagIdsRef.current = JSON.stringify(reconciledTagIds);

      console.log(`handleSearch: API call - Query: \"${rawQuery}\", Page: ${searchPage}, Sort: ${searchSortOrder}`);
      const response = await notesApi.searchNotes(rawQuery, searchPage, cacheSettingsRef.current.PAGE_SIZE, searchSortOrder, true, true, 520, resolvedTagIdsRef.current);
  
      setTotalNotes(response.totalCount);
      setSearchCountQuery(rawQuery);
      const fetchedNotes = response.notes || [];
  
      if (refreshSearch) {
        setSearchResults(fetchedNotes);
      } else {
        // Append results for pagination
        setSearchResults(prevResults => {
          const existingIds = new Set(prevResults.map(n => n.id));
          const uniqueNewNotes = fetchedNotes.filter(note => !existingIds.has(note.id));
          return [...prevResults, ...uniqueNewNotes];
        });
      }
  
      const moreAvailable = searchPage < response.totalPages;
      setHasMore(moreAvailable);
      // Set the *next* page to fetch, regardless of refresh or pagination
      setPage(searchPage + 1);
      console.log(`handleSearch: API success. HasMore: ${moreAvailable}, NextPage: ${searchPage + 1}`);
      return Promise.resolve();
    } catch (err) {
      console.error('Error searching notes:', err);
      setError(`Failed to search notes: ${err.message || 'Unknown error'}`);
      if (refreshSearch) setSearchResults([]); // Clear results on refresh error
      setHasMore(false);
      return Promise.reject(err);
    } finally {
      // Reset the search in progress flag
      searchInProgressRef.current = false;
      setListLoading(false); // Ensure loading is set false
    }
  }, [
    searchMode, searchQuery, view,
    searchById, loadNotes, getSortForView
  ]); // Removed navigate - using navigateRef; removed page - using pageRef

  const loadMoreSearchResults = useCallback(() => {
    // Skip if conditions aren't right
    if (!searchMode || !hasMore || listLoading || searchDebounceRef.current) {
      console.log("loadMoreSearchResults: Skipping due to conditions", {
        searchMode,
        hasMore,
        loading: listLoading,
        debounceActive: searchDebounceRef.current
      });
      return;
    }
    
    // Set the debounce flag
    searchDebounceRef.current = true;
    
    console.log("Loading more search results for query:", searchQuery);
    
    // Execute the search (don't push history, don't refresh)
    handleSearch(searchQuery, false, false).finally(() => {
      // Clear debounce after the search completes (success or error)
      setTimeout(() => {
        searchDebounceRef.current = false;
        console.log("Search debounce cleared");
      }, 300);
    });
  }, [searchMode, hasMore, listLoading, searchQuery, handleSearch]);
  
  // --- Helper function for note state updates ---
  
  // Helper to determine if a note belongs in the current view
  const isInCurrentView = useCallback((note) => {
    return (
      (view === 'main' && !note.is_archived && !note.is_deleted) ||
      (view === 'archive' && note.is_archived) ||
      (view === 'trash' && note.is_deleted)
    );
  }, [view]);
  
  // Helper to check if a note matches the current search query
  const doesNoteMatchSearchQuery = useCallback((note, query) => {
    if (!query || query.trim() === '') return true;

    const trimmedQuery = query.trim();
    
    console.log(`[SEARCH DEBUG] Checking note ${note.id} against query "${trimmedQuery}":`, {
      title: note.title,
      color: note.color,
      content: note.content ? `${note.content.substring(0, 100)}...` : 'empty',
      metadata: note.metadata
    });
    
    // Simple helper function for text matching
    const containsText = (str, term) => {
      if (!str) return false;
      return str.toLowerCase().includes(term.toLowerCase());
    };

    // Helper to search in all searchable text fields
    const searchInAllFields = (note, term) => {
      // Search in title
      if (containsText(note.title, term)) return true;
      
      // Search in content
      if (containsText(note.content, term)) return true;
      
      // Search in the searchable metadata string prepared by the server
      if (note.metadataSearchable && containsText(note.metadataSearchable, term)) return true;
      
      return false;
    };

    // Handle quoted phrases - search for exact phrase in all fields
    if ((trimmedQuery.startsWith('"') && trimmedQuery.endsWith('"')) ||
        (trimmedQuery.startsWith("'") && trimmedQuery.endsWith("'"))) {
      const phrase = trimmedQuery.substring(1, trimmedQuery.length - 1);
      const result = searchInAllFields(note, phrase);
      console.log(`[SEARCH DEBUG] Quoted phrase "${phrase}" result:`, result);
      return result;
    }
    
    // Handle ID search - special case for exact ID or ID as text
    if (trimmedQuery.startsWith('!') && trimmedQuery.length > 1) {
      const actualUuid = trimmedQuery.substring(1);
      const result = note.id === actualUuid || searchInAllFields(note, actualUuid);
      console.log(`[SEARCH DEBUG] ID search "${actualUuid}" result:`, result);
      return result;
    }

    // Handle simple single-term searches
    if (!trimmedQuery.includes(' ')) {
      // Simple wildcard support
      if (trimmedQuery.includes('*')) {
        const regex = new RegExp(trimmedQuery.replace(/\*/g, '.*'), 'i');
        const titleMatch = regex.test(note.title || '');
        const contentMatch = regex.test(note.content || '');
        const metadataMatch = note.metadataSearchable && regex.test(note.metadataSearchable);
        const result = titleMatch || contentMatch || metadataMatch;
        console.log(`[SEARCH DEBUG] Wildcard "${trimmedQuery}" result:`, result);
        return result;
      }
      
      // Simple text search in all fields
      const result = searchInAllFields(note, trimmedQuery);
      console.log(`[SEARCH DEBUG] Simple term "${trimmedQuery}" result:`, result);
      return result;
    }

    // Handle multi-term searches with proper OR logic
    // Helper function to tokenize query while preserving quoted phrases
    const tokenizeQuery = (str) => {
      const tokens = [];
      let i = 0;

      while (i < str.length) {
        // Skip whitespace
        while (i < str.length && /\s/.test(str[i])) i++;
        if (i >= str.length) break;

        // Check for quoted phrase
        if (str[i] === '"' || str[i] === "'") {
          const quote = str[i];
          let j = i + 1;
          // Find matching closing quote
          while (j < str.length && str[j] !== quote) j++;
          // Include quotes in the token
          tokens.push(str.substring(i, j < str.length ? j + 1 : j));
          i = j < str.length ? j + 1 : j;
        } else {
          // Regular token - read until space
          let j = i;
          while (j < str.length && !/\s/.test(str[j])) j++;
          tokens.push(str.substring(i, j));
          i = j;
        }
      }

      return tokens.filter(t => t.length > 0);
    };

    const terms = tokenizeQuery(trimmedQuery);
    
    // Check if this is an OR search by looking for the OR operator
    const hasOrOperator = terms.some(term => term.toUpperCase() === 'OR');
    
    if (hasOrOperator) {
      // Split by OR and handle each group
      const orGroups = trimmedQuery.split(/\s+OR\s+/i);
      console.log(`[SEARCH DEBUG] OR search detected, groups:`, orGroups);
      
      // At least one OR group must match (OR logic)
      const result = orGroups.some(group => {
        const groupTerms = tokenizeQuery(group.trim());
        console.log(`[SEARCH DEBUG] Checking OR group "${group}" with terms:`, groupTerms);
        
        // All terms in a group must match (AND logic within each OR group)
        const groupResult = groupTerms.every(term => {
          // Handle exclusion
          if (term.startsWith('-') && term.length > 1) {
            const excludeTerm = term.substring(1);
            const excluded = !searchInAllFields(note, excludeTerm);
            console.log(`[SEARCH DEBUG] Exclusion term "-${excludeTerm}" result:`, excluded);
            return excluded;
          }

          // Handle quoted phrases - extract phrase and do exact match
          if ((term.startsWith('"') && term.endsWith('"')) ||
              (term.startsWith("'") && term.endsWith("'"))) {
            const phrase = term.substring(1, term.length - 1);
            const phraseResult = searchInAllFields(note, phrase);
            console.log(`[SEARCH DEBUG] Quoted phrase term "${phrase}" result:`, phraseResult);
            return phraseResult;
          }

          // Simple wildcard support
          if (term.includes('*')) {
            const regex = new RegExp(term.replace(/\*/g, '.*'), 'i');
            const titleMatch = regex.test(note.title || '');
            const contentMatch = regex.test(note.content || '');
            const metadataMatch = note.metadataSearchable && regex.test(note.metadataSearchable);
            const wildcardResult = titleMatch || contentMatch || metadataMatch;
            console.log(`[SEARCH DEBUG] Wildcard term "${term}" result:`, wildcardResult);
            return wildcardResult;
          }

          // Regular text search in all fields
          const termResult = searchInAllFields(note, term);
          console.log(`[SEARCH DEBUG] Term "${term}" result:`, termResult);
          return termResult;
        });
        
        console.log(`[SEARCH DEBUG] Group "${group}" result:`, groupResult);
        return groupResult;
      });
      
      console.log(`[SEARCH DEBUG] Final OR result for note ${note.id}:`, result);
      return result;
    } else {
      // No OR operator - use AND logic for all terms
      const result = terms.every(term => {
        // Handle exclusion
        if (term.startsWith('-') && term.length > 1) {
          const excludeTerm = term.substring(1);
          const excluded = !searchInAllFields(note, excludeTerm);
          console.log(`[SEARCH DEBUG] Exclusion term "-${excludeTerm}" result:`, excluded);
          return excluded;
        }

        // Handle quoted phrases - extract phrase and do exact match
        if ((term.startsWith('"') && term.endsWith('"')) ||
            (term.startsWith("'") && term.endsWith("'"))) {
          const phrase = term.substring(1, term.length - 1);
          const phraseResult = searchInAllFields(note, phrase);
          console.log(`[SEARCH DEBUG] Quoted phrase term "${phrase}" result:`, phraseResult);
          return phraseResult;
        }

        // Simple wildcard support
        if (term.includes('*')) {
          const regex = new RegExp(term.replace(/\*/g, '.*'), 'i');
          const titleMatch = regex.test(note.title || '');
          const contentMatch = regex.test(note.content || '');
          const metadataMatch = note.metadataSearchable && regex.test(note.metadataSearchable);
          const wildcardResult = titleMatch || contentMatch || metadataMatch;
          console.log(`[SEARCH DEBUG] Wildcard term "${term}" result:`, wildcardResult);
          return wildcardResult;
        }

        // Regular text search in all fields
        const termResult = searchInAllFields(note, term);
        console.log(`[SEARCH DEBUG] Term "${term}" result:`, termResult);
        return termResult;
      });
      
      console.log(`[SEARCH DEBUG] Final AND result for note ${note.id}:`, result);
      return result;
    }
  }, []); // No dependencies - query is always passed as parameter

  // Helper to update or remove a note in both lists
  const _updateOrRemoveNoteInState = useCallback((noteOrId, updateFn = null) => {
    // --- Outer scope: Determine ID and note object early ---
    const isObjectOuter = typeof noteOrId === 'object' && noteOrId !== null;
    const noteIdOuter = isObjectOuter ? noteOrId.id : noteOrId; // Get ID regardless of type initially
    const noteOuter = isObjectOuter ? noteOrId : null;
    // Ensure we have a valid ID to work with
    if (!noteIdOuter) {
      console.warn("[_updateOrRemoveNoteInState] Cannot proceed without a valid note ID.", { noteOrId });

    }


    // Function to apply to the main 'notes' list
    const updateNotesList = (prevList) => {
      if (!noteIdOuter) return prevList; // Don't modify if ID is missing

      // If note should be removed (updateFn is null and we only have an ID)
      if (!updateFn && !isObjectOuter) {
        return prevList.filter(n => n.id !== noteIdOuter);
      }

      const index = prevList.findIndex(n => n.id === noteIdOuter);

      if (index !== -1) {
        if (noteOuter || updateFn) {
          const updatedNote = updateFn ? updateFn(prevList[index]) : noteOuter;
          if (!isInCurrentView(updatedNote)) {
            return prevList.filter(n => n.id !== noteIdOuter);
          }
          const newList = [...prevList];
          newList[index] = updatedNote;
          return newList;
        } else { // Only ID, no update function - remove
          return prevList.filter(n => n.id !== noteIdOuter);
        }
      }

      if (noteOuter && isInCurrentView(noteOuter)) {
        return [noteOuter, ...prevList];
      }

      return prevList;
    };

    // Apply update to the main notes list
    setNotes(updateNotesList);

    // Apply modified logic specifically for search results
    if (searchMode) {
      setSearchResults(prevList => {
        if (!noteIdOuter) return prevList; // Don't modify if ID is missing

        // --- Determine parameters specifically for search update ---
        // The update function is ALWAYS the second argument if provided.
        const updateFnPassed = typeof updateFn === 'function' ? updateFn : null;
        // The full note object is the first argument IF it's an object.
        const noteObjectPassed = (typeof noteOrId === 'object' && noteOrId !== null) ? noteOrId : null;
        // The ID is derived from the first argument.
        const noteIdToUse = noteIdOuter;

        // --- Find the note ---
        const index = prevList.findIndex(n => n.id === noteIdToUse);

        // If note exists in the search results list
        if (index !== -1) {
          const currentNote = prevList[index];

          // If we have a complete note object OR an update function, update it
          if (noteObjectPassed || updateFnPassed) {
            const updatedNoteData = updateFnPassed ? updateFnPassed(currentNote) : noteObjectPassed;
            const finalUpdatedNote = updateFnPassed ? { ...currentNote, ...updatedNoteData } : updatedNoteData;

            // Only remove from search results if EXPLICITLY deleted or archived
            // We don't re-evaluate search criteria because the server's full-text search
            // has access to complete content while we only have truncated content (520 chars)
            if (finalUpdatedNote.is_deleted) {
              console.log(`[_updateOrRemoveNoteInState - Search] Note ${noteIdToUse} was marked as deleted, removing from search results`);
              return prevList.filter(n => n.id !== noteIdToUse);
            }
            
            if (finalUpdatedNote.is_archived && !currentNote.is_archived) {
              console.log(`[_updateOrRemoveNoteInState - Search] Note ${noteIdToUse} was archived, removing from search results`);
              return prevList.filter(n => n.id !== noteIdToUse);
            }

            // Update the note in place - trust the server's search results
            const newList = [...prevList];
            newList[index] = finalUpdatedNote;
            console.log(`[_updateOrRemoveNoteInState - Search] Updated note ${noteIdToUse} in search results`);
            return newList;
          }
          // --- MODIFICATION: Handle ID-only calls more carefully ---
          // Keep notes in search results even if we only have an ID,
          // as this is commonly triggered when editing a note.
          else {
            console.log(`[_updateOrRemoveNoteInState - Search] Received update call with only ID ${noteIdToUse}. Keeping note in search results.`);
            return prevList; // Keep the note
          }
        }
        // If note does NOT exist in search results, do nothing.
        else {
          // console.log(`[_updateOrRemoveNoteInState - Search] Note ${noteIdToUse} not found in current search results. No action taken.`);
          return prevList; // Return the list unchanged
        }
      });
    }

  }, [searchMode, isInCurrentView, view, setNotes, setSearchResults]);

  // --- Cache Management Helpers ---
  // Note: Cache functions (addToCache, touchCacheEntry, removeFromCache) are now provided by usePrefetch hook

  // Helper for optimistic updates
  const _executeOptimisticUpdate = useCallback(async (noteId, updateData, apiCall) => {
    // Skip optimistic updates in search mode to avoid conflicts with socket handling
    // The socket will handle the update properly with complete data
    if (!searchMode) {
      // Apply optimistic update only when not in search mode
      _updateOrRemoveNoteInState(noteId, (prevNote) => ({
        ...prevNote,
        ...updateData,
        updated_at: new Date().toISOString()
      }));
    }

    // Invalidate cache for this note since it's being updated
    removeFromCache(noteId);

    // Prefetch queue cleanup is now handled by the usePrefetch hook

    try {
      const response = await apiCall();
      // Let socket handle final update
      return response;
    } catch (err) {
      console.error(`Error updating note ${noteId}:`, err);
      setError(`Failed to update note: ${err.message || 'Unknown error'}`);
      loadNotes(true); // Refresh on error
      return null;
    }
  }, [_updateOrRemoveNoteInState, loadNotes, searchMode, removeFromCache]);
  
  // --- Socket Event Handlers ---
  
  const handleSocketNoteCreated = useCallback((note) => {
    // Skip socket updates if we're in the middle of a manual refresh
    if (manualRefreshInProgressRef.current) {
      console.log('[SOCKET] Ignoring note_created during manual refresh:', note.id);
      return;
    }

    console.log('[SOCKET] Received note_created:', note);

    // Update the note reference card cache for newly created notes
    updateNoteInCache(note.id, note);    // If in search mode, check if note matches search criteria
    if (searchModeRef.current) {
      const noteMatchesSearch = doesNoteMatchSearchQuery(note, searchQueryRef.current);
      if (noteMatchesSearch) {
        console.log(`[SOCKET] Note ${note.id} matches search criteria for "${searchQueryRef.current}", adding to search results`);
        setSearchResults(prev => [note, ...prev]);
      } else {
        console.log(`[SOCKET] Note ${note.id} doesn't match search criteria for "${searchQueryRef.current}", not adding to search results`);
      }
    }
    // Not in search mode - check normal view logic
    else if (isInCurrentView(note)) {
      console.log(`[SOCKET] Note ${note.id} belongs in current view (${viewRef.current}), adding`);
      _updateOrRemoveNoteInState(note);
    } else {
      console.log(`[SOCKET] Note ${note.id} does not belong in current view (${viewRef.current}), ignoring`);
    }
  }, [isInCurrentView, _updateOrRemoveNoteInState, doesNoteMatchSearchQuery]);

  const handleSocketNoteUpdated = useCallback((note) => {
    if (manualRefreshInProgressRef.current) {
      console.log('[SOCKET] Ignoring note_updated during manual refresh:', note.id);
      return;
    }

    // Also ignore updates to the currently opened note if it's still loading
    // This prevents truncated content from socket events overwriting full content being loaded
    if (openedNoteRef.current?.id === note.id && openedNoteRef.current?.isLoading) {
      console.log('[SOCKET] Ignoring note_updated for currently loading note:', note.id);
      return;
    }

    console.log('[SOCKET] Received note_updated:', note);

    // Invalidate cache for this note since it was updated
    removeFromCache(note.id);

    // Prefetch queue cleanup is now handled by the usePrefetch hook

    // Update the note reference card cache so preview cards stay in sync
    updateNoteInCache(note.id, note);

    // --- SEARCH MODE HANDLING ---
    if (searchModeRef.current) {
      // Debug: Log the note structure and search query
      console.log('[SOCKET DEBUG] Note structure:', {
        id: note.id,
        title: note.title,
        tags: note.tags,
        tagsType: typeof note.tags,
        tagsLength: note.tags?.length,
        color: note.color,
        searchQuery: searchQueryRef.current
      });

      // First, check if the note matches the current search criteria
      const noteMatchesSearch = doesNoteMatchSearchQuery(note, searchQueryRef.current);
      console.log('[SOCKET DEBUG] doesNoteMatchSearchQuery result:', noteMatchesSearch);

      // Check if note is currently in search results before making changes
      const wasInResults = searchResultsRef.current.some(n => n.id === note.id);
      const willBeInResults = noteMatchesSearch && !note.is_deleted && isInCurrentView(note);
      const countChanged = wasInResults !== willBeInResults;

      setSearchResults(prevResults => {
        const index = prevResults.findIndex(n => n.id === note.id);

        // Case 1: Note is in search results
        if (index !== -1) {
          // If the note doesn't match the search anymore, remove it
          if (!noteMatchesSearch) {
            console.log(`[SOCKET - Search] Note ${note.id} no longer matches search criteria for "${searchQueryRef.current}", removing from results`);
            return prevResults.filter(n => n.id !== note.id);
          }

          // Otherwise, update it
          console.log(`[SOCKET - Search] Updating note ${note.id} within search results.`);
          const newList = [...prevResults];
          // Make sure to merge with existing data in case the socket event is partial
          // Put the socket update first, then overlay with existing complete data for any undefined fields
          newList[index] = { ...note, ...Object.fromEntries(
            Object.entries(prevResults[index]).filter(([key, value]) =>
              note[key] === undefined && value !== undefined
            )
          ) };

          // If the update marks it as deleted, remove it even from search
          if (newList[index].is_deleted) {
            console.log(`[SOCKET - Search] Note ${note.id} marked as deleted, removing from search results.`);
            return newList.filter(n => n.id !== note.id);
          }

          return newList;
        }
        // Case 2: Note is not in search results but now matches the search criteria
        else if (noteMatchesSearch) {
          // Don't add deleted notes to search results
          if (note.is_deleted) {
            console.log(`[SOCKET - Search] Note ${note.id} matches search but is deleted, not adding to results`);
            return prevResults;
          }

          // Don't add notes that don't belong in the current view context
          if (!isInCurrentView(note)) {
            console.log(`[SOCKET - Search] Note ${note.id} matches search but doesn't belong in current view (${viewRef.current}), not adding to results`);
            return prevResults;
          }

          console.log(`[SOCKET - Search] Note ${note.id} now matches search criteria for "${searchQueryRef.current}", adding to results`);
          return [note, ...prevResults];
        }

        // Case 3: Note is not in results and doesn't match criteria - do nothing
        return prevResults;
      });

      // Refresh count from server if a note was added or removed from search results
      if (countChanged && searchQueryRef.current) {
        refreshSearchCount(searchQueryRef.current);
      }

      // Update the main notes list in the background as well, respecting its view logic
      // But skip search result updates since we've already handled them above
      setNotes(prevNotes => {
        const index = prevNotes.findIndex(n => n.id === note.id);
        if (index !== -1) {
          if (isInCurrentView(note)) {
            const newList = [...prevNotes];
            newList[index] = { ...note, ...Object.fromEntries(
              Object.entries(prevNotes[index]).filter(([key, value]) =>
                note[key] === undefined && value !== undefined
              )
            ) };
            return newList;
          } else {
            // Note no longer belongs in current view, remove it
            return prevNotes.filter(n => n.id !== note.id);
          }
        } else if (isInCurrentView(note)) {
          // Note not in list but belongs in current view, add it
          return [note, ...prevNotes];
        }
        return prevNotes;
      });
    } else {
      // Original logic for non-search views
      if (isInCurrentView(note)) {
        console.log(`[SOCKET] Updated note ${note.id} belongs in current view (${viewRef.current}), updating/adding`);
        _updateOrRemoveNoteInState(note);
      } else {
        console.log(`[SOCKET] Note ${note.id} does not belong in current view (${viewRef.current}) after update, ensuring removal`);
        // This call is safe now because _updateOrRemoveNoteInState won't remove from search results based on just ID
        _updateOrRemoveNoteInState(note.id); // Attempt removal by ID from the main 'notes' list
      }
    }

    // Also update openedNote if this is the currently opened note (for live sync of color/tags)
    // This allows NoteForm to receive updated note props without closing and reopening
    if (openedNoteRef.current?.id === note.id && !openedNoteRef.current?.isLoading) {
      console.log(`[SOCKET] Updating openedNote for live sync: ${note.id}`);
      setOpenedNote(prev => ({
        ...prev,
        // Only update specific fields that can change externally (color, tags, is_pinned)
        // Don't update content/title as user might be editing
        color: note.color,
        tags: note.tags,
        is_pinned: note.is_pinned,
        // Update metadata fields as well
        updated_at: note.updated_at,
      }));
    }
  }, [isInCurrentView, _updateOrRemoveNoteInState, setSearchResults, doesNoteMatchSearchQuery, refreshSearchCount, removeFromCache]);

  const handleSocketNoteDeleted = useCallback((noteId) => {
    // Skip socket updates if we're in the middle of a manual refresh
    if (manualRefreshInProgressRef.current) {
      console.log('[SOCKET] Ignoring note_deleted during manual refresh:', noteId);
      return;
    }

    console.log('[SOCKET] Received note_deleted:', noteId);

    // Remove from cache when deleted
    removeFromCache(noteId);

    // Prefetch queue cleanup is now handled by the usePrefetch hook

    _updateOrRemoveNoteInState(noteId);
  }, [_updateOrRemoveNoteInState, removeFromCache]);

  const handleSocketObjectUpdated = useCallback((updatedObject) => {
    if (manualRefreshInProgressRef.current) {
      console.log('[SOCKET] Ignoring object_updated during manual refresh:', updatedObject.id);
      return;
    }

    console.log('[SOCKET] Received object_updated:', updatedObject);

    // Update all notes that contain this object
    const updateNotesWithObject = (notesList) => {
      let updatedCount = 0;
      const updated = notesList.map(note => {
        if (note.objects && Array.isArray(note.objects)) {
          const hasObject = note.objects.some(obj => obj.id === updatedObject.id);
          if (hasObject) {
            updatedCount++;
            console.log(`[SOCKET] Updating object in note ${note.id}`);
            return {
              ...note,
              objects: note.objects.map(obj => {
                if (obj.id === updatedObject.id) {
                  console.log(`[SOCKET] Object progress updated from`, obj.metadata?.user?.progress, 'to', updatedObject.metadata?.user?.progress);
                  return updatedObject;
                }
                return obj;
              })
            };
          }
        }
        return note;
      });
      console.log(`[SOCKET] Updated ${updatedCount} notes with object ${updatedObject.id}`);
      return updated;
    };

    // Update in both notes and searchResults
    setNotes(prev => updateNotesWithObject(prev));
    if (searchModeRef.current) {
      setSearchResults(prev => updateNotesWithObject(prev));
    }
  }, []);

  const handleSocketNoteTagChange = useCallback(async (data) => {
    // Skip socket updates if we're in the middle of a manual refresh
    if (manualRefreshInProgressRef.current) {
      console.log('[SOCKET] Ignoring tag change during manual refresh');
      return;
    }
  
    console.log('[SOCKET] Received tag change:', data);
    const noteId = data?.note_id || data?.noteId;
    if (!noteId) return;

    // Optimistically update UI first if tags are included
    if (data.tags && Array.isArray(data.tags)) {
      setNoteTags(prev => ({ ...prev, [noteId]: data.tags }));

      // First, find the note in our state
      let noteToUpdate;
      if (searchModeRef.current) {
        noteToUpdate = searchResultsRef.current.find(n => n.id === noteId);
      } else {
        noteToUpdate = notesRef.current.find(n => n.id === noteId);
      }

      // If we found the note, update it with new tags
      if (noteToUpdate) {
        const updatedNote = {
          ...noteToUpdate,
          tagsUpdated: Date.now(),
          tags: data.tags
        };

        // SEARCH MODE HANDLING: Update the note in search results
        // NOTE: We do NOT remove notes from search results based on client-side matching
        // because the server's full-text search has access to complete content while
        // we only have truncated content (520 chars). Tag changes don't affect text
        // content, so if a note was in the results before, it should stay.
        // However, we CAN add notes that now match (e.g., tag-based searches).
        if (searchModeRef.current) {
          const noteMatchesSearch = doesNoteMatchSearchQuery(updatedNote, searchQueryRef.current);

          setSearchResults(prevResults => {
            const index = prevResults.findIndex(n => n.id === noteId);

            // Case 1: Note is in search results - always update it (don't remove)
            if (index !== -1) {
              console.log(`[SOCKET - Tag Change] Updating note ${noteId} within search results.`);
              const newList = [...prevResults];
              newList[index] = updatedNote;
              return newList;
            }
            // Case 2: Note is not in search results but now matches (e.g., tag-based search)
            else if (noteMatchesSearch) {
              console.log(`[SOCKET - Tag Change] Note ${noteId} now matches search criteria for "${searchQueryRef.current}" after tag change, adding to results`);
              return [updatedNote, ...prevResults];
            }

            // Case 3: Note is not in results and doesn't match criteria - do nothing
            return prevResults;
          });
        }

        // Update in the main notes list
        _updateOrRemoveNoteInState(noteId, prevNote => ({
          ...prevNote,
          tagsUpdated: Date.now(),
          tags: data.tags
        }));
      }
      // If we didn't find the note, it may be a note that should now appear in search results
      else if (searchModeRef.current) {
        // Try to fetch the full note to determine if it should be added to search results
        notesApi.getNoteById(noteId)
          .then(response => {
            const fetchedNote = response?.note || response;
            if (fetchedNote) {
              // Add the tags we just received
              fetchedNote.tags = data.tags;

              // Check if it matches search - use this for ADDING notes only
              const noteMatchesSearch = doesNoteMatchSearchQuery(fetchedNote, searchQueryRef.current);

              setSearchResults(prev => {
                // Check if note already exists in results
                const noteExists = prev.some(n => n.id === noteId);

                // If note exists, always update it (don't remove based on client-side matching)
                if (noteExists) {
                  console.log(`[SOCKET - Tag Change] Note ${noteId} already exists in search results, updating it`);
                  return prev.map(n => n.id === noteId ? fetchedNote : n);
                }
                // If note doesn't exist but now matches search, add it
                else if (noteMatchesSearch) {
                  console.log(`[SOCKET - Tag Change] Fetched note ${noteId} now matches search criteria for "${searchQueryRef.current}", adding to results`);
                  return [fetchedNote, ...prev];
                }
                // If note doesn't exist and doesn't match search, do nothing
                else {
                  return prev;
                }
              });
            }
          })
          .catch(err => console.error(`Error fetching note ${noteId} after tag change:`, err));
      }
    } else {
      // Queue this note for tag fetching later (after getNoteTags is defined)
      console.log(`Queueing tag fetch for note ${noteId}`);
      if (socketService.queueTagUpdate) {
        socketService.queueTagUpdate(noteId);
      }
      // Use existing tags if available
      setNoteTags(prev => ({ ...prev, [noteId]: prev[noteId] || [] }));
    }
  }, [_updateOrRemoveNoteInState, doesNoteMatchSearchQuery]);

  const handleSocketNoteImageChange = useCallback((data) => {
    // Skip socket updates if we're in the middle of a manual refresh
    if (manualRefreshInProgressRef.current) {
      console.log('[SOCKET] Ignoring image change during manual refresh');
      return;
    }
    
    console.log('[SOCKET] Received image change:', data);
    const noteId = data?.noteId;
    const imageId = data?.imageId;
    if (!noteId) return;

    // Update the note to remove the deleted image
    _updateOrRemoveNoteInState(noteId, prevNote => {
      if (!prevNote.images) return prevNote;
      
      return {
        ...prevNote,
        images: prevNote.images.filter(img => img.id !== imageId),
        imageUpdated: Date.now()
      };
    });
  }, [_updateOrRemoveNoteInState]);

  // Unified handler for tag updates forcing a refresh
  const handleSocketTagUpdated = useCallback((tag) => {
    // Skip socket updates if we're in the middle of a manual refresh
    if (manualRefreshInProgressRef.current) {
      console.log('[SOCKET] Ignoring tag_updated during manual refresh');
      return;
    }
    
    console.log('[SOCKET] Received tag_updated:', tag);
    if (searchModeRef.current && searchQueryRef.current) {
      handleSearch(searchQueryRef.current, true, false, null, false, true);
    }
  }, [handleSearch]);

  // Handler for bulk tag updates via socket
  const handleBulkTagsUpdated = useCallback(({ noteIds, tagId, action }) => {
    if (!Array.isArray(noteIds) || !tagId || !action) return;

    console.log(`[SOCKET] Received bulk_tags_updated: action=${action}, tagId=${tagId}, notes=${noteIds.length}`);

    // Find the tag object from the context
    const tagObject = allTagsFromContext.find(t => t.id === tagId);
    if (!tagObject) {
      console.warn(`[SOCKET] Tag object not found for id ${tagId}`);
      // Optionally trigger a full refresh if tag data might be stale
      // loadNotes(true);
      return;
    }

    const updateNoteTags = (prevNotes) => {
      let changed = false;
      const updatedNotes = prevNotes.map(note => {
        if (noteIds.includes(note.id)) {
          const currentTags = note.tags || [];
          let newTags;
          const tagExists = currentTags.some(t => t.id === tagId);

          if (action === 'add' && !tagExists) {
            newTags = [...currentTags, tagObject].sort((a, b) => a.name.localeCompare(b.name));
          } else if (action === 'remove' && tagExists) {
            newTags = currentTags.filter(t => t.id !== tagId);
          } else {
            // No change needed for this specific note's tags
            return note;
          }

          changed = true;
          // Create updated note with new tags
          const updatedNote = {
            ...note,
            tags: newTags,
            tagsUpdated: Date.now() // Force re-render of NoteCard
          };
          
          return updatedNote;
        }
        return note; // Return unchanged note
      });

      // Only update state if any notes were actually changed
      return changed ? updatedNotes : prevNotes;
    };

    // Update both main notes list and search results
    setNotes(updateNoteTags);
    if (searchModeRef.current) {
      setSearchResults(prevResults => {
        const updatedResults = updateNoteTags(prevResults);

        // NOTE: We intentionally do NOT filter notes from search results here.
        // The server's full-text search matched against complete content, but
        // the client only has truncated content (520 chars). Re-evaluating
        // search criteria with truncated content would incorrectly remove
        // notes that genuinely match the full search query.
        // Tag changes don't affect text content, so if a note matched the
        // search before the tag operation, it still matches after.

        return updatedResults;
      });
    }

  }, [allTagsFromContext, setNotes, setSearchResults, doesNoteMatchSearchQuery]); // Add dependencies

  // Callback for socket service to request a full data sync
  // Callback for socket service to request a full data sync
  const triggerFullSync = useCallback(() => {
    if (!syncInProgressRef.current) {
      console.log("Socket requested full sync. Refreshing notes.");
      syncInProgressRef.current = true;
      const finish = () => setTimeout(() => { syncInProgressRef.current = false; }, 1000);
      if (searchModeRef.current && searchQueryRef.current) {
        // In search mode: re-run the search so totalNotes reflects search results, not DB total
        handleSearch(searchQueryRef.current, true, false).finally(finish);
      } else {
        loadNotes(true, false, null, true).finally(finish);
      }
    } else {
      console.log("Full sync skipped: already in progress");
    }
  }, [loadNotes, handleSearch]);

  // --- Tag Management ---

  const getNoteTags = useCallback(async (noteId) => {
    try {
      console.log(`Fetching tags for note ${noteId}`);
      const response = await tagsApi.getNoteTags(noteId);
      const tags = response.tags || [];
      setNoteTags(prev => ({ ...prev, [noteId]: tags }));

      // Update note objects with new tags
      _updateOrRemoveNoteInState(noteId, prevNote => ({
        ...prevNote,
        tagsUpdated: Date.now(),
        tags
      }));

      return tags;
    } catch (err) {
      console.error(`Failed to get tags for note ${noteId}:`, err);
      setNoteTags(prev => ({ ...prev, [noteId]: [] }));
      return [];
    }
  }, [_updateOrRemoveNoteInState]);

  const addTagToNote = useCallback(async (noteId, tagId) => {
    try {
      const response = await tagsApi.addTagToNote(noteId, tagId);
      return response.tag;
    } catch (err) {
      console.error('Failed to add tag to note:', err);
      setError('Failed to add tag');
      return null;
    }
  }, []);

  const removeTagFromNote = useCallback(async (noteId, tagId) => {
    try {
      await tagsApi.removeTagFromNote(noteId, tagId);
      return true;
    } catch (err) {
      console.error('Failed to remove tag from note:', err);
      setError('Failed to remove tag');
      return false;
    }
  }, []);
  
  // Server State Synchronization - Update client state with complete notes from server
  const updateNotesFromServer = useCallback((serverNotes) => {
    if (!Array.isArray(serverNotes) || serverNotes.length === 0) {
      console.warn('[updateNotesFromServer] No valid notes provided to update');
      return;
    }
    
    console.log(`[updateNotesFromServer] Updating ${serverNotes.length} notes from server`);
    
    // Update main notes list
    setNotes(prevNotes => {
      let updatedNotes = [...prevNotes];
      let hasChanges = false;
      
      serverNotes.forEach(serverNote => {
        const index = updatedNotes.findIndex(note => note.id === serverNote.id);
        if (index !== -1) {
          updatedNotes[index] = serverNote;
          hasChanges = true;
        }
      });
      
      return hasChanges ? updatedNotes : prevNotes;
    });
    
    // Update noteTags cache if the notes have tags
    setNoteTags(prevNoteTags => {
      let updatedNoteTags = { ...prevNoteTags };
      let hasChanges = false;
      
      serverNotes.forEach(serverNote => {
        if (serverNote.tags && Array.isArray(serverNote.tags)) {
          updatedNoteTags[serverNote.id] = serverNote.tags;
          hasChanges = true;
        }
      });
      
      return hasChanges ? updatedNoteTags : prevNoteTags;
    });
    
    // Update search results if in search mode
    if (searchMode) {
      setSearchResults(prevResults => {
        let updatedResults = [...prevResults];
        let hasChanges = false;
        
        serverNotes.forEach(serverNote => {
          const index = updatedResults.findIndex(note => note.id === serverNote.id);
          if (index !== -1) {
            // Check if updated note still matches search criteria
            const noteMatchesSearch = doesNoteMatchSearchQuery(serverNote, searchQuery);
            if (noteMatchesSearch) {
              updatedResults[index] = serverNote;
              hasChanges = true;
            } else {
              // Note no longer matches search, remove it
              updatedResults = updatedResults.filter(note => note.id !== serverNote.id);
              hasChanges = true;
              console.log(`[updateNotesFromServer] Note ${serverNote.id} no longer matches search criteria, removed from results`);
            }
          }
        });
        
        return hasChanges ? updatedResults : prevResults;
      });
    }
  }, [searchMode, searchQuery, doesNoteMatchSearchQuery]);

  // Complete the tag fetching for socket tag changes that didn't include tag data
  const completeTagChangeUpdates = useCallback(async (noteId) => {
    if (!noteId) return;
    try {
      await getNoteTags(noteId);
    } catch (err) {
      console.error(`Failed to complete tag change update for note ${noteId}:`, err);
    }
  }, [getNoteTags]);

  // --- Note CRUD Operations ---

  const createNote = useCallback(async (noteData) => {
    const tempId = `temp-${Date.now()}`;
    const tempNote = {
      id: tempId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_pinned: false, is_archived: false, is_deleted: false, // Defaults
      ...noteData,
    };

    // Optimistic UI: Add temporary note and saving indicator
    if (view === 'main') { // Only add if view is main
      setNotes(prev => [tempNote, ...prev.filter(n => !n.id.toString().startsWith('temp-'))]);
    }
    setSavingNotes(prev => ({ ...prev, [tempId]: true }));

    try {
      const response = await notesApi.createNote(noteData);
      const newNote = response.note;
      console.log("Note created successfully:", newNote.id);

      // Auto-add or suggest current search tags if in a tags-only search mode
      const tagSearchSettings = getFeatureSettings(AUTO_TAG_FEATURES.TAG_SEARCH);
      if (searchMode && searchQuery) {
        const trimmedQuery = searchQuery.trim();
        const queryParts = trimmedQuery.split(/\s+/).filter(p => p);
        const isTagsOnlySearch = queryParts.length > 0 && queryParts.every(part => part.startsWith('#') && part.length > 1);

        if (isTagsOnlySearch) {
          const tagNames = queryParts.map(part => part.substring(1));

          const allMatchedTags = tagNames.map(name => {
            const resolvedId = resolvedTagIdsRef.current[name.toLowerCase()];
            if (resolvedId) {
              return allTagsFromContext.find(tag => tag.id === resolvedId);
            }
            return allTagsFromContext.find(tag => tag.name.toLowerCase() === name.toLowerCase());
          }).filter(Boolean);

          // Folders/subfolders are always auto-applied regardless of settings
          const folderTags = allMatchedTags.filter(t => t.is_folder);
          // Regular tags respect the Tag Search setting
          const regularTags = allMatchedTags.filter(t => !t.is_folder);

          const tagsToAutoApply = [
            ...folderTags,
            ...(tagSearchSettings.enabled && tagSearchSettings.mode === 'auto' ? regularTags : []),
          ];
          const tagsToSuggest = tagSearchSettings.enabled && tagSearchSettings.mode !== 'auto' ? regularTags : [];

          if (tagsToAutoApply.length > 0) {
            try {
              await Promise.all(tagsToAutoApply.map(tag => tagsApi.addTagToNote(newNote.id, tag.id)));

              const tagNamesForToast = tagsToAutoApply.map(t => t.name);
              setAutoTaggedTagName(tagNamesForToast.length > 1 ? tagNamesForToast.join(', #') : tagNamesForToast[0]);
              setShowAutoTagSuccess(true);
              setTimeout(() => setShowAutoTagSuccess(false), 2000);
            } catch (tagError) {
              console.error("Error auto-adding tags to new note:", tagError);
            }
          }

          if (tagsToSuggest.length > 0) {
              newNote.suggestedTags = tagsToSuggest.map(tag => ({
                id: tag.id,
                name: tag.name,
                featureId: AUTO_TAG_FEATURES.TAG_SEARCH
              }));
          }

          if (allMatchedTags.length === 0) {
            console.log("None of the searched tags were found in existing tags:", tagNames);
          }
        }
      }

      // Let socket event handle the final state update for consistency.
      // Remove saving indicator for temp ID (socket will add real note)
      setSavingNotes(prev => {
        const { [tempId]: _, ...rest } = prev;
        return rest;
      });
      // Remove the temp note - socket event will add the real note
      // Only remove temp, don't add the real note here to avoid duplicate state updates
      if (view === 'main') {
        setNotes(prevNotes => prevNotes.filter(n => n.id !== tempId));
      }

      // If in search mode, refresh just the count from server
      // (note might match search criteria, especially for tag searches where tags were auto-added)
      if (searchMode && searchQuery) {
        console.log("createNote: Refreshing search count");
        setTimeout(() => {
          refreshSearchCount(searchQuery);
        }, 200); // Slightly longer delay to ensure tags are added
      }

      return newNote; // Return the created note
    } catch (err) {
      console.error('Failed to create note:', err);
      setError('Failed to create note');
      // Clean up optimistic state on error
      setNotes(prev => prev.filter(n => n.id !== tempId));
      setSavingNotes(prev => {
        const { [tempId]: _, ...rest } = prev;
        return rest;
      });
      return null;
    }
  }, [view, searchMode, searchQuery, allTagsFromContext, refreshSearchCount, getFeatureSettings]);

  const updateNote = useCallback(async (id, noteData) => {
    console.log(`Updating note ${id}`, noteData);
    setSavingNotes(prev => ({ ...prev, [id]: true }));

    try {
      // Apply optimistic update
      _updateOrRemoveNoteInState(id, (prevNote) => ({
        ...prevNote,
        ...noteData,
        // Ensure flags are explicitly handled if not present in noteData
        is_pinned: noteData.is_pinned ?? prevNote.is_pinned,
        is_archived: noteData.is_archived ?? prevNote.is_archived,
        is_deleted: noteData.is_deleted ?? prevNote.is_deleted,
        // Preserve complex fields if not included in update
        images: noteData.images ?? prevNote.images ?? [],
        tags: noteData.tags ?? prevNote.tags ?? [],
        updated_at: new Date().toISOString()
      }));

      const response = await notesApi.updateNote(id, noteData);
      const confirmedNote = response?.note || response;

      if (!confirmedNote || !confirmedNote.id) {
        throw new Error("Invalid note data received from server after update.");
      }
      console.log(`[API Response] Update confirmed for note ${id}`);

      // Update state with confirmed data from server
      // If the note is deleted, remove it from state instead of updating it
      if (confirmedNote.is_deleted) {
        console.log(`[updateNote] Note ${id} is deleted, removing from state`);
        _updateOrRemoveNoteInState(id); // Remove by ID only

        // Remove from full notes cache
        removeFromCache(id);

        // Prefetch queue cleanup is now handled by the usePrefetch hook
      } else {
        _updateOrRemoveNoteInState(confirmedNote);
        // Update the cache immediately with the confirmed note data
        // This ensures that preview cards are updated even if the socket event is delayed
        updateNoteInCache(confirmedNote.id, confirmedNote);

        // Invalidate full notes cache for this note - it will be re-fetched with full content next time
        removeFromCache(id);

        // Prefetch queue cleanup is now handled by the usePrefetch hook
      }

      return confirmedNote;
    } catch (err) {
      console.error(`Error updating note ${id}:`, err);
      setError(`Failed to update note: ${err.message || 'Unknown error'}`);
      loadNotes(true); // Refresh on error
      throw err;
    } finally {
      setSavingNotes(prev => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
    }
  }, [_updateOrRemoveNoteInState, loadNotes, removeFromCache]);

  // --- Note Status Changes ---

  const togglePin = useCallback(async (id) => {
    // Check all possible locations for the note: notes list, search results, and opened note
    // Use refs to avoid adding state dependencies that would cause function recreation
    const note = notesRef.current.find(n => n.id === id) || 
                 searchResultsRef.current.find(n => n.id === id) || 
                 (openedNoteRef.current && openedNoteRef.current.id === id ? openedNoteRef.current : null);
    
    if (!note) return null; // Note not found

    const newPinStatus = !note.is_pinned;
    const optimisticUpdateData = {
      is_pinned: newPinStatus,
      // Add optimistic timestamps
      pinned_at: newPinStatus ? new Date().toISOString() : null,
      unpinned_at: !newPinStatus ? new Date().toISOString() : null,
    };

    return _executeOptimisticUpdate(
      id,
      optimisticUpdateData,
      () => notesApi.togglePinNote(id)
    );
  }, [_executeOptimisticUpdate]); // Removed notes, searchResults, openedNote - using refs instead

  const archiveNote = useCallback(async (id) => {
    // First, immediately remove note from UI state in any view
    _updateOrRemoveNoteInState(id);
    const wasInSearchMode = searchModeRef.current;
    const currentSearchQuery = searchQueryRef.current;
    
    try {
      // Block socket events for at least 1 second to prevent any racing
      manualRefreshInProgressRef.current = true;
      
      // Then update server
      await notesApi.archiveNote(id);
      
      // If in search mode, refresh just the count from server
      if (wasInSearchMode && currentSearchQuery) {
        console.log("archiveNote: Refreshing search count");
        setTimeout(() => {
          refreshSearchCount(currentSearchQuery);
        }, 100);
      }
      
      // Show success toast
      setOperationCount(1);
      setLastArchivedNoteIds([id]);
      setShowArchiveSuccess(true);

      // Keep the socket block active for a little longer after operation completes
      setTimeout(() => {
        manualRefreshInProgressRef.current = false;
        console.log("Released socket block after archive operation");
      }, 1000);
    } catch (err) {
      console.error('Failed to archive note:', err);
      setError('Failed to archive note');
      loadNotes(true); // Refresh on error to restore correct state
      // Make sure we release the block even on error
      manualRefreshInProgressRef.current = false;
    }
  }, [_updateOrRemoveNoteInState, loadNotes, refreshSearchCount]);

  const unarchiveNote = useCallback(async (id) => {
    // First, immediately remove note from UI state in any view
    _updateOrRemoveNoteInState(id);
    
    try {
      // Block socket events for at least 1 second to prevent any racing
      manualRefreshInProgressRef.current = true;
      
      // Then update server
      await notesApi.unarchiveNote(id);
      
      // Note: We don't need to loadNotes(true) anymore since _updateOrRemoveNoteInState
      // already removed the note from the UI. Doing a full refresh would replace
      // multiple pages of loaded notes with just page 1.
      
      // Show success toast
      setOperationCount(1);
      setShowUnarchiveSuccess(true);
      
      // Keep the socket block active for a little longer after operation completes
      setTimeout(() => {
        manualRefreshInProgressRef.current = false;
        console.log("Released socket block after unarchive operation");
      }, 1000);
    } catch (err) {
      console.error('Failed to unarchive note:', err);
      setError('Failed to unarchive note');
      loadNotes(true);
      // Make sure we release the block even on error
      manualRefreshInProgressRef.current = false;
    }
  }, [_updateOrRemoveNoteInState, loadNotes]);

  const trashNote = useCallback(async (id) => {
    try {
      // Block socket events for at least 1 second to prevent any racing
      manualRefreshInProgressRef.current = true;
      
      // Check if note is archived first
      const sourceList = searchModeRef.current ? searchResultsRef.current : notesRef.current;
      const noteFromState = sourceList.find(note => note.id === id);
      const trashedIndex = sourceList.findIndex(note => note.id === id);
      const wasInSearchMode = searchModeRef.current;
      const currentSearchQuery = searchQueryRef.current;
      
      // Optimistically update state first
      if (noteFromState) {
        // Mark as both unarchived and deleted so it's removed from current view
        _updateOrRemoveNoteInState(id, (currentNote) => ({
          ...currentNote,
          is_archived: false,
          is_deleted: true
        }));

        // If note is archived, unarchive it first then trash it
        if (noteFromState.is_archived) {
          console.log(`Note ${id} is archived, unarchiving it first before moving to trash`);
          await notesApi.unarchiveNote(id);
        }
      } else {
        // If we can't find the note in state, fall back to ID-only removal
        _updateOrRemoveNoteInState(id);
      }

      // Then move to trash
      await notesApi.trashNote(id);

      // If in search mode, refresh just the count from server
      if (wasInSearchMode && currentSearchQuery) {
        console.log("trashNote: Refreshing search count");
        setTimeout(() => {
          refreshSearchCount(currentSearchQuery);
        }, 100);
      }

      // Show success toast
      setOperationCount(1);
      setLastTrashedNoteIds([id]);
      lastTrashedNotesRef.current = noteFromState
        ? [{ note: noteFromState, index: trashedIndex }]
        : [];
      setShowTrashSuccess(true);

      // Keep the socket block active for a little longer after operation completes
      setTimeout(() => {
        manualRefreshInProgressRef.current = false;
        console.log("Released socket block after trash operation");
      }, 1000);
    } catch (err) {
      console.error('Failed to trash note:', err);
      setError('Failed to trash note');
      loadNotes(true);
      // Make sure we release the block even on error
      manualRefreshInProgressRef.current = false;
    }
  }, [_updateOrRemoveNoteInState, loadNotes, refreshSearchCount]);

  const restoreNote = useCallback(async (id) => {
    // First, immediately remove note from UI state in any view
    _updateOrRemoveNoteInState(id);
    
    try {
      // Block socket events for at least 1 second to prevent any racing
      manualRefreshInProgressRef.current = true;
      
      // Then update server
      await notesApi.restoreNote(id);
      
      // Note: We don't need to loadNotes(true) anymore since _updateOrRemoveNoteInState
      // already removed the note from the UI. Doing a full refresh would replace
      // multiple pages of loaded notes with just page 1.
      
      // Show success toast
      setOperationCount(1);
      setShowRestoreSuccess(true);
      
      // Keep the socket block active for a little longer after operation completes
      setTimeout(() => {
        manualRefreshInProgressRef.current = false;
        console.log("Released socket block after restore operation");
      }, 1000);
    } catch (err) {
      console.error('Failed to restore note:', err);
      setError('Failed to restore note');
      loadNotes(true);
      // Make sure we release the block even on error
      manualRefreshInProgressRef.current = false;
    }
  }, [_updateOrRemoveNoteInState, loadNotes]);

  const handleUndoArchive = useCallback(async () => {
    if (!lastArchivedNoteIds.length) return;
    const ids = lastArchivedNoteIds;
    setShowArchiveSuccess(false);
    try {
      manualRefreshInProgressRef.current = true;
      await notesApi.bulkUnarchiveNotes(ids);
      setTimeout(() => { manualRefreshInProgressRef.current = false; }, 500);
      if (searchModeRef.current && searchQueryRef.current) {
        handleSearch(searchQueryRef.current, true, false, null, false, true);
      } else {
        loadNotes(true);
      }
    } catch (err) {
      console.error('Failed to undo archive:', err);
      setError('Failed to undo archive');
      manualRefreshInProgressRef.current = false;
    }
  }, [lastArchivedNoteIds, loadNotes, handleSearch]);

  // Lets external callers (e.g. bulk trash in NoteSelectionContext) supply the
  // full note objects + their search-result indices so undo can restore in place.
  const captureTrashedNotesForUndo = useCallback((entries) => {
    lastTrashedNotesRef.current = Array.isArray(entries) ? entries : [];
  }, []);

  const handleUndoTrash = useCallback(async () => {
    if (!lastTrashedNoteIds.length) return;
    const ids = lastTrashedNoteIds;
    setShowTrashSuccess(false);
    try {
      manualRefreshInProgressRef.current = true;
      await notesApi.bulkRestoreNotes(ids);
      setTimeout(() => { manualRefreshInProgressRef.current = false; }, 500);
      if (searchModeRef.current && searchQueryRef.current) {
        const saved = lastTrashedNotesRef.current;
        const canRestoreLocally = saved.length > 0 &&
          saved.length === ids.length &&
          saved.every(entry => entry.note && ids.includes(entry.note.id));
        if (canRestoreLocally) {
          // Re-insert the trashed notes at their original positions instead of
          // refetching the whole search (which clears results and scrolls to top).
          setSearchResults(prev => {
            const next = prev.filter(n => !ids.includes(n.id));
            saved
              .slice()
              .sort((a, b) => a.index - b.index)
              .forEach(({ note, index }) => {
                const insertAt = Math.min(Math.max(index, 0), next.length);
                next.splice(insertAt, 0, note);
              });
            return next;
          });
          refreshSearchCount(searchQueryRef.current);
        } else {
          handleSearch(searchQueryRef.current, true, false, null, false, true);
        }
      } else {
        loadNotes(true);
      }
      lastTrashedNotesRef.current = [];
    } catch (err) {
      console.error('Failed to undo trash:', err);
      setError('Failed to undo trash');
      manualRefreshInProgressRef.current = false;
    }
  }, [lastTrashedNoteIds, loadNotes, handleSearch, refreshSearchCount]);

  const deleteNote = useCallback(async (id, suppressToast = false) => {
    // First, get the note to check if it's archived
    let isNoteArchived = false;
    
    // Check current view
    if (view === 'archive') {
      console.log(`Note ${id} is being deleted from archive view - sending to trash instead of deleting`);
      return trashNote(id);
    }
    
    // If not in archive view, check the note's actual archived status
    // This handles cases when a note is opened directly and we lose view context
    try {
      // Look in current notes first to avoid an API call
      const sourceList = searchModeRef.current ? searchResultsRef.current : notesRef.current;
      const noteFromState = sourceList.find(note => note.id === id);
      
      if (noteFromState) {
        isNoteArchived = noteFromState.is_archived;
      } else {
        // If not in state, fetch the note to check its status
        const noteDetails = await notesApi.getNoteById(id);
        if (noteDetails && (noteDetails.note || noteDetails)) {
          const note = noteDetails.note || noteDetails;
          isNoteArchived = note.is_archived;
        }
      }
      
      // If the note is archived, send to trash instead of deleting
      if (isNoteArchived) {
        console.log(`Note ${id} is archived - sending to trash instead of deleting`);
        return trashNote(id);
      }
    } catch (err) {
      console.error(`Error checking note status for ID ${id}:`, err);
      // Continue with deletion if check fails, as we're being cautious
    }
    
    // First, immediately remove note from UI state in any view
    _updateOrRemoveNoteInState(id);
    
    try {
      // Block socket events for at least 1 second to prevent any racing
      manualRefreshInProgressRef.current = true;
      
      // Then update server
      await notesApi.deleteNote(id);
      
      // Note: We don't need to loadNotes(true) anymore since _updateOrRemoveNoteInState
      // already removed the note from the UI. Doing a full refresh would replace
      // multiple pages of loaded notes with just page 1.
      
      // Show success toast (unless suppressed)
      if (!suppressToast) {
        setOperationCount(1);
        setShowDeleteSuccess(true);
      }
      
      // Keep the socket block active for a little longer after operation completes
      setTimeout(() => {
        manualRefreshInProgressRef.current = false;
        console.log("Released socket block after delete operation");
      }, 1000);
    } catch (err) {
      console.error('Failed to delete note permanently:', err);
      setError('Failed to delete note permanently');
      loadNotes(true);
      // Make sure we release the block even on error
      manualRefreshInProgressRef.current = false;
    }
  }, [_updateOrRemoveNoteInState, loadNotes, view, trashNote]);

  const changeNoteColor = useCallback(async (id, color) => {
    return _executeOptimisticUpdate(
      id,
      { color },
      () => notesApi.changeNoteColor(id, color)
    );
   }, [_executeOptimisticUpdate]);

  // --- Prefetch Functions ---
  // Note: Prefetch functions are provided by usePrefetch hook

  // Updated to accept an optional preloadedNote object
  const openNoteById = useCallback(async (id, preloadedNote = null) => {
    if (!id) return null;
    console.log("Opening note:", id, "Preloaded:", !!preloadedNote);

    // Consider current opened note to prevent re-fetching if already opened
    if (openedNoteRef.current && openedNoteRef.current.id === id && !preloadedNote) {
      // If it's the same note and not a preload, ensure it's fully loaded or just return
      if (!openedNoteRef.current.isLoading) {
        console.log(`Note ${id} is already open and loaded. Returning existing.`);
        return openedNoteRef.current;
      }
      console.log(`Note ${id} is already opening. Allowing process to continue.`);
    }

    // Check cache for full note data (unless preloadedNote is provided, which overrides cache)
    const cachedNote = fullNotesCacheRef.current[id];
    const cacheAge = cachedNote ? Date.now() - cachedNote.cachedAt : null;
    const isCacheValid = cachedNote && cacheAge < cacheSettingsRef.current.CACHE_TTL_MS;

    console.log(`[CACHE CHECK] Note ${id}: cachedNote exists=${!!cachedNote}, cacheAge=${cacheAge ? Math.round(cacheAge / 1000) + 's' : 'N/A'}, TTL=${cacheSettingsRef.current.CACHE_TTL_MS / 1000}s, isValid=${isCacheValid}, preloadedNote=${!!preloadedNote}`);

    if (isCacheValid && !preloadedNote) {
      console.log(`Note ${id} found in cache (age: ${Math.round(cacheAge / 1000)}s). Using cached data.`);

      // Update lastAccessed timestamp
      touchCacheEntry(id);

      const noteFromCache = { ...cachedNote, isLoading: false };
      delete noteFromCache.cachedAt; // Remove cache metadata before setting
      delete noteFromCache.lastAccessed;
      // Only update openedNote if it's different to avoid unnecessary re-renders
      if (openedNoteRef.current?.id !== id) {
        console.log(`[openNoteById] Setting openedNote from cache (ID changed: ${openedNoteRef.current?.id} → ${id})`);
        setOpenedNote(noteFromCache);
      } else {
        console.log(`[openNoteById] Note ${id} already opened, skipping setOpenedNote to avoid re-render`);
      }
      return noteFromCache;
    }

    manualRefreshInProgressRef.current = true; // Temporarily block socket-driven list updates

    // Try to find the note in the current list to get basic properties like color
    // This avoids showing default color shell before switching to actual color
    const notesList = searchModeRef.current ? searchResultsRef.current : notesRef.current;
    const noteFromList = notesList.find(n => n.id === id);

    // Define a default shell structure, using properties from list if available
    // This provides instant visual feedback with correct styling while full content loads
    let shellNoteForOpen = {
      id,
      title: noteFromList?.title || '',
      content: '', // Keep content empty to avoid showing truncated text
      color: noteFromList?.color || 'default', // Use color from list to avoid visual flash
      isLoading: true,
      created_at: noteFromList?.created_at || new Date().toISOString(),
      updated_at: noteFromList?.updated_at || new Date().toISOString(),
      is_pinned: noteFromList?.is_pinned || false,
      is_archived: noteFromList?.is_archived || false,
      is_deleted: noteFromList?.is_deleted || false,
      tags: noteFromList?.tags || [],
      images: []
    };

    console.log(`[SHELL NOTE] Created shell for note ${id} with color: ${shellNoteForOpen.color}, title: "${shellNoteForOpen.title?.substring(0, 30)}..." (from list: ${!!noteFromList})`);

    try {
      // Don't use preloaded or existing state for shell to avoid truncated content
      // Keep the shell minimal - only basic structure without content
      console.log(`Setting openedNote (shell) for ${id} - using empty shell to prevent truncated content`);
      setOpenedNote(shellNoteForOpen);
      setNoteDetailLoading(true); // Indicate loading for this specific note open operation

      console.log(`Fetching full details via API for note ${id}.`);
      const response = await notesApi.getNoteById(id);
      const fetchedNote = response?.note || response;

      if (fetchedNote && fetchedNote.id) {
        console.log(`API fetch complete for ${id}, updating openedNote with full data.`);

        // Store in cache using helper (includes LRU eviction)
        addToCache(id, fetchedNote);

        setOpenedNote({ ...fetchedNote, isLoading: false });
        // setNoteDetailLoading(false); // This will be handled in finally
        return fetchedNote;
      } else {
        console.error(`Note ${id} not found or invalid API response.`);
        throw new Error("Note not found or invalid API response");
      }
    } catch (error) {
      console.error(`Failed to fetch or process note ${id}:`, error);
      // Update state to reflect the error, keep existing shell data if possible
      setOpenedNote(prev => ({
        ...(prev && prev.id === id ? prev : shellNoteForOpen), // Use current prev if it's for this note, else the shell
        isLoading: false,
        error: `Failed to load note. It might have been moved or deleted.`
      }));
      setError(`Failed to load note ${id}.`); // Set global error
      // setNoteDetailLoading(false); // This will be handled in finally
      return { ...shellNoteForOpen, isLoading: false, error: `Failed to load note.` }; // Return shell with error
    } finally {
      setNoteDetailLoading(false); // Ensure note detail loading is always turned off
      setTimeout(() => {
        manualRefreshInProgressRef.current = false;
        console.log(`Released socket block for openNoteById ${id}`);
      }, 100); // Small delay to allow React to batch state updates
    }
  }, [setOpenedNote, setNoteDetailLoading, setError, openedNoteRef, touchCacheEntry, addToCache]);

  // --- Effects to update refs ---
  useEffect(() => { searchModeRef.current = searchMode; }, [searchMode]);
  useEffect(() => { searchResultsRef.current = searchResults; }, [searchResults]);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { openedNoteRef.current = openedNote; if(openedNote?.id) console.log("[NotesContext] openedNote changed:", openedNote.id); }, [openedNote]); // Update openedNote ref
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { searchQueryRef.current = searchQuery; }, [searchQuery]);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { openNoteByIdRef.current = openNoteById; }, [openNoteById]); // Update openNoteById ref to avoid circular dependency

  // Clear any queued (not-yet-started) viewport prefetches on view change.
  // In-flight requests finish normally — they're cheap and likely useful.
  useEffect(() => {
    return () => {
      cancelPendingPrefetches();
    };
  }, [view, cancelPendingPrefetches]);

  // --- Search Triggers ---
  // These close the note and search - used when clicking tags/books/colors from within notes
  
  const registerTagId = useCallback((tagId, tagName) => {
    if (tagId && tagName) {
      const updated = { ...resolvedTagIdsRef.current, [tagName.toLowerCase()]: tagId };
      resolvedTagIdsRef.current = updated;
      setResolvedTagIds(updated);
    }
  }, []);

  const searchByTag = useCallback((tagId, tagName, options = {}) => {
    console.log('[NotesContext.searchByTag] Called with:', tagName, 'options:', options);
    registerTagId(tagId, tagName);
    setSearchBarActive(true);
    const targetQuery = `#${tagName}`;
    // If already searching this exact query, the URL won't change so NavigationContext
    // won't trigger handleSearch — call it directly instead
    if (searchModeRef.current && searchQueryRef.current === targetQuery) {
      handleSearch(targetQuery, true, false);
    } else {
      navigateToSearchFromContext(targetQuery, { replaceHistory: false, ...options });
    }
  }, [navigateToSearchFromContext, registerTagId, handleSearch]);

  const searchByColor = useCallback((colorName, options = {}) => {
    setSearchBarActive(true);
    // Use NavigationContext to navigate to search, push to history so back button works
    // preserveNoteOnSearch can be overridden by caller (e.g., false for mobile list view)
    navigateToSearchFromContext(`$${colorName}`, { replaceHistory: false, ...options });
  }, [navigateToSearchFromContext]);

  const searchByBook = useCallback((bookTitle, options = {}) => {
    setSearchBarActive(true);
    // Use NavigationContext to navigate to search, push to history so back button works
    // preserveNoteOnSearch can be overridden by caller (e.g., false for mobile list view)
    navigateToSearchFromContext(`{${bookTitle}}`, { replaceHistory: false, ...options });
  }, [navigateToSearchFromContext]);
  
  // --- Sorting ---

  // Unified sort function
  const changeSortOption = useCallback((sortOption) => {
    const currentView = searchMode ? 'search' : view;
    console.log(`Changing sort for ${currentView} to: ${sortOption}`);
    
    // Update the sort in SortingContext
    setSortForView(currentView, sortOption);
    
    // Reset pagination and reload/research
    setPage(1);
    setHasMore(true);
    setListLoading(true);
    
    if (searchMode && searchQuery) {
      // If in search mode, trigger a new search with the updated sort
      setSearchResults([]);
      handleSearch(searchQuery, true, false, sortOption);
    } else {
      // If in main/archive/trash view, reload notes
      setNotes([]);
      loadNotes(true, false, sortOption);
    }
  }, [view, searchMode, searchQuery, setSortForView, loadNotes, handleSearch]);

  // Legacy functions for backward compatibility (they now use the unified system)
  const setSortNewest = useCallback(() => changeSortOption(SORT_OPTIONS.CREATED_DESC), [changeSortOption]);
  const setSortOldest = useCallback(() => changeSortOption(SORT_OPTIONS.CREATED_ASC), [changeSortOption]);
  const toggleSortOrder = useCallback(() => {
    const currentSort = getSortForView(view);
    const newSort = currentSort === SORT_OPTIONS.CREATED_DESC ? SORT_OPTIONS.CREATED_ASC : SORT_OPTIONS.CREATED_DESC;
    changeSortOption(newSort);
  }, [changeSortOption, getSortForView, view]);

  // --- Socket Connection Effect ---
  // Use refs to keep track of connection state and handlers
  const socketListenersSetupRef = useRef(false);
  const handlersRef = useRef({});
  
  // Set up the handlers
  useEffect(() => {
    handlersRef.current = {
      'note_created': handleSocketNoteCreated,
      'note_updated': handleSocketNoteUpdated,
      'note_deleted': handleSocketNoteDeleted,
      'object_updated': handleSocketObjectUpdated,
      'note_tag_updated': handleSocketNoteTagChange,
      'note_tags_changes': handleSocketNoteTagChange,
      'note_tags_updated': handleSocketNoteTagChange,
      'note_image_added': handleSocketNoteImageChange,
      'note_image_deleted': handleSocketNoteImageChange,
      'tag_updated': handleSocketTagUpdated,
      'bulk_tags_updated': handleBulkTagsUpdated, // Add the new handler
      'note_operation': (data) => console.log('[SOCKET] Note Operation:', data),
    };
  }, [handleSocketNoteCreated, handleSocketNoteUpdated, handleSocketNoteDeleted,
      handleSocketObjectUpdated, handleSocketNoteTagChange, handleSocketNoteImageChange,
      handleSocketTagUpdated, handleBulkTagsUpdated]);
      
  // Set up effect to handle pending tag changes after getNoteTags is defined
  useEffect(() => {
    const pendingTagUpdates = [];
    
    // Add a method to socket service to queue pending tag updates
    socketService.queueTagUpdate = (noteId) => {
      if (noteId && !pendingTagUpdates.includes(noteId)) {
        pendingTagUpdates.push(noteId);
      }
    };
    
    // Process any pending tag updates periodically
    const intervalId = setInterval(() => {
      if (pendingTagUpdates.length > 0) {
        const noteId = pendingTagUpdates.shift();
        completeTagChangeUpdates(noteId);
      }
    }, 500);
    
    return () => {
      clearInterval(intervalId);
      delete socketService.queueTagUpdate;
    };
  }, [completeTagChangeUpdates]);
  
  // Connect to socket on mount
  useEffect(() => {
    if (!socketService.socket || !socketService.socket.connected) {
      console.log("NotesContext: Socket not connected. Connecting now...");
      socketService.connect();
    }
    return () => {}; // Empty cleanup
  }, []);
  
  // Set up socket listeners
  useEffect(() => {
    // The socketListenersSetupRef is removed as React's dependency array handles re-execution.
    console.log("NotesContext: Setting up/updating socket listeners.");
    socketService.registerSyncNeededCallback(triggerFullSync);

    // Capture the current set of handlers at the time this effect runs.
    // handlersRef.current is updated by another useEffect when any individual handler changes.
    const currentHandlersSnapshot = handlersRef.current;

    // Register all event handlers from the snapshot
    Object.entries(currentHandlersSnapshot).forEach(([event, handler]) => {
      socketService.on(event, handler);
    });

    // Cleanup function
    return () => {
      console.log("NotesContext: Cleaning up socket listeners.");
      // Unregister all event handlers using the same snapshot from when they were registered
      Object.entries(currentHandlersSnapshot).forEach(([event, handler]) => {
        socketService.off(event, handler);
      });
      // Unregister the sync callback
      socketService.registerSyncNeededCallback(null);
    };
  }, [
    triggerFullSync,
    // Add all handler functions that are placed into handlersRef.current as dependencies.
    // This ensures the effect re-runs if any handler instance changes.
    handleSocketNoteCreated,
    handleSocketNoteUpdated,
    handleSocketNoteDeleted,
    handleSocketNoteTagChange, // This handles note_tag_updated, note_tags_changes, note_tags_updated
    handleSocketNoteImageChange, // This handles note_image_added, note_image_deleted
    handleSocketTagUpdated,
    handleBulkTagsUpdated
    // The anonymous handler for 'note_operation' is stable if defined inline without dependencies,
    // but if it were a useCallback with its own deps, it would also be listed here.
  ]);
  
  // --- Enhanced UI Preference Functions ---
  
  // Enhanced changeLayoutView that uses UIPreferences but handles overview logic
  const enhancedChangeLayoutView = useCallback((newView) => {
    if (layoutView === newView || !['grid', 'stacked', 'list', 'overview'].includes(newView)) return;

    const switchingFromOverview = layoutView === 'overview' && newView !== 'overview';

    if (switchingFromOverview) {
      // Reset state before changing layout
      setNotes([]);
      setPage(1);
      setHasMore(true);
      setListLoading(true);
    }

    // Use the UIPreferences function to update the layout
    changeLayoutView(newView);

    if (switchingFromOverview) {
      loadNotes(true);
    }
  }, [layoutView, changeLayoutView, loadNotes]);
  
  // --- Initial Load Effect ---
  // Effect to trigger initial load when view or sort order changes
  useEffect(() => {
    // Check if there's a search query in the URL - if so, let the Search Sync Effect handle it
    const params = new URLSearchParams(window.location.search);
    const queryFromUrl = params.get('q');
    
    if (queryFromUrl && queryFromUrl.trim()) {
      console.log(`Initial Load Effect: URL has search query '${queryFromUrl}', skipping initial load - Search Sync Effect will handle it.`);
      // Still reset state but don't load notes - search will populate results
      setNotes([]);
      setPage(1);
      setHasMore(true);
      setListLoading(true);
      setError(null);
      return;
    }
    
    console.log(`Initial Load Effect: View or sort order changed to: ${view}, mainSort=${mainViewSortOption}. Triggering initial load.`);
    // Reset state and load notes for the current view
    setNotes([]);
    setPage(1);
    setHasMore(true);
    setListLoading(true);
    setError(null);
    
    // Load notes with current sort order
    loadNotes(true);
  }, [view, mainViewSortOption]); // Use mainViewSortOption instead of currentSortOption

  // --- Derived Data & Filtering ---
  
  // Helper functions for grouping notes
  const getPinnedNotes = useCallback(() => {
    return notes.filter(note => note.is_pinned);
  }, [notes]);

  const getUnpinnedNotes = useCallback(() => {
    return notes.filter(note => !note.is_pinned);
  }, [notes]);
  
  // Client-side filtering by hidden tags - using stable result hook
  const filteredNotes = useStableArrayResult(() => { // Use the new hook
    const sourceNotes = searchMode ? searchResults : notes;

    // Apply hidden tag filtering ONLY if not in search mode, hidden tags exist, AND we are in the main view
    // We do NOT want to filter hidden notes in Archive or Trash views
    if (!searchMode && view === 'main' && hiddenTagIds.size > 0) {
      const filtered = sourceNotes.filter(note => {
        // Ensure noteTags[note.id] exists or use note.tags as fallback
        const tagsForNote = noteTags[note.id] || note.tags || [];
        const hasHiddenTag = tagsForNote.some(tag => hiddenTagIds.has(tag.id));
        if (hasHiddenTag) {
          // If note is pinned, we keep it even if it has hidden tags
          if (note.is_pinned) {
             return true;
          }
        }
        // Keep note if it has NO hidden tags
        return !hasHiddenTag;
      });
      return filtered;
    }

    // If no filtering needed, return the source array directly
    return sourceNotes;
  }, [searchMode, searchResults, notes, hiddenTagIds, noteTags, view]); // Dependencies remain the same

  // Separate pinned/unpinned notes from the *filtered* list for display
  // --- Updated Pinned Notes Sorting ---
  const pinnedNotes = useMemo(() => {
    return filteredNotes
      .filter(note => note.is_pinned)
      .sort((a, b) => {
        // Sort by pinned_at descending (nulls last)
        // Treat null pinned_at as older than any date for sorting purposes
        const pinnedA = a.pinned_at ? new Date(a.pinned_at).getTime() : -Infinity;
        const pinnedB = b.pinned_at ? new Date(b.pinned_at).getTime() : -Infinity;
        // If pinned times differ, sort by pinned time descending
        if (pinnedA !== pinnedB) return pinnedB - pinnedA;

        // Fallback 1: updated_at descending
        const updatedA = new Date(a.updated_at).getTime();
        const updatedB = new Date(b.updated_at).getTime();
        if (updatedA !== updatedB) return updatedB - updatedA;

        // Fallback 2: created_at descending
        const createdA = new Date(a.created_at).getTime();
        const createdB = new Date(b.created_at).getTime();
        return createdB - createdA;
      });
  }, [filteredNotes]); // Keep dependency on filteredNotes

  // Unpinned notes inherit the sort order from the main list (controlled by unified sort system)
  const unpinnedNotes = useMemo(() => filteredNotes.filter(note => !note.is_pinned), [filteredNotes]);

  // --- Context Value ---
  const contextValue = useMemo(() => ({
    // Core Data & State
    notes: filteredNotes,
    pinnedNotes,
    unpinnedNotes,
    allNotesUnfiltered: searchMode ? searchResults : notes,
    error,
    totalNotes,
    searchCountQuery,
    view,
    noteTags,

    // Toast setters (stable refs; toast *values* are read by the provider's own
    // SuccessToast JSX, not by consumers — keeping them out of the value avoids
    // re-rendering every useNotes() consumer on each toast toggle).
    setShowAutoTagSuccess,
    setAutoTaggedTagName,
    setShowArchiveSuccess,
    setShowUnarchiveSuccess,
    setShowTrashSuccess,
    setShowRestoreSuccess,
    setShowDeleteSuccess,
    setShowHiddenSuccess,
    setOperationCount,
    setLastArchivedNoteIds,
    setLastTrashedNoteIds,
    captureTrashedNotesForUndo,

    // Pagination & Loading
    hasMore,
    loadNotes,

    // Search
    searchMode,
    searchQuery,
    searchResults,
    searchBarActive,
    handleSearch,
    loadMoreSearchResults,
    registerTagId,
    resolvedTagIds,
    searchByTag,
    searchByColor,
    searchByBook,
    searchById,
    getReferenceCount,
    refreshSearchCount,
    savedSearches,
    saveSearch,
    removeSavedSearch,

    // Sorting (unified system)
    changeSortOption,
    getSortForView,
    getAvailableSortsForView,
    SORT_LABELS,
    
    // Legacy sorting functions (for backward compatibility)
    toggleSortOrder,
    setSortNewest,
    setSortOldest,

    // Note Actions
    createNote,
    updateNote,
    togglePin,
    archiveNote,
    unarchiveNote,
    trashNote,
    restoreNote,
    deleteNote,
    changeNoteColor,
    getPinnedNotes,
    getUnpinnedNotes,

    // Tag Actions
    getNoteTags,
    addTagToNote,
    removeTagFromNote,

    // Server State Synchronization
    updateNotesFromServer,

    // Note Opening/Closing
    openedNote,
    openNoteById,
    closeNoteWithoutUrlUpdate,

    // Selection & Bulk Actions - moved to NoteSelectionContext
    // selectedNoteIds, toggleNoteSelection, clearSelection,
    // archiveSelectedNotes, unarchiveSelectedNotes, trashSelectedNotes,
    // restoreSelectedNotes, deleteForeverSelectedNotes, changeColorSelectedNotes,
    // bulkAddTagToNotes, bulkRemoveTagFromNotes,

    // UI Preferences & View Management
    handleViewChange, // Internal function called by NavigationBridge when URL changes
    layoutView,
    toggleLayoutView,
    changeLayoutView: enhancedChangeLayoutView, // Use enhanced version
    showQuickAccess,
    toggleQuickAccess,
    showMonthMarkers,
    toggleMonthMarkers,
    showNoteTabs,
    toggleNoteTabs,

    // Tag Visibility Filtering
    hiddenTagIds,
    // setHiddenTagIds removed - managed by TagsContext

    // Internal State Setters (use with caution)
    setSearchResults,
    setSearchQuery,
    setSearchBarActive,
    setError,
    _updateOrRemoveNoteInState,

    // Cache settings reload
    reloadCacheSettings: reloadSettings,

    // Per-note prefetch-status subscription (for UI indicator)
    subscribeToCacheStatus,
    getNoteCacheStatus,

    // Viewport-triggered single-note prefetch + tuning
    prefetchNoteToCache,
    getViewportPrefetchDelay
  }), [
    // Dependencies for the context value memoization
    filteredNotes, pinnedNotes, unpinnedNotes, notes, error, totalNotes, searchCountQuery, view, noteTags, hasMore,
    searchMode, searchQuery, searchResults, searchBarActive, savedSearches,
    getSortForView, getAvailableSortsForView, SORT_LABELS,
    openedNote,
    layoutView, showQuickAccess, showMonthMarkers, showNoteTabs, hiddenTagIds,
    // Toast values intentionally excluded — only the provider's own JSX reads them.
    // Include all functions
    loadNotes, handleSearch, loadMoreSearchResults, searchByTag, searchByColor, searchByBook, searchById, getReferenceCount, refreshSearchCount, saveSearch, removeSavedSearch,
    changeSortOption, toggleSortOrder, setSortNewest, setSortOldest, createNote, updateNote, togglePin, archiveNote, unarchiveNote, trashNote, restoreNote, deleteNote, changeNoteColor,
    getNoteTags, addTagToNote, removeTagFromNote, updateNotesFromServer, openNoteById, closeNoteWithoutUrlUpdate,
    handleViewChange, toggleLayoutView, enhancedChangeLayoutView, toggleQuickAccess, toggleMonthMarkers, toggleNoteTabs, setSearchBarActive, setError, _updateOrRemoveNoteInState,
    reloadSettings,
    subscribeToCacheStatus, getNoteCacheStatus, prefetchNoteToCache, getViewportPrefetchDelay
  ]);

  // Separate loading-state context value — toggling listLoading must not
  // invalidate contextValue above (which would re-render every note).
  const loadingValue = useMemo(() => ({ listLoading }), [listLoading]);

  // --- Render Provider ---
  return (
    <>
      <SuccessToast
        message={`Tag #${autoTaggedTagName} added to note`}
        isVisible={showAutoTagSuccess}
        onHide={() => setShowAutoTagSuccess(false)}
      />
      <SuccessToast
        message={operationCount === 1 ? "Note archived" : `${operationCount} notes archived`}
        isVisible={showArchiveSuccess}
        onHide={() => setShowArchiveSuccess(false)}
        onUndo={handleUndoArchive}
      />
      <SuccessToast
        message={operationCount === 1 ? "Note unarchived" : `${operationCount} notes unarchived`}
        isVisible={showUnarchiveSuccess}
        onHide={() => setShowUnarchiveSuccess(false)}
      />
      <SuccessToast
        message={operationCount === 1 ? "Note moved to trash" : `${operationCount} notes moved to trash`}
        isVisible={showTrashSuccess}
        onHide={() => setShowTrashSuccess(false)}
        onUndo={handleUndoTrash}
      />
      <SuccessToast
        message={operationCount === 1 ? "Note restored" : `${operationCount} notes restored`}
        isVisible={showRestoreSuccess}
        onHide={() => setShowRestoreSuccess(false)}
      />
      <SuccessToast
        message={operationCount === 1 ? "Note deleted permanently" : `${operationCount} notes deleted permanently`}
        isVisible={showDeleteSuccess}
        onHide={() => setShowDeleteSuccess(false)}
      />
      <SuccessToast
        message={operationCount === 1 ? "Note hidden from view" : `${operationCount} notes hidden from view`}
        isVisible={showHiddenSuccess}
        onHide={() => setShowHiddenSuccess(false)}
      />
      <NotesContext.Provider value={contextValue}>
        <NotesLoadingContext.Provider value={loadingValue}>
          {children}
        </NotesLoadingContext.Provider>
      </NotesContext.Provider>
    </>
  );
};
