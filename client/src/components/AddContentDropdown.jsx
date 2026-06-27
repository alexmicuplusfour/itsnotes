import React, { useState, useLayoutEffect, useRef } from 'react';
import ReactDOM, { flushSync } from 'react-dom';
import styled, { keyframes } from 'styled-components';
import Icon from './Icons';
import { useUIPreferences } from '../contexts/UIPreferencesContext';
import goodreadsFavicon from '../assets/images/favicon_goodreads.png';
import imdbFavicon from '../assets/images/favicon_imdb.png';
import tmdbFavicon from '../assets/images/favicon_tmdb.png';

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

const DropdownOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 1998; // Lower z-index than dropdown
  display: none;

  @media (max-width: 768px) {
    display: block; // Only display on mobile
    animation: ${props => props.$isClosing ? fadeOut : fadeIn} 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }
`;

const DropdownMenu = styled.div`
  /* Desktop: Fixed positioning via Portal */
  position: fixed;
  top: ${props => props.$top ? `${props.$top}px` : 'auto'};
  left: ${props => props.$left ? `${props.$left}px` : 'auto'};
  background-color: var(--dropdown-bg-color, var(--note-bg-color));
  border-radius: 6px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  z-index: 1999;
  min-width: max-content;
  overflow: hidden;
  padding-top: 6px;
  padding-bottom: 6px;

  /* Flex column so rows stretch to the menu's actual rendered width (instead of
     resolving width:100% against the shrink-to-fit/max-content basis, which let
     right-aligned content fall outside the overflow:hidden edge). */
  display: flex;
  flex-direction: column;
  align-items: stretch;

  opacity: ${props => props.$isPositioned ? 1 : 0};
  pointer-events: ${props => props.$isPositioned ? 'auto' : 'none'};

  @media (max-width: 768px) {
    /* Mobile: Fixed positioning as a bottom drawer */
    position: fixed !important;
    width: 100% !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    top: auto !important;
    
    pointer-events: auto;
    
    border-radius: 12px 12px 0 0;
    border-left: none;
    border-right: none;
    border-bottom: none;
    
    box-sizing: border-box;
    box-shadow: 0 -2px 60px var(--shadow-color);
    background-color: ${props => props.$noteColor && props.$noteColor !== 'default' 
      ? `var(--note-color-${props.$noteColor})` 
      : 'var(--dropdown-bg-color, var(--note-bg-color))'};
    
    padding-top: 16px;
    padding-bottom: 16px;
    padding-right: 0px;
    padding-left: 0px;
    
    animation: ${props => props.$isClosing ? slideDown : slideUp} 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }
`;

const DropdownItem = styled.button`
  /* Width comes from the parent flex column's align-items:stretch — no width:100%,
     which would re-introduce the shrink-to-fit overflow bug. */
  padding: 10px 12px;
  text-align: left;
  background: none;
  border: none;
  cursor: ${props => props.$disabled ? 'not-allowed' : 'pointer'};
  display: flex;
  align-items: center;
  font-size: 14px;
  color: ${props => props.$disabled ? 'var(--text-color-muted)' : 'var(--text-color)'};
  opacity: ${props => props.$disabled ? 0.6 : 1};

  @media (max-width: 768px) {
    font-size: 16px;
    padding: 16px 12px;
    padding-left: 20px;
  }

  &:hover {
    background-color: ${props => {
    if (props.$disabled) return 'transparent';
    return props.theme === 'dark'
      ? 'rgba(255, 255, 255, 0.1)'
      : 'rgba(0, 0, 0, 0.05)';
  }};
  }

  & > svg {
    margin-right: 14px;
    opacity: ${props => props.$disabled ? 0.5 : 1};

    @media (max-width: 768px) {
      margin-right: 20px;
      width: 24px;
      height: 24px;
    }
  }
`;

const DropdownPreviewText = styled.div`
  font-size: 12px;
  color: var(--text-color-muted);
  margin-top: 2px;
  opacity: 0.7;

  @media (max-width: 768px) {
    font-size: 13px;
    margin-top: 4px;
  }
`;

// Label that sits before a RowTrailingAction. The right margin guarantees a gap
// from the action even when the row is the menu's widest (so margin-left:auto on
// the action has no slack of its own to add).
const RowLabel = styled.span`
  margin-right: 12px;
