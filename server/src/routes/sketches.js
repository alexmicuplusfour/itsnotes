const express = require('express');
const NoteSketch = require('../models/NoteSketch');
const Note = require('../models/Note');
const router = express.Router();

// List sketch stubs (thumbnail + metadata) for a note
router.get('/notes/:noteId/sketches', async (req, res) => {
  try {
    const note = await Note.findById(req.params.noteId);
    if (!note) return res.status(404).json({ message: 'Note not found' });
    const sketches = await NoteSketch.findByNoteId(req.params.noteId);
    res.json({ sketches });
  } catch (err) {
    console.error('Error fetching sketches:', err);
    res.status(500).json({ message: 'Error fetching sketches', error: err.message });
  }
});

// Create a new sketch for a note
router.post('/notes/:noteId/sketches', async (req, res) => {
  try {
    const note = await Note.findById(req.params.noteId);
    if (!note) return res.status(404).json({ message: 'Note not found' });
    const { width = 800, height = 300 } = req.body;
    const sketch = await NoteSketch.create(req.params.noteId, width, height);
    req.app.get('io').emit('note_sketch_added', { noteId: req.params.noteId, sketch });
    res.status(201).json({ sketch });
  } catch (err) {
    console.error('Error creating sketch:', err);
    res.status(500).json({ message: 'Error creating sketch', error: err.message });
  }
});

// Get full sketch data (strokes)
router.get('/sketches/:id', async (req, res) => {
  try {
    const sketch = await NoteSketch.findById(req.params.id);
    if (!sketch) return res.status(404).json({ message: 'Sketch not found' });
    res.json({ sketch });
  } catch (err) {
    console.error('Error fetching sketch:', err);
    res.status(500).json({ message: 'Error fetching sketch', error: err.message });
  }
});

// Save updated strokes + thumbnail
router.put('/sketches/:id', async (req, res) => {
  try {
    const { strokes, thumbnail } = req.body;
    if (!Array.isArray(strokes)) return res.status(400).json({ message: 'strokes must be an array' });
    const sketch = await NoteSketch.update(req.params.id, strokes, thumbnail || null);
    if (!sketch) return res.status(404).json({ message: 'Sketch not found' });
    req.app.get('io').emit('note_sketch_updated', { noteId: sketch.note_id, sketchId: sketch.id });
    res.json({ sketch });
  } catch (err) {
    console.error('Error updating sketch:', err);
    res.status(500).json({ message: 'Error updating sketch', error: err.message });
  }
});

// Delete a sketch
router.delete('/sketches/:id', async (req, res) => {
  try {
    const sketch = await NoteSketch.delete(req.params.id);
    if (!sketch) return res.status(404).json({ message: 'Sketch not found' });
    req.app.get('io').emit('note_sketch_deleted', { noteId: sketch.note_id, sketchId: sketch.id });
    res.json({ message: 'Sketch deleted', sketch });
  } catch (err) {
    console.error('Error deleting sketch:', err);
    res.status(500).json({ message: 'Error deleting sketch', error: err.message });
  }
});

// Raw thumbnail bytes
router.get('/sketches/:id/thumbnail', async (req, res) => {
  try {
    const sketch = await NoteSketch.findById(req.params.id);
    if (!sketch || !sketch.thumbnail) return res.status(404).json({ message: 'Thumbnail not found' });
    const match = /^data:([^;]+);base64,(.*)$/s.exec(sketch.thumbnail);
    if (!match) return res.status(415).json({ message: 'Invalid thumbnail data' });
    const buffer = Buffer.from(match[2], 'base64');
    res.set('Content-Type', match[1]);
    res.set('Cache-Control', 'private, max-age=0');
    res.set('Content-Length', String(buffer.length));
    res.send(buffer);
  } catch (err) {
    console.error('Error streaming thumbnail:', err);
    res.status(500).json({ message: 'Error streaming thumbnail', error: err.message });
  }
});

module.exports = router;
