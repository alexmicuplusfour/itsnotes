import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import ToastViewport, { EXIT_MS } from '../components/ToastViewport';

// Context for showing toasts from anywhere in the app
const ToastContext = createContext(null);

/**
 * Predefined toast durations (ms). Pass one of these keys as `duration` so
 * intent is explicit at the call site — some actions need more visibility.
 */
export const TOAST_DURATION = {
  short: 2000,   // quick confirmations ("Copied")
  medium: 3500,  // default — most actions
  long: 6000,    // needs visibility — undo toasts, errors
};

const DEFAULT_DURATION = TOAST_DURATION.medium;

// Resolve a `duration` option (preset key, raw number, or undefined) to ms.
const resolveDuration = (duration) => {
  if (typeof duration === 'number' && !Number.isNaN(duration)) return duration;
  if (typeof duration === 'string' && duration in TOAST_DURATION) return TOAST_DURATION[duration];
  return DEFAULT_DURATION;
};

/**
 * Hook to show toast notifications.
 * @returns {{ showToast: (message: string, opts?: object) => string, hideToast: (id: string) => void }}
 */
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    // Return no-ops if not within provider (graceful fallback)
    return {
      showToast: () => { console.warn('[Toast] ToastProvider not found'); return null; },
      hideToast: () => {},
    };
  }
  return context;
};

/**
 * Provider component for global, queue-based toast notifications.
 * Toasts stack vertically; each manages its own auto-dismiss + progress bar.
 */
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  // Pending "actually remove after the exit animation" timers, keyed by id.
  const removeTimersRef = useRef({});

  const removeNow = useCallback((id) => {
    delete removeTimersRef.current[id];
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Two-phase removal: flag the toast `exiting` (triggers the fade), then drop
  // it from state once the animation has played. Covers every dismissal path.
  const hideToast = useCallback((id) => {
    if (removeTimersRef.current[id]) return; // already exiting
    removeTimersRef.current[id] = setTimeout(() => removeNow(id), EXIT_MS);
    setToasts(prev => prev.map(t => (t.id === id ? { ...t, exiting: true } : t)));
  }, [removeNow]);

  /**
   * Show a toast.
   * @param {string} message
   * @param {object|number} [opts] - options object, or a raw number treated as duration.
   *   opts: {
   *     duration ('short'|'medium'|'long'|number), variant ('success'|'error'|'warning'),
   *     bgColor, sticky, id,
   *     onUndo,                       // shorthand: renders an "Undo" action button
   *     action: { label, onClick },   // generic action button (e.g. Cancel)
   *     loading,                      // show a spinner; implies sticky + no progress bar
   *   }
   * @returns {string} the toast id (use with hideToast for sticky toasts)
   */
  const showToast = useCallback((message, opts = {}) => {
    // Tolerate a bare number as the 2nd arg (legacy `showToast(msg, 3000)`)
    const o = typeof opts === 'number' ? { duration: opts } : (opts || {});
    const loading = !!o.loading;
    const sticky = !!o.sticky || loading; // a loading toast never auto-dismisses
    // onUndo is shorthand for an action button labelled "Undo".
    const action = o.onUndo ? { label: 'Undo', onClick: o.onUndo } : (o.action || null);
    const toast = {
      id: o.id || `toast-${++idRef.current}`,
      message,
      duration: sticky ? 0 : resolveDuration(o.duration),
      action,
      loading,
      variant: o.variant || null,
      bgColor: o.bgColor || null,
      sticky,
    };

    // Re-showing a toast that's mid-exit: cancel its pending removal so it stays.
    if (o.id && removeTimersRef.current[o.id]) {
      clearTimeout(removeTimersRef.current[o.id]);
      delete removeTimersRef.current[o.id];
    }

    setToasts(prev => {
      // If a caller supplies a stable id that's already present, update in
      // place (lets controlled toasts like "Reconnecting…" stay idempotent).
      if (o.id && prev.some(t => t.id === o.id)) {
        return prev.map(t => (t.id === o.id ? toast : t));
      }
      return [...prev, toast];
    });

    return toast.id;
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      <ToastViewport toasts={toasts} onHide={hideToast} />
    </ToastContext.Provider>
  );
};

export default ToastContext;
