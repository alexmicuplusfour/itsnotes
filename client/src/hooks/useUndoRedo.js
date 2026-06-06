import { useState, useCallback, useMemo } from 'react';

const useUndoRedo = (initialState) => {
  const [history, setHistory] = useState([initialState]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentState = useMemo(() => history[currentIndex], [history, currentIndex]);

  const setState = useCallback((newState) => {
    // If the new state is the same as the current state, do nothing
    if (newState === currentState) {
      return;
    }

    // If we are not at the end of the history (i.e., we've undone),
    // slice the history up to the current index before adding the new state.
    const newHistory = history.slice(0, currentIndex + 1);
    setHistory([...newHistory, newState]);
    setCurrentIndex(newHistory.length);
  }, [history, currentIndex, currentState]);

  const undo = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  const redo = useCallback(() => {
    if (currentIndex < history.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, history.length]);

  const canUndo = useMemo(() => currentIndex > 0, [currentIndex]);
  const canRedo = useMemo(() => currentIndex < history.length - 1, [currentIndex, history.length]);

  // Function to reset the history with a new initial state
  const resetState = useCallback((newInitialState) => {
    setHistory([newInitialState]);
    setCurrentIndex(0);
  }, []);


  return {
    currentState,
    setState,
    undo,
    redo,
    canUndo,
    canRedo,
    resetState, // Expose resetState
  };
};

export default useUndoRedo;
