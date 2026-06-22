import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Hook for managing all UI interactions in the NoteForm component
 * Consolidates mobile detection, theme detection, click outside handling,
 * mobile scroll behavior, typing detection, and action bar management
 */
export function useNoteFormInteractions({
  formRef,
  contentInputRef,
  onClose,
  onClickOutside, // New optional parameter for custom click-outside handling
  tagPickerRef,
  tagPickerOverlayRef,
  colorButtonRef,
  historyModalRef,
  isListView = false, // When true, clicking outside doesn't close the form
  initialIsMobile = window.innerWidth <= 768
}) {  // --- Internal State (removed action bar and touch state - handled by DynamicActionBarsWrapper) ---
  const [isMobile, setIsMobile] = useState(initialIsMobile);
  const [isTyping, setIsTyping] = useState(false);
  const [isDarkTheme, setIsDarkTheme] = useState(
    () => !document.documentElement.classList.contains("light-theme")
  );
  // --- Refs for managing timers and touch behavior (scroll handling moved to DynamicActionBarsWrapper) ---
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(isTyping); // Add ref to avoid dependency in useCallback
  // Refs holding live prop values so stable handlers can read them without re-registering
  const isListViewRef = useRef(isListView);
  const onCloseRef = useRef(onClose);
  const onClickOutsideRef = useRef(onClickOutside);
  // Removed scroll-related refs - now handled by DynamicActionBarsWrapper

  // Keep ref in sync with state
  useEffect(() => {
    isTypingRef.current = isTyping;
  }, [isTyping]);

  // Keep prop refs current on every render so the once-registered listeners stay fresh
  useEffect(() => {
    isListViewRef.current = isListView;
    onCloseRef.current = onClose;
    onClickOutsideRef.current = onClickOutside;
  });

  // --- Constants ---
  const SWIPE_THRESHOLD = 50;
  // --- Core Logic Functions - memoized to prevent re-creation ---

  const _handleResize = useCallback(() => {
    const newIsMobile = window.innerWidth <= 768;
    // Functional update keeps this handler stable; React bails out if unchanged
    setIsMobile((prev) => (prev !== newIsMobile ? newIsMobile : prev));
  }, []);

  const _handleThemeChange = useCallback(() => {
    const newIsDarkTheme = !document.documentElement.classList.contains("light-theme");
    // Always set the state - React will only re-render if value changed
    setIsDarkTheme(newIsDarkTheme);
  }, []); // No dependencies - always read fresh from DOM

  const _handleClickOutside = useCallback((event) => {
    // In list view, don't close on click outside
    if (isListViewRef.current) return;

    // 1. Ignore clicks within the image modal
    const isImageModal = event.target.closest(".image-modal-overlay");
    if (isImageModal) return;

    // 2. Ignore clicks within the history modal
    const isHistoryModal = event.target.closest(".note-history-modal-overlay");
    if (isHistoryModal) return;

    // 3. Check TagPicker
    const isClickInTagPickerContainer = tagPickerRef.current?.contains(event.target);
    const isClickInTagPickerOverlay = event.target.closest('[data-tag-picker-overlay="true"]');

    // 4. Check ColorPicker
    const isClickInColorPickerOverlay = event.target.closest("[data-color-picker-overlay]");
    const isClickInColorPickerContainer = event.target.closest("[data-color-picker-container]");

    // 5. Ignore clicks in pickers
    if (
      isClickInTagPickerContainer ||
      isClickInTagPickerOverlay ||
      isClickInColorPickerOverlay ||
      isClickInColorPickerContainer
    ) return;

    // 6. Ignore clicks in FixedTabs
    const isClickInFixedTabs = event.target.closest("[data-fixed-tabs-container]");
    if (isClickInFixedTabs) return;    // 7. Check click outside main form
    if (formRef.current && !formRef.current.contains(event.target)) {
      // Use custom click-outside handler if provided, otherwise fall back to onClose
      const onClickOutside = onClickOutsideRef.current;
      const onClose = onCloseRef.current;
      if (onClickOutside && typeof onClickOutside === 'function') {
        onClickOutside(event);
      } else if (onClose && typeof onClose === 'function') {
        onClose();
      }
    }
  }, [formRef, tagPickerRef]);  // formRef/tagPickerRef are stable refs; live values read from refs
  const _handleContentFocus = useCallback(() => {
    // Content focus handling is now delegated to DynamicActionBarsWrapper
    // This hook only manages typing detection and other non-scroll interactions
  }, []);

  const _handleSelectionUpdate = useCallback((editor) => {
    if (isMobile && editor) {
      const isSelectionEmpty = editor.state.selection.empty;

      if (!isSelectionEmpty) {
        // Text IS Selected - Set isTyping to true and clear any pending timeout
        if (!isTypingRef.current) {
          setIsTyping(true);
        }
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
      } else {
        // Selection is NOW Empty - Start inactivity timer if not already running
        if (isTypingRef.current && !typingTimeoutRef.current) {
          typingTimeoutRef.current = setTimeout(() => {
            setIsTyping(false);
            typingTimeoutRef.current = null;
          }, 600);
        }
      }
    }
  }, [isMobile]); // Removed isTyping from dependencies - use ref instead
  const _handleActionBarTouchStart = useCallback((e) => {
    // Touch handling is now delegated to DynamicActionBarsWrapper
  }, []);

  const _handleActionBarTouchMove = useCallback((e) => {
    // Touch handling is now delegated to DynamicActionBarsWrapper
  }, []);

  const _handleActionBarTouchEnd = useCallback(() => {
    // Touch handling is now delegated to DynamicActionBarsWrapper
  }, []);

  // --- Body Scroll Lock/Padding Logic ---
  const _applyBodyScrollLock = useCallback(() => {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const originalStyle = window.getComputedStyle(document.body).overflow;
    const originalPadding = window.getComputedStyle(document.body).paddingRight;
    
    // Only apply if scrollbar exists to avoid adding padding unnecessarily
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    document.body.style.overflow = "hidden";

    return { originalStyle, originalPadding };
  }, []);

  const _removeBodyScrollLock = useCallback((originalStyle, originalPadding) => {
    document.body.style.overflow = originalStyle;
    document.body.style.paddingRight = originalPadding;
  }, []);
  // --- Exposed Functions ---
  // Removed showActionBar - now handled by DynamicActionBarsWrapper

  // Handler for typing detection (used by content change)
  const handleTypingDetection = useCallback(() => {
    if (isMobile) {
      if (!isTypingRef.current) {
        setIsTyping(true);
      }

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        typingTimeoutRef.current = null;
      }, 900);
    }
  }, [isMobile]); // Removed isTyping dependency - use ref instead

  // --- Effects ---
  // Main Setup and Cleanup Effect - run only once
  useEffect(() => {
    // Apply body scroll lock
    const { originalStyle, originalPadding } = _applyBodyScrollLock();

    // Set up event listeners
    window.addEventListener("resize", _handleResize);
    document.addEventListener("mousedown", _handleClickOutside);

    // Set up theme observer
    const themeObserver = new MutationObserver(_handleThemeChange);
    themeObserver.observe(document.documentElement, { 
      attributes: true, 
      attributeFilter: ["class"] 
    });

    // Initial state setup
    _handleResize();
    _handleThemeChange();

    // Cleanup function
    return () => {
      // Remove event listeners
      window.removeEventListener("resize", _handleResize);
      document.removeEventListener("mousedown", _handleClickOutside);

      // Disconnect observer
      themeObserver.disconnect();      // Clear timers
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      // Reset typing state
      setIsTyping(false);

      // Restore body styles
      _removeBodyScrollLock(originalStyle, originalPadding);
    };
  }, []); // Remove all dependencies to prevent re-running  // Mobile Scroll Listener Effect - removed, now handled by DynamicActionBarsWrapper
  // This prevents duplicate scroll listeners and improves performance

  // --- Return Values (removed action bar related values - handled by DynamicActionBarsWrapper) ---
  return {
    // State
    isMobile,
    isTyping,
    isDarkTheme,

    // Functions
    handleTypingDetection,

    // Event handlers for parent component to attach
    contentFocusHandler: _handleContentFocus,
    selectionUpdateHandler: _handleSelectionUpdate,
    actionBarTouchStartHandler: _handleActionBarTouchStart,
    actionBarTouchMoveHandler: _handleActionBarTouchMove,
    actionBarTouchEndHandler: _handleActionBarTouchEnd,
  };
}
