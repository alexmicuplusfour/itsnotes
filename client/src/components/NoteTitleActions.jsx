// src/components/NoteTitleActions.jsx
import React, { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react'; // Added useEffect, useRef
import { createPortal } from 'react-dom';
import styled, { keyframes, css } from 'styled-components';
import { useNavigate, useLocation } from 'react-router-dom';
import { useNotes } from '../contexts/NotesContext';
import { useStarredNotes } from '../contexts/StarredNotesContext';
import Icon from './Icons';
import { ActionButton, CircleIconWrapper as SharedCircleIconWrapper, HighlightedButton as SharedHighlightedButton } from './NoteForm/NoteForm.styles';
import SuccessToast from './SuccessToast'; // Import centralized SuccessToast component
import { UUID_REGEX_GLOBAL } from './TiptapNoteReferenceMark'; // Import UUID regex
import { invalidateNoteCache } from './TiptapNoteReferenceCard'; // Import cache invalidation

// --- Helper Function (Consider moving to a utils file) ---
const copyTextWithFallback = (text) => {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  let success = false;
  try {
    success = document.execCommand('copy');
  } catch (err) {
    console.error('Fallback clipboard copy failed:', err);
  }
  document.body.removeChild(textArea);
  return success;
};
// --- End Helper Function ---


// --- Styled Components ---
const TitleActionsContainer = styled.div`
  display: flex;
  align-items: center;
  z-index: 10;
  flex-shrink: 0;
  flex-direction: row-reverse; /* Reverse the order */
  gap: 2px;

  & > button, & > div { /* Target buttons and the dropdown wrapper div */
    margin-right: 2px;
    margin-left: 2px;
  }

  @media (max-width: 768px) {
    & > button, & > div {
      margin-right: 1px;
      margin-left: 1px;
    }
  }
`;

// Keyframe animations for mobile dropdown
const slideDown = keyframes`
  from {
    opacity: 0;
    transform: translateY(-30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const slideUp = keyframes`
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-30px);
  }
`;

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const fadeOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

// Star button entrance animation
const starPop = keyframes`
  0% {
    transform: scale(0) rotate(-180deg);
    opacity: 0;
  }
  50% {
    transform: scale(1.3) rotate(10deg);
    opacity: 1;
  }
  70% {
    transform: scale(0.9) rotate(-5deg);
  }
  85% {
    transform: scale(1.1) rotate(2deg);
  }
  100% {
    transform: scale(1) rotate(0deg);
    opacity: 1;
  }
`;

const AnimatedStarButton = styled(SharedHighlightedButton)`
  ${props => props.$shouldAnimate && css`
    animation: ${starPop} 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
  `}
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
    pointer-events: auto;
    animation: ${props => props.$isClosing ? fadeOut : fadeIn} 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }
`;

const MoreDropdown = styled.div`
  position: absolute;
  top: 40px; /* Position below the button */
  right: 0;
  background-color: var(--dropdown-bg-color, var(--note-bg-color));
  border-radius: 6px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  z-index: 1999;
  min-width: max-content;
  overflow: hidden;
  padding-top: 6px;
  padding-bottom: 6px;

  @media (max-width: 768px) {
      position: fixed; /* Override default */
      left: 12px;
      right: 12px;
      width: auto;
      min-width: unset;
      bottom: auto;
      top: 60px;
      border-radius: 12px;
      border: none;
      box-sizing: border-box;
      box-shadow: 0 -2px 60px var(--shadow-color);
      background-color: var(--dropdown-bg-color-glassy);
      padding-top: 8px;
      padding-bottom: 8px;
      padding-right: 0px;
      padding-left: 0px;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px); /* Safari support */
      animation: ${props => props.$isClosing ? slideUp : slideDown} 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }
