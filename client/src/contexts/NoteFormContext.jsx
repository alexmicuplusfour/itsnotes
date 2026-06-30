import React, { createContext, useContext } from 'react';

const NoteFormContext = createContext(null);

export const useNoteFormContext = () => useContext(NoteFormContext);

export const NoteFormProvider = ({
  children,
  noteId,
  onAddSuggestedTag,
  onApplyTag,
  onSketchSaved,
  registerSketchSave,
  hideActionsBar,
  showActionsBar,
}) => {
  const value = {
    noteId,
    onAddSuggestedTag,
    onApplyTag,
    onSketchSaved,       // (sketchId, thumbnail) => void
    registerSketchSave,  // (saveFn) => unregisterFn — called by edit-mode sketches
    hideActionsBar,      // () => void — same mechanism as scrolling hides the action bar
    showActionsBar,      // () => void
  };

  return (
    <NoteFormContext.Provider value={value}>
      {children}
    </NoteFormContext.Provider>
  );
};

export default NoteFormContext;
