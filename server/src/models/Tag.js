const db = require('../db');

class Tag {
  static async findAll() {
    const result = await db.query(`
      SELECT * FROM tags
      ORDER BY is_folder DESC, name ASC
    `);
    return result.rows;
  }

  static async findAllWithCounts() {
    const result = await db.query(`
      SELECT
        t.*,
        COALESCE(note_stats.count, 0) as note_count,
        note_stats.temporal_center
      FROM tags t
      LEFT JOIN (
        SELECT
          nt.tag_id,
          COUNT(*) as count,
          AVG(EXTRACT(EPOCH FROM n.created_at)) as temporal_center
        FROM note_tags nt
        INNER JOIN notes n ON nt.note_id = n.id
        WHERE n.is_deleted = false
        GROUP BY nt.tag_id
      ) note_stats ON t.id = note_stats.tag_id
      ORDER BY t.is_folder DESC, t.name ASC
    `);

    // Convert note_count from string to number, keep temporal_center as is
    return result.rows.map(tag => ({
      ...tag,
      note_count: parseInt(tag.note_count) || 0,
      temporal_center: tag.temporal_center ? parseFloat(tag.temporal_center) : null
    }));
  }

  static async findById(id) {
    const result = await db.query('SELECT * FROM tags WHERE id = $1', [id]);
    return result.rows[0];
  }

  static async findByName(name, parentId = null) {
    const result = await db.query(
      'SELECT * FROM tags WHERE LOWER(name) = LOWER($1) AND (($2::uuid IS NULL AND parent_id IS NULL) OR parent_id = $2::uuid)',
      [name, parentId]
    );
    return result.rows[0];
  }

  static async create(name, visible = true, isFolder = false, parentId = null) {
    const result = await db.query(
      'INSERT INTO tags (name, visible, is_folder, parent_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, visible, isFolder, parentId]
    );
    return result.rows[0];
  }

