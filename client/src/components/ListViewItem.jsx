import React, { useState, useEffect, memo, useCallback, useRef, useMemo, useSyncExternalStore } from 'react';
import styled, { css } from 'styled-components';
import Icon from './Icons';
import { ColorPicker } from './ColorPicker';
import { TagPicker } from './NoteTagPicker';
import { formatDistanceToNow } from 'date-fns';
import { getServerUrl } from '../services/api';
import { useNoteActions } from '../contexts/NoteActionsContext';

// Container for the list item
const ItemContainer = styled.div`
  display: flex;
  align-items: stretch;
  padding: ${props => props.$hasBookCover ? '0 16px 0 0' : '10px 16px'};
  cursor: pointer;
  border-bottom: 1px solid var(--border-transparent);
  /* Use CSS variable set via inline style to avoid regenerating classes per color */
  background-color: var(--item-bg-color, transparent);
  transition: background-color 0.15s ease, filter 0.15s ease;
  position: relative;
  min-height: 72px;
  overflow: hidden;

  /* Active/selected state - darken the background */
  filter: ${props => (props.$isActive || props.$isSelected) ? 'brightness(0.9)' : 'none'};

  ${props => props.$isActive && css`
    border-right: 4px solid var(--text-color);
  `}

  &:hover {
    filter: brightness(0.95);
  }

  /* Rounded corners for first and last items in section (desktop only) */
  &:first-child {
    border-top-left-radius: 12px;
    border-top-right-radius: 12px;
  }

  &:last-child {
    border-bottom-left-radius: 12px;
    border-bottom-right-radius: 12px;
    border-bottom: none;
  }

  /* Selected state with outline */
  ${props => props.$isSelected && css`
    outline: 2px solid var(--text-color);
    outline-offset: -2px;

    /* Hide top border if previous sibling is also selected */
    ${props.$isPrevSelected && css`
      border-top: none;
      outline-top: none;
      margin-top: -2px;
      padding-top: ${props => props.$hasBookCover ? '1px' : '12px'};
    `}

    /* Hide bottom border if next sibling is also selected */
    ${props.$isNextSelected && css`
      border-bottom: none;
      outline-bottom: none;
      padding-bottom: ${props => props.$hasBookCover ? '2px' : '11px'};

    `}
  `}

  @media (max-width: 768px) {
    margin-bottom: 4px;
    border: none;
    border-radius: 10px;

    /* Apply outline for default colored notes when not selected */
    ${props => !props.$isSelected && css`
      outline: var(--item-outline, none);
      outline-offset: -1px;
    `}

    /* Apply 2px outline when selected */
    ${props => props.$isSelected && css`
      outline: 2px solid var(--text-color);
      outline-offset: -2px;
    `}
  }
`;

// Selection checkbox styled component
// Tiny dot in the top-right corner shown while a note is not yet prefetched.
// Fades out the moment the note lands in the cache.
const PrefetchIndicator = styled.div`
  position: absolute;
  top: 6px;
  right: 8px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: var(--text-color);
  opacity: ${props => (props.$visible ? 0.18 : 0)};
  transition: opacity 0.4s ease;
  pointer-events: none;
`;

const SelectionCheckbox = styled.div`
  position: absolute;
  top: 10px;
  right: 10px;
  width: 20px;
  height: 20px;
  min-width: 20px;
  border-radius: 50%;
  background-color: var(--note-bg-color);
  border: 2px solid var(--note-border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 5;
  opacity: ${props => props.$visible ? 1 : 0};
  transform: ${props => props.$visible ? 'scale(1)' : 'scale(0.5)'};
  transition: opacity 0.15s ease-in-out, transform 0.15s ease-in-out, border-color 0.15s ease-in-out;

  /* Style when selected */
  ${props => props.$isSelected && css`
    background-color: var(--foreground-color);
    border-color: var(--text-color);
    opacity: 1;
    transform: scale(1);
  `}

  /* Checkmark icon */
  & > svg {
    color: var(--background-color);
    opacity: ${props => props.$isSelected ? 1 : 0};
    transition: opacity 0.1s ease-in-out;
  }

  &:hover {
    border-color: var(--foreground-color);
  }
`;

// Book cover thumbnail (shown to the left of content)
const BookCoverThumbnail = styled.img`
  width: 60px;
  min-height: 100%;
  object-fit: cover;
  border-radius: 0;
  margin-right: 12px;
  flex-shrink: 0;
`;

// Content area (left side)
const ContentArea = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: ${props => props.$hasBookCover ? '10px 0' : '0'};
`;

const Title = styled.div`
  font-size: 18px;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
