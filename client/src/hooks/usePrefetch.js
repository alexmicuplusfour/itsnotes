import { useState, useCallback, useRef, useEffect } from 'react';
import api from '../services/api';

/**
 * Custom hook for prefetching and caching full note content
 * Implements LRU cache eviction and batch prefetching with configurable delays
 */
export const usePrefetch = (cacheSettings) => {
  // Refs to avoid recreating callbacks when settings change
  const cacheSettingsRef = useRef(cacheSettings);
  useEffect(() => {
    cacheSettingsRef.current = cacheSettings;
  }, [cacheSettings]);

  // Cache state - using ref to avoid re-renders on cache updates
  const fullNotesCacheRef = useRef({});

  // Prefetch queue state
  const [isPrefetching, setIsPrefetching] = useState(false);
  const [prefetchQueue, setPrefetchQueue] = useState([]);
  const prefetchTimerRef = useRef(null);
  const prefetchAbortControllerRef = useRef(null);
  const currentBatchIndexRef = useRef(0);
  const lastPrefetchedPageRef = useRef(0);

  // Add note to cache with LRU eviction
  const addToCache = useCallback((noteId, noteData) => {
    const cache = fullNotesCacheRef.current;

    // Add new note with access timestamp
    cache[noteId] = {
      ...noteData,
      cachedAt: Date.now(),
      lastAccessed: Date.now()
    };

    console.log(`[CACHE] Added note ${noteId} to cache. Cache size: ${Object.keys(cache).length}`);

    // Check if cache exceeds limit
    const cacheSize = Object.keys(cache).length;
    if (cacheSize > cacheSettingsRef.current.CACHE_MAX_SIZE) {
      console.log(`[CACHE] Cache size ${cacheSize} exceeds limit ${cacheSettingsRef.current.CACHE_MAX_SIZE}, evicting oldest entries`);

      // Find least recently accessed entries
      const entries = Object.entries(cache);
      entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

      // Remove oldest entries to bring cache back under limit
      const toRemove = entries.slice(0, cacheSize - cacheSettingsRef.current.CACHE_MAX_SIZE);
      toRemove.forEach(([id]) => {
        console.log(`[CACHE] Evicting note ${id} (LRU - last accessed: ${new Date(cache[id].lastAccessed).toLocaleTimeString()})`);
        delete cache[id];
      });
    }
  }, []);

  // Update lastAccessed timestamp for cache entry
  const touchCacheEntry = useCallback((noteId) => {
    const cache = fullNotesCacheRef.current;
    if (cache[noteId]) {
      cache[noteId].lastAccessed = Date.now();
    }
  }, []);

  // Remove note from cache
  const removeFromCache = useCallback((noteId) => {
    const cache = fullNotesCacheRef.current;
    if (cache[noteId]) {
      delete cache[noteId];
    }
  }, []);

  // Get cached note
  const getCachedNote = useCallback((noteId) => {
    return fullNotesCacheRef.current[noteId];
  }, []);

  // Check if cache is valid (not expired)
  const isCacheValid = useCallback((cachedNote) => {
    return cachedNote && (Date.now() - cachedNote.cachedAt) < cacheSettingsRef.current.CACHE_TTL_MS;
  }, []);

  // Prefetch a single note and add to cache
  const prefetchNoteToCache = useCallback(async (noteId) => {
    // Skip if already in cache and valid
    const cachedNote = fullNotesCacheRef.current[noteId];
    const isValid = cachedNote && (Date.now() - cachedNote.cachedAt) < cacheSettingsRef.current.CACHE_TTL_MS;

    if (isValid) {
      console.log(`[PREFETCH] Note ${noteId} already cached and valid, skipping`);
      return;
    }

    try {
      // Fetch full note content
      const response = await api.get(`/notes/${noteId}`);
      // GET /notes/:id returns note directly, not wrapped in { note: ... }
      const fetchedNote = response.data;

      if (fetchedNote && fetchedNote.id) {
        console.log(`[PREFETCH] Successfully cached note ${noteId}`);
        addToCache(noteId, fetchedNote);
      } else {
        console.log(`[PREFETCH] Invalid note data received for ${noteId}`);
      }
    } catch (error) {
      // Silently fail - prefetching is non-critical
      console.log(`[PREFETCH] Failed to fetch note ${noteId}:`, error.message);
    }
  }, [addToCache]);

  // Process a batch of notes from the queue
  const processPrefetchBatch = useCallback(async (queue, startIdx) => {
    if (startIdx >= queue.length) {
      console.log(`[PREFETCH] Queue complete. Processed ${queue.length} notes.`);
      setIsPrefetching(false);
      currentBatchIndexRef.current = 0;
      return;
    }

    const batch = queue.slice(startIdx, startIdx + cacheSettingsRef.current.PREFETCH_BATCH_SIZE);
    console.log(`[PREFETCH] Processing batch ${Math.floor(startIdx / cacheSettingsRef.current.PREFETCH_BATCH_SIZE) + 1}: notes ${startIdx + 1}-${startIdx + batch.length}`);

    setIsPrefetching(true);

    // Fetch batch in parallel
    await Promise.allSettled(
      batch.map(id => prefetchNoteToCache(id))
    );

    // Update current index
    currentBatchIndexRef.current = startIdx + cacheSettingsRef.current.PREFETCH_BATCH_SIZE;

    // Schedule next batch with delay (don't overwhelm server)
    setTimeout(() => {
      processPrefetchBatch(queue, startIdx + cacheSettingsRef.current.PREFETCH_BATCH_SIZE);
    }, cacheSettingsRef.current.BATCH_DELAY_MS);
  }, [prefetchNoteToCache]);

  // Start prefetching notes from the queue
  const startPrefetchQueue = useCallback((noteIds) => {
    // Cancel any existing prefetch operation
    if (prefetchAbortControllerRef.current) {
      console.log('[PREFETCH] Aborting previous prefetch queue');
      clearTimeout(prefetchAbortControllerRef.current);
    }

    // Filter out notes that are already cached and valid
    const notesToPrefetch = noteIds.filter(id => {
      const cachedNote = fullNotesCacheRef.current[id];
      const isValid = cachedNote && (Date.now() - cachedNote.cachedAt) < cacheSettingsRef.current.CACHE_TTL_MS;
      return !isValid;
    });

    if (notesToPrefetch.length === 0) {
      console.log('[PREFETCH] All notes already cached, skipping prefetch');
      return;
    }

    console.log(`[PREFETCH] Starting queue with ${notesToPrefetch.length} notes (batch size: ${cacheSettingsRef.current.PREFETCH_BATCH_SIZE}, delay: ${cacheSettingsRef.current.BATCH_DELAY_MS}ms)`);

    // Update queue state
    setPrefetchQueue(notesToPrefetch);
    currentBatchIndexRef.current = 0;

    // Start processing first batch
    processPrefetchBatch(notesToPrefetch, 0);
  }, [processPrefetchBatch]);

  // Cancel prefetch operation
  const cancelPrefetch = useCallback(() => {
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
    setIsPrefetching(false);
    currentBatchIndexRef.current = 0;
  }, []);

  // Reset prefetch state
  const resetPrefetch = useCallback(() => {
    lastPrefetchedPageRef.current = 0;
    cancelPrefetch();
  }, [cancelPrefetch]);

  return {
    // Cache operations
    addToCache,
    touchCacheEntry,
    removeFromCache,
    getCachedNote,
    isCacheValid,

    // Prefetch operations
    startPrefetchQueue,
    cancelPrefetch,
    resetPrefetch,

    // State
    isPrefetching,
    prefetchQueue,
    lastPrefetchedPageRef,

    // Direct cache access (for migration)
    fullNotesCacheRef
  };
};
