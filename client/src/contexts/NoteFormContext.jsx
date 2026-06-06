import React, { createContext, useContext } from 'react';

// Context for passing note-specific data to nested components like ObjectCard
const NoteFormContext = createContext(null);

/**
 * Hook to access the NoteForm context
 * Returns null if not within a NoteFormProvider (e.g., in NoteCard)
 */
export const useNoteFormContext = () => {
  return useContext(NoteFormContext);
};

/**
 * Provider component for NoteForm context
 * Provides noteId and callbacks for auto-tagging features
 */
export const NoteFormProvider = ({ 
  children, 
  noteId, 
  onAddSuggestedTag,
  onApplyTag,
}) => {
  const value = {
    noteId,
    onAddSuggestedTag, // (tagId) => void - adds tag to suggested tags list
    onApplyTag, // (tagId) => void - directly applies tag to note
  };

  return (
    <NoteFormContext.Provider value={value}>
      {children}
    </NoteFormContext.Provider>
  );
};

export default NoteFormContext;
