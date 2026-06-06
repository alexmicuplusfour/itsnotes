const db = require('../db');

class NoteAttachment {
  // Find all attachments for a note
  static async findByNoteId(noteId) {
    const result = await db.query(
      'SELECT * FROM note_attachments WHERE note_id = $1 ORDER BY created_at ASC',
      [noteId]
    );
    return result.rows;
  }

  // Find attachment by ID
  static async findById(id) {
    const result = await db.query(
      'SELECT * FROM note_attachments WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  // Create a new attachment record
  static async create({ note_id, file_path, original_name, mime_type, size }) {
    const result = await db.query(
      'INSERT INTO note_attachments (note_id, file_path, original_name, mime_type, size) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [note_id, file_path, original_name, mime_type, size]
    );
    return result.rows[0];
  }

  // Delete an attachment record
  static async delete(id) {
    const result = await db.query(
      'DELETE FROM note_attachments WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }
}

module.exports = NoteAttachment;
