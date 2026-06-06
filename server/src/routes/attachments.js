const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const NoteAttachment = require('../models/NoteAttachment');
const Note = require('../models/Note');
const demoReset = require('../services/demoReset');

const DEMO_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in demo mode
const DEMO_ALLOWED_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'text/plain', 'text/markdown', 'text/csv',
]);

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const demoFileFilter = (req, file, cb) => {
  if (DEMO_ALLOWED_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('This file type is not allowed in demo mode.'));
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: demoReset.isEnabled() ? DEMO_MAX_FILE_SIZE : 1024 * 1024 * 1024
  },
  fileFilter: demoReset.isEnabled() ? demoFileFilter : undefined
});

// Clean up any partially-written file when multer itself errors (e.g. size limit, fileFilter rejection)
const handleUploadError = (err, req, res, next) => {
  if (req.file && req.file.path && fs.existsSync(req.file.path)) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: `File too large. Maximum size in demo mode is 10MB.` });
  }
  return res.status(400).json({ message: err.message || 'Upload rejected.' });
};

// Upload attachment
router.post('/notes/:noteId/attachments', upload.single('file'), async (req, res) => {
  try {
    const { noteId } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Verify note exists
    const note = await Note.findById(noteId);
    if (!note) {
      // Clean up uploaded file if note doesn't exist
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: 'Note not found' });
    }

    const attachment = await NoteAttachment.create({
      note_id: noteId,
      file_path: req.file.filename, // Store only filename, relative to uploads dir
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      size: req.file.size
    });

    res.status(201).json(attachment);
  } catch (error) {
    console.error('Error uploading attachment:', error);
    // Try to clean up file if database insert fails
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error('Error cleaning up file:', e);
      }
    }
    res.status(500).json({ message: 'Error uploading attachment', error: error.message });
  }
});
router.use('/notes/:noteId/attachments', handleUploadError);

// Get all attachments for a note
router.get('/notes/:noteId/attachments', async (req, res) => {
  try {
    const { noteId } = req.params;
    const attachments = await NoteAttachment.findByNoteId(noteId);
    res.json(attachments);
  } catch (error) {
    console.error('Error fetching attachments:', error);
    res.status(500).json({ message: 'Error fetching attachments', error: error.message });
  }
});

// Download attachment
router.get('/attachments/:id', async (req, res) => {
  try {
    const attachment = await NoteAttachment.findById(req.params.id);
    
    if (!attachment) {
      return res.status(404).json({ message: 'Attachment not found' });
    }

    const filePath = path.join(__dirname, '../../uploads', attachment.file_path);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found on server' });
    }

    res.download(filePath, attachment.original_name);
  } catch (error) {
    console.error('Error downloading attachment:', error);
    res.status(500).json({ message: 'Error downloading attachment', error: error.message });
  }
});

// Delete attachment
router.delete('/attachments/:id', async (req, res) => {
  try {
    const attachment = await NoteAttachment.findById(req.params.id);
    
    if (!attachment) {
      return res.status(404).json({ message: 'Attachment not found' });
    }

    // Delete from database
    await NoteAttachment.delete(req.params.id);

    // Delete from filesystem
    const filePath = path.join(__dirname, '../../uploads', attachment.file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ message: 'Attachment deleted successfully' });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ message: 'Error deleting attachment', error: error.message });
  }
});

module.exports = router;
