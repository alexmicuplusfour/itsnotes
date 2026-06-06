import React, { createContext, useContext, useState, useCallback } from 'react';
import SuccessToast from '../components/SuccessToast';

// Context for showing toasts from anywhere in the app
const ToastContext = createContext(null);

/**
 * Hook to show toast notifications
 * @returns {{ showToast: (message: string, duration?: number) => void }}
 */
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    // Return a no-op if not within provider (graceful fallback)
    return { showToast: () => console.warn('[Toast] ToastProvider not found') };
  }
  return context;
};

/**
 * Provider component for global toast notifications
 */
export const ToastProvider = ({ children }) => {
  const [toastState, setToastState] = useState({
    message: '',
    isVisible: false,
    duration: 3000,
  });

  const showToast = useCallback((message, duration = 3000) => {
    setToastState({
      message,
      isVisible: true,
      duration,
    });
  }, []);

  const hideToast = useCallback(() => {
    setToastState(prev => ({ ...prev, isVisible: false }));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <SuccessToast
        message={toastState.message}
        isVisible={toastState.isVisible}
        onHide={hideToast}
        duration={toastState.duration}
      />
    </ToastContext.Provider>
  );
};

export default ToastContext;
