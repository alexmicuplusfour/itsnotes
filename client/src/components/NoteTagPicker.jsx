import React, { useState, useRef, useEffect, useMemo, useLayoutEffect } from 'react'; // Added useLayoutEffect
import ReactDOM, { flushSync } from 'react-dom'; // Keep flushSync
import styled, { keyframes } from 'styled-components';
import { useTags } from '../contexts/TagsContext';
import { useUIPreferences } from '../contexts/UIPreferencesContext';
import { useNotes } from '../contexts/NotesContext';
import { useNoteSelection } from '../contexts/NoteSelectionContext'; // Import useNoteSelection
import { useAutoTagging, AUTO_TAG_FEATURES } from '../contexts/AutoTaggingContext';
import { useToast } from '../contexts/ToastContext'; // Import global toast
import { tagsApi, aiApi } from '../services/api';
import { clearTagCache } from '../hooks/useNoteTagsModal'; // Import clearTagCache
import Icon from './Icons'; // Assuming Icon component is correctly imported
import SVGCheckbox from './SVGCheckbox'; // Assuming SVGCheckbox is correctly imported

const slideUp = keyframes`
  from { transform: translateY(60px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
`;

const slideDown = keyframes`
  from { transform: translateY(0); opacity: 1; }
  to { transform: translateY(60px); opacity: 0; }
`;

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const fadeOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

// --- Styled Components ---

// Shared styled components (assuming these are correct)
const TagCheckbox = styled.input`
  margin-right: 12px;
  cursor: pointer;
  width: 18px;
  height: 18px;
`;

const TagName = styled.label`
  font-size: 15px;
  cursor: pointer;
  flex: 1;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 30px 0;
  color: var(--text-color);
  opacity: 0.7;
`;

const TagCheckboxList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

const TagCheckboxItem = styled.li`
  display: flex;
  align-items: center;
  padding: 12px 8px;
  border-bottom: 1px solid var(--note-border-color);

  &:last-child {
    border-bottom: none;
  }
`;

// Tag Picker styles
const TagPickerContainer = styled.div`
  position: absolute;
  top: ${props => props.$top ? `${props.$top}px` : '0px'};
  left: ${props => props.$left ? `${props.$left}px` : '0px'};
  padding: 12px;
  background-color: var(--dropdown-bg-color);
  border-radius: 8px;
  box-shadow: 0 2px 10px var(--shadow-color);
  z-index: 1200; // Higher z-index
  color: var(--text-color);
  width: 250px;

  opacity: ${props => props.$isPositioned ? 1 : 0};
  transform: ${props => props.$isPositioned ? 'scale(1)' : 'scale(0.95)'};
  pointer-events: ${props => props.$isPositioned ? 'auto' : 'none'};
  transform-origin: top left;

  transition-property: opacity, transform, top, left;
  transition-duration: 0.1s, 0.1s, ${props => props.$isTransitionEnabled && !props.$suppressPositionTransitions ? '0.15s' : '0s'}, ${props => props.$isTransitionEnabled && !props.$suppressPositionTransitions ? '0.15s' : '0s'};
  transition-timing-function: ease-out;

  @media (max-width: 768px) {
    position: fixed;
    width: 100%;
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    border-radius: 12px 12px 0 0;
    border-left: none;
    border-right: none;
    border-bottom: none;
    box-sizing: border-box;
    box-shadow: 0 -2px 60px var(--shadow-color);
    background-color: ${props => props.$noteColor && props.$noteColor !== 'default' 
      ? `var(--note-color-${props.$noteColor})` 
      : 'var(--dropdown-bg-color)'};
    transform: translateY(0);
    transform-origin: bottom center;
    animation: ${props => props.$isClosing ? slideDown : slideUp} 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    
    /* Prevent internal layout changes from affecting animation */
    contain: layout style;
  }
`;

const TagPickerOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 1199; // Lower z-index than picker

  display: none;
  opacity: 0;
  pointer-events: none;

  @media (max-width: 768px) {
    display: block; // Only display on mobile
    pointer-events: auto;
    animation: ${props => props.$isClosing ? fadeOut : fadeIn} 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }
`;

const TagPickerList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 225px;
  overflow-y: auto;
  
  /* Performance optimization: isolate rendering to prevent page reflows */
  contain: layout style paint;
  will-change: auto;
  
  &::-webkit-scrollbar { width: 8px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background-color: rgba(0, 0, 0, 0.2); border-radius: 20px; }
  .dark-theme & ::-webkit-scrollbar-thumb { background-color: rgba(255, 255, 255, 0.2); }

  @media (max-width: 768px) {
      max-height: 50vh; /* Adjust as needed */
  }
`;

const TagPickerItem = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between; // Push icon to the right if present
  padding: 6px 4px;
  border-radius: 4px;
  height: 38px;
  gap: 8px; // Add gap between checkbox and icon

  &:hover {
    background-color: ${props => props.theme === 'dark'
      ? 'rgba(255, 255, 255, 0.08)'
      : 'rgba(0, 0, 0, 0.05)'};
  }

  @media (max-width: 768px) {
    padding: 6px 10px;
  }

  & > *:first-child {
      flex-grow: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
  }
`;

const VisibilityIconWrapper = styled.span`
  display: inline-flex;
  align-items: center;
  flex-shrink: 0; // Prevent icon from shrinking
  opacity: 0.65; // Make it slightly less prominent
  color: var(--text-color); // Inherit text color
  cursor: help; // Indicate hover tooltip is available
`;

const AddTagWrapper = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0px 4px 0px;
  margin-top: 8px;
  
  @media (max-width: 768px) {
      border-top: none;
  }
`;

const AddTagHeader = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
`;

const AddTagInputWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 4px;
  height: 34px;
  border-radius: 8px;
  background-color: var(--input-bg-color);

  @media (max-width: 768px) {
    height: 42px;
  }
`;

