const db = require('../db');
const fs = require('fs').promises;
const path = require('path');

/**
 * Diagnostic script to check for missing object images
 * This script does NOT make any changes - it only reports what's missing
 */
async function checkMissingObjectImages() {
  try {
    console.log('[check-missing-images] Starting diagnostic check...\n');

    // Find all objects with local thumbnail URLs
    const result = await db.query(`
      SELECT id, type, title, thumbnail_url, source_url, metadata, created_at
      FROM objects
      WHERE (type = 'book' OR type = 'movie' OR type = 'show')
        AND thumbnail_url IS NOT NULL
        AND thumbnail_url LIKE '/uploads/%'
      ORDER BY created_at DESC
    `);

    const objects = result.rows;
    console.log(`Total objects with local image paths: ${objects.length}\n`);

    const uploadsDir = path.join(__dirname, '../../uploads');
    const missing = [];
    const present = [];
    const stats = {
      book: { total: 0, missing: 0 },
      movie: { total: 0, missing: 0 },
      show: { total: 0, missing: 0 }
    };

    // Check each file
    for (const object of objects) {
      stats[object.type].total++;
      const filePath = path.join(uploadsDir, object.thumbnail_url.replace('/uploads/', ''));

      try {
        await fs.access(filePath);
        present.push(object);
      } catch (error) {
        stats[object.type].missing++;
        missing.push({
          ...object,
          expectedPath: filePath
        });
      }
    }

    // Print summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('                        SUMMARY                            ');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Total objects checked:  ${objects.length}`);
    console.log(`Images present:         ${present.length} (${Math.round((present.length / objects.length) * 100)}%)`);
    console.log(`Images missing:         ${missing.length} (${Math.round((missing.length / objects.length) * 100)}%)`);
    console.log('');
    console.log('By type:');
    console.log(`  Books:  ${stats.book.missing}/${stats.book.total} missing`);
    console.log(`  Movies: ${stats.movie.missing}/${stats.movie.total} missing`);
    console.log(`  Shows:  ${stats.show.missing}/${stats.show.total} missing`);
    console.log('═══════════════════════════════════════════════════════════\n');

    if (missing.length > 0) {
      console.log('Missing images (showing first 20):');
      console.log('───────────────────────────────────────────────────────────');

      missing.slice(0, 20).forEach((obj, index) => {
        console.log(`${index + 1}. [${obj.type.toUpperCase()}] ${obj.title}`);
        console.log(`   ID: ${obj.id}`);
        console.log(`   Expected: ${obj.expectedPath}`);
        console.log(`   Source URL: ${obj.source_url || 'N/A'}`);

        // Check if we have cover URL in metadata
        let hasCoverInMetadata = false;
        if (obj.metadata?.source) {
          if (obj.type === 'book' && obj.metadata.source.cover_url) {
            hasCoverInMetadata = true;
            console.log(`   ✓ Cover URL in metadata: ${obj.metadata.source.cover_url}`);
          } else if ((obj.type === 'movie' || obj.type === 'show') && (obj.metadata.source.poster_path || obj.metadata.source.poster)) {
            hasCoverInMetadata = true;
            const poster = obj.metadata.source.poster_path
              ? `https://image.tmdb.org/t/p/w500${obj.metadata.source.poster_path}`
              : obj.metadata.source.poster;
            console.log(`   ✓ Poster URL in metadata: ${poster}`);
          }
        }

        if (!hasCoverInMetadata && !obj.source_url) {
          console.log(`   ✗ WARNING: No cover URL in metadata AND no source URL - restoration may fail`);
        } else if (!hasCoverInMetadata && obj.source_url) {
          console.log(`   ⚠ No cover URL in metadata, will need to re-extract from source`);
        }

        console.log('');
      });

      if (missing.length > 20) {
        console.log(`... and ${missing.length - 20} more missing images\n`);
      }

      console.log('═══════════════════════════════════════════════════════════');
      console.log('RECOMMENDATION:');
      console.log('Run the restoration script to restore missing images:');
      console.log('  node server/src/scripts/restore-missing-object-images.js');
      console.log('═══════════════════════════════════════════════════════════\n');
    } else {
      console.log('✓ All object images are present! No restoration needed.\n');
    }

    // Check for objects with external URLs (not migrated yet)
    const externalResult = await db.query(`
      SELECT COUNT(*) as count
      FROM objects
      WHERE (type = 'book' OR type = 'movie' OR type = 'show')
        AND thumbnail_url IS NOT NULL
        AND thumbnail_url NOT LIKE '/uploads/%'
    `);

    const externalCount = parseInt(externalResult.rows[0].count);
    if (externalCount > 0) {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('NOTE:');
      console.log(`Found ${externalCount} objects still using external URLs.`);
      console.log('These were never migrated to local storage.');
      console.log('Run migrate-object-images.js to download them.');
      console.log('═══════════════════════════════════════════════════════════\n');
    }

    process.exit(0);
  } catch (error) {
    console.error('[check-missing-images] Check failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  checkMissingObjectImages();
}

module.exports = { checkMissingObjectImages };
