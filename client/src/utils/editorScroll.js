// Manually scroll the editor's current selection into view inside a known
// scrollable container. Used after inserting block-atom nodes (image,
// attachment, AI placeholder) so the user can see what landed — without
// relying on .focus() (which would pop the mobile keyboard) or on
// ProseMirror's scrollIntoView() (which can fire before async React node
// views finish rendering and so reads stale DOM coords).
//
// Defers to requestAnimationFrame so React node views have a chance to
// render before we measure coords.

const SCROLL_MARGIN_PX = 100;

export function scrollEditorSelectionIntoView(editor, scrollableEl) {
  if (!editor || editor.isDestroyed || !scrollableEl) return;

  requestAnimationFrame(() => {
    if (editor.isDestroyed) return;
    try {
      const pos = editor.state.selection.to;
      const coords = editor.view.coordsAtPos(pos);
      const containerRect = scrollableEl.getBoundingClientRect();
      let delta = 0;
      if (coords.top < containerRect.top + SCROLL_MARGIN_PX) {
        delta = coords.top - containerRect.top - SCROLL_MARGIN_PX;
      } else if (coords.bottom > containerRect.bottom - SCROLL_MARGIN_PX) {
        delta = coords.bottom - containerRect.bottom + SCROLL_MARGIN_PX;
      }
      if (delta !== 0) {
        scrollableEl.scrollTop += delta;
      }
    } catch (err) {
      console.warn('[scrollEditorSelectionIntoView] failed', err);
    }
  });
}

// Walk up from the editor's DOM looking for the first ancestor that's
// actually scrollable. Useful for callers that don't have a direct
// reference to the scroll container (e.g. useAttachmentManager which
// only receives the editor).
export function findScrollableAncestor(startEl) {
  let cur = startEl?.parentElement;
  while (cur && cur !== document.body) {
    const style = getComputedStyle(cur);
    if (/(auto|scroll)/.test(style.overflowY)) return cur;
    cur = cur.parentElement;
  }
  return null;
}
