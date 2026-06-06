const db = require('../db');
const { downloadObjectImage } = require('../utils/downloadObjectImage');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

/**
 * Enhanced migration script to restore missing object images
 *
 * This script:
 * 1. Finds all objects with local thumbnail URLs (/uploads/...)
 * 2. Checks if the image file actually exists on disk
 * 3. For missing files, attempts to restore by:
 *    a. Using metadata.source.cover_url if available
 *    b. Re-extracting from source_url if needed
 * 4. Downloads and saves the image
 * 5. Updates the database
 */
async function restoreMissingObjectImages() {
  try {
    console.log('[restore-missing-images] Starting restoration...');

    // Find all objects with local thumbnail URLs
    const result = await db.query(`
      SELECT id, type, title, thumbnail_url, source_url, metadata
      FROM objects
      WHERE (type = 'book' OR type = 'movie' OR type = 'show')
        AND thumbnail_url IS NOT NULL
        AND thumbnail_url LIKE '/uploads/%'
      ORDER BY created_at DESC
    `);

    const objects = result.rows;
    console.log(`[restore-missing-images] Found ${objects.length} objects with local image paths`);

    let missingCount = 0;
    let restoredCount = 0;
    let failedCount = 0;
    const missingObjects = [];

    // Check which files are actually missing
    const uploadsDir = path.join(__dirname, '../../uploads');

    for (const object of objects) {
      const filePath = path.join(uploadsDir, object.thumbnail_url.replace('/uploads/', ''));

      try {
        await fs.access(filePath);
        // File exists, skip
      } catch (error) {
        // File is missing
        missingCount++;
        missingObjects.push(object);
        console.log(`[restore-missing-images] Missing: ${object.type} - ${object.title}`);
        console.log(`  Expected path: ${filePath}`);
      }
    }

    console.log(`\n[restore-missing-images] Found ${missingCount} missing image files`);

    if (missingCount === 0) {
      console.log('[restore-missing-images] All images are present! Nothing to restore.');
      return;
    }

    console.log(`[restore-missing-images] Starting restoration process...\n`);

    // Attempt to restore each missing image
    for (const object of missingObjects) {
      try {
        console.log(`[restore-missing-images] Restoring: ${object.type} - ${object.title}`);

        let imageUrl = null;

        // Strategy 1: Try to get cover URL from metadata
        if (object.metadata?.source) {
          const source = object.metadata.source;

          if (object.type === 'book') {
            imageUrl = source.cover_url;
          } else if (object.type === 'movie' || object.type === 'show') {
            // TMDB poster path is stored in metadata
            if (source.poster_path) {
              imageUrl = `https://image.tmdb.org/t/p/w500${source.poster_path}`;
            } else if (source.poster) {
              imageUrl = source.poster;
            }
          }
        }

        // Strategy 2: If no URL in metadata, try to re-extract from source
        if (!imageUrl && object.source_url) {
          console.log(`  No cover URL in metadata, attempting re-extraction from ${object.source_url}`);

          if (object.type === 'book' && object.source_url.includes('goodreads.com')) {
            imageUrl = await extractGoodreadsCover(object.source_url);
          } else if ((object.type === 'movie' || object.type === 'show') && object.source_url.includes('imdb.com')) {
            imageUrl = await extractImdbCover(object.source_url, object.type);
          }
        }

        if (!imageUrl) {
          console.log(`  ✗ Could not find image URL for ${object.title}`);
          failedCount++;
          continue;
        }

        console.log(`  Found image URL: ${imageUrl}`);

        // Download the image
        const localPath = await downloadObjectImage(imageUrl, object.type, object.id);

        if (localPath) {
          // Update the database
          await db.query(
            'UPDATE objects SET thumbnail_url = $1 WHERE id = $2',
            [localPath, object.id]
          );
          console.log(`  ✓ Restored and updated: ${localPath}`);
          restoredCount++;
        } else {
          console.log(`  ✗ Failed to download image`);
          failedCount++;
        }

        // Add a small delay to avoid overwhelming external servers
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`  ✗ Error processing ${object.id}:`, error.message);
        failedCount++;
      }
    }

    console.log('\n[restore-missing-images] Restoration complete!');
    console.log(`  Missing files found: ${missingCount}`);
    console.log(`  Successfully restored: ${restoredCount}`);
    console.log(`  Failed: ${failedCount}`);
    console.log(`  Success rate: ${Math.round((restoredCount / missingCount) * 100)}%`);

    process.exit(0);
  } catch (error) {
    console.error('[restore-missing-images] Restoration failed:', error);
    process.exit(1);
  }
}

/**
 * Extract cover URL from Goodreads page
 */
async function extractGoodreadsCover(url) {
  try {
    const ogs = require('open-graph-scraper');
    const { result } = await ogs({ url });

    if (result.success) {
      // Try JSON-LD first
      if (result.jsonLD) {
        const ld = Array.isArray(result.jsonLD)
          ? result.jsonLD.find(item => item['@type'] === 'Book') || result.jsonLD[0]
          : result.jsonLD;

        if (ld?.image) {
          return ld.image;
        }
      }

      // Fallback to Open Graph image
      if (result.ogImage?.[0]?.url) {
        return result.ogImage[0].url;
      }
    }

    return null;
  } catch (error) {
    console.error(`    Failed to extract Goodreads cover:`, error.message);
    return null;
  }
}

/**
 * Extract poster URL from IMDb via TMDB API
 */
async function extractImdbCover(url, type) {
  try {
    // Extract IMDb ID
    const imdbIdMatch = url.match(/title\/(tt\d+)/);
    if (!imdbIdMatch) {
      console.error(`    Could not extract IMDb ID from URL`);
      return null;
    }

    const imdbId = imdbIdMatch[1];
    const TMDB_API_KEY = '77d62c169cf122c2698d971b6a43fa6a';

    // Find by IMDb ID
    const findResponse = await axios.get(`https://api.themoviedb.org/3/find/${imdbId}`, {
      params: {
        api_key: TMDB_API_KEY,
        external_source: 'imdb_id'
      }
    });

    const movieResults = findResponse.data.movie_results || [];
    const tvResults = findResponse.data.tv_results || [];

    let posterPath = null;

    if (type === 'movie' && movieResults.length > 0) {
      posterPath = movieResults[0].poster_path;
    } else if (type === 'show' && tvResults.length > 0) {
      posterPath = tvResults[0].poster_path;
    } else if (movieResults.length > 0) {
      posterPath = movieResults[0].poster_path;
    } else if (tvResults.length > 0) {
      posterPath = tvResults[0].poster_path;
    }

    if (posterPath) {
      return `https://image.tmdb.org/t/p/w500${posterPath}`;
    }

    return null;
  } catch (error) {
    console.error(`    Failed to extract IMDb cover:`, error.message);
    return null;
  }
}

// Run if called directly
if (require.main === module) {
  restoreMissingObjectImages();
}

module.exports = { restoreMissingObjectImages };