const AddTagInput = styled.input`
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  font-size: 14px;
  color: var(--text-color);
  line-height: normal;
  height: 100%;
  box-sizing: border-box;
  background: transparent;

  @media (max-width: 768px) {
    font-size: 15px;
  }
`;

const TagActionButton = styled.button`
  flex-shrink: 0;
  background: none;
  border: none;
  padding: 0;
  color: var(--text-color);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  width: 26px;
  border-radius: 50%;

  &:hover:not(:disabled) {
    background-color: rgba(128, 128, 128, 0.1);
  }
  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    background-color: transparent;
  }

  @media (max-width: 768px) {
    height: 32px;
    width: 32px;
  }

  &.create-button {
    background-color: var(--foreground-color);
    color: var(--text-color-contrast);
    &:hover:not(:disabled) { background-color: var(--foreground-color); }
  }
`;

const AutoTagLink = styled.button`
  background: none;
  border: none;
  color: var(--text-color);
  opacity: 0.7;
  cursor: pointer;
  font-size: 13px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    opacity: 1;
    text-decoration: underline;
  }
`;

const ViewToggleHeader = styled.div`
  display: flex;
  gap: 4px;
  padding: 4px;
  margin-bottom: 8px;
  /* width: 100%; */
`;

const ViewToggleButton = styled.button`
  flex: 1; /* Makes the buttons stretch to fill available space equally */
  justify-content: center; /* Centers the text horizontally */
  
  background: none;
  border: none;
  color: var(--text-color);
  cursor: pointer;
  font-size: 13px;
  padding: 6px 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 6px;
  opacity: 0.7;

  &:hover {
    opacity: 1;
    background-color: rgba(128, 128, 128, 0.1);
  }

  &.active {
    opacity: 1;
    font-weight: 600;
    background-color: rgba(128, 128, 128, 0.15);
  }
`;

const DeleteFolderButton = styled.button`
  background: none;
  border: none;
  color: var(--text-color);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
  border-radius: 4px;

  &:hover {
    opacity: 1;
    background-color: rgba(255, 0, 0, 0.1);
    color: #ff3333;
  }
`;

const DesktopHeaderRow = styled.div`
  padding: 0 0 8px 0;
  display: flex;
  justify-content: flex-end;
  
  @media (max-width: 768px) {
    display: none;
  }
`;

const MobileHeaderRow = styled.div`
  display: none;
  
  @media (max-width: 768px) {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 0 8px 0;
  }
`;

const SelectedTagsScroller = styled.div`
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  
  /* Hide scrollbar but keep functionality */
  -ms-overflow-style: none;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
`;

const SelectedTagChip = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  background-color: ${props => {
    if (props.$isFolder) {
      // Folders: dark background in light theme, white background in dark theme
      return props.theme === 'dark'
        ? 'rgba(255, 255, 255, 0.9)'
        : 'rgba(0, 0, 0, 0.8)';
    }
    return props.theme === 'dark'
      ? 'rgba(255, 255, 255, 0.12)'
      : 'rgba(0, 0, 0, 0.08)';
  }};
  border-radius: 12px;
  font-size: 12px;
  white-space: nowrap;
  flex-shrink: 0;
  color: ${props => {
    if (props.$isFolder) {
      // Folders: light text in light theme (dark bg), dark text in dark theme (white bg)
      return props.theme === 'dark'
        ? 'rgba(0, 0, 0, 0.9)'
        : 'rgba(255, 255, 255, 0.95)';
    }
    return 'var(--text-color)';
  }};
  opacity: ${props => props.$isFolder ? 1 : 0.85};
