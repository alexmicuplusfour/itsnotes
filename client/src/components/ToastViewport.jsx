import React, { useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import styled from 'styled-components';

// When a toast is dismissed early, the progress bar races to empty over this
// many ms instead of the toast vanishing instantly.
const DISMISS_MS = 800;

// Exit fade duration. Exported so the provider can drop the toast from state
// only after the fade has played. Keep in sync with the CSS below.
export const EXIT_MS = 220;

// Past this horizontal drag (px) a swipe dismisses the toast; otherwise snaps back.
const SWIPE_THRESHOLD = 80;

// Maps a `variant` to a background color. Explicit `bgColor` overrides this.
const VARIANT_BG = {
  warning: 'var(--warning-toast-bg)',
  error: '#c0392b',
  success: null, // default foreground color
};

const Viewport = styled.div`
  position: fixed;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1200;
  display: flex;
  flex-direction: column-reverse; /* newest at the bottom, older stack above */
  align-items: center;
  gap: 8px;
  pointer-events: none; /* let page clicks through; items re-enable for buttons */
  max-width: 100%;

  /* On mobile the stack spans the full width (with side padding) and items
     stretch edge-to-edge instead of shrink-wrapping to their content. */
  @media (max-width: 600px) {
    left: 20px;
    right: 20px;
    transform: none;
    align-items: stretch;
  }
`;

const ToastContainer = styled.div`
  position: relative;
  overflow: hidden;
  background-color: ${props => props.$bgColor || 'var(--foreground-color)'};
  color: ${props => props.$bgColor ? 'var(--text-color)' : 'var(--text-color-contrast)'};
  padding: 10px 16px;
  border-radius: 4px;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  pointer-events: auto;
  animation: toastFadeIn 0.3s ease-out;
  box-shadow: 0 2px 40px rgba(0, 0, 0, 0.3);
  touch-action: pan-y; /* horizontal drags are ours (swipe-to-dismiss), vertical still scrolls */
  opacity: ${props => (props.$exiting ? 0 : 1)};
  transition: opacity 220ms ease; /* exit fade — keep in sync with EXIT_MS */

  @media (max-width: 600px) {
    display: flex;
    width: 100%;
  }

  @keyframes toastFadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

// Holds the message text; truncates with an ellipsis when it can't fit
// (notably on mobile where the toast is full-width).
const ToastMessage = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
`;

// Action button (Undo, Cancel, …) — a small pill on the right edge.
const ActionButton = styled.button`
  flex-shrink: 0;
  background: rgba(128, 128, 128, 0.25);
  border: none;
  color: var(--text-color-contrast);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 4px;
  margin-left: 12px;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(128, 128, 128, 0.5);
  }
`;

// Loading spinner shown on `loading` toasts (e.g. content extraction in flight).
const Spinner = styled.span`
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(128, 128, 128, 0.35);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: toastSpin 0.8s linear infinite;

  @keyframes toastSpin {
    to { transform: rotate(360deg); }
  }
`;

// Drains left-to-right over the toast's lifetime to show remaining time.
const ProgressBar = styled.div`
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  width: 100%;
  transform-origin: left;
  background: rgba(128, 128, 128, 0.5);
  animation: toastShrink ${props => props.$duration}ms linear forwards;

  @keyframes toastShrink {
    from { transform: scaleX(1); }
    to { transform: scaleX(0); }
  }
`;

/**
 * A single toast. Owns its own auto-dismiss timer + click/scroll dismiss
 * (non-sticky), and reports back to the provider via onHide(id).
 *
 * The interaction listener is attached in an effect *after* this item mounts,
 * so the click that spawned the toast (already propagating) won't dismiss it —
 * this is what lets toasts safely stack when triggered by clicks.
 */
const ToastItem = ({ toast, onHide }) => {
  const { id, message, duration, action, loading, variant, bgColor, sticky, exiting } = toast;
  const resolvedBg = bgColor || (variant ? VARIANT_BG[variant] : null);

  const containerRef = useRef(null);
  const progressRef = useRef(null);
  const timerRef = useRef(null);
  const dismissingRef = useRef(false);
  const swipeRef = useRef(null); // active touch-drag state, or null

  // Early dismiss: freeze the progress bar at its current width, then race it to
  // empty over DISMISS_MS before removing the toast (instead of vanishing).
  const finishAndHide = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);

    const bar = progressRef.current;
    if (sticky || !bar) {
      onHide(id);
      return;
    }
    const current = getComputedStyle(bar).transform;
    bar.style.animation = 'none';
    bar.style.transform = current && current !== 'none' ? current : 'scaleX(0)';
    void bar.offsetWidth; // reflow so the next change animates as a transition
    bar.style.transition = `transform ${DISMISS_MS}ms linear`;
    bar.style.transform = 'scaleX(0)';
    setTimeout(() => onHide(id), DISMISS_MS);
  }, [id, sticky, onHide]);

  useEffect(() => {
    if (sticky) return undefined;
    // Natural expiry: the bar has already drained to empty, so just remove it.
    timerRef.current = setTimeout(() => onHide(id), duration);
    const onInteraction = () => finishAndHide();
    window.addEventListener('click', onInteraction);
    window.addEventListener('scroll', onInteraction, true);
    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener('click', onInteraction);
      window.removeEventListener('scroll', onInteraction, true);
    };
  }, [id, duration, sticky, onHide, finishAndHide]);

  const handleActionClick = (e) => {
    e.stopPropagation();
    action.onClick();
    finishAndHide();
  };

  // --- Swipe to dismiss (touch). Drags the toast horizontally; past the
  // threshold it flings off-screen and dismisses, otherwise it snaps back. We
  // drive the transform directly on the node (no re-renders mid-drag). `touch-
  // action: pan-y` keeps vertical scrolling intact. ---
  const handleTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    swipeRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, dx: 0, active: false };
  };

  const handleTouchMove = (e) => {
    const s = swipeRef.current;
    const el = containerRef.current;
    if (!s || !el) return;
    const dx = e.touches[0].clientX - s.startX;
    const dy = e.touches[0].clientY - s.startY;
    if (!s.active) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { swipeRef.current = null; return; } // vertical → scroll
      if (Math.abs(dx) < 8) return;
      s.active = true;
    }
    s.dx = dx;
    el.style.transition = 'none';
    el.style.transform = `translateX(${dx}px)`;
    el.style.opacity = String(Math.max(1 - Math.abs(dx) / 250, 0.2));
  };

  const handleTouchEnd = () => {
    const s = swipeRef.current;
    swipeRef.current = null;
    const el = containerRef.current;
    if (!s || !s.active || !el) return;
    el.style.transition = `transform ${EXIT_MS}ms ease, opacity ${EXIT_MS}ms ease`;
    if (Math.abs(s.dx) > SWIPE_THRESHOLD) {
      const off = (s.dx > 0 ? 1 : -1) * (window.innerWidth || 400);
      el.style.transform = `translateX(${off}px)`;
      el.style.opacity = '0';
      if (timerRef.current) clearTimeout(timerRef.current);
      dismissingRef.current = true;
      onHide(id);
    } else {
      el.style.transform = 'translateX(0)';
      el.style.opacity = '';
    }
  };

  return (
    <ToastContainer
      ref={containerRef}
      data-toast-id={id}
      $bgColor={resolvedBg}
      $exiting={exiting}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {loading && <Spinner />}
      <ToastMessage>{message}</ToastMessage>
      {action && <ActionButton onClick={handleActionClick}>{action.label}</ActionButton>}
      {!sticky && <ProgressBar ref={progressRef} $duration={duration} />}
    </ToastContainer>
  );
};

