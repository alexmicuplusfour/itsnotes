import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styled, { css } from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
// --- Updated StarredNotesContext import ---
import { useStarredNotes } from '../contexts/StarredNotesContext';
// ------------------------------------------
import { useNotes } from '../contexts/NotesContext';
import { useUIPreferences } from '../contexts/UIPreferencesContext'; // Import useUIPreferences
import { useTyping } from '../contexts/TypingContext'; // Import useTyping
import { useNavigation } from '../navigation'; // NEW: Use centralized navigation
import { notesApi } from '../services/api';
import Icon from './Icons'; // Make sure Icon component supports name="star-outline"
import CircularProgress from './CircularProgress';

// --- Helper Function convertToRGBA (remains the same) ---
function convertToRGBA(color, alpha = 1) {
    // ... (function code as before)
    const isCssVar = color && color.startsWith('var(');
    let resolvedColor = color;

    if (isCssVar || (color && !color.startsWith('rgb'))) {
        if (typeof document === 'undefined') {
            // console.warn("[FixedTabs Styled] Cannot compute color without document. Using fallback grey.");
            return `rgba(128, 128, 128, ${alpha})`; // Return grey on server
        }
        const temp = document.createElement('div');
        temp.style.color = color;
        temp.style.display = 'none';
        document.body.appendChild(temp);
        try {
            resolvedColor = window.getComputedStyle(temp).color;
        } catch (e) {
            console.error("[FixedTabs Styled] Could not compute color:", color, e);
            resolvedColor = 'rgba(0,0,0,0.1)'; // Fallback
        } finally {
            if (temp.parentNode === document.body) {
                document.body.removeChild(temp);
            }
        }
    }

    if (resolvedColor && resolvedColor.startsWith('rgba')) {
        return resolvedColor.replace(/[\d\.]+\)$/g, `${alpha})`);
    }

    if (resolvedColor && resolvedColor.startsWith('rgb(')) {
        return resolvedColor.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
    }

    console.warn("[FixedTabs Styled] Could not convert color to RGBA:", resolvedColor || color);
    return `rgba(128, 128, 128, ${alpha})`; // Grey fallback
}


// --- Styled Components ---

const StyledContainer = styled.div`
  position: fixed;
  top: 45%;
  right: -14px; /* Your adjusted value */
  transform: translateY(-50%);
  z-index: 1101;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 5px;
  margin-top: 50px;
  padding-bottom: 60px;

  /* Add transition for opacity */
  transition: opacity 0.3s ease-in-out;
  opacity: ${props => props.$isTyping ? 0.3 : 1}; /* Apply opacity based on prop */
  filter: grayscale(${props => props.$isTyping ? 1 : 0}); /* Apply grayscale based on prop */
  pointer-events: ${props => props.$isTyping ? 'none' : 'auto'};

  transform: translateY(-50%) ${props => props.$isTyping ? 'translateX(20px)' : 'translateX(0)'};
`;

// Add data-fixed-tabs-container attribute here
const StyledContainerWithDataAttr = styled(StyledContainer).attrs(() => ({
  'data-fixed-tabs-container': true,
}))``;


const StyledTabItem = styled(motion.div)`
  /* Common Base Styles */
  width: 44px; /* Your adjusted value */
  height: 34px; /* This acts as the base height for flex shrinking */
  /* If shrinking becomes extreme, you might add a min-height */
  /* min-height: 20px; */
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  display: flex;
  align-items: center;
  padding-right: 6px; /* Increased to move icon left */
  justify-content: center;
  /* Removed CSS transition */
  position: relative; /* Add this for absolute positioning of progress */

  /* CSS containment to isolate style recalculation and prevent scrollbar-color cascade */
  contain: layout style paint;
  will-change: transform; /* Hint to browser that transform will change */

  border-top-left-radius: 16px;
  border-bottom-left-radius: 16px;

  /* flex-shrink: 1; */ /* This is the default, no need to add explicitly */

    outline: 1px solid rgba(255, 255, 255, 0.05);
    outline-offset: -1px;
  

  /* Conditional Styles */
  ${props =>
    !props.isLoading && css` /* Applied !isLoading condition here */
          /* Regular Tab Base Styles */
          background-color: var(--note-bg-color);
          color: var(--text-color);
          font-weight: bold;
          font-size: 14px;
          box-shadow: -2px 2px 60px rgba(0, 0, 0, 0.2);
          outline: 1px solid var(--border-transparent);
          border: none; /* Removed border-left-width: 1px to prevent layout thrashing */
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          cursor: pointer;

          /* Dynamic Color - using CSS variable set via inline style */
          /* This prevents styled-components from generating new classes for each color */
          background-color: var(--tab-bg-color, var(--note-bg-color));
          color: var(--tab-text-color, var(--text-color));

          /* Active Tab Highlight Styles */
           ${props.isActive && css`
                 border-right: 3px solid var(--text-color);
            `}
        `
  }
`;

