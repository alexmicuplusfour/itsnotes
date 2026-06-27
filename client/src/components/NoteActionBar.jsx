import React, { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react'; // Added useRef, useEffect
import styled, { keyframes } from 'styled-components';
import Icon from './Icons'; // Assuming Icon is in the same directory
import ImageGallery from './ImageGallery'; // Assuming ImageGallery is in the same directory
import AddContentDropdown from './AddContentDropdown'; // Import the dropdown
import ClipboardHistoryDropdown from './ClipboardHistoryDropdown'; // Import clipboard dropdown
import { useUIPreferences } from '../contexts/UIPreferencesContext'; // Import for fullscreen setting
// Removed Import of Shared Components to avoid circular dependency
// import { SaveIndicator as SharedSaveIndicator, ActionButton as SharedActionButton, CloseButton as SharedCloseButton } from './NoteForm';

// --- Styled Components (Redefined Locally to break circular dependency) ---

const SharedActionButton = styled.button`
  background: none;
  border: none;
  border-radius: 50%;
  font-size: 16px;
  color: var(--text-color);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  position: relative;
  box-sizing: content-box;
  line-height: 1;
  cursor: pointer;

  @media (hover: hover) {
      &:hover {
        background-color: var(--button-hover-color);
      }
    }
  
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const SharedCloseButton = styled(SharedActionButton)`
  margin-right: 0px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: auto;
  height: 36px;
  padding: 0 10px 0 10px;
  position: relative;
  box-sizing: content-box;
  line-height: 1;
  border-radius: 18px;

  &:hover {
    opacity: 1;
    background-color: var(--button-hover-color);
  }

  @media (max-width: 768px) {
    margin-right: 4px;
  }
`;

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const SharedSaveIndicator = styled.div`
  width: 18px;
  height: 18px;
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-top: 2px solid var(--foreground-color);
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

// --- Styled Components (Copied & Adapted from NoteForm.jsx) ---


const ActionBarContainer = styled.div` // Renamed from ActionBar to avoid naming conflict if imported elsewhere
  display: flex;
  flex-direction: column; /* Stack items for both mobile and desktop */
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px; /* Reduced padding */
  /* Use CSS variable set via inline style to avoid regenerating classes per color */
  background-color: var(--action-bar-bg, var(--note-bg-color));
  border-bottom-left-radius: ${props => props.$fullscreen ? '0' : '8px'};
  border-bottom-right-radius: ${props => props.$fullscreen ? '0' : '8px'};
  z-index: 10;
  position: sticky;
  bottom: 0;
  border-top: 1px solid var(--border-transparent);

  /* Fullscreen mode: center content and constrain width */
  ${props => props.$fullscreen && `
    & > * {
      width: 660px;
      max-width: 660px;
      margin: 0 auto;
    }
  `}
  
  @media (max-width: 768px) {
    padding: 2px 4px 0px 4px;
    flex-direction: column;
    border-radius: 0;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    max-height: 240px;
    border-radius: 12px 12px 0 0;
    box-sizing: border-box;
    z-index: 50;
    transition: transform 0.4s cubic-bezier(0.4, 0.0, 0.2, 1);
    will-change: transform;


    &.hidden { transform: translateY(220px); }
    &.visible { transform: translateY(0); }
    
    /* Reset fullscreen styles on mobile */
    & > * {
      width: 100%;
      max-width: 100%;
      margin: 0;
    }
  }

  @media (max-width: 600px) {
    /* Use CSS variable with opacity - no getComputedStyle needed */
    background-color: var(--action-bar-bg-mobile, var(--mobile-note-bg-color));
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
`;

const FooterContent = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;

  & > *:first-child {
  }
   /* Ensure children don't exceed max height */
  & > * {
     max-height: 210px; /* Adjust if needed */
     overflow: auto; /* Allow scrolling if content overflows */
  }
  & > *:last-child { /* Ensure NoteActions itself doesn't scroll */
     overflow: visible;
     max-height: none;
  }

  @media (max-width: 768px) {
    max-height: 210px;
    overflow: visible;
    padding-top: 4px;
     & > * {
        /* Prevent children like ImageGallery/TagsContainer from scrolling independently */
        overflow: hidden;
     }
     & > .scrollable-tags { /* Add class to TagsContainer for mobile scrolling */
        overflow-x: auto;
        overflow-y: hidden;
        flex-wrap: nowrap;
     }
  }
`;

const TagsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
  margin-top: 8px;
  padding-left: 1px;
  padding-top: 2px;
  padding-bottom: 2px;

  /* Desktop: rows are packed in JS (see computeTagRowBreaks) which inserts zero-height
     FlexBreak spacers to force line breaks while reserving room at each row's end for a
     tag's hover expansion. Use margin-bottom (not row-gap) for vertical spacing so those
     0-height spacer lines don't introduce extra gaps between rows. */
  @media (min-width: 769px) {
    row-gap: 0;
    margin-bottom: 2px;
    & > *:not([data-flex-break]) {
      margin-bottom: 6px;
    }
  }

  @media (max-width: 768px) {
    flex-wrap: nowrap; /* Becomes scrollable on mobile */
    overflow-x: auto;
    overflow-y: hidden;
    gap: 6px;
    margin: 4px 0 2px 0;
    padding: 4px 8px;
    padding-right: 20px;
    width: 100%;
    box-sizing: border-box;
    position: relative;
    z-index: 10;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    scroll-snap-type: x proximity;

    &::-webkit-scrollbar { display: none; }

    & > * {
      flex-shrink: 0;
      margin-bottom: 0;
      font-size: 14px;
      padding: 6px 10px;
      scroll-snap-align: start;
    }
  }
`;

// Zero-height, full-width flex item used to force a line break at a JS-computed point.
// flex-basis: 100% makes it fill the line so the next chip wraps; height/margin 0 keep it
// invisible and contribute no vertical space.
const FlexBreak = styled.div`
  flex-basis: 100%;
  width: 100%;
  height: 0;
  margin: 0;
  padding: 0;
`;


const TagComponent = styled.div`
  display: inline-flex;
  align-items: center;
  outline: ${props => props.$isFolder ? 'none' : `1px solid ${props.$isDarkTheme ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.08)'}`};
  background-color: ${props => {
    if (props.$isFolder) {
      // Folders: dark background in light theme, white background in dark theme
      return props.$isDarkTheme
        ? 'rgba(255, 255, 255, 0.9)'
        : 'rgba(0, 0, 0, 0.8)';
    }
    return 'transparent';
  }};
  color: ${props => {
    if (props.$isFolder) {
      // Folders: light text in light theme (dark bg), dark text in dark theme (white bg)
      return props.$isDarkTheme
        ? 'rgba(0, 0, 0, 0.9)'
        : 'rgba(255, 255, 255, 0.95)';
    }
    return 'var(--text-color)';
  }};
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  position: relative;
  min-width: fit-content;
  transition: padding-right 0.2s ease, background-color 0.2s ease;

  @media (hover: hover) {
    &:hover {
      background-color: ${props => {
        if (props.$isFolder) {
          return props.$isDarkTheme
            ? 'rgba(255, 255, 255, 1)'
            : 'rgba(0, 0, 0, 0.9)';
        }
        return props.$isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
      }};
      outline: none;
    }
  }

  /* Long press feedback for mobile */
  &:active {
    background-color: ${props => {
      if (props.$isFolder) {
        return props.$isDarkTheme
          ? 'rgba(255, 255, 255, 1)'
          : 'rgba(0, 0, 0, 1)';
      }
      return props.$isDarkTheme ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)';
    }};
    transform: scale(0.98);
  }

  > svg {
    margin-right: 4px;
  }

  @media (max-width: 768px) {
    font-size: 14px;
    padding: 6px 10px;
    margin-bottom: 4px;
    max-width: none;
    min-width: fit-content;
    flex-shrink: 0;

    @media (hover: hover) {
      &:hover {
      }
    }
  }
