import { useEffect } from 'react';
import { getInlineImageUrl } from '../services/inlineImageResolver';

/**
 * Resolves inline note-body images that reference a note_images row by
 * `data-image-id` instead of carrying base64 in their `src`. Used on read-only
 * surfaces that render note HTML via dangerouslySetInnerHTML, where there's no
 * nodeView to set the source in JS.
 *
 * @param {React.RefObject<HTMLElement>} containerRef - element holding the rendered HTML
 * @param {Array} deps - re-run when the rendered content changes (e.g. [note.content])
 */
export const useInlineImageResolution = (containerRef, deps = []) => {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Only images that still need a source: a data-image-id but no usable src.
    const imgs = container.querySelectorAll('img[data-image-id]');
    let cancelled = false;

    imgs.forEach((img) => {
      const current = img.getAttribute('src');
      if (current) return; // legacy inline base64 / already resolved
      const id = img.getAttribute('data-image-id');
      if (!id) return;
      getInlineImageUrl(id)
        .then((url) => { if (!cancelled) img.src = url; })
        .catch((err) => console.error('[inlineImage] resolve failed:', err.message));
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
};
