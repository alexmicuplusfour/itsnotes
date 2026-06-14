import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react"; // Keep useRef
import { useNavigate, useLocation } from "react-router-dom"; // Import useLocation
import { useNotes } from "../contexts/NotesContext";
import { useTags } from "../contexts/TagsContext";
import { useStarredNotes } from "../contexts/StarredNotesContext"; // Import StarredNotesContext
import { useTyping } from "../contexts/TypingContext"; // Import useTyping
import { useUIPreferences } from "../contexts/UIPreferencesContext"; // Import UIPreferences for fullscreen setting
import { useAutoTagging, AUTO_TAG_FEATURES } from "../contexts/AutoTaggingContext"; // Import AutoTagging context
import { NoteFormProvider } from "../contexts/NoteFormContext"; // Import NoteFormContext for ObjectCard
import { useToast } from "../contexts/ToastContext"; // Import useToast for toast notifications
import { useNavigation } from '../navigation'; // NEW: Use centralized navigation
import noteFormSaveRegistry from '../services/noteFormSaveRegistry'; // Global save registry
import api, { tagsApi, notesApi } from "../services/api"; // Ensure notesApi is imported
import Icon from "./Icons";
import { setOpenNoteHandler } from './TiptapNoteReferenceMark'; // Import the handler setter
import { setObjectMentionClickHandler } from './TiptapObjectMentionExtension'; // Import object mention handler setter
import { setTagMentionClickHandler } from './TiptapTagMentionExtension'; // Import tag mention handler setter
import TiptapNoteContent from "./TiptapNoteContent"; // Import Tiptap component
import env from "../../env.js";
import { extractUrls, extractBookReferences, extractNoteReferences, getCleanContent } from "../utils/noteUtils";
import DynamicActionBarsWrapper from './DynamicActionBarsWrapper'; // Import the new wrapper
import NoteTitleActions from "./NoteTitleActions"; // Add this import
import { useImageManager } from "../hooks/useImageManager"; // Import the image hook
import { useNoteSaver } from "../hooks/useNoteSaver"; // Import the note saver hook
import { useUrlExtraction } from "../hooks/useUrlExtraction"; // Import the URL extraction hook
//import { useTextareaHeight } from '../hooks/useTextareaHeight'; // Import the new height hook
import { TagPicker } from "./NoteTagPicker"; // Import TagPicker here
import { useNoteTagsModal } from "../hooks/useNoteTagsModal"; // Import the tags modal hook
import NoteHistoryModal from "./NoteHistoryModal"; // Import the new history modal
import { formatDistanceToNow } from "date-fns"; // Import date-fns for the modal
import { ColorPicker as SharedColorPicker } from "./ColorPicker";
import { formatPlainTextPasteToHtml } from '../utils/textToHtml.js';
import { useInNoteSearch } from '../hooks/useInNoteSearch'; // Import the search hook
import { useNoteFormInteractions } from '../hooks/useNoteFormInteractions'; // Import the UI interactions hook
import { useKeyboardShortcut } from '../utils/keyboardShortcuts'; // Import the keyboard shortcuts hook
import { useClipboardHistory } from '../hooks/useClipboardHistory'; // Import clipboard history hook
import { useNoteSummarizer } from '../hooks/useNoteSummarizer'; // Import the summarizer hook
import { useNoteOCR } from '../hooks/useNoteOCR'; // Import the OCR hook
import { useAttachmentManager } from '../hooks/useAttachmentManager'; // Import attachment manager hook
import { useNoteContentActions } from '../hooks/useNoteContentActions'; // Import the new content actions hook
import { useScrollRestoration } from '../hooks/useScrollRestoration'; // Import the scroll restoration hook
import ThemeManager from '../utils/ThemeManager'; // Import ThemeManager for theme toggle
import SearchBar from "./NoteForm/SearchBar";
import ExtractionPrompt from "./NoteForm/ExtractionPrompt";
import {
  FormOverlay,
  FormWrapper,
  FormContainer,
  Form,
  ScrollableContent,
  ContentWrapper,
  TitleInput,
  TextareaWrapper,
  TitleRow,
  TitleInputWrapper,
  ReminderStatusText,
  HighlightContainer,
  FloatingActionsPill,
  ExternalActionsPill,
  ActionButton,
  SaveIndicator
} from "./NoteForm/NoteForm.styles";

// Helper functions moved to utils/noteUtils.js
// Styled components moved to NoteForm/NoteForm.styles.js