`;

const TagText = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  flex: 1;
`;

const TagRemoveButton = styled.button`
  background: none;
  border: none;
  color: ${props => {
    if (props.$isFolder) {
      // Folders: light icon on dark bg (light theme), dark icon on white bg (dark theme)
      return props.$isDarkTheme
        ? 'rgba(0, 0, 0, 0.7)'
        : 'rgba(255, 255, 255, 0.85)';
    }
    return 'var(--text-color)';
  }};
  cursor: pointer;
  padding: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
  z-index: 10;

  /* Position absolutely to not affect tag width */
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);

  &:hover {
    background-color: ${props => {
      if (props.$isFolder) {
        return props.$isDarkTheme
          ? 'rgba(0, 0, 0, 0.15)'
          : 'rgba(255, 255, 255, 0.2)';
      }
      return props.$isDarkTheme ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';
    }};
  }

  @media (hover: hover) {
    ${TagComponent}:hover & {
      opacity: 1;
      pointer-events: auto;
    }
  }

  /* Ensure the icon inherits proper styling */
  svg {
    color: currentColor;
    stroke: currentColor;
    opacity: 0.8;
  }
`;

const Tag = styled(TagComponent)`
  @media (hover: hover) {
    &:hover {
      padding-right: 28px;
    }
  }
`;

