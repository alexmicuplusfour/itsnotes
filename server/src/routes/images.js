const express = require('express');
const NoteImage = require('../models/NoteImage');
const Note = require('../models/Note');
const demoReset = require('../services/demoReset');
const { processNoteImage } = require('../utils/imageProcessing');
const router = express.Router();

const DEMO_MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB in demo mode

// Get all images for a note (with optional thumbnail-only parameter)
router.get('/notes/:noteId/images', async (req, res) => {
  try {
    const { noteId } = req.params;
    const { thumbnailsOnly = 'true' } = req.query; // Default to thumbnails only
    const thumbnailsOnlyBool = thumbnailsOnly === 'true';
    
    // Verify note exists
    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }
    
    // Use the appropriate method based on the parameter
    let images;
    if (thumbnailsOnlyBool) {
      console.log(`Getting thumbnails only for note ${noteId}`);
      images = await NoteImage.findThumbnailsByNoteId(noteId);
    } else {
      console.log(`Getting full images for note ${noteId}`);
      images = await NoteImage.findByNoteId(noteId);
    }
    
    res.json({ images });
  } catch (error) {
    console.error('Error fetching note images:', error);
    res.status(500).json({ message: 'Error fetching note images', error: error.message });
  }
});

// Get a specific image by ID (includes full data)
router.get('/images/:id', async (req, res) => {
  try {
    const image = await NoteImage.findById(req.params.id);

    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }

    res.json({ image });
  } catch (error) {
    console.error('Error fetching image:', error);
    res.status(500).json({ message: 'Error fetching image', error: error.message });
  }
});

// Stream the decoded image bytes for inline rendering. Inline note images
// reference their row by id instead of inlining base64 into the note body, so
// this serves the actual bytes (with caching) for the client to load as a blob.
router.get('/images/:id/raw', async (req, res) => {
  try {
    const image = await NoteImage.findById(req.params.id);

    if (!image || !image.data) {
      return res.status(404).json({ message: 'Image not found' });
    }

    // Stored `data` is a data URL: data:<mime>;base64,<payload>
    const match = /^data:([^;]+);base64,(.*)$/s.exec(image.data);
    if (!match) {
      return res.status(415).json({ message: 'Image data is not a base64 data URL' });
    }

    const mime = match[1];
    const buffer = Buffer.from(match[2], 'base64');

    // Image bytes for a given id never change, so cache aggressively (private —
    // the resource is auth-gated and per-user).
    res.set('Content-Type', mime);
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.set('Content-Length', String(buffer.length));
    res.send(buffer);
  } catch (error) {
    console.error('Error streaming image:', error);
    res.status(500).json({ message: 'Error streaming image', error: error.message });
  }
});

// Add an image to a note
router.post('/notes/:noteId/images', async (req, res) => {
  try {
    const { noteId } = req.params;
    const { data, name, type, size } = req.body;

    console.log(`Adding image to note ${noteId}, type: ${type}, size: ${size}`);

    if (!data) {
      return res.status(400).json({ message: 'Image data is required' });
    }

    if (demoReset.isEnabled()) {
      if (!type || !type.startsWith('image/')) {
        return res.status(400).json({ message: 'Only image files are allowed in demo mode.' });
      }
      if (!data.startsWith('data:image/')) {
        return res.status(400).json({ message: 'Invalid image data.' });
      }
      if (size && size > DEMO_MAX_IMAGE_SIZE) {
        return res.status(413).json({ message: 'Images must be under 10MB in demo mode.' });
      }
    }

    // Verify note exists
    const note = await Note.findById(noteId);
    console.log('Note found:', note ? 'Yes' : 'No');

    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    // Single source of truth for sizing/encoding: re-encode the uploaded image
    // to WebP (full + thumbnail) server-side rather than trusting client output.
    let processed;
    try {
      processed = await processNoteImage(data);
    } catch (procErr) {
      console.error('Failed to process uploaded image:', procErr.message);
      return res.status(415).json({ message: 'Unsupported or corrupt image data' });
    }

    try {
      const image = await NoteImage.create({
        note_id: noteId,
        data: processed.data,
        thumbnail: processed.thumbnail,
        name: name || null,
        type: processed.type,
        size: processed.size
      });
      
      console.log('Image created successfully, ID:', image.id);
      
      // Emit socket event for real-time updates
      req.app.get('io').emit('note_image_added', {
        noteId,
        image
      });
      
      res.status(201).json({ image });
    } catch (dbError) {
      console.error('Database error when creating image:', dbError);
      throw dbError;
    }
  } catch (error) {
    console.error('Error adding image to note:', error);
    res.status(500).json({ message: 'Error adding image to note', error: error.message });
  }
});

// Delete an image
router.delete('/images/:id', async (req, res) => {
  try {
    const image = await NoteImage.delete(req.params.id);
    
    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }
    
    // Emit socket event for real-time updates
    req.app.get('io').emit('note_image_deleted', {
      noteId: image.note_id,
      imageId: image.id
    });
    
    res.json({ message: 'Image deleted successfully', image });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ message: 'Error deleting image', error: error.message });
  }
});

module.exports = router;