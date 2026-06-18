const db = require('../db');
const { downloadObjectImage } = require('../utils/downloadObjectImage');
const { extractExternalId } = require('../utils/extractExternalId');

class UserObject {
  // Find all objects for a user, optionally filtered by type
  static async findByUserId(userId, type = null) {
    let query = 'SELECT * FROM objects WHERE user_id = $1';
    const params = [userId];
    
    if (type) {
      query += ' AND type = $2';
      params.push(type);
    }
    
    query += ' ORDER BY updated_at DESC';
    
    const result = await db.query(query, params);
    return result.rows;
  }

  // Find object by ID
  static async findById(id) {
    const result = await db.query(
      'SELECT * FROM objects WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  // Find object by source URL for a user (for deduplication)
  static async findBySourceUrl(userId, sourceUrl) {
    const result = await db.query(
      'SELECT * FROM objects WHERE user_id = $1 AND source_url = $2',
      [userId, sourceUrl]
    );
    return result.rows[0];
  }

  // Find object by external ID for a user (for deduplication)
  static async findByExternalId(userId, externalId) {
    const result = await db.query(
      'SELECT * FROM objects WHERE user_id = $1 AND external_id = $2',
      [userId, externalId]
    );
    return result.rows[0];
  }

  // Search objects by title (for @mention autocomplete)
  static async search(userId, searchTerm, type = null, limit = 10) {
    let query = `
      SELECT * FROM objects 
      WHERE user_id = $1 
        AND (
          title ILIKE $2 
          OR to_tsvector('english', title) @@ plainto_tsquery('english', $3)
        )
    `;
    const params = [userId, `%${searchTerm}%`, searchTerm];
    
    if (type) {
      query += ` AND type = $4`;
      params.push(type);
    }
    
    query += ` ORDER BY 
      CASE WHEN title ILIKE $2 THEN 0 ELSE 1 END,
      updated_at DESC
      LIMIT ${parseInt(limit)}`;
    
    const result = await db.query(query, params);
    return result.rows;
  }

  // Create a new object
  static async create({ user_id, type, title, thumbnail_url, source_url, metadata }) {
    // Extract external ID from source URL if present
    const external_id = source_url ? extractExternalId(source_url) : null;

    // First insert to get the object ID
    const result = await db.query(
      `INSERT INTO objects (user_id, type, title, thumbnail_url, source_url, external_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [user_id, type, title, thumbnail_url || null, source_url || null, external_id, metadata || {}]
    );

    const object = result.rows[0];

    // Download and store image for books, movies, and shows (async, don't block)
    if ((type === 'book' || type === 'movie' || type === 'show') && thumbnail_url) {
      downloadObjectImage(thumbnail_url, type, object.id)
        .then(async (localPath) => {
          if (localPath) {
            // Update the object with the local path
            await db.query(
              'UPDATE objects SET thumbnail_url = $1 WHERE id = $2',
              [localPath, object.id]
            );
            console.log(`[UserObject.create] Updated ${type} ${object.id} with local image: ${localPath}`);
          }
        })
        .catch(err => {
          console.error(`[UserObject.create] Failed to download image for ${type} ${object.id}:`, err.message);
          // Keep the external URL as fallback
        });
    }

    return object;
  }

  // Create or find existing object by external ID or source URL (upsert for external sources)
  static async findOrCreate({ user_id, type, title, thumbnail_url, source_url, metadata }) {
    // First try to find by external ID (more reliable for deduplication)
    if (source_url) {
      const external_id = extractExternalId(source_url);
      if (external_id) {
        const existing = await this.findByExternalId(user_id, external_id);
        if (existing) {
          return { object: existing, created: false };
        }
      }

      // Fallback to source URL for objects without external ID
      const existing = await this.findBySourceUrl(user_id, source_url);
      if (existing) {
        return { object: existing, created: false };
      }
    }

    // Create new
    const object = await this.create({ user_id, type, title, thumbnail_url, source_url, metadata });
    return { object, created: true };
  }

  // Update an object
  static async update(id, updates) {
    const { title, thumbnail_url, metadata } = updates;
    
    // Build dynamic update query
    const setClauses = [];
    const params = [];
    let paramIndex = 1;
    
    if (title !== undefined) {
      setClauses.push(`title = $${paramIndex++}`);
      params.push(title);
    }
    if (thumbnail_url !== undefined) {
      setClauses.push(`thumbnail_url = $${paramIndex++}`);
      params.push(thumbnail_url);
    }
    if (metadata !== undefined) {
      setClauses.push(`metadata = $${paramIndex++}`);
      params.push(metadata);
    }
    
    if (setClauses.length === 0) {
      return this.findById(id);
    }
    
    params.push(id);
    const result = await db.query(
      `UPDATE objects SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );
    return result.rows[0];
  }

  // Partially update metadata (deep merge)
  static async updateMetadata(id, metadataUpdates) {
    // Use jsonb_set or || operator for partial updates
    const result = await db.query(
      `UPDATE objects 
       SET metadata = metadata || $1::jsonb 
       WHERE id = $2 
       RETURNING *`,
      [JSON.stringify(metadataUpdates), id]
    );
    return result.rows[0];
  }

  // Update user-specific state within metadata (e.g., reading progress)
  static async updateUserState(id, userStateUpdates) {
    const result = await db.query(
      `UPDATE objects 
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb), 
         '{user}', 
         COALESCE(metadata->'user', '{}'::jsonb) || $1::jsonb
       )
       WHERE id = $2 
       RETURNING *`,
      [JSON.stringify(userStateUpdates), id]
    );
    return result.rows[0];
  }

  // Delete an object
  static async delete(id) {
    const result = await db.query(
      'DELETE FROM objects WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }

  // Get all notes that reference this object
  static async getReferencingNotes(objectId) {
    const result = await db.query(
      `SELECT n.* FROM notes n
       INNER JOIN note_objects no ON n.id = no.note_id
       WHERE no.object_id = $1
       ORDER BY no.created_at DESC`,
      [objectId]
    );
    return result.rows;
  }

  // Get all objects referenced in a note
  static async getObjectsInNote(noteId) {
    const result = await db.query(
      `SELECT o.* FROM objects o
       INNER JOIN note_objects no ON o.id = no.object_id
       WHERE no.note_id = $1
       ORDER BY no.created_at ASC`,
      [noteId]
    );
    return result.rows;
  }

  // Link an object to a note
  static async linkToNote(objectId, noteId) {
    const result = await db.query(
      `INSERT INTO note_objects (object_id, note_id) 
       VALUES ($1, $2) 
       ON CONFLICT (note_id, object_id) DO NOTHING
       RETURNING *`,
      [objectId, noteId]
    );
    return result.rows[0];
  }

  // Unlink an object from a note
  static async unlinkFromNote(objectId, noteId) {
    const result = await db.query(
      'DELETE FROM note_objects WHERE object_id = $1 AND note_id = $2 RETURNING *',
      [objectId, noteId]
    );
    return result.rows[0];
  }

  // Sync note-object links (replace all links for a note with new set)
  static async syncNoteLinks(noteId, objectIds) {
    // Nothing to insert: a single DELETE clears any links left from a removed
    // card without paying for a pooled connection + transaction round-trips.
    // This is the common case (notes with no object cards).
    if (!objectIds || objectIds.length === 0) {
      await db.query('DELETE FROM note_objects WHERE note_id = $1', [noteId]);
      return;
    }

    // Replace links atomically when there are cards to insert.
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM note_objects WHERE note_id = $1', [noteId]);

      const values = objectIds.map((objId, i) => `($1, $${i + 2})`).join(', ');
      await client.query(
        `INSERT INTO note_objects (note_id, object_id) VALUES ${values}`,
        [noteId, ...objectIds]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = UserObject;