// Suggested tag with dotted outline for auto-tagging suggestions
const SuggestedTagComponent = styled(TagComponent)`
  outline: 2px dashed ${props => props.$isDarkTheme 
    ? 'rgba(251, 189, 4, 1)' 
    : 'rgba(216, 163, 4, 1)'};
  outline-offset: -1px;
  background-color: ${props => props.$isDarkTheme 
    ? 'rgba(251, 188, 4, 0.08)' 
    : 'rgba(251, 188, 4, 0.1)'};
  color: ${props => props.$isDarkTheme 
    ? 'rgba(251, 189, 4, 1)' 
    : 'rgba(145, 104, 0, 1)'};
  padding-left: 4px;
  padding-right: 12px;

  @media (hover: hover) {
    &:hover {
      background-color: ${props => props.$isDarkTheme 
        ? 'rgba(251, 188, 4, 0.15)' 
        : 'rgba(251, 188, 4, 0.2)'};
      outline: 2px dashed ${props => props.$isDarkTheme 
        ? 'rgba(251, 189, 4, 1)' 
        : 'rgba(216, 163, 4, 1)'};
    }
  }

  &:active {
    background-color: ${props => props.$isDarkTheme 
      ? 'rgba(251, 188, 4, 0.2)' 
      : 'rgba(251, 188, 4, 0.25)'};
    transform: scale(0.98);
  }
`;

const SuggestedTagIcon = styled.span`
  display: inline-flex;
  align-items: center;
  margin-right: 4px;
`;

const UrlLink = styled(TagComponent).attrs({ as: 'a' })`
  text-decoration: none;
`;

const BookReference = styled(TagComponent)`

`;

// MODIFIED NoteActions: Removed justify-content, using flex groups and margin auto
export const NoteActions = styled.div`
  position: relative; /* Needed for absolute positioning context of center items */
  display: flex;
  align-items: center;
  /* justify-content: space-between; NO LONGER NEEDED */
  width: 100%;
  gap: 8px; /* Add some base gap between flex groups */

  @media (max-width: 768px) {
    flex-direction: row;
    flex-wrap: nowrap;
    margin-bottom: 4px;
    padding-bottom: 4px;
    gap: 4px; /* Adjust gap for mobile */
  }
`;

// NEW: Wrapper for Left items
const LeftActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px; /* Space between close button and status indicators */

  @media (max-width: 768px) {
      gap: 12px; /* Adjust gap for mobile */
      /* Ensure it doesn't push everything else too much on small screens */
      flex-shrink: 0;
      margin-left: 6px;   
  }
`;

// NEW: Wrapper for Right items
const RightActions = styled.div`
  display: flex;
  align-items: center;
  gap: 6px; /* Space between action buttons */
  margin-left: auto; /* Pushes this group to the far right */
  overflow: visible;

   @media (max-width: 768px) {
       gap: 10px; /* Tighter spacing on mobile if needed */
       margin-right: 6px;
   }
`;

// Center container style remains the same
const CenterActions = styled.div`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
`;

// Removed ColorPicker, ColorButton, ColorCheckmark styled components

export const PulsatingDot = styled.div`
  width: 8px;
  height: 8px;
  background-color: var(--text-color);
  border-radius: 50%;
  /* margin-right: 8px; Removed, using gap in LeftActions */
`;


const BaseActionButton = styled.button` // Changed to button for semantics, can be div if preferred
  width: auto;
  border: none;
  border-radius: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--text-color);
  padding: 8px;
  cursor: pointer; // Added for better UX
  transition: background-color 0.2s ease;
  background: transparent;
  cursor: pointer;
