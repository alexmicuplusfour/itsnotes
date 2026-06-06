/**
 * Script to populate the plain_content column for all notes that don't have it set yet
 * This copies the content column directly since it's already in plain text format
 */
const db = require('./src/db');

async function populatePlainContent() {
  console.log('Starting to populate plain_content for all notes...');
  
  try {
    // First, get count of notes with null plain_content
    const countQuery = `SELECT COUNT(*) FROM notes WHERE plain_content IS NULL`;
    const countResult = await db.query(countQuery);
    const count = parseInt(countResult.rows[0].count);
    
    console.log(`Found ${count} notes that need plain_content populated.`);
    
    if (count === 0) {
      console.log('No notes need updating. All notes already have plain_content set.');
      return;
    }
    
    // Update all notes, setting plain_content = content
    const updateQuery = `UPDATE notes SET plain_content = content WHERE plain_content IS NULL`;
    const result = await db.query(updateQuery);
    
    console.log(`Successfully updated ${result.rowCount} notes.`);
  } catch (error) {
    console.error('Error populating plain_content:', error);
  } finally {
    process.exit();
  }
}

// Run the function
populatePlainContent();