`;

const ContentPreview = styled.div`
  font-family: var(--note-body-font-family, 'Product Sans', Arial, sans-serif);
  font-size: var(--note-card-body-font-size, 15px);
  color: var(--text-color);
  width: calc(100% - 6px);
  opacity: 1;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const DateText = styled.div`
  font-size: 13px;
  color: var(--text-color);
  opacity: 0.5;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
`;

const PinIndicator = styled.span`
  display: inline-flex;
  align-items: center;
  opacity: 0.6;
`;

// Bottom row containing date and hover actions
const BottomRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  margin-top: 2px;
`;

// Hover actions container (Gmail-style)
const HoverActions = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  transition: opacity 0.15s ease;
  margin-left: auto;
  margin-right: -6px;
  
  ${ItemContainer}:hover & {
    opacity: 1;
  }
  
  /* Keep visible when a picker is open */
  ${props => props.$forceVisible && css`
    opacity: 1;
  `}
  
  /* Hide on mobile */
  @media (max-width: 768px) {
    display: none;
  }
`;

const ActionButton = styled.button`
  background: none;
  border: none;
  padding: 6px;
  cursor: pointer;
  color: var(--text-color);
  opacity: 0.9;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.1s ease, background-color 0.1s ease;
  
  &:hover {
    opacity: 1;
    background-color: var(--button-bg);
  }
`;

// Helper function to strip HTML tags and get plain text
const getPlainTextContent = (htmlContent) => {
  if (!htmlContent) return '';
  
  // Create a temporary div to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = htmlContent;
  
  // Replace block-level elements with dot separator before getting text content
  // This prevents paragraphs from merging together and adds visual separation
  const blockTags = temp.querySelectorAll('p, div, br, li, h1, h2, h3, h4, h5, h6, blockquote, tr');
  blockTags.forEach(el => {
    el.insertAdjacentText('beforebegin', ' · ');
  });
  
  // Get text content and clean it up
  let text = temp.textContent || temp.innerText || '';
  text = text.trim().replace(/\s+/g, ' ');
  // Remove leading dot and collapse multiple dots
  text = text.replace(/^·\s*/, '').replace(/(\s*·\s*)+/g, ' · ');
  return text;
};

// Helper function to format date
const formatDate = (dateString) => {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return '';
  }
};