`;

// They now inherit base styles and don't need positioning/visibility logic
export const ShowFooterHandle = styled(BaseActionButton)`
  outline: 1px solid ${props => props.$isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
  outline-offset: -1px;
`;

export const NoteCloseButton = styled(BaseActionButton)`
  /* Add any specific styles for this button if needed in the future */
`;

export const NoteColorsButton = styled(BaseActionButton)`
`;

export const NoteTagsButton = styled(BaseActionButton)`
  /* Add any specific styles for this button if needed in the future */
`;

export const AddContentButton = styled(BaseActionButton)`
  /* Add any specific styles for this button if needed in the future */
`;

export const TagCountBadge = styled.div`
  position: absolute;
  top: -6px;
  right: -4px;
  border-radius: 10px;
  padding-left: 5px;
  padding-right: 5px;
  font-weight: 400;
  line-height: 1.3;
  min-height: 15px;
  min-width: 15px;
  width: auto;
  height: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  pointer-events: none;
  /* Use CSS variable set via inline style to avoid regenerating classes per color */
  background-color: var(--badge-bg-color, var(--note-bg-color));
  box-shadow: 0 1px 3px rgba(0,0,0,0.5);
`;

export const BottomActionContainer = styled.div`
  position: fixed;
  bottom: -1px;
  left: 50%;
  /* Start with horizontal centering */
  transform: translateX(-50%);
  width: auto;
  z-index: 1000;

  display: flex; // Always flex, visibility controlled by opacity/transform
  justify-content: center;
  align-items: center;
  gap: 5px;
  padding: 3px;
  border-radius: 18px 18px 0 0;

  border: 1px solid ${props => 
    props.$isDarkTheme 
      ? 'rgba(255, 255, 255, 0.05)' 
      : 'rgba(255, 255, 255, 0.3)'
  };

  /* Use CSS color-mix for opacity instead of getComputedStyle - 85% for glassy effect */
  background-color: color-mix(in srgb, var(--action-bar-bg-mobile, var(--mobile-note-bg-color)) 85%, transparent);

  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);

  -webkit-box-shadow: 0px 1px 100px 0px rgba(0,0,0,0.2);
  -moz-box-shadow: 0px 1px 100px 0px rgba(0,0,0,0.2);
  box-shadow: 0px 1px 100px 0px rgba(0,0,0,0.2);

  /* --- Animation Styles --- */
  /* Define the transition properties, duration, and easing */
  transition: transform 0.3s ease-out, opacity 0.3s ease-out, visibility 0s linear 0.3s;
  /* Note: visibility transition is instant (0s) but delayed on exit */

  /* Apply styles based on the $visible and $isTyping props */
  opacity: ${props => {
    if (!props.$visible) return 0;
    return props.$isTyping ? 0.3 : 1;
  }};
  visibility: ${props => props.$visible ? 'visible' : 'hidden'};
  transform: ${props => props.$visible
    ? 'translateX(-50%) translateY(0)' /* Visible: Centered, at final vertical position */
    : 'translateX(-50%) translateY(calc(100% + 25px))'}; /* Hidden: Centered, slide down (100% of its height + bottom offset) */

  /* Adjust the visibility transition delay based on visibility state */
  transition-delay: ${props => props.$visible ? '0s' : '0s, 0s, 0.3s'};
  /* When becoming visible ($visible=true): delay all transitions 0s */
  /* When becoming hidden ($visible=false): delay visibility change by 0.3s to allow fade/slide out */
  
  pointer-events: ${props => props.$isTyping ? 'none' : 'auto'};

  @media (min-width: 769px) {
    /* Ensure it's completely hidden and non-interactive on desktop */
    /* These override the animation states */
    display: none; /* Can use display:none here as no transition needed */
    opacity: 0;
    visibility: hidden;
  }