  static async update(id, updates) {
    // Build dynamic query based on provided updates
    const fields = [];
    const values = [];
    let paramIndex = 1;
    
    // Add name to query if provided
    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex}`);
      values.push(updates.name);
      paramIndex++;
    }
    
    // Add visible to query if provided
    if (updates.visible !== undefined) {
      fields.push(`visible = $${paramIndex}`);
      values.push(updates.visible);
      paramIndex++;
    }

    // Add is_folder to query if provided
    if (updates.isFolder !== undefined) {
      fields.push(`is_folder = $${paramIndex}`);
      values.push(updates.isFolder);
      paramIndex++;
    }

    // Add parent_id to query if provided (null is a valid value to clear parent)
    if (updates.parentId !== undefined) {
      fields.push(`parent_id = $${paramIndex}`);
      values.push(updates.parentId);
      paramIndex++;
    }

    // If no updates were provided, return null
    if (fields.length === 0) {
      return null;
    }
    
    // Add the id as the last parameter
    values.push(id);
    
    const query = `
      UPDATE tags 
      SET ${fields.join(', ')} 
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await db.query(query, values);
    return result.rows[0];
  }
  
  static async updateName(id, name) {
    return this.update(id, { name });
  }
  
  static async toggleVisibility(id, visible) {
    return this.update(id, { visible });
  }

  static async delete(id) {
    const result = await db.query(
      'DELETE FROM tags WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }

  // Tag-Note relationships
  static async findNotesByTagId(tagId, { page = 1, limit = 40 }) {
    const offset = (page - 1) * limit;
    const query = `
      SELECT n.* 
      FROM notes n
      JOIN note_tags nt ON n.id = nt.note_id
      WHERE nt.tag_id = $1
      AND n.is_deleted = false
      ORDER BY n.is_pinned DESC, n.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await db.query(query, [tagId, limit, offset]);
    return result.rows;
  }

  static async findTagsByNoteId(noteId) {
    const query = `
      SELECT t.*
      FROM tags t
      JOIN note_tags nt ON t.id = nt.tag_id
      WHERE nt.note_id = $1
      ORDER BY t.is_folder DESC, t.name ASC
    `;
    const result = await db.query(query, [noteId]);
    return result.rows;
  }

  static async addTagToNote(noteId, tagId) {
    try {
      const result = await db.query(
        'INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2) RETURNING *',
        [noteId, tagId]
      );
      return result.rows[0];
    } catch (error) {
      // If the relation already exists, just return it
      if (error.code === '23505') { // Unique violation
        const result = await db.query(
          'SELECT * FROM note_tags WHERE note_id = $1 AND tag_id = $2',
          [noteId, tagId]
        );
        return result.rows[0];
      }
      throw error;
    }
  }

  static async removeTagFromNote(noteId, tagId) {
    const result = await db.query(
      'DELETE FROM note_tags WHERE note_id = $1 AND tag_id = $2 RETURNING *',
      [noteId, tagId]
    );
    return result.rows[0];
  }

  static async getTagCount(tagId) {
    const result = await db.query(
      'SELECT COUNT(*) FROM note_tags WHERE tag_id = $1',
      [tagId]
    );
    return parseInt(result.rows[0].count);
  }

  // --- Bulk Tag Operations ---
  static async bulkAddTagToNotes(noteIds, tagId) {
    if (!Array.isArray(noteIds) || noteIds.length === 0 || !tagId) {
      throw new Error('Invalid input for bulkAddTagToNotes');
    }

    // Construct values string for multi-row insert: ($1, $3), ($2, $3), ...
    const valuePlaceholders = noteIds.map((_, index) => `($${index + 1}, $${noteIds.length + 1})`).join(',');
    const values = [...noteIds, tagId];

    const query = `
      INSERT INTO note_tags (note_id, tag_id)
      VALUES ${valuePlaceholders}
      ON CONFLICT (note_id, tag_id) DO NOTHING
    `;

    try {
      const result = await db.query(query, values);
      // result.rowCount might not be reliable with ON CONFLICT DO NOTHING in all PG versions/configs
      // We can't easily return the *actual* number of rows inserted without more complex queries.
      // Returning a success indicator is usually sufficient here.
      console.log(`Bulk add tag ${tagId} to notes ${noteIds.join(',')}: Affected rows (approx) = ${result.rowCount}`);
      return { success: true, updatedCount: result.rowCount }; // Return rowCount as an indicator
    } catch (error) {
      console.error(`Error in bulkAddTagToNotes for tag ${tagId} and notes ${noteIds.join(',')}:`, error);
      throw error;
    }
  }

  static async bulkRemoveTagFromNotes(noteIds, tagId) {
    if (!Array.isArray(noteIds) || noteIds.length === 0 || !tagId) {
      throw new Error('Invalid input for bulkRemoveTagFromNotes');
    }

    // Use ANY($1::uuid[]) for efficient deletion across multiple note IDs
    const query = `
      DELETE FROM note_tags
      WHERE note_id = ANY($1::uuid[]) AND tag_id = $2
    `;
    const values = [noteIds, tagId];

    try {
      const result = await db.query(query, values);
      console.log(`Bulk remove tag ${tagId} from notes ${noteIds.join(',')}: Affected rows = ${result.rowCount}`);
      return { success: true, updatedCount: result.rowCount };
    } catch (error) {
      console.error(`Error in bulkRemoveTagFromNotes for tag ${tagId} and notes ${noteIds.join(',')}:`, error);
      throw error;
    }
  }

  // Enhanced bulk tag operations that return complete updated notes
  static async bulkAddTagToNotesWithNotes(noteIds, tagId) {
    if (!Array.isArray(noteIds) || noteIds.length === 0 || !tagId) {
      throw new Error('Invalid input for bulkAddTagToNotesWithNotes');
    }

    // First perform the tag addition
    await this.bulkAddTagToNotes(noteIds, tagId);

    // Then fetch and return the complete updated notes
    const Note = require('./Note'); // Import Note model here to avoid circular dependency
    
    // Fetch the updated notes with all their data
    const placeholders = noteIds.map((_, index) => `$${index + 1}`).join(',');
    const notesQuery = `
      SELECT * FROM notes 
      WHERE id IN (${placeholders}) 
      AND is_deleted = false
      ORDER BY is_pinned DESC, updated_at DESC
    `;
    
    const result = await db.query(notesQuery, noteIds);
    const notes = result.rows;

    // Add tags, images, and objects to get complete notes with metadataSearchable
    if (notes.length > 0) {
      await Note.addTagsAndImages(notes);
      await Note.addObjects(notes);
    }

    return notes;
  }

  static async bulkRemoveTagFromNotesWithNotes(noteIds, tagId) {
    if (!Array.isArray(noteIds) || noteIds.length === 0 || !tagId) {
      throw new Error('Invalid input for bulkRemoveTagFromNotesWithNotes');
    }

    // First perform the tag removal
    await this.bulkRemoveTagFromNotes(noteIds, tagId);

    // Then fetch and return the complete updated notes
    const Note = require('./Note'); // Import Note model here to avoid circular dependency

    // Fetch the updated notes with all their data
    const placeholders = noteIds.map((_, index) => `$${index + 1}`).join(',');
    const notesQuery = `
      SELECT * FROM notes
      WHERE id IN (${placeholders})
      AND is_deleted = false
      ORDER BY is_pinned DESC, updated_at DESC
    `;

    const result = await db.query(notesQuery, noteIds);
    const notes = result.rows;

    // Add tags, images, and objects to get complete notes with metadataSearchable
    if (notes.length > 0) {
      await Note.addTagsAndImages(notes);
      await Note.addObjects(notes);
    }

    return notes;
  }
}

module.exports = Tag;