// How long the survivors take to slide into their new positions on removal.
const REFLOW_MS = 250;

/**
 * Renders the stack of active toasts. Owned exclusively by ToastProvider.
 *
 * Uses a FLIP pass so that when a toast is removed, the remaining ones slide
 * smoothly into their new positions instead of snapping.
 */
const ToastViewport = ({ toasts, onHide }) => {
  const containerRef = useRef(null);
  const prevRectsRef = useRef(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    const prev = prevRectsRef.current;
    const next = new Map();

    if (container) {
      container.querySelectorAll('[data-toast-id]').forEach((el) => {
        const tid = el.getAttribute('data-toast-id');
        const rect = el.getBoundingClientRect();
        next.set(tid, rect.top);

        const oldTop = prev.get(tid);
        // Only animate items that existed before and actually moved (a brand-new
        // toast has no previous position and keeps its own entry animation).
        if (oldTop !== undefined && oldTop !== rect.top) {
          el.style.transition = 'none';
          el.style.transform = `translateY(${oldTop - rect.top}px)`;
          void el.offsetHeight; // reflow so the next change transitions
          requestAnimationFrame(() => {
            // Include opacity so this lingering inline transition doesn't clobber
            // the exit fade if this same toast is dismissed later.
            el.style.transition = `transform ${REFLOW_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${EXIT_MS}ms ease`;
            el.style.transform = '';
          });
        }
      });
    }

    prevRectsRef.current = next;
  });

  if (!toasts.length) return null;

  return (
    <Viewport ref={containerRef}>
      {toasts.map(toast => (
        toast.message ? <ToastItem key={toast.id} toast={toast} onHide={onHide} /> : null
      ))}
    </Viewport>
  );
};

export default ToastViewport;
