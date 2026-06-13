import React, { createContext, useContext, useState, useCallback } from 'react';

const SortingContext = createContext();

export const useSorting = () => useContext(SortingContext);

/**
 * Unified sorting system for all views (main, archive, trash, search)
 * 
 * Sort Options:
 * - created_desc: Created Latest (default for main view)
 * - created_asc: Created Oldest
 * - archived_desc: Archived Latest (default for archive view)
 * - trashed_desc: Trashed Latest (default for trash view)  
 * - updated_desc: Updated Latest (default for search)
 * - updated_asc: Updated Oldest
 */

const SORT_OPTIONS = {
  // Main view options
  CREATED_DESC: 'created_desc',
  CREATED_ASC: 'created_asc',
  
  // Archive view options
  ARCHIVED_DESC: 'archived_desc',
  
  // Trash view options
  TRASHED_DESC: 'trashed_desc',
  
  // Search view options
  UPDATED_DESC: 'updated_desc',
  UPDATED_ASC: 'updated_asc'
};

const SORT_LABELS = {
  [SORT_OPTIONS.CREATED_DESC]: 'Newest',
  [SORT_OPTIONS.CREATED_ASC]: 'Oldest',
  [SORT_OPTIONS.ARCHIVED_DESC]: 'Recently Archived',
  [SORT_OPTIONS.TRASHED_DESC]: 'Recently Trashed',
  [SORT_OPTIONS.UPDATED_DESC]: 'Recently Updated',
  [SORT_OPTIONS.UPDATED_ASC]: 'Oldest Updated'
};

const VIEW_DEFAULT_SORTS = {
  main: SORT_OPTIONS.CREATED_DESC,
  archive: SORT_OPTIONS.ARCHIVED_DESC,
  trash: SORT_OPTIONS.TRASHED_DESC,
  search: SORT_OPTIONS.CREATED_DESC
};

const VIEW_AVAILABLE_SORTS = {
  main: [SORT_OPTIONS.CREATED_DESC, SORT_OPTIONS.CREATED_ASC],
  archive: [SORT_OPTIONS.ARCHIVED_DESC, SORT_OPTIONS.CREATED_DESC, SORT_OPTIONS.CREATED_ASC],
  trash: [SORT_OPTIONS.TRASHED_DESC, SORT_OPTIONS.CREATED_DESC, SORT_OPTIONS.CREATED_ASC],
  search: [SORT_OPTIONS.CREATED_DESC, SORT_OPTIONS.UPDATED_DESC, SORT_OPTIONS.CREATED_ASC]
};

export const SortingProvider = ({ children }) => {
  // Current sort option for each view
  const [currentSort, setCurrentSort] = useState({
    main: VIEW_DEFAULT_SORTS.main,
    archive: VIEW_DEFAULT_SORTS.archive,
    trash: VIEW_DEFAULT_SORTS.trash,
    search: VIEW_DEFAULT_SORTS.search
  });
  // Get current sort for a view
  const getSortForView = useCallback((view) => {
    const currentSortForView = currentSort[view] || VIEW_DEFAULT_SORTS[view];
    const availableSorts = VIEW_AVAILABLE_SORTS[view] || [];
    
    // If the current sort is not available for this view, use the default
    if (!availableSorts.includes(currentSortForView)) {
      return VIEW_DEFAULT_SORTS[view];
    }
    
    return currentSortForView;
  }, [currentSort]);  // Set sort for a specific view
  const setSortForView = useCallback((view, sortOption) => {
    const availableSorts = VIEW_AVAILABLE_SORTS[view] || [];
    
    // Only set the sort if it's available for this view
    if (availableSorts.includes(sortOption)) {
      setCurrentSort(prev => ({
        ...prev,
        [view]: sortOption
      }));
    } else {
      console.warn(`Sort option ${sortOption} is not available for view ${view}. Available options:`, availableSorts);
    }
  }, []);

  // Get available sort options for a view
  const getAvailableSortsForView = useCallback((view) => {
    return VIEW_AVAILABLE_SORTS[view] || [];
  }, []);
  // Convert unified sort option to legacy format for API compatibility
  const convertToLegacyParams = useCallback((sortOption) => {
    switch (sortOption) {
      case SORT_OPTIONS.CREATED_DESC:
        return { 
          sortCriteria: 'created_at', 
          oldestFirst: false, 
          searchSortOrder: 'createdAt_desc' 
        };
      case SORT_OPTIONS.CREATED_ASC:
        return { 
          sortCriteria: 'created_at', 
          oldestFirst: true, 
          searchSortOrder: 'createdAt_asc' 
        };
      case SORT_OPTIONS.ARCHIVED_DESC:
        return { 
          sortCriteria: 'archived_at', 
          oldestFirst: false, 
          searchSortOrder: 'updatedAt_desc' // fallback for search
        };
      case SORT_OPTIONS.TRASHED_DESC:
        return { 
          sortCriteria: 'trashed_at', 
          oldestFirst: false, 
          searchSortOrder: 'updatedAt_desc' // fallback for search
        };
      case SORT_OPTIONS.UPDATED_DESC:
        return { 
          sortCriteria: 'created_at', // fallback for main view
          oldestFirst: false, 
          searchSortOrder: 'updatedAt_desc' 
        };
      case SORT_OPTIONS.UPDATED_ASC:
        return { 
          sortCriteria: 'created_at', // fallback for main view
          oldestFirst: true, 
          searchSortOrder: 'updatedAt_asc' 
        };
      default:
        return { 
          sortCriteria: 'created_at', 
          oldestFirst: false, 
          searchSortOrder: 'createdAt_desc' 
        };
    }
  }, []);

  // Convert legacy params to unified sort option
  const convertFromLegacyParams = useCallback((params) => {
    const { sortCriteria, oldestFirst, searchSortOrder } = params;
    
    if (searchSortOrder) {
      return searchSortOrder === 'updatedAt_desc' ? SORT_OPTIONS.UPDATED_DESC : SORT_OPTIONS.UPDATED_ASC;
    }
    
    if (sortCriteria === 'archived_at') return SORT_OPTIONS.ARCHIVED_DESC;
    if (sortCriteria === 'trashed_at') return SORT_OPTIONS.TRASHED_DESC;
    if (sortCriteria === 'created_at') {
      return oldestFirst ? SORT_OPTIONS.CREATED_ASC : SORT_OPTIONS.CREATED_DESC;
    }
    
    return SORT_OPTIONS.CREATED_DESC;
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
    convertToLegacyParams,
    convertFromLegacyParams
  };

  return (
    <SortingContext.Provider value={contextValue}>
      {children}
    </SortingContext.Provider>
  );
};

export { SORT_OPTIONS };
