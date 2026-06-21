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
  // True while the in-note (find-in-page) search UI is showing its floating
  // controls on the right edge, so the starred note tabs can step aside.
  const [inNoteSearchActive, setInNoteSearchActive] = useState(false);

  // useMemo to prevent unnecessary re-renders of consumers
  // when the provider itself re-renders but the context value hasn't changed.
  const value = useMemo(
    () => ({ isTyping, setIsTyping, inNoteSearchActive, setInNoteSearchActive }),
    [isTyping, inNoteSearchActive]
  );

  return (
    <TypingContext.Provider value={value}>
      {children}
    </TypingContext.Provider>
  );
};
