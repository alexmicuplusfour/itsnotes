import { useCallback, useEffect, useRef } from 'react';

/**
 * Custom hook to manage the height adjustment of a textarea based on content,
 * images, tags, references, and mobile view.
 *
 * @param {React.RefObject<HTMLTextAreaElement>} contentInputRef - Ref to the textarea element.
 * @param {string} content - The current content of the textarea.
 * @param {Array} images - Array of image objects associated with the note.
 * @param {Array} noteTags - Array of tag objects associated with the note.
 * @param {Array} noteReferences - Array of note reference strings.
 * @param {Array} bookReferences - Array of book reference strings.
 * @param {Array} noteUrls - Array of URL objects extracted from the content.
 * @param {boolean} isMobile - Flag indicating if the view is mobile.
 * @param {boolean} showSearch - Flag indicating if the search bar is visible.
 */
export const useTextareaHeight = (
  contentInputRef,
  content,
  images = [], // Default to empty arrays
  noteTags = [],
  noteReferences = [],
  bookReferences = [],
  noteUrls = [],
  isMobile,
  showSearch // Add showSearch as a dependency
) => {
  const resizeTimerRef = useRef(null);

  const adjustTextareaHeight = useCallback((forceExtraHeight = null) => {
    if (!contentInputRef.current) return;

    const textarea = contentInputRef.current;

    // --- Mobile Height Adjustment ---
    if (isMobile) {
      // On mobile, height is generally fixed, but ensure overflow is correct
      const mobileHeight = 'calc(100vh - 60px)'; // Height minus title area
      const mobilePaddingBottom = '260px'; // Padding for floating footer

      // Apply necessary styles for mobile view
      textarea.style.height = mobileHeight;
      textarea.style.maxHeight = mobileHeight;
      textarea.style.minHeight = mobileHeight;
      textarea.style.overflowY = 'auto'; // Ensure scrolling is enabled
      textarea.style.flex = '1'; // Ensure it fills space
      textarea.style.paddingBottom = mobilePaddingBottom; // Ensure space for footer

      // Adjust wrapper and form heights if necessary (less critical now)
      const wrapper = textarea.closest('.TextareaWrapper');
      if (wrapper) {
        wrapper.style.height = mobileHeight;
        wrapper.style.maxHeight = mobileHeight;
        wrapper.style.minHeight = mobileHeight;
        wrapper.style.flex = '1';
      }
      // console.log('Applied mobile height adjustment:', mobileHeight);
      return; // Exit after mobile adjustment
    }

    // --- Desktop Height Adjustment ---

    // Don't adjust height if search is active on desktop
    if (showSearch) {
        // console.log('Search active, skipping desktop height adjustment.');
        // Optionally reset to a default state if needed when search is active
        textarea.style.height = 'auto'; // Let content dictate initial size
        textarea.style.maxHeight = 'calc(100vh - 200px)'; // Default max height
        textarea.style.overflowY = 'auto';
        textarea.classList.remove('height-adjusted');
        return;
    }


    // Reset height to allow recalculation
    textarea.style.height = 'auto';

    // Trigger TextareaAutosize's internal resize logic if available
    // Note: This assumes TextareaAutosize is still used or similar logic exists
    const event = new Event('autosize:update', { bubbles: true });
    textarea.dispatchEvent(event);

    // Calculate content-based height
    const contentLines = (textarea.value.match(/\n/g) || []).length + 1;
    const lineHeight = 24; // Approximate line height (adjust if needed)
    const minTextareaHeight = 80; // Minimum height from CSS
    const contentHeight = Math.max(minTextareaHeight, contentLines * lineHeight);

    // Calculate extra height needed for images/tags/refs
    let extraHeight = 0;
    if (forceExtraHeight !== null) {
      extraHeight = forceExtraHeight;
    } else {
      if (images && images.length > 0) {
        extraHeight += 95; // Height for image gallery
      }
      // Check if any references exist (tags, note refs, book refs, URLs)
      if (
        (noteTags && noteTags.length > 0) ||
        (noteReferences && noteReferences.length > 0) ||
        (bookReferences && bookReferences.length > 0) ||
        (noteUrls && noteUrls.length > 0)
      ) {
        extraHeight += 50; // Height for the references row
      }
    }

    // Calculate overall form container height
    const formContainer = textarea.closest('.form-container');
    if (formContainer) {
      const headerHeight = 60; // Title area
      const actionBarHeight = 60; // Action bar
      const padding = 50; // General padding
      const minFormHeight = 250; // Minimum overall form height

      const calculatedHeight = headerHeight + contentHeight + actionBarHeight + padding + extraHeight;
      const finalFormHeight = Math.max(minFormHeight, calculatedHeight);

      // Apply height to the form container
      formContainer.style.height = `${finalFormHeight}px`;

      // Calculate and apply max-height to the textarea itself
      const maxTextareaHeight = finalFormHeight - headerHeight - actionBarHeight - extraHeight - 20; // Added buffer

      textarea.style.maxHeight = `${maxTextareaHeight}px`;

      // Apply specific height and overflow if extra space is needed
      if (extraHeight > 0) {
        textarea.style.height = `${Math.min(contentHeight, maxTextareaHeight)}px`;
        textarea.style.overflowY = 'auto';
        textarea.classList.add('height-adjusted');
      } else {
        // If no extra height, let TextareaAutosize manage height mostly
        // but ensure overflow is auto if content exceeds max height
        textarea.style.overflowY = contentHeight > maxTextareaHeight ? 'auto' : 'hidden';
        textarea.classList.remove('height-adjusted');
        // Let height be 'auto' or the calculated content height, capped by maxTextareaHeight
        textarea.style.height = `${Math.min(contentHeight, maxTextareaHeight)}px`;
      }
       // console.log(`Desktop height adjusted. Form: ${finalFormHeight}px, Textarea max: ${maxTextareaHeight}px, Extra: ${extraHeight}px`);
    }
  }, [contentInputRef, isMobile, images, noteTags, noteReferences, bookReferences, noteUrls, showSearch]); // Include all dependencies

  // Effect to run adjustment when dependencies change
  useEffect(() => {
    // Debounce the adjustment slightly
    if (resizeTimerRef.current) {
      clearTimeout(resizeTimerRef.current);
    }

    resizeTimerRef.current = setTimeout(() => {
      adjustTextareaHeight();
    }, 50); // Short delay (e.g., 50ms)

    // Cleanup timer on unmount or dependency change
    return () => {
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
      }
    };
  }, [
    content,
    images,
    noteTags,
    noteReferences,
    bookReferences,
    noteUrls,
    isMobile,
    showSearch, // Add showSearch here
    adjustTextareaHeight // Include the function itself
  ]);

  // Return the adjustment function if it needs to be called manually elsewhere,
  // otherwise, the effect handles it.
  // return { adjustTextareaHeight };
  // No need to return anything if the effect handles all adjustments.
};
