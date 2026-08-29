import React, { createContext, useContext, useState, useCallback } from 'react';

const SortingContext = createContext();

export const useSorting = () => useContext(SortingContext);

/**
 * Unified sorting system for all views (main, archive, trash, search).
 *
 * The option strings below are the canonical sort vocabulary: they are sent to
 * the API unchanged (GET /notes `sort`, GET /notes/search `sortOrder`) and the
 * server maps them to ORDER BY specs. The per-view choice is persisted in
 * localStorage and validated against the view's available options on load.
 */

const SORT_OPTIONS = {
  CREATED_DESC: 'created_desc',
  CREATED_ASC: 'created_asc',
  UPDATED_DESC: 'updated_desc',
  ARCHIVED_DESC: 'archived_desc',
  TRASHED_DESC: 'trashed_desc'
};

const SORT_LABELS = {
  [SORT_OPTIONS.CREATED_DESC]: 'Newest',
  [SORT_OPTIONS.CREATED_ASC]: 'Oldest',
  [SORT_OPTIONS.UPDATED_DESC]: 'Recently Updated',
  [SORT_OPTIONS.ARCHIVED_DESC]: 'Recently Archived',
  [SORT_OPTIONS.TRASHED_DESC]: 'Recently Trashed'
};

const VIEW_DEFAULT_SORTS = {
  main: SORT_OPTIONS.CREATED_DESC,
  archive: SORT_OPTIONS.ARCHIVED_DESC,
  trash: SORT_OPTIONS.TRASHED_DESC,
  search: SORT_OPTIONS.CREATED_DESC
};

const VIEW_AVAILABLE_SORTS = {
  main: [SORT_OPTIONS.CREATED_DESC, SORT_OPTIONS.UPDATED_DESC, SORT_OPTIONS.CREATED_ASC],
  archive: [SORT_OPTIONS.ARCHIVED_DESC, SORT_OPTIONS.CREATED_DESC, SORT_OPTIONS.CREATED_ASC],
  trash: [SORT_OPTIONS.TRASHED_DESC, SORT_OPTIONS.CREATED_DESC, SORT_OPTIONS.CREATED_ASC],
  search: [SORT_OPTIONS.CREATED_DESC, SORT_OPTIONS.UPDATED_DESC, SORT_OPTIONS.CREATED_ASC]
};

// True for the creation-date sorts — the only orders where grouping the list
// under month-of-creation headers makes sense.
const isCreatedSort = (sortOption) =>
  sortOption === SORT_OPTIONS.CREATED_DESC || sortOption === SORT_OPTIONS.CREATED_ASC;

const STORAGE_KEY = 'itsnotes_sort_prefs';

const loadStoredSorts = () => {
  const sorts = { ...VIEW_DEFAULT_SORTS };
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored && typeof stored === 'object') {
      for (const view of Object.keys(sorts)) {
        if ((VIEW_AVAILABLE_SORTS[view] || []).includes(stored[view])) {
          sorts[view] = stored[view];
        }
      }
    }
  } catch (e) {
    // Corrupt or unavailable storage — fall back to defaults.
  }
  return sorts;
};

export const SortingProvider = ({ children }) => {
  const [currentSort, setCurrentSort] = useState(loadStoredSorts);

  // Get current sort for a view
  const getSortForView = useCallback((view) => {
    const currentSortForView = currentSort[view] || VIEW_DEFAULT_SORTS[view];
    const availableSorts = VIEW_AVAILABLE_SORTS[view] || [];

    // If the current sort is not available for this view, use the default
    if (!availableSorts.includes(currentSortForView)) {
      return VIEW_DEFAULT_SORTS[view];
    }

    return currentSortForView;
  }, [currentSort]);

  // Set sort for a specific view (persisted)
  const setSortForView = useCallback((view, sortOption) => {
    const availableSorts = VIEW_AVAILABLE_SORTS[view] || [];

    if (availableSorts.includes(sortOption)) {
      setCurrentSort(prev => {
        const next = { ...prev, [view]: sortOption };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch (e) {
          // Storage full/unavailable — the in-memory choice still applies.
        }
        return next;
      });
    } else {
      console.warn(`Sort option ${sortOption} is not available for view ${view}. Available options:`, availableSorts);
    }
  }, []);

  // Get available sort options for a view
  const getAvailableSortsForView = useCallback((view) => {
    return VIEW_AVAILABLE_SORTS[view] || [];
  }, []);

  const contextValue = {
    // Constants
    SORT_OPTIONS,
    SORT_LABELS,
    VIEW_DEFAULT_SORTS,
    VIEW_AVAILABLE_SORTS,

    // State
    currentSort,

    // Functions
    getSortForView,
    setSortForView,
    getAvailableSortsForView,
    isCreatedSort
  };

  return (
    <SortingContext.Provider value={contextValue}>
      {children}
    </SortingContext.Provider>
  );
};

export { SORT_OPTIONS, isCreatedSort };
