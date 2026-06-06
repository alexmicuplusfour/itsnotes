const db = require('../db');

/**
 * Migrate books from old finished_at format to new reads array format
 *
 * Old format:
 * metadata.user.finished_at: "2025-12-16T01:25:35.209Z"
 *
 * New format:
 * metadata.user.reads: [
 *   { started_at: null, finished_at: "2025-12-16T01:25:35.209Z" }
 * ]
 */
async function migrateToReadsArray() {
  console.log('Starting migration of finished_at to reads array...\n');

  try {
    // Find all book objects that have finished_at but no reads array
    const result = await db.query(`
      SELECT id, metadata
      FROM objects
      WHERE type = 'book'
        AND metadata->'user'->>'finished_at' IS NOT NULL
        AND (metadata->'user'->'reads' IS NULL OR jsonb_array_length(metadata->'user'->'reads') = 0)
    `);

    const booksToMigrate = result.rows;
    console.log(`Found ${booksToMigrate.length} books to migrate\n`);

    if (booksToMigrate.length === 0) {
      console.log('No books need migration. All done!');
      return;
    }

    let migrated = 0;
    let failed = 0;

    for (const book of booksToMigrate) {
      try {
        const finishedAt = book.metadata.user.finished_at;

        // Create reads array with the finished_at date
        const reads = [{
          started_at: null, // We don't have the started date from old format
          finished_at: finishedAt
        }];

        // Update the book with the new reads array
        await db.query(`
          UPDATE objects
          SET metadata = jsonb_set(
            metadata,
            '{user,reads}',
            $1::jsonb
          )
          WHERE id = $2
        `, [JSON.stringify(reads), book.id]);

        migrated++;
        console.log(`✓ Migrated book ${book.id}`);
      } catch (error) {
        failed++;
        console.error(`✗ Failed to migrate book ${book.id}:`, error.message);
      }
    }

    console.log(`\n=== Migration Complete ===`);
    console.log(`Total books: ${booksToMigrate.length}`);
    console.log(`Migrated: ${migrated}`);
    console.log(`Failed: ${failed}`);

  } catch (error) {
    console.error('Migration error:', error);
  }
}

// Run if called directly
if (require.main === module) {
  migrateToReadsArray()
    .then(() => {
      console.log('\nMigration script finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script error:', error);
      process.exit(1);
    });
}

module.exports = { migrateToReadsArray };
