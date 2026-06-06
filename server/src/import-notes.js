/**
 * Import Google Keep notes from Takeout export
 * 
 * This script reads JSON files from the Google Keep Takeout export
 * and imports them into the database with proper field mappings.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// Color mapping from Google Keep to our app
const COLOR_MAP = {
  'PINK': 'blossom',
  'GRAY': 'chalk',
  'BROWN': 'clay',
  'RED': 'coral',
  'DEFAULT': 'default',
  'PURPLE': 'dusk',
  'BLUE': 'fog',
  'GREEN': 'mint',
  'ORANGE': 'peach',
  'TEAL': 'sage',
  'YELLOW': 'sand',
  'CERULEAN': 'storm'
};

// Create a database connection based on environment
const createDbClient = () => {
  // Use environment variables for Docker setup
  const connectionConfig = {
    host: process.env.DB_HOST || '192.168.100.128',
    port: process.env.DB_PORT || 5435,
    user: process.env.DB_USER || 'myuser',
    password: process.env.DB_PASSWORD || 'mypassword',
    database: process.env.DB_NAME || 'mydatabase'
  };
  
  console.log('Connecting to database with config:', {
    host: connectionConfig.host,
    port: connectionConfig.port,
    user: connectionConfig.user,
    database: connectionConfig.database
  });
  
  return new Pool(connectionConfig);
};

// Process a single Google Keep note file
async function processNoteFile(filePath, client) {
  // Get a client from the pool for this transaction
  let localClient = null;
  let shouldReleaseClient = false;
  
  try {
    // Use the provided client if available, otherwise get a new one from the pool
    // This ensures a single transaction per note, even in parallel processing
    const data = fs.readFileSync(filePath, 'utf8');
    const note = JSON.parse(data);

    // Map Google Keep fields to our database fields
    const mappedNote = {
      title: note.title || '',
      content: note.textContent || '',
      is_pinned: note.isPinned || false,
      is_archived: note.isArchived || false,
      is_deleted: note.isTrashed || false,
      color: COLOR_MAP[note.color] || 'default',
      // Convert timestamp from microseconds to ISO format for PostgreSQL
      created_at: new Date(note.createdTimestampUsec / 1000).toISOString(),
      updated_at: new Date(note.userEditedTimestampUsec / 1000).toISOString(),
      labels: note.labels || []
    };

    // Begin a transaction
    await client.query('BEGIN');

    try {
      // Insert the note into the database
      const noteQuery = `
        INSERT INTO notes (title, content, plain_content, is_pinned, is_archived, is_deleted, color, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `;

      const noteValues = [
        mappedNote.title,
        mappedNote.content,
        mappedNote.content,
        mappedNote.is_pinned,
        mappedNote.is_archived,
        mappedNote.is_deleted,
        mappedNote.color,
        mappedNote.created_at,
        mappedNote.updated_at
      ];

      const noteResult = await client.query(noteQuery, noteValues);
      const noteId = noteResult.rows[0].id;

      // Process labels if any
      if (mappedNote.labels && mappedNote.labels.length > 0) {
        for (const label of mappedNote.labels) {
          // Make sure label has a name property
          const labelName = typeof label === 'string' ? label : (label.name || '');
          
          if (!labelName.trim()) {
            console.warn(`Skipping empty label for note ${noteId}`);
            continue;
          }
          
          try {
            // Check if tag already exists
            const tagQuery = 'SELECT id FROM tags WHERE name = $1';
            const tagResult = await client.query(tagQuery, [labelName]);
            
            let tagId;
            if (tagResult.rows.length > 0) {
              // Tag exists, use its ID
              tagId = tagResult.rows[0].id;
            } else {
              // Create new tag with a try-catch to handle race conditions
              // (in case another parallel transaction created the same tag)
              try {
                const newTagQuery = 'INSERT INTO tags (name) VALUES ($1) RETURNING id';
                const newTagResult = await client.query(newTagQuery, [labelName]);
                tagId = newTagResult.rows[0].id;
              } catch (tagError) {
                // If insert fails due to unique constraint, get the existing tag ID
                if (tagError.code === '23505') { // Unique violation in PostgreSQL
                  const existingTagResult = await client.query(tagQuery, [labelName]);
                  if (existingTagResult.rows.length > 0) {
                    tagId = existingTagResult.rows[0].id;
                  } else {
                    throw tagError; // Re-throw if we still can't find the tag
                  }
                } else {
                  throw tagError; // Re-throw other errors
                }
              }
            }

            // Associate tag with note (catch potential duplicate inserts)
            try {
              const noteTagQuery = 'INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2)';
              await client.query(noteTagQuery, [noteId, tagId]);
            } catch (noteTagError) {
              // Ignore duplicate key errors for note_tags
              if (noteTagError.code !== '23505') { // Not a unique violation
                throw noteTagError;
              }
            }
          } catch (labelError) {
            console.warn(`Error processing label "${labelName}" for note ${noteId}:`, labelError.message);
            // Continue with other labels rather than failing the entire note
          }
        }
      }

      // Commit the transaction
      await client.query('COMMIT');

      return {
        success: true,
        id: noteId,
        filename: path.basename(filePath),
        labels: mappedNote.labels ? mappedNote.labels.length : 0
      };
    } catch (error) {
      // Rollback the transaction in case of error
      await client.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    return {
      success: false,
      filename: path.basename(filePath),
      error: error.message
    };
  } finally {
    // If we created a local client, release it
    if (localClient && shouldReleaseClient) {
      localClient.release();
    }
  }
}

// Process all note files in the takeout directory
async function processGoogleKeepImport(directoryPath) {
  // Create a database client
  const pool = createDbClient();
  const client = await pool.connect();
  
  console.log('Connected to PostgreSQL');

  try {
    // Get all JSON files in the directory
    const files = fs.readdirSync(directoryPath)
      .filter(file => file.endsWith('.json'))
      .map(file => path.join(directoryPath, file));

    console.log(`Found ${files.length} notes to import`);

    // Process each file
    const results = {
      total: files.length,
      successful: 0,
      failed: 0,
      labelsImported: 0,
      failures: []
    };

    // Process in batches of 50 files to avoid memory issues with large imports
    const BATCH_SIZE = 50;
    const batches = Math.ceil(files.length / BATCH_SIZE);
    
    for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
      const startIndex = batchIndex * BATCH_SIZE;
      const endIndex = Math.min(startIndex + BATCH_SIZE, files.length);
      const batchFiles = files.slice(startIndex, endIndex);
      
      console.log(`Processing batch ${batchIndex + 1}/${batches}, files ${startIndex + 1} to ${endIndex}`);
      
      // Use Promise.all to process files in parallel within each batch
      const batchPromises = batchFiles.map(file => processNoteFile(file, client));
      const batchResults = await Promise.all(batchPromises);
      
      // Aggregate batch results
      for (const result of batchResults) {
        if (result.success) {
          results.successful++;
          results.labelsImported += result.labels || 0;
        } else {
          results.failed++;
          results.failures.push({
            file: result.filename,
            error: result.error
          });
          console.error(`Failed to import ${result.filename}: ${result.error}`);
        }
      }
      
      console.log(`Batch ${batchIndex + 1} complete. Progress: ${endIndex}/${files.length} notes processed.`);
      
      // Force garbage collection if available (Node.js with --expose-gc flag)
      if (global.gc) {
        global.gc();
      }
    }

    console.log('\nImport Summary:');
    console.log(`Total notes: ${results.total}`);
    console.log(`Successfully imported: ${results.successful}`);
    console.log(`Tags/labels imported: ${results.labelsImported}`);
    console.log(`Failed: ${results.failed}`);
    
    if (results.failures.length > 0) {
      console.log('\nFailed imports:');
      results.failures.forEach(failure => {
        console.log(`- ${failure.file}: ${failure.error}`);
      });
    }

    return results;
  } catch (error) {
    console.error('Error during import:', error);
    throw error;
  } finally {
    // Release the client back to the pool
    client.release();
    console.log('Released database client');
  }
}

// Stand-alone execution when script is run directly
if (require.main === module) {
  const takeoutDir = path.resolve(__dirname, '../../itsnotes-takeout');

  // Check if directory exists
  if (!fs.existsSync(takeoutDir)) {
    console.error(`Directory not found: ${takeoutDir}`);
    process.exit(1);
  }

  // Run the import
  processGoogleKeepImport(takeoutDir)
    .then(() => {
      console.log('Import completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
}

// Export functions for use in the API
module.exports = {
  processGoogleKeepImport
};