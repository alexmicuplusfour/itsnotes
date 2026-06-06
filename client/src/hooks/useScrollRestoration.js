import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Hook to handle scroll restoration logic for notes.
 * Handles two types of scroll restoration:
 * 1. URL-based restoration (when opening a note with ?scroll=... param)
 * 2. Search exit restoration (when closing in-note search)
 */
export const useScrollRestoration = ({
  note,
  contentFullyLoaded,
  editorInstance,
  showSearch
}) => {
  const location = useLocation();
  const [targetScrollPositionOnExit, setTargetScrollPositionOnExit] = useState(null);
  // Track which scroll restoration we've already completed to avoid duplicate scrolls
  const completedScrollRef = useRef(null);

  // --- EFFECT FOR HANDLING URL SCROLL PARAMETER ---
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const scrollParam = searchParams.get("scroll");
    const noteParamRaw = searchParams.get("note"); // Get note ID from URL too
    // Support note stack - get the last (current) note ID
    const noteParam = noteParamRaw ? noteParamRaw.split(',').pop() : null;
    const instantParam = searchParams.get("instant"); // Check for instant scroll flag

    console.log(`[Scroll Restore Effect] scrollParam: ${scrollParam}, noteParam: ${noteParam}, instant: ${instantParam}, note?.id: ${note?.id}, contentFullyLoaded: ${contentFullyLoaded}, editorInstance: ${!!editorInstance}`);

    // Create a unique key for this scroll restoration request
    const scrollKey = `${noteParam}-${scrollParam}-${instantParam}`;

    // Skip if we've already completed this exact scroll restoration
    if (completedScrollRef.current === scrollKey) {
      console.log(`[Scroll Restore Effect] Already completed scroll for ${scrollKey}, skipping`);
      return;
    }

    // Only attempt scroll if:
    // 1. scroll parameter exists
    // 2. The note currently loaded in the form matches the note ID in the URL
    // 3. Content is fully loaded and ready
    // Note: We no longer require editorInstance - we'll retry finding the scrollable element instead
    if (
      scrollParam &&
      note?.id === noteParam &&
      contentFullyLoaded
    ) {
      // Parse scroll value - supports both old and new formats:
      // Old format: "500" (simple number)
      // New format: "noteId1:500,noteId2:0" (note stack with positions)
      let scrollValue = 0;
      if (scrollParam.includes(':')) {
        // New format - extract scroll position for current note
        const scrollEntries = scrollParam.split(',');
        const currentNoteEntry = scrollEntries.find(entry => entry.startsWith(noteParam + ':'));
        if (currentNoteEntry) {
          scrollValue = parseInt(currentNoteEntry.split(':')[1], 10);
        }
      } else {
        // Old format - simple number
        scrollValue = parseInt(scrollParam, 10);
      }
      const isInstant = instantParam === 'true';
      const scrollBehavior = isInstant ? 'instant' : 'smooth';
      const initialDelay = isInstant ? 10 : 360;

      console.log(
        `[Scroll Restore Effect] Attempting to scroll note ${noteParam} to ${scrollParam}. Instant: ${isInstant}`,
      );

      // Function to perform the actual scroll with retry logic
      const performScroll = (attempt = 1, maxAttempts = 5) => {
        // Check if note still matches
        if (note?.id !== noteParam) {
          console.log(`[Scroll Restore Effect] Aborted scroll for ${noteParam}, note changed`);
          return;
        }

        // Use the ScrollableContent element (the main scrollable container)
        const scrollableElement = document.querySelector('.note-scrollable-content');

        console.log(`[Scroll Restore Effect] Attempt ${attempt}/${maxAttempts} - scrollableElement (.note-scrollable-content) found:`, !!scrollableElement);

        if (scrollableElement && scrollableElement.scrollHeight > scrollableElement.offsetHeight) {
          // Handle ratio-based scroll position (value between 0-1000 representing 0-100%)
          if (scrollValue <= 1000) {
            const scrollRatio = scrollValue / 1000; // Convert back to 0-1 ratio
            const maxScroll = scrollableElement.scrollHeight - scrollableElement.offsetHeight;
            const targetScrollTop = Math.max(0, maxScroll * scrollRatio);

            console.log(
              `[Scroll Restore Effect] Using RATIO-based scroll. Ratio: ${scrollRatio}, maxScroll: ${maxScroll}, target: ${targetScrollTop}, scrollHeight: ${scrollableElement.scrollHeight}, offsetHeight: ${scrollableElement.offsetHeight}`
            );

            // Restore scroll position
            scrollableElement.scrollTo({
              top: targetScrollTop,
              behavior: scrollBehavior
            });

            // Mark this scroll as completed
            completedScrollRef.current = scrollKey;

            // Verify the scroll worked
            setTimeout(() => {
              console.log(`[Scroll Restore Effect] Final scroll position: ${scrollableElement.scrollTop}`);
            }, 100);
          } else {
            // Handle legacy pixel-based scroll position
            console.log(
              `[Scroll Restore Effect] Using PIXEL-based scroll. Target: ${scrollValue}`
            );
            scrollableElement.scrollTo({
              top: scrollValue,
              behavior: scrollBehavior
            });
            
            // Mark this scroll as completed
            completedScrollRef.current = scrollKey;
          }

          console.log(
            `[Scroll Restore Effect] Scroll restoration completed for note ${noteParam}`,
          );
        } else if (attempt < maxAttempts) {
          // Retry with exponential backoff
          const retryDelay = Math.min(50 * Math.pow(2, attempt - 1), 500);
          console.log(`[Scroll Restore Effect] Scrollable element not ready, retrying in ${retryDelay}ms`);
          setTimeout(() => performScroll(attempt + 1, maxAttempts), retryDelay);
        } else {
          console.warn(`[Scroll Restore Effect] Failed to find scrollable element after ${maxAttempts} attempts`);
        }
      };

      // Start the scroll attempt after initial delay
      const timer = setTimeout(() => performScroll(), initialDelay);

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [location.search, note?.id, contentFullyLoaded, editorInstance]);

  // Reset completed scroll ref when note changes
  useEffect(() => {
    completedScrollRef.current = null;
  }, [note?.id]);

  // --- EFFECT FOR HANDLING SEARCH EXIT SCROLL ---
  useEffect(() => {
    // Check if targetScrollPositionOnExit holds a valid ratio (0 to 1)
    if (!showSearch && targetScrollPositionOnExit !== null) {
      console.log(`[Scroll Restore Effect] Exiting search. Target RELATIVE scroll: ${targetScrollPositionOnExit}`);

      // We now handle the actual scrolling inside TiptapNoteContent via the initialScrollRatio prop.
      // We just need to reset the state here after a delay to ensure it's been consumed.
      const timer = setTimeout(() => {
        setTargetScrollPositionOnExit(null);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [showSearch, targetScrollPositionOnExit, setTargetScrollPositionOnExit]);

  return {
    targetScrollPositionOnExit,
    setTargetScrollPositionOnExit
  };
};
