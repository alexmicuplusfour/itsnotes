const db = require('../db');
const { downloadObjectImage } = require('../utils/downloadObjectImage');

/**
 * Migration script to download all external book/movie images and store them locally
 */
async function migrateObjectImages() {
  try {
    console.log('[migrate-object-images] Starting migration...');

    // Find all books and movies with external thumbnail URLs
    const result = await db.query(`
      SELECT id, type, title, thumbnail_url
      FROM objects
      WHERE (type = 'book' OR type = 'movie')
        AND thumbnail_url IS NOT NULL
        AND thumbnail_url NOT LIKE '/uploads/%'
      ORDER BY created_at DESC
    `);

    const objects = result.rows;
    console.log(`[migrate-object-images] Found ${objects.length} objects with external images`);

    let successCount = 0;
    let failCount = 0;

    for (const object of objects) {
      try {
        console.log(`[migrate-object-images] Processing ${object.type}: ${object.title}`);

        const localPath = await downloadObjectImage(object.thumbnail_url, object.type, object.id);

        if (localPath) {
          // Update the database
          await db.query(
            'UPDATE objects SET thumbnail_url = $1 WHERE id = $2',
            [localPath, object.id]
          );
          console.log(`  ✓ Downloaded and updated: ${localPath}`);
          successCount++;
        } else {
          console.log(`  ✗ Failed to download (keeping external URL)`);
          failCount++;
        }

        // Add a small delay to avoid overwhelming external servers
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`  ✗ Error processing ${object.id}:`, error.message);
        failCount++;
      }
    }

    console.log('[migrate-object-images] Migration complete!');
    console.log(`  Success: ${successCount}`);
    console.log(`  Failed: ${failCount}`);
    console.log(`  Total: ${objects.length}`);

    process.exit(0);
  } catch (error) {
    console.error('[migrate-object-images] Migration failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  migrateObjectImages();
}

module.exports = { migrateObjectImages };