// Wrap component with forwardRef to accept the ref from App.jsx
// Remove handleImageUpload from props
const NoteForm = forwardRef(({ note, onClose: _onClose, isListView = false, onPrevNote, onNextNote, hasPrevNote = false, hasNextNote = false, 'data-source': dataSource = 'unknown' }, ref) => {
  // Only log first render for each noteId to reduce console noise
  const renderedRef = useRef(false);
  if (!renderedRef.current || renderedRef.current !== note?.id) {
    const now = new Date();
    renderedRef.current = note?.id;
  }
  const navigate = useNavigate();
  const location = useLocation(); // Get location object
  const [title, setTitle] = useState(note?.title || "");
  const [content, setContent] = useState(note?.content || "");
  const [color, setColor] = useState(note?.color || "default");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const [isPinned, setIsPinned] = useState(note?.is_pinned || false);
  const [internalNoteId, setInternalNoteId] = useState(note?.id); // Track the ID the form is currently displaying
  const [isBeingTrashed, setIsBeingTrashed] = useState(false); // Track if note is being trashed
  const [isCreatingReminder, setIsCreatingReminder] = useState(false); // Track reminder creation status
  const [suggestedTags, setSuggestedTags] = useState([]); // Track suggested tags for auto-tagging

  // Custom setter that updates both state and ref for immediate access
  const setIsBeingTrashedWithRef = useCallback((value) => {
    isBeingTrashedRef.current = value;
    setIsBeingTrashed(value);
  }, []);
  const [editorInstance, setEditorInstance] = useState(null); // Track editor instance
  /* Removed showAddContentDropdown, clipboardUrl, isGoodreadsExtracting (moved to useNoteContentActions) */
  const [showClipboardDropdown, setShowClipboardDropdown] = useState(false); // Track clipboard dropdown

  // Initialize clipboard history hook
  const {
    history: clipboardHistory,
    addSnippet: addClipboardSnippet,
    removeSnippet: removeClipboardSnippet,
    toggleSticky,
    hasHistory: hasClipboardHistory
  } = useClipboardHistory();

  // Get context functions first (before other hooks that depend on them)
  const {
    createNote,
    updateNote,
    togglePin,
    archiveNote,
    unarchiveNote,
    trashNote,
    restoreNote,
    deleteNote,
    changeNoteColor,
    view,
    searchByTag,
    searchByColor,
    searchByBook,
    searchById,
    handleSearch, // For object mention click search
    openNoteById, // Ensure openNoteById is destructured
    setNotes,
    notes, // Get notes array to check current state
    searchMode, // Get searchMode state
    searchQuery, // Get searchQuery state
  } = useNotes();

  // NEW: Use centralized navigation system
  const { closeNote, openReferencedNote, navigateToSearch: navigateToSearchFromContext } = useNavigation();

  // StarredNotes context for scroll position management
  const { resetNoteScrollPosition, isStarred } = useStarredNotes();

  // UI Preferences for fullscreen mode
  const { fullscreenNoteForm, toggleFullscreenNoteForm } = useUIPreferences();

  // Auto-tagging settings
  const { shouldAutoApply, shouldSuggestTag, getFeatureTags } = useAutoTagging();

  // Toast notifications
  const { showToast } = useToast();

  // Get tags list for looking up actual tag names
  const { tags } = useTags();

  // Create refs for elements (needed before useNoteFormInteractions)
  const formRef = useRef();
  const scrollableFormRef = useRef(null); // Ref for the scrollable Form element
  const contentInputRef = useRef(null);
  const colorButtonRef = useRef(null);
  const historyModalRef = useRef(null); // For the history modal
  const prevNoteRef = useRef(null); // For tracking changes in note loading state
  const handleClickOutsideRef = useRef(null); // For the click-outside handler function
  const isBeingTrashedRef = useRef(false); // Ref to track trash state for immediate access

  // Stable function to get the current editor - always fresh from the ref
  const getEditor = useCallback(() => {
    const editor = contentInputRef.current?.getEditor?.();
    return (editor && !editor.isDestroyed) ? editor : null;
  }, []);

  // Stable editor instance management - single polling mechanism
  useEffect(() => {
    let timeoutId;
    let isActive = true;

    const updateEditorInstance = () => {
      if (!isActive) return false;

      if (contentInputRef.current) {
        const editor = contentInputRef.current.getEditor?.();
        if (editor && !editor.isDestroyed) {
          console.log('[NoteForm] Editor instance found and active');
          setEditorInstance(editor); // Store the actual editor, not the ref
          return true;
        }
      }

      // Schedule next check with exponential backoff (max 200ms)
      const delay = Math.min(50 * Math.pow(1.5, Math.floor(Date.now() / 1000) % 4), 200);
      timeoutId = setTimeout(() => {
        if (isActive) updateEditorInstance();
      }, delay);

      return false;
    };

    // Start checking
    updateEditorInstance();

    return () => {
      isActive = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [note?.id]);

  // Clipboard tracking - listen for copy events within the form
  useEffect(() => {
    // Listen on document level to catch copy events from Tiptap editor
    const handleCopy = (e) => {
      console.log('[NoteForm] Copy event fired on document');

      // Check if the copy happened within our form
      const formElement = formRef.current;
      if (!formElement) {
        console.log('[NoteForm] formRef.current is null');
        return;
      }

      // Check if the event target is within our form
      if (!formElement.contains(e.target)) {
        console.log('[NoteForm] Copy event outside our form, ignoring');
        return;
      }

      // Get the selected text
      const selection = window.getSelection();
      const selectedText = selection?.toString();

      console.log('[NoteForm] Selected text within form:', selectedText?.length, 'chars');

      if (selectedText && selectedText.trim()) {
        console.log('[NoteForm] Copy event detected, adding to clipboard history:', selectedText.substring(0, 50));
        // Add to clipboard history after a small delay to ensure clipboard operation completes
        setTimeout(() => {
          addClipboardSnippet(selectedText);
        }, 100);
      } else {
        console.log('[NoteForm] No text selected or text is empty');
      }
    };

    console.log('[NoteForm] Attaching copy event listener to document');
    // Listen for copy events on document (will catch Tiptap editor events)
    document.addEventListener('copy', handleCopy);

    return () => {
      console.log('[NoteForm] Removing copy event listener from document');
      document.removeEventListener('copy', handleCopy);
    };
  }, [addClipboardSnippet]);



  // Tags modal functionality using custom hook (gets refs that we'll pass to interactions hook)
  const {
    showTagsModal,
    setShowTagsModal,
    noteTags,
    setNoteTags,
    tagButtonRef,
    tagPickerRef,
    tagPickerOverlayRef,
    handleToggleTagsModal,
    handleTagsClick,
    handleCloseTagsModal,
    handleTagsModalClose,
    refreshTags
  } = useNoteTagsModal({
    note,
    setNotes,
    showColorPicker,
    setShowColorPicker,
    isMobile: window.innerWidth <= 768 // Use window width directly for now
  });

  // handleAddReminder must be defined AFTER useNoteTagsModal since it uses noteTags and refreshTags
  const handleAddReminder = useCallback(async (e) => {
    console.log("[NoteForm] handleAddReminder called");
    if (contentInputRef.current) {
      const editor = contentInputRef.current.getEditor();
      if (!editor) return;

      const content = editor.getText();
      if (!content || !content.trim()) {
        console.log("Note content empty, cannot create reminder");
        // Show toast maybe?
        return;
      }

      // Show saving indicator or loading state?
      // Ideally we start a loading spinner.
      setIsCreatingReminder(true);

      try {
        // Note ID is required. If note is new (temp id), we might need to save it first?
        // Usually notes are saved on debounce. 
        // If the note doesn't exist in DB yet, this will fail.
        // But NoteForm works with existing or temp notes. 
        // The noteSaver usually saves quickly.
        // Let's assume note.id is valid or we use internalNoteId.

        const response = await api.post('/reminders/create', {
          noteId: internalNoteId,
          noteContent: content,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        });

        if (response.data) {
          const { reminder, matched_text, reformatted_content, schedule_summary } = response.data;
          // Call Tiptap method to replace text with new content and reminder
          contentInputRef.current.createReminder({ reminder, matched_text, reformatted_content, schedule_summary });
          console.log("Reminder created and applied to editor with reformatted content");

          // Handle auto-tagging based on settings
          const reminderTagIds = getFeatureTags(AUTO_TAG_FEATURES.REMINDERS);
          if (reminderTagIds.length > 0) {
            if (shouldAutoApply(AUTO_TAG_FEATURES.REMINDERS)) {
              // Auto-apply all configured tags
              const appliedTagNames = [];
              for (const tagId of reminderTagIds) {
                try {
                  await tagsApi.addTagToNote(internalNoteId, tagId);
                  const actualTag = tags.find(t => t.id === tagId);
                  if (actualTag?.name) appliedTagNames.push(actualTag.name);
                } catch (tagError) {
                  console.warn("Failed to auto-assign reminder tag:", tagId, tagError);
                }
              }
              if (appliedTagNames.length > 0) {
                console.log("Auto-assigned reminder tags:", appliedTagNames.join(', '));
                showToast(`Tagged with ${appliedTagNames.join(', ')}`);
                refreshTags();
              }
            } else if (shouldSuggestTag(AUTO_TAG_FEATURES.REMINDERS)) {
              // Add all tags to suggested tags
              setSuggestedTags(prev => {
                const newSuggestions = [...prev];
                for (const tagId of reminderTagIds) {
                  const alreadySuggested = newSuggestions.some(t => t.id === tagId);
                  const alreadyApplied = noteTags.some(t => t.id === tagId);
                  if (!alreadySuggested && !alreadyApplied) {
                    const actualTag = tags.find(t => t.id === tagId);
                    newSuggestions.push({
                      id: tagId,
                      name: actualTag?.name || 'Unknown',
                      featureId: AUTO_TAG_FEATURES.REMINDERS
                    });
                  }
                }
                return newSuggestions;
              });
              console.log("Suggested reminder tags:", reminderTagIds.length, "tags");
            }
          }
        }
      } catch (error) {
        console.error("Failed to create reminder:", error);
        // Show error toast
      } finally {
        setIsCreatingReminder(false);
      }
    }
  }, [internalNoteId, shouldAutoApply, shouldSuggestTag, getFeatureTags, noteTags, refreshTags, tags]);

  // Initialize UI interactions hook with all refs including tag picker refs
  const {
    isMobile,
    isTyping: hookIsTyping,
    isDarkTheme,
    handleTypingDetection,
    contentFocusHandler: hookHandleContentFocus,
    selectionUpdateHandler: hookHandleSelectionUpdate,
    actionBarTouchStartHandler: handleTouchStart,
    actionBarTouchMoveHandler: handleTouchMove,
    actionBarTouchEndHandler: handleTouchEnd,
  } = useNoteFormInteractions({
    formRef,
    contentInputRef,
    onClose: _onClose,
    onClickOutside: (event) => {
      // Call the handleClickOutside function if it exists in the ref
      if (handleClickOutsideRef.current) {
        handleClickOutsideRef.current(event);
      }
    },
    tagPickerRef,
    tagPickerOverlayRef,
    colorButtonRef,
    historyModalRef,
    isListView, // Pass isListView to disable click-outside closing in list view
  });

  // Initialize summarizer hook
  const { handleSummarizeWithAI } = useNoteSummarizer(note, contentInputRef);

  // Initialize OCR hook
  const { handleInsertOCR } = useNoteOCR(contentInputRef);

  // Keyboard shortcuts - Add escape to close functionality (desktop only)
  useKeyboardShortcut(
    'escape',
    useCallback(() => {
      if (showTagsModal) {
        setShowTagsModal(false);
        return;
      }
      if (showColorPicker) {
        setShowColorPicker(false);
        return;
      }
      if (_onClose) {
        _onClose();
      }
    }, [_onClose, showTagsModal, setShowTagsModal, showColorPicker, setShowColorPicker]),
    {
      description: 'Close note form',
      preventDefault: true,
      condition: () => !isMobile // Only enable on desktop
    },
    [_onClose, isMobile, showTagsModal, showColorPicker]
  );

  // URL extraction functionality using custom hook


  const [showHistoryModal, setShowHistoryModal] = useState(false); // State for history modal visibility
  const [noteVersions, setNoteVersions] = useState([]); // State for version history data
  const [versionsLoading, setVersionsLoading] = useState(false); // Loading state for versions
  const isRestoringVersionRef = useRef(false); // Track when we're restoring a version
  // Default to true if no note or it's an empty note (creating a new note)
  // Don't mark as fully loaded initially - wait for the note to finish loading
  // Only mark as loaded if it's a new note (no content) or if isLoading is explicitly false
  const initialContentFullyLoaded = !note || note?.content === '' || (!note?.isLoading && note?.id);
  const renderID = Math.random().toString(36).substr(2, 9);
  console.log(`[NoteForm Init - ${renderID}] SOURCE=${dataSource}, contentFullyLoaded=${initialContentFullyLoaded}, note.id=${note?.id}, isLoading=${note?.isLoading}, hasContent=${!!note?.content}`);
  const [contentFullyLoaded, setContentFullyLoaded] = useState(initialContentFullyLoaded);

  const latestStateRef = useRef({});
  const highlightContainerRef = useRef(null);
  const dynamicActionBarsRef = useRef(null); // Ref for the new wrapper component

  // --- Use the custom hook ---
  const {
    images, // Get the images state from the hook
    unsavedImageIds, // Get the unsaved IDs from the hook
    isLoading: imagesLoading, // Optional: Use loading state for UI feedback
    error: imageError, // Optional: Use error state for UI feedback
    loadImages, // Function to load images
    addImage, // Function to add an image - THIS IS WHAT WE NEED
    removeImage, // Function to remove an image
    uploadTemporaryImages, // Function to upload temps after new note save
    clearUnsavedIds, // Function to clear unsaved IDs after any save
    resetImageState, // Function to reset state
  } = useImageManager();

  // Extract URLs from note content - optimized
  const noteUrls = useMemo(() => {
    // Only extract if content actually exists and has changed
    if (!content || typeof content !== 'string') return [];
    return extractUrls(content);
  }, [content]);

  // Extract book references from note content - optimized with stable reference
  const bookReferences = useMemo(() => {
    // Only extract if content actually exists and has meaningful content
    if (!content || typeof content !== 'string' || content.trim().length === 0) return [];

    // Check if content contains book reference patterns before expensive extraction
    if (!content.includes('{') || !content.includes('}')) return [];

    return extractBookReferences(content);
  }, [content]);

  // Extract note references from note content - optimized
  const noteReferences = useMemo(() => {
    // Only extract if content actually exists and has changed
    if (!content || typeof content !== 'string') return [];
    return extractNoteReferences(content);
  }, [content]);

  // Check if content has reminder intent
  const hasReminderIntent = useMemo(() => {
    if (!content) return false;
    const lowerContent = content.toLowerCase();
    return (
      lowerContent.includes('remind me') ||
      lowerContent.includes('set a reminder') ||
      lowerContent.includes('set reminder')
    );
  }, [content]);

  // Search functionality using custom hook
  const {
    showSearch,
    searchQuery: localSearchQuery,
    matchCount,
    currentMatchIndex: currentMatch,
    searchInputRef,
    toggleSearch: handleSearchToggle,
    updateSearchQuery,
    clearSearch,
    goToPreviousMatch: handlePrevMatch,
    goToNextMatch: handleNextMatch,
    getScrollPosition,
  } = useInNoteSearch(highlightContainerRef, content, {
    debounceDelay: 300,
    highlightClassName: 'highlighted-match',
    currentMatchClassName: 'current-match',
    accuracy: 'partially',
    separateWordSearch: false,
    scrollableRef: scrollableFormRef, // Use the ScrollableContent ref for scroll position
  });

  // --- Use the scroll restoration hook ---
  const { targetScrollPositionOnExit, setTargetScrollPositionOnExit } = useScrollRestoration({
    note,
    contentFullyLoaded,
    editorInstance,
    showSearch
  });

  // Ref to track content for internal logic without triggering re-renders.
  // The keystroke handler writes here synchronously so derived consumers
  // (save logic, latestStateRef) always see the live editor HTML, even
  // between debounced React state updates.
  const contentRef = useRef(content);

  // Debounce timer for committing live editor HTML into the React `content`
  // state. State changes drive expensive things (pill recompute, action-bar
  // re-renders, etc.) that don't need to fire on every keystroke.
  const contentDebounceTimerRef = useRef(null);
  const CONTENT_DEBOUNCE_MS = 200;

  // Commit content immediately to both the ref and React state. Use this
  // for non-keystroke paths (note load, restore version, URL extraction)
  // where downstream consumers should see the value right away.
  const commitContent = useCallback((value) => {
    if (contentDebounceTimerRef.current) {
      clearTimeout(contentDebounceTimerRef.current);
      contentDebounceTimerRef.current = null;
    }
    contentRef.current = value;
    setContent(value);
  }, []);

  // Sync contentRef with content state — backstop in case state changes
  // through a path that didn't update the ref directly.
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // Cleanup the debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (contentDebounceTimerRef.current) {
        clearTimeout(contentDebounceTimerRef.current);
        contentDebounceTimerRef.current = null;
      }
    };
  }, []);

  // Consolidated effect to handle note changes and state resets
  useEffect(() => {
    // Check for immediate empty note state (should load instantly)
    if (note && note.content === '' && !contentFullyLoaded) {
      console.log('[NoteForm] Empty note detected, setting contentFullyLoaded to true immediately.');
      setContentFullyLoaded(true);
      return; // Early return to avoid redundant processing
    }

    // Reset if the note ID actually changes OR if the isLoading state changes
    const noteIdChanged = note?.id !== internalNoteId;
    const loadingStateChanged =
      note &&
      prevNoteRef.current?.id === note.id &&
      prevNoteRef.current?.isLoading !== note.isLoading;

    // Skip note updates if we're currently restoring a version
    if (isRestoringVersionRef.current) {
      console.log('[NoteForm] Skipping note update during version restore');
      prevNoteRef.current = note;
      return;
    }

    if (noteIdChanged || loadingStateChanged) {
      console.log(
        `Note prop changed in NoteForm. Old: ${internalNoteId}, New: ${note?.id}. Resetting state.`,
      );
      console.log(
        `Note loading state: ${note?.isLoading ? "Loading" : "Loaded"}`,
      );

      // Check if this is a shell note (loading placeholder)
      const isShellNote = note?.isLoading === true;

      // Check if this is a new note (empty content or freshly created note)
      const isNewNote = !note?.content ||
        (note?.created_at && new Date(note.created_at) > new Date(Date.now() - 2000));

      // Mark as fully loaded for new notes or notes with empty content
      const shouldBeFullyLoaded = isNewNote || (!isShellNote && !note?.content);
      console.log(`[NoteForm] Setting contentFullyLoaded to ${shouldBeFullyLoaded}. isNewNote: ${isNewNote}, isShellNote: ${isShellNote}, has content: ${Boolean(note?.content)}, created_at: ${note?.created_at}`);
      setContentFullyLoaded(shouldBeFullyLoaded);

      if (isShellNote) {
        console.log("Rendering shell note while waiting for real data");
        // Minimal UI for shell notes - keep everything empty until full data loads
        setTitle(""); // Reset title
        commitContent(""); // Reset content (immediate, bypass debounce)
        setColor("default");
        setIsPinned(false);
        setContentFullyLoaded(false); // Explicitly mark as not loaded
      } else {
        // Normal initialization for real notes
        console.log("Rendering full note data");
        setTitle(note?.title || "");

        // --- START CONVERSION BEFORE RESET ---
        let contentToSet = note?.content || "";
        // Check if the content looks like plain text and needs conversion
        // Updated logic: check for any HTML block-level tags, not just <p>
        const hasHtmlTags = /<(p|ul|ol|h[1-6]|blockquote|pre|div)(\s|>)/i.test(contentToSet);
        if (typeof contentToSet === 'string' && !hasHtmlTags && contentToSet.includes('\n')) {
          console.log("[NoteForm useEffect] Detected plain text in fetched content. Applying formatting using utility function.");

          // *** Use the imported utility function ***
          // Pass the plain text content to the function
          const formattedHtml = formatPlainTextPasteToHtml(contentToSet);

          // *** Assign the formatted HTML result back ***
          contentToSet = formattedHtml;

          console.log("[NoteForm useEffect] Converted content:", contentToSet);
        }

        commitContent(contentToSet);
        setColor(note?.color || "default");
        setIsPinned(note?.is_pinned || false);

        // For new notes, mark as fully loaded immediately
        // For existing notes that just finished loading, mark as fully loaded immediately (no delay)
        // The isLoading flag transition from true->false already provides synchronization
        if (isNewNote) {
          console.log("[NoteForm] New note - marking content as fully loaded");
          setContentFullyLoaded(true);
        } else {
          console.log("[NoteForm] Existing note loaded - marking content as fully loaded");
          setContentFullyLoaded(true);
        }
      }

      // Common resets for both shell and real notes
      if (noteIdChanged) {
        setNoteTags([]); // Clear tags, they will be fetched by the tags useEffect
        resetImageState(); // Clear images, they will be fetched by the images useEffect
        setEditorInstance(null); // Reset editor instance when note changes
        // Note: isModified is now managed internally by useNoteSaver hook

        // Reset scroll progress if note is opened normally (not from tab)
        // Check if this note was opened normally by looking for absence of scroll parameter
        const currentSearchParams = new URLSearchParams(location.search);
        const hasScrollParam = currentSearchParams.has('scroll');

        // Only reset scroll position if NOT restoring from URL scroll param
        // This prevents overwriting scroll restoration when returning from referenced notes
        if (!hasScrollParam && contentInputRef.current) {
          contentInputRef.current.scrollTop = 0;
        }

        if (!hasScrollParam && note?.id) {
          console.log(`[NoteForm] Note ${note.id} opened normally (no scroll param), resetting scroll progress to prevent stale progress`);
          resetNoteScrollPosition(note.id);
        } else if (hasScrollParam) {
          console.log(`[NoteForm] Note ${note.id} opened from tab (has scroll param: ${currentSearchParams.get('scroll')}), preserving scroll progress`);
        } else {
          console.log(`[NoteForm] Note has no ID, skipping scroll reset`);
        }

        // Reset versions and close modal when note changes
        setNoteVersions([]);
        setShowHistoryModal(false);

        // Close in-note search when note changes (exit search mode completely)
        if (showSearch) {
          handleSearchToggle(); // This will properly exit search mode
        }
      }

      // Load images for the note if it has a valid ID (for both note changes and loading state changes)
      if (note?.id && !isShellNote) {
        console.log(`[NoteForm] Loading images for note ${note.id}`);
        loadImages(note.id);
      }

      setInternalNoteId(note?.id); // Update the internal tracker
      // Note: isModified is now managed internally by useNoteSaver hook
      setShowColorPicker(false);
      setShowTagsModal(false);

      // Reset trash flag when note changes
      isBeingTrashedRef.current = false;
      setIsBeingTrashed(false);
    }

    // Store the current note for comparison in the next render
    prevNoteRef.current = note;
  }, [note, internalNoteId, setContent, resetImageState, loadImages, showSearch, handleSearchToggle, location.search, resetNoteScrollPosition]); // Consolidated dependencies

  // Effect to update the ref holding latest state for handleClickOutside's save logic

  // Scroll restoration logic moved to useScrollRestoration hook

  // Check for note ID in sessionStorage when component mounts
  useEffect(() => {
    if (note?.id) {
      // If this is a direct URL access, clear the stored ID since it's now opened
      const storedNoteId = sessionStorage.getItem("openNoteId");
      if (storedNoteId) {
        sessionStorage.removeItem("openNoteId");
      }

      // Sync pin status with note object
      setIsPinned(note.is_pinned);
    }
  }, [note?.id, note?.is_pinned]);

  // Live sync for color changes from external sources (e.g., socket updates from another window)
  // This effect only runs when note.color changes for the SAME note (not when note ID changes)
  const prevColorRef = useRef(note?.color);
  const prevColorNoteIdRef = useRef(note?.id);
  useEffect(() => {
    // Skip if note ID changed - the main sync effect handles that
    if (note?.id !== prevColorNoteIdRef.current) {
      prevColorRef.current = note?.color;
      prevColorNoteIdRef.current = note?.id;
      return;
    }
    
    // Check if the color changed in the note prop (external update)
    if (note?.color !== prevColorRef.current) {
      console.log(`[NoteForm] Live sync: Color changed externally from "${prevColorRef.current}" to "${note?.color}"`);
      // Update local state if it differs from the new note prop value
      if (note?.color !== color) {
        setColor(note?.color || "default");
      }
      prevColorRef.current = note?.color;
    }
  }, [note?.id, note?.color, color]);

  // Live sync for tag changes from external sources (e.g., socket updates from another window)
  // Uses the refreshTags function from useNoteTagsModal to re-fetch tags
  const prevTagsRef = useRef(note?.tags);
  const prevTagsNoteIdRef = useRef(note?.id);
  useEffect(() => {
    // Skip if note ID changed - the main sync effect handles that
    if (note?.id !== prevTagsNoteIdRef.current) {
      prevTagsRef.current = note?.tags;
      prevTagsNoteIdRef.current = note?.id;
      return;
    }
    
    // Only sync if this is the same note and tags array changed externally
    if (note?.tags) {
      const prevTagIds = (prevTagsRef.current || []).map(t => t.id).sort().join(',');
      const newTagIds = (note.tags || []).map(t => t.id).sort().join(',');
      
      if (prevTagIds !== newTagIds) {
        console.log(`[NoteForm] Live sync: Tags changed externally, refreshing tags`);
        // Directly update noteTags state instead of fetching from server
        // since we already have the new tags from the socket event
        setNoteTags(note.tags);
        prevTagsRef.current = note?.tags;
      }
    }
  }, [note?.id, note?.tags, setNoteTags]);

  // Focus on content field when form opens

  /*useEffect(() => {
    // Use a short timeout to ensure the component is fully rendered
    const timer = setTimeout(() => {
      if (contentInputRef.current) {
        contentInputRef.current.focus();
      }
    }, 50);
    
    return () => clearTimeout(timer);
  }, []);*/

  // Focus on content field when form opens ONLY if the text area is empty (which is the case for new notes
  // and also remove the space character from the title, that was causing the placeholder text to disappear.
  useEffect(() => {
    // Only focus if content is empty AND contentFullyLoaded is true AND not a shell note (loading)
    // This prevents focusing on existing notes that are still loading, but allows focusing on new empty notes
    const isShellNote = note?.isLoading === true;
    const shouldFocus = contentFullyLoaded && (!content || content.trim() === "") && !isShellNote;

    // Use a short timeout to ensure the component is fully rendered
    const timer = setTimeout(() => {
      if (shouldFocus && contentInputRef.current && !titleFocused) {
        console.log("[Focus Effect] Focusing content - empty note with fully loaded content");
        contentInputRef.current.focus();

        // If title is just whitespace, trim it
        if (title && title.trim() === "") {
          setTitle("");
        }
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [note?.id, note?.isLoading, contentFullyLoaded, content, title, setTitle, titleFocused]);

  // --- Version History Modal Logic ---
  const fetchNoteVersions = useCallback(async () => {
    const currentNoteId = note?.id;
    if (currentNoteId) {
      setVersionsLoading(true);
      try {
        console.log(`Fetching versions for note: ${currentNoteId}`);
        const response = await notesApi.getNoteVersions(currentNoteId);
        setNoteVersions(response.versions || []);
        console.log(`Fetched ${response.versions?.length || 0} versions.`);
      } catch (error) {
        console.error("Error fetching note versions:", error);
        setNoteVersions([]); // Clear versions on error
      } finally {
        setVersionsLoading(false);
      }
    } else {
      console.log("No valid note ID to fetch versions for.");
      setNoteVersions([]); // Clear versions if no valid note ID
    }
  }, [note?.id]);

  // Handler to open the history modal
  const handleOpenHistoryModal = useCallback(() => {
    console.log("Opening history modal...");
    fetchNoteVersions(); // Fetch versions when opening
    setShowHistoryModal(true);
  }, [fetchNoteVersions]);

  // Handler to close the history modal
  const handleCloseHistoryModal = useCallback(() => {
    console.log("Closing history modal.");
    setShowHistoryModal(false);
  }, []);

  // Handler to restore a version
  const handleRestoreVersion = useCallback(async (versionId) => {
    const currentNoteId = note?.id;
    if (!currentNoteId) {
      console.error("Cannot restore version for a note with no ID");
      return;
    }

    try {
      console.log(`Restoring version ${versionId} for note ${currentNoteId}`);

      // Set flag to prevent note prop updates from overwriting our local changes
      isRestoringVersionRef.current = true;

      const response = await notesApi.restoreNoteVersion(currentNoteId, versionId);

      if (response.note) {
        // Update local state with restored content
        setTitle(response.note.title || '');
        setColor(response.note.color || 'default');
        commitContent(response.note.content || '');

        // Update editor content (notes table stores HTML in 'content' field)
        if (editorInstance && response.note.content) {
          editorInstance.commands.setContent(response.note.content);
        }

        // Refresh version history to show the new version
        fetchNoteVersions();

        // Close the history modal
        setShowHistoryModal(false);

        console.log("Version restored successfully");

        // Show success toast
        showToast("Version restored successfully");

        // Reset the flag after a short delay to allow socket updates to be ignored
        setTimeout(() => {
          isRestoringVersionRef.current = false;
        }, 1000);

        // The parent note will be updated via socket.io 'note_updated' event
      }
    } catch (error) {
      console.error("Error restoring note version:", error);
      showToast("Failed to restore version");
    }
  }, [note?.id, editorInstance, fetchNoteVersions, setTitle, setColor, commitContent, showToast]);
  // --- End Version History Modal Logic ---

  const { isTyping, setIsTyping } = useTyping(); // Use the context hook

  // Sync the hook's isTyping state with the context - optimized
  useEffect(() => {
    // Only update if there's actually a change to prevent unnecessary re-renders
    if (hookIsTyping !== isTyping) {
      setIsTyping(hookIsTyping);
    }
  }, [hookIsTyping]); // Remove setIsTyping and isTyping from dependencies

  // Handle focus on the content input to hide the action bar on mobile
  const handleContentFocus = useCallback(() => {
    // Use the DynamicActionBarsWrapper's content focus handler instead of the hook's
    dynamicActionBarsRef.current?.handleContentFocus?.();
  }, []);

  // Handler to show the footer when the handle is tapped - MOVED to DynamicActionBarsWrapper
  // const handleShowFooter = useCallback(() => { ... });

  // Modified handleSearchChange to use the hook's updateSearchQuery
  const handleSearchChange = useCallback((e) => {
    updateSearchQuery(e.target.value);
  }, [updateSearchQuery]);




  // Track if the note has been modified - now managed by useNoteSaver hook
  // Track last save time - now managed by useNoteSaver hook  
  // Track if currently auto-saving - now managed by useNoteSaver hook

  // Auto-save interval in milliseconds (3 seconds)
  const AUTO_SAVE_INTERVAL = 2000; // Effectively disable autosave (without removing code)
  // Maximum image size in KB - keep this small for API limits
  const MAX_IMAGE_SIZE_KB = 80;

  // Get context functions first (before useNoteSaver hook)
  // useNotes() is already called above - removed duplicate

  // Initialize the note saver hook BEFORE useUrlExtraction
  const {
    saveNote: saveNoteFromHook,
    isSaving,
    isModified: hookIsModified,
    lastSaveTimestamp,
    markAsModified
  } = useNoteSaver(
    note, // initialNote
    title, // currentTitle
    contentRef.current, // currentContent (fallback; getCurrentContent below is preferred)
    color, // currentColor
    images, // currentImages
    unsavedImageIds, // unsavedImageIds from useImageManager
    {
      // Context functions
      createNote,
      updateNote,
      deleteNote,
      // Image manager functions
      uploadTemporaryImages,
      clearUnsavedIds,
      resetImageState,
      // Always read the freshest HTML from the ref at save time. The
      // `content` React state lags behind by up to CONTENT_DEBOUNCE_MS,
      // and useNoteSaver itself stashes the value param only on render.
      getCurrentContent: () => contentRef.current,
      // Callbacks
      onSaveStart: () => console.log('[NoteForm] Save started'),
      onSaveSuccess: (savedNote) => console.log('[NoteForm] Save successful:', savedNote?.id),
      onSaveError: (error) => console.error('[NoteForm] Save error:', error),
      onDeleteSuccess: () => {
        console.log('[NoteForm] Note deleted successfully');
        if (_onClose) _onClose();
      },
      // Auto-save interval
      autoSaveInterval: AUTO_SAVE_INTERVAL,
    }
  );

  // Handle external content updates (e.g. from URL extraction)
  const handleExternalContentUpdate = useCallback((newContent) => {
    console.log('[NoteForm] External content update:', newContent);
    commitContent(newContent);
    // Force update the editor content via ref since we decoupled initialContent
    if (contentInputRef.current) {
      contentInputRef.current.setValue(newContent);
    }
  }, [commitContent]);

  // URL extraction hook - NOW placed after useNoteSaver to access markAsModified
  const {
    isPromptVisible,
    promptUrl,
    isExtracting,
    extractionError,
    extractNow,
    extractSpecificUrl, // New method to extract specific URLs
    dismissPrompt,
    resetProcessedUrls,
    // Legacy interface for compatibility
    extractionPrompt,
    processedUrlsRef,
    pasteDetectedRef,
    detectUrls,
    markPasteDetected,
    hideExtractionPrompt,
  } = useUrlExtraction(contentRef.current, { // Use ref for initial content to avoid re-creating hook on every keystroke
    setTitle,
    setContent: handleExternalContentUpdate, // Use wrapper to update both state and editor
    setIsModified: markAsModified, // Use hook's markAsModified function
    setLastSaveTime: () => { }, // No longer needed as hook manages this
    noteId: note?.id ?? null,
    includeImages: true, // Enable image extraction for URL content
    onImagesExtracted: (images) => {
      console.log(`[NoteForm] ${images.length} images extracted and uploaded from URL`);
      if (note?.id) {
        loadImages(note.id);
      }
    },
    onExtractionError: (error, url) => {
      const serverMsg = error?.response?.data?.message;
      const fallback = "Couldn't extract content from this URL.";
      showToast(serverMsg || fallback);
      console.warn(`[NoteForm] URL extraction failed for ${url}:`, error?.message || error);
    },
    onExtractionSuccess: async (result, url) => {
      console.log(`[NoteForm] URL extraction successful for: ${url}`);
      // Handle auto-tagging for URL content
      const urlContentTagIds = getFeatureTags(AUTO_TAG_FEATURES.URL_CONTENT);
      if (urlContentTagIds.length > 0 && note?.id) {
          if (shouldAutoApply(AUTO_TAG_FEATURES.URL_CONTENT)) {
            // Auto-apply all configured tags
            const appliedTagNames = [];
            for (const tagId of urlContentTagIds) {
              try {
                await tagsApi.addTagToNote(note.id, tagId);
                const actualTag = tags.find(t => t.id === tagId);
                if (actualTag?.name) appliedTagNames.push(actualTag.name);
              } catch (tagError) {
                console.warn("Failed to auto-assign URL content tag:", tagId, tagError);
              }
            }
            if (appliedTagNames.length > 0) {
              console.log("Auto-assigned URL content tags:", appliedTagNames.join(', '));
              showToast(`Tagged with ${appliedTagNames.join(', ')}`);
              refreshTags();
            }
          } else if (shouldSuggestTag(AUTO_TAG_FEATURES.URL_CONTENT)) {
            // Add all tags to suggested tags
            setSuggestedTags(prev => {
              const newSuggestions = [...prev];
              for (const tagId of urlContentTagIds) {
                const alreadySuggested = newSuggestions.some(t => t.id === tagId);
                const alreadyApplied = noteTags.some(t => t.id === tagId);
                if (!alreadySuggested && !alreadyApplied) {
                  const actualTag = tags.find(t => t.id === tagId);
                  newSuggestions.push({
                    id: tagId,
                    name: actualTag?.name || 'Unknown',
                    featureId: AUTO_TAG_FEATURES.URL_CONTENT
                  });
                }
              }
              return newSuggestions;
            });
            console.log("Suggested URL content tags:", urlContentTagIds.length, "tags");
          }
      }
    }
  });

  // Auto-tagging callbacks for hooks
  const handleAutoApplyTags = useCallback(async (featureId) => {
    const tagIds = getFeatureTags(featureId);
    if (tagIds.length === 0 || !shouldAutoApply(featureId)) return;
    
    const noteId = note?.id;
    if (!noteId) return;

    const appliedTagNames = [];
    for (const tagId of tagIds) {
      try {
        await tagsApi.addTagToNote(noteId, tagId);
        const actualTag = tags.find(t => t.id === tagId);
        if (actualTag?.name) appliedTagNames.push(actualTag.name);
      } catch (tagError) {
        console.warn(`Failed to auto-assign ${featureId} tag:`, tagId, tagError);
      }
    }
    if (appliedTagNames.length > 0) {
      console.log(`Auto-assigned ${featureId} tags:`, appliedTagNames.join(', '));
      showToast(`Tagged with ${appliedTagNames.join(', ')}`);
      refreshTags();
    }
  }, [note?.id, getFeatureTags, shouldAutoApply, tags, showToast, refreshTags]);

  const handleSuggestTags = useCallback((featureId) => {
    const tagIds = getFeatureTags(featureId);
    if (tagIds.length === 0 || !shouldSuggestTag(featureId)) return;

    setSuggestedTags(prev => {
      const newSuggestions = [...prev];
      for (const tagId of tagIds) {
        const alreadySuggested = newSuggestions.some(t => t.id === tagId);
        const alreadyApplied = noteTags.some(t => t.id === tagId);
        if (!alreadySuggested && !alreadyApplied) {
          const actualTag = tags.find(t => t.id === tagId);
          newSuggestions.push({
            id: tagId,
            name: actualTag?.name || 'Unknown',
            featureId
          });
        }
      }
      return newSuggestions;
    });
    console.log(`Suggested ${featureId} tags:`, tagIds.length, "tags");
  }, [getFeatureTags, shouldSuggestTag, noteTags, tags]);

  // --- Use Note Content Actions Hook ---
  const {
    showAddContentDropdown,
    setShowAddContentDropdown,
    clipboardUrl,
    checkClipboardForUrl,
    getTruncatedUrl,
    handleToggleAddContent,
    handleAddTask,
    handleAddNote,
    handleAddContentImageClick, // Wrapper for the dropdown action
    handleAddContentFromClipboard,
    handleCloseAddContentDropdown,
    isGoodreadsExtracting,
    isImdbExtracting,
    clipboardActionLabel
  } = useNoteContentActions({
    getEditor,
    createNote,
    saveNoteFromHook,
    markAsModified,
    extractSpecificUrl,
    addImage,
    note,
    onAutoApplyTags: handleAutoApplyTags,
    onSuggestTags: handleSuggestTags,
  });

  const titleInputRef = useRef();
  const autoSaveTimerRef = useRef(null);

  // Ref to hold navigate function for stable access in handlers
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  // Effect to set the note reference click handler - navigates with note stack
  useEffect(() => {
    console.log("[NoteForm] Setting Tiptap note reference click handler.");

    // Create a handler that uses new navigation system
    const noteStackNavigateHandler = (targetNoteId) => {
      console.log(`[NoteForm Tiptap Handler] Opening referenced note: ${targetNoteId}`);

      // Get current scroll position from the scrollable element
      let currentScrollPosition = 0;
      const scrollableElement = document.querySelector('.note-scrollable-content');
      if (scrollableElement) {
        const maxScroll = scrollableElement.scrollHeight - scrollableElement.clientHeight;
        if (maxScroll > 0) {
          const scrollRatio = scrollableElement.scrollTop / maxScroll;
          // Use 1000 as base for ratio (0-1000 represents 0-100%)
          currentScrollPosition = Math.round(scrollRatio * 1000);
          console.log(`[NoteForm Tiptap Handler] Current scroll position: ${currentScrollPosition}`);
        }
      }

      // Use new navigation system - handles note stack, scroll position, and URL updates
      openReferencedNote(targetNoteId, currentScrollPosition);
    };

    setOpenNoteHandler(noteStackNavigateHandler);

    // Cleanup function
    return () => {
      console.log("[NoteForm] Cleaning up Tiptap note reference click handler.");
    };
  }, [openReferencedNote]);

  // Effect to set the object mention click handler
  useEffect(() => {
    console.log("[NoteForm] Setting object mention click handler. isListView:", isListView, "isMobile:", isMobile);
    // Handler searches for the mention label in quotes with @ prefix
    setObjectMentionClickHandler((label) => {
      const searchQuery = `"@${label}"`;
      console.log(`[NoteForm] Object mention clicked, searching for: ${searchQuery}, isListView: ${isListView}, isMobile: ${isMobile}`);
      // In desktop list view, preserve note (split pane visible)
      // In mobile list view or grid view, close note
      if (isListView && !isMobile) {
        // Desktop list view: keep note open, search in background
        handleSearch(searchQuery, true, true);
      } else {
        // Mobile list view or grid view: close note and search
        navigateToSearchFromContext(searchQuery, { replaceHistory: false, preserveNoteOnSearch: false });
      }
    });
    return () => {
      console.log("[NoteForm] Cleaning up object mention click handler.");
    };
  }, [handleSearch, isListView, isMobile, navigateToSearchFromContext]);

  // Effect to set the tag mention click handler
  useEffect(() => {
    console.log("[NoteForm] Setting tag mention click handler. isListView:", isListView, "isMobile:", isMobile);
    // Handler searches for the tag name with # prefix
    setTagMentionClickHandler((tagName, tagId) => {
      const searchQuery = `#${tagName}`;
      console.log(`[NoteForm] Tag mention clicked, searching for: ${searchQuery}, isListView: ${isListView}, isMobile: ${isMobile}`);
      // In desktop list view, preserve note (split pane visible)
      // In mobile list view or grid view, close note
      if (isListView && !isMobile) {
        // Desktop list view: keep note open, search in background
        handleSearch(searchQuery, true, true);
      } else {
        // Mobile list view or grid view: close note and search
        searchByTag(tagId, tagName, { preserveNoteOnSearch: false });
      }
    });
    return () => {
      console.log("[NoteForm] Cleaning up tag mention click handler.");
    };
  }, [handleSearch, isListView, isMobile, searchByTag]);

  // Tag search function for #mention autocomplete
  const handleTagSearch = useCallback(async (query) => {
    // Filter tags based on query
    const lowerQuery = query.toLowerCase();
    const filteredTags = tags.filter(tag =>
      !tag.is_folder && tag.name.toLowerCase().includes(lowerQuery)
    );
    return filteredTags;
  }, [tags]);

  // Tag select callback - adds the tag to the note
  const handleTagSelect = useCallback(async (tag) => {
    console.log('[NoteForm] Tag selected from mention:', tag);
    if (note?.id && tag?.id) {
      // Check if tag is already applied
      const alreadyApplied = noteTags.some(t => t.id === tag.id);
      if (alreadyApplied) {
        console.log(`[NoteForm] Tag "${tag.name}" already applied to note`);
        return;
      }
      
      try {
        await tagsApi.addTagToNote(note.id, tag.id);
        // Update local state - add the tag to noteTags (with duplicate check)
        setNoteTags(prevTags => {
          if (prevTags.some(t => t.id === tag.id)) {
            console.log(`[NoteForm] Tag "${tag.name}" already exists in noteTags, skipping add`);
            return prevTags;
          }
          return [...prevTags, { id: tag.id, name: tag.name }];
        });
        console.log(`[NoteForm] Tag "${tag.name}" added to note ${note.id}`);
      } catch (error) {
        console.error('[NoteForm] Error adding tag to note:', error);
      }
    }
  }, [note?.id, noteTags, setNoteTags]);


  // --- Core Save Logic (Using useNoteSaver Hook) ---
  // Wrapper function to maintain API compatibility with existing code
  const saveNoteIfNeeded = useCallback(
    async (options = {}) => {
      const { forceSaveOnClose = false } = options;

      console.log(
        `[saveNoteIfNeeded] Wrapper called. forceSaveOnClose: ${forceSaveOnClose}, NoteId: ${note?.id}`,
      );

      // Prevent saving if the note is currently loading its data
      if (note?.isLoading === true) {
        console.log(`[saveNoteIfNeeded] Aborted: Note ${note?.id} is still loading.`);
        return;
      }

      // Prevent saving if the note has been trashed/deleted
      // Check both the note prop and the current state from context
      const currentNoteFromContext = notes?.find(n => n.id === note?.id);
      if (note?.is_deleted === true || currentNoteFromContext?.is_deleted === true || isBeingTrashed || isBeingTrashedRef.current) {
        console.log(`[saveNoteIfNeeded] Aborted: Note ${note?.id} has been trashed/deleted or is being trashed.`);
        return;
      }

      try {
        const result = await saveNoteFromHook({ forceSave: forceSaveOnClose });
        console.log('[saveNoteIfNeeded] Hook save result:', result);
        return result;
      } catch (error) {
        console.error('[saveNoteIfNeeded] Hook save failed:', error);
        throw error;
      }
    },
    [saveNoteFromHook, note?.id, note?.isLoading, notes, isBeingTrashed]
  );

  useEffect(() => {
    latestStateRef.current = {
      title,
      content,
      color,
      images,
      isAutoSaving: isSaving,
      isModified: hookIsModified,
      saveNoteIfNeeded,
      noteId: note?.id, // Include noteId if needed directly in save logic
      _onClose, // Include onClose if needed directly (though it's also a dep of handleClickOutside)
    };
    // console.log("[Ref Update] Updated latestStateRef");
  }, [
    title,
    content,
    color,
    images,
    isSaving,
    hookIsModified,
    saveNoteIfNeeded,
    note?.id,
    _onClose,
  ]);

  // --- End Core Save Logic ---

  // Expose the saveNoteIfNeeded function via the ref
  useImperativeHandle(ref, () => ({
    saveNoteIfNeeded,
  }));

  // Keep saveNoteIfNeeded in a ref so we always have the latest version
  const saveNoteRef = useRef(saveNoteIfNeeded);
  useEffect(() => {
    saveNoteRef.current = saveNoteIfNeeded;
  }, [saveNoteIfNeeded]);

  // Register a STABLE wrapper function with global registry (only once on mount)
  // Keep it registered until component truly unmounts to allow saves during navigation
  useEffect(() => {
    const stableSaveWrapper = async (options) => {
      if (saveNoteRef.current) {
        return await saveNoteRef.current(options);
      }
    };

    console.log('[NoteForm] Registering stable save wrapper with registry');
    noteFormSaveRegistry.register(stableSaveWrapper);

    // Only unregister on true component unmount, NOT on note ID change
    // This allows back button navigation to save before unmounting
    return () => {
      console.log('[NoteForm] Component unmounting, unregistering from registry');
      noteFormSaveRegistry.unregister();
    };
  }, []); // Empty deps - register once, unregister only on unmount

  const handleNoteReferenceClick = useCallback(
    (e, noteRef) => {
      e.preventDefault();
      e.stopPropagation();

      let targetNoteId = noteRef;
      let targetScrollTop = 0;

      if (noteRef.includes("#")) {
        const parts = noteRef.split("#");
        targetNoteId = parts[0];
        targetScrollTop = parseInt(parts[1], 10) || 0;
      }

      console.log(
        `Opening referenced note from NoteForm (via ActionBar): ID=${targetNoteId}, Scroll=${targetScrollTop}`,
      );

      // Get current scroll position from the scrollable element
      let currentScrollPosition = 0;
      const scrollableElement = document.querySelector('.note-scrollable-content');
      if (scrollableElement) {
        const maxScroll = scrollableElement.scrollHeight - scrollableElement.clientHeight;
        if (maxScroll > 0) {
          const scrollRatio = scrollableElement.scrollTop / maxScroll;
          currentScrollPosition = Math.round(scrollRatio * 1000);
        }
      }

      // Use new navigation system - handles note stack, scroll position, and URL updates
      openReferencedNote(targetNoteId, currentScrollPosition);
    },
    [openReferencedNote],
  ); // Add dependencies

  // --- Update handleAddImageClick ---
  const handleAddImageClick = useCallback(async () => {
    // Make async
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.display = "none";

    fileInput.onchange = async (event) => {
      // Make async
      const file = event.target.files[0];
      document.body.removeChild(fileInput); // Clean up input earlier

      if (!file) return;

      // Call the hook's addImage function
      const result = await addImage(file, note?.id); // Pass current note ID

      if (result.success) {
        console.log("Image added/previewed successfully via hook.");
        markAsModified();

        // Insert the image inline at the cursor position. We route through
        // the imperative ref so it handles the NodeSelection collapse and
        // skips the keyboard-popping .focus() — this image-add path is
        // triggered by the action-bar button.
        if (contentInputRef.current && result.image) {
          const success = contentInputRef.current.insertInlineImage(result.image);
          console.log(`[NoteForm] Inline image insertion ${success ? 'successful' : 'failed'}`);
        }
      } else {
        console.error("Failed to add image via hook:", result.error);
        // Error is already handled/displayed by the hook's error state/effect
      }
    };

    document.body.appendChild(fileInput);
    fileInput.click();
    // No 'finally' needed here as input is removed earlier
  }, [note?.id, addImage, isMobile]); // Removed adjustTextareaHeight dependency

  /* Redundant handlers removed (moved to useNoteContentActions) */

  // Close dropdown when clicking outside (handled by AddContentDropdown component via createPortal)
  // No need for click-outside handling here since the dropdown is portaled

  const handleToggleClipboardDropdown = useCallback((e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    setShowClipboardDropdown(prev => !prev);
    // Close add content dropdown if it's open (and we are opening clipboard)
    if (!showClipboardDropdown && showAddContentDropdown) {
      setShowAddContentDropdown(false);
    }
  }, [showClipboardDropdown, showAddContentDropdown]);

  const handleSelectClipboardSnippet = useCallback((snippet, index) => {
    console.log('[NoteForm] Inserting clipboard snippet at cursor:', index);
    setShowClipboardDropdown(false);

    // Get fresh editor instance from ref
    const editor = getEditor();

    if (!editor) {
      console.warn('[NoteForm] No editor instance available for clipboard insertion');
      return;
    }

    try {
      // Insert the text at the current cursor position
      editor.chain().focus().insertContent(snippet.text).run();
      console.log('[NoteForm] Clipboard snippet inserted successfully');

      // Mark as modified
      markAsModified();
    } catch (error) {
      console.error('[NoteForm] Error inserting clipboard snippet:', error);
    }
  }, [getEditor, markAsModified]);

  const handleRemoveClipboardSnippet = useCallback((snippet, index) => {
    console.log('[NoteForm] Removing clipboard snippet:', snippet.id);
    removeClipboardSnippet(snippet.id);
  }, [removeClipboardSnippet]);

  // Close dropdown on escape
  React.useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setShowAddContentDropdown(false);
        setShowClipboardDropdown(false);
      }
    };

    if (showAddContentDropdown || showClipboardDropdown) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [showAddContentDropdown, showClipboardDropdown]);

  // --- Handlers to manage the lifted state ---
  const handleToggleColorPicker = useCallback(
    (e) => {
      if (e) e.preventDefault(); // Prevent default button behavior if needed
      const nextState = !showColorPicker;
      setShowColorPicker(nextState);
      // Only call setShowTagsModal if it's actually open
      if (nextState && showTagsModal) {
        setShowTagsModal(false);
      }
    },
    [showColorPicker, showTagsModal],
  ); // Dependencies: showColorPicker, showTagsModal

  // --- URL Extraction Logic ---
  // Now accepts extractType directly from the prompt buttons

  // Handle textarea content change. The hot path: bump the synchronous ref
  // and mark modified instantly, but debounce the React state update so
  // pills, action bar, and other content-derived UI don't re-render on
  // every keystroke. TiptapEditor already returns clean HTML (its own
  // getCleanHTML runs before emitting), so the regex sanitize and the
  // tempDiv innerText round-trip from the old hot path are gone.
  const handleContentChange = useCallback((newHtmlContent) => {
    handleTypingDetection();

    if (newHtmlContent === contentRef.current) {
      return; // no-op: editor emitted the same HTML we already have
    }

    const prevContent = contentRef.current;
    contentRef.current = newHtmlContent;
    markAsModified();

    // URL detection only does work when there's a pending paste flag — the
    // extraction prompt itself is disabled, so the regex scan is wasted on
    // a normal keystroke. Gate it to keep the hot path tight.
    if (pasteDetectedRef?.current) {
      detectUrls(newHtmlContent, prevContent);
    }

    if (contentDebounceTimerRef.current) {
      clearTimeout(contentDebounceTimerRef.current);
    }
    contentDebounceTimerRef.current = setTimeout(() => {
      contentDebounceTimerRef.current = null;
      setContent(contentRef.current);
    }, CONTENT_DEBOUNCE_MS);
  }, [handleTypingDetection, detectUrls, markAsModified, pasteDetectedRef]);

  // Debug: Track when hookHandleSelectionUpdate changes
  const hookHandleSelectionUpdateRef = useRef(hookHandleSelectionUpdate);
  if (hookHandleSelectionUpdateRef.current !== hookHandleSelectionUpdate) {
    console.log('[NoteForm] hookHandleSelectionUpdate CHANGED - will cause handleSelectionUpdate to recreate');
    hookHandleSelectionUpdateRef.current = hookHandleSelectionUpdate;
  }

  const handleSelectionUpdate = useCallback((editor) => {
    hookHandleSelectionUpdate(editor);
  }, [hookHandleSelectionUpdate]);



  // Updated handleSubmit to use new navigation system
  const handleSubmit = useCallback(
    async (e) => {
      if (e) e.preventDefault();

      // Reset typing state when closing note
      setIsTyping(false);

      // Blur any active content first
      if (contentInputRef.current) {
        contentInputRef.current.blur();
      }

      // Use new navigation system to close the note
      // NavigationService.closeNote handles saving automatically - no need to duplicate here
      // This prevents race conditions with the isModified flag
      console.log("[handleSubmit] Closing note via new navigation system");
      closeNote('close-button');
    },
    [
      // Ensure all dependencies for handleSubmit are correct
      isSaving,
      _onClose,
      navigate,
      openNoteById,
      saveNoteIfNeeded, // saveNoteIfNeeded IS a dependency now
      location.pathname,
      location.search,
      hookIsModified, // Updated to use hook value
      setIsTyping, // Added setIsTyping dependency
      isListView, // Added isListView dependency
    ],
  );

  const handleCloseAndExecute = useCallback(
    async (actionToExecute) => {
      console.log("handleCloseAndExecute triggered");

      // EXTREMELY IMPORTANT: Close the note state FIRST for a more responsive experience
      console.log("[handleCloseAndExecute] Closing note state immediately.");
      // Reset typing state when closing note
      setIsTyping(false);
      closeNote(); // Use NavigationContext's closeNote

      // Blur the text area right after closing
      if (contentInputRef.current) {
        contentInputRef.current.blur();
      }

      // Handle background save in a setTimeout to ensure UI updates first
      if (!isSaving) {
        setTimeout(() => {
          // Double-check isBeingTrashed flag before saving - use ref for immediate access
          if (isBeingTrashedRef.current) {
            console.log("[handleCloseAndExecute] Skipped background save: Note is being trashed (via ref)");
            return;
          }
          console.log("[handleCloseAndExecute] Starting background save");
          saveNoteIfNeeded().catch((err) =>
            console.error(
              "[handleCloseAndExecute] Background save failed:",
              err,
            ),
          );
        }, 0);
      } else {
        console.log(
          "[handleCloseAndExecute] Skipped background save: Auto-saving already in progress.",
        );
      }

      // Execute the action AFTER closing state, but don't wait for save to complete.
      // The action itself (e.g., searchByBook) will handle navigation.
      if (actionToExecute && typeof actionToExecute === "function") {
        // Use a promise to make it awaitable
        return new Promise((resolve) => {
          // Small delay to allow state updates before action
          setTimeout(async () => {
            console.log("[handleCloseAndExecute] Executing action.");
            try {
              // Execute the action and await its result
              const result = await actionToExecute();
              resolve(result);
            } catch (error) {
              console.error("[handleCloseAndExecute] Action failed:", error);
              resolve(null); // Resolve with null on error
            }
          }, 50); // Slightly longer delay
        });
      }
    },
    [
      closeNote, // Use new navigation system
      contentInputRef,
      setIsTyping, // Add setIsTyping dependency
      // isBeingTrashed removed - using ref for immediate access
    ],
  );

  // Start of the next function
  const handleColorSelect = useCallback(
    async (newColor) => {
      setColor(newColor); // Update local color state

      if (note?.id) {
        // If it's an existing note, update backend
        await changeNoteColor(note.id, newColor);
        if (newColor !== note.color) {
          markAsModified; // Mark modified if color actually changed
        }
      } else {
        // If it's a new note, mark modified only if color changed from default
        if (newColor !== "default") {
          markAsModified();
        }
      }
    },
    [note, changeNoteColor, setColor, markAsModified],
  );

  // Handle pin toggle without closing the form
  const handlePinToggle = useCallback(async (id) => {
    if (note) {
      const originalPinState = isPinned; // Store original state for potential revert
      try {
        // 1. Optimistic UI update
        setIsPinned(!originalPinState);

        // 2. Call the context function to update the backend and shared state
        await togglePin(id);

        // 3. REMOVED: Flawed sync logic and prop mutation.
        //    The component will receive the updated 'note.is_pinned' prop
        //    when the NotesContext state updates and triggers a re-render.

        // 4. REMOVED: setIsModified(true); - Pinning usually doesn't count as modification

        console.log(`Pin toggled for note ${id}. UI updated optimistically.`);
      } catch (error) {
        // 5. Revert optimistic update on error
        setIsPinned(originalPinState);
        console.error("Error toggling pin status:", error);
        // Optionally show an error message to the user
      }
    }
  }, [note, isPinned, togglePin]);

  const handleColorClick = useCallback((e, colorName) => {
    e.preventDefault();
    e.stopPropagation();

    // In desktop list view, preserve note (split pane visible)
    // In mobile list view or grid view, close note
    if (isListView && !isMobile) {
      handleSearch(`$${colorName}`, true, true);
    } else {
      searchByColor(colorName, { preserveNoteOnSearch: false });
    }
  }, [searchByColor, handleSearch, isListView, isMobile]);

  // Handle clicks outside the modal - Use history.back() only if opened via URL (?note=...)
  // NOTE: Basic exclusions (image modal, history modal, tag picker, color picker, fixed tabs)
  // and the "outside form" check are already handled by useNoteFormInteractions hook.
  // This handler only needs to check for additional portaled elements.

  const handleClickOutside = useCallback(
    (e) => {
      // Check portaled elements that are outside formRef but should be ignored

      // 1. Check AddContentDropdown (portaled to document.body)
      const isClickInAddContentDropdown = e.target.closest('[data-add-content-dropdown]');
      if (isClickInAddContentDropdown) {
        console.log('[NoteForm] Click inside AddContentDropdown, ignoring');
        return;
      }

      // 2. Check MoreOptionsDropdown (portaled to document.body on mobile)
      const isClickInMoreOptionsDropdown = e.target.closest('[data-more-options-dropdown]');
      if (isClickInMoreOptionsDropdown) {
        console.log('[NoteForm] Click inside MoreOptionsDropdown, ignoring');
        return;
      }

      // 3. Check ExternalActionsPill (positioned outside form container)
      const isClickInExternalPill = e.target.closest('[data-external-actions-pill]');
      if (isClickInExternalPill) {
        console.log('[NoteForm] Click inside ExternalActionsPill, ignoring');
        return;
      }

      // Click is confirmed outside form and all exclusions - proceed with close/save logic
      // Blur the editor first to commit any pending changes
      if (contentInputRef.current) {
        contentInputRef.current.blur();
      }

      // NEW: Use centralized navigation system for closing notes
      console.log('[NoteForm] Click outside detected, closing note via navigation system');

      // Wait for blur to complete and state to update before closing
      // This ensures the latest content is captured in the save
      setTimeout(() => {
        // Close note via new navigation system
        // NavigationService.closeNote handles saving automatically - no need to duplicate here
        closeNote('click-outside');
      }, 0);
    },
    [
      // Minimal, stable dependencies:
      location.search,
      contentInputRef,
      // The ref itself is stable:
      latestStateRef,
      closeNote,
      saveNoteIfNeeded,
    ],
  );

  // Assign the handleClickOutside function to the ref so it can be used in the hook
  handleClickOutsideRef.current = handleClickOutside;

  // Handle removing an image
  // --- Update handleRemoveImage ---
  const handleRemoveImage = useCallback(
    async (imageId) => {
      // Make async
      console.log(`[NoteForm] handleRemoveImage called with imageId: ${imageId} (type: ${typeof imageId})`);

      // Debug: Show current images state
      console.log(`[NoteForm] Current images from hook:`, images.map(img => ({ id: img.id, type: typeof img.id, name: img.name })));

      // First, remove the image from inline content if it exists
      if (contentInputRef.current) {
        console.log(`[NoteForm] Attempting to remove inline image with ID ${imageId}`);

        // Debug: list all inline images first
        if (contentInputRef.current.debugInlineImages) {
          contentInputRef.current.debugInlineImages();
        }

        const success = contentInputRef.current.removeInlineImageById?.(imageId);
        if (success) {
          console.log(`[NoteForm] Successfully removed inline image with ID ${imageId} from content`);
        } else {
          console.log(`[NoteForm] No inline image found with ID ${imageId} or removal failed`);
        }
      } else {
        console.log(`[NoteForm] contentInputRef.current is not available`);
      }

      // Convert imageId to number to match the image manager's data structure
      const imageIdAsNumber = parseInt(imageId, 10);
      console.log(`[NoteForm] Converting imageId from ${imageId} (${typeof imageId}) to ${imageIdAsNumber} (${typeof imageIdAsNumber})`);

      // Then call the hook's removeImage function
      const success = await removeImage(imageIdAsNumber, note?.id); // Pass imageId and noteId

      if (success) {
        console.log("Image removed successfully via hook.");
        markAsModified();
        // Potentially trigger adjustTextareaHeight if needed
        // Height adjustment is now handled/displayed by the hook's effect
      } else {
        console.error("Failed to remove image via hook.");
        // Error is already handled/displayed by the hook's error state/effect
      }
    },
    [note?.id, removeImage, isMobile, images], // Added images to dependencies to see current state
  ); // Removed adjustTextareaHeight dependency

  // Handle tag click for searching
  const handleTagClick = useCallback(
    (e, tag) => {
      e.stopPropagation(); // Prevent triggering other actions
      // In desktop list view, preserve note (split pane visible)
      // In mobile list view or grid view, close note
      if (isListView && !isMobile) {
        handleSearch(`#${tag.name}`, true, true);
      } else {
        searchByTag(tag.id, tag.name, { preserveNoteOnSearch: false });
      }
    },
    [searchByTag, handleSearch, isListView, isMobile],
  );

  // Handle book click for searching
  const handleBookClick = useCallback(
    (e, bookTitle) => {
      e.stopPropagation(); // Prevent triggering other actions
      console.log(
        `[NoteForm] handleBookClick triggering search for: ${bookTitle}`,
      );
      // In desktop list view, preserve note (split pane visible)
      // In mobile list view or grid view, close note
      if (isListView && !isMobile) {
        handleSearch(`{${bookTitle}}`, true, true);
      } else {
        searchByBook(bookTitle, { preserveNoteOnSearch: false });
      }
    },
    [searchByBook, handleSearch, isListView, isMobile],
  );

  // Handle removing a tag from the note
  const handleRemoveTag = useCallback(
    async (tag) => {
      try {
        console.log(`[NoteForm] Removing tag ${tag.name} (ID: ${tag.id}) from note`);

        // Call API to remove tag from note
        await tagsApi.removeTagFromNote(note.id, tag.id);

        // Update local state - remove the tag from noteTags
        setNoteTags(prevTags => prevTags.filter(t => t.id !== tag.id));

        console.log(`[NoteForm] Successfully removed tag ${tag.name} from note`);
      } catch (error) {
        console.error(`[NoteForm] Error removing tag ${tag.name}:`, error);
        // You might want to show a toast notification here
      }
    },
    [note.id, setNoteTags],
  );

  // Handle accepting a suggested tag - adds it to the note
  const handleAcceptSuggestedTag = useCallback(
    async (suggestedTag) => {
      try {
        console.log(`[NoteForm] Accepting suggested tag ${suggestedTag.name} (ID: ${suggestedTag.id})`);

        // Call API to add tag to note
        await tagsApi.addTagToNote(note.id, suggestedTag.id);

        // Update local state - add the tag to noteTags (with duplicate check)
        setNoteTags(prevTags => {
          // Check if tag already exists to prevent duplicates
          if (prevTags.some(t => t.id === suggestedTag.id)) {
            console.log(`[NoteForm] Tag ${suggestedTag.name} already exists in noteTags, skipping add`);
            return prevTags;
          }
          return [...prevTags, { id: suggestedTag.id, name: suggestedTag.name }];
        });

        // Remove from suggested tags
        setSuggestedTags(prev => prev.filter(t => t.id !== suggestedTag.id));

        console.log(`[NoteForm] Successfully added suggested tag ${suggestedTag.name} to note`);
      } catch (error) {
        console.error(`[NoteForm] Error accepting suggested tag ${suggestedTag.name}:`, error);
        // You might want to show a toast notification here
      }
    },
    [note.id, setNoteTags],
  );

  // Handle dismissing a suggested tag - removes it from suggestions
  const handleDismissSuggestedTag = useCallback(
    (suggestedTag) => {
      console.log(`[NoteForm] Dismissing suggested tag ${suggestedTag.name}`);
      setSuggestedTags(prev => prev.filter(t => t.id !== suggestedTag.id));
    },
    [],
  );

  // Handler for ObjectCard to add a suggested tag (used via NoteFormContext)
  const handleAddSuggestedTag = useCallback(
    (tagId, featureId) => {
      const actualTag = tags.find(t => t.id === tagId);
      if (!actualTag) {
        console.warn(`[NoteForm] handleAddSuggestedTag: Tag ${tagId} not found`);
        return;
      }
      setSuggestedTags(prev => {
        const alreadySuggested = prev.some(t => t.id === tagId);
        const alreadyApplied = noteTags.some(t => t.id === tagId);
        if (alreadySuggested || alreadyApplied) {
          return prev;
        }
        dynamicActionBarsRef.current?.showActionBar?.();
        return [...prev, {
          id: tagId,
          name: actualTag.name,
          featureId: featureId || 'unknown'
        }];
      });
    },
    [tags, noteTags],
  );

  // Handler for ObjectCard to directly apply a tag (used via NoteFormContext)
  const handleApplyTag = useCallback(
    async (tagId) => {
      if (!note?.id) return;
      const actualTag = tags.find(t => t.id === tagId);
      if (!actualTag) {
        console.warn(`[NoteForm] handleApplyTag: Tag ${tagId} not found`);
        return;
      }
      // Check if already applied
      if (noteTags.some(t => t.id === tagId)) {
        console.log(`[NoteForm] Tag ${actualTag.name} already applied`);
        return;
      }
      try {
        await tagsApi.addTagToNote(note.id, tagId);
        // Update local state (with duplicate check)
        setNoteTags(prevTags => {
          if (prevTags.some(t => t.id === tagId)) {
            console.log(`[NoteForm] Tag ${actualTag.name} already exists in noteTags, skipping add`);
            return prevTags;
          }
          return [...prevTags, { id: tagId, name: actualTag.name }];
        });
        console.log(`[NoteForm] Applied tag ${actualTag.name} to note`);
        showToast(`Tagged with ${actualTag.name}`);
      } catch (error) {
        console.error(`[NoteForm] Error applying tag ${actualTag.name}:`, error);
      }
    },
    [note?.id, tags, noteTags, setNoteTags, showToast],
  );

  // Track previous note ID to detect actual note changes
  const prevNoteIdForSuggestionsRef = useRef(null);

  // Clear suggested tags when note changes, and add any suggested tags from note creation
  useEffect(() => {
    const noteIdChanged = note?.id !== prevNoteIdForSuggestionsRef.current;
    
    // Check if the note has suggested tags from tag search
    if (note?.suggestedTags && note.suggestedTags.length > 0) {
      console.log('[NoteForm] Note has suggested tags from context:', note.suggestedTags);
      setSuggestedTags(note.suggestedTags);
    } else if (noteIdChanged) {
      // Only clear suggested tags when switching to a different note
      console.log('[NoteForm] Note ID changed, clearing suggested tags');
      setSuggestedTags([]);
    }
    // Don't clear if same note is re-fetched without suggestedTags
    
    prevNoteIdForSuggestionsRef.current = note?.id;
  }, [note?.id, note?.suggestedTags]);

  // Search handlers - Custom handleSearchToggle with scroll position management
  const customHandleSearchToggle = useCallback(() => {
    // setActionBarClass("hidden"); // Now handled by DynamicActionBarsWrapper or handleContentFocus
    dynamicActionBarsRef.current?.hideActionBar?.();

    if (showSearch) {
      // Exiting search - capture scroll position
      const relativeScrollPos = getScrollPosition();
      console.log(`[customHandleSearchToggle] Capturing relative scroll: ${relativeScrollPos}`);
      setTargetScrollPositionOnExit(relativeScrollPos);
    } else {
      // Entering search
      setTargetScrollPositionOnExit(null);
    }

    // Use the hook's toggle function
    handleSearchToggle();
  }, [
    showSearch,
    getScrollPosition,
    setTargetScrollPositionOnExit,
    handleSearchToggle,
    dynamicActionBarsRef
  ]);

  const findTextRange = (parentElement, searchText, matchIndex) => {
    if (!searchText || matchIndex < 0) return null;

    let walker = document.createTreeWalker(
      parentElement,
      NodeFilter.SHOW_TEXT,
      null,
      false,
    );
    let node;
    let currentMatch = 0;
    // Escape regex special characters for accurate matching
    const safePattern = searchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Use global, case-insensitive regex
    const regex = new RegExp(safePattern, "gi");

    while ((node = walker.nextNode())) {
      let nodeText = node.nodeValue;
      let match;
      regex.lastIndex = 0; // Reset regex state for each text node

      while ((match = regex.exec(nodeText)) !== null) {
        if (currentMatch === matchIndex) {
          // Found the correct match!
          try {
            const range = document.createRange();
            range.setStart(node, match.index);
            range.setEnd(node, match.index + match[0].length); // Use match[0].length for exact length
            console.log(
              `[findTextRange] Found range for '${searchText}' (index ${matchIndex}) in node:`,
              node,
            );
            return range; // Return the DOM Range
          } catch (e) {
            console.error("[findTextRange] Error creating range:", e);
            return null;
          }
        }
        currentMatch++;
        // Important: If regex is global, prevent infinite loop on zero-length matches
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }
    }
    console.warn(
      `[findTextRange] Could not find match index ${matchIndex} for text '${searchText}'`,
    );
    return null; // Match not found
  };

  // ----- Optimized useEffect for Focus Management -----
  useEffect(() => {
    console.log("***** [NoteForm Focus useEffect] Setting up focus for new note *****");

    // --- Focus new note ---
    // Use a timeout here as focusing often needs the element to be fully rendered
    let focusTimerId = null;
    if (!note && !titleFocused && contentInputRef.current && typeof contentInputRef.current.focus === 'function') {
      console.log("[Focus useEffect] Scheduling focus for new note.");
      focusTimerId = setTimeout(() => {
        // Double-check ref inside timeout and title focus state
        if (contentInputRef.current && typeof contentInputRef.current.focus === 'function' && !titleFocused) {
          console.log("[Focus useEffect - Delayed] Focusing new note.");
          contentInputRef.current.focus();
        }
      }, 50); // Keep small delay
    }
    // --- End Focus new note ---

    // --- Cleanup Function ---
    return () => {
      console.log("***** [NoteForm Focus Cleanup] Running Focus Cleanup Function! *****");

      // Cleanup timers
      if (focusTimerId) clearTimeout(focusTimerId); // Clear focus timer

      // Reset typing state when note is closed/unmounted
      setIsTyping(false);

      console.log("***** [NoteForm Focus Cleanup] Finished. *****");
    };
    // Dependencies simplified - only note presence changes trigger this
  }, [note?.id, titleFocused]); // Include titleFocused in dependencies 

  // Reset scroll position when a note is opened - optimized
  // SKIP if there's a scroll parameter in URL (restoring scroll from referenced note)
  useEffect(() => {
    // Check if we're restoring scroll position from URL
    const currentSearchParams = new URLSearchParams(location.search);
    const hasScrollParam = currentSearchParams.has('scroll');
    
    // Don't reset scroll if we're restoring from URL scroll param
    if (hasScrollParam) {
      console.log('[NoteForm] Skipping scroll reset - restoring from URL scroll param');
      return;
    }
    
    if (note && contentInputRef.current) {
      // Check if we're on mobile
      const isMobileView = window.innerWidth <= 768;

      // Small delay to ensure content is properly rendered
      setTimeout(
        () => {
          if (contentInputRef.current) {
            // Ensure scrolling starts at the top of the content
            contentInputRef.current.scrollTop = 0;

            // TextareaAutosize handles height adjustment automatically

            // Mobile may need an additional reset of scroll position
            if (isMobileView) {
              // Ensure we're really at the top (sometimes mobile browsers need an extra push)
              setTimeout(() => {
                if (contentInputRef.current) {
                  contentInputRef.current.scrollTop = 0;
                }
              }, 100);
            }
          }
        },
        isMobileView ? 100 : 50,
      ); // Longer delay for mobile
    }
  }, [note?.id]); // Only reset scroll when note ID changes, not when search params change

  // Helper to determine if we should render tags/refs in the footer (now used for both mobile and desktop)
  const renderTagsInFooter =
    noteTags.length > 0 ||
    noteUrls.length > 0 ||
    bookReferences.length > 0 ||
    noteReferences.length > 0;

  // Handle paste detected
  const handlePaste = useCallback((isPaste) => {
    markPasteDetected();
  }, [markPasteDetected]);

  // Handle image paste
  const handleImagePaste = useCallback(async (file) => {
    console.log('[NoteForm] Image paste handler called with file:', file.name);
    const result = await addImage(file, note?.id);
    if (result.success) {
      console.log(`[NoteForm] Image added via paste: ${file.name}`);
      markAsModified();

      // Insert the image inline at the cursor position. Route through the
      // imperative ref so the NodeSelection left by the block-atom insert
      // gets collapsed to a TextSelection — otherwise the bubble menu
      // would pop up and the next keystroke would replace the image.
      if (contentInputRef.current && result.image) {
        const success = contentInputRef.current.insertInlineImage(result.image);
        console.log(`[NoteForm] Inline image insertion ${success ? 'successful' : 'failed'}`);
      }
    } else {
      console.error(`[NoteForm] Failed to add image via paste: ${file.name}`, result.error);
    }
  }, [addImage, note?.id, markAsModified]);

  // Handle image click
  const handleImageClick = useCallback((imageData) => {
    console.log('[NoteForm] Inline image clicked:', imageData);
    // Find the image in our images array and open it fullsize
    const image = images.find(img => img.id === imageData.imageId);
    if (image) {
      // We can either trigger the ImageGallery's fullsize view or 
      // create a custom modal here. For now, let's log it.
      // TODO: Implement fullsize image viewing for inline images
      console.log('TODO: Open fullsize view for inline image:', image);
    }
  }, [images]);

  // Handle image delete
  const handleImageDelete = useCallback((imageDeleteData) => {
    console.log('[NoteForm] Inline image delete requested:', imageDeleteData);
    // Extract imageId from the event data
    const imageId = imageDeleteData?.imageId;
    if (imageId) {
      // Use the existing handleRemoveImage function which handles both inline and gallery removal
      handleRemoveImage(imageId);
    } else {
      console.error('[NoteForm] No imageId found in image delete event data:', imageDeleteData);
    }
  }, [handleRemoveImage]);

  // Handle editor mount
  const handleEditorMount = useCallback(() => {
    console.log('[NoteForm] TiptapNoteContent onMount triggered');
    // Editor instance management is now handled by the stable useEffect above
  }, []);

  // Memoize style object to prevent unnecessary re-renders of TiptapNoteContent
  const editorStyle = useMemo(() => ({
    // Let content determine height, ScrollableContent handles scrolling
    height: "auto",
    minHeight: "200px", // Minimum height for usable editor space
    flex: "0 0 auto", // Don't grow or shrink, use natural height
  }), []); // Empty dependency array as window.innerWidth is not reactive here (would need a resize listener for true reactivity, but this is consistent with previous behavior)

  // Track undo/redo state locally to avoid polling ref during render
  const [editorState, setEditorState] = useState({ canUndo: false, canRedo: false });

  // TiptapEditor fires onTransaction (-> onStateChange) on every keystroke
  // with a fresh `{canUndo, canRedo}` object. Bail when the booleans are
  // unchanged so we don't re-render NoteForm per keystroke.
  const handleEditorStateChange = useCallback((newState) => {
    setEditorState(prev => (
      prev.canUndo === newState.canUndo && prev.canRedo === newState.canRedo
        ? prev
        : newState
    ));
  }, []);

  // Use the attachment manager hook
  const { handleAddAttachment: addAttachmentsToEditor } = useAttachmentManager(note?.id);

  // Handle file attachment
  const handleAddAttachment = useCallback(async (files) => {
    // Get the editor instance from the ref wrapper
    const editorWrapper = contentInputRef.current;
    const editor = editorWrapper?.getEditor ? editorWrapper.getEditor() : null;

    if (!editor) {
      console.error('Editor instance not found');
      return;
    }

    await addAttachmentsToEditor(files, editor);
  }, [addAttachmentsToEditor]);

  // Compute inline style for color CSS variable - avoids styled-components regenerating styles per color
  // IMPORTANT: Do NOT call getComputedStyle here - it forces synchronous layout calculation!
  const colorStyle = useMemo(() => {
    if (color && color !== 'default') {
      return {
        '--form-note-color': `var(--note-color-${color})`,
        '--form-note-border': 'none',
        '--external-pill-color': `var(--note-color-${color})`, // For ExternalActionsPill background
        '--note-color-for-opacity': `var(--note-color-${color})` // For FloatingActionsPill to reference
      };
    }
    return {};
  }, [color]);

  // Determine effective fullscreen mode - list view always uses fullscreen-like layout
  const effectiveFullscreen = isListView || fullscreenNoteForm;

  return (
    <FormOverlay 
      style={colorStyle} 
      $fullscreen={effectiveFullscreen} 
      $isDarkTheme={isDarkTheme}
      $isListView={isListView}
    >
      {contentFullyLoaded && <FormWrapper $fullscreen={effectiveFullscreen} $isListView={isListView}>
        {/* External Actions Pill - positioned outside form in windowed mode, left side in fullscreen/list view */}
        {!isMobile && (
          <ExternalActionsPill $isDarkTheme={isDarkTheme} $fullscreen={effectiveFullscreen} onClick={(e) => e.stopPropagation()} data-external-actions-pill>
            <ActionButton
              onClick={(e) => {
                e.stopPropagation();
                if (!isSaving) handleSubmit(e);
              }}
              disabled={isSaving}
              title="Close note"
              aria-label="Close note"
            >
              {isSaving ? <SaveIndicator /> : <Icon name="close" size={20} />}
            </ActionButton>
            <ActionButton
              onClick={(e) => {
                e.stopPropagation();
                ThemeManager.setTheme(!isDarkTheme);
              }}
              title={isDarkTheme ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={isDarkTheme ? "Switch to light mode" : "Switch to dark mode"}
            >
              <Icon name={isDarkTheme ? "lightMode" : "darkMode"} size={20} />
            </ActionButton>
            {/* Only show fullscreen toggle when not in list view - list view is always "fullscreen" in the detail panel */}
            {!isListView && (
            <ActionButton
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreenNoteForm();
              }}
              title={fullscreenNoteForm ? "Exit fullscreen" : "Enter fullscreen"}
              aria-label={fullscreenNoteForm ? "Exit fullscreen" : "Enter fullscreen"}
            >
              <Icon name={fullscreenNoteForm ? "windowed" : "fullscreen"} size={20} />
            </ActionButton>
            )}
            {/* Up/Down navigation in list view */}
            {isListView && onPrevNote && (
              <ActionButton
                onClick={(e) => {
                  e.stopPropagation();
                  if (hasPrevNote) onPrevNote();
                }}
                title="Previous note"
                aria-label="Previous note"
                disabled={!hasPrevNote}
                style={{ opacity: hasPrevNote ? 1 : 0.3 }}
              >
                <Icon name="arrow_up_caret" size={20} />
              </ActionButton>
            )}
            {isListView && onNextNote && (
              <ActionButton
                onClick={(e) => {
                  e.stopPropagation();
                  if (hasNextNote) onNextNote();
                }}
                title="Next note"
                aria-label="Next note"
                disabled={!hasNextNote}
                style={{ opacity: hasNextNote ? 1 : 0.3 }}
              >
                <Icon name="arrow_down_caret" size={20} />
              </ActionButton>
            )}
          </ExternalActionsPill>
        )}
        <FormContainer ref={formRef} style={colorStyle} className="form-container" $fullscreen={effectiveFullscreen} $isListView={isListView}>
          {/* Extraction Prompt - Placed inside FormContainer, before Form */}
          <ExtractionPrompt
            show={extractionPrompt.show || isGoodreadsExtracting || isImdbExtracting}
            isExtracting={isExtracting}
            isGoodreadsExtracting={isGoodreadsExtracting}
            isImdbExtracting={isImdbExtracting}
            extractionError={extractionError}
          onExtract={() => {
            if (isExtracting) {
              console.log("Extraction already in progress.");
              return;
            }
            extractNow();
          }}
          onDismiss={dismissPrompt}
        />

        {/* Floating Actions Pill - positioned on top of content */}
        {note && !showSearch && (
          <FloatingActionsPill $isDarkTheme={isDarkTheme}>
            <NoteTitleActions
              note={note}
              currentContent={content}
              color={color}
              isMobile={isMobile}
              titleFocused={titleFocused}
              view={view}
              isPinned={isPinned}
              isDarkTheme={isDarkTheme}
              contentInputRef={contentInputRef}
              handlePinToggle={handlePinToggle}
              // Pass handleSubmit for actions that should just close normally (Archive, Trash, etc.)
              onClose={handleSubmit}
              setIsBeingTrashed={setIsBeingTrashedWithRef}
              // Pass the new handler specifically for actions like "See References"
              onCloseAndExecute={handleCloseAndExecute}
              handleSearchToggle={customHandleSearchToggle}
              // Pass handler to open history modal
              onOpenHistory={handleOpenHistoryModal}
            />
          </FloatingActionsPill>
        )}

        <Form onSubmit={handleSubmit}>
          {/* Search bar - Fixed at top when search is active */}
          {showSearch && (
            <SearchBar
              isDarkTheme={isDarkTheme}
              searchInputRef={searchInputRef}
              searchQuery={localSearchQuery}
              onSearchChange={(value) => updateSearchQuery(value)}
              onClearSearch={clearSearch}
              matchCount={matchCount}
              currentMatch={currentMatch}
              onPrevMatch={handlePrevMatch}
              onNextMatch={handleNextMatch}
              onCloseSearch={customHandleSearchToggle}
              color={color}
            />
          )}
          <ScrollableContent ref={scrollableFormRef} className="note-scrollable-content" $showSearch={showSearch} $fullscreen={effectiveFullscreen}>
            <ContentWrapper $fullscreen={effectiveFullscreen}>
            {/* Title Row with Input - now scrolls with content */}
            {!showSearch && (
              <TitleRow>
                <TitleInputWrapper $titleFocused={isMobile && titleFocused}>
                  <TitleInput
                    ref={titleInputRef}
                    type="text"
                    placeholder="Title"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      if (note && e.target.value !== note.title) {
                        markAsModified();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        // Focus the content editor instead of submitting the form
                        if (contentInputRef.current && typeof contentInputRef.current.focus === 'function') {
                          contentInputRef.current.focus();
                        }
                      }
                    }}
                    onFocus={() => {
                      setTitleFocused(true);
                    }}
                    onBlur={() => {
                      setTitleFocused(false);
                    }}
                  />
                </TitleInputWrapper>
              </TitleRow>
            )}

            <TextareaWrapper>
              {/* When searching and if we have a search query, show a highlighted view of the content */}
              {showSearch && localSearchQuery ? (
                <HighlightContainer
                  ref={highlightContainerRef}
                  dangerouslySetInnerHTML={{ __html: content || '<p></p>' }}
                  onClick={customHandleSearchToggle}
                />
              ) : (
                <>
                  {/* {console.log(`[NoteForm Render] note: ${Boolean(note)}, isLoading: ${note?.isLoading}, contentFullyLoaded: ${contentFullyLoaded}`)} */}

                  {/* Force contentFullyLoaded to true for new, empty notes */}
                  {note && note.content === '' && !contentFullyLoaded && (() => {
                    console.log('[NoteForm Render] Empty note detected, forcing contentFullyLoaded to true');
                    setTimeout(() => setContentFullyLoaded(true), 0);
                    return null;
                  })()}

                  {/* Always show content editor for new notes or fully loaded notes */}
                  {(contentFullyLoaded || note?.content === '') && (
                    <NoteFormProvider
                      noteId={note?.id}
                      onAddSuggestedTag={handleAddSuggestedTag}
                      onApplyTag={handleApplyTag}
                    >
                      <TiptapNoteContent
                        ref={contentInputRef}
                        key={note ? note.id : 'new-note'} // Add key to force re-render when note changes
                        initialContent={note?.content || ''} // Use note content for initialization, not state content
                        initialScrollRatio={targetScrollPositionOnExit} // Pass the scroll ratio
                        placeholder="Take a note..."
                        onFocus={handleContentFocus} // Updated to call dynamicActionBarsRef.current.hideActionBar()
                        onChange={handleContentChange}
                        onSelectionUpdate={handleSelectionUpdate}
                        onStateChange={handleEditorStateChange}
                        onPaste={handlePaste}
                        onImagePaste={handleImagePaste}
                        onImageClick={handleImageClick}
                        onImageDelete={handleImageDelete}
                        onTagSearch={handleTagSearch}
                        onTagSelect={handleTagSelect}
                        autoFocus={!note}
                        style={editorStyle}
                        onMount={handleEditorMount}
                        scrollableRef={scrollableFormRef} // Pass ref to ScrollableContent for scroll handling
                      />
                    </NoteFormProvider>
                  )}
                </>
              )}
            </TextareaWrapper>
            </ContentWrapper>
          </ScrollableContent>
          {/* All tags, URLs, and references are now moved to the footer for both mobile and desktop */}
        </Form>

        {isCreatingReminder && (
          <ReminderStatusText>Creating reminder...</ReminderStatusText>
        )}

        {/* Replace NoteActionBar and BottomActionContainer with DynamicActionBarsWrapper */}
        <DynamicActionBarsWrapper
          ref={dynamicActionBarsRef} // Pass the ref
          contentInputRef={contentInputRef} // Pass Tiptap ref for scroll handling
          isMobile={isMobile}
          isTyping={isTyping} // Pass isTyping for BottomActionContainer logic
          // Pass all other necessary props that were previously passed to NoteActionBar and BottomActionContainer
          note={note}
          color={color}
          images={images}
          noteTags={noteTags}
          noteUrls={noteUrls}
          bookReferences={bookReferences}
          noteReferences={noteReferences}
          isModified={hookIsModified}
          isAutoSaving={isSaving}
          isDarkTheme={isDarkTheme}
          unsavedImageIds={unsavedImageIds}
          onRemoveImage={handleRemoveImage}
          onTagClick={handleTagClick}
          onRemoveTag={handleRemoveTag}
          onBookClick={handleBookClick}
          onNoteReferenceClick={handleNoteReferenceClick}
          onAddImageClick={handleAddImageClick}
          onAddAttachment={handleAddAttachment}
          onClose={handleSubmit} // This is the main close/save handler for NoteForm
          onTagsModalClose={handleTagsModalClose}
          onToggleTagsModal={handleToggleTagsModal}
          onToggleColorPicker={handleToggleColorPicker}
          tagButtonRef={tagButtonRef}
          colorButtonRef={colorButtonRef}
          showTagsModal={showTagsModal}
          showColorPicker={showColorPicker}
          onColorSelect={handleColorSelect}
          onCloseTagsModal={handleCloseTagsModal} // This is TagPicker's close
          onUndo={() => contentInputRef.current?.undo?.()}
          onRedo={() => contentInputRef.current?.redo?.()}
          canUndo={editorState.canUndo}
          canRedo={editorState.canRedo}
          onOpenHistory={handleOpenHistoryModal} // Pass the version history handler
          editor={editorInstance} // Pass the editor instance from state
          onToggleAddContent={handleToggleAddContent} // Pass the dropdown toggle handler
          // AddContent dropdown props
          showAddContentDropdown={showAddContentDropdown}
          onAddTask={handleAddTask}
          onAddNote={handleAddNote}

          onAddReminder={handleAddReminder}
          hasReminderIntent={hasReminderIntent} // Pass intent flag based on content
          onSummarizeWithAI={handleSummarizeWithAI}
          onInsertOCR={handleInsertOCR}
          clipboardUrlPreview={clipboardUrl ? getTruncatedUrl(clipboardUrl) : 'No links found in clipboard'}
          clipboardActionLabel={clipboardActionLabel}
          onAddImage={(e) => handleAddContentImageClick(e, handleAddImageClick)}
          onAddClipboardUrl={handleAddContentFromClipboard}
          onCloseAddContentDropdown={handleCloseAddContentDropdown}
          clipboardUrl={clipboardUrl}
          hasClipboardUrl={!!clipboardUrl}
          // Clipboard history dropdown props
          showClipboardDropdown={showClipboardDropdown}
          onToggleClipboardDropdown={handleToggleClipboardDropdown}
          clipboardHistory={clipboardHistory}
          onSelectClipboardSnippet={handleSelectClipboardSnippet}
          onRemoveClipboardSnippet={handleRemoveClipboardSnippet}
          onToggleSticky={toggleSticky}
          onCloseClipboardDropdown={() => setShowClipboardDropdown(false)}
          hasClipboardHistory={hasClipboardHistory}
          // Suggested tags props
          suggestedTags={suggestedTags}
          onAcceptSuggestedTag={handleAcceptSuggestedTag}
          onDismissSuggestedTag={handleDismissSuggestedTag}
        />

        {/* Render NoteHistoryModal if showHistoryModal is true */}
        {showHistoryModal && note?.id && (
          <NoteHistoryModal
            ref={historyModalRef}
            noteId={note.id}
            note={note}
            versions={noteVersions}
            isLoading={versionsLoading}
            onClose={handleCloseHistoryModal}
            onRestore={handleRestoreVersion}
          />
        )}

        </FormContainer>
      </FormWrapper>}

      {/* Render TagPicker - always rendered, visibility controlled by isOpen prop for animation */}
      {note && note.id && (
        <TagPicker
          noteId={note.id}
          overlayRef={tagPickerOverlayRef} // Pass overlay ref
          onClose={handleCloseTagsModal} // Pass the specific close handler
          triggerRef={tagButtonRef} // Pass the button ref
          forwardedRef={tagPickerRef} // Pass the picker container ref
          isMobile={isMobile}
          isOpen={showTagsModal} // Control visibility with animation
          position="top-right"
          refreshTags={refreshTags} // Pass the refresh function
          prefetchedNoteTags={noteTags} // Pass pre-fetched tags to avoid loading delay
          noteColor={color} // Pass note color for mobile background
          onSuggestTags={(tags) => {
            setSuggestedTags(prev => {
              const uniqueNewTags = tags.filter(newTag =>
                !prev.some(existing => existing.id === newTag.id)
              );
              if (uniqueNewTags.length > 0) {
                dynamicActionBarsRef.current?.showActionBar?.();
              }
              return [...prev, ...uniqueNewTags];
            });
          }}
        />
      )}

      {/* Render ColorPicker conditionally */}
      {showColorPicker && (
        <SharedColorPicker
          currentColor={color}
          onColorSelect={handleColorSelect} // Pass the selection handler
          onClose={handleToggleColorPicker} // Pass the toggle handler (acts as close)
          targetRef={colorButtonRef} // Pass the button ref
          mobileBottomSheet={isMobile} // Pass mobile setting
          position="top-right"
        />
      )}
    </FormOverlay>
  );
}); // End of forwardRef

