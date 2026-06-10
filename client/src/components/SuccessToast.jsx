import React, { useEffect } from 'react';
import styled from 'styled-components';

const ToastContainer = styled.div`
  position: fixed;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  background-color: ${props => props.$bgColor || 'var(--foreground-color)'};
  color: ${props => props.$bgColor ? 'var(--text-color)' : 'var(--text-color-contrast)'};
  padding: 10px 16px;
  border-radius: 4px;
  z-index: 1200;
  font-size: 14px;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  animation: fadeIn 0.3s ease-out;
  box-shadow: 0 2px 40px rgba(0, 0, 0, 0.3);

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`;

const UndoButton = styled.button`
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

const SuccessToast = ({ message, isVisible, onHide, onUndo, duration = 3000, bgColor }) => {
  useEffect(() => {
    if (isVisible && onHide) {
      const timer = setTimeout(() => {
        onHide();
      }, duration);

      const handleInteraction = () => {
        onHide();
      };

      window.addEventListener('click', handleInteraction);
      window.addEventListener('scroll', handleInteraction, true);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('click', handleInteraction);
        window.removeEventListener('scroll', handleInteraction, true);
      };
    }
  }, [isVisible, onHide, duration]);

  if (!isVisible || !message) {
    return null;
  }

  const handleUndoClick = (e) => {
    e.stopPropagation();
    onUndo();
  };

  return (
    <ToastContainer $bgColor={bgColor}>
      {message}
      {onUndo && <UndoButton onClick={handleUndoClick}>Undo</UndoButton>}
    </ToastContainer>
  );
};

export default SuccessToast;
