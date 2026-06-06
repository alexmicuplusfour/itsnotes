/**
 * Extract external ID from IMDb or Goodreads URLs
 * @param {string} url - The source URL
 * @returns {string|null} - The extracted external ID or null
 */
function extractExternalId(url) {
  if (!url) return null;

  // IMDb: extract tt1234567 from URLs like:
  // https://www.imdb.com/title/tt1234567/
  // https://www.imdb.com/title/tt1234567/?ref_=fn_t_1
  const imdbMatch = url.match(/imdb\.com\/title\/(tt\d+)/);
  if (imdbMatch) {
    return imdbMatch[1];
  }

  // Goodreads: extract numeric ID from URLs like:
  // https://www.goodreads.com/book/show/222683908-the-arrogant-ape
  // https://www.goodreads.com/book/show/123632.Man_and_His_Symbols
  // https://www.goodreads.com/book/show/13573270-healing-developmental-trauma
  const goodreadsMatch = url.match(/goodreads\.com\/book\/show\/(\d+)/);
  if (goodreadsMatch) {
    return `gr${goodreadsMatch[1]}`; // Prefix with 'gr' to distinguish from IMDb IDs
  }

  return null;
}

module.exports = { extractExternalId };
