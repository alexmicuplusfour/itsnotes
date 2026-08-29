import { useCallback, useEffect, useRef, useState } from 'react';

// How long after opening we ignore stray taps and scrolls. The long press that summons the
// strip is often followed by a click or a small settling scroll as the finger lifts, either
// of which would otherwise close it on the spot.
const SETTLE_MS = 400;

/**
 * Open/close state for a note's mobile long-press action strip.
 *
 * `containerRef` is the card or row the strip belongs to: a pointer landing outside it
 * dismisses. That also covers "another note opened its strip", since a long press elsewhere
 * necessarily starts with a pointerdown outside this one — no cross-item coordination needed.
 */
export const useMobileActionStrip = (containerRef) => {
  const [isOpen, setIsOpen] = useState(false);
  const openedAtRef = useRef(0);

  const isSettling = useCallback(() => Date.now() - openedAtRef.current < SETTLE_MS, []);

  const open = useCallback(() => {
    openedAtRef.current = Date.now();
    setIsOpen(true);
    if (navigator.vibrate) navigator.vibrate(50);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  // For the host's own tap handler: a tap on the note dismisses the strip instead of opening
  // the note. Returns whether it consumed the tap, so the host can just bail out. Taps inside
  // the settling window are consumed but ignored — that's the long press's own trailing click.
  const dismissOnTap = useCallback(() => {
    if (!isOpen) return false;
    if (!isSettling()) setIsOpen(false);
    return true;
  }, [isOpen, isSettling]);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsidePointer = (e) => {
      if (containerRef.current?.contains(e.target)) return;
      setIsOpen(false);
    };
    const handleScroll = () => {
      if (isSettling()) return;
      setIsOpen(false);
    };

    document.addEventListener('pointerdown', handleOutsidePointer, true);
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer, true);
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [isOpen, isSettling, containerRef]);

  return { isOpen, open, close, dismissOnTap };
};
