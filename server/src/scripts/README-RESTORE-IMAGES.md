# Object Image Restoration Scripts

This directory contains scripts to restore missing object (book/movie/show) cover images after a backup restoration.

## Problem

After restoring the database from backup, object records exist but their cover image files in `/server/uploads/objects/` may be missing. The database has `thumbnail_url` pointing to `/uploads/objects/{type}/{id}.{ext}` but the actual files are gone.

## Solution

Two scripts are provided:

### 1. Check Missing Images (Diagnostic)

**Script:** `check-missing-object-images.js`

Run this first to see what's missing without making any changes.

```bash
cd server
node src/scripts/check-missing-object-images.js
```

**What it does:**
- Scans all objects with local thumbnail URLs
- Checks if the image files actually exist on disk
- Reports statistics (total, missing, by type)
- Shows first 20 missing images with details
- Indicates whether restoration is possible for each

**Output example:**
```
═══════════════════════════════════════════════════════════
                        SUMMARY
═══════════════════════════════════════════════════════════
Total objects checked:  150
Images present:         80 (53%)
Images missing:         70 (47%)

By type:
  Books:  45/100 missing
  Movies: 20/40 missing
  Shows:  5/10 missing
═══════════════════════════════════════════════════════════
```

### 2. Restore Missing Images

**Script:** `restore-missing-object-images.js`

Run this to actually restore the missing images.

```bash
cd server
node src/scripts/restore-missing-object-images.js
```

**What it does:**
1. Finds all objects with local paths (`/uploads/...`)
2. Checks which files are actually missing
3. For each missing file, attempts restoration in this order:
   - **Strategy 1:** Use `metadata.source.cover_url` (for books) or reconstruct TMDB URL (for movies/shows)
   - **Strategy 2:** Re-extract from `source_url` by calling Goodreads or TMDB APIs
4. Downloads the image using the existing `downloadObjectImage()` utility
5. Saves to correct location: `/server/uploads/objects/{type}/{id}.{ext}`
6. Updates database with the local path

**Features:**
- Non-destructive (keeps external URLs as fallback if download fails)
- Handles rate limiting with 1-second delays between downloads
- Detailed progress logging
- Can be run multiple times safely (skips existing files)
- Final summary with success rate

**Output example:**
```
[restore-missing-images] Found 70 missing image files
[restore-missing-images] Starting restoration process...

[restore-missing-images] Restoring: book - The Arrogant Ape
  Found image URL: https://images-na.ssl-images-amazon.com/...
  ✓ Restored and updated: /uploads/objects/book/abc-123.jpg

... (continues for all objects)

[restore-missing-images] Restoration complete!
  Missing files found: 70
  Successfully restored: 68
  Failed: 2
  Success rate: 97%
```

## Restoration Strategies

### For Books (Goodreads)
1. Tries `metadata.source.cover_url` first (stored during original extraction)
2. If not found, re-scrapes Goodreads page using Open Graph Scraper
3. Downloads from Amazon CDN or Goodreads image server

### For Movies/Shows (IMDb)
1. Tries to reconstruct TMDB URL from `metadata.source.poster_path`
2. If not found, queries TMDB API using IMDb ID from `source_url`
3. Downloads from TMDB image CDN (`https://image.tmdb.org/t/p/w500/...`)

## Troubleshooting

### "Failed to download image"
- Original source might be down or URL changed
- Network connectivity issues
- Image URL might be broken

### "No cover URL in metadata AND no source URL"
- Object was created manually without external source
- Cannot be restored automatically
- Need to manually find and add the image

### Rate Limiting
- Script includes 1-second delays between requests
- TMDB API has generous limits (should not be an issue)
- Goodreads scraping might occasionally fail (run script again)

## File Structure

```
server/uploads/objects/
├── book/
│   ├── {uuid1}.jpg
│   ├── {uuid2}.jpg
│   └── ...
├── movie/
│   ├── {uuid3}.jpg
│   └── ...
└── show/
    ├── {uuid4}.jpg
    └── ...
```

## Related Files

- **UserObject.js** (Line 76-110): Object creation with image download
- **downloadObjectImage.js**: Image download utility
- **extractExternalId.js**: Extract IMDb/Goodreads IDs
- **notes.js** (Line 1642-1926): Extraction endpoints
- **migrate-object-images.js**: Original migration script (for external URLs)

## Notes

- Images are downloaded at original resolution and stored as-is
- File extensions are determined from URL or default to `.jpg`
- Duplicate prevention: Won't re-download if file already exists
- Database updates are atomic (either both download and update succeed, or neither)
