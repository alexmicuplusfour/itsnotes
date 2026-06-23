import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { tagsApi } from '../services/api';
import socketService from '../services/socket';
import { useToast } from './ToastContext';

const TagsContext = createContext();

export const useTags = () => useContext(TagsContext);

// Module-level ref so NotesContext socket handlers can read the current value
// without subscribing to TagsContext (which would cause mass re-renders).
export const pickerNoteIdRef = { current: null };

export const TagsProvider = ({ children }) => {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [hiddenTagIds, setHiddenTagIds] = useState(new Set());
  const [pickerOpenForNoteId, _setPickerOpenForNoteId] = useState(null);

  const setPickerOpenForNoteId = useCallback((noteId) => {
    pickerNoteIdRef.current = noteId;
    _setPickerOpenForNoteId(noteId);
  }, []);

  const { showToast } = useToast();

  // Load all tags
  const loadTags = useCallback(async ({ silent = false } = {}) => {
    // Only flip loading=true on initial load. Background refreshes (e.g. after
    // a note change) must not toggle loading, or consumers gated on
    // `tagsLoading` (QuickAccess pinned folders, etc.) flicker empty for a
    // frame and shift the layout.
    if (!silent) setLoading(true);
    try {
      const response = await tagsApi.getAllTags();
      
      // Initialize hiddenTagIds based on tag visibility in database
      const initialHiddenTagIds = new Set();
      
      // Log each tag's visibility
      response.tags.forEach(tag => {
        //console.log(`Loaded tag ${tag.id} (${tag.name}) with visibility:`, tag.visible);
        
        // Add hidden tags to the set
        if (tag.visible === false) {
          console.log(`Tag ${tag.name} is hidden (visible = false)`);
          initialHiddenTagIds.add(tag.id);
        }
      });
      
      // Update the hidden tags set
      setHiddenTagIds(initialHiddenTagIds);
      console.log(`Initialized ${initialHiddenTagIds.size} hidden tags`);
      
      // Update tags state
      setTags(response.tags);
      setError(null);
    } catch (err) {
      setError('Failed to load tags');
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Create a new tag
  const createTag = async (name, visible = true, isFolder = false, parentId = null) => {
    try {
      const response = await tagsApi.createTag(name, visible, isFolder, parentId);
      
      // Use the same deduplication logic from handleTagCreated
      setTags(prevTags => {
        // Check if the tag already exists by ID
        const exists = prevTags.some(t => t.id === response.tag.id);
        
        if (exists) {
          console.log(`createTag: Tag ${response.tag.id} already exists in state, updating it`);
          // Replace with new version
          return prevTags.map(t => t.id === response.tag.id ? response.tag : t);
        } else {
          console.log(`createTag: Adding new tag ${response.tag.id} to state`);
          // Add new tag
          return [...prevTags, response.tag];
        }
      });
      
      // Show success toast
      showToast(`Tag #${response.tag.name} created`);

      // Log successful creation
      console.log('Tag created successfully:', response.tag);
      return response.tag;
    } catch (err) {
      // Check if this is a duplicate tag error (status 400)
      if (err.response && err.response.status === 400 && err.response.data.tag) {
        // Tag already exists - return the existing tag from the error
        console.log('Tag already exists, returning existing tag:', err.response.data.tag);
        
        // Very important: Update the state with this existing tag
        // This ensures QuickAccess and other components know about it
        setTags(prevTags => {
          // Check if we already have this tag in state
          const exists = prevTags.some(t => t.id === err.response.data.tag.id);
          
          if (!exists) {
            console.log(`Adding existing tag ${err.response.data.tag.id} to state`);
            return [...prevTags, err.response.data.tag];
          }
          return prevTags;
        });
        
        return err.response.data.tag;
      }
      setError('Failed to create tag');
      console.error(err);
      return null;
    }
  };

  // Update a tag
  const updateTag = async (id, updates) => {
    try {
      const response = await tagsApi.updateTag(id, updates);
      setTags(prevTags => 
        prevTags.map(tag => tag.id === id ? response.tag : tag)
      );
      return response.tag;
    } catch (err) {
      setError('Failed to update tag');
      console.error(err);
      return null;
    }
  };

  // Rename a tag
  const renameTag = async (id, name) => {
    return await updateTag(id, { name });
  };

  // Toggle tag visibility
  const toggleTagVisibility = async (id, visible) => {
    try {
      const response = await tagsApi.toggleTagVisibility(id, visible);
      setTags(prevTags =>
        prevTags.map(tag => tag.id === id ? { ...tag, ...response.tag } : tag)
      );
      return response.tag;
    } catch (err) {
      setError('Failed to toggle tag visibility');
      console.error(err);
      return null;
    }
  };

  // Delete a tag
  const deleteTag = async (id, options = {}) => {
    try {
      // Get the tag name before deleting for the toast
      const tagToDelete = tags.find(tag => tag.id === id);
      const tagName = tagToDelete ? tagToDelete.name : '';

      await tagsApi.deleteTag(id, options);
      setTags(prevTags => prevTags.filter(tag => tag.id !== id));
      
      // Show success toast
      if (tagName) {
        showToast(`Tag #${tagName} deleted`);
      }
      
      return true;
    } catch (err) {
      setError('Failed to delete tag');
      console.error(err);
      return false;
    }
  };

  // Get visible tags
  const getVisibleTags = useCallback(() => {
    return tags.filter(tag => !hiddenTagIds.has(tag.id));
  }, [tags, hiddenTagIds]);
  
  // Check if a tag is hidden
  const isTagHidden = useCallback((tagId) => {
    return hiddenTagIds.has(tagId);
  }, [hiddenTagIds]);
  
  // Toggle tag hidden state
  const toggleTagHidden = (tagId) => {
    setHiddenTagIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tagId)) {
        newSet.delete(tagId);
        console.log(`Showing tag ${tagId}`);
      } else {
        newSet.add(tagId);
        console.log(`Hiding tag ${tagId}`);
      }
      return newSet;
    });
  };

  // Initial load of tags
  useEffect(() => {
    loadTags();
  }, [loadTags]);

  // Set up socket listeners for real-time updates
  useEffect(() => {
    const socket = socketService.connect();

    // Bulk operations emit one note event per note, so coalesce the resulting
    // tag-count reloads into a single request instead of firing one per note.
    let noteChangeTimer = null;

    const handleTagCreated = (tag) => {
      console.log("Socket: Tag created event received", tag);
      
      // Using a function that deduplicates tags by ID
      const addTagIfNotExists = (prevTags, newTag) => {
        // First check if tag already exists by ID
        const tagExists = prevTags.some(t => t.id === newTag.id);
        console.log(`Tag ${newTag.id} exists in state: ${tagExists}`);
        
        if (tagExists) {
          // If it exists, replace it with the new version to ensure latest data
          return prevTags.map(t => t.id === newTag.id ? newTag : t);
        } else {
          // If it doesn't exist, add it
          return [...prevTags, newTag];
        }
      };
      
      // Use the deduplication function to update state
      setTags(prevTags => addTagIfNotExists(prevTags, tag));
    };

    const handleTagUpdated = (tag) => {
      console.log("Socket: Tag updated", tag);
      
      // Update the tag in the tags list, ensuring no duplicates
      setTags(prevTags => {
        // First determine if we have the tag
        const hasTag = prevTags.some(t => t.id === tag.id);
        
        if (hasTag) {
          // Replace existing tag with updated version
          return prevTags.map(t => t.id === tag.id ? tag : t);
        } else {
          // If we don't have the tag yet (unusual but possible), add it
          console.log(`Tag ${tag.id} not found in state, adding it`);
          return [...prevTags, tag];
        }
      });
      
      // Update hiddenTagIds based on tag visibility
      if (tag.visible === false) {
        // Add to hidden tags
        setHiddenTagIds(prev => {
          const newSet = new Set(prev);
          newSet.add(tag.id);
          console.log(`Socket: Adding tag ${tag.id} to hidden tags`);
          return newSet;
        });
      } else {
        // Remove from hidden tags
        setHiddenTagIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(tag.id);
          console.log(`Socket: Removing tag ${tag.id} from hidden tags`);
          return newSet;
        });
      }
    };

    const handleTagDeleted = (tagId) => {
      // Remove the tag from the state
      setTags(prevTags => prevTags.filter(tag => tag.id !== tagId));

      // Also remove from hidden tags if it was there
      setHiddenTagIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(tagId)) {
          newSet.delete(tagId);
          console.log(`Socket: Removed deleted tag ${tagId} from hidden tags`);
        }
        return newSet;
      });
    };

    // Reload tags when notes are created/updated/deleted to update note counts.
    // Use silent mode so consumers gated on `loading` (QuickAccess pinned
    // folders) don't flicker empty during the refetch.
    const handleNoteChange = () => {
      if (noteChangeTimer) clearTimeout(noteChangeTimer);
      noteChangeTimer = setTimeout(() => {
        noteChangeTimer = null;
        console.log("Socket: Note(s) changed, reloading tags to update counts");
        loadTags({ silent: true });
      }, 300);
    };

    // Register event listeners
    socket.on('tag_created', handleTagCreated);
    socket.on('tag_updated', handleTagUpdated);
    socket.on('tag_deleted', handleTagDeleted);
    socket.on('note_created', handleNoteChange);
    socket.on('note_updated', handleNoteChange);
    socket.on('note_deleted', handleNoteChange);
    socket.on('notes_bulk_updated', handleNoteChange);
    socket.on('notes_bulk_deleted', handleNoteChange);
    socket.on('bulk_tags_updated', handleNoteChange);

    // Cleanup on unmount
    return () => {
      if (noteChangeTimer) clearTimeout(noteChangeTimer);
      socket.off('tag_created', handleTagCreated);
      socket.off('tag_updated', handleTagUpdated);
      socket.off('tag_deleted', handleTagDeleted);
      socket.off('note_created', handleNoteChange);
      socket.off('note_updated', handleNoteChange);
      socket.off('note_deleted', handleNoteChange);
      socket.off('notes_bulk_updated', handleNoteChange);
      socket.off('notes_bulk_deleted', handleNoteChange);
      socket.off('bulk_tags_updated', handleNoteChange);
    };
  }, [loadTags]);

  // Toggle modal visibility
  const toggleTagsModal = () => {
    setShowTagsModal(prevState => !prevState);
  };

  const value = {
    tags,
    loading,
    error,
    loadTags,
    createTag,
    updateTag,
    renameTag,
    toggleTagVisibility, // For API calls
    toggleTagHidden,     // For in-memory state
    deleteTag,
    getVisibleTags,
    isTagHidden,
    hiddenTagIds,
    pickerOpenForNoteId,
    setPickerOpenForNoteId,
    showTagsModal,
    toggleTagsModal,
    setShowTagsModal
  };

  return (
    <TagsContext.Provider value={value}>
      {children}
    </TagsContext.Provider>
  );
};

export default TagsContext;