`;

// Removed COLORS constant

// --- Component Definition ---

export const NoteActionBar = ({
  note, // Pass the whole note object
  color,
  images,
  noteTags,
  noteUrls,
  bookReferences,
  isModified,
  isAutoSaving,
  isDarkTheme,
  isMobile,
  actionBarClass,
  unsavedImageIds,
  isAddContentBusy,
  showColorPicker,
  showTagsModal,
  onToggleTagsModal,
  onToggleColorPicker,
  tagButtonRef,
  colorButtonRef,
  onCloseTagsModal,
  onColorSelect,
  onRemoveImage,
  onTagClick,
  onRemoveTag, // New prop for removing tags
  onBookClick,
  onAddImageClick,
  onClose,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onTagsModalClose,
  isTyping,
  onUndo,
  onRedo, canUndo, canRedo,
  onOpenHistory, // Add the version history handler
  editor, // Add editor prop for task list functionality
  onToggleAddContent, // Add prop to allow external toggle  // AddContent dropdown props
  showAddContentDropdown,
  onAddTask,
  onAddNote,
  onSummarizeWithAI,
  onAddImage,
  onAddImageFile,
  onAddSketch,
  onAddAttachment,
  onAddReminder, // Add missing prop
  onInsertOCR, // New prop
  onAddClipboardUrl,
  onCloseAddContentDropdown, // New prop for closing dropdown
  clipboardUrl,
  clipboardUrlPreview,
  clipboardActionLabel,
  hasClipboardUrl,
  // Clipboard history dropdown props
  showClipboardDropdown,
  onToggleClipboardDropdown,
  clipboardHistory,
  onSelectClipboardSnippet,
  onRemoveClipboardSnippet,
  onToggleSticky,
  onCloseClipboardDropdown,
  hasClipboardHistory,
  hasReminderIntent, // Add new prop
  // Suggested tags props
  suggestedTags = [], // Array of suggested tag objects { id, name, featureId }
  onAcceptSuggestedTag, // Handler when user clicks a suggested tag to apply it
  onDismissSuggestedTag, // Handler when user dismisses a suggested tag
}) => {
  //const colorButtonRef = useRef(null); // Ref for the palette button
  const addContentButtonRef = useRef(null); // Ref for the add content button
  const tagsContainerRef = useRef(null); // Ref for scrolling tags container to start
  
  // Get fullscreen setting from context
  const { fullscreenNoteForm } = useUIPreferences();

  // Scroll tags container to start when suggestedTags change (on mobile)
  useEffect(() => {
    if (suggestedTags.length > 0 && tagsContainerRef.current && isMobile) {
      tagsContainerRef.current.scrollLeft = 0;
    }
  }, [suggestedTags, isMobile]);

  // --- Desktop tag-row packing -------------------------------------------------------
  // A tag grows ~20px on hover to reveal its X button, which pushes the chips after it on
  // the same row. With native flex-wrap there's no per-row slack, so on a tightly packed
  // row that push wraps the last chip to a new line. Flexbox can't reserve trailing space
  // per row, so we pack the rows ourselves: measure each chip and break to a new line while
  // leaving TAG_HOVER_RESERVE px free at each row's end. That reserve absorbs the hover
  // push (no reflow on any row) and makes a chip drop a line early when it wouldn't fit
  // together with that reserve. Breaks are applied via FlexBreak spacers. Desktop only --
  // on mobile the row is a horizontal scroller and tags don't expand on hover.
  const TAG_HOVER_RESERVE = 26; // >= the hover expansion (28px padding-right vs 8px base)
  const TAG_GAP = 6; // matches column-gap
  const [tagRowBreaks, setTagRowBreaks] = useState([]);

  const computeTagRowBreaks = useCallback(() => {
    const container = tagsContainerRef.current;
    if (!container) return;
    const chips = Array.from(container.children).filter(
      c => !c.hasAttribute('data-flex-break')
    );
    if (chips.length === 0) {
      setTagRowBreaks(prev => (prev.length ? [] : prev));
      return;
    }
    const usable = container.clientWidth - TAG_HOVER_RESERVE;
    const breaks = [];
    let rowWidth = 0;
    chips.forEach((chip, i) => {
      const w = chip.offsetWidth;
      if (i === 0) {
        rowWidth = w;
        return;
      }
      const withChip = rowWidth + TAG_GAP + w;
      if (withChip > usable) {
        breaks.push(i);
        rowWidth = w;
      } else {
        rowWidth = withChip;
      }
    });
    setTagRowBreaks(prev =>
      prev.length === breaks.length && prev.every((v, i) => v === breaks[i]) ? prev : breaks
    );
  }, []);

  useLayoutEffect(() => {
    if (isMobile) {
      setTagRowBreaks(prev => (prev.length ? [] : prev));
      return;
    }
    const container = tagsContainerRef.current;
    if (!container) return;
    computeTagRowBreaks();
    const observer = new ResizeObserver(() => computeTagRowBreaks());
    observer.observe(container);
    return () => observer.disconnect();
  }, [isMobile, computeTagRowBreaks, suggestedTags, noteTags, noteUrls, bookReferences]);

  // Debug logging for editor prop - REMOVED to reduce noise
  // console.log('[NoteActionBar] Editor prop received:', !!editor, typeof editor, editor);

  const renderTagsInFooter = useMemo(() =>
    suggestedTags.length > 0 || noteTags.length > 0 || noteUrls.length > 0 || bookReferences.length > 0,
    [suggestedTags, noteTags, noteUrls, bookReferences]
  );

  const handleLocalTagModalClose = () => {
    // setShowTagsModal(false); // State is lifted, NoteForm handles this
    if (onTagsModalClose) {
      onTagsModalClose(); // Notify parent
    }
  };

  // Add Content handlers - simplified to just call parent functions
  const handleAddContentToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAutoSaving && onToggleAddContent) {
      onToggleAddContent(e);
    }
  };

  // Compute inline style for color CSS variables - avoids styled-components class regeneration
  const actionBarColorStyle = useMemo(() => {
    if (color && color !== 'default') {
      return {
        '--action-bar-bg': `var(--note-color-${color})`,
        '--action-bar-bg-mobile': `var(--note-color-${color})`
      };
    }
    return {};
  }, [color]);

  return (
    <ActionBarContainer
      style={actionBarColorStyle}
      $fullscreen={fullscreenNoteForm}
      className={actionBarClass}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <FooterContent>
        {/* Display images */}
        {images.length > 0 && (
          <ImageGallery
            images={images}
            onRemoveImage={onRemoveImage}
            unsavedImageIds={unsavedImageIds}
            noteColor={color}
            disableFade={true} // Keep consistent with original
            reducedSize={true}
          />
        )}

        {/* Display Tags, Refs, URLs */}
        {renderTagsInFooter && (
          <TagsContainer ref={tagsContainerRef} $isDarkTheme={isDarkTheme} className={isMobile ? 'scrollable-tags' : ''}>
            {(() => {
              // Build a single ordered list of footer chips (suggested tags, then book
              // refs, then URLs, then tags) so JS-computed row breaks can be applied across
              // all of them by index. See computeTagRowBreaks.
              const suggestedEls = suggestedTags.map(suggestedTag => {
                const handleSuggestedTagLongPress = (e) => {
                  if (!onDismissSuggestedTag) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (navigator.vibrate) navigator.vibrate(50);
                  onDismissSuggestedTag(suggestedTag);
                };
                return (
                  <SuggestedTagComponent
                    key={`suggested-${suggestedTag.id}`}
                    $isDarkTheme={isDarkTheme}
                    title={`Click to add "${suggestedTag.name}" tag. Right-click to dismiss.`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onAcceptSuggestedTag) onAcceptSuggestedTag(suggestedTag);
                    }}
                    onContextMenu={handleSuggestedTagLongPress}
                  >
                    <SuggestedTagIcon>
                      <Icon name="plus" size={14} />
                    </SuggestedTagIcon>
                    <span>{suggestedTag.name.length > 12 ? `+ ${suggestedTag.name.substring(0, 16)}...` : `+ ${suggestedTag.name}`}</span>
                  </SuggestedTagComponent>
                );
              });

              const bookEls = bookReferences.map((title, index) => (
                <BookReference
                  key={`book-${index}`}
                  $isDarkTheme={isDarkTheme}
                  title={`Search for {${title}}`}
                  onClick={(e) => { e.stopPropagation(); onBookClick(e, title); }}
                >
                  <Icon name="book" size={16} />
                  <span>{title.length > 18 ? `${title.substring(0, 18)}...` : title}</span>
                </BookReference>
              ));

              const urlEls = noteUrls.map((urlItem, index) => (
                <UrlLink
                  key={`url-${index}`}
                  href={urlItem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  $isDarkTheme={isDarkTheme}
                  title={`Open ${urlItem.url}`}
                  onClick={(e) => e.stopPropagation()} // Prevent form closing
                >
                  <Icon name="link" size={16} />
                  <span>{urlItem.domain}</span>
                </UrlLink>
              ));

              const tagEls = noteTags.map(tag => {
                const handleTagLongPress = (e) => {
                  if (!onRemoveTag) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (navigator.vibrate) navigator.vibrate(50);
                  onRemoveTag(tag);
                };
                const handleTagTextClick = (e) => { onTagClick(e, tag); };
                return (
                  <Tag
                    key={tag.id}
                    $isDarkTheme={isDarkTheme}
                    $isFolder={tag.is_folder}
                    title={`Search for ${tag.name}`}
                    onContextMenu={handleTagLongPress}
                  >
                    {tag.visible === false && <Icon name="eye-slash" size={10} style={{ marginRight: 3, flexShrink: 0, opacity: 0.6 }} />}
                    {tag.is_folder && <Icon name="folder" size={11} style={{ marginRight: 4, flexShrink: 0 }} />}
                    <TagText onClick={handleTagTextClick}>
                      {tag.name.length > 12 ? `${tag.name.substring(0, 12)}...` : tag.name}
                    </TagText>
                    {onRemoveTag && (
                      <TagRemoveButton
                        $isDarkTheme={isDarkTheme}
                        $isFolder={tag.is_folder}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveTag(tag);
                        }}
                        title={`Remove tag: ${tag.name}`}
                      >
                        <Icon name="close" size={14} strokeWidth="4" />
                      </TagRemoveButton>
                    )}
                  </Tag>
                );
              });

              const footerItems = [...suggestedEls, ...bookEls, ...urlEls, ...tagEls];
              const breakSet = new Set(tagRowBreaks);
              return footerItems.map((el, i) => (
                <React.Fragment key={el.key}>
                  {breakSet.has(i) && <FlexBreak data-flex-break="true" aria-hidden="true" />}
                  {el}
                </React.Fragment>
              ));
            })()}
          </TagsContainer>
        )}

        {/* Note Actions Row - RESTRUCTURED */}
        <NoteActions>
          {/* Left Group: Close Button (mobile only), Status Indicators */}
          <LeftActions>
            {isMobile && (
              <SharedActionButton
                type="button"
                title="Close Note"
                onClick={onClose}
                disabled={isAutoSaving}
                className="note-form-close-trigger"
              >
                {isAutoSaving ? (
                  <> <SharedSaveIndicator /> </>
                ) : (
                  <><Icon name="close" size={20} strokeWidth="2.5" /></>
                )}
              </SharedActionButton>
            )}

            {isModified && !isAutoSaving && (
              <PulsatingDot title="Unsaved changes" />
            )}            {note?.updated_at && ( // Optional chaining for safety
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--text-color-secondary)',
                  opacity: 0.5,
                  paddingTop: '2px',
                  whiteSpace: 'nowrap', // Prevent wrapping
                  cursor: onOpenHistory ? 'pointer' : 'help', // Show pointer only if handler exists
                  transition: 'opacity 0.2s ease', // Add transition for hover effect
                }}
                title={onOpenHistory
                  ? `Last updated: ${new Date(note.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}. Click to view version history.`
                  : `Last updated: ${new Date(note.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                }
                onClick={onOpenHistory ? onOpenHistory : undefined} // Add click handler only if provided
                onMouseEnter={onOpenHistory ? (e) => { e.target.style.opacity = '0.8'; } : undefined} // Hover effect only if clickable
                onMouseLeave={onOpenHistory ? (e) => { e.target.style.opacity = '0.5'; } : undefined} // Reset opacity on leave only if clickable
              >
                {new Date(note.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            )}
          </LeftActions>

          {/* Center Group: Undo/Redo Actions - Absolutely Positioned */}
          {isMobile && <CenterActions>
            <SharedActionButton
              type="button"
              title="Undo"
              onClick={onUndo}
              disabled={!canUndo}
              theme={isDarkTheme ? 'dark' : 'light'}
              style={{ opacity: canUndo ? 1 : 0.3 }} // Visually indicate disabled state
            >
              <Icon name="undo" size={20} />
            </SharedActionButton>
            <SharedActionButton
              type="button"
              title="Redo"
              onClick={onRedo}
              disabled={!canRedo}
              theme={isDarkTheme ? 'dark' : 'light'}
              style={{ opacity: canRedo ? 1 : 0.3 }} // Visually indicate disabled state
            >
              <Icon name="redo" size={20} />
            </SharedActionButton>
          </CenterActions>}

          {/* Right Group: Action Buttons */}
          <RightActions>
            {/* ORDER: Clipboard (desktop only), Tags, Add Content Dropdown, Color */}

            {/* Clipboard history button with dropdown - Desktop only */}
            {!isMobile && (
              <div style={{ position: 'relative', zIndex: 1000 }}>
                <SharedActionButton
                  className="clipboard-button"
                  type="button"
                  title="Clipboard history"
                  onClick={onToggleClipboardDropdown}
                  theme={isDarkTheme ? 'dark' : 'light'}
                  aria-label="Clipboard history"
                >
                  <Icon name="copy" size={20} />
                </SharedActionButton>

                {/* ClipboardHistoryDropdown positioned relative to button */}
                <ClipboardHistoryDropdown
                  isOpen={showClipboardDropdown}
                  clipboardHistory={clipboardHistory}
                  isDarkTheme={isDarkTheme}
                  onSelectSnippet={onSelectClipboardSnippet}
                  onRemoveSnippet={onRemoveClipboardSnippet}
                  onToggleSticky={onToggleSticky}
                  onClose={onCloseClipboardDropdown}
                />
              </div>
            )}

            <SharedActionButton
              ref={tagButtonRef} // Attach the ref here
              className="tag-button"
              type="button"
              title="Add tags"
              onClick={onToggleTagsModal}
              theme={isDarkTheme ? 'dark' : 'light'}
            >
              <Icon name="tag" size={20} />
            </SharedActionButton>            <SharedActionButton
              ref={colorButtonRef} // Attach color ref
              className="palette-button"
              type="button"
              title="Change color"
              onClick={onToggleColorPicker} // Use handler from props
              theme={isDarkTheme ? 'dark' : 'light'}
            >
              <Icon name="palette" size={20} />
            </SharedActionButton>            {/* Add Content button with dropdown container */}
            <div style={{ position: 'relative' }}>
              <SharedActionButton
                ref={addContentButtonRef}
                $isDarkTheme={isDarkTheme}
                onClick={handleAddContentToggle}
                title={isAddContentBusy ? 'Working…' : 'Add content'}
                disabled={isAutoSaving || isAddContentBusy}
                aria-label="Add content"
              >
                {isAddContentBusy ? (
                  <SharedSaveIndicator />
                ) : (
                  <Icon name="addCircle" size={20} />
                )}
              </SharedActionButton>              {/* AddContentDropdown positioned relative to button */}
              <AddContentDropdown
                isOpen={showAddContentDropdown}
                triggerRef={addContentButtonRef}
                onAddImage={onAddImage}
                onAddImageFile={onAddImageFile}
                onAddSketch={onAddSketch}
                onAddTask={onAddTask}
                onAddNote={onAddNote}
                onAddAttachment={onAddAttachment}
                onAddReminder={onAddReminder} // Pass new prop
                onInsertOCR={onInsertOCR} // Pass new prop
                hasReminderIntent={hasReminderIntent} // Pass intent flag
                onSummarizeWithAI={onSummarizeWithAI}
                onAddClipboardUrl={hasClipboardUrl ? onAddClipboardUrl : null}
                clipboardUrlPreview={clipboardUrlPreview}
                clipboardActionLabel={clipboardActionLabel}
                hasClipboardUrl={hasClipboardUrl}
                isDarkTheme={isDarkTheme}
                noteColor={color}
                onClose={onCloseAddContentDropdown}
              />
            </div>
          </RightActions>

          {/* Flyout tag picker rendering is removed from here and moved to NoteForm */}
        </NoteActions>
      </FooterContent>
    </ActionBarContainer>
  );
};

// Memoized — the wrapper above (DynamicActionBarsWrapper) already uses
// React.memo, but its memo is only useful when the leaf component
// downstream also bails on equal props. Without this, any prop churn
// from NoteForm re-renders the full ~1000-line tags/refs/buttons tree.
export default React.memo(NoteActionBar);
