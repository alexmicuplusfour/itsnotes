const db = require('../db');

class NoteImage {
  // Find all images for a note (including full data)
  static async findByNoteId(noteId) {
    const result = await db.query(
      'SELECT * FROM note_images WHERE note_id = $1 ORDER BY created_at ASC',
      [noteId]
    );
    return result.rows;
  }

  // Find only thumbnails and metadata for a note (excludes full image data)
  static async findThumbnailsByNoteId(noteId) {
    const result = await db.query(
      'SELECT id, note_id, thumbnail, name, type, size, created_at FROM note_images WHERE note_id = $1 ORDER BY created_at ASC',
      [noteId]
    );
    return result.rows;
  }

  // Get a single image by ID
  static async findById(id) {
    const result = await db.query(
      'SELECT * FROM note_images WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  // Create a new image
  static async create(imageData) {
    const { note_id, data, thumbnail, name, type, size } = imageData;
    try {
      console.log('Creating image with note_id:', note_id, 'type:', typeof note_id);
      const result = await db.query(
        'INSERT INTO note_images (note_id, data, thumbnail, name, type, size) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [note_id, data, thumbnail, name, type, size]
      );
      return result.rows[0];
    } catch (error) {
      console.error(`Error creating image for note ${note_id}:`, error);
      throw error;
    }
  }

  // Delete an image
  static async delete(id) {
    const result = await db.query(
      'DELETE FROM note_images WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }

  // Delete all images for a note
  static async deleteByNoteId(noteId) {
    const result = await db.query(
      'DELETE FROM note_images WHERE note_id = $1 RETURNING *',
      [noteId]
    );
    return result.rows;
  }
}

module.exports = NoteImage;