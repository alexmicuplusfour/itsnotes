import React, { createContext, useState, useContext, useMemo } from 'react';

const TypingContext = createContext();

export const useTyping = () => {
  const context = useContext(TypingContext);
  if (!context) {
    throw new Error('useTyping must be used within a TypingProvider');
  }
  return context;
};

export const TypingProvider = ({ children }) => {
  const [isTyping, setIsTyping] = useState(false);

  // useMemo to prevent unnecessary re-renders of consumers
  // when the provider itself re-renders but the context value hasn't changed.
  const value = useMemo(() => ({ isTyping, setIsTyping }), [isTyping]);

  return (
    <TypingContext.Provider value={value}>
      {children}
    </TypingContext.Provider>
  );
};
