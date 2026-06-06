// Debug script to monitor NoteForm re-renders
// Add this to NotesContext.jsx after line 2321:

/*
  useEffect(() => {
    openedNoteRef.current = openedNote;
    if (openedNote?.id) {
      console.log('[NotesContext DEBUG] openedNote changed:', {
        id: openedNote.id,
        hasContent: !!openedNote.content,
        isLoading: openedNote.isLoading,
        color: openedNote.color,
        tagsCount: openedNote.tags?.length
      });
      console.trace('[NotesContext DEBUG] Stack trace');
    }
  }, [openedNote]);
*/

// The issue is likely that openedNote is being recreated with a new object reference
// even when the actual data hasn't changed. This causes NoteForm to re-render
// because React.memo sees a different object reference.

// Possible causes:
// 1. Socket updates calling setOpenedNote with {...prev, ...} creating new object
// 2. Context value being recreated because openedNote is in useMemo dependencies
// 3. Parent component (App.jsx) re-rendering and passing new props

// Solution: Stabilize the openedNote reference by only creating a new object
// when actual data changes, not just on every setOpenedNote call.
