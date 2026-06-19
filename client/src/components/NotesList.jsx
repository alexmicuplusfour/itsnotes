import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useNoteSelection } from '../contexts/NoteSelectionContext';
import styled, { keyframes, css } from 'styled-components';
import Masonry from 'react-masonry-css';
import { useNavigate, useLocation } from 'react-router-dom';
import NoteCard from './NoteCard';
import Icon from './Icons'; // Import Icon
import MonthNavigationPills from './MonthNavigationPills'; // Import the navigation pills
import ColorSelectorPills from './ColorSelectorPills'; // Import the new color selector pills
import SubtagPills from './SubtagPills'; // Import the new subtag pills
import RelatedTags from './RelatedTags'; // Import the related tags component
import CurrentTags from './CurrentTags'; // Import the current tags component
import FolderHeader from './FolderHeader';
import EmptyTrashPills from './EmptyTrashPills'; // Import the empty trash pills
import MonthSearchStar from './MonthSearchStar'; // Import the month search star component
import { useNotes, useNotesLoading } from '../contexts/NotesContext';
import { useSorting } from '../contexts/SortingContext';
import { useTags } from '../contexts/TagsContext';
import { useUIPreferences } from '../contexts/UIPreferencesContext';
import { useStickyMonthHeaders } from '../hooks/useStickyMonthHeaders';
import StickyMonthHeaderDisplay from './StickyMonthHeaderDisplay';
import { useSelectionKeyboardShortcuts } from '../hooks/useSelectionKeyboardShortcuts'; // Import keyboard shortcuts hook

// Define breakpointColumnsObj outside the component to maintain a stable reference
const breakpointColumnsObj = { default: 5, 1400: 4, 1050: 3, 820: 2, 400: 2 };

const NotesContainer = styled.div`
  margin-left: var(--sidebar-width);
  padding: 16px;
  padding-top: calc(var(--nav-height) - 20px);
  min-height: calc(100vh - var(--nav-height));
  box-sizing: border-box;

  @media (max-width: 600px) {
    padding-left: 8px;
    padding-right: 8px;
    padding-top: 30px;
  }
`;

// Overview Mode Container
const OverviewContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px; /* Spacing between circles */
  padding: 16px 0; /* Add some padding */
  justify-content: center; /* Center circles horizontally */
  margin-bottom: 60px; /* Consistent bottom margin */
`;

// Note Circle Component
const NoteCircle = styled.div`
  width: 36px; /* Size of the circle */
  height: 36px;
  border-radius: 50%;
  background-color: ${props => { /* Correctly apply color using CSS variables */
    if (props.color && props.color !== 'default') {
      return `var(--note-color-${props.color})`;
    }
    return 'var(--note-bg-color)';
  }};
  transition: transform 0.1s ease-in-out, box-shadow 0.1s ease-in-out;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

  outline: 1px solid var(--border-transparent);
  outline-offset: -1px;
  cursor: pointer;

  &:hover {
    outline: 2px solid var(--text-color);
  }
`;

// Stacked View Container
const StackedViewContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center; /* Center items horizontally */
  width: 100%;
  margin-bottom: 60px;
`;

// Stacked Item Wrapper (applies max-width)
const StackedItemWrapper = styled.div`
  width: 100%;
  max-width: 600px; /* Max width for stacked items */
  margin-bottom: 16px; /* Spacing between stacked items */

  @media (max-width: 600px) {
    margin-bottom: 8px;
  }
`;


// Month separator styling
const MonthSeparator = styled.div`
  width: 100%;
  margin: 16px 0 20px;
  position: relative;
  text-align: center;
  
  &::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 0px; // Corrected from 0px to 1px or similar if a line is desired, or keep for pure label
    background-color: var(--note-border-color);
    z-index: 0;
  }
`;

const MonthLabel = styled.span`
  background-color: ${props => props.theme === 'dark' 
    ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.07)'};
  font-size: 13px;
  font-weight: 600;
  color: ${props => props.theme === 'dark' 
    ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)'};
  position: relative;
  z-index: 1;
  border-radius: 16px;
  padding: 6px 12px;
  display: inline-flex; // Use flex to align label and icon
  align-items: center; // Center items vertically
`;