const ListViewItem = memo(function ListViewItem({
  note,
  isActive = false,
  isSelected = false,
  isPrevSelected = false,
  isNextSelected = false,
  isSelectionMode = false,
  onSelect,
  onToggleSelection,
  onTogglePin,
  onArchive,
  onUnarchive,
  onTrash,
  onRestore,
  onDelete,
  onChangeColor,
  view,
  searchQuery
}) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDarkTheme, setIsDarkTheme] = useState(() =>
    !document.documentElement.classList.contains('light-theme')
  );
  const colorButtonRef = useRef(null);
  const tagButtonRef = useRef(null);
  const tagPickerRef = useRef(null);
  const itemRef = useRef(null);

  const {
    subscribeToCacheStatus,
    getNoteCacheStatus,
    prefetchNoteToCache,
    getViewportPrefetchDelay,
  } = useNoteActions();

  const subscribeCacheStatus = useCallback(
    (cb) => subscribeToCacheStatus(note.id, cb),
    [subscribeToCacheStatus, note.id]
  );
  const getCacheStatusSnapshot = useCallback(
    () => getNoteCacheStatus(note.id),
    [getNoteCacheStatus, note.id]
  );
  const isCached = useSyncExternalStore(subscribeCacheStatus, getCacheStatusSnapshot);

  useEffect(() => {
    if (isCached) return;
    const el = itemRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    let pendingTimer = null;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          if (pendingTimer) return;
          pendingTimer = setTimeout(() => {
            pendingTimer = null;
            prefetchNoteToCache(note.id);
          }, getViewportPrefetchDelay());
        } else if (pendingTimer) {
          clearTimeout(pendingTimer);
          pendingTimer = null;
        }
      },
      { rootMargin: '200px' }
    );
    obs.observe(el);
    return () => {
      if (pendingTimer) clearTimeout(pendingTimer);
      obs.disconnect();
    };
  }, [isCached, note.id, prefetchNoteToCache, getViewportPrefetchDelay]);

  // Memoize hover handlers to prevent recreating on each render
  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);
  
  const isNoteDeleted = note?.is_deleted === true;
  const isNoteArchived = note?.is_archived === true;

  // Extract book object if present
  const bookObject = useMemo(() => {
    const noteObjects = note.objects || [];
    return noteObjects.find(obj => obj.type === 'book');
  }, [note.objects]);

  const bookThumbnailUrl = useMemo(() => {
    if (!bookObject) return null;
    const thumbnailUrl = bookObject.thumbnail_url || bookObject.metadata?.source?.cover_url;
    return thumbnailUrl ? getServerUrl(thumbnailUrl) : null;
  }, [bookObject]);

  // Plain text content for preview
  const contentPreview = useMemo(() => {
    return getPlainTextContent(note.content);
  }, [note.content]);
  
  // Formatted date
  const formattedDate = useMemo(() => {
    return formatDate(note.created_at);
  }, [note.created_at]);
  
  // Update theme when it changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkTheme(!document.documentElement.classList.contains('light-theme'));
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    return () => observer.disconnect();
  }, []);
  
  // Handle item click
  const handleClick = useCallback((e) => {
    if (e.target.closest('.hover-actions')) {
      return;
    }

    if (isSelectionMode) {
      onToggleSelection(note.id);
    } else if (onSelect) {
      onSelect(note);
    }
  }, [note, onSelect, isSelectionMode, onToggleSelection]);

  // Handle context menu (right-click on desktop, long-press on mobile)
  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleSelection(note.id);
  }, [note.id, onToggleSelection]);
  
  // Action handlers
  const handlePin = useCallback((e) => {
    e.stopPropagation();
    onTogglePin(note.id);
  }, [note.id, onTogglePin]);
  
  const handleArchive = useCallback((e) => {
    e.stopPropagation();
    if (isNoteArchived) {
      onUnarchive(note.id);
    } else {
      onArchive(note.id);
    }
  }, [note.id, isNoteArchived, onArchive, onUnarchive]);
  
  const handleTrash = useCallback((e) => {
    e.stopPropagation();
    onTrash(note.id);
  }, [note.id, onTrash]);
  
  const handleRestore = useCallback((e) => {
    e.stopPropagation();
    onRestore(note.id);
  }, [note.id, onRestore]);
  
  const handleDelete = useCallback((e) => {
    e.stopPropagation();
    onDelete(note.id);
  }, [note.id, onDelete]);
  
  // Color picker handlers
  const handleColorClick = useCallback((e) => {
    e.stopPropagation();
    setShowColorPicker(prev => !prev);
    setShowTagPicker(false);
  }, []);

  const handleColorSelect = useCallback((color) => {
    onChangeColor(note.id, color);
    setShowColorPicker(false);
  }, [note.id, onChangeColor]);

  const handleCloseColorPicker = useCallback(() => {
    setShowColorPicker(false);
  }, []);

  // Tag picker handlers
  const handleTagClick = useCallback((e) => {
    e.stopPropagation();
    setShowTagPicker(prev => !prev);
    setShowColorPicker(false);
  }, []);
  
  const handleCloseTagPicker = useCallback(() => {
    setShowTagPicker(false);
  }, []);
  
  const pickerOpen = showColorPicker || showTagPicker;
  const showActions = isHovered || pickerOpen;

  // Compute inline style for color CSS variables - avoids styled-components class regeneration
  const itemColorStyle = useMemo(() => {
    const color = note.color || 'default';
    const style = {};

    // Background color for colored notes
    if (color && color !== 'default') {
      style['--item-bg-color'] = `var(--note-color-${color})`;
    } else if (isActive) {
      // Active default-colored notes get subtle background
      style['--item-bg-color'] = 'var(--fill-subtle)';
    }

    // Mobile outline for default colored notes
    if (color === 'default' || !color) {
      style['--item-outline'] = '1px solid var(--border-transparent)';
    }

    return style;
  }, [note.color, isActive]);

  // Determine if checkbox should be visible
  // Show on hover, when selected, or when in selection mode (any note selected)
  const showCheckbox = isHovered || isSelected || isSelectionMode;

  return (
    <ItemContainer
      ref={itemRef}
      data-note-id={note.id}
      style={itemColorStyle}
      $isActive={isActive}
      $isSelected={isSelected}
      $isPrevSelected={isPrevSelected}
      $isNextSelected={isNextSelected}
      $hasBookCover={!!bookThumbnailUrl}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <PrefetchIndicator $visible={!isCached} aria-hidden="true" />

      {/* Selection checkbox */}
      <SelectionCheckbox
        $visible={showCheckbox}
        $isSelected={isSelected}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelection(note.id);
        }}
      >
        {isSelected && <Icon name="check" size={16} strokeWidth="3" />}
      </SelectionCheckbox>

      {/* Book cover thumbnail (if present) */}
      {bookThumbnailUrl && (
        <BookCoverThumbnail
          src={bookThumbnailUrl}
          alt={bookObject?.title || 'Book cover'}
        />
      )}

      {/* Content area */}
      <ContentArea $hasBookCover={!!bookThumbnailUrl}>
        {/* Title */}
        {note.title && <Title>{note.title}</Title>}
        
        {/* Content preview */}
        {contentPreview && (
          <ContentPreview>
            {contentPreview.length > 120 
              ? `${contentPreview.substring(0, 120)}...` 
              : contentPreview}
          </ContentPreview>
        )}
        
        {/* Bottom row: Date and hover actions */}
        <BottomRow>
          <DateText>
            {note.is_pinned && (
              <PinIndicator>
                <Icon name="pinned" size={12} />
              </PinIndicator>
            )}
            {formattedDate}
          </DateText>
          
          {/* Hover action buttons - only render when hovered or picker open */}
          {showActions && !isSelectionMode && (
            <HoverActions className="hover-actions" $forceVisible={pickerOpen}>
              <ActionButton
                ref={colorButtonRef}
                title="Change color"
                onClick={handleColorClick}
              >
                <Icon name="palette" size={18} />
              </ActionButton>
              
              <ActionButton
                ref={tagButtonRef}
                title="Add tags"
                onClick={handleTagClick}
              >
                <Icon name="tag" size={18} />
              </ActionButton>
              
              <ActionButton
                title={note.is_pinned ? "Unpin" : "Pin"}
                onClick={handlePin}
              >
                <Icon name={note.is_pinned ? "pinned" : "pin"} size={18} />
              </ActionButton>
              
              {!isNoteArchived && !isNoteDeleted && (
                <ActionButton
                  title="Archive"
                  onClick={handleArchive}
                >
                  <Icon name="archive" size={18} />
                </ActionButton>
              )}
              
              {isNoteArchived && (
                <ActionButton
                  title="Unarchive"
                  onClick={handleArchive}
                >
                  <Icon name="unarchive" size={18} />
                </ActionButton>
              )}
              
              {(view === 'main' || view === 'archive') && (
                <ActionButton
                  title="Move to trash"
                  onClick={handleTrash}
                >
                  <Icon name="trash" size={18} />
                </ActionButton>
              )}
              
              {view === 'trash' && (
                <>
                  <ActionButton
                    title="Restore"
                    onClick={handleRestore}
                  >
                    <Icon name="restore" size={18} />
                  </ActionButton>
                  <ActionButton
                    title="Delete permanently"
                    onClick={handleDelete}
                  >
                    <Icon name="deleteForever" size={18} />
                  </ActionButton>
                </>
              )}
            </HoverActions>
          )}
        </BottomRow>
      </ContentArea>
      
      {/* Color Picker */}
      {showColorPicker && (
        <ColorPicker
          currentColor={note.color || 'default'}
          onColorSelect={handleColorSelect}
          onClose={handleCloseColorPicker}
          targetRef={colorButtonRef}
          position="top-right"
        />
      )}
      
      {/* Tag Picker */}
      {showTagPicker && (
        <TagPicker
          noteId={note.id}
          prefetchedNoteTags={note.tags || []}
          onClose={handleCloseTagPicker}
          triggerRef={tagButtonRef}
          forwardedRef={tagPickerRef}
          forceAutoApply={true}
        />
      )}
    </ItemContainer>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for memo - only re-render when these specific things change
  if (prevProps.note.id !== nextProps.note.id) return false;
  if (prevProps.isActive !== nextProps.isActive) return false;
  if (prevProps.isSelected !== nextProps.isSelected) return false;
  if (prevProps.isPrevSelected !== nextProps.isPrevSelected) return false;
  if (prevProps.isNextSelected !== nextProps.isNextSelected) return false;
  if (prevProps.isSelectionMode !== nextProps.isSelectionMode) return false;
  if (prevProps.view !== nextProps.view) return false;
  if (prevProps.searchQuery !== nextProps.searchQuery) return false;
  if (prevProps.note.title !== nextProps.note.title) return false;
  if (prevProps.note.color !== nextProps.note.color) return false;
  if (prevProps.note.is_pinned !== nextProps.note.is_pinned) return false;
  if (prevProps.note.is_archived !== nextProps.note.is_archived) return false;
  if (prevProps.note.is_deleted !== nextProps.note.is_deleted) return false;

  const prevContent = prevProps.note.content || '';
  const nextContent = nextProps.note.content || '';
  if (prevContent.length !== nextContent.length) return false;

  // Check tags
  const prevTags = prevProps.note.tags || [];
  const nextTags = nextProps.note.tags || [];
  if (prevTags.length !== nextTags.length) return false;

  // Check objects (for book covers)
  const prevObjects = prevProps.note.objects || [];
  const nextObjects = nextProps.note.objects || [];
  if (prevObjects.length !== nextObjects.length) return false;

  // Function props are stable (from useCallback in parent), skip comparing them
  return true;
});

ListViewItem.displayName = 'ListViewItem';

export default ListViewItem;