`;

const DropdownItem = styled.button`
  width: 100%;
  padding: 12px 12px;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  font-size: 14px;
  color: var(--text-color);
  font-variant-numeric: lining-nums !important;
  font-feature-settings: 'liga' off, 'kern' on, 'calt' off !important;
  text-transform: none !important;

  @media (max-width: 768px) {
    font-size: 16px;
    padding: 16px 12px;
    padding-left: 20px;
  }

  &:hover {
    background-color: ${props => props.theme === 'dark'
      ? 'rgba(255, 255, 255, 0.1)'
      : 'rgba(0, 0, 0, 0.05)'};
  }

  & > svg {
    margin-right: 14px;

    @media (max-width: 768px) {
        margin-right: 20px;
        width: 24px;
        height: 24px;
      }  }
`;
// --- End Styled Components ---

const NoteTitleActions = ({
  note,
  currentContent,
  isMobile,
  titleFocused,
  view,
  isPinned,
  isDarkTheme,
  contentInputRef,
  handlePinToggle,
  onClose,
  onCloseAndExecute,
  handleSearchToggle,
  onOpenHistory,
  color,
  setIsBeingTrashed
}) => {
  const [showMoreDropdown, setShowMoreDropdown] = useState(false);
  const [showCopySuccess, setShowCopySuccess] = useState(false);
  const [showCopyTextSuccess, setShowCopyTextSuccess] = useState(false);
  const [showDeleteToast, setShowDeleteToast] = useState(false);
  const [deleteToastMessage, setDeleteToastMessage] = useState('');
  const [referenceCount, setReferenceCount] = useState(null); // New state for reference count
  const [referencedNotesCount, setReferencedNotesCount] = useState(0); // Count of notes referenced by this note
  const [justStarred, setJustStarred] = useState(false); // Track if note was just starred for animation
  const dropdownRef = useRef(null); // Use useRef
  const moreButtonRef = useRef(null); // The "More options" trigger, for positioning the desktop menu
  const desktopMenuRef = useRef(null); // The portaled desktop menu, for outside-click detection
  const [desktopMenuCoords, setDesktopMenuCoords] = useState({ top: 0, right: 0 });
  const location = useLocation(); // Use useLocation hook
  const navigate = useNavigate(); // Use useNavigate hook
  
  // Closing animation state
  const [isDropdownClosing, setIsDropdownClosing] = useState(false);
  const [shouldRenderDropdown, setShouldRenderDropdown] = useState(false);

  // Handle open/close state transitions for animation
  React.useEffect(() => {
    if (showMoreDropdown) {
      setShouldRenderDropdown(true);
      setIsDropdownClosing(false);
    } else if (shouldRenderDropdown) {
      // Only animate close on mobile - desktop has no animation so close instantly
      const isMobileView = window.innerWidth <= 768;
      if (isMobileView) {
        setIsDropdownClosing(true);
        const timer = setTimeout(() => {
          setShouldRenderDropdown(false);
          setIsDropdownClosing(false);
        }, 300); // Match animation duration
        return () => clearTimeout(timer);
      } else {
        // Desktop: close immediately
        setShouldRenderDropdown(false);
      }
    }
  }, [showMoreDropdown, shouldRenderDropdown]);
      // Get context functions
  const {
    trashNote,
    restoreNote,
    deleteNote,
    archiveNote,
    unarchiveNote,
    searchById,
    getReferenceCount,
    duplicateNote,
  } = useNotes();
  const { isStarred, toggleStar } = useStarredNotes(); // Get starred notes functions    

  // Memoize the starred status
  const isNoteStarred = useMemo(() => note ? isStarred(note.id) : false, [note, isStarred]);
  const isNoteDeleted = useMemo(() => note?.is_deleted === true, [note]);
  const isNoteArchived = useMemo(() => note?.is_archived === true, [note]);

  // Track previous starred state to detect when note becomes starred
  const prevStarredRef = useRef(isNoteStarred);
  
  // Detect when note transitions from unstarred to starred
  useEffect(() => {
    if (isNoteStarred && !prevStarredRef.current) {
      // Note just became starred - trigger animation
      setJustStarred(true);
      const timer = setTimeout(() => setJustStarred(false), 500);
      return () => clearTimeout(timer);
    }
    prevStarredRef.current = isNoteStarred;
  }, [isNoteStarred]);
  
  // Extract UUIDs from note content
  const referencedNoteIds = useMemo(() => {
    // Use currentContent if available, fall back to note.content
    const contentToAnalyze = currentContent || note?.content;
    if (!contentToAnalyze) return [];

    console.log('[NoteTitleActions] Extracting referenced notes from content');

    // First try to extract from data-note-uuid attributes in the HTML
    const dataUuidMatches = contentToAnalyze.match(/data-note-uuid="([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/gi);
    if (dataUuidMatches) {
      const uuids = dataUuidMatches.map(match => {
        const uuidMatch = match.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        return uuidMatch ? uuidMatch[0] : null;
      }).filter(Boolean);

      // Remove duplicates and filter out the note's own ID
      const uniqueIds = [...new Set(uuids)].filter(id => id !== note.id);
      console.log('[NoteTitleActions] Found referenced notes:', uniqueIds);
      return uniqueIds;
    }

    // Fallback: try to match raw UUIDs in content
    const matches = contentToAnalyze.match(UUID_REGEX_GLOBAL);
    if (!matches) {
      console.log('[NoteTitleActions] No referenced notes found');
      return [];
    }

    // Remove duplicates and filter out the note's own ID
    const uniqueIds = [...new Set(matches)].filter(id => id !== note.id);
    console.log('[NoteTitleActions] Found referenced notes (fallback):', uniqueIds);
    return uniqueIds;
  }, [currentContent, note?.content, note?.id]);
    
  // Load reference count when note changes
  useEffect(() => {
    if (note?.id && getReferenceCount) {
      getReferenceCount(note.id)
        .then(count => setReferenceCount(count))
        .catch(err => {
          console.error('Failed to get reference count:', err);
          setReferenceCount(0);
        });
    } else {
      setReferenceCount(null);
    }
  }, [note?.id, getReferenceCount]);
  
  // Update referenced notes count whenever referencedNoteIds changes
  useEffect(() => {
    setReferencedNotesCount(referencedNoteIds.length);
    console.log('[NoteTitleActions] referencedNotesCount updated to:', referencedNoteIds.length);
  }, [referencedNoteIds]);
    
                            
                                
  // Anchor the portaled desktop menu to the trigger button. The menu is
  // portaled to document.body (so the note form's overflow:hidden can't clip
  // it), so it needs fixed coords measured from the button's viewport rect.
  useEffect(() => {
    if (!showMoreDropdown || isMobile) return;
    const measure = () => {
      const rect = moreButtonRef.current?.getBoundingClientRect();
      if (rect) {
        setDesktopMenuCoords({
          top: rect.bottom + 4,
          right: window.innerWidth - rect.right,
        });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [showMoreDropdown, isMobile]);

  // Close dropdown if clicked outside
  useEffect(() => {
      const handleClickOutside = (event) => {
          // The desktop menu is portaled outside dropdownRef, so check it too.
          if (desktopMenuRef.current && desktopMenuRef.current.contains(event.target)) {
              return;
          }
          if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
              const moreButton = event.target.closest('button[title="More options"]');
              if (!moreButton) { // Only close if click is not on the More button itself
                  setShowMoreDropdown(false);
              }
          }
      };
      if (showMoreDropdown) {
          document.addEventListener('mousedown', handleClickOutside);
      } else {
          document.removeEventListener('mousedown', handleClickOutside);
      }
      return () => {
          document.removeEventListener('mousedown', handleClickOutside);
      };
  }, [showMoreDropdown]);

  const handleCopyReference = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!note?.id) return;

    let textToCopy = note.id;
    if (contentInputRef?.current) {
      const scrollTop = Math.round(contentInputRef.current.scrollTop);
      if (scrollTop > 0) {
        textToCopy = `${note.id}`;
      }
    }
    console.log("Copying reference:", textToCopy);    const performCopy = (text) => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(() => {
            setShowMoreDropdown(false);
            setShowCopySuccess(true);
          })
          .catch(err => {
            console.error('Failed to copy with Clipboard API:', err);
            if (copyTextWithFallback(text)) {
              setShowMoreDropdown(false);
              setShowCopySuccess(true);
            } else {
              console.error('All clipboard methods failed');
              alert('Could not copy reference to clipboard.');
            }
          });
      } else {
        if (copyTextWithFallback(text)) {
          setShowMoreDropdown(false);
          setShowCopySuccess(true);
        } else {
          console.error('All clipboard methods failed');
          alert('Could not copy reference to clipboard.');
        }
      }
    };

    performCopy(textToCopy);

  }, [note, contentInputRef]);

  const handleCopyNoteText = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Use currentContent if available, fall back to note.content
    const contentToCopy = currentContent || note?.content;
    if (!contentToCopy) return;

    // Create a temporary element to parse HTML and extract formatted text
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = contentToCopy;

    // Process the HTML to preserve formatting
    // Replace <br> tags with newlines
    tempDiv.querySelectorAll('br').forEach(br => {
      br.replaceWith('\n');
    });

    // Add newlines after block elements
    tempDiv.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6').forEach(block => {
      block.append('\n');
    });

    // Handle list items with bullet points or numbers
    tempDiv.querySelectorAll('ul > li').forEach(li => {
      li.prepend('• ');
      li.append('\n');
    });
    tempDiv.querySelectorAll('ol > li').forEach((li, index) => {
      li.prepend(`${index + 1}. `);
      li.append('\n');
    });

    // Handle blockquotes
    tempDiv.querySelectorAll('blockquote').forEach(bq => {
      const lines = bq.textContent.split('\n');
      bq.textContent = lines.map(line => `> ${line}`).join('\n');
      bq.append('\n');
    });

    // Handle code blocks
    tempDiv.querySelectorAll('pre').forEach(pre => {
      pre.prepend('\n');
      pre.append('\n');
    });

    // Get the text content
    let textContent = tempDiv.textContent || tempDiv.innerText || '';
    // Trim whitespace from start and end
    textContent = textContent.trim();

    const performCopy = (text) => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(() => {
            setShowMoreDropdown(false);
            setShowCopyTextSuccess(true);
          })
          .catch(err => {
            console.error('Failed to copy with Clipboard API:', err);
            if (copyTextWithFallback(text)) {
              setShowMoreDropdown(false);
              setShowCopyTextSuccess(true);
            } else {
              console.error('All clipboard methods failed');
              alert('Could not copy note text to clipboard.');
            }
          });
      } else {
        if (copyTextWithFallback(text)) {
          setShowMoreDropdown(false);
          setShowCopyTextSuccess(true);
        } else {
          console.error('All clipboard methods failed');
          alert('Could not copy note text to clipboard.');
        }
      }
    };

    performCopy(textContent);
  }, [currentContent, note]);

  const handleSeeReferences = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!note?.id) return;
    setShowMoreDropdown(false);
    onCloseAndExecute(() => {
      console.log("Executing searchById after close");
      searchById(note.id);
    });
  }, [note?.id, searchById, onCloseAndExecute]);

  const handleMakeCopy = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!note?.id) return;
    setShowMoreDropdown(false);
    // The "Copy created" toast is fired from NotesContext.duplicateNote, since
    // this component unmounts when onCloseAndExecute closes the form.
    onCloseAndExecute(() => {
      duplicateNote(note.id);
    });
  }, [note?.id, duplicateNote, onCloseAndExecute]);

  // --- Updated handleTrash ---
  const handleTrash = useCallback((e) => {
      e.preventDefault();
      if (!note?.id) return;

      // 1. Set the flag to prevent saving during trash operation
      if (setIsBeingTrashed) {
          console.log("Setting isBeingTrashed flag to prevent save race condition");
          setIsBeingTrashed(true);
      }

      // 2. Unstar the note if it is starred
      if (isNoteStarred) {
          console.log("Unstarring note before trashing:", note.id);
          toggleStar(note.id);
      }

      // 3. Preserve search query and navigate
      const currentParams = new URLSearchParams(location.search);
      currentParams.delete('note');
      currentParams.delete('scroll');
      const newSearch = currentParams.toString();
      const newPath = `${location.pathname}${newSearch ? `?${newSearch}` : ''}`;
      navigate(newPath, { replace: true });

      // 4. Use onCloseAndExecute like archive does
      onCloseAndExecute(() => {
          console.log("Executing trashNote after form close");
          trashNote(note.id);
      });
  }, [note?.id, trashNote, onCloseAndExecute, navigate, location.pathname, location.search, isNoteStarred, toggleStar, setIsBeingTrashed]); // Changed onClose to onCloseAndExecute

   const handleRestore = useCallback((e) => {
      e.preventDefault();
      if (!note?.id) return;
      const currentParams = new URLSearchParams(location.search);
      currentParams.delete('note');
      currentParams.delete('scroll');
      const newSearch = currentParams.toString();
      const newPath = `${location.pathname}${newSearch ? `?${newSearch}` : ''}`;
      navigate(newPath, { replace: true });
      onCloseAndExecute(() => {
          console.log("Executing restoreNote after form close");
          restoreNote(note.id);
      });
  }, [note?.id, restoreNote, onCloseAndExecute, navigate, location.pathname, location.search]); // Added location.search

  // --- Updated handleDeletePermanently ---
  const handleDeletePermanently = useCallback((e) => {
      e.preventDefault();
      if (!note?.id) return;

      if (confirm('Delete this note permanently? This action cannot be undone.')) { // Added warning
          // 1. Unstar the note if it is starred
          if (isNoteStarred) {
              console.log("Unstarring note before permanent delete:", note.id);
              toggleStar(note.id);
          }

          // 2. Preserve search query and navigate
          const currentParams = new URLSearchParams(location.search);
          currentParams.delete('note');
          currentParams.delete('scroll');
          const newSearch = currentParams.toString();
          const newPath = `${location.pathname}${newSearch ? `?${newSearch}` : ''}`;
          navigate(newPath, { replace: true });

          // 3. Initiate the deleteNote action
          console.log("Executing deleteNote action");
          deleteNote(note.id);

          // 4. Close the form UI optimistically
          console.log("Executing onClose after deleteNote");
          onClose();
      }
  }, [note?.id, deleteNote, onClose, navigate, location.pathname, location.search, isNoteStarred, toggleStar]); // Added isNoteStarred, toggleStar, location.search

  const handleArchive = useCallback((e) => {
      e.preventDefault();
      if (!note?.id) return;
      const currentParams = new URLSearchParams(location.search);
      currentParams.delete('note');
      currentParams.delete('scroll');
      const newSearch = currentParams.toString();
      const newPath = `${location.pathname}${newSearch ? `?${newSearch}` : ''}`;
      navigate(newPath, { replace: true });
      onCloseAndExecute(() => {
          console.log("Executing archiveNote after form close");
          archiveNote(note.id);
      });
  }, [note?.id, archiveNote, onCloseAndExecute, navigate, location.pathname, location.search]); // Added location.search

   const handleUnarchive = useCallback((e) => {
      e.preventDefault();
      if (!note?.id) return;
      const currentParams = new URLSearchParams(location.search);
      currentParams.delete('note');
      currentParams.delete('scroll');
      const newSearch = currentParams.toString();
      const newPath = `${location.pathname}${newSearch ? `?${newSearch}` : ''}`;
      navigate(newPath, { replace: true });
      onCloseAndExecute(() => {
          console.log("Executing unarchiveNote after form close");
          unarchiveNote(note.id);
      });
  }, [note?.id, unarchiveNote, onCloseAndExecute, navigate, location.pathname, location.search]); // Added location.search


  const handleDeleteReferencedNotes = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!note?.id || referencedNoteIds.length === 0) return;
    
    setShowMoreDropdown(false);
    console.log(`[NoteTitleActions] Moving ${referencedNoteIds.length} referenced notes to trash:`, referencedNoteIds);
    
    // Move all referenced notes to trash
    let successCount = 0;
    let failCount = 0;
    
    for (const noteId of referencedNoteIds) {
      try {
        await trashNote(noteId); // Move to trash instead of permanent delete
        invalidateNoteCache(noteId); // Invalidate cache to refresh preview cards
        successCount++;
      } catch (error) {
        console.error(`[NoteTitleActions] Failed to trash note ${noteId}:`, error);
        failCount++;
      }
    }
    
    // Show summary toast
    const notesWord = successCount === 1 ? 'note' : 'notes';
    if (failCount === 0) {
      setDeleteToastMessage(`Moved ${successCount} ${notesWord} to trash`);
    } else {
      setDeleteToastMessage(`Moved ${successCount} ${notesWord} to trash. Failed: ${failCount}`);
    }
    setShowDeleteToast(true);
  }, [note?.id, referencedNoteIds, trashNote]);

  const handleToggleStar = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!note?.id) return;
    toggleStar(note.id);
  }, [note?.id, toggleStar]);

  // If there's no note object, don't render anything
  if (!note) {
    return null;
  }
  return (
    <>
      {createPortal(
        <>
          <SuccessToast
            message="Note reference copied to clipboard"
            isVisible={showCopySuccess}
            onHide={() => setShowCopySuccess(false)}
          />
          <SuccessToast
            message="Note text copied to clipboard"
            isVisible={showCopyTextSuccess}
            onHide={() => setShowCopyTextSuccess(false)}
          />
          <SuccessToast
            message={deleteToastMessage}
            isVisible={showDeleteToast}
            onHide={() => setShowDeleteToast(false)}
          />
        </>,
        document.body
      )}
      <TitleActionsContainer $color={color}>
        {/* Pin button */}
        {!isNoteDeleted && !isNoteArchived && (
          <ActionButton
            type="button"
            title={isPinned ? "Unpin" : "Pin"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handlePinToggle(note.id);
            }}
            theme={isDarkTheme ? 'dark' : 'light'}
          >
            <Icon
              name={isPinned ? "pinned" : "pin"}
              size={20}
              className={`pin-icon-${note.id}`}
              data-pinned={isPinned}
            />
          </ActionButton>
        )}

        {/* Star button */}
        {isNoteStarred && ( // Don't show star in trash view
          <AnimatedStarButton
              type="button"
                title={isNoteStarred ? "Unstar note" : "Star note"}
                onClick={handleToggleStar}
                theme={isDarkTheme ? 'dark' : 'light'}
                $shouldAnimate={justStarred}
            >
              <SharedCircleIconWrapper>
                <Icon name={isNoteStarred ? "star" : "star-outline" } size={20} color={color && color !== 'default'? `var(--note-color-${color})` : 'var(--note-bg-color)'} />
              </SharedCircleIconWrapper>
            </AnimatedStarButton>
        )}


        {/* More options button with dropdown */}
        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <ActionButton
            ref={moreButtonRef}
            type="button"
            title="More options"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Measure before opening so the portaled desktop menu paints in
              // the right place (no top-right flash on first frame).
              if (!showMoreDropdown && !isMobile) {
                const rect = moreButtonRef.current?.getBoundingClientRect();
                if (rect) {
                  setDesktopMenuCoords({
                    top: rect.bottom + 4,
                    right: window.innerWidth - rect.right,
                  });
                }
              }
              setShowMoreDropdown(prev => !prev); // Toggle previous state
            }}
            theme={isDarkTheme ? 'dark' : 'light'}
          >
            <Icon name="more" size={20} />
          </ActionButton>
          {/* Desktop dropdown - portaled to body so the note form's
              overflow:hidden can't clip it on short notes */}
          {shouldRenderDropdown && !isMobile && createPortal(
              <MoreDropdown
                ref={desktopMenuRef}
                $isClosing={isDropdownClosing}
                data-more-options-dropdown="menu"
                style={{ position: 'fixed', top: desktopMenuCoords.top, right: desktopMenuCoords.right }}
              >
                <DropdownItem
                  type="button"
                  theme={isDarkTheme ? 'dark' : 'light'}
                  onClick={handleCopyNoteText}
                >
                  <Icon name="copy" size={18} />
                  Copy note text
                </DropdownItem>
                <DropdownItem
                  type="button"
                  theme={isDarkTheme ? 'dark' : 'light'}
                  onClick={handleCopyReference}
                >
                  <Icon name="share" size={18} />
                  Get note Rerefence
                </DropdownItem>
                <DropdownItem
                  type="button"
                  theme={isDarkTheme ? 'dark' : 'light'}
                  onClick={handleSeeReferences}
                >
                  <Icon name="search" size={18} />
                  See references{referenceCount !== null && referenceCount > 0 ? ` (${referenceCount})` : ''}
                </DropdownItem>
                <DropdownItem
                  type="button"
                  theme={isDarkTheme ? 'dark' : 'light'}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenHistory();
                    setShowMoreDropdown(false);
                  }}
                >
                  <Icon name="history" size={18} />
                  Version History
                </DropdownItem>

                {!isNoteDeleted && (<DropdownItem
                  type="button"
                  theme={isDarkTheme ? 'dark' : 'light'}
                  onClick={handleMakeCopy}
                >
                  <Icon name="copy" size={18} />
                  Make a copy
                </DropdownItem>)}

                {/* {referencedNotesCount > 0 && (
                  <DropdownItem
                    type="button"
                    theme={isDarkTheme ? 'dark' : 'light'}
                    onClick={handleDeleteReferencedNotes}
                    style={{ color: 'var(--error-color, #d93025)' }}
                  >
                    <Icon name="trash" size={18} />
                    Trash referenced notes
                  </DropdownItem>
                )} */}

                 {!isNoteArchived && !isNoteDeleted && !isMobile && (<DropdownItem
                  type="button"
                  theme={isDarkTheme ? 'dark' : 'light'}
                  onClick={handleArchive}
                >
                  <Icon name="archive" size={18} />
                  Archive
                </DropdownItem>)}

                {!isMobile && !isNoteDeleted && (<DropdownItem
                  type="button"
                  theme={isDarkTheme ? 'dark' : 'light'}
                  onClick={handleTrash}
                >
                  <Icon name="trash" size={18} />
                  Move to Trash
                </DropdownItem>)}
              </MoreDropdown>,
              document.body
          )}
        </div>

        {/* Mobile dropdown - rendered via portal to document.body */}
        {shouldRenderDropdown && isMobile && createPortal(
          <>
            <DropdownOverlay 
              $isVisible={showMoreDropdown}
              $isClosing={isDropdownClosing}
              data-more-options-dropdown="overlay"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowMoreDropdown(false);
              }}
            />
            <MoreDropdown 
              $isClosing={isDropdownClosing}
              data-more-options-dropdown="menu"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownItem
                type="button"
                theme={isDarkTheme ? 'dark' : 'light'}
                onClick={handleCopyNoteText}
              >
                <Icon name="copy" size={18} />
                Copy note text
              </DropdownItem>
              <DropdownItem
                type="button"
                theme={isDarkTheme ? 'dark' : 'light'}
                onClick={handleCopyReference}
              >
                <Icon name="share" size={18} />
                Get note Reference
              </DropdownItem>
              <DropdownItem
                type="button"
                theme={isDarkTheme ? 'dark' : 'light'}
                onClick={handleSeeReferences}
              >
                <Icon name="search" size={18} />
                See references{referenceCount !== null && referenceCount > 0 ? ` (${referenceCount})` : ''}
              </DropdownItem>
              <DropdownItem
                type="button"
                theme={isDarkTheme ? 'dark' : 'light'}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenHistory();
                  setShowMoreDropdown(false);
                }}
              >
                <Icon name="history" size={18} />
                Version History
              </DropdownItem>

              {!isNoteDeleted && (
                <DropdownItem
                  type="button"
                  theme={isDarkTheme ? 'dark' : 'light'}
                  onClick={handleMakeCopy}
                >
                  <Icon name="copy" size={18} />
                  Make a copy
                </DropdownItem>
              )}

              {/* {referencedNotesCount > 0 && (
                <DropdownItem
                  type="button"
                  theme={isDarkTheme ? 'dark' : 'light'}
                  onClick={handleDeleteReferencedNotes}
                  style={{ color: 'var(--error-color, #d93025)' }}
                >
                  <Icon name="trash" size={18} />
                  Trash referenced notes
                </DropdownItem>
              )} */}
                    
              {!isNoteArchived && !isNoteDeleted && (
                  <DropdownItem
                    type="button"
                    title="Archive"
                    onClick={handleArchive}
                    theme={isDarkTheme ? 'dark' : 'light'}
                  >
                    <Icon name="archive" size={20} />
                    Archive
                  </DropdownItem>
              )}            
              {/* Conditional Trash/Delete in Dropdown for Mobile */}
              {!isNoteDeleted && (
                  <DropdownItem
                    type="button"
                    theme={isDarkTheme ? 'dark' : 'light'}
                    onClick={handleTrash} // Use the updated handleTrash
                  >
                    <Icon name="trash" size={18} />
                    Move to Trash
                  </DropdownItem>
              )}
              {isNoteDeleted && (
                <>
                  <DropdownItem
                    type="button"
                    theme={isDarkTheme ? 'dark' : 'light'}
                    onClick={handleRestore}
                  >
                    <Icon name="restore" size={18} />
                    Restore Note
                  </DropdownItem>
                  <DropdownItem
                    type="button"
                    theme={isDarkTheme ? 'dark' : 'light'}
                    onClick={handleDeletePermanently}
                  >
                    <Icon name="deleteForever" size={18} />
                    Delete Permanently
                  </DropdownItem>
                </>
              )}
            </MoreDropdown>
          </>,
          document.body
        )}

        {/* Desktop Trash button */}
        {/* {!isMobile && !isNoteDeleted && (
          <ActionButton
            type="button"
            title="Move to trash"
            onClick={handleTrash} // Use the updated handleTrash
            theme={isDarkTheme ? 'dark' : 'light'}
          >
            <Icon name="trash" size={20} />
          </ActionButton>
        )} */}

        {/* Desktop Restore button */}
        {!isMobile && isNoteDeleted && (
          <ActionButton
            type="button"
            title="Restore note"
            onClick={handleRestore}
            theme={isDarkTheme ? 'dark' : 'light'}
          >
            <Icon name="restore" size={20} />
          </ActionButton>
        )}

        {/* Desktop Delete permanently button */}
        {!isMobile && isNoteDeleted && (
          <ActionButton
            type="button"
            title="Delete permanently"
            onClick={handleDeletePermanently} // Use the updated handleDeletePermanently
            theme={isDarkTheme ? 'dark' : 'light'}
          >
            <Icon name="deleteForever" size={20} />
          </ActionButton>
        )}

        {/* Archive/Unarchive buttons */}
        {/* {!isNoteArchived && !isNoteDeleted && !isMobile && (
          <ActionButton
            type="button"
            title="Archive"
            onClick={handleArchive}
            theme={isDarkTheme ? 'dark' : 'light'}
          >
            <Icon name="archive" size={20} />
          </ActionButton>
        )} */}
        {isNoteArchived && (
          <ActionButton
            type="button"
            title="Unarchive"
            onClick={handleUnarchive}
            theme={isDarkTheme ? 'dark' : 'light'}
          >
            <Icon name="unarchive" size={20} />
          </ActionButton>
        )}

        {/* Mobile search button */}
        {isMobile && (
          <ActionButton
            type="button"
            title="Search in note"
            onClick={(e) => {
                e.preventDefault();
                handleSearchToggle();
            }}
            theme={isDarkTheme ? 'dark' : 'light'}
          >
            <Icon name="search" size={20} />
          </ActionButton>
        )}
      </TitleActionsContainer>
    </>
  );
};

export default memo(NoteTitleActions);