const MasonryGrid = styled(Masonry)`
  display: flex;
  margin-left: -16px; /* Compensate for the gap between items */
  width: auto;
  margin-bottom: 45px;
  
  .masonry-grid-column {
    padding-left: 16px; /* Gap between columns */
    background-clip: padding-box;
  }
  
  /* Item wrapper to add spacing between rows */
  .masonry-item {
    margin-bottom: 16px;
  }
  
  @media (max-width: 600px) {
    margin-left: -8px;
    
    .masonry-grid-column {
      padding-left: 8px;
    }
    
    .masonry-item {
      margin-bottom: 8px;
    }
  }
  
  @media (max-width: 400px) {
    /* Ensure proper spacing at very small screen sizes */
    margin-left: -6px; // Adjusted from -6px to -8px to match above
    
    .masonry-grid-column {
      padding-left: 8px;
    }
    
    .masonry-item {
      margin-bottom: 8px;
    }
  }
`;

const SectionTitle = styled.h2`
  font-size: 14px;
  font-weight: 500;
  color: #8a8f95; // Consider using var(--text-secondary-color) or similar
  margin: 0px 0 12px;
  padding-left: 8px;
`;

const CountPill = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: 20px;
  vertical-align: middle;
  position: relative;
  top: -1px;
  background-color: var(--foreground-color);
  color: var(--text-color-contrast);
  opacity: 0.8;
  padding: 0 6px;
  border-radius: 10px;
  font-size: 13px;
  margin-right: 6px;
`;

const countSpin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

// Shown inside the count pill while the search-result count for the current query
// is still loading, so a stale/DB total never flashes in its place.
const CountSpinner = styled.span`
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: var(--text-color-contrast);
  border-radius: 50%;
  animation: ${countSpin} 0.7s linear infinite;
