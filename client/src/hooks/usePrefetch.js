import { useCallback, useRef, useEffect } from 'react';
import api from '../services/api';

/**
 * Custom hook for prefetching and caching full note content.
 * Caching is LRU-bounded; prefetching is on-demand (viewport-triggered) with
 * a concurrency limit so a burst of intersections can't flood the server.
 */
export const usePrefetch = (cacheSettings) => {
  // Refs to avoid recreating callbacks when settings change
  const cacheSettingsRef = useRef(cacheSettings);
  useEffect(() => {
    cacheSettingsRef.current = cacheSettings;
  }, [cacheSettings]);

  // Cache state - using ref to avoid re-renders on cache updates
  const fullNotesCacheRef = useRef({});

  // Per-note cache-status subscribers (Map<noteId, Set<callback>>) — drives
  // the cached/uncached UI indicator on note cards via useSyncExternalStore.
  // Only cards whose own status flips re-render.
  const cacheStatusSubscribersRef = useRef(new Map());

  const notifyCacheStatus = (noteId) => {
    const subs = cacheStatusSubscribersRef.current.get(noteId);
    if (subs) subs.forEach(cb => cb());
  };

  // Add note to cache with LRU eviction
  const addToCache = useCallback((noteId, noteData) => {
    const cache = fullNotesCacheRef.current;
    const wasCached = !!cache[noteId];

    // Add new note with access timestamp
    cache[noteId] = {
      ...noteData,
      cachedAt: Date.now(),
      lastAccessed: Date.now()
    };

    console.log(`[CACHE] Added note ${noteId} to cache. Cache size: ${Object.keys(cache).length}`);

    if (!wasCached) {
      notifyCacheStatus(noteId);
    }

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
        notifyCacheStatus(id);
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
      notifyCacheStatus(noteId);
    }
  }, []);

  // Per-note subscription used by NoteCard via useSyncExternalStore
  const subscribeToCacheStatus = useCallback((noteId, callback) => {
    let subs = cacheStatusSubscribersRef.current.get(noteId);
    if (!subs) {
      subs = new Set();
      cacheStatusSubscribersRef.current.set(noteId, subs);
    }
    subs.add(callback);
    return () => {
      subs.delete(callback);
      if (subs.size === 0) {
        cacheStatusSubscribersRef.current.delete(noteId);
      }
    };
  }, []);

  // Synchronous snapshot — true if the note is in cache (TTL is checked at
  // open time, not for the indicator).
  const getNoteCacheStatus = useCallback((noteId) => {
    return !!fullNotesCacheRef.current[noteId];
  }, []);

  // Get cached note
  const getCachedNote = useCallback((noteId) => {
    return fullNotesCacheRef.current[noteId];
  }, []);

  // Check if cache is valid (not expired)
  const isCacheValid = useCallback((cachedNote) => {
    return cachedNote && (Date.now() - cachedNote.cachedAt) < cacheSettingsRef.current.CACHE_TTL_MS;
  }, []);

  // Concurrency throttle so a burst of intersecting cards can't fire dozens of
  // parallel requests. Max in-flight = PREFETCH_BATCH_SIZE; extras queue here.
  const inFlightFetchesRef = useRef(new Set());
  const inFlightCountRef = useRef(0);
  const pendingQueueRef = useRef([]);
  const pendingSetRef = useRef(new Set());

  const doFetch = async (noteId) => {
    inFlightFetchesRef.current.add(noteId);
    inFlightCountRef.current += 1;

    try {
      // Fetch full note content with tags/images/objects so the NoteForm can
      // render the tag row on first paint without a follow-up /tags request.
      const response = await api.get(`/notes/${noteId}`, { params: { includeDetails: true } });
      const fetchedNote = response.data;
      if (fetchedNote && fetchedNote.id) {
        addToCache(noteId, fetchedNote);
      }
    } catch (error) {
      console.log(`[PREFETCH] Failed to fetch note ${noteId}:`, error.message);
    } finally {
      inFlightFetchesRef.current.delete(noteId);
      inFlightCountRef.current -= 1;
      pumpPending();
    }
  };

  const pumpPending = () => {
    const max = cacheSettingsRef.current.PREFETCH_BATCH_SIZE;
    while (
      pendingQueueRef.current.length > 0 &&
      inFlightCountRef.current < max
    ) {
      const nextId = pendingQueueRef.current.shift();
      pendingSetRef.current.delete(nextId);
      // Skip if it landed in cache between enqueue and dequeue
      const c = fullNotesCacheRef.current[nextId];
      const valid = c && (Date.now() - c.cachedAt) < cacheSettingsRef.current.CACHE_TTL_MS;
      if (valid) continue;
      doFetch(nextId);
    }
  };

  // Prefetch a single note and add to cache. Throttled by concurrency limit;
  // safe to call many times in quick succession (dedupes in-flight + pending).
  const prefetchNoteToCache = useCallback((noteId) => {
    if (inFlightFetchesRef.current.has(noteId)) return;
    if (pendingSetRef.current.has(noteId)) return;

    const cachedNote = fullNotesCacheRef.current[noteId];
    const isValid = cachedNote && (Date.now() - cachedNote.cachedAt) < cacheSettingsRef.current.CACHE_TTL_MS;
    if (isValid) return;

    if (inFlightCountRef.current < cacheSettingsRef.current.PREFETCH_BATCH_SIZE) {
      doFetch(noteId);
    } else {
      pendingQueueRef.current.push(noteId);
      pendingSetRef.current.add(noteId);
    }
  }, [addToCache]);

  // Cancel any queued (not-yet-started) prefetches. In-flight fetches finish
  // normally; they're cheap and likely useful.
  const cancelPendingPrefetches = useCallback(() => {
    pendingQueueRef.current = [];
    pendingSetRef.current.clear();
  }, []);

  // Reconcile the cache against a freshly-fetched note list. For any cached
  // full-content entry whose server updated_at is newer than the cached copy,
  // re-fetch fresh content into the cache so the note stays warm.
  // This is the safety net for updates we missed while the socket was down
  // (e.g. phone backgrounded): the reconnect resync carries fresh updated_at,
  // so we use it to refresh stale content proactively rather than evict it and
  // pay a fetch on open.
  const reconcileCacheWithList = useCallback((notesList) => {
    if (!Array.isArray(notesList)) return;
    const cache = fullNotesCacheRef.current;
    notesList.forEach((listNote) => {
      if (!listNote || !listNote.id) return;
      const cached = cache[listNote.id];
      if (!cached) return;
      const serverTime = new Date(listNote.updated_at).getTime();
      const cachedTime = new Date(cached.updated_at).getTime();
      // Refresh if either timestamp is unparseable or the server copy is newer.
      if (Number.isNaN(serverTime) || Number.isNaN(cachedTime) || serverTime > cachedTime) {
        console.log(`[CACHE] Reconcile re-fetching stale note ${listNote.id} (server updated_at newer than cached)`);
        // Drop the stale entry first so prefetchNoteToCache doesn't short-circuit
        // on the still-TTL-valid copy, then re-fetch fresh full content.
        removeFromCache(listNote.id);
        prefetchNoteToCache(listNote.id);
      }
    });
  }, [removeFromCache, prefetchNoteToCache]);

  // Stable getter for the per-card viewport-prefetch debounce (reuses the
  // BATCH_DELAY_MS setting — how long a card must stay in view before fetching).
  const getViewportPrefetchDelay = useCallback(
    () => cacheSettingsRef.current.BATCH_DELAY_MS,
    []
  );

  return {
    // Cache operations
    addToCache,
    touchCacheEntry,
    removeFromCache,
    getCachedNote,
    isCacheValid,

    // Per-note cache-status subscription for UI indicators
    subscribeToCacheStatus,
    getNoteCacheStatus,

    // Prefetch operations
    prefetchNoteToCache,
    cancelPendingPrefetches,
    reconcileCacheWithList,
    getViewportPrefetchDelay,

    // Direct cache access (for migration)
    fullNotesCacheRef
  };
};
