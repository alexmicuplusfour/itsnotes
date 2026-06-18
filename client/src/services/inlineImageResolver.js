import env from '../../env.js';

// Inline note-body images reference their note_images row by id (data-image-id)
// instead of inlining base64 into the note HTML. This resolver turns an image id
// into a usable object-URL, fetched once with auth and cached for the session.

// id -> resolved object URL (or primed data URL)
const urlCache = new Map();
// id -> in-flight Promise<string>, so concurrent renders share one fetch
const inFlight = new Map();

/**
 * Seed the cache with a URL we already hold (e.g. the base64 data URL returned
 * right after upload), so the first render resolves instantly with no network
 * round-trip and no flash — while the note body itself stays free of base64.
 */
export const primeInlineImageUrl = (imageId, url) => {
  if (imageId == null || !url) return;
  const key = String(imageId);
  if (!urlCache.has(key)) {
    urlCache.set(key, url);
  }
};

/**
 * Resolve an image id to a URL usable as an <img> src. Returns a cached value
 * synchronously via the resolved promise when available; otherwise fetches the
 * raw bytes with auth and creates an object URL.
 */
export const getInlineImageUrl = (imageId) => {
  if (imageId == null) return Promise.reject(new Error('No image id'));
  const key = String(imageId);

  if (urlCache.has(key)) {
    return Promise.resolve(urlCache.get(key));
  }
  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const promise = (async () => {
    const token = localStorage.getItem('authToken');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${env.SERVER_BASE_URL}/api/images/${key}/raw`, { headers });
    if (!response.ok) {
      throw new Error(`Failed to load image ${key}: ${response.status}`);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    urlCache.set(key, objectUrl);
    return objectUrl;
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
};

const isRealId = (id) =>
  id != null && id !== '' && !String(id).startsWith('temp-');

/**
 * Decide what a freshly-inserted inline image node should store. For an image
 * backed by a real note_images row we reference it by id and keep `src` empty so
 * the note body never carries base64; we prime the cache with the base64 we
 * already hold so the first render is instant. Temp images (not yet uploaded)
 * keep their base64 src as a fallback until they get a real id.
 *
 * @returns {{ src: string, imageId: (string|number|null) }}
 */
export const prepareInlineImageInsert = (imageData) => {
  const id = imageData.id;
  const base64 = imageData.data || imageData.thumbnail || imageData.src || '';

  if (isRealId(id)) {
    if (base64) primeInlineImageUrl(id, base64);
    return { src: '', imageId: id };
  }
  return { src: base64, imageId: id ?? null };
};

/**
 * Drop a cached entry (e.g. after an image is deleted) and revoke its object URL
 * so the blob can be garbage-collected.
 */
export const evictInlineImageUrl = (imageId) => {
  if (imageId == null) return;
  const key = String(imageId);
  const url = urlCache.get(key);
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
  urlCache.delete(key);
  inFlight.delete(key);
};
