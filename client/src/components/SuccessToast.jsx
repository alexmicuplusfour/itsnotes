import React, { useEffect } from 'react';
import styled from 'styled-components';

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
  const { id, message, duration, action, loading, variant, bgColor, sticky } = toast;
  const resolvedBg = bgColor || (variant ? VARIANT_BG[variant] : null);

  useEffect(() => {
    if (sticky) return undefined;
    const dismiss = () => onHide(id);
    const timer = setTimeout(dismiss, duration);
    window.addEventListener('click', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [id, duration, sticky, onHide]);

  const handleActionClick = (e) => {
    e.stopPropagation();
    action.onClick();
    onHide(id);
  };

  return (
    <ToastContainer $bgColor={resolvedBg}>
      {loading && <Spinner />}
      <ToastMessage>{message}</ToastMessage>
      {action && <ActionButton onClick={handleActionClick}>{action.label}</ActionButton>}
      {!sticky && <ProgressBar $duration={duration} />}
    </ToastContainer>
  );
};

/**
 * Renders the stack of active toasts. Owned exclusively by ToastProvider.
 */
const ToastViewport = ({ toasts, onHide }) => {
  if (!toasts.length) return null;

  return (
    <Viewport>
      {toasts.map(toast => (
        toast.message ? <ToastItem key={toast.id} toast={toast} onHide={onHide} /> : null
      ))}
    </Viewport>
  );
};

export default ToastViewport;
