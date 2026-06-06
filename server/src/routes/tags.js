const express = require('express');
const Tag = require('../models/Tag');
const router = express.Router();

// Get all tags
router.get('/', async (req, res) => {
  try {
    const tags = await Tag.findAllWithCounts();
    res.json({ tags });
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ message: 'Error fetching tags', error: error.message });
  }
});

// Get a single tag by ID
router.get('/:id', async (req, res) => {
  try {
    const tag = await Tag.findById(req.params.id);
    if (!tag) {
      return res.status(404).json({ message: 'Tag not found' });
    }
    res.json({ tag });
  } catch (error) {
    console.error('Error fetching tag:', error);
    res.status(500).json({ message: 'Error fetching tag', error: error.message });
  }
});

// Create a new tag
router.post('/', async (req, res) => {
  try {
    console.log('Received tag creation request with body:', req.body);
    
    // Check if req.body is defined
    if (!req.body) {
      return res.status(400).json({ message: 'Request body is empty or not parsed correctly' });
    }
    
    const { name, visible = true, isFolder = false, parentId = null } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Tag name is required' });
    }

    // Check if tag already exists under the same parent
    const existingTag = await Tag.findByName(name, parentId);
    if (existingTag) {
      const itemType = existingTag.is_folder ? 'Folder' : 'Tag';
      return res.status(400).json({ message: `${itemType} with name "${name}" already exists`, tag: existingTag });
    }

    // Validate parentId: parent must exist, be a top-level folder (max 2 levels deep)
    if (parentId) {
      const parent = await Tag.findById(parentId);
      if (!parent) {
        return res.status(400).json({ message: 'Parent folder not found' });
      }
      if (!parent.is_folder) {
        return res.status(400).json({ message: 'Parent must be a folder' });
      }
      if (parent.parent_id !== null) {
        return res.status(400).json({ message: 'Folders can only be nested one level deep' });
      }
    }

    const tag = await Tag.create(name, visible, isFolder, parentId);
    
    // Emit socket event
    req.app.get('io').emit('tag_created', tag);
    
    res.status(201).json({ tag });
  } catch (error) {
    console.error('Error creating tag:', error);
    res.status(500).json({ 
      message: 'Error creating tag', 
      error: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

// Update a tag
router.put('/:id', async (req, res) => {
  try {
    const { name, visible, isFolder, parentId } = req.body;
    const updates = {};

    // Add properties to updates if they are provided
    if (name !== undefined) updates.name = name;
    if (visible !== undefined) updates.visible = visible;
    if (isFolder !== undefined) updates.isFolder = isFolder;
    if (parentId !== undefined) updates.parentId = parentId;
    
    // Check if there are no updates
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No updates provided' });
    }
    
    // If updating name, check uniqueness within the same parent scope
    if (name) {
      const currentTag = await Tag.findById(req.params.id);
      const scopeParentId = updates.parentId !== undefined ? updates.parentId : currentTag?.parent_id ?? null;
      const existingTag = await Tag.findByName(name, scopeParentId);
      if (existingTag && existingTag.id !== req.params.id) {
        return res.status(400).json({ message: 'A tag with this name already exists' });
      }
    }
    
    const tag = await Tag.update(req.params.id, updates);
    if (!tag) {
      return res.status(404).json({ message: 'Tag not found' });
    }
    
    // Emit socket event
    req.app.get('io').emit('tag_updated', tag);
    
    res.json({ tag });
  } catch (error) {
    console.error('Error updating tag:', error);
    res.status(500).json({ message: 'Error updating tag', error: error.message });
  }
});

// Toggle tag visibility
router.patch('/:id/visibility', async (req, res) => {
  try {
    const { visible } = req.body;
    if (visible === undefined) {
      return res.status(400).json({ message: 'Visibility status is required' });
    }
    
    const tag = await Tag.toggleVisibility(req.params.id, visible);
    if (!tag) {
      return res.status(404).json({ message: 'Tag not found' });
    }
    
    // Emit socket event
    req.app.get('io').emit('tag_updated', tag);
    
    res.json({ tag });
  } catch (error) {
    console.error('Error toggling tag visibility:', error);
    res.status(500).json({ message: 'Error toggling tag visibility', error: error.message });
  }
});

// Delete a tag
router.delete('/:id', async (req, res) => {
  try {
    const tag = await Tag.delete(req.params.id);
    if (!tag) {
      return res.status(404).json({ message: 'Tag not found' });
    }
    
    // Emit socket event
    req.app.get('io').emit('tag_deleted', req.params.id);
    
    res.json({ message: 'Tag deleted successfully', tag });
  } catch (error) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ message: 'Error deleting tag', error: error.message });
  }
});

// Get notes by tag ID
router.get('/:id/notes', async (req, res) => {
  try {
    const { page = 1, limit = 40 } = req.query;
    const notes = await Tag.findNotesByTagId(req.params.id, {
      page: parseInt(page),
      limit: parseInt(limit)
    });
    
    const totalCount = await Tag.getTagCount(req.params.id);
    
    res.json({
      notes,
      totalCount,
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error('Error fetching notes by tag:', error);
    res.status(500).json({ message: 'Error fetching notes by tag', error: error.message });
  }
});

// --- Bulk Tag Operations ---

// Bulk add tag to notes
router.post('/bulk-add', async (req, res) => {
  const { noteIds, tagId } = req.body;

  if (!Array.isArray(noteIds) || noteIds.length === 0 || !tagId) {
    return res.status(400).json({ message: 'Missing or invalid noteIds or tagId' });
  }

  try {
    const updatedNotes = await Tag.bulkAddTagToNotesWithNotes(noteIds, tagId);
    
    // Emit socket event for bulk update
    req.app.get('io').emit('bulk_tags_updated', { noteIds, tagId, action: 'add' });
    
    res.status(200).json({ 
      message: `Tag added to ${updatedNotes.length} notes.`, 
      notes: updatedNotes 
    });
  } catch (error) {
    console.error('Error bulk adding tag to notes:', error);
    res.status(500).json({ message: 'Error bulk adding tag', error: error.message });
  }
});

// Bulk remove tag from notes
router.post('/bulk-remove', async (req, res) => {
  const { noteIds, tagId } = req.body;

  if (!Array.isArray(noteIds) || noteIds.length === 0 || !tagId) {
    return res.status(400).json({ message: 'Missing or invalid noteIds or tagId' });
  }

  try {
    const updatedNotes = await Tag.bulkRemoveTagFromNotesWithNotes(noteIds, tagId);
    
    // Emit socket event for bulk update
    req.app.get('io').emit('bulk_tags_updated', { noteIds, tagId, action: 'remove' });
    
    res.status(200).json({ 
      message: `Tag removed from ${updatedNotes.length} notes.`, 
      notes: updatedNotes 
    });
  } catch (error) {
    console.error('Error bulk removing tag from notes:', error);
    res.status(500).json({ message: 'Error bulk removing tag', error: error.message });
  }
});


module.exports = router;
