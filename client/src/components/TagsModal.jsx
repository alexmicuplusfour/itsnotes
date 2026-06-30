import React, { useState, useRef, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { useTags } from '../contexts/TagsContext';
import { useNotes } from '../contexts/NotesContext';
import Icon from './Icons';
import Modal from './Modal';

const ModalContent = styled.div`
  padding: 20px 0 20px 20px;
  padding-right: 0;
  flex: 1; /* Take up remaining space after header */
  min-height: 0; /* Allow flexbox to shrink this element */
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  
  /* Scrollbar styling at modal edge */
  &::-webkit-scrollbar { 
    width: 8px; 
  }
  &::-webkit-scrollbar-track { 
    background: transparent; 
  }
  &::-webkit-scrollbar-thumb { 
    background-color: rgba(0, 0, 0, 0.2); 
    border-radius: 20px; 
  }
  .dark-theme & ::-webkit-scrollbar-thumb { 
    background-color: rgba(255, 255, 255, 0.2); 
  }
  
  /* Add right padding to child elements instead of scrollable container */
  & > * {
    padding-right: 20px;
    width: 100%;
    box-sizing: border-box;
  }
`;

const TagList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  /* Remove any height constraints to let parent control scrolling */
  flex: 1;
  min-height: 0; /* Allow flexbox to shrink */
`;

const TagsListContainer = styled.div`
  flex: 1;
  min-height: 0; /* Allow flexbox to shrink */
`;

const TagItem = styled.li`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  border-bottom: 1px solid var(--menu-item-separator-dark);

  &:hover {
    background-color: var(--button-hover-color);
  }
  
  &:last-child {
    border-bottom: none;
  }
`;

const TagControls = styled.div`
  display: flex;
  align-items: center;
`;

const TagName = styled.span`
  font-size: 16px;
  cursor: pointer;
  
  &:hover {
    opacity: 0.8;
    text-decoration: underline;
  }
`;

const EditableTagName = styled.input`
  font-size: 16px;
  background-color: var(--background-color);
  color: var(--text-color);
  border: 2px solid var(--note-border-color);
  border-radius: 4px;
  padding: 6px;
  flex: 1;
  margin-right: 8px;

  &:focus {
    outline: none;
    border-color: var(--text-color);
  }
`;

const ActionButton = styled.button`
  background: none;
  border: none;
  padding: 8px;
  color: var(--text-color);
  opacity: 0.7;
  cursor: pointer;
  
  &:hover {
    opacity: 1;
  }
`;

const DeleteButton = styled(ActionButton)`
  &:hover {
    color: #f44336;
  }
`;

const EditButton = styled(ActionButton)`
  &:hover {
    color: var(--text-color);
  }
`;

const SaveButton = styled(ActionButton)`
  &:hover {
    color: #4caf50;
  }
`;

const CancelButton = styled(ActionButton)`
  &:hover {
    color: #ff9800;
  }
`;

const VisibilityButton = styled(ActionButton)`
  &:hover {
    color: var(--text-color);
  }
`;

const AddTagWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 20px;
  flex-shrink: 0; /* Prevent this from shrinking */
`;

const TagInput = styled.input`
  width: 100%;
  padding: 10px;
  padding-right: 65px; // Always make space for buttons (create + clear, or just clear)
  font-size: 16px;
  border-radius: 8px;
  background-color: var(--search-bg-color);
  color: var(--text-color);
  box-sizing: border-box;
  
  &:focus {
    outline: none;
    outline: 2px solid var(--spinner-highlight);
  }
`;

const TagActionButton = styled.button`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  padding: 0;
  color: var(--text-color);
  opacity: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  width: 26px;
  z-index: 2;
  border-radius: 50%;

  &:hover:not(:disabled) {
    opacity: 1;
    background-color: rgba(128, 128, 128, 0.1);
  }
  
  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    background-color: transparent;
  }

  &.clear-button { right: 30px; }
  &.create-button { 
    right: calc(30px + 32px + 4px); 
    background-color: var(--foreground-color); 
    color: var(--text-color-contrast);
    &:hover { background-color: var(--foreground-color); }
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 30px 0;
  color: var(--text-color);
  opacity: 0.7;
`;

const ViewToggleHeader = styled.div`
  display: flex;
  gap: 4px;
  padding: 4px;
  border-bottom: 0px solid var(--note-border-color);
  margin-bottom: 12px;
  flex-shrink: 0;
`;

const ViewToggleButton = styled.button`
  background: none;
  border: none;
  color: var(--text-color);
  cursor: pointer;
  font-size: 13px;
  padding: 4px 8px;
  border-radius: 6px;
  opacity: 0.7;

  &:hover {
    opacity: 1;
    background-color: rgba(128, 128, 128, 0.1);
  }

  &.active {
    opacity: 1;
    font-weight: 600;
    background-color: rgba(128, 128, 128, 0.15);
  }
`;

const TagsModal = ({ onClose }) => {
  const {
    tags,
    loading,
    error,
    createTag,
    deleteTag,
    renameTag,
    toggleTagHidden,
    toggleTagVisibility,
    isTagHidden
  } = useTags();
  const { searchByTag } = useNotes();
  const [newTagName, setNewTagName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTagId, setEditingTagId] = useState(null);
  const [editedTagName, setEditedTagName] = useState('');
  const [newlyCreatedTagId, setNewlyCreatedTagId] = useState(null); // Track newly created tag ID
  const [viewMode, setViewMode] = useState('tags'); // 'tags' or 'folders'
  const inputRef = useRef();
  const editInputRef = useRef();

  // Focus on edit input when editing a tag
  useEffect(() => {
    if (editingTagId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTagId]);

  useEffect(() => {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const originalStyle = window.getComputedStyle(document.body).overflow;
    const originalPadding = window.getComputedStyle(document.body).paddingRight;

    document.body.style.paddingRight = `${scrollbarWidth}px`;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalStyle;
      document.body.style.paddingRight = originalPadding;
    };
  }, []);
  
  // Handle tag submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!newTagName.trim()) return;
    
    // Check if tag already exists
    const exists = tags.some(tag => tag.name.toLowerCase() === newTagName.trim().toLowerCase());
    
    if (exists) {
      alert('A tag with this name already exists!');
      return;
    }

    const trimmedName = newTagName.trim(); // Define trimmedName
    
    // Assuming createTag returns the newly created tag object or its ID
    const newTag = await createTag(trimmedName); 
    if (newTag && newTag.id) {
      setNewlyCreatedTagId(newTag.id); // Store the ID of the new tag
    }
    setNewTagName('');
    setSearchQuery('');
  };

  // Handle input change with cleaning and search
  const handleInputChange = (value) => {
    const cleanValue = value.replace(/[\s#]/g, '-');
    setNewTagName(cleanValue);
    setSearchQuery(cleanValue);
  };

  // Handle clear input
  const handleClearInput = () => {
    setNewTagName('');
    setSearchQuery('');
  };

  // Handle create tag from button
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    // Check if tag already exists
    const exists = tags.some(tag => tag.name.toLowerCase() === newTagName.trim().toLowerCase());

    if (exists) {
      alert('A tag or folder with this name already exists!');
      setNewTagName('');
      setSearchQuery('');
      return;
    }

    const trimmedName = newTagName.trim();
    const isFolder = viewMode === 'folders';

    try {
      const newTag = await createTag(trimmedName, true, isFolder);
      if (newTag && newTag.id) {
        setNewlyCreatedTagId(newTag.id);
      }
      setNewTagName('');
      setSearchQuery('');
    } catch (err) {
      console.error('Failed to create tag:', err);
      alert(`Error creating tag: ${err.message || 'Please try again.'}`);
    }
  };
  
  // Start editing a tag
  const handleEditTag = (tag) => {
    setEditingTagId(tag.id);
    setEditedTagName(tag.name);
  };
  
  // Save edited tag name
  const handleSaveTag = async (tagId) => {
    if (!editedTagName.trim()) {
      alert('Tag name cannot be empty');
      return;
    }
    
    // Check if another tag already has this name
    const exists = tags.some(
      tag => tag.id !== tagId && tag.name.toLowerCase() === editedTagName.trim().toLowerCase()
    );
    
    if (exists) {
      alert('A tag with this name already exists!');
      return;
    }
    
    await renameTag(tagId, editedTagName.trim());
    setEditingTagId(null);
    setEditedTagName('');
  };
  
  // Cancel editing
  const handleCancelEdit = () => {
    setEditingTagId(null);
    setEditedTagName('');
  };
  
  // Toggle tag visibility - updates both UI state and saves to database
  const handleToggleVisibility = async (tag) => {
    // Determine the new visibility state (the OPPOSITE of current)
    const currentlyHidden = isTagHidden(tag.id);
    const newVisibleState = currentlyHidden; // If currently hidden, make visible=true
    
    console.log(`Toggling tag ${tag.id} (${tag.name}) visibility.`);
    console.log(`Current hidden state: ${currentlyHidden}, new visible state: ${newVisibleState}`);
    
    // First update UI state immediately for better UX
    toggleTagHidden(tag.id);
    
    // Then update database via API call
    try {
      // Make API call to update the database with new visible state
      console.log(`Updating tag ${tag.id} in database, setting visible=${newVisibleState}`);
      const updatedTag = await toggleTagVisibility(tag.id, newVisibleState);
      console.log("Database update successful:", updatedTag);
    } catch (error) {
      console.error("Error updating tag visibility in database:", error);
      // If API call fails, revert UI state
      toggleTagHidden(tag.id);
    }
  };
  
  // Handle tag deletion
  const handleDeleteTag = async (id) => {
    if (window.confirm('Are you sure you want to delete this tag?')) {
      await deleteTag(id);
    }
  };
  
  // Handle tag click to search
  const handleTagClick = (tag) => {
    searchByTag(tag.id, tag.name);
    onClose(); // Close modal after selecting a tag for search
  };
  
  // Calculate the list of tags to display, ensuring alphabetical sort (ignoring leading non-alphanumeric) + new tag at top temporarily
  const displayedTags = useMemo(() => {
    console.log("Calculating displayedTags with", tags.length, "tags");

    // First, ensure we have a clean array with no duplicates by ID
    const uniqueTagsMap = new Map();
    tags.forEach(tag => {
      // Only add each tag ID once (last one wins if there are duplicates)
      uniqueTagsMap.set(tag.id, tag);
    });

    // Convert back to array
    const uniqueTags = Array.from(uniqueTagsMap.values());
    console.log("After deduplication:", uniqueTags.length, "tags");

    // Filter by view mode (tags vs folders)
    let filteredTags = uniqueTags.filter(tag =>
      viewMode === 'folders' ? tag.is_folder : !tag.is_folder
    );

    // Filter tags based on search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filteredTags = filteredTags.filter(tag =>
        tag.name.toLowerCase().includes(query)
      );
    }

    // Helper function to get the sortable part of the name (stripping leading non-alphanumeric)
    const getSortableName = (name) => {
      const match = name.match(/[a-zA-Z0-9]/);
      if (match) return name.substring(match.index);
      return name;
    };

    if (viewMode === 'folders') {
      // Group subfolders under their parent folder
      const topLevel = [...filteredTags]
        .filter(t => !t.parent_id)
        .sort((a, b) => getSortableName(a.name).localeCompare(getSortableName(b.name)));

      const ordered = [];
      topLevel.forEach(parent => {
        ordered.push(parent);
        filteredTags
          .filter(t => t.parent_id === parent.id)
          .sort((a, b) => a.name.localeCompare(b.name))
          .forEach(child => ordered.push({ ...child, _isSubfolder: true }));
      });
      // Orphaned subfolders whose parent was filtered out by search
      filteredTags
        .filter(t => t.parent_id && !topLevel.find(p => p.id === t.parent_id))
        .forEach(t => ordered.push({ ...t, _isSubfolder: true }));

      // Move newly created item to top
      if (newlyCreatedTagId) {
        const idx = ordered.findIndex(t => t.id === newlyCreatedTagId);
        if (idx > -1) {
          const [newTag] = ordered.splice(idx, 1);
          return [newTag, ...ordered];
        }
      }
      return ordered;
    }

    // 1. Create a sorted copy of the filtered tags, using the custom sort logic
    const sortedTags = [...filteredTags]
      .sort((a, b) => {
        const nameA = getSortableName(a.name);
        const nameB = getSortableName(b.name);
        return nameA.localeCompare(nameB);
      })
      .map(tag => tag.name.includes('/') ? { ...tag, _isSubtag: true } : tag);

    // 2. If a tag was just created in this modal session, move it to the top
    if (newlyCreatedTagId) {
      const newTagIndex = sortedTags.findIndex(tag => tag.id === newlyCreatedTagId);
      if (newTagIndex > -1) {
        const [newTag] = sortedTags.splice(newTagIndex, 1);
        return [newTag, ...sortedTags];
      }
    }

    // 3. Otherwise, return the alphabetically sorted list
    return sortedTags;
  }, [tags, newlyCreatedTagId, searchQuery, viewMode]);

  // Check if current input has an exact match (for determining when to show add button)
  const hasExactMatch = useMemo(() => {
    if (!searchQuery.trim()) return false;
    const query = searchQuery.toLowerCase();
    return tags.some(tag => tag.name.toLowerCase() === query);
  }, [tags, searchQuery]);
  
  return (
    <Modal
      title="Manage Tags / Folders"
      onClose={onClose}
      width="500px"
      height="calc(100vh - 80px)"
      maxHeight="700px"
    >
        <ModalContent>
          <ViewToggleHeader>
            <ViewToggleButton
              className={viewMode === 'tags' ? 'active' : ''}
              onClick={() => setViewMode('tags')}
            >
              Tags
            </ViewToggleButton>
            <ViewToggleButton
              className={viewMode === 'folders' ? 'active' : ''}
              onClick={() => setViewMode('folders')}
            >
              Folders
            </ViewToggleButton>
          </ViewToggleHeader>

          <AddTagWrapper>
            <TagInput
              ref={inputRef}
              type="text"
              placeholder={viewMode === 'folders' ? "Search or Create folder ..." : "Search or Create tag ..."}
              value={newTagName}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !hasExactMatch) { handleCreateTag(); } }}
              aria-label="Search tags or create new tag"
            />
            {newTagName.trim() && (
              <>
                {!hasExactMatch ? (
                  // Show create/clear buttons when no exact match exists
                  <>
                    <TagActionButton
                      className="create-button"
                      onClick={handleCreateTag}
                      disabled={!newTagName.trim()}
                      title="Create tag"
                      aria-label="Create tag"
                    >
                      <Icon name="add" size={20} strokeWidth="2.5"/>
                    </TagActionButton>
                    <TagActionButton
                      className="clear-button"
                      onClick={handleClearInput}
                      title="Clear input"
                      aria-label="Clear input"
                    >
                      <Icon name="close" size={20} strokeWidth="2.5"/>
                    </TagActionButton>
                  </>
                ) : (
                  // Show only clear button when exact match exists
                  <>
                    <TagActionButton
                      className="clear-button"
                      onClick={handleClearInput}
                      title="Clear search"
                      aria-label="Clear search"
                    >
                      <Icon name="close" size={20} strokeWidth="2.5"/>
                    </TagActionButton>
                  </>
                )}
              </>
            )}
          </AddTagWrapper>

          <TagsListContainer>
            {loading && <EmptyState>Loading tags...</EmptyState>}
            
            {error && <EmptyState>Error loading tags: {error}</EmptyState>}
            
            {!loading && !error && tags.length === 0 && (
              <EmptyState>No tags yet. Create your first tag above!</EmptyState>
            )}
            
            {!loading && !error && tags.length > 0 && displayedTags.length === 0 && searchQuery.trim() && (
              <EmptyState>No tags match "{searchQuery}"</EmptyState>
            )}
            
            {!loading && !error && displayedTags.length > 0 && ( // Use displayedTags
              <TagList>
                {displayedTags.map(tag => (
                <TagItem key={tag.id} style={(tag._isSubfolder || tag._isSubtag) ? { paddingLeft: '24px' } : undefined}>
                  {editingTagId === tag.id ? (
                    // Editing mode
                    <>
                      <EditableTagName
                        ref={editInputRef}
                        type="text"
                        value={editedTagName}
                        onChange={(e) => setEditedTagName(e.target.value.replace(/[\s#]/g, '-'))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveTag(tag.id);
                          } else if (e.key === 'Escape') {
                            handleCancelEdit();
                          }
                        }}
                      />
                      <TagControls>
                        <SaveButton 
                          onClick={() => handleSaveTag(tag.id)}
                          title="Save changes"
                        >
                          <Icon name="check" size={18} />
                        </SaveButton>
                        <CancelButton 
                          onClick={handleCancelEdit}
                          title="Cancel editing"
                        >
                          <Icon name="close" size={18} />
                        </CancelButton>
                      </TagControls>
                    </>
                  ) : (
                    // Display mode
                    <>
                      <TagName 
                        onClick={() => handleTagClick(tag)}
                        title={`Search for notes with #${tag.name}`}
                        style={{ 
                          opacity: tag.visible ? 1 : 0.5
                        }}
                      >
                        {tag.name}
                      </TagName>
                      
                      <TagControls>
                        <VisibilityButton 
                          onClick={() => handleToggleVisibility(tag)}
                          title={isTagHidden(tag.id) ? 'Show tag in main list' : 'Hide tag from main list'}
                          data-visible={!isTagHidden(tag.id)}
                        >
                          <Icon name={isTagHidden(tag.id) ? "eye-slash" : "eye"} size={18} />
                        </VisibilityButton>
                        <EditButton 
                          onClick={() => handleEditTag(tag)}
                          title="Edit tag name"
                        >
                          <Icon name="edit" size={18} />
                        </EditButton>
                        <DeleteButton 
                          onClick={() => handleDeleteTag(tag.id)}
                          title="Delete tag"
                        >
                          <Icon name="trash" size={18} />
                        </DeleteButton>
                      </TagControls>
                    </>
                  )}
                </TagItem>
              ))}
            </TagList>
            )}
          </TagsListContainer>
        </ModalContent>
    </Modal>
  );
};

export default TagsModal;
