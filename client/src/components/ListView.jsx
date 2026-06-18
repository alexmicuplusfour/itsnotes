import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import styled, { keyframes } from 'styled-components';
import { useNavigate, useLocation } from 'react-router-dom';
import ListViewItem from './ListViewItem';
import NoteForm from './NoteForm';
import { MonthSeparator, MonthLabel, SectionTitle, CountPill, CountSpinner, LoadingMessage } from './NotesList';
import { StickyMonthHeader, StickyMonthLabel } from './StickyMonthHeader.styled';
import MonthNavigationPills from './MonthNavigationPills';
import ColorSelectorPills from './ColorSelectorPills';
import SubtagPills from './SubtagPills';
import RelatedTags from './RelatedTags';
import CurrentTags from './CurrentTags';
import FolderHeader from './FolderHeader';
import EmptyTrashPills from './EmptyTrashPills';
import MonthSearchStar from './MonthSearchStar';
import Icon from './Icons';
import { useNotes, useNotesLoading } from '../contexts/NotesContext';
import { useTags } from '../contexts/TagsContext';
import { useUIPreferences } from '../contexts/UIPreferencesContext';
import { useNoteActions } from '../contexts/NoteActionsContext';
import { useNoteSelection } from '../contexts/NoteSelectionContext';
import { useSelectionKeyboardShortcuts } from '../hooks/useSelectionKeyboardShortcuts';

// Main container for the list view layout
const ListViewContainer = styled.div`
  display: flex;
  height: calc(100vh - var(--nav-height));
  width: 100%;
  overflow: hidden;
  position: relative; /* For sticky month header positioning */
  border-top: 1px solid var(--header-border-color);
  
  @media (max-width: 768px) {
    flex-direction: column;
    margin-top: -64px;
    height: 100vh;
  }
`;

// Left panel - notes list
const ListPanel = styled.div`
  position: relative;
  min-width: 400px;
  max-width: 400px;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease;
  flex-shrink: 0;
  border-right: 1px solid var(--border-transparent);
  
  /* Center the list when no note is open */
  ${props => !props.$hasOpenNote && `
    margin: 0 auto;
  `}
  
  @media (max-width: 768px) {
    width: 100%;
    max-width: none;
    min-width: auto;
    display: ${props => props.$hasOpenNote ? 'none' : 'flex'};
    border-right: none;
  }
`;

// Scrollable list of notes
const ListContent = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 12px;
  padding-right: 8px;
  padding-top: 20px;
  padding-bottom: 24px;
  
  @media (max-width: 768px) {
    padding: 8px 12px;
    padding-top: calc(var(--nav-height) + 26px);
    padding-bottom: var(--nav-height);
  }
  
  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background-color: var(--text-color);
    opacity: 0.3;
    border-radius: 3px;
  }
`;

// Section group container (for pinned notes or month groups)
const SectionGroup = styled.div`
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 10px var(--shadow-color);

  /* Hide bottom border on last item */
  & > *:last-child {
    border-bottom: none;
  }

  @media (max-width: 768px) {
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 24px;
    box-shadow: none;
    padding-top: 1px;
    padding-left: 1px;
    padding-right: 1px;
  }
`;

// Wrapper for sticky month header with responsive positioning
const StickyMonthHeaderWrapper = styled(StickyMonthHeader)`
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%) translateY(${props => props.$show ? '0' : '-100%'});
  z-index: 10;
  
  @media (max-width: 768px) {
    top: calc(var(--nav-height) + 8px);
  }
`;

// Section header (for pinned notes)
const SectionHeader = styled.div`
  padding: 8px 16px;
  padding-top: 0px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
  opacity: 0.5;
  
  @media (max-width: 768px) {
  }
`;

// Right panel - note detail
const DetailPanel = styled.div`
  flex: 1;
  height: 100%;
  display: ${props => props.$hasOpenNote ? 'flex' : 'flex'};
  flex-direction: column;
  position: relative;
  background-color: var(--background-color);
  overflow: hidden;
  
  @media (max-width: 768px) {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
    display: ${props => props.$hasOpenNote ? 'flex' : 'none'};
  }
