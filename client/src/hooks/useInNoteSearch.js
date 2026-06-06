import { useState, useRef, useCallback, useEffect } from 'react';
import Mark from 'mark.js';

/**
 * Custom hook for in-note search functionality with Mark.js highlighting
 * 
 * @param {Object} contentContainerRef - React ref to the container element where search highlighting will be applied
 * @param {string} currentContentHtml - Current HTML content to search within
 * @param {Object} options - Configuration options
 * @param {number} options.debounceDelay - Debounce delay in milliseconds (default: 300)
 * @param {string} options.highlightClassName - CSS class for highlighted matches (default: 'highlighted-match')
 * @param {string} options.currentMatchClassName - CSS class for current match (default: 'current-match')
 * @param {string} options.accuracy - Mark.js accuracy setting (default: 'partially')
 * @param {boolean} options.separateWordSearch - Whether to search for separate words (default: false)
 * 
 * @returns {Object} Hook API
 */
export const useInNoteSearch = (
  contentContainerRef,
  currentContentHtml,
  options = {}
) => {
  const {
    debounceDelay = 300,
    highlightClassName = 'highlighted-match',
    currentMatchClassName = 'current-match',
    accuracy = 'partially',
    separateWordSearch = false,
    scrollableRef = null, // Optional ref to the scrollable container (for getting scroll position)
  } = options;

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);

  // Refs
  const searchInputRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const markInstanceRef = useRef(null);

  // Function to scroll to a specific match index
  const scrollToMatch = useCallback((index) => {
    if (!contentContainerRef.current) return;

    const highlightElements = contentContainerRef.current.querySelectorAll(`.${highlightClassName}`);

    if (index >= 0 && index < highlightElements.length) {
      const currentElement = highlightElements[index];

      // Remove current match class from all highlights
      highlightElements.forEach(el => el.classList.remove(currentMatchClassName));

      // Add current match class to the target element
      currentElement.classList.add(currentMatchClassName);

      // Scroll the element into view
      currentElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });

      console.log(`[useInNoteSearch] Scrolled to match index ${index}`);
    } else if (highlightElements.length > 0 && index === -1) {
      // If index is -1 but there are matches, remove current match class
      highlightElements.forEach(el => el.classList.remove(currentMatchClassName));
    }
  }, [contentContainerRef, highlightClassName, currentMatchClassName]);
  // Function to perform highlighting with Mark.js
  const performHighlighting = useCallback((query) => {
    if (!contentContainerRef.current) return;

    const node = contentContainerRef.current;
    
    // Always create a fresh Mark instance to avoid state issues
    if (markInstanceRef.current) {
      markInstanceRef.current.unmark();
    }
    markInstanceRef.current = new Mark(node);

    // Remove previous highlights
    markInstanceRef.current.unmark({
      done: () => {
        if (query.trim()) {
          // Apply new highlights
          markInstanceRef.current.mark(query, {
            element: 'span',
            className: highlightClassName,
            separateWordSearch,
            accuracy,
            exclude: [],
            each: (element) => {
              // Just mark each element, don't count here
            },
            done: (count) => {
              console.log(`[useInNoteSearch] Highlighted ${count} instances of "${query}"`);
              setMatchCount(count);
              
              if (count > 0) {
                // If matches found, always start with the first one
                setCurrentMatchIndex(0);
              } else {
                // No matches found
                setCurrentMatchIndex(-1);
              }
            },
            filter: (textNode, term, totalCounter, counter) => {
              // Allow highlighting in all text nodes by default
              return true;
            },
          });
        } else {
          // Clear match count if query is empty
          setMatchCount(0);
          setCurrentMatchIndex(-1);
        }
      },
    });
  }, [
    contentContainerRef,
    highlightClassName,
    separateWordSearch,
    accuracy
  ]);
  // Effect to handle search highlighting when query or content changes
  useEffect(() => {
    if (showSearch && searchQuery && contentContainerRef.current) {
      // Clear any pending debounce timer since we're running immediately
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      performHighlighting(searchQuery);
    } else if (contentContainerRef.current && markInstanceRef.current) {
      // If search is not active or query is empty, ensure highlights are removed
      markInstanceRef.current.unmark();
      setMatchCount(0);
      setCurrentMatchIndex(-1);
    }
  }, [showSearch, searchQuery, currentContentHtml, performHighlighting]);

  // Effect to handle current match highlighting and scrolling
  useEffect(() => {
    if (showSearch && matchCount > 0 && currentMatchIndex >= 0) {
      // Add a small delay to ensure highlighting is complete
      setTimeout(() => scrollToMatch(currentMatchIndex), 50);
    }
  }, [showSearch, matchCount, currentMatchIndex, scrollToMatch]);

  // Debounced search effect - only for user typing, not for programmatic changes
  useEffect(() => {
    // Only use debouncing if we're in search mode and have a query
    if (showSearch && searchQuery) {
      // Clear the previous timer if it exists
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set a new timer to perform the search after debounce delay
      debounceTimerRef.current = setTimeout(() => {
        performHighlighting(searchQuery);
      }, debounceDelay);

      // Cleanup function to clear the timer
      return () => {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
      };
    }
  }, []); // Empty dependency array - this effect is disabled for now to avoid conflicts

  // Cleanup function for Mark.js instance
  useEffect(() => {
    return () => {
      if (markInstanceRef.current) {
        markInstanceRef.current.unmark();
        markInstanceRef.current = null;
      }
    };
  }, []);

  // Search navigation functions
  const goToPreviousMatch = useCallback(() => {
    if (matchCount > 0) {
      const newIndex = (currentMatchIndex - 1 + matchCount) % matchCount;
      setCurrentMatchIndex(newIndex);
    }
  }, [matchCount, currentMatchIndex]);

  const goToNextMatch = useCallback(() => {
    if (matchCount > 0) {
      const newIndex = (currentMatchIndex + 1) % matchCount;
      setCurrentMatchIndex(newIndex);
    }
  }, [matchCount, currentMatchIndex]);
  // Clear search function
  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setMatchCount(0);
    setCurrentMatchIndex(-1);

    // Clear highlights
    if (markInstanceRef.current) {
      markInstanceRef.current.unmark();
    }

    // Focus the search input if available
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);  // Toggle search function
  const toggleSearch = useCallback(() => {
    const newSearchState = !showSearch;
    setShowSearch(newSearchState);

    if (!newSearchState) {
      // Exiting search - clear search state first
      setSearchQuery('');
      setMatchCount(0);
      setCurrentMatchIndex(-1);
      
      // Clear any pending debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      
      // Delay clearing highlights to prevent scroll jump
      // This allows the parent component to restore scroll position first
      setTimeout(() => {
        if (markInstanceRef.current) {
          markInstanceRef.current.unmark();
          markInstanceRef.current = null; // Reset to force fresh instance next time
        }
      }, 300); // Delay to allow scroll restoration to complete
    } else {
      // Entering search - focus input after a brief delay
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 100);
    }
  }, [showSearch]);

  // Update search query
  const updateSearchQuery = useCallback((query) => {
    setSearchQuery(query);
  }, []);

  // Function to get scroll position (for external scroll management)
  const getScrollPosition = useCallback(() => {
    // Use scrollableRef if provided, otherwise fall back to contentContainerRef
    const container = scrollableRef?.current || contentContainerRef.current;
    if (!container) return 0;
    
    if (container.scrollHeight > container.offsetHeight) {
      const scrollTop = container.scrollTop;
      const maxScroll = container.scrollHeight - container.offsetHeight;
      return maxScroll > 0 ? scrollTop / maxScroll : 0;
    }
    return 0;
  }, [scrollableRef, contentContainerRef]);

  return {
    // State
    showSearch,
    searchQuery,
    matchCount,
    currentMatchIndex,
    
    // Refs
    searchInputRef,
    
    // Actions
    toggleSearch,
    updateSearchQuery,
    clearSearch,
    goToPreviousMatch,
    goToNextMatch,
    scrollToMatch,
    getScrollPosition,
    
    // Internal functions (if needed externally)
    performHighlighting,
  };
};

export default useInNoteSearch;