// --- Component Logic (optimized to reduce re-renders) ---
const FixedTabs = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { starredNoteIds, toggleStar, removeStar, getNoteScrollPosition, setNoteScrollPosition } = useStarredNotes();
    const { notes, searchResults, searchMode, openedNote } = useNotes();
    const { showNoteTabs } = useUIPreferences();
    const { isTyping } = useTyping(); // Get isTyping state from context

    // NEW: Use centralized navigation system
    const { openNote, closeNote } = useNavigation();

    const [fetchedNoteDetails, setFetchedNoteDetails] = useState({});
    const [currentScrollPosition, setCurrentScrollPosition] = useState(0);
    const currentScrollPositionRef = useRef(0); // Add ref to track current position immediately
    const [contentIsScrollable, setContentIsScrollable] = useState({}); // Track which notes have scrollable content
    const scrollCaptureIntervalRef = React.useRef(null);

    // Memoize showNoteTabs check to prevent unnecessary log spam
    const shouldShowTabs = useMemo(() => {
        if (!showNoteTabs) {
            console.log("FixedStarredNotesTabs: Hiding tabs because showNoteTabs =", showNoteTabs);
            return false;
        }
        return true;
    }, [showNoteTabs]);

    // If note tabs are set to be hidden, don't render
    if (!shouldShowTabs) {
        return null;
    }

    const currentNoteId = useMemo(() => {
        // First check openedNote from context (used in List View)
        if (openedNote?.id) {
            return openedNote.id;
        }
        // Fall back to URL param (used in other views) - supports note stack
        const searchParams = new URLSearchParams(location.search);
        const noteParam = searchParams.get('note');
        // If it's a stack, get the last (current) note ID
        return noteParam ? noteParam.split(',').pop() : null;
    }, [location.search, openedNote?.id]);

    const sourceNotes = useMemo(() => (searchMode ? searchResults : notes), [searchMode, searchResults, notes]);

    // --- useEffect for fetching data (optimized to reduce runs) ---
    useEffect(() => {
        const fetchMissingDetails = async () => {
            const relevantIds = new Set(starredNoteIds || []);
            if (currentNoteId) {
                relevantIds.add(currentNoteId);
            }

            if (relevantIds.size === 0) {
                setFetchedNoteDetails({});
                return;
            }

            const sourceNotesMap = new Map(sourceNotes.map(note => [note.id, note]));
            const idsToFetch = [];
            const updatesToClearLoading = {};

            // Determine which IDs need fetching and clear loading state for existing notes
            relevantIds.forEach(id => {
                const isInContext = sourceNotesMap.has(id);
                const fetchedInfo = fetchedNoteDetails[id];

                if (isInContext) {
                    if (fetchedInfo?.isLoading) {
                        updatesToClearLoading[id] = { ...fetchedInfo, isLoading: false, needsRefetch: false };
                    }
                } else {
                    if (!fetchedInfo || fetchedInfo.needsRefetch || fetchedInfo.isLoading) {
                        idsToFetch.push(id);
                    }
                }
            });

            // Apply updates for notes that are now in context
            if (Object.keys(updatesToClearLoading).length > 0) {
                 setFetchedNoteDetails(prev => ({ ...prev, ...updatesToClearLoading }));
             }

            if (idsToFetch.length === 0) {
                return;
            }

            // Set loading state for notes to be fetched
            const loadingUpdates = {};
            idsToFetch.forEach(id => {
                loadingUpdates[id] = { ...(fetchedNoteDetails[id] || { id }), isLoading: true, needsRefetch: false, error: false };
            });
            setFetchedNoteDetails(prev => ({ ...prev, ...loadingUpdates }));

            // Fetch data
            const promises = idsToFetch.map(id =>
                notesApi.getNote(id, false)
                .then(note => ({ id, title: note?.title, color: note?.color, isLoading: false, error: !note }))
                .catch(error => {
                    console.error(`[FixedTabs] Failed fetch for ${id}:`, error);
                    return { id, isLoading: false, error: true };
                })
            );

            try {
                const results = await Promise.all(promises);
                const updates = {};
                results.forEach(result => {
                    updates[result.id] = result;
                });
                 // Use functional update to merge safely
                setFetchedNoteDetails(prev => {
                    const newState = { ...prev };
                    Object.keys(updates).forEach(id => {
                         // Only update if the note exists in the previous state or is newly fetched
                         // Merge new data over existing, preserving other potential fields if needed
                         newState[id] = { ...(prev[id] || {}), ...updates[id] };
                    });
                    return newState;
                });
            } catch (error) {
                console.error('[FixedTabs] Error processing fetched note details:', error);
                // Optionally handle global fetch error state
            }
        };

        if (typeof document !== 'undefined') {
            fetchMissingDetails();
        }
    }, [starredNoteIds, currentNoteId, sourceNotes]); // Removed notesApi and fetchedNoteDetails dependencies

    // --- Memoize the combined list of notes ---
    const tabNotesData = useMemo(() => {
        const sourceNotesMap = new Map(sourceNotes.map(note => [note.id, note]));
        const notesForTabs = new Map();

        // Add starred notes
        (starredNoteIds || []).forEach(id => {
            if (!notesForTabs.has(id)) {
                const noteFromContext = sourceNotesMap.get(id);
                if (noteFromContext) {
                    notesForTabs.set(id, { ...noteFromContext, isLoading: false, error: false });
                } else {
                    const noteFromState = fetchedNoteDetails[id];
                    if (noteFromState && !noteFromState.error) {
                        notesForTabs.set(id, { ...noteFromState });
                    } else if (!noteFromState || noteFromState.isLoading) { // If loading or not yet fetched
                        notesForTabs.set(id, { id, isLoading: true, error: false });
                    } // Ignore if error state
                }
            }
        });

        // Add current note if not already included
        if (currentNoteId && !notesForTabs.has(currentNoteId)) {
            const noteFromContext = sourceNotesMap.get(currentNoteId);
            if (noteFromContext) {
                notesForTabs.set(currentNoteId, { ...noteFromContext, isLoading: false, error: false });
            } else {
                const noteFromState = fetchedNoteDetails[currentNoteId];
                if (noteFromState && !noteFromState.error) {
                    notesForTabs.set(currentNoteId, { ...noteFromState });
                } else if (!noteFromState || noteFromState.isLoading) { // If loading or not yet fetched
                    notesForTabs.set(currentNoteId, { id: currentNoteId, isLoading: true, error: false });
                } // Ignore if error state
            }
        }

        // Filter out any potential errors that might have slipped through and convert Map to Array
        return Array.from(notesForTabs.values()).filter(note => note && !note.error);

    }, [starredNoteIds, currentNoteId, sourceNotes, fetchedNoteDetails]); // fetchedNoteDetails is needed here

    // Function to capture current scroll position
    const captureCurrentScrollPosition = useCallback(() => {
        if (!currentNoteId) return;

        // Try to find the ScrollableContent element (previously ProseMirror)
        const scrollableElement = document.querySelector('.note-scrollable-content');
        if (scrollableElement) {
            const scrollTop = scrollableElement.scrollTop;
            const scrollHeight = scrollableElement.scrollHeight;
            const offsetHeight = scrollableElement.offsetHeight;
            
            // Check if content is at least 2.5x the viewport height to show progress
            const isScrollable = scrollHeight >= (offsetHeight * 2.5);
            setContentIsScrollable(prev => ({
                ...prev,
                [currentNoteId]: isScrollable
            }));
            
            // Only capture scroll position if content meets the threshold for showing progress
            if (isScrollable && scrollHeight > offsetHeight) {
                const maxScroll = scrollHeight - offsetHeight;
                const scrollRatio = maxScroll > 0 ? scrollTop / maxScroll : 0;
                
                // Use ref for immediate comparison to prevent race conditions
                const currentPos = currentScrollPositionRef.current;
                
                // Only update if change is significant AND the value is actually different
                if (Math.abs(scrollRatio - currentPos) > 0.01 && scrollRatio !== currentPos) {
                    // Update both ref (immediate) and state (for React)
                    currentScrollPositionRef.current = scrollRatio;
                    setCurrentScrollPosition(scrollRatio);
                    
                    // Update the stored position for the current note
                    setNoteScrollPosition(currentNoteId, scrollRatio);
                    console.log(`[FixedTabs] Updated scroll position for ${currentNoteId}: ${scrollRatio} (prev: ${currentPos})`);
                } else {
                    // Optional: Add debug log to see when we skip updates
                    // console.log(`[FixedTabs] Skipping scroll update for ${currentNoteId}: ${scrollRatio} (current: ${currentPos}, diff: ${Math.abs(scrollRatio - currentPos)})`);
                }
            } else {
                // If content doesn't meet threshold or fits entirely in viewport, reset scroll position
                const currentPos = currentScrollPositionRef.current;
                if (currentPos !== 0) {
                    currentScrollPositionRef.current = 0;
                    setCurrentScrollPosition(0);
                    setNoteScrollPosition(currentNoteId, 0);
                    console.log(`[FixedTabs] Reset scroll position for ${currentNoteId} (doesn't meet threshold or fits in viewport)`);
                }
            }
        } else {
            console.log(`[FixedTabs] Scrollable element not found for scroll capture`);
        }
    }, [currentNoteId, setNoteScrollPosition]); // starredNoteIds not needed here - callback doesn't use it

        // Set up scroll monitoring for the current note ONLY if it has a tab
    useEffect(() => {
        if (!currentNoteId) {
            // Clear any existing interval when no note is open
            if (scrollCaptureIntervalRef.current) {
                clearInterval(scrollCaptureIntervalRef.current);
                scrollCaptureIntervalRef.current = null;
            }
            currentScrollPositionRef.current = 0;
            setCurrentScrollPosition(0);
            // Don't clear contentIsScrollable here as we want to preserve it for tabs
            return;
        }

        // Check if the current note has a tab (is starred OR is in tabNotesData)
        const noteHasTab = starredNoteIds?.includes(currentNoteId) || 
                          tabNotesData?.some(note => note.id === currentNoteId);

        if (!noteHasTab) {
            console.log(`[FixedTabs] Note ${currentNoteId} doesn't have a tab, not monitoring scroll`);
            // Clear any existing interval if note doesn't have a tab
            if (scrollCaptureIntervalRef.current) {
                clearInterval(scrollCaptureIntervalRef.current);
                scrollCaptureIntervalRef.current = null;
            }
            currentScrollPositionRef.current = 0;
            setCurrentScrollPosition(0);
            return;
        }

        console.log(`[FixedTabs] Note ${currentNoteId} has a tab, setting up scroll monitoring`);

        // Get initial scroll position for the note
        const initialPosition = getNoteScrollPosition(currentNoteId);
        currentScrollPositionRef.current = initialPosition;
        setCurrentScrollPosition(initialPosition);

        // Set up scroll monitoring
        const startScrollMonitoring = () => {
            // Clear any existing interval
            if (scrollCaptureIntervalRef.current) {
                console.log(`[FixedTabs] Clearing existing interval for ${currentNoteId}`);
                clearInterval(scrollCaptureIntervalRef.current);
            }

            console.log(`[FixedTabs] Starting new scroll interval for ${currentNoteId}`);
            // Capture scroll position every 200ms while note is open
            scrollCaptureIntervalRef.current = setInterval(() => {
                captureCurrentScrollPosition();
            }, 200);
        };

        // Start monitoring after a short delay to ensure the editor is ready
        const startTimer = setTimeout(startScrollMonitoring, 400);

        // Cleanup function - capture final scroll position when note is about to close
        return () => {
            clearTimeout(startTimer);
            if (scrollCaptureIntervalRef.current) {
                clearInterval(scrollCaptureIntervalRef.current);
                scrollCaptureIntervalRef.current = null;
            }
            // Capture final scroll position before cleanup
            if (currentNoteId && noteHasTab) {
                captureCurrentScrollPosition();
            }
        };
    }, [currentNoteId, starredNoteIds]); // Removed tabNotesData to prevent excessive restarts

    // Clean up contentIsScrollable state for notes that no longer have tabs
    useEffect(() => {
        const currentTabIds = new Set(tabNotesData.map(note => note.id));
        setContentIsScrollable(prev => {
            const updated = {};
            Object.keys(prev).forEach(noteId => {
                if (currentTabIds.has(noteId)) {
                    updated[noteId] = prev[noteId];
                }
            });
            return updated;
        });
    }, [tabNotesData]);

    // Capture scroll position when the component unmounts or the page is about to unload
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (currentNoteId) {
                captureCurrentScrollPosition();
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            // Final capture on component unmount
            if (currentNoteId) {
                captureCurrentScrollPosition();
            }
        };
    }, [currentNoteId]); // Removed captureCurrentScrollPosition dependency since it should be stable


    // --- handleTabClick (UPDATED to use new navigation system) ---
    const handleTabClick = useCallback((noteId) => {
        const noteData = tabNotesData.find(n => n.id === noteId);
        if (noteData?.isLoading) {
          return; // Ignore clicks on loading tabs
        }

        // Use openedNote for active note detection
        const activeNoteId = openedNote?.id;

        if (noteId === activeNoteId) { // Clicked the ACTIVE tab
          const isCurrentNoteStarred = starredNoteIds?.includes(noteId);
          if (isCurrentNoteStarred) { // Close action (if starred)
            // NEW: Use centralized navigation
            console.log('[FixedStarredNotesTabs] Closing active starred note via navigation system');
            closeNote('close-button');
          } else { // Star action (if not starred)
            toggleStar(noteId);
            // No navigation change needed, just toggle star state
          }
        } else { // Clicked an INACTIVE tab (Open action)
          // NEW: Use centralized navigation system
          // This automatically handles:
          // - Saving current note
          // - Scroll position management
          // - History management

          // Get saved scroll position (as ratio 0-1) and convert to scroll value for URL
          const scrollRatio = getNoteScrollPosition(noteId);
          // Convert ratio to scroll value (0-1000 range for URL storage)
          const scrollValue = Math.round(scrollRatio * 1000);

          // Determine if we should replace history:
          // - If a note is already open (activeNoteId exists), replace it (tab switching)
          // - If no note is open, push to history (opening first note)
          const shouldReplace = !!activeNoteId;

          console.log('[FixedStarredNotesTabs] Opening note from starred tab:', noteId,
                      'with scroll ratio:', scrollRatio, 'scroll value:', scrollValue,
                      'replaceHistory:', shouldReplace);

          // Pass scroll position to navigation system
          openNote(noteId, 'starred-tab', {
            scrollPosition: scrollValue,
            replaceHistory: shouldReplace  // Replace when switching tabs, push when opening first
          });
        }
    }, [
        tabNotesData, // Check isLoading
        starredNoteIds, // Check if starred
        toggleStar, // Action to star
        openedNote?.id, // Active note detection
        openNote, // NEW
        closeNote, // NEW
        getNoteScrollPosition, // NEW: For scroll restoration
    ]);
    // --- handleTabContextMenu (Right-click / Long-press to unstar) ---
    const handleTabContextMenu = useCallback((noteId, e) => {
        const isNoteStarred = starredNoteIds?.includes(noteId);
        if (!isNoteStarred) return; // Only handle for starred notes
        
        e.preventDefault();
        e.stopPropagation();

        // Trigger haptic feedback if available (for mobile)
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }

        // Unstar the note
        removeStar(noteId);
        console.log(`[FixedTabs] Unstarred note ${noteId} via context menu`);
    }, [starredNoteIds, removeStar]);

    // Render nothing if there are no tabs to display after filtering
    if (!tabNotesData || tabNotesData.length === 0) {
        console.log('[FixedTabs] No tabs to display, rendering null');
        return null;
    }


    // --- Render Logic ---
    return (
        // Pass isTyping state as a prop to the styled container
        <StyledContainerWithDataAttr $isTyping={isTyping}>
            <AnimatePresence initial={false}>
                {tabNotesData.map((note) => {
                    const isActive = !note.isLoading && note.id === currentNoteId;
                    const isNoteStarred = starredNoteIds?.includes(note.id);
                    const scrollProgress = isActive ? currentScrollPosition : getNoteScrollPosition(note.id);
                    const noteIsScrollable = isActive ? contentIsScrollable[note.id] : contentIsScrollable[note.id];
                    const shouldShowProgress = !note.isLoading && noteIsScrollable && scrollProgress > 0.01;

                    // Compute inline style for color CSS variables - avoids styled-components class regeneration
                    const tabColorStyle = note.color && note.color !== 'default'
                        ? {
                            '--tab-bg-color': `var(--note-color-${note.color})`,
                            '--tab-text-color': 'var(--text-color-on-colored-tab)'
                          }
                        : {};

                    return (
                        <StyledTabItem
                            key={note.id}
                            isLoading={note.isLoading}
                            isActive={isActive}
                            style={tabColorStyle}
                            onClick={!note.isLoading ? () => handleTabClick(note.id) : undefined}
                            onContextMenu={!note.isLoading && isNoteStarred ? (e) => handleTabContextMenu(note.id, e) : undefined}
                             title={
                                note.isLoading
                                    ? 'Loading...'
                                    : isActive
                                        ? (isNoteStarred ? 'Close note' : 'Star note')
                                        : shouldShowProgress
                                            ? `${note.title || 'Untitled Note'} (${Math.round(scrollProgress * 100)}% read)`
                                            : `${note.title || 'Untitled Note'}`
                            }

                            // Framer Motion Props
                            layout="position" // Handles smooth reordering/resizing
                            initial={{ opacity: 0, x: 30 }}
                             animate={{
                                opacity: note.isLoading ? 0.5 : 1, // Dim loading tabs
                                x: isActive ? -9 : 0,
                                // Height is now controlled by flexbox + base height, but animation still applies
                                // If you added min-height, ensure animations don't conflict
                                // height: isActive ? '40px' : '35px', // Example: You COULD animate height too, but flex handles the shrinking
                             }}
                            exit={{ opacity: 0, x: 30, transition: { duration: 0.15 } }}
                            transition={{ type: 'spring', stiffness: 500, damping: 30, duration: 0.2 }} // Spring for smooth position/size changes
                        >
                            {/* Circular Progress Indicator */}
                            <CircularProgress
                                progress={Math.max(scrollProgress, 0)}
                                noteColor={note.color}
                                show={shouldShowProgress}
                            />
                            
                            {/* Tab Icon */}
                            {note.isLoading ? (
                                <Icon name="loader" size={18} className="spin" /> /* Example loading indicator */
                            ) : isActive ? (
                                isNoteStarred ? (
                                    <Icon name="close" size={18} strokeWidth="3" />
                                ) : (
                                    <Icon name="star-outline" size={18} strokeWidth="2"/>
                                )
                            ) : (
                                <Icon name="arrow_left_caret" size={18} strokeWidth="3"/>
                            )}
                        </StyledTabItem>
                    );
                })}
            </AnimatePresence>
        </StyledContainerWithDataAttr>
    );
};

export default FixedTabs;