`;

// Empty state for detail panel
const EmptyDetailState = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  font-size: 15px;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary-color, #5f6368);
  opacity: 1;
  gap: 12px;
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

// Load more trigger
const LoadMoreTrigger = styled.div`
  padding: 16px;
  text-align: center;
`;

const LoadMoreButton = styled.button`
  background: none;
  border: 1px solid var(--note-border-color);
  border-radius: 6px;
  padding: 8px 16px;
  color: var(--text-color);
  font-size: 13px;
  cursor: pointer;
  
  &:hover {
    background-color: var(--hover-background);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

function ListView({ searchQuery }) {
  const navigate = useNavigate();
  const location = useLocation();
  const noteFormRef = useRef();
  const listContentRef = useRef();
  const observerRef = useRef(null);
  const hasOpenedNoteRef = useRef(false); // Track if we've opened a note in this session
  const [isMobile, setIsMobile] = useState(() => {
    const mobile = window.innerWidth <= 768;
    console.log('[ListView] Initial isMobile:', mobile, 'window.innerWidth:', window.innerWidth);
    return mobile;
  });
  
  // Get notes data from context
  const {
    notes,
    searchResults,
    searchMode,
    loading,
    hasMore,
    loadNotes,
    loadMoreSearchResults,
    openedNote,
    view,
    totalNotes,
    searchCountQuery,
    searchByColor,
  } = useNotes();
  const { listLoading } = useNotesLoading();
  
  // Memoize openedNoteId to prevent unnecessary re-renders of list items
  // Only changes when the actual note ID changes, not when note object updates
  const openedNoteId = useMemo(() => openedNote?.id || null, [openedNote?.id]);
  
  // Reset hasOpenedNoteRef when note is closed (including via browser back)
  useEffect(() => {
    if (!openedNote) {
      console.log('[ListView] Resetting hasOpenedNoteRef to false (note closed)');
      hasOpenedNoteRef.current = false;
    } else {
      console.log('[ListView] openedNote exists:', openedNote.id);
    }
  }, [openedNote]);
  
  const { hiddenTagIds, pickerOpenForNoteId } = useTags();
  const { showMonthMarkers } = useUIPreferences();
  
  // Get stable action handlers from context - pass to children as props
  const {
    togglePin,
    archiveNote,
    unarchiveNote,
    trashNote,
    restoreNote,
    deleteNote,
    changeNoteColor,
    openNote, // NEW: Use new navigation system
    closeNote, // NEW: Use new navigation system for closing
  } = useNoteActions();
  
  // Get selection state - pass to children as props
  const {
    selectedNoteIds,
    toggleNoteSelection,
  } = useNoteSelection();

  // Enable keyboard shortcuts (Escape to clear, Ctrl+A to select all)
  useSelectionKeyboardShortcuts();
  
  // Track dark theme for MonthLabel styling
  const [isDarkTheme, setIsDarkTheme] = useState(
    () => !document.documentElement.classList.contains('light-theme')
  );
  
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkTheme(!document.documentElement.classList.contains('light-theme'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  
  // Sticky month header state
  const [stickyMonthLabel, setStickyMonthLabel] = useState(null);
  const [stickyMonthData, setStickyMonthData] = useState(null);
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const monthSeparatorRefs = useRef(new Map());
  const scrollTimeoutRef = useRef(null);
  const isScrollingRef = useRef(false);
  
  // Register month separator refs
  const registerMonthSeparatorRef = useCallback((monthLabel) => (el) => {
    if (el) {
      monthSeparatorRefs.current.set(monthLabel, el);
    } else {
      monthSeparatorRefs.current.delete(monthLabel);
    }
  }, []);
  
  // Check if this is an exclusive color search (e.g., "$red" with no other terms)
  const isExclusiveColorSearch = useMemo(() => {
    const colorSearchPattern = /^\$([a-z]+)$/i;
    return searchMode && searchQuery && colorSearchPattern.test(searchQuery);
  }, [searchMode, searchQuery]);
  
  // Helper to check if a note is empty (no title, no content, no images)
  const isNoteEmpty = useCallback((note) => {
    const titleIsEmpty = !note.title || note.title.trim() === '';
    const contentIsEmpty = !note.content || note.content.trim() === '';
    const hasImages = note.images && Array.isArray(note.images) && note.images.length > 0;
    return titleIsEmpty && contentIsEmpty && !hasImages;
  }, []);
  
  // Helper to check if note has hidden tags (only in main view)
  const hasHiddenTags = useCallback((note) => {
    if (searchMode || view === 'trash' || view === 'archive' || hiddenTagIds.size === 0) return false;
    if (note.id === pickerOpenForNoteId) return false;
    if (!note.tags || !Array.isArray(note.tags) || note.tags.length === 0) return false;
    return note.tags.some(tag => hiddenTagIds.has(tag.id));
  }, [searchMode, view, hiddenTagIds, pickerOpenForNoteId]);
  
  // Use search results in search mode, otherwise use notes
  const displayNotes = searchMode ? searchResults : notes;
  
  // Separate pinned and unpinned notes, filtering out empty notes
  // Hidden tags only filter unpinned notes (pinned notes with hidden tags are still shown)
  const { pinnedNotes, unpinnedNotes } = useMemo(() => {
    const pinned = [];
    const unpinned = [];
    
    displayNotes.forEach(note => {
      // Skip empty notes for both sections
      if (isNoteEmpty(note)) return;
      
      if (note.is_pinned) {
        // Pinned notes are shown even if they have hidden tags
        pinned.push(note);
      } else {
        // Unpinned notes with hidden tags are hidden (in main view only)
        if (hasHiddenTags(note)) return;
        unpinned.push(note);
      }
    });
    
    return { pinnedNotes: pinned, unpinnedNotes: unpinned };
  }, [displayNotes, isNoteEmpty, hasHiddenTags]);
  
  // Group unpinned notes by month for month separators
  const notesByMonth = useMemo(() => {
    if (searchMode || !showMonthMarkers || view === 'archive' || view === 'trash') {
      // In search mode, archive, trash, or when month markers disabled, return flat list
      return [{ notes: unpinnedNotes, label: null }];
    }
    
    const monthShortNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const grouped = {};
    unpinnedNotes.forEach(note => {
      const date = new Date(note.created_at);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const monthYearKey = `${year}-${month}`;
      
      if (!grouped[monthYearKey]) {
        grouped[monthYearKey] = {
          label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
          year,
          month,
          monthShort: monthShortNames[month - 1],
          notes: [],
          timestamp: date.getTime()
        };
      }
      grouped[monthYearKey].notes.push(note);
    });
    
    // Sort by timestamp descending (newest first)
    return Object.values(grouped).sort((a, b) => b.timestamp - a.timestamp);
  }, [unpinnedNotes, searchMode, showMonthMarkers]);
  
  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const newIsMobile = window.innerWidth <= 768;
      console.log('[ListView] Resize event - new isMobile:', newIsMobile, 'window.innerWidth:', window.innerWidth);
      setIsMobile(newIsMobile);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Create stable loadMore function
  const loadMore = useCallback(() => {
    if (hasMore && !loading) {
      if (searchMode) {
        loadMoreSearchResults();
      } else {
        loadNotes();
      }
    }
  }, [hasMore, loading, searchMode, loadMoreSearchResults, loadNotes]);
  
  // Infinite scroll observer
  useEffect(() => {
    if (!listContentRef.current || !hasMore) return;
    
    const options = {
      root: listContentRef.current,
      rootMargin: '500px',
      threshold: 0.1
    };
    
    const callback = (entries) => {
      if (entries[0].isIntersecting && hasMore && !loading) {
        loadMore();
      }
    };
    
    observerRef.current = new IntersectionObserver(callback, options);
    
    // Observe the load more trigger element
    const triggerElement = listContentRef.current.querySelector('.load-more-trigger');
    if (triggerElement) {
      observerRef.current.observe(triggerElement);
    }
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, loading, loadMore]);
  
  // Ref to track location for stable callback
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  // Reset scroll position when search query or mode changes
  useEffect(() => {
    if (listContentRef.current) {
      listContentRef.current.scrollTop = 0;
    }
  }, [searchQuery, searchMode]);
  
  // Cleanup scroll timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);
  
  // Handle note selection - use URL navigation for consistency with other views
  // First note push to history, subsequent notes replace to avoid back button stacking
  const handleNoteSelect = useCallback((note) => {
    // Use ref to track if we've already opened a note - if so, replace history
    const shouldReplace = hasOpenedNoteRef.current;

    console.log('[ListView] handleNoteSelect - hasOpenedNoteRef.current:', hasOpenedNoteRef.current, 'shouldReplace:', shouldReplace);

    // Mark that we've opened a note
    hasOpenedNoteRef.current = true;

    // Use the new navigation system
    openNote(note.id, 'list-item', { replaceHistory: shouldReplace });
  }, [openNote]);
  
  // Build flat list of all notes for navigation (pinned first, then unpinned by month)
  const allNotesFlat = useMemo(() => {
    const flatList = [];
    // Add pinned notes first (if not in search mode)
    if (!searchMode && view === 'main') {
      pinnedNotes.forEach(note => flatList.push(note));
    }
    // Add unpinned notes (in month order if grouped, or flat)
    if (searchMode) {
      displayNotes.forEach(note => flatList.push(note));
    } else {
      notesByMonth.forEach(monthGroup => {
        monthGroup.notes.forEach(note => flatList.push(note));
      });
    }
    return flatList;
  }, [pinnedNotes, unpinnedNotes, notesByMonth, searchMode, displayNotes, view]);
  
  // Find current note index for prev/next navigation
  const currentNoteIndex = useMemo(() => {
    if (!openedNoteId) return -1;
    return allNotesFlat.findIndex(note => note.id === openedNoteId);
  }, [allNotesFlat, openedNoteId]);
  
  const hasPrevNote = currentNoteIndex > 0;
  const hasNextNote = currentNoteIndex >= 0 && currentNoteIndex < allNotesFlat.length - 1;
  
  // Scroll to a note in the list with smooth animation using data attribute
  const scrollToNote = useCallback((noteId) => {
    setTimeout(() => {
      const element = listContentRef.current?.querySelector(`[data-note-id="${noteId}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 50); // Small delay to let state update
  }, []);
  
  // Navigate to previous note
  const handlePrevNote = useCallback(() => {
    if (currentNoteIndex > 0) {
      const prevNote = allNotesFlat[currentNoteIndex - 1];
      handleNoteSelect(prevNote);
      // Scroll to 2 notes before (keeping 3 notes buffer) if it exists
      const scrollTargetIndex = Math.max(0, currentNoteIndex - 3);
      scrollToNote(allNotesFlat[scrollTargetIndex].id);
    }
  }, [currentNoteIndex, allNotesFlat, handleNoteSelect, scrollToNote]);
  
  // Navigate to next note
  const handleNextNote = useCallback(() => {
    if (currentNoteIndex >= 0 && currentNoteIndex < allNotesFlat.length - 1) {
      const nextNote = allNotesFlat[currentNoteIndex + 1];
      handleNoteSelect(nextNote);
      // Scroll to 2 notes after (keeping 3 notes buffer) if it exists
      const scrollTargetIndex = Math.min(allNotesFlat.length - 1, currentNoteIndex + 3);
      scrollToNote(allNotesFlat[scrollTargetIndex].id);
    }
  }, [currentNoteIndex, allNotesFlat, handleNoteSelect, scrollToNote]);
  
  // Handle closing the note form - use URL navigation
  const handleCloseNote = useCallback(() => {
    // Reset the ref when closing - next note open should push to history
    hasOpenedNoteRef.current = false;

    // Use new navigation system to close the note
    console.log('[ListView] Closing note via new navigation system');
    closeNote('close-button');
  }, [closeNote]);
  
  // Handle scroll to update header and sticky month
  const handleScroll = useCallback((e) => {
    const scrollTop = e.target.scrollTop;
    const container = e.target;
    
    // Dispatch event for header hide/show
    window.dispatchEvent(new CustomEvent('noteListScroll', { 
      detail: { scrollTop } 
    }));
    
    // Skip sticky header logic if month markers are disabled, in search mode, or in archive/trash
    if (!showMonthMarkers || searchMode || view === 'archive' || view === 'trash') {
      setShowStickyHeader(false);
      return;
    }
    
    // Set scrolling state
    isScrollingRef.current = true;
    
    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    // Hide sticky header after scrolling stops
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = false;
      setShowStickyHeader(false);
    }, 1500);
    
    // Calculate month positions relative to scroll container
    const monthPositions = [];
    for (const [label, element] of monthSeparatorRefs.current) {
      const rect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const relativeTop = rect.top - containerRect.top + scrollTop;
      
      // Find the month data from notesByMonth
      const monthData = notesByMonth.find(m => m.label === label);
      if (monthData) {
        monthPositions.push({
          label,
          year: monthData.year,
          monthShort: monthData.monthShort,
          offsetTop: relativeTop
        });
      }
    }
    
    if (monthPositions.length === 0) {
      setShowStickyHeader(false);
      return;
    }
    
    // Sort by position
    monthPositions.sort((a, b) => a.offsetTop - b.offsetTop);
    
    // Find current month based on scroll position
    let currentMonth = monthPositions[0];
    let shouldShow = false;
    
    for (const month of monthPositions) {
      if (scrollTop >= month.offsetTop - 20) {
        currentMonth = month;
        shouldShow = scrollTop > month.offsetTop + 20;
      } else {
        break;
      }
    }
    
    setStickyMonthLabel(currentMonth.label);
    setStickyMonthData(currentMonth);
    setShowStickyHeader(shouldShow && isScrollingRef.current);
  }, [showMonthMarkers, searchMode, notesByMonth, view]);
  
  return (
    <ListViewContainer>
      {/* Left Panel - Notes List */}
      <ListPanel $hasOpenNote={!!openedNoteId}>
        {/* Sticky Month Header - centered on list panel */}
        <StickyMonthHeaderWrapper $show={showStickyHeader && showMonthMarkers && !searchMode && view !== 'archive' && view !== 'trash'}>
          <StickyMonthLabel theme={isDarkTheme ? 'dark' : 'light'}>
            {stickyMonthLabel}
            {stickyMonthData && (
              <MonthSearchStar 
                year={stickyMonthData.year} 
                monthShort={stickyMonthData.monthShort} 
                monthLabel={stickyMonthData.label || stickyMonthLabel} 
              />
            )}
          </StickyMonthLabel>
        </StickyMonthHeaderWrapper>
        <ListContent ref={listContentRef} onScroll={handleScroll}>
          {/* Show EmptyTrashPills on trash page when not in search mode */}
          {!searchMode && view === 'trash' && <EmptyTrashPills />}
          
          {/* Search pills - same as grid view */}
          {searchMode && searchQuery && (
            <div style={{ marginBottom: '24px' }}>
              <FolderHeader searchQuery={searchQuery} />
              <MonthNavigationPills searchQuery={searchQuery} />
              {isExclusiveColorSearch && <ColorSelectorPills searchByColor={searchByColor} searchQuery={searchQuery} />}
              <SubtagPills searchQuery={searchQuery} />
              <CurrentTags searchQuery={searchQuery} />
              <RelatedTags searchQuery={searchQuery} />
            </div>
          )}
          
          {/* Search results header */}
          {searchMode && searchQuery && (
            <SectionTitle>
              {(listLoading || searchCountQuery !== searchQuery) ? (
                <>
                  <CountPill $isDark={isDarkTheme}><CountSpinner /></CountPill>
                  results for "{searchQuery}"
                </>
              ) : (
                <>
                  <CountPill $isDark={isDarkTheme}>{totalNotes}</CountPill>
                  result{totalNotes !== 1 ? 's' : ''} for "{searchQuery}"
                </>
              )}
            </SectionTitle>
          )}
          
          {/* Pinned Notes Section - only show in main view (not search, archive, or trash) */}
          {pinnedNotes.length > 0 && !searchMode && view === 'main' && (
            <>
              <SectionHeader>Pinned</SectionHeader>
              <SectionGroup>
                {pinnedNotes.map((note, index) => (
                  <ListViewItem
                    key={note.id}
                    note={note}
                    isActive={openedNoteId === note.id}
                    isSelected={selectedNoteIds.has(note.id)}
                    isPrevSelected={index > 0 && selectedNoteIds.has(pinnedNotes[index - 1].id)}
                    isNextSelected={index < pinnedNotes.length - 1 && selectedNoteIds.has(pinnedNotes[index + 1].id)}
                    isSelectionMode={selectedNoteIds.size > 0}
                    onSelect={handleNoteSelect}
                    onToggleSelection={toggleNoteSelection}
                    onTogglePin={togglePin}
                    onArchive={archiveNote}
                    onUnarchive={unarchiveNote}
                    onTrash={trashNote}
                    onRestore={restoreNote}
                    onDelete={deleteNote}
                    onChangeColor={changeNoteColor}
                    view={view}
                    searchQuery={searchQuery}
                  />
                ))}
              </SectionGroup>
            </>
          )}
          
          {/* Other Notes Section */}
          {(unpinnedNotes.length > 0 || (searchMode && pinnedNotes.length > 0)) && (
            <>
              {showMonthMarkers && !searchMode && view !== 'archive' && view !== 'trash' ? (
                // Render with month separators - each month in its own group
                notesByMonth.map((monthGroup, index) => (
                  <React.Fragment key={monthGroup.label || index}>
                    {monthGroup.label && (
                      <MonthSeparator 
                        ref={registerMonthSeparatorRef(monthGroup.label)}
                        $hasSection={pinnedNotes.length > 0}
                      >
                        <MonthLabel theme={isDarkTheme ? 'dark' : 'light'}>
                          {monthGroup.label}
                          <MonthSearchStar 
                            year={monthGroup.year} 
                            monthShort={monthGroup.monthShort} 
                            monthLabel={monthGroup.label} 
                          />
                        </MonthLabel>
                      </MonthSeparator>
                    )}
                    <SectionGroup>
                      {monthGroup.notes.map((note, index) => (
                        <ListViewItem
                          key={note.id}
                          note={note}
                          isActive={openedNoteId === note.id}
                          isSelected={selectedNoteIds.has(note.id)}
                          isPrevSelected={index > 0 && selectedNoteIds.has(monthGroup.notes[index - 1].id)}
                          isNextSelected={index < monthGroup.notes.length - 1 && selectedNoteIds.has(monthGroup.notes[index + 1].id)}
                          isSelectionMode={selectedNoteIds.size > 0}
                          onSelect={handleNoteSelect}
                          onToggleSelection={toggleNoteSelection}
                          onTogglePin={togglePin}
                          onArchive={archiveNote}
                          onUnarchive={unarchiveNote}
                          onTrash={trashNote}
                          onRestore={restoreNote}
                          onDelete={deleteNote}
                          onChangeColor={changeNoteColor}
                          view={view}
                          searchQuery={searchQuery}
                        />
                      ))}
                    </SectionGroup>
                  </React.Fragment>
                ))
              ) : (
                // Render flat list (in search mode, include all notes)
                <SectionGroup>
                  {(() => {
                    const notesToRender = searchMode ? displayNotes : unpinnedNotes;
                    return notesToRender.map((note, index) => (
                      <ListViewItem
                        key={note.id}
                        note={note}
                        isActive={openedNoteId === note.id}
                        isSelected={selectedNoteIds.has(note.id)}
                        isPrevSelected={index > 0 && selectedNoteIds.has(notesToRender[index - 1].id)}
                        isNextSelected={index < notesToRender.length - 1 && selectedNoteIds.has(notesToRender[index + 1].id)}
                        isSelectionMode={selectedNoteIds.size > 0}
                        onSelect={handleNoteSelect}
                        onToggleSelection={toggleNoteSelection}
                        onTogglePin={togglePin}
                        onArchive={archiveNote}
                        onUnarchive={unarchiveNote}
                        onTrash={trashNote}
                        onRestore={restoreNote}
                        onDelete={deleteNote}
                        onChangeColor={changeNoteColor}
                        view={view}
                        searchQuery={searchQuery}
                      />
                    ));
                  })()}
                </SectionGroup>
              )}
            </>
          )}
          
          {/* Loading indicator */}
          {(loading || listLoading) && (
            <LoadingMessage style={{ height: '100%', paddingTop: '0' }}>
              <Spinner />
              Loading notes...
            </LoadingMessage>
          )}
          
          {/* Load more trigger */}
          {hasMore && !loading && !listLoading && (
            <LoadMoreTrigger className="load-more-trigger">
              <LoadMoreButton onClick={loadMore}>
                Load More
              </LoadMoreButton>
            </LoadMoreTrigger>
          )}
          
          {/* End of results - show month navigation pills at bottom */}
          {!hasMore && !loading && !listLoading && displayNotes.length > 0 && (
            <>
              {searchMode && searchQuery && (
                <div style={{ marginTop: '20px', marginBottom: '10px' }}>
                  <MonthNavigationPills searchQuery={searchQuery} />
                </div>
              )}
            </>
          )}
          
          {/* Empty state */}
          {!loading && !listLoading && displayNotes.length === 0 && (
            <EmptyDetailState style={{ padding: '40px 20px' }}>
              <Icon name={searchMode ? 'search' : view === 'trash' ? 'trash' : view === 'archive' ? 'archive' : 'notes'} size={96} />
              <span>{searchMode ? 'No notes found' : view === 'trash' ? 'Trash is empty' : view === 'archive' ? 'No archived notes' : 'No notes to show'}</span>
            </EmptyDetailState>
          )}
        </ListContent>
      </ListPanel>
      
      {/* Right Panel - Note Detail (Desktop) or Full Screen (Mobile via NoteForm) */}
      {!isMobile && (
        <DetailPanel $hasOpenNote={!!openedNoteId}>
          {openedNote ? (
            <NoteForm
              data-source="ListView.jsx-desktop"
              ref={noteFormRef}
              note={openedNote}
              onClose={handleCloseNote}
              isListView={true}
              onPrevNote={handlePrevNote}
              onNextNote={handleNextNote}
              hasPrevNote={hasPrevNote}
              hasNextNote={hasNextNote}
            />
          ) : (
            <EmptyDetailState>
              <Icon name="notes" size={72} />
              <span>Select a note to view</span>
            </EmptyDetailState>
          )}
        </DetailPanel>
      )}

      {/* Mobile - render NoteForm in full screen mode when note is open */}
      {isMobile && openedNote && (
        <NoteForm
          data-source="ListView.jsx-mobile"
          ref={noteFormRef}
          note={openedNote}
          onClose={handleCloseNote}
          isListView={false}
        />
      )}
    </ListViewContainer>
  );
}

export default ListView;