`;

export const LoadingMessage = styled.div`
  text-align: center;
  padding: 20px;
  color: var(--text-secondary-color, #5f6368); // Use theme variable
  font-size: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`;

const EmptyMessage = styled.div`
  text-align: center;
  padding: 40px;
  color: var(--text-secondary-color, #5f6368); // Use theme variable
  font-size: 18px;
`;

const PinnedSection = styled.div`
  margin-bottom: 14px;
`; 

// A sentinel element that we'll observe for intersection
const LoadTrigger = styled.div`
  width: 100%;
  min-height: 60px;
  padding: 20px 0;
  margin-top: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: transparent;
  position: relative;
  
  /* Debug outline - remove in production */
  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
  }
`;

// Spinner animation
const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const Spinner = styled.div`
  width: 24px;
  height: 24px;
  border: 3px solid rgba(95, 99, 104, 0.2);
  border-top: 3px solid var(--spinner-highlight);
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;
  margin-bottom: 10px;
`;

// Simple button style for Load More
const LoadMoreButton = styled.button`
  padding: 10px 20px;
  font-size: 14px;
  color: #8a8f95; // Consider var(--text-secondary-color)
  background-color: var(--note-bg-color);
  border: 1px solid var(--note-border-color);
  border-radius: 18px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  margin-top: 10px; // Add some space above the button

  &:hover {
    background-color: var(--hover-bg-color);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;


const NotesList = ({ title, notes, showPinned }) => {
  console.log('[NotesList] Rendering - timestamp:', Date.now());

  const [isDarkTheme, setIsDarkTheme] = useState(() =>
    !document.documentElement.classList.contains('light-theme')
  );

  const {
    notes: contextNotes,
    hasMore,
    loadNotes,
    loadMoreSearchResults,
    searchMode,
    getPinnedNotes,
    getUnpinnedNotes,
    // searchResults, // Not directly used here, `notes` prop or `contextNotes` handle this
    searchQuery,
    searchByColor,
    view,
  } = useNotes();
  const { listLoading } = useNotesLoading(); // Changed from loading

  // Get unified sorting system
  const { getSortForView, SORT_OPTIONS } = useSorting();
  
  // Determine if we should sort oldest first based on current sort option
  const currentSortOption = getSortForView(searchMode ? 'search' : view);
  const sortOldestFirst = currentSortOption === SORT_OPTIONS.CREATED_ASC;
  
  const { 
    layoutView, 
    saveSearch, 
    savedSearches, 
    showMonthMarkers 
  } = useUIPreferences();
  
  // Enable keyboard shortcuts for bulk selection
  useSelectionKeyboardShortcuts();
  
  const isExclusiveColorSearch = useMemo(() => {
    const colorSearchPattern = /^\$([a-z]+)$/i;
    return searchMode && searchQuery && colorSearchPattern.test(searchQuery);
  }, [searchMode, searchQuery]);
  
  const navigate = useNavigate();
  const location = useLocation();
  const observerTarget = useRef(null);
  const containerRef = useRef(null);
  const loadMoreRef = useRef();

  const [rootMargin, setRootMargin] = useState('0px 0px 3000px 0px'); // This seems fine, keep it
  
  // Use provided notes (for search/archive/trash) or context notes (for main list)
  const displayNotes = notes || contextNotes;
  
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkTheme(!document.documentElement.classList.contains('light-theme'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  
  const isNoteEmpty = (note) => {
      const titleIsEmpty = !note.title || note.title.trim() === '';
      const contentIsEmpty = !note.content || note.content.trim() === '';
      const hasImages = note.images && Array.isArray(note.images) && note.images.length > 0;
      return titleIsEmpty && contentIsEmpty && !hasImages;
  };
  
  const { hiddenTagIds, pickerOpenForNoteId, setPickerOpenForNoteId } = useTags();
  const { selectedNoteIds, toggleNoteSelection } = useNoteSelection();

  const hasHiddenTags = (note) => {
    if (searchMode || view === 'trash' || view === 'archive' || hiddenTagIds.size === 0) return false;
    if (note.id === pickerOpenForNoteId) return false;
    if (!note.tags || !Array.isArray(note.tags) || note.tags.length === 0) return false;
    return note.tags.some(tag => hiddenTagIds.has(tag.id));
  };

  const allPinnedNotes = showPinned ? getPinnedNotes() : [];
  const pinnedNotes = useMemo(() =>
    allPinnedNotes.filter(note => !isNoteEmpty(note)),
    [allPinnedNotes, searchMode, view]
  );

  const allUnpinnedNotes = showPinned ? getUnpinnedNotes() : displayNotes;
  const unpinnedNotes = useMemo(() =>
    allUnpinnedNotes.filter(note => !isNoteEmpty(note) && !hasHiddenTags(note)),
    [allUnpinnedNotes, searchMode, view, hiddenTagIds, pickerOpenForNoteId]
  );
  
  const shouldShowPinnedSection = showPinned && pinnedNotes.length > 0;
  
  const notesByMonth = useMemo(() => {
    if (searchMode && !showPinned) {
      // In search mode without "showPinned" (e.g., viewing search results directly),
      // return a flat structure for unpinnedNotes.
      // The component will render unpinnedNotes directly without month grouping.
      return [{ notes: unpinnedNotes, label: 'search_results_flat' }]; // label helps differentiate
    }
    
    const grouped = {};
    unpinnedNotes.forEach(note => {
      const date = new Date(note.created_at);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const monthYearKey = `${year}-${month}`;
      
      if (!grouped[monthYearKey]) {
        grouped[monthYearKey] = {
          label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
          year: year,
          month: month,
          notes: [],
          timestamp: date.getTime()
        };
      }
      grouped[monthYearKey].notes.push(note);
    });
    
    const sortedMonths = Object.values(grouped).sort((a, b) => 
      sortOldestFirst ? a.timestamp - b.timestamp : b.timestamp - a.timestamp
    );
    
    const monthShortNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    return sortedMonths.map(group => ({
      ...group,
      monthShort: monthShortNames[group.month - 1]
    }));
  }, [unpinnedNotes, searchMode, showPinned, sortOldestFirst]);

  const { monthSeparatorRefs, registerMonthSeparatorRef } = useStickyMonthHeaders();
  
  useEffect(() => {
    const calculateRootMargin = () => {
      const viewportHeight = window.innerHeight;
      const preloadHeight = viewportHeight * 2;
      setRootMargin(`0px 0px ${preloadHeight}px 0px`);
    };
    calculateRootMargin();
    window.addEventListener('resize', calculateRootMargin);
    return () => window.removeEventListener('resize', calculateRootMargin);
  }, []); // Removed dependencies, as they don't directly influence rootMargin calculation logic itself

  const handleNoteCircleClick = (noteId) => {
    const currentSearch = new URLSearchParams(location.search);
    currentSearch.set('note', noteId);
    const searchString = currentSearch.toString();
    navigate({ pathname: location.pathname, search: searchString }, { replace: false });
  };

  const handleMonthLongPress = (e, year, monthShort) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Trigger haptic feedback if available
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
    
    const query = `yr:${year}:${monthShort}`;
    navigate(`?q=${encodeURIComponent(query)}`);
  };
  
  // Create refs for values used in loadMore
  const hasMoreRef = useRef(hasMore);
  const listLoadingRef = useRef(listLoading);
  const searchModeRef = useRef(searchMode);

  // Update refs
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { listLoadingRef.current = listLoading; }, [listLoading]);
  useEffect(() => { searchModeRef.current = searchMode; }, [searchMode]);

  // Stable loadMore function that reads from refs
  const loadMore = useCallback(() => {
    console.log('[loadMore] Called. hasMore:', hasMoreRef.current, 'listLoading:', listLoadingRef.current);
    if (hasMoreRef.current && !listLoadingRef.current) {
      if (searchModeRef.current) {
        loadMoreSearchResults();
      } else {
        loadNotes();
      }
    }
  }, [loadMoreSearchResults, loadNotes]);

  // Update loadMoreRef when loadMore changes
  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

  // Create IntersectionObserver once - use callback ref to observe target when it mounts
  const observerRef = useRef(null);

  // Create observer once on component mount
  useEffect(() => {
    console.log('[IntersectionObserver] Creating observer (once)');
    observerRef.current = new IntersectionObserver(
      (entries) => {
        console.log('[IntersectionObserver] Callback. isIntersecting:', entries[0].isIntersecting, 'hasMore:', hasMoreRef.current, 'loading:', listLoadingRef.current);
        if (entries[0].isIntersecting && hasMoreRef.current && !listLoadingRef.current) {
          console.log('[IntersectionObserver] Calling loadMore');
          loadMoreRef.current();
        }
      },
      { root: null, rootMargin: `0px 0px ${window.innerHeight}px 0px`, threshold: 0 }
    );

    // If the target element already exists (callback ref ran before this effect), observe it now
    if (observerTarget.current) {
      console.log('[IntersectionObserver] Target already exists, observing it');
      observerRef.current.observe(observerTarget.current);
      
      // Also check if it's already in view
      requestAnimationFrame(() => {
        const target = observerTarget.current;
        if (target && hasMoreRef.current && !listLoadingRef.current) {
          const rect = target.getBoundingClientRect();
          const isInView = rect.top < window.innerHeight * 2;
          console.log('[IntersectionObserver] Initial check after observer created:', isInView, 'rect.top:', rect.top);
          if (isInView) {
            console.log('[IntersectionObserver] Element in view after observer created, triggering load');
            loadMoreRef.current();
          }
        }
      });
    }

    // Handle page visibility changes (important for mobile browsers)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[IntersectionObserver] Page became visible');
        const target = observerTarget.current;
        if (target) {
          const rect = target.getBoundingClientRect();
          const isInView = rect.top < window.innerHeight && rect.bottom > 0;
          console.log('[IntersectionObserver] Target in viewport:', isInView, 'hasMore:', hasMoreRef.current, 'loading:', listLoadingRef.current);
          if (isInView && hasMoreRef.current && !listLoadingRef.current) {
            console.log('[IntersectionObserver] Triggering load after visibility change');
            loadMoreRef.current();
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      console.log('[IntersectionObserver] Cleanup - disconnecting observer');
      if (observerRef.current) observerRef.current.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // Empty deps - create once, never recreate

  // After each load completes, re-check whether the LoadTrigger is still
  // within range. IntersectionObserver only fires on intersection transitions
  // — with a small PAGE_SIZE the trigger can stay continuously intersecting,
  // so the observer never refires and the list stalls on the "Load More"
  // button. We wait past the 300ms loadNotes/search debounce window, then
  // poll every 500ms while the trigger remains in range. Stops when the page
  // is filled (trigger drops below 2x viewport), hasMore goes false, or a
  // load completes (effect re-runs and cancels the timer).
  useEffect(() => {
    if (listLoading || !hasMore) return;

    let timer = null;
    const tryLoad = () => {
      timer = null;
      const target = observerTarget.current;
      if (!target || !hasMoreRef.current || listLoadingRef.current) return;
      const rect = target.getBoundingClientRect();
      const isInRange = rect.top < window.innerHeight * 2;
      if (!isInRange) return;
      loadMoreRef.current();
      // If the load got debounced, listLoading won't flip — retry later.
      timer = setTimeout(tryLoad, 500);
    };

    timer = setTimeout(tryLoad, 500);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [listLoading, hasMore]);

  // Callback ref - called whenever the LoadTrigger mounts/unmounts
  const setObserverTarget = useCallback((element) => {
    console.log('[IntersectionObserver] Callback ref called. Element:', !!element, 'Previous element:', !!observerTarget.current);
    
    // Unobserve the previous element if it exists
    if (observerTarget.current && observerRef.current) {
      console.log('[IntersectionObserver] Unobserving previous target element');
      observerRef.current.unobserve(observerTarget.current);
    }
    
    observerTarget.current = element;

    if (element && observerRef.current) {
      console.log('[IntersectionObserver] Observing new target element');
      observerRef.current.observe(element);
      
      // Check if the element is already in view (important when switching layouts)
      // Use requestAnimationFrame to ensure layout is complete
      requestAnimationFrame(() => {
        if (element && hasMoreRef.current && !listLoadingRef.current) {
          const rect = element.getBoundingClientRect();
          const isInView = rect.top < window.innerHeight * 2; // Check with some margin
          console.log('[IntersectionObserver] Initial visibility check:', isInView, 'rect.top:', rect.top);
          if (isInView) {
            console.log('[IntersectionObserver] Element already in view, triggering load');
            loadMoreRef.current();
          }
        }
      });
    }
  }, []);
    
    let iconForEmptyState = 'notes'; // A sensible default icon
    let messageForEmptyState = 'No notes to show'; // A default message

    if (searchMode) {
      iconForEmptyState = 'search';
      messageForEmptyState = 'No notes found';
    } else { // Not in search mode, so check the view
      if (view === 'main') {
        // Per your request: '!searchMode && view === 'main''
        iconForEmptyState = 'notes'; // Make sure you have an icon named "notes".
                                     // Common alternatives: 'file-text', 'edit', 'feather'.
        messageForEmptyState = 'No notes to show';
      } else if (view === 'trash') {
        iconForEmptyState = 'trash';
        messageForEmptyState = 'Trash is empty';
      } else if (view === 'archive') {
        iconForEmptyState = 'archive';
        messageForEmptyState = 'No archived notes';
      }
      // Add any other specific 'view' conditions here if needed
    }

  // --- MODIFIED EARLY RETURN LOGIC ---
  // This handles the case where notes are loading for the very first time, and it's not a search context
  // where pills need to be shown above an empty/loading state.
  if (listLoading && pinnedNotes.length === 0 && unpinnedNotes.length === 0 && !(searchMode && searchQuery)) { // Changed from loading
    return (
      <LoadingMessage style={{paddingTop: '60px'}}>
        <Spinner />
        Loading notes...
      </LoadingMessage>
    );
  }

  // This handles the case where there are genuinely no notes at all (e.g., fresh install, or all notes deleted/archived)
  // and it's not a search context.
  if (!listLoading && pinnedNotes.length === 0 && unpinnedNotes.length === 0 && !(searchMode && searchQuery)) { // Changed from loading
    return <EmptyMessage><Icon name={iconForEmptyState} size={96} /><br />{messageForEmptyState}</EmptyMessage>; 
  }
  // --- END OF MODIFIED EARLY RETURN LOGIC ---

  return (
    <NotesContainer ref={containerRef} className={selectedNoteIds.size > 0 ? 'selection-mode' : ''}>
      <StickyMonthHeaderDisplay
        showMonthMarkers={showMonthMarkers}
        searchMode={searchMode}
        notesByMonth={notesByMonth}
        monthSeparatorRefs={monthSeparatorRefs}
        onMonthLongPress={handleMonthLongPress}
        isDarkTheme={isDarkTheme}
      />

      {/* Always show pills in search mode, regardless of results */}
      {searchMode && searchQuery && (
        <div style={{ marginBottom: '16px' }}> {/* Added a wrapper for spacing pills */}
          <FolderHeader searchQuery={searchQuery} />
          <MonthNavigationPills searchQuery={searchQuery} />
          {isExclusiveColorSearch && <ColorSelectorPills searchByColor={searchByColor} searchQuery={searchQuery} />}
          <SubtagPills searchQuery={searchQuery} />
          <CurrentTags searchQuery={searchQuery} />
          <RelatedTags searchQuery={searchQuery} />
        </div>
      )}
      
      {/* Show EmptyTrashPills on trash page when not in search mode */}
      {!searchMode && <EmptyTrashPills title={title} />}

      {title && (
        <SectionTitle>
          {(() => {
            // Parse the title to extract count and wrap it in a pill
            const match = title.match(/^(\d+) result(s?) for "(.+)"$/);
            if (match) {
              const count = match[1];
              const plural = match[2];
              const query = match[3];
              return (
                <>
                  <CountPill $isDark={isDarkTheme}>{count}</CountPill>
                  result{plural} for "{query}"
                </>
              );
            }
            // Search count still loading: show a spinner in the pill instead of a stale count
            const loadingMatch = title.match(/^Searching for "(.+)"\.\.\.$/);
            if (loadingMatch) {
              return (
                <>
                  <CountPill $isDark={isDarkTheme}><CountSpinner /></CountPill>
                  results for "{loadingMatch[1]}"
                </>
              );
            }
            return title;
          })()}
        </SectionTitle>
      )}

      {/* Content Area: Handles loading/empty states within search context, or displays notes */}
      {listLoading && pinnedNotes.length === 0 && unpinnedNotes.length === 0 && (searchMode && searchQuery) ? ( // Changed from loading
        // Case: Loading search results, no notes yet. The footer's "Loading notes..."
        // message covers this state, so keep the body empty to avoid a duplicate message.
        <></>

      ) : !listLoading && pinnedNotes.length === 0 && unpinnedNotes.length === 0 && (searchMode && searchQuery) ? ( // Changed from loading
        // Case: Not loading, and no notes found for the search, pills are shown.
        <EmptyMessage><Icon name={iconForEmptyState} size={96} /><br />{messageForEmptyState}</EmptyMessage>
      ) : (
        // Case: Notes exist (pinned, unpinned, or both) or loading more notes when some are already visible.
        <>
          {/* Pinned Section - Render based on layoutView */}
          {shouldShowPinnedSection && (
            <PinnedSection>
              <SectionTitle>Pinned</SectionTitle>
              {layoutView === 'grid' ? (
                <MasonryGrid breakpointCols={breakpointColumnsObj} className="masonry-grid" columnClassName="masonry-grid-column">
                  {pinnedNotes.map(note => (
                    <div key={note.id} className="masonry-item"><NoteCard note={note} searchQuery={searchQuery} onPickerOpen={setPickerOpenForNoteId} isSelected={selectedNoteIds.has(note.id)} onToggleSelect={toggleNoteSelection} /></div>
                  ))}
                </MasonryGrid>
              ) : layoutView === 'stacked' ? (
                <StackedViewContainer>
                  {pinnedNotes.map(note => (
                    <StackedItemWrapper key={note.id}><NoteCard note={note} searchQuery={searchQuery} layoutView="stacked" onPickerOpen={setPickerOpenForNoteId} isSelected={selectedNoteIds.has(note.id)} onToggleSelect={toggleNoteSelection} /></StackedItemWrapper>
                  ))}
                </StackedViewContainer>
              ) : ( // layoutView === 'overview'
                 <OverviewContainer>
                   {pinnedNotes.map(note => (
                     <NoteCircle key={note.id} color={note.color} title={note.title || 'Untitled Note'} onClick={() => handleNoteCircleClick(note.id)} />
                   ))}
                 </OverviewContainer>
              )}
              {unpinnedNotes.length > 0 && <SectionTitle>Others</SectionTitle>}
            </PinnedSection>
          )}

          {/* Unpinned/Other Notes Section - Render only if there are unpinned notes */}
          {unpinnedNotes.length > 0 && (
            <>
              {layoutView === 'grid' ? (
                <>
                  {(!showPinned || searchMode || !showMonthMarkers || (searchMode && notesByMonth.length === 1 && notesByMonth[0].label === 'search_results_flat')) ? (
                    <MasonryGrid breakpointCols={breakpointColumnsObj} className="masonry-grid" columnClassName="masonry-grid-column">
                      {unpinnedNotes.map(note => (
                        <div key={note.id} className="masonry-item"><NoteCard note={note} searchQuery={searchQuery} onPickerOpen={setPickerOpenForNoteId} isSelected={selectedNoteIds.has(note.id)} onToggleSelect={toggleNoteSelection} /></div>
                      ))}
                    </MasonryGrid>
                  ) : (
                    <>
                      {notesByMonth.map((monthGroup, index) => (
                        <div key={monthGroup.label}>
                          {showMonthMarkers && (index > 0 || shouldShowPinnedSection) && (
                            <MonthSeparator
                              ref={registerMonthSeparatorRef(monthGroup.label)}
                              data-month-label={monthGroup.label}
                            >
                              <MonthLabel 
                                theme={isDarkTheme ? 'dark' : 'light'}
                                onContextMenu={(e) => handleMonthLongPress(e, monthGroup.year, monthGroup.monthShort)}
                              >
                                {monthGroup.label}
                                <MonthSearchStar 
                                  year={monthGroup.year} 
                                  monthShort={monthGroup.monthShort} 
                                  monthLabel={monthGroup.label} 
                                />
                              </MonthLabel>
                            </MonthSeparator>
                          )}
                          <>{pinnedNotes.length < 1 && index === 0 && <SectionTitle>Notes</SectionTitle>}</>   
                          <MasonryGrid breakpointCols={breakpointColumnsObj} className="masonry-grid" columnClassName="masonry-grid-column">
                            {monthGroup.notes.map(note => (
                              <div key={note.id} className="masonry-item"><NoteCard note={note} searchQuery={searchQuery} onPickerOpen={setPickerOpenForNoteId} isSelected={selectedNoteIds.has(note.id)} onToggleSelect={toggleNoteSelection} /></div>
                            ))}
                          </MasonryGrid>
                        </div>
                      ))}
                    </>
                  )}
                </>
              ) : layoutView === 'stacked' ? (
                <>
                  {(!showPinned || searchMode || !showMonthMarkers || (searchMode && notesByMonth.length === 1 && notesByMonth[0].label === 'search_results_flat')) ? (
                    <StackedViewContainer>
                      {unpinnedNotes.map(note => (
                        <StackedItemWrapper key={note.id}><NoteCard note={note} searchQuery={searchQuery} layoutView="stacked" onPickerOpen={setPickerOpenForNoteId} isSelected={selectedNoteIds.has(note.id)} onToggleSelect={toggleNoteSelection} /></StackedItemWrapper>
                      ))}
                    </StackedViewContainer>
                  ) : (
                    <>
                      {notesByMonth.map((monthGroup, index) => (
                        <div key={monthGroup.label}>
                          {showMonthMarkers && (index > 0 || shouldShowPinnedSection) && (
                            <MonthSeparator
                              ref={registerMonthSeparatorRef(monthGroup.label)}
                              data-month-label={monthGroup.label}
                            >
                               <MonthLabel 
                                theme={isDarkTheme ? 'dark' : 'light'}
                                onContextMenu={(e) => handleMonthLongPress(e, monthGroup.year, monthGroup.monthShort)}
                               >
                                {monthGroup.label}
                                <MonthSearchStar 
                                  year={monthGroup.year} 
                                  monthShort={monthGroup.monthShort} 
                                  monthLabel={monthGroup.label} 
                                />
                              </MonthLabel>
                            </MonthSeparator>
                          )}
                          <>{pinnedNotes.length < 1 && index === 0 && <SectionTitle>Notes</SectionTitle>}</>
                          <StackedViewContainer>
                            {monthGroup.notes.map(note => (
                              <StackedItemWrapper key={note.id}><NoteCard note={note} searchQuery={searchQuery} layoutView="stacked" onPickerOpen={setPickerOpenForNoteId} isSelected={selectedNoteIds.has(note.id)} onToggleSelect={toggleNoteSelection} /></StackedItemWrapper>
                            ))}
                          </StackedViewContainer>
                        </div>
                      ))}
                    </>
                  )}
                </>
              ) : ( // layoutView === 'overview'
                <>
                 {(!showPinned || searchMode || !showMonthMarkers || (searchMode && notesByMonth.length === 1 && notesByMonth[0].label === 'search_results_flat')) ? (
                     <OverviewContainer>
                       {unpinnedNotes.map(note => (
                         <NoteCircle key={note.id} color={note.color} title={note.title || 'Untitled Note'} onClick={() => handleNoteCircleClick(note.id)} />
                       ))}
                     </OverviewContainer>
                  ) : (
                    <>
                      {notesByMonth.map((monthGroup, index) => (
                        <div key={monthGroup.label}>
                          {showMonthMarkers && (index > 0 || shouldShowPinnedSection) && (
                            <MonthSeparator
                              ref={registerMonthSeparatorRef(monthGroup.label)}
                              data-month-label={monthGroup.label}
                            >
                               <MonthLabel 
                                theme={isDarkTheme ? 'dark' : 'light'}
                                onContextMenu={(e) => handleMonthLongPress(e, monthGroup.year, monthGroup.monthShort)}
                               >
                                {monthGroup.label}
                                <MonthSearchStar 
                                  year={monthGroup.year} 
                                  monthShort={monthGroup.monthShort} 
                                  monthLabel={monthGroup.label} 
                                />
                              </MonthLabel>
                            </MonthSeparator>
                          )}
                           <OverviewContainer>
                             {monthGroup.notes.map(note => (
                               <NoteCircle key={note.id} color={note.color} title={note.title || 'Untitled Note'} onClick={() => handleNoteCircleClick(note.id)} />
                             ))}
                           </OverviewContainer>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
      
      <div id="notes-list-footer">
        {/* Show LoadTrigger if there are more notes, OR if currently loading (either some
            notes are already displayed, or a search is loading into an empty list) */}
        {(hasMore || (listLoading && (pinnedNotes.length > 0 || unpinnedNotes.length > 0)) || (listLoading && searchMode && searchQuery)) && ( // Changed from loading
            <LoadTrigger ref={setObserverTarget} data-hasmore={hasMore}>
            {listLoading && ( // Changed from loading
                <LoadingMessage>
                <Spinner />
                Loading notes...
                </LoadingMessage>
            )}
            {hasMore && !listLoading && ( // Changed from loading
                <LoadMoreButton onClick={loadMore} disabled={listLoading}> {/* Changed from loading */}
                Load More
                </LoadMoreButton>
            )}
            </LoadTrigger>
        )}

        {/* Show "End of notes" only if there are no more notes AND some unpinned notes were actually displayed */}
        {!hasMore && (pinnedNotes.length > 0 || unpinnedNotes.length > 0) && (
          <>
            {/* Only show these pills again at the bottom if in search mode and some results were found */}
            {searchMode && searchQuery && (pinnedNotes.length > 0 || unpinnedNotes.length > 0) && (
              <div style={{ marginTop: '20px', marginBottom: '10px' }}>
                <MonthNavigationPills searchQuery={searchQuery} />
              </div>
            )}
            <LoadingMessage>End of notes</LoadingMessage>
          </>
        )}
      </div>
    </NotesContainer>
  );
};

export default NotesList;
export { MonthSeparator, MonthLabel, SectionTitle, CountPill, CountSpinner };