`;

// Trailing action for a dropdown row: margin-left:auto right-aligns it within the
// flex row. Pure flexbox, no positioning math — reusable for any row that wants a
// right-aligned action. Here it's the OCR paste shortcut, shown only when the
// clipboard holds an image.
const RowTrailingAction = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: auto;
  padding: 5px;
  border-radius: 6px;
  color: var(--text-color-muted);
  cursor: pointer;

  &:hover {
    background-color: ${props => props.theme === 'dark'
    ? 'rgba(255, 255, 255, 0.15)'
    : 'rgba(0, 0, 0, 0.08)'};
    color: var(--text-color);
  }

  & > svg {
    margin-right: 0;
  }

  @media (max-width: 768px) {
    padding: 8px;

    & > svg {
      width: 22px;
      height: 22px;
    }
  }
`;
 
const AddContentDropdown = ({
  isOpen,
  triggerRef,
  onAddImage,
  onAddImageFile = null,
  onAddSketch = null,
  onAddTask,
  onAddNote = null,
  onAddAttachment = null,
  onAddClipboardUrl = null,
  onAddReminder = null,
  onSummarizeWithAI = null,
  onInsertOCR = null,
  clipboardUrlPreview = null,
  clipboardActionLabel = 'Add Content from URL',
  hasClipboardUrl = false,
  hasReminderIntent = false, // New prop
  isDarkTheme = false,
  noteColor = null,
  onClose
}) => {
  const { aiEnabled } = useUIPreferences();
  const fileInputRef = useRef(null);
  const ocrFileInputRef = useRef(null);
  const dropdownRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isPositioned, setIsPositioned] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [shouldRender, setShouldRender] = useState(isOpen);
  // Whether the clipboard currently holds an image, so we can offer a direct
  // "paste to OCR" shortcut instead of forcing the user to save the file first.
  const [hasClipboardImage, setHasClipboardImage] = useState(false);

  // Force immediate render if open to avoid "double click" requirement
  if (isOpen && !shouldRender) {
    setShouldRender(true);
  }

  // Handle open/close state transitions for animation
  React.useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
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

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      if (onAddAttachment) {
        onAddAttachment(e.target.files);
      }
      // Reset input
      e.target.value = '';
      if (onClose) onClose();
    }
  };

  const handleOcrFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      if (onInsertOCR) {
        onInsertOCR(e.target.files[0]);
      }
      // Reset input
      e.target.value = '';
      if (onClose) onClose();
    }
  };

  // When the menu opens, peek at the clipboard for an image so we can surface a
  // direct paste shortcut on the Add Image and OCR rows.
  React.useEffect(() => {
    if (!isOpen) {
      setHasClipboardImage(false);
      return;
    }

    if (window.isSecureContext === false || !navigator.clipboard || !navigator.clipboard.read) {
      return;
    }

    let cancelled = false;
    navigator.clipboard.read()
      .then((items) => {
        const found = items.some(item => item.types.some(type => type.startsWith('image/')));
        if (!cancelled) setHasClipboardImage(found);
      })
      .catch((err) => {
        // Permission denied / unsupported — just hide the shortcut silently.
        console.warn('[AddContentDropdown] Could not read clipboard for image:', err);
        if (!cancelled) setHasClipboardImage(false);
      });

    return () => { cancelled = true; };
  }, [isOpen]);

  // Read an image off the clipboard and return it as a File, or null if there
  // isn't one (or the read failed/clipboard changed since we detected it).
  const readClipboardImage = async () => {
    if (!navigator.clipboard || !navigator.clipboard.read) return null;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(type => type.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const ext = (blob.type.split('/')[1] || 'png').split(';')[0];
          return new File([blob], `clipboard-image.${ext}`, { type: blob.type });
        }
      }
    } catch (err) {
      console.warn('[AddContentDropdown] Failed to read image from clipboard:', err);
    }
    return null;
  };

  // Paste the clipboard image straight into the OCR pipeline. Falls back to the
  // file picker if the clipboard no longer has an image.
  const handlePasteOcrClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = await readClipboardImage();
    if (file) {
      if (onInsertOCR) onInsertOCR(file);
      if (onClose) onClose();
    } else {
      ocrFileInputRef.current?.click();
    }
  };

  // Paste the clipboard image straight in as an inline image. Falls back to the
  // normal "Add Image" file picker if the clipboard no longer has an image.
  const handlePasteImageClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = await readClipboardImage();
    if (file) {
      if (onAddImageFile) onAddImageFile(file);
      if (onClose) onClose();
    } else if (onAddImage) {
      onAddImage(e);
    }
  };

  // Positioning logic. Re-runs on open and whenever the window resizes so the
  // menu stays anchored to its trigger button (matching the note-actions menu).
  useLayoutEffect(() => {
    if (!isOpen || window.innerWidth <= 768) {
      setIsPositioned(false);
      return;
    }

    const updatePosition = () => {
      if (!triggerRef?.current || !dropdownRef.current) return;

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const dropdownRect = dropdownRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const windowWidth = window.innerWidth;
      const GAP = 8;
      const PADDING = 10;

      // Default: Position above the trigger, aligned to the right
      let top = triggerRect.top - dropdownRect.height - GAP;
      let left = triggerRect.right - dropdownRect.width;

      // Check if it fits above
      if (top < PADDING) {
        // Try below
        const topBelow = triggerRect.bottom + GAP;
        if (topBelow + dropdownRect.height <= windowHeight - PADDING) {
          top = topBelow;
        } else {
          // If neither fits perfectly, clamp to top PADDING
          top = Math.max(PADDING, top);
        }
      }

      // Ensure it doesn't go off-screen left
      if (left < PADDING) {
        left = PADDING;
      }

      // Ensure it doesn't go off-screen right
      if (left + dropdownRect.width > windowWidth - PADDING) {
        left = windowWidth - dropdownRect.width - PADDING;
      }

      setPosition({ top, left });
      setIsPositioned(true);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);

  }, [isOpen, triggerRef]);

  // Click outside to close on desktop (mobile uses backdrop)
  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      // Only apply to desktop (mobile uses backdrop)
      if (window.innerWidth <= 768) return;

      // Check if click is on add content button or inside dropdown
      // We check triggerRef directly now
      const isTrigger = triggerRef?.current && triggerRef.current.contains(e.target);
      const isInsideDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);

      if (!isTrigger && !isInsideDropdown) {
        console.log('[AddContentDropdown] Click outside on desktop, closing');
        onClose();
      }
    };

    // Use a small delay to avoid immediate closure when opening
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, triggerRef]);

  const handleBackdropClick = (e) => {
    console.log('[AddContentDropdown] Backdrop clicked');
    e.stopPropagation();
    onClose();
  };

  const handleDropdownClick = (e) => {
    e.stopPropagation(); // Prevent clicks inside dropdown from bubbling up
  };

  const handleAddImageClick = (e) => {
    console.log('[AddContentDropdown] Add Image clicked');
    e.preventDefault();
    e.stopPropagation();
    onAddImage(e);
  };
  const handleAddSketchClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onAddSketch) onAddSketch(e);
    onClose();
  };

  const handleAddTaskClick = (e) => {
    console.log('[AddContentDropdown] Add Task clicked');
    e.preventDefault();
    e.stopPropagation();
    onAddTask(e);
  };

  const handleAddNoteClick = (e) => {
    console.log('[AddContentDropdown] Add Note clicked');
    e.preventDefault();
    e.stopPropagation();
    if (onAddNote) {
      onAddNote(e);
    }
  };

  const handleAddClipboardUrlClick = (e) => {
    console.log('[AddContentDropdown] Add Clipboard URL clicked');
    e.preventDefault();
    e.stopPropagation();

    // Only proceed if we have a valid URL and handler
    if (hasClipboardUrl && onAddClipboardUrl) {
      onAddClipboardUrl(e);
    }
  };

  const handleSummarizeWithAIClick = (e) => {
    console.log('[AddContentDropdown] Summarize with AI clicked');
    e.preventDefault();
    e.stopPropagation();
    if (onSummarizeWithAI) {
      onSummarizeWithAI(e);
    }
    onClose();
  };

  const handleCreateReminderClick = (e) => {
    console.log('[AddContentDropdown] Create Reminder clicked');
    e.preventDefault();
    e.stopPropagation();
    if (onAddReminder) {
      onAddReminder(e);
    }
    onClose();
  };

  if (!shouldRender) return null;

  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    // On mobile, render both overlay and dropdown through portal
    return ReactDOM.createPortal(
      <>
        <DropdownOverlay
          $isVisible={isOpen}
          $isClosing={isClosing}
          onClick={handleBackdropClick}
          data-add-content-dropdown="overlay"
        />
        <DropdownMenu
          $isVisible={isOpen}
          $isClosing={isClosing}
          $noteColor={noteColor}
          onClick={handleDropdownClick}
          data-add-content-dropdown="menu"
        >
          <DropdownItem
            onClick={handleAddImageClick}
            theme={isDarkTheme ? 'dark' : 'light'}
            data-add-content-dropdown="item"
          >
            <Icon name="image" size={18} />
            <RowLabel>Add Image</RowLabel>
            {hasClipboardImage && (
              <RowTrailingAction
                role="button"
                tabIndex={0}
                theme={isDarkTheme ? 'dark' : 'light'}
                onClick={handlePasteImageClick}
                title="Paste image from clipboard"
                aria-label="Paste image from clipboard"
              >
                <Icon name="clipboard" size={16} />
              </RowTrailingAction>
            )}
          </DropdownItem>
          <DropdownItem
            onClick={handleAddSketchClick}
            theme={isDarkTheme ? 'dark' : 'light'}
            data-add-content-dropdown="item"
          >
            <Icon name="sketch" size={18} />
            Draw
          </DropdownItem>
          <DropdownItem
            onClick={handleAddTaskClick}
            theme={isDarkTheme ? 'dark' : 'light'}
            data-add-content-dropdown="item"
          >
            <Icon name="tiptap_tasklist" size={18} />
            Add Task List
          </DropdownItem>
          <DropdownItem
            onClick={handleAddNoteClick}
            theme={isDarkTheme ? 'dark' : 'light'}
            data-add-content-dropdown="item"
          >
            <Icon name="notes" size={18} />
            Add Note
          </DropdownItem>
          {aiEnabled && <>
          <DropdownItem
            onClick={handleCreateReminderClick}
            theme={isDarkTheme ? 'dark' : 'light'}
            $disabled={!hasReminderIntent}
            data-add-content-dropdown="item"
          >
            <Icon name="bell" size={18} />
            <div>
              Generate Reminder
              <DropdownPreviewText>Remind me...</DropdownPreviewText>
            </div>
          </DropdownItem>
          <DropdownItem
            onClick={handleSummarizeWithAIClick}
            theme={isDarkTheme ? 'dark' : 'light'}
            data-add-content-dropdown="item"
          >
            <Icon name="summarize_ai" size={18} />
            Insert Summary
          </DropdownItem>
          <DropdownItem
            onClick={() => ocrFileInputRef.current?.click()}
            theme={isDarkTheme ? 'dark' : 'light'}
            data-add-content-dropdown="item"
          >
            <Icon name="ocr" size={18} />
            <RowLabel>Insert OCR Text…</RowLabel>
            {hasClipboardImage && (
              <RowTrailingAction
                role="button"
                tabIndex={0}
                theme={isDarkTheme ? 'dark' : 'light'}
                onClick={handlePasteOcrClick}
                title="Paste image from clipboard"
                aria-label="Paste image from clipboard for OCR"
              >
                <Icon name="clipboard" size={16} />
              </RowTrailingAction>
            )}
          </DropdownItem>
          </>}
          <DropdownItem
            onClick={handleAddClipboardUrlClick}
            theme={isDarkTheme ? 'dark' : 'light'}
            $disabled={!hasClipboardUrl}
            data-add-content-dropdown="item"
          >
            <Icon name="link" size={18} />
            <div>
              {clipboardActionLabel}
              <DropdownPreviewText>{clipboardUrlPreview}</DropdownPreviewText>
            </div>
          </DropdownItem>
          <DropdownItem
            onClick={() => fileInputRef.current?.click()}
            theme={isDarkTheme ? 'dark' : 'light'}
            data-add-content-dropdown="item"
          >
            <Icon name="attachment" size={20} />
            Attach files…
          </DropdownItem>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            multiple
            onChange={handleFileSelect}
          />
          <input
            type="file"
            ref={ocrFileInputRef}
            style={{ display: 'none' }}
            accept="image/*"
            onChange={handleOcrFileSelect}
          />
        </DropdownMenu>
      </>,
      document.body
    );
  }

  // On desktop, render normally (positioned relative to container)
  return ReactDOM.createPortal(
    <>
      <DropdownOverlay
        $isVisible={isOpen}
        onClick={handleBackdropClick}
        data-add-content-dropdown="overlay"
      />
      <DropdownMenu
        ref={dropdownRef}
        onClick={handleDropdownClick}
        data-add-content-dropdown="menu"
        $top={position.top}
        $left={position.left}
        $isPositioned={isPositioned}
      ><DropdownItem
        onClick={handleAddImageClick}
        theme={isDarkTheme ? 'dark' : 'light'}
        data-add-content-dropdown="item"
      >
          <Icon name="image" size={18} />
          <RowLabel>Add Image</RowLabel>
          {hasClipboardImage && (
            <RowTrailingAction
              role="button"
              tabIndex={0}
              theme={isDarkTheme ? 'dark' : 'light'}
              onClick={handlePasteImageClick}
              title="Paste image from clipboard"
              aria-label="Paste image from clipboard"
            >
              <Icon name="clipboard" size={16} />
            </RowTrailingAction>
          )}
        </DropdownItem>
        <DropdownItem
          onClick={handleAddSketchClick}
          theme={isDarkTheme ? 'dark' : 'light'}
          data-add-content-dropdown="item"
        >
          <Icon name="sketch" size={18} />
          Draw
        </DropdownItem>
        <DropdownItem
          onClick={handleAddTaskClick}
          theme={isDarkTheme ? 'dark' : 'light'}
          data-add-content-dropdown="item"
        >
          <Icon name="tiptap_tasklist" size={18} />
          Add Task List
        </DropdownItem>
        <DropdownItem
          onClick={handleAddNoteClick}
          theme={isDarkTheme ? 'dark' : 'light'}
          data-add-content-dropdown="item"
        >
          <Icon name="notes" size={18} />
          Add Note
        </DropdownItem>
        {aiEnabled && <>
        <DropdownItem
          onClick={handleCreateReminderClick}
          theme={isDarkTheme ? 'dark' : 'light'}
          $disabled={!hasReminderIntent}
          data-add-content-dropdown="item"
        >
          <Icon name="bell" size={18} />
          <div>
            Generate Reminder
            <DropdownPreviewText>Remind me...</DropdownPreviewText>
          </div>
        </DropdownItem>
        <DropdownItem
          onClick={handleSummarizeWithAIClick}
          theme={isDarkTheme ? 'dark' : 'light'}
          data-add-content-dropdown="item"
        >
          <Icon name="summarize_ai" size={18} />
          Insert Summary
        </DropdownItem>
        <DropdownItem
          onClick={() => ocrFileInputRef.current?.click()}
          theme={isDarkTheme ? 'dark' : 'light'}
          data-add-content-dropdown="item"
        >
          <Icon name="ocr" size={18} />
          <RowLabel>Insert OCR Text…</RowLabel>
          {hasClipboardImage && (
            <RowTrailingAction
              role="button"
              tabIndex={0}
              theme={isDarkTheme ? 'dark' : 'light'}
              onClick={handlePasteOcrClick}
              title="Paste image from clipboard"
              aria-label="Paste image from clipboard for OCR"
            >
              <Icon name="clipboard" size={16} />
            </RowTrailingAction>
          )}
        </DropdownItem>
        </>}
        <DropdownItem
          onClick={handleAddClipboardUrlClick}
          theme={isDarkTheme ? 'dark' : 'light'}
          $disabled={!hasClipboardUrl}
          data-add-content-dropdown="item"
        >
          <Icon name="link" size={18} />
          <div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {clipboardActionLabel?.includes('Goodreads') && (
                <img src={goodreadsFavicon} alt="" style={{ width: 14, height: 14, borderRadius: 3, marginTop:-1 }} />
              )}
              {clipboardActionLabel?.includes('IMDb') && (
                <img src={imdbFavicon} alt="" style={{ width: 14, height: 14, borderRadius: 3, marginTop:-1 }} />
              )}
              {clipboardActionLabel?.includes('TMDB') && (
                <img src={tmdbFavicon} alt="" style={{ width: 14, height: 14, borderRadius: 3, marginTop:-1 }} />
              )}
              {clipboardActionLabel}
            </span>
            <DropdownPreviewText>{clipboardUrlPreview}</DropdownPreviewText>
          </div>
        </DropdownItem>
        <DropdownItem
          onClick={() => fileInputRef.current?.click()}
          theme={isDarkTheme ? 'dark' : 'light'}
          data-add-content-dropdown="item"
        >
          <Icon name="attachment" size={20} />
          Attach files…
        </DropdownItem>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          multiple
          onChange={handleFileSelect}
        />
        <input
          type="file"
          ref={ocrFileInputRef}
          style={{ display: 'none' }}
          accept="image/*"
          onChange={handleOcrFileSelect}
        />
      </DropdownMenu>
    </>,
    document.body
  );
};

export default AddContentDropdown;
