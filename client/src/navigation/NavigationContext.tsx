/**
 * NavigationContext
 *
 * React context wrapper for NavigationService.
 * Provides navigation state and actions to all components.
 *
 * Usage:
 * <NavigationProvider>
 *   <App />
 * </NavigationProvider>
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { NavigationService } from './NavigationService';
import { NavigationState, NavigationContext as NavContext, NavigationOptions, CloseTrigger, ViewType } from './types';

interface NavigationContextValue {
  // State
  state: NavigationState;

  // Actions
  openNote: (noteId: string, context: NavContext, options?: NavigationOptions) => Promise<void>;
  openReferencedNote: (noteId: string, scrollPosition: number, options?: NavigationOptions) => Promise<void>;
  closeNote: (trigger: CloseTrigger, options?: NavigationOptions) => Promise<void>;
  closeAllNotes: (options?: NavigationOptions) => Promise<void>;
  navigateToSearch: (query: string, options?: NavigationOptions) => void;
  clearSearch: () => void;
  updateScrollPosition: (position: number) => void;
  getScrollPosition: (noteId: string) => number;
  getCurrentScrollPosition: () => number;

  // View navigation
  changeView: (view: 'main' | 'archive' | 'trash') => void;

  // Specialized search methods
  searchById: (noteId: string, options?: NavigationOptions) => void;
  searchByTag: (tagName: string, options?: NavigationOptions) => void;
  searchByColor: (colorName: string, options?: NavigationOptions) => void;
  searchByBook: (bookTitle: string, options?: NavigationOptions) => void;

  // Configuration
  setViewType: (viewType: ViewType) => void;

  // Service instance (for advanced usage)
  service: NavigationService;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

interface NavigationProviderProps {
  children: ReactNode;
  onSaveNote?: (noteId: string) => Promise<void>;
  onFetchNote?: (noteId: string) => Promise<void>;
  onCloseNote?: () => Promise<void>;
  onSearch?: (query: string) => Promise<void>;
  onClearSearch?: () => Promise<void>;
}

export function NavigationProvider({
  children,
  onSaveNote,
  onFetchNote,
  onCloseNote,
  onSearch,
  onClearSearch,
}: NavigationProviderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Use refs to always get current values
  const searchParamsRef = useRef(searchParams);
  const locationRef = useRef(location);
  searchParamsRef.current = searchParams;
  locationRef.current = location;

  // Create service instance (only once)
  const serviceRef = useRef<NavigationService | null>(null);

  if (!serviceRef.current) {
    serviceRef.current = new NavigationService(
      (url, options) => {
        if (typeof url === 'string') {
          console.log('[NavigationContext] Navigating to:', url, 'options:', options);
          navigate(url, options);
        } else {
          // Preserve current pathname when updating search params
          const currentPath = locationRef.current.pathname;
          const fullUrl = `${currentPath}?${url.search}`;
          console.log('[NavigationContext] Navigating to:', fullUrl, 'options:', options);
          navigate(fullUrl, options);
        }
      },
      () => searchParamsRef.current
    );
  }

  const service = serviceRef.current;

  // Set up callbacks
  useEffect(() => {
    if (onSaveNote) {
      service.onSaveNote(onSaveNote);
    }
  }, [service, onSaveNote]);

  useEffect(() => {
    if (onFetchNote) {
      service.onFetchNote(onFetchNote);
    }
  }, [service, onFetchNote]);

  useEffect(() => {
    if (onCloseNote) {
      service.onCloseNote(onCloseNote);
    }
  }, [service, onCloseNote]);

  useEffect(() => {
    if (onSearch) {
      service.onSearch(onSearch);
    }
  }, [service, onSearch]);

  useEffect(() => {
    if (onClearSearch) {
      service.onClearSearch(onClearSearch);
    }
  }, [service, onClearSearch]);

  // Handle browser back/forward button - save current note before URL changes
  useEffect(() => {
    // Track the current note ID BEFORE popstate changes the URL
    let currentNoteIdBeforePopState: string | null = null;

    const captureCurrentNote = () => {
      const state = service.getState();
      currentNoteIdBeforePopState = state.currentNoteId;
      console.log('[NavigationContext] Captured note before popstate:', currentNoteIdBeforePopState);
    };

    const handlePopState = async () => {
      console.log('[NavigationContext] Popstate event fired');

      // Use the captured note ID from BEFORE the URL changed
      // Call via service since callbacks are set there by NavigationBridge
      if (currentNoteIdBeforePopState) {
        const callback = (service as any).saveNoteCallback;
        if (callback) {
          console.log('[NavigationContext] Browser back/forward detected, saving note:', currentNoteIdBeforePopState);
          try {
            await callback(currentNoteIdBeforePopState);
          } catch (error) {
            console.error('[NavigationContext] Error saving note on popstate:', error);
          }
        } else {
          console.log('[NavigationContext] No save callback registered');
        }
      } else {
        console.log('[NavigationContext] No note to save on popstate');
      }

      // Clear for next popstate
      currentNoteIdBeforePopState = null;
    };

    // Capture current note whenever it changes
    const unsubscribe = service.subscribe(() => {
      captureCurrentNote();
    });

    // Also capture on mount
    captureCurrentNote();

    // Listen for popstate
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      unsubscribe();
    };
  }, [service, onSaveNote]);

  // Subscribe to navigation state changes
  const [state, setState] = useState<NavigationState>(() => service.getState());

  // Subscribe to service state changes
  // The subscription handles state updates from programmatic navigation
  useEffect(() => {
    const unsubscribe = service.subscribe((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, [service]);

  // Also update state when URL changes from browser back/forward
  // This handles cases where the URL changes via browser navigation, not programmatic
  useEffect(() => {
    const newState = service.getState();
    setState(prevState => {
      // Only update if noteId or searchQuery actually changed
      if (prevState.currentNoteId !== newState.currentNoteId ||
          prevState.searchQuery !== newState.searchQuery) {
        console.log('[NavigationContext] URL changed via browser navigation, updating state');
        return newState;
      }
      return prevState;
    });
  }, [service, searchParams]);

  // Watch URL changes and fetch notes when needed
  const prevNoteIdRef = useRef<string | null>(null);

  useEffect(() => {
    const currentNoteId = state.currentNoteId;

    console.log('[NavigationContext URL Watcher] Effect fired. currentNoteId:', currentNoteId, 'prevNoteId:', prevNoteIdRef.current);

    // If note changed in URL, fetch it
    // Call via service since callbacks are set there by NavigationBridge
    if (currentNoteId && currentNoteId !== prevNoteIdRef.current) {
      console.log('[NavigationContext] URL changed, fetching note:', currentNoteId);
      const callback = (service as any).fetchNoteCallback;
      if (callback) {
        callback(currentNoteId);
      }
      prevNoteIdRef.current = currentNoteId;
    } else if (!currentNoteId && prevNoteIdRef.current) {
      // Note was cleared from URL
      console.log('[NavigationContext] URL cleared, closing note');
      const callback = (service as any).closeNoteCallback;
      if (callback) {
        // Skip flushSync since we're already inside a React effect
        callback({ skipFlushSync: true });
      }
      prevNoteIdRef.current = null;
    } else {
      console.log('[NavigationContext URL Watcher] No action needed');
    }
  }, [state.currentNoteId, service]);

  // Watch search query changes and trigger search
  const prevSearchQueryRef = useRef<string | null>(null);

  useEffect(() => {
    const currentSearchQuery = state.searchQuery;

    console.log('[NavigationContext Search Watcher] Effect fired. searchQuery:', currentSearchQuery, 'prevSearchQuery:', prevSearchQueryRef.current);

    // If search query changed, trigger search
    // Call via service since callbacks are set there by NavigationBridge
    if (currentSearchQuery && currentSearchQuery !== prevSearchQueryRef.current) {
      console.log('[NavigationContext] Search query changed, triggering search:', currentSearchQuery);
      // Access the callback directly from service (it's set via service.onSearch())
      const callback = (service as any).searchCallback;
      if (callback) {
        callback(currentSearchQuery);
      }
      prevSearchQueryRef.current = currentSearchQuery;
    } else if (!currentSearchQuery && prevSearchQueryRef.current) {
      // Search was cleared
      console.log('[NavigationContext] Search cleared');
      const callback = (service as any).clearSearchCallback;
      if (callback) {
        callback();
      }
      prevSearchQueryRef.current = null;
    } else {
      console.log('[NavigationContext Search Watcher] No action needed');
    }
  }, [state.searchQuery, service]);

  // Wrap all service methods to maintain stable references
  const openNote = useCallback(
    (noteId: string, context: NavContext, options?: NavigationOptions) => {
      return service.openNote(noteId, context, options);
    },
    [service]
  );

  const openReferencedNote = useCallback(
    (noteId: string, scrollPosition: number, options?: NavigationOptions) => {
      return service.openReferencedNote(noteId, scrollPosition, options);
    },
    [service]
  );

  const closeNote = useCallback(
    (trigger: CloseTrigger, options?: NavigationOptions) => {
      return service.closeNote(trigger, options);
    },
    [service]
  );

  const closeAllNotes = useCallback(
    (options?: NavigationOptions) => {
      return service.closeAllNotes(options);
    },
    [service]
  );

  const navigateToSearch = useCallback(
    (query: string, options?: NavigationOptions) => {
      service.navigateToSearch(query, options);
    },
    [service]
  );

  const clearSearch = useCallback(() => {
    service.clearSearch();
  }, [service]);

  const updateScrollPosition = useCallback(
    (position: number) => {
      service.updateScrollPosition(position);
    },
    [service]
  );

  const getScrollPosition = useCallback(
    (noteId: string) => {
      return service.getScrollPosition(noteId);
    },
    [service]
  );

  const getCurrentScrollPosition = useCallback(() => {
    return service.getCurrentScrollPosition();
  }, [service]);

  const setViewType = useCallback(
    (viewType: ViewType) => {
      service.setViewType(viewType);
    },
    [service]
  );

  const changeView = useCallback(
    (view: 'main' | 'archive' | 'trash') => {
      service.changeView(view);
    },
    [service]
  );

  const searchById = useCallback(
    (noteId: string, options?: NavigationOptions) => {
      service.searchById(noteId, options);
    },
    [service]
  );

  const searchByTag = useCallback(
    (tagName: string, options?: NavigationOptions) => {
      service.searchByTag(tagName, options);
    },
    [service]
  );

  const searchByColor = useCallback(
    (colorName: string, options?: NavigationOptions) => {
      service.searchByColor(colorName, options);
    },
    [service]
  );

  const searchByBook = useCallback(
    (bookTitle: string, options?: NavigationOptions) => {
      service.searchByBook(bookTitle, options);
    },
    [service]
  );

  const value: NavigationContextValue = {
    state,
    openNote,
    openReferencedNote,
    closeNote,
    closeAllNotes,
    navigateToSearch,
    clearSearch,
    updateScrollPosition,
    getScrollPosition,
    getCurrentScrollPosition,
    changeView,
    searchById,
    searchByTag,
    searchByColor,
    searchByBook,
    setViewType,
    service,
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

/**
 * Hook to access navigation context
 *
 * @throws Error if used outside NavigationProvider
 */
export function useNavigationContext(): NavigationContextValue {
  const context = useContext(NavigationContext);

  if (!context) {
    throw new Error('useNavigationContext must be used within NavigationProvider');
  }

  return context;
}
