const db = require('../db');

class NoteSketch {
  static async findByNoteId(noteId) {
    const result = await db.query(
      'SELECT id, note_id, thumbnail, width, height, created_at, updated_at FROM note_sketches WHERE note_id = $1 ORDER BY created_at ASC',
      [noteId]
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await db.query(
      'SELECT * FROM note_sketches WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async create(noteId, width, height) {
    const result = await db.query(
      'INSERT INTO note_sketches (note_id, strokes, width, height) VALUES ($1, $2, $3, $4) RETURNING *',
      [noteId, JSON.stringify([]), width, height]
    );
    return result.rows[0];
  }

  static async update(id, strokes, thumbnail) {
    const result = await db.query(
      'UPDATE note_sketches SET strokes = $1, thumbnail = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [JSON.stringify(strokes), thumbnail, id]
    );
    return result.rows[0];
  }

  static async delete(id) {
    const result = await db.query(
      'DELETE FROM note_sketches WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }
}

module.exports = NoteSketch;