// Wrap with React.memo to prevent unnecessary re-renders
// Custom comparison function to only re-render when important props change
export default React.memo(NoteForm, (prevProps, nextProps) => {
  console.log("[NoteForm memo] Comparison function called");
  // Re-render if note id changes or if onClose function changes
  // Also check if the note's isLoading state has changed, as this is critical for initial render
  const noteIdChanged = prevProps.note?.id !== nextProps.note?.id;
  const onCloseChanged = prevProps.onClose !== nextProps.onClose;
  const isLoadingChanged = prevProps.note?.isLoading !== nextProps.note?.isLoading;
  
  // Also re-render for live sync: color and tags changes from external sources
  const colorChanged = prevProps.note?.color !== nextProps.note?.color;
  const isPinnedChanged = prevProps.note?.is_pinned !== nextProps.note?.is_pinned;
  
  // Compare tags arrays by IDs to detect changes
  const prevTagIds = (prevProps.note?.tags || []).map(t => t.id).sort().join(',');
  const nextTagIds = (nextProps.note?.tags || []).map(t => t.id).sort().join(',');
  const tagsChanged = prevTagIds !== nextTagIds;

// DEBUG: Log what's causing re-renders  const noteRefChanged = prevProps.note !== nextProps.note;  if (noteRefChanged && !noteIdChanged && !isLoadingChanged && !colorChanged && !isPinnedChanged && !tagsChanged) {    console.log('[NoteForm memo] Note REFERENCE changed but props are same - THIS CAUSES RE-RENDER');    console.log('  prevProps.note === nextProps.note:', prevProps.note === nextProps.note);  }    if (noteIdChanged) console.log('[NoteForm memo] noteIdChanged');  if (onCloseChanged) console.log('[NoteForm memo] onCloseChanged');  if (isLoadingChanged) console.log('[NoteForm memo] isLoadingChanged');  if (colorChanged) console.log('[NoteForm memo] colorChanged');  if (isPinnedChanged) console.log('[NoteForm memo] isPinnedChanged');  if (tagsChanged) console.log('[NoteForm memo] tagsChanged');
  // Return true if props are equal (skip re-render), false if different (trigger re-render)
  return !noteIdChanged && !onCloseChanged && !isLoadingChanged && !colorChanged && !isPinnedChanged && !tagsChanged;
});