`;

// --- Component Logic ---
export const TagPicker = ({
  noteId, // Used only if not in bulk mode
  onClose,
  triggerRef,
  forwardedRef,
  overlayRef,
  isMobile,
  isOpen = true, // New prop to control visibility with animation
  isBulkMode = false,
  selectedNoteIds = new Set(), // Default to an empty Set
  refreshTags, // Function to refresh tags in the parent component
  prefetchedNoteTags = null, // Pre-fetched note tags to avoid loading delay
  noteColor = null, // Background color for mobile bottom sheet
  forceAutoApply = false, // Force auto-apply regardless of settings (e.g. for NoteCard)
  onSuggestTags = null, // Callback for suggestion mode (instead of auto-apply)
}) => {
  const { getFeatureSettings } = useAutoTagging();
  const { tags: allTags, loading: allTagsLoading, error: allTagsError, createTag } = useTags();
  const { setNotes, allNotesUnfiltered: allNotes, openedNote } = useNotes(); // Get allNotes from context
  const { bulkAddTagToNotes, bulkRemoveTagFromNotes } = useNoteSelection(); // Get bulk functions from selection context
  const [selectedTags, setSelectedTags] = useState(() => 
    // Initialize with prefetched tags if available
    prefetchedNoteTags ? prefetchedNoteTags.map(tag => tag.id) : []
  ); // Only for single note mode
  const [bulkTagStatus, setBulkTagStatus] = useState({}); // { tagId: 'all' | 'some' | 'none' }
  const [loadingBulkStatus, setLoadingBulkStatus] = useState(false);
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 });
  const [isPositioned, setIsPositioned] = useState(false);
  const [isTransitionEnabled, setIsTransitionEnabled] = useState(false);
  // Start with loading false if we have prefetched tags
  const [loadingNoteTags, setLoadingNoteTags] = useState(!prefetchedNoteTags);
  const [errorNoteTags, setErrorNoteTags] = useState(null);
  const [newTagName, setNewTagName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDarkTheme, setIsDarkTheme] = useState(() => !document.documentElement.classList.contains('light-theme'));
  const [viewMode, setViewMode] = useState('tags'); // 'tags' or 'folders'
  const tagListRef = useRef();
  const addTagInputRef = useRef(null);
  const [keyboardAdjustment, setKeyboardAdjustment] = useState(0);
  const [isInitiallyPositioned, setIsInitiallyPositioned] = useState(false);
  const [suppressPositionTransitions, setSuppressPositionTransitions] = useState(false);
  const PADDING = 10;
  
  // Closing animation state
  const [isClosing, setIsClosing] = useState(false);
  const [shouldRender, setShouldRender] = useState(isOpen);

  // Handle open/close state transitions for animation
  React.useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
      // Reset search state when opening
      setSearchQuery('');
      setNewTagName('');
    } else if (shouldRender) {
      // Start closing animation
      setIsClosing(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, 300); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [isOpen, shouldRender]);

  const uniqueTagsList = useMemo(() => {
    const uniqueTagsMap = new Map();
    allTags.forEach(tag => uniqueTagsMap.set(tag.id, tag)); // Stores the whole tag object
    return Array.from(uniqueTagsMap.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allTags]);

  // Filter tags based on search query
  const filteredTagsList = useMemo(() => {
    if (!searchQuery.trim()) {
      return uniqueTagsList;
    }
    const query = searchQuery.toLowerCase();
    return uniqueTagsList.filter(tag => 
      tag.name.toLowerCase().includes(query)
    );
  }, [uniqueTagsList, searchQuery]);

  // Check if current input has an exact match (for determining when to show add button)
  const hasExactMatch = useMemo(() => {
    if (!searchQuery.trim()) return false;
    const query = searchQuery.toLowerCase();
    return uniqueTagsList.some(tag => tag.name.toLowerCase() === query);
  }, [uniqueTagsList, searchQuery]);

  useEffect(() => {
    // Only run in bulk mode with a selection
    if (isBulkMode && selectedNoteIds.size > 0) {
      const fetchStatus = async () => {
        setLoadingBulkStatus(true);
        try {
          // TODO: Replace placeholder logic with API call
          console.log("Fetching bulk tag status for notes:", Array.from(selectedNoteIds));
          const statusData = {};
          const notesInSelection = allNotes.filter(n => selectedNoteIds.has(n.id));
          const totalNotes = notesInSelection.length;

          uniqueTagsList.forEach(tag => {
            let count = 0;
            notesInSelection.forEach(note => {
              if (note.tags?.some(t => t.id === tag.id)) {
                count++;
              }
            });
            statusData[tag.id] = { count, total: totalNotes };
          });

          const calculatedStatus = {};
          for (const tagId in statusData) {
            const { count, total } = statusData[tagId];
            // Handle case with no notes in selection (shouldn't happen with selectedNoteIds.size > 0 check, but safe)
            if (total === 0) {
              calculatedStatus[tagId] = 'none';
            } else if (count === total) {
              calculatedStatus[tagId] = 'all';
            } else if (count > 0) {
              calculatedStatus[tagId] = 'some';
            } else {
              calculatedStatus[tagId] = 'none';
            }
          }
          // Set the calculated status
          setBulkTagStatus(calculatedStatus);
        } catch (err) {
          console.error("Failed to load bulk tag status:", err);
          setBulkTagStatus({}); // Clear status on error
        } finally {
          setLoadingBulkStatus(false);
        }
      };
      fetchStatus();
    } else {
      // Clear status only if it's not already empty
      if (Object.keys(bulkTagStatus).length > 0) {
         setBulkTagStatus({});
      }
    }
    // Dependencies DO NOT include bulkTagStatus itself
  }, [isBulkMode, selectedNoteIds, uniqueTagsList, allNotes]);

  // Positioning logic for initial setup
  useEffect(() => {
    // Only run positioning when picker is open AND DOM is rendered
    if (!isOpen || !shouldRender) {
      if (!isOpen) {
        setIsPositioned(false);
        setIsTransitionEnabled(false);
        setIsInitiallyPositioned(false);
      }
      return;
    }

    let animationFrameId;
    let transitionTimerId;

    setIsPositioned(false);
    setIsTransitionEnabled(false);
    setKeyboardAdjustment(0);

    if (!isMobile && !loadingNoteTags && triggerRef?.current && forwardedRef?.current) {
      animationFrameId = requestAnimationFrame(() => {
        if (triggerRef.current && forwardedRef.current && forwardedRef.current.offsetHeight > 0) {
          const triggerRect = triggerRef.current.getBoundingClientRect();
          const pickerHeight = forwardedRef.current.offsetHeight;
          const pickerWidth = forwardedRef.current.offsetWidth;
          const windowHeight = window.innerHeight;
          const windowWidth = window.innerWidth;
          const GAP = 5;

          let top;
          const topAbove = triggerRect.top - pickerHeight - GAP;
          if (topAbove >= PADDING && (topAbove + pickerHeight <= windowHeight - PADDING)) {
              top = topAbove;
          } else {
              const topBelow = triggerRect.bottom + GAP;
              if (topBelow >= PADDING && (topBelow + pickerHeight <= windowHeight - PADDING)) {
                  top = topBelow;
              } else {
                  top = Math.max(PADDING, windowHeight - pickerHeight - PADDING);
              }
          }

          // Align right edge of picker with right edge of trigger
          let left = triggerRect.right - pickerWidth;
          
          // Constrain to viewport
          const maxLeft = windowWidth - pickerWidth - PADDING;
          left = Math.min(left, maxLeft);
          left = Math.max(PADDING, left);

          setTimeout(() => {
            flushSync(() => {
              setPickerPosition({ top: top + window.scrollY, left: left + window.scrollX });
              setIsPositioned(true);
            });
          }, 0);

          transitionTimerId = setTimeout(() => {
            setIsTransitionEnabled(true);
            setIsInitiallyPositioned(true); // Mark as initially positioned
          }, 50);

        } else {
          setTimeout(() => flushSync(() => setIsPositioned(false)), 0);
        }
      });
    } else if (isMobile && !loadingNoteTags) {
        setPickerPosition({ top: 0, left: 0 });
        const timer = setTimeout(() => {
            setIsPositioned(true);
            setIsTransitionEnabled(true);
            setIsInitiallyPositioned(true); // Mark as initially positioned
        }, 10);
        transitionTimerId = timer;
    } else {
      setTimeout(() => flushSync(() => setIsPositioned(false)), 0);
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (transitionTimerId) clearTimeout(transitionTimerId);
    };
  }, [isOpen, shouldRender, triggerRef, forwardedRef, loadingNoteTags, isMobile, PADDING]);

  // Positioning adjustment for content changes (after initial positioning)
  useLayoutEffect(() => {
    if (!isInitiallyPositioned || isMobile || !isPositioned || !triggerRef?.current || !forwardedRef?.current) {
      return;
    }

    let rafIdForTransitionReset;

    const adjustPosition = () => {
      if (triggerRef.current && forwardedRef.current) {
        const triggerRect = triggerRef.current.getBoundingClientRect();
        const currentPickerHeight = forwardedRef.current.offsetHeight; // Read fresh DOM value
        const currentPickerWidth = forwardedRef.current.offsetWidth;
        const windowHeight = window.innerHeight;
        const windowWidth = window.innerWidth;
        const GAP = 5;
        
        const currentTop = pickerPosition.top; // From state - this is in document coordinates (includes scrollY)
        const triggerBottom = triggerRect.bottom + GAP;
        // const triggerTop = triggerRect.top - currentPickerHeight - GAP; // This line was part of old logic, not directly used for newTop decision here

        let newTop;
        // Determine if picker was positioned above or below trigger based on current pickerPosition.top
        // Convert currentTop to viewport coordinates for comparison with triggerRect
        const currentTopViewport = currentTop - window.scrollY;
        const wasAbove = currentTopViewport < triggerRect.top; 
        
        if (wasAbove) {
          // When positioned above, keep bottom edge anchored (not top edge)
          // Calculate the bottom edge position first
          const pickerBottom = triggerRect.top - GAP;
          newTop = pickerBottom - currentPickerHeight;

          // Check if it still fits above
          if (newTop < PADDING) {
            // If no longer fits above, switch to below
            newTop = triggerBottom;
            if (newTop + currentPickerHeight > windowHeight - PADDING) {
              // If it also doesn't fit below, position at bottom of viewport
              newTop = Math.max(PADDING, windowHeight - currentPickerHeight - PADDING);
            }
          }
        } else {
          // Maintain bottom-aligned positioning (picker stays below trigger)  
          newTop = triggerBottom;
          // Check if it still fits below
          if (newTop + currentPickerHeight > windowHeight - PADDING) {
            // If no longer fits below, try above
            const topAboveAttempt = triggerRect.top - currentPickerHeight - GAP;
            if (topAboveAttempt >= PADDING) {
              newTop = topAboveAttempt;
            } else {
              // If it also doesn't fit above, position at bottom of viewport
              newTop = Math.max(PADDING, windowHeight - currentPickerHeight - PADDING);
            }
          }
        }
        
        // Adjust horizontal position if needed
        // Align right edge of picker with right edge of trigger
        let newLeft = triggerRect.right - currentPickerWidth;
        
        // Constrain to viewport
        const maxLeft = windowWidth - currentPickerWidth - PADDING;
        newLeft = Math.min(newLeft, maxLeft);
        newLeft = Math.max(PADDING, newLeft);
        
        // Add scroll offsets to match ColorPicker behavior
        const finalTop = newTop + window.scrollY;
        const finalLeft = newLeft + window.scrollX;

        // Only update position if it actually changed
        if (Math.abs(finalTop - currentTop) > 1 || Math.abs(finalLeft - pickerPosition.left) > 1) {
          // Synchronously update state and suppress transitions
          // React will re-render synchronously within useLayoutEffect
          setSuppressPositionTransitions(true);
          setPickerPosition({ top: finalTop, left: finalLeft });

          // Schedule transition re-enabling after this sync update and before next paint
          rafIdForTransitionReset = requestAnimationFrame(() => {
            setSuppressPositionTransitions(false);
          });
        }
      }
    };

    adjustPosition(); // Call it directly

    // Keep the picker anchored to its trigger button when the window resizes.
    window.addEventListener('resize', adjustPosition);

    return () => {
      window.removeEventListener('resize', adjustPosition);
      if (rafIdForTransitionReset) {
        cancelAnimationFrame(rafIdForTransitionReset);
      }
    };
  }, [filteredTagsList.length, viewMode, isInitiallyPositioned, isMobile, isPositioned, triggerRef, forwardedRef, pickerPosition, PADDING]); // pickerPosition is a dependency

  useEffect(() => {
    if (!isMobile) return;

    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const handleResize = () => {
        if (addTagInputRef.current === document.activeElement && forwardedRef.current) {
            const pickerRect = forwardedRef.current.getBoundingClientRect();
            const visualViewportHeight = visualViewport.height;

            const keyboardTop = visualViewportHeight;
            const pickerBottom = window.innerHeight;

            const overlap = pickerBottom - keyboardTop;

            setKeyboardAdjustment(overlap > PADDING ? overlap - PADDING : 0);

        } else {
             setKeyboardAdjustment(0);
        }
    };

    const handleInputBlur = () => {
        setTimeout(() => {
             if (!forwardedRef.current?.contains(document.activeElement)) {
                 setKeyboardAdjustment(0);
             }
        }, 100);
    };

    visualViewport.addEventListener('resize', handleResize);
    const inputElement = addTagInputRef.current;
    if (inputElement) {
        inputElement.addEventListener('blur', handleInputBlur);
    }

    handleResize();

    return () => {
        visualViewport.removeEventListener('resize', handleResize);
         if (inputElement) {
            inputElement.removeEventListener('blur', handleInputBlur);
        }
        setKeyboardAdjustment(0);
    };
 }, [isMobile, forwardedRef, PADDING]);

  useEffect(() => {
    const handleClickOutside = (e) => {
        if (forwardedRef.current && !forwardedRef.current.contains(e.target)) {
            const isClickOnTrigger = triggerRef.current?.contains(e.target);
            const isClickOnAnyPartOfTrigger = e.target.closest('[data-tag-button-trigger="true"]');

            if (!isClickOnTrigger && !isClickOnAnyPartOfTrigger) {
                onClose();
            }
        }
    };

    const timerId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
        clearTimeout(timerId);
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose, forwardedRef, triggerRef]);

  useEffect(() => {
    let isMounted = true;
    const fetchNoteTags = async () => {
        setLoadingNoteTags(true); setErrorNoteTags(null);
        try {
            const response = await tagsApi.getNoteTags(noteId);
            if (isMounted) setSelectedTags(response.tags.map(tag => tag.id));
        } catch (err) {
            console.error('Failed to load note tags:', err);
            if (isMounted) setErrorNoteTags('Failed to load tags.');
        } finally {
            if (isMounted) setLoadingNoteTags(false);
        }
    };

    if (!isBulkMode && noteId) {
      // Skip fetching if we have prefetched tags - but still update selectedTags
      if (prefetchedNoteTags) {
        console.log('[TagPicker] Using prefetched tags, skipping API call');
        setSelectedTags(prefetchedNoteTags.map(tag => tag.id));
        setLoadingNoteTags(false);
      } else {
        fetchNoteTags();
      }
    } else {
      setLoadingNoteTags(false);
      setSelectedTags([]);
    }

    const observer = new MutationObserver(() => {
        if (isMounted) {
            setIsDarkTheme(!document.documentElement.classList.contains('light-theme'));
        }
     });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => { isMounted = false; observer.disconnect(); };
  }, [noteId, isBulkMode, prefetchedNoteTags]);

  const handleTagChange = async (tagId, nextCheckedState) => {
    const currentNoteIds = isBulkMode ? Array.from(selectedNoteIds) : [noteId];
    if (currentNoteIds.length === 0) return;

    try {
      if (isBulkMode) {
        const noteIdsToUpdate = Array.from(selectedNoteIds);
        
        if (nextCheckedState) {
          console.log(`Bulk mode: Adding tag ${tagId} to notes:`, noteIdsToUpdate);
          if (bulkAddTagToNotes) {
            await bulkAddTagToNotes(noteIdsToUpdate, tagId);
            setBulkTagStatus(prev => ({ ...prev, [tagId]: 'all' }));
            
            // Clear tag cache for all affected notes
            noteIdsToUpdate.forEach(id => clearTagCache(id));
            
            // Force refresh tags in parent component if current note is affected
            if (refreshTags && noteIdsToUpdate.includes(noteId)) {
              refreshTags();
            }
          } else {
            console.error("bulkAddTagToNotes function not provided");
            alert("Error: Bulk add function is not available.");
          }
        } else {
          console.log(`Bulk mode: Removing tag ${tagId} from notes:`, noteIdsToUpdate);
          if (bulkRemoveTagFromNotes) {
            await bulkRemoveTagFromNotes(noteIdsToUpdate, tagId);
            setBulkTagStatus(prev => ({ ...prev, [tagId]: 'none' }));
            
            // Clear tag cache for all affected notes
            noteIdsToUpdate.forEach(id => clearTagCache(id));
            
            // Force refresh tags in parent component if current note is affected
            if (refreshTags && noteIdsToUpdate.includes(noteId)) {
              refreshTags();
            }
          } else {
            console.error("bulkRemoveTagFromNotes function not provided");
            alert("Error: Bulk remove function is not available.");
          }
        }
      } else {
        if (loadingNoteTags) return;
        const originalSelectedTags = [...selectedTags];
        if (nextCheckedState) {
            setSelectedTags(prev => [...prev, tagId]);
        } else {
            setSelectedTags(prev => prev.filter(id => id !== tagId));
        }
        try {
          if (nextCheckedState) {
              await tagsApi.addTagToNote(noteId, tagId);
          } else {
              await tagsApi.removeTagFromNote(noteId, tagId);
          }
          
          // Clear tag cache to ensure UI updates immediately
          clearTagCache(noteId);
          
          // Force refresh tags in parent component
          if (refreshTags) {
            console.log("[TagPicker] Calling refreshTags for note", noteId);
            refreshTags();
          }
          
          if (setNotes) {
              setNotes(prevNotes => {
                const index = prevNotes.findIndex(n => n.id === noteId);
                if (index !== -1) {
                    const newNotes = [...prevNotes];
                    newNotes[index] = { ...newNotes[index], tagsUpdated: Date.now() };
                    return newNotes;
                }
                return prevNotes;
              });
          }
        } catch (singleNoteErr) {
            console.error('Failed to update single note tag association:', singleNoteErr);
            setSelectedTags(originalSelectedTags);
            alert(`Error ${nextCheckedState ? 'adding' : 'removing'} tag for this note.`);
            return;
        }
      }
    } catch (err) {
      console.error('Failed to update tag association:', err);
      alert(`An error occurred while updating tags.`);
    }
  };

  // Folder selection is exclusive: selecting a subfolder deselects its parent and siblings;
  // selecting a parent folder deselects its subfolders.
  const handleFolderTagChange = async (tagId, nextCheckedState) => {
    if (!nextCheckedState || isBulkMode) {
      handleTagChange(tagId, nextCheckedState);
      return;
    }

    if (loadingNoteTags) return;

    const tag = uniqueTagsList.find(t => t.id === tagId);
    if (!tag) {
      handleTagChange(tagId, nextCheckedState);
      return;
    }

    const conflictingIds = selectedTags.filter(id => {
      if (id === tagId) return false;
      const t = uniqueTagsList.find(x => x.id === id);
      if (!t || !t.is_folder) return false;
      if (tag.parent_id) {
        return t.id === tag.parent_id || t.parent_id === tag.parent_id;
      } else {
        return t.parent_id === tagId;
      }
    });

    const originalSelectedTags = [...selectedTags];
    setSelectedTags(prev => [
      ...prev.filter(id => !conflictingIds.includes(id) && id !== tagId),
      tagId,
    ]);

    try {
      await Promise.all(conflictingIds.map(id => tagsApi.removeTagFromNote(noteId, id)));
      await tagsApi.addTagToNote(noteId, tagId);
      clearTagCache(noteId);
      if (refreshTags) refreshTags();
      if (setNotes) {
        setNotes(prevNotes => {
          const index = prevNotes.findIndex(n => n.id === noteId);
          if (index !== -1) {
            const newNotes = [...prevNotes];
            newNotes[index] = { ...newNotes[index], tagsUpdated: Date.now() };
            return newNotes;
          }
          return prevNotes;
        });
      }
    } catch (err) {
      console.error('Failed to update folder tag association:', err);
      setSelectedTags(originalSelectedTags);
      alert('Error updating folder for this note.');
    }
  };

  const handleCreateTag = async () => {
    const trimmedName = newTagName.trim().replace(/[\s#]/g, '-');
    if (!trimmedName || allTagsLoading) return;

    const exists = uniqueTagsList.some(tag => tag.name.toLowerCase() === trimmedName.toLowerCase());
    if (exists) {
        alert(`Tag "#${trimmedName}" already exists.`);
        setNewTagName('');
        setSearchQuery('');
        return;
    }

    const tempId = `temp-${Date.now()}`;
    const optimisticTag = { id: tempId, name: trimmedName };

    try {
      const isFolder = viewMode === 'folders';
      const newTag = await createTag(trimmedName, true, isFolder);

      if (newTag?.id) {
        if (isBulkMode) {
          // In bulk mode, apply the new tag to all selected notes
          if (selectedNoteIds.size > 0) {
            await handleTagChange(newTag.id, true);
          }
        } else {
          // In single note mode, apply to the current note if not already selected
          if (!selectedTags.includes(newTag.id)) {
            await handleTagChange(newTag.id, true);
          }
        }

        setNewTagName('');
        setSearchQuery('');

        setTimeout(() => {
          if (tagListRef.current) {
            const checkboxId = isBulkMode ? `tag-picker-bulk-${newTag.id}` : `tag-picker-${noteId}-${newTag.id}`;
            const tagCheckbox = document.getElementById(checkboxId);
            if (tagCheckbox) {
              const tagElement = tagCheckbox.closest('li');
              if (tagElement) {
                tagElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
            } else {
              tagListRef.current.scrollTo({ top: tagListRef.current.scrollHeight, behavior: 'smooth' });
            }
          }
        }, 150);

        addTagInputRef.current?.blur();

      } else {
        alert('Failed to create tag (invalid response).');
      }
    } catch (err) {
      console.error('Failed to create tag:', err);
      alert(`Error creating tag: ${err.message || 'Please try again.'}`);
    }
  }; 

  const handleInputChange = (value) => {
    const cleanValue = value.replace(/[\s#]/g, '-');
    setNewTagName(cleanValue);
    setSearchQuery(cleanValue);
  };

  const handleClearInput = () => {
    setNewTagName('');
    setSearchQuery('');
  };

  const handleDeleteFolder = async (folderId) => {
    if (!window.confirm('Delete this folder? (Notes will not be deleted)')) {
      return;
    }

    try {
      await tagsApi.deleteTag(folderId);
      // Refresh will happen automatically via socket.io
      showToast('Folder deleted');
    } catch (error) {
      console.error('Error deleting folder:', error);
      showToast('Failed to delete folder', { variant: 'error' });
    }
  };

  const finalTopPosition = isMobile ? 'auto' : pickerPosition.top;
  const finalBottomPosition = isMobile ? keyboardAdjustment : 'auto';
  const finalLeftPosition = isMobile ? 0 : pickerPosition.left;

  const [isAutoTagging, setIsAutoTagging] = useState(false);
  const { showToast } = useToast(); // Use global toast

  const handleAutoTag = async () => {
    if (isBulkMode) {
        if (selectedNoteIds.size === 0) return;
        setIsAutoTagging(true);
        let totalAdded = 0;
        try {
            const notesToProcess = allNotes.filter(n => selectedNoteIds.has(n.id));
            
            const results = await Promise.all(notesToProcess.map(async (note) => {
                const content = `${note.title || ''}\n${note.content || ''}`.trim();
                if (!content) return 0;
                
                try {
                    const response = await aiApi.suggestTags(content, uniqueTagsList.filter(t => !t.is_folder));
                    const suggestedTags = response.tags;
                    let addedForNote = 0;
                    
                    for (const tag of suggestedTags) {
                         const hasTag = note.tags && note.tags.some(t => t.id === tag.id);
                         if (!hasTag) {
                             await tagsApi.addTagToNote(note.id, tag.id);
                             addedForNote++;
                         }
                    }
                    return addedForNote;
                } catch (e) {
                    console.error(`Failed to auto-tag note ${note.id}`, e);
                    return 0;
                }
            }));
            
            totalAdded = results.reduce((a, b) => a + b, 0);
            
            if (refreshTags) refreshTags();
            notesToProcess.forEach(n => clearTagCache(n.id));

            if (totalAdded === 0) {
                alert("No new tags added to selected notes.");
            } else {
                 showToast(`Added ${totalAdded} tag${totalAdded !== 1 ? 's' : ''} across ${notesToProcess.length} notes`);
            }

        } catch (err) {
             console.error("Bulk auto-tagging failed:", err);
             alert("Failed to auto-tag selected notes.");
        } finally {
            setIsAutoTagging(false);
        }
        return;
    }
    
    if (!noteId) {
        console.warn("handleAutoTag: No noteId provided");
        return;
    }
    
    let note = allNotes.find(n => n.id === noteId);
    
    // Fallback to openedNote if not found in the list (e.g. hidden note opened via URL or search)
    if (!note && openedNote && openedNote.id === noteId) {
        console.log(`handleAutoTag: Note ${noteId} found in openedNote`);
        note = openedNote;
    }

    if (!note) {
        console.error(`handleAutoTag: Note ${noteId} not found in allNotes (count: ${allNotes.length}) or openedNote`);
        return;
    }
    
    // Combine title and content for better context
    const content = `${note.title || ''}\n${note.content || ''}`.trim();
    
    if (!content) {
        alert("Note is empty, cannot suggest tags.");
        return;
    }

    setIsAutoTagging(true);
    try {
      const response = await aiApi.suggestTags(content, uniqueTagsList.filter(t => !t.is_folder));
      const suggestedTags = response.tags;
      
      if (suggestedTags.length === 0) {
        alert("No relevant tags found.");
      } else {
        const aiSettings = getFeatureSettings(AUTO_TAG_FEATURES.AI_GENERATED);
        // Auto-apply if mode is 'auto' OR if forceAutoApply is true (e.g. from NoteCard)
        const shouldAutoApply = aiSettings.mode === 'auto' || forceAutoApply;

        if (shouldAutoApply) {
            let addedCount = 0;
            for (const tag of suggestedTags) {
                if (!selectedTags.includes(tag.id)) {
                    await handleTagChange(tag.id, true);
                    addedCount++;
                }
            }
            
            if (addedCount === 0) {
                alert("All suggested tags are already selected.");
            } else {
                showToast(`Added ${addedCount} tag${addedCount !== 1 ? 's' : ''} with AI`);
            }
        } else {
            // Suggest mode
            const newTags = suggestedTags.filter(tag => !selectedTags.includes(tag.id));
            
            if (newTags.length === 0) {
                alert("All suggested tags are already selected.");
            } else {
                if (onSuggestTags) {
                    // Use the provided callback to handle suggestions (e.g. show chips in NoteForm)
                    onSuggestTags(newTags);
                    showToast(`Suggested ${newTags.length} tag${newTags.length !== 1 ? 's' : ''}`);
                    // Close the picker so user can see the suggestions
                    onClose();
                } else {
                    // Fallback if no callback provided (shouldn't happen in NoteForm, but just in case)
                    const tagNames = newTags.map(t => t.name).join(', ');
                    if (window.confirm(`AI suggested the following tags:\n\n${tagNames}\n\nApply them?`)) {
                        let addedCount = 0;
                        for (const tag of newTags) {
                            await handleTagChange(tag.id, true);
                            addedCount++;
                        }
                        showToast(`Added ${addedCount} tag${addedCount !== 1 ? 's' : ''} with AI`);
                    }
                }
            }
        }
      }
    } catch (error) {
      console.error("Auto-tagging failed:", error);
      alert("Failed to suggest tags. Please try again.");
    } finally {
      setIsAutoTagging(false);
    }
  };

  const { aiEnabled } = useUIPreferences();
  const aiSettings = getFeatureSettings(AUTO_TAG_FEATURES.AI_GENERATED);

  const autoTagLink = aiEnabled && aiSettings.enabled ? (
    <AutoTagLink
      onClick={handleAutoTag}
      disabled={isAutoTagging || allTagsLoading}
      title="Suggest tags based on note content"
      aria-label="Suggest tags"
    >
      {isAutoTagging ? (
        <>
          <Icon name="spinner" size={14} spin />
          Analyzing...
        </>
      ) : (
        <>
          <Icon name="magic" size={14} />
          Auto-tag
        </>
      )}
    </AutoTagLink>
  ) : null;

  // Don't render if closing animation is complete
  if (!shouldRender) return null;

  // Handle overlay click - just call onClose, animation is handled by isOpen prop
  const handleOverlayClick = (e) => {
    e.stopPropagation();
    onClose();
  };

  return ReactDOM.createPortal(
    <>
      <TagPickerOverlay
        ref={overlayRef}
        $isVisible={isPositioned}
        $isClosing={isClosing}
        onClick={handleOverlayClick}
        data-tag-picker-overlay="true"
      />
      <TagPickerContainer
        ref={forwardedRef}
        onClick={(e) => e.stopPropagation()}
        style={{
            top: !isMobile ? `${finalTopPosition}px` : 'auto',
            left: !isMobile ? `${finalLeftPosition}px` : '0',
            bottom: isMobile ? `${finalBottomPosition}px` : 'auto',
        }}
        $isPositioned={isPositioned}
        $isClosing={isClosing}
        $isTransitionEnabled={isTransitionEnabled}
        $suppressPositionTransitions={suppressPositionTransitions}
        $noteColor={noteColor}
      >
        {(loadingNoteTags || (isBulkMode && loadingBulkStatus)) && <EmptyState>Loading tags...</EmptyState>}
        {!loadingNoteTags && errorNoteTags && <EmptyState>{errorNoteTags}</EmptyState>}
        {!loadingNoteTags && !errorNoteTags && !(isBulkMode && loadingBulkStatus) && (
          <>
            {allTagsError && <EmptyState>Error loading all tags.</EmptyState>}
            {!allTagsError && (
              <>
                {!isBulkMode && uniqueTagsList.length > 0 && (
                  <>
                    {/* Desktop: just auto-tag link */}
                    <DesktopHeaderRow>
                      {autoTagLink}
                    </DesktopHeaderRow>
                    {/* Mobile: selected tags + auto-tag link */}
                    <MobileHeaderRow>
                      <SelectedTagsScroller>
                        {selectedTags.map(tagId => {
                          const tag = uniqueTagsList.find(t => t.id === tagId);
                          return tag ? (
                            <SelectedTagChip
                              key={tag.id}
                              theme={isDarkTheme ? 'dark' : 'light'}
                              $isFolder={tag.is_folder}
                            >
                              {tag.emoji && <span style={{ marginRight: '4px' }}>{tag.emoji}</span>}
                              {tag.name}
                            </SelectedTagChip>
                          ) : null;
                        })}
                      </SelectedTagsScroller>
                      {autoTagLink}
                    </MobileHeaderRow>
                  </>
                )}
                {uniqueTagsList.length === 0 && !allTagsLoading && (<EmptyState>No tags created yet.</EmptyState>)}
                {uniqueTagsList.length > 0 && (
                  <>
                    <ViewToggleHeader>
                      <ViewToggleButton
                        className={viewMode === 'tags' ? 'active' : ''}
                        onClick={() => setViewMode('tags')}
                      >
                        Tags
                      </ViewToggleButton>
                      <ViewToggleButton
                        className={viewMode === 'folders' ? 'active' : ''}
                        onClick={() => setViewMode('folders')}
                      >
                        Folders
                      </ViewToggleButton>
                    </ViewToggleHeader>
                    <TagPickerList ref={tagListRef} className={isDarkTheme ? 'dark-theme' : 'light-theme'}>
                      {(() => {
                        const baseFolders = filteredTagsList.filter(tag => tag.is_folder);
                        const baseNonFolders = filteredTagsList.filter(tag => !tag.is_folder);

                        // For folders view: order top-level folders with their subfolders nested below
                        const orderedList = viewMode === 'folders'
                          ? (() => {
                              const topLevel = baseFolders.filter(t => !t.parent_id);
                              const result = [];
                              topLevel.forEach(parent => {
                                result.push(parent);
                                baseFolders
                                  .filter(t => t.parent_id === parent.id)
                                  .sort((a, b) => a.name.localeCompare(b.name))
                                  .forEach(child => result.push({ ...child, _isSubfolder: true }));
                              });
                              // Orphaned subfolders whose parent was filtered out
                              baseFolders
                                .filter(t => t.parent_id && !topLevel.find(p => p.id === t.parent_id))
                                .forEach(t => result.push({ ...t, _isSubfolder: true }));
                              return result;
                            })()
                          : baseNonFolders;

                        if (orderedList.length === 0) {
                          return searchQuery.trim() ? <EmptyState>No matches</EmptyState> : null;
                        }

                        return orderedList.map(tag => {
                          let isChecked = false;
                          let isIndeterminate = false;
                          if (isBulkMode) {
                            const status = bulkTagStatus[tag.id];
                            isChecked = status === 'all';
                            isIndeterminate = status === 'some';
                          } else {
                            isChecked = selectedTags.includes(tag.id);
                          }

                          return (
                            <TagPickerItem
                              key={tag.id}
                              theme={isDarkTheme ? 'dark' : 'light'}
                              style={tag._isSubfolder ? { paddingLeft: '20px' } : undefined}
                            >
                              <SVGCheckbox
                                id={`tag-picker-${isBulkMode ? 'bulk' : noteId}-${tag.id}`}
                                checked={isChecked}
                                indeterminate={isIndeterminate}
                                onChange={(nextCheckedState) => { viewMode === 'folders' ? handleFolderTagChange(tag.id, nextCheckedState) : handleTagChange(tag.id, nextCheckedState); }}
                                label={tag.name}
                                title={tag.name}
                              />
                              {tag.visible === false && (
                                <VisibilityIconWrapper title="Notes with this tag are hidden by default">
                                  <Icon name="eye-slash" size={16} />
                                </VisibilityIconWrapper>
                              )}
                              {viewMode === 'folders' && (
                                <DeleteFolderButton
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteFolder(tag.id);
                                  }}
                                  title="Delete folder"
                                >
                                  <Icon name="trash" size={16} />
                                </DeleteFolderButton>
                              )}
                            </TagPickerItem>
                          );
                        });
                      })()}
                  </TagPickerList>
                  </>
                )}
              </>
            )}
            {!allTagsError && (
              <AddTagWrapper>
                <AddTagInputWrapper>
                  <AddTagInput
                    ref={addTagInputRef}
                    type="text"
                    placeholder={viewMode === 'folders' ? "Search or Create folder ..." : "Search or Create tag ..."}
                    value={newTagName}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !hasExactMatch) { handleCreateTag(); } }}
                    disabled={allTagsLoading}
                    aria-label="Search tags or create new tag"
                  />
                  {newTagName.trim() && (
                    <>
                      {!hasExactMatch ? (
                        // Show create/clear buttons when no exact match exists
                        <>
                          <TagActionButton
                            className="create-button"
                            onClick={handleCreateTag}
                            disabled={allTagsLoading || !newTagName.trim()}
                            title="Create tag"
                            aria-label="Create tag"
                          >
                            <Icon name="add" size={20} strokeWidth="2.5"/>
                          </TagActionButton>
                          <TagActionButton
                            className="clear-button"
                            onClick={handleClearInput}
                            title="Clear input"
                            aria-label="Clear input"
                          >
                            <Icon name="close" size={20} strokeWidth="2.5"/>
                          </TagActionButton>
                        </>
                      ) : (
                        // Show only clear button when exact match exists
                        <>
                          <TagActionButton
                            className="clear-button"
                            onClick={handleClearInput}
                            title="Clear search"
                            aria-label="Clear search"
                          >
                            <Icon name="close" size={20} strokeWidth="2.5"/>
                          </TagActionButton>
                        </>
                      )}
                    </>
                  )}
                </AddTagInputWrapper>
              </AddTagWrapper>
            )}
          </>
        )}
        {isBulkMode && !loadingBulkStatus && uniqueTagsList.length > 0 && (
          <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
            {autoTagLink}
          </div>
        )}
      </TagPickerContainer>
    </>,
    document.body
  );
};

export default TagPicker;
