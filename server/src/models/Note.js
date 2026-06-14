const { db } = require('../knex');
const Reminder = require('./Reminder');
const { convertHtmlToPlainText } = require('../utils/htmlToPlainText');

/**
 * SearchQueryBuilder - A unified query builder for all note search operations
 * Provides consistent operator support across all search types
 */
class SearchQueryBuilder {
  constructor() {
    this.query = db('notes');
    this.searchCriteria = {
      year: null,
      month: null,
      colors: [],
      excludedColors: [],
      tags: [],
      excludedTags: [],
      textWords: [],
      excludedWords: [],
      orGroups: [],
      wildcards: [],
      exactPhrase: null,
      exactPhrases: []  // Multiple exact phrases with AND logic
    };
    this.needsDistinct = false;
    this.tagJoinCount = 0;
  }

  /**
   * Apply text search conditions to the query
   */
  applyTextSearch(textWords) {
    if (!textWords || textWords.length === 0) return this;

    // Create conditions for each word (must match in title, content, or plain_content)
    textWords.forEach(word => {
      this.query.whereRaw(`(
        notes.title ILIKE ? OR 
        notes.plain_content ILIKE ?
      )`, [`%${word}%`, `%${word}%`]);
    });

    return this;
  }

  /**
   * Apply exact phrase search
   */
  applyExactPhrase(phrase) {
    if (!phrase) return this;

    this.query.whereRaw(`(
      notes.title ILIKE ? OR 
      notes.plain_content ILIKE ?
    )`, [`%${phrase}%`, `%${phrase}%`]);

    return this;
  }

  /**
   * Apply multiple exact phrase searches with AND logic
   * Each phrase must be found in the note
   */
  applyExactPhrases(phrases) {
    if (!phrases || phrases.length === 0) return this;

    phrases.forEach(phrase => {
      this.query.whereRaw(`(
        notes.title ILIKE ? OR 
        notes.plain_content ILIKE ?
      )`, [`%${phrase}%`, `%${phrase}%`]);
    });

    return this;
  }

  /**
   * Apply wildcard search using regex
   */
  applyWildcardSearch(wildcards) {
    if (!wildcards || wildcards.length === 0) return this;

    wildcards.forEach(wildcard => {
      const regexPattern = this.createWildcardRegex(wildcard);
      this.query.whereRaw(`(
        notes.title ~* ? OR 
        notes.plain_content ~* ?
      )`, [regexPattern, regexPattern]);
    });

    return this;
  }

  /**
   * Apply OR group conditions
   */  applyOrGroups(orGroups) {
    if (!orGroups || orGroups.length === 0) return this;

    orGroups.forEach(async (group) => {
      await this.applyOrGroup(group);
    });

    return this;
  }

  /**
   * Apply a single OR group containing mixed filter types
   */
  async applyOrGroup(group) {
    if (!group || group.length === 0) return this;

    this.query.where(function () {
      group.forEach(term => {
        if (term.startsWith('yr:')) {
          // Year/month filter in OR group
          const yearPart = term.substring(3);
          const yearFilter = Note.parseYearFilter(yearPart);
          if (yearFilter) {
            if (yearFilter.month) {
              this.orWhere(function () {
                this.whereRaw('EXTRACT(YEAR FROM notes.created_at) = ?', [yearFilter.year])
                  .whereRaw('EXTRACT(MONTH FROM notes.created_at) = ?', [yearFilter.month]);
              });
            } else {
              this.orWhereRaw('EXTRACT(YEAR FROM notes.created_at) = ?', [yearFilter.year]);
            }
          }
        } else if (term.startsWith('#')) {
          // Tag filter in OR group - includes subtags (e.g., #book matches book/fiction)
          const tagName = term.substring(1);
          this.orWhereExists(function () {
            this.select('*')
              .from('note_tags')
              .join('tags', 'note_tags.tag_id', 'tags.id')
              .whereRaw('note_tags.note_id = notes.id')
              .where(function() {
                this.whereRaw('LOWER(tags.name) = LOWER(?)', [tagName])
                  .orWhereRaw('LOWER(tags.name) LIKE LOWER(?)', [tagName + '/%']);
              });
          });
        } else if (term.startsWith('$')) {
          // Color filter in OR group
          const colorName = term.substring(1);
          this.orWhereRaw('LOWER(notes.color) = LOWER(?)', [colorName]);
        } else {
          // Text search in OR group
          this.orWhereRaw(`(
            notes.title ILIKE ? OR 
            notes.plain_content ILIKE ?
          )`, [`%${term}%`, `%${term}%`]);
        }
      });
    });

    return this;
  }

  /**
   * Apply excluded word conditions
   */
  applyExcludedWords(excludedWords) {
    if (!excludedWords || excludedWords.length === 0) return this;

    excludedWords.forEach(word => {
      this.query.whereRaw(`NOT (
        notes.title ILIKE ? OR 
        notes.plain_content ILIKE ?
      )`, [`%${word}%`, `%${word}%`]);
    });

    return this;
  }
  /**
   * Apply year filters with OR logic
   */
  applyYearFilters(yearFilters) {
    if (!yearFilters || yearFilters.length === 0) return this;

    this.query.where(function () {
      yearFilters.forEach(filter => {
        if (filter.month) {
          // Specific year and month
          this.orWhere(function () {
            this.whereRaw('EXTRACT(YEAR FROM notes.created_at) = ?', [filter.year])
              .whereRaw('EXTRACT(MONTH FROM notes.created_at) = ?', [filter.month]);
          });
        } else {
          // Just year
          this.orWhereRaw('EXTRACT(YEAR FROM notes.created_at) = ?', [filter.year]);
        }
      });
    });

    return this;
  }

  /**
   * Apply excluded year filters
   */
  applyExcludedYearFilters(excludedYearFilters) {
    if (!excludedYearFilters || excludedYearFilters.length === 0) return this;

    excludedYearFilters.forEach(filter => {
      if (filter.month) {
        // Exclude specific year and month
        this.query.whereNot(function () {
          this.whereRaw('EXTRACT(YEAR FROM notes.created_at) = ?', [filter.year])
            .whereRaw('EXTRACT(MONTH FROM notes.created_at) = ?', [filter.month]);
        });
      } else {
        // Exclude entire year
        this.query.whereRaw('EXTRACT(YEAR FROM notes.created_at) <> ?', [filter.year]);
      }
    });

    return this;
  }

  /**
   * Apply year filter (backward compatibility)
   */
  applyYearFilter(year) {
    if (!year) return this;
    this.query.whereRaw('EXTRACT(YEAR FROM notes.created_at) = ?', [year]);
    return this;
  }

  /**
   * Apply month filter (backward compatibility - only valid with year)
   */
  applyMonthFilter(month, year) {
    if (!month || !year) return this;
    this.query.whereRaw('EXTRACT(MONTH FROM notes.created_at) = ?', [month]);
    return this;
  }

  /**
   * Apply color filters (OR logic between colors)
   */
  applyColorFilters(colors) {
    if (!colors || colors.length === 0) return this;

    this.query.where(function () {
      colors.forEach(color => {
        this.orWhereRaw('LOWER(notes.color) = LOWER(?)', [color]);
      });
    });

    return this;
  }

  /**
   * Apply excluded color filters (AND NOT logic)
   */
  applyExcludedColors(excludedColors) {
    if (!excludedColors || excludedColors.length === 0) return this;

    excludedColors.forEach(color => {
      this.query.whereRaw('LOWER(notes.color) <> LOWER(?)', [color]);
    });

    return this;
  }

  /**
   * Apply tag filters (AND logic between tags)
   * Includes subtags: searching for "book" will also match "book/fiction"
   * tagIdMap: optional {tagNameLower: uuid} — skips name lookup when ID is known
   */
  async applyTagFilters(tags, tagIdMap = {}) {
    if (!tags || tags.length === 0) return this;

    this.needsDistinct = true;

    for (let i = 0; i < tags.length; i++) {
      const tagName = tags[i];
      const resolvedId = tagIdMap[tagName.toLowerCase()];

      let tagIds;
      if (resolvedId) {
        // Use the pre-resolved ID directly; also pick up any name-based subtags
        const subResults = await db('tags')
          .select('id')
          .whereRaw('LOWER(name) LIKE LOWER(?)', [tagName + '/%']);
        tagIds = [resolvedId, ...subResults.map(t => t.id)];
      } else {
        // Fall back to name-based lookup
        const tagResults = await db('tags')
          .select('id')
          .where(function() {
            this.whereRaw('LOWER(name) = LOWER(?)', [tagName])
              .orWhereRaw('LOWER(name) LIKE LOWER(?)', [tagName + '/%']);
          });

        if (!tagResults || tagResults.length === 0) {
          this.query.where(db.raw('1 = 0'));
          return this;
        }
        tagIds = tagResults.map(t => t.id);
      }

      const joinAlias = `nt${this.tagJoinCount++}`;
      this.query.whereExists(function() {
        this.select('*')
          .from(`note_tags as ${joinAlias}`)
          .whereRaw(`${joinAlias}.note_id = notes.id`)
          .whereIn(`${joinAlias}.tag_id`, tagIds);
      });
    }

    return this;
  }

  /**
   * Apply excluded tag filters (NOT EXISTS logic)
   * Excludes subtags: excluding "book" will also exclude "book/fiction"
   */
  async applyExcludedTags(excludedTags) {
    if (!excludedTags || excludedTags.length === 0) return this;

    for (const tagName of excludedTags) {
      // Get tag IDs for exact match and all subtags (tags starting with tagName/)
      const tagResults = await db('tags')
        .select('id')
        .where(function() {
          this.whereRaw('LOWER(name) = LOWER(?)', [tagName])
            .orWhereRaw('LOWER(name) LIKE LOWER(?)', [tagName + '/%']);
        });

      if (tagResults && tagResults.length > 0) {
        const tagIds = tagResults.map(t => t.id);
        this.query.whereNotExists(function () {
          this.select('*')
            .from('note_tags')
            .whereRaw('note_tags.note_id = notes.id')
            .whereIn('note_tags.tag_id', tagIds);
        });
      }
    }

    return this;
  }

  /**
   * Apply standard filters (not deleted, not empty, etc.)
   */
  applyStandardFilters() {
    this.query.where('notes.is_deleted', false);
    this.query.whereRaw(`(
      TRIM(COALESCE(notes.title, '')) != '' OR
      TRIM(COALESCE(notes.content, '')) != '' OR
      EXISTS (SELECT 1 FROM note_images WHERE note_images.note_id = notes.id)
    )`);
    return this;
  }

  /**
   * Apply sorting
   */
  applySorting(sortOrder = 'updatedAt_desc') {
    switch (sortOrder) {
      case 'createdAt_asc':
        this.query.orderBy('notes.created_at', 'asc');
        break;
      case 'createdAt_desc':
        this.query.orderBy('notes.created_at', 'desc');
        break;
      case 'updatedAt_desc':
      default:
        this.query.orderBy('notes.updated_at', 'desc');
        break;
    }
    return this;
  }

  /**
   * Apply pagination
   */
  applyPagination(page = 1, limit = 80) {
    const offset = (page - 1) * limit;
    this.query.limit(limit).offset(offset);
    return this;
  }
  /**
   * Apply field selection with optional content truncation
   */
  applyFieldSelection(truncateContent = true, contentLimit = 300) {
    if (truncateContent) {
      this.query.select([
        'notes.id',
        'notes.title',
        db.raw(`CASE 
          WHEN length(notes.content) > ? THEN substring(notes.content, 1, ?) || '...'
          ELSE notes.content
        END as content`, [contentLimit, contentLimit]),
        'notes.color',
        'notes.is_pinned',
        'notes.is_archived',
        'notes.is_deleted',
        'notes.created_at',
        'notes.updated_at',
        'notes.version',
        'notes.metadata'
      ]);
    } else {
      this.query.select('notes.*', 'notes.version');
    }

    if (this.needsDistinct) {
      this.query.distinct();
    }

    return this;
  }

  /**
   * Execute the query and return results
   */
  async execute() {
    return await this.query;
  }

  /**
   * Get count query
   */
  getCountQuery() {
    const countQuery = this.query.clone();

    if (this.needsDistinct) {
      return countQuery.clearSelect().countDistinct('notes.id as count');
    } else {
      return countQuery.clearSelect().count('notes.id as count');
    }
  }

  /**
   * Execute count query
   */
  async executeCount() {
    const countQuery = this.getCountQuery();
    const result = await countQuery;
    return parseInt(result[0].count) || 0;
  }

  /**
   * Create wildcard regex pattern
   */
  createWildcardRegex(term) {
    const parts = term.split('*');

    if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
      const word1 = this.escapeRegexChars(parts[0].trim());
      const word2 = this.escapeRegexChars(parts[1].trim());
      return `\\m${word1}\\M\\s+\\w+\\s+\\m${word2}\\M`;
    }

    let regexPattern = '';
    const startsWithWildcard = term.startsWith('*');
    const endsWithWildcard = term.endsWith('*');

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();

      if (part) {
        regexPattern += `\\m${this.escapeRegexChars(part)}\\M`;
      } else if (i > 0 && i < parts.length - 1) {
        regexPattern += '(?:\\s+\\w+){1,5}';
      } else if (i === 0 && startsWithWildcard) {
        regexPattern += '\\w+';
      } else if (i === parts.length - 1 && endsWithWildcard) {
        regexPattern += '\\w+';
      } else {
        regexPattern += '\\w+';
      }

      if (i < parts.length - 1) {
        regexPattern += '\\s+';
      }
    }

    if (startsWithWildcard) {
      regexPattern = `(?:^|\\s+)${regexPattern}`;
    }

    if (endsWithWildcard) {
      regexPattern = `${regexPattern}(?:\\s+|$)`;
    }

    return regexPattern;
  }

  /**
   * Escape regex special characters
   */
  escapeRegexChars(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

class Note {
  static async getReminders(noteId) {
    return Reminder.findByNoteId(noteId);
  }

  // Helper to convert month name/shorthand to number
  static monthNameToNumber(monthName) {
    if (!monthName) return null;
    const lowerMonth = monthName.toLowerCase();
    const monthMap = {
      jan: 1, january: 1,
      feb: 2, february: 2,
      mar: 3, march: 3,
      apr: 4, april: 4,
      may: 5,
      jun: 6, june: 6,
      jul: 7, july: 7,
      aug: 8, august: 8,
      sep: 9, september: 9,
      oct: 10, october: 10,
      nov: 11, november: 11,
      dec: 12, december: 12,
    };
    return monthMap[lowerMonth] || null;
  }
  /**
   * Helper to check if a token is a quoted phrase and extract the phrase
   */
  static extractQuotedPhrase(token) {
    if ((token.startsWith('"') && token.endsWith('"')) ||
        (token.startsWith("'") && token.endsWith("'"))) {
      return token.substring(1, token.length - 1);
    }
    return null;
  }

  /**
   * Parse search query into components with full operator support
   */
  static parseSearchQuery(query) {
    const criteria = {
      yearFilters: [],
      excludedYearFilters: [],
      colors: [],
      excludedColors: [],
      tags: [],
      excludedTags: [],
      textWords: [],
      excludedWords: [],
      orGroups: [],
      wildcards: [],
      exactPhrase: null,
      exactPhrases: []  // Multiple exact phrases with AND logic
    };

    if (!query || query.trim() === '') {
      return criteria;
    }

    // Handle single exact phrase (quoted strings covering entire query)
    // Only match if it's truly a single quoted phrase (no internal quotes)
    const singleDoubleQuotePhrase = query.match(/^"([^"]*)"$/);
    const singleSingleQuotePhrase = query.match(/^'([^']*)'$/);
    if (singleDoubleQuotePhrase) {
      criteria.exactPhrase = singleDoubleQuotePhrase[1];
      return criteria;
    }
    if (singleSingleQuotePhrase) {
      criteria.exactPhrase = singleSingleQuotePhrase[1];
      return criteria;
    }

    // Tokenize the query, handling OR operators properly
    const tokens = this.tokenizeQueryWithOrSupport(query);
    console.log('[SEARCH DEBUG] Query:', query);
    console.log('[SEARCH DEBUG] Tokens:', JSON.stringify(tokens));

    for (const token of tokens) {
      if (Array.isArray(token)) {
        // This is an OR group - process each term to strip quotes if present
        const processedGroup = token.map(term => {
          const phrase = this.extractQuotedPhrase(term);
          return phrase !== null ? phrase : term;
        });
        criteria.orGroups.push(processedGroup);
      } else if (token.startsWith('#')) {
        // Tag search
        const tagName = token.substring(1);
        if (tagName.startsWith('-')) {
          criteria.excludedTags.push(tagName.substring(1));
        } else {
          criteria.tags.push(tagName);
        }
      } else if (token.startsWith('$')) {
        // Color search
        const colorName = token.substring(1);
        if (colorName.startsWith('-')) {
          criteria.excludedColors.push(colorName.substring(1));
        } else {
          criteria.colors.push(colorName);
        }
      } else if (token.startsWith('-#')) {
        // Excluded tag
        criteria.excludedTags.push(token.substring(2));
      } else if (token.startsWith('-$')) {
        // Excluded color
        criteria.excludedColors.push(token.substring(2));
      } else if (token.startsWith('-yr:')) {
        // Excluded year/month search
        const yearPart = token.substring(4);
        const yearFilter = this.parseYearFilter(yearPart);
        if (yearFilter) {
          criteria.excludedYearFilters.push(yearFilter);
        }
      } else if (token.startsWith('yr:')) {
        // Year/month search
        const yearPart = token.substring(3);
        const yearFilter = this.parseYearFilter(yearPart);
        if (yearFilter) {
          criteria.yearFilters.push(yearFilter);
        }
      } else if (token.startsWith('-')) {
        // Excluded word - also strip quotes from incomplete quoted exclusions
        let excludedWord = token.substring(1);
        // Strip incomplete quotes (e.g., -"word or -word")
        excludedWord = excludedWord.replace(/^["']|["']$/g, '');
        if (excludedWord) {
          criteria.excludedWords.push(excludedWord);
        }
      } else if (token.includes('*')) {
        // Wildcard search
        criteria.wildcards.push(token);
      } else {
        // Check if it's a quoted phrase
        const phrase = this.extractQuotedPhrase(token);
        if (phrase !== null) {
          // This is an exact phrase search
          console.log('[SEARCH DEBUG] Found quoted phrase:', phrase);
          criteria.exactPhrases.push(phrase);
        } else {
          // Regular text word - strip any incomplete quotes
          // (e.g., "word without closing quote, or word" without opening quote)
          let cleanToken = token.replace(/^["']|["']$/g, '');
          if (cleanToken) {
            criteria.textWords.push(cleanToken);
          }
        }
      }
    }

    console.log('[SEARCH DEBUG] Final criteria:', JSON.stringify(criteria));
    return criteria;
  }

  /**
   * Parse a year filter string into year and month components
   */
  static parseYearFilter(yearPart) {
    const yearMonthMatch = yearPart.match(/^(\d{4})(?::([a-zA-Z]{3,}))?$/i);
    if (yearMonthMatch) {
      const year = parseInt(yearMonthMatch[1]);
      const month = yearMonthMatch[2] ? this.monthNameToNumber(yearMonthMatch[2]) : null;
      return { year, month };
    }
    return null;
  }
  /**
   * Enhanced tokenizer that properly handles OR groups and complex operators
   */
  static tokenizeQueryWithOrSupport(query) {
    // First, tokenize normally to get individual terms
    const basicTokens = this.tokenizeQuery(query);

    // Filter out standalone OR tokens that aren't part of a valid OR expression
    // (e.g., trailing OR or leading OR)
    const filteredTokens = basicTokens.filter((token, index) => {
      if (token.toUpperCase() !== 'OR') return true;
      // Keep OR only if it has terms on both sides
      const hasPrev = index > 0 && basicTokens[index - 1].toUpperCase() !== 'OR';
      const hasNext = index < basicTokens.length - 1 && basicTokens[index + 1].toUpperCase() !== 'OR';
      return hasPrev && hasNext;
    });

    if (!query.toUpperCase().includes(' OR ') || filteredTokens.every(t => t.toUpperCase() !== 'OR')) {
      // No valid OR operators, return filtered tokens
      return filteredTokens;
    }

    const tokens = [];
    let i = 0;

    while (i < filteredTokens.length) {
      const currentToken = filteredTokens[i];

      // Check if next token is "OR"
      if (i + 1 < filteredTokens.length && filteredTokens[i + 1].toUpperCase() === 'OR') {
        // Start building an OR group
        const orGroup = [currentToken];
        i += 2; // Skip the "OR" token

        // Add the token after OR
        if (i < filteredTokens.length) {
          orGroup.push(filteredTokens[i]);
          i++;
        }

        // Continue collecting OR'd terms
        while (i + 1 < filteredTokens.length && filteredTokens[i].toUpperCase() === 'OR') {
          i++; // Skip the "OR"
          if (i < filteredTokens.length) {
            orGroup.push(filteredTokens[i]);
            i++;
          }
        }

        tokens.push(orGroup);
      } else {
        // Regular token
        tokens.push(currentToken);
        i++;
      }
    }

    return tokens;
  }

  /**
   * Tokenize search query handling quotes and special operators
   */
  static tokenizeQuery(query) {
    const tokens = [];
    let currentToken = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < query.length; i++) {
      const char = query[i];

      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
        currentToken += char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        currentToken += char;
        quoteChar = '';
      } else if (char === ' ' && !inQuotes) {
        if (currentToken) {
          tokens.push(currentToken);
          currentToken = '';
        }
      } else {
        currentToken += char;
      }
    }

    if (currentToken) {
      tokens.push(currentToken);
    }

    console.log('[SEARCH DEBUG] tokenizeQuery input:', query, '-> output:', tokens);

    return tokens.filter(token => token.trim().length > 0);
  }

  /**
   * Unified search method supporting all operators consistently
   */
  static async search(searchTerm, page = 1, limit = 80, sortOrder = 'updatedAt_desc', truncateContent = true, contentLimit = 300, tagIdMap = {}) {
    console.log('[SEARCH] Entry - searchTerm:', searchTerm);

    const hasResolvedIds = tagIdMap && Object.keys(tagIdMap).length > 0;

    // Handle backward compatibility for simple searches (skip fast path when IDs are resolved)
    if (!searchTerm.includes(' ') && !hasResolvedIds) {
      if (searchTerm.startsWith('#')) {
        return this.searchByTag(searchTerm.substring(1), page, limit, sortOrder, truncateContent, contentLimit);
      } else if (searchTerm.startsWith('$')) {
        return this.searchByColor(searchTerm.substring(1), page, limit, sortOrder, truncateContent, contentLimit);
      } else if (searchTerm.startsWith('yr:')) {
        return this.searchByYear(searchTerm.substring(3), page, limit, sortOrder, truncateContent, contentLimit);
      } else if ((searchTerm.startsWith('"') && searchTerm.endsWith('"')) ||
        (searchTerm.startsWith("'") && searchTerm.endsWith("'"))) {
        return this.searchByExactPhrase(searchTerm.substring(1, searchTerm.length - 1), page, limit, sortOrder, truncateContent, contentLimit);
      }
    }

    // Parse search criteria
    const searchCriteria = this.parseSearchQuery(searchTerm);
    console.log('[SEARCH] Parsed criteria:', JSON.stringify(searchCriteria));

    // If no valid criteria, fall back to text search
    if (Object.keys(searchCriteria).every(key =>
      !searchCriteria[key] ||
      (Array.isArray(searchCriteria[key]) && searchCriteria[key].length === 0)
    )) {
      return this.searchByText(searchTerm, page, limit, sortOrder, truncateContent, contentLimit);
    }

    // Build unified query
    const queryBuilder = new SearchQueryBuilder();

    queryBuilder
      .applyStandardFilters()
      .applyFieldSelection(truncateContent, contentLimit)
      .applySorting(sortOrder)
      .applyPagination(page, limit);

    // Apply search criteria
    if (searchCriteria.exactPhrase) {
      queryBuilder.applyExactPhrase(searchCriteria.exactPhrase);
    } else {
      queryBuilder.applyTextSearch(searchCriteria.textWords);
      queryBuilder.applyExactPhrases(searchCriteria.exactPhrases);  // Handle multiple quoted phrases
      queryBuilder.applyWildcardSearch(searchCriteria.wildcards);
      await queryBuilder.applyOrGroups(searchCriteria.orGroups);
    }

    queryBuilder.applyExcludedWords(searchCriteria.excludedWords);
    queryBuilder.applyYearFilters(searchCriteria.yearFilters);
    queryBuilder.applyExcludedYearFilters(searchCriteria.excludedYearFilters);
    queryBuilder.applyColorFilters(searchCriteria.colors);
    queryBuilder.applyExcludedColors(searchCriteria.excludedColors);

    await queryBuilder.applyTagFilters(searchCriteria.tags, tagIdMap);
    await queryBuilder.applyExcludedTags(searchCriteria.excludedTags);

    // Execute query
    const results = await queryBuilder.execute();

    // Add tags and images
    if (results.length > 0) {
      await this.addTagsAndImages(results);
    }

    return results;
  }

  /**
   * Unified search count method
   */
  static async getSearchCount(searchTerm, tagIdMap = {}) {
    const hasResolvedIds = tagIdMap && Object.keys(tagIdMap).length > 0;
    // Handle backward compatibility for simple searches (skip fast path when IDs are resolved)
    if (!searchTerm.includes(' ') && !hasResolvedIds) {
      if (searchTerm.startsWith('#')) {
        return this.getTagSearchCount(searchTerm.substring(1));
      } else if (searchTerm.startsWith('$')) {
        return this.getColorSearchCount(searchTerm.substring(1));
      } else if (searchTerm.startsWith('yr:')) {
        return this.getYearSearchCount(searchTerm.substring(3));
      } else if ((searchTerm.startsWith('"') && searchTerm.endsWith('"')) ||
        (searchTerm.startsWith("'") && searchTerm.endsWith("'"))) {
        return this.getExactPhraseSearchCount(searchTerm.substring(1, searchTerm.length - 1));
      }
    }

    // Parse search criteria
    const searchCriteria = this.parseSearchQuery(searchTerm);

    // If no valid criteria, fall back to text search
    if (Object.keys(searchCriteria).every(key =>
      !searchCriteria[key] ||
      (Array.isArray(searchCriteria[key]) && searchCriteria[key].length === 0)
    )) {
      return this.getTextSearchCount(searchTerm);
    }

    // Build unified count query
    const queryBuilder = new SearchQueryBuilder();

    queryBuilder.applyStandardFilters();

    // Apply search criteria
    if (searchCriteria.exactPhrase) {
      queryBuilder.applyExactPhrase(searchCriteria.exactPhrase);
    } else {
      queryBuilder.applyTextSearch(searchCriteria.textWords);
      queryBuilder.applyExactPhrases(searchCriteria.exactPhrases);  // Handle multiple quoted phrases
      queryBuilder.applyWildcardSearch(searchCriteria.wildcards);
      await queryBuilder.applyOrGroups(searchCriteria.orGroups);
    }

    queryBuilder.applyExcludedWords(searchCriteria.excludedWords);
    queryBuilder.applyYearFilters(searchCriteria.yearFilters);
    queryBuilder.applyExcludedYearFilters(searchCriteria.excludedYearFilters);
    queryBuilder.applyColorFilters(searchCriteria.colors);
    queryBuilder.applyExcludedColors(searchCriteria.excludedColors);

    await queryBuilder.applyTagFilters(searchCriteria.tags, tagIdMap);
    await queryBuilder.applyExcludedTags(searchCriteria.excludedTags);

    // Execute count query
    return await queryBuilder.executeCount();
  }

  /**
   * Specialized search methods using the unified SearchQueryBuilder
   */
  static async searchByTag(tagName, page = 1, limit = 80, sortOrder = 'updatedAt_desc', truncateContent = true, contentLimit = 300) {
    const queryBuilder = new SearchQueryBuilder();

    queryBuilder
      .applyStandardFilters()
      .applyFieldSelection(truncateContent, contentLimit)
      .applySorting(sortOrder)
      .applyPagination(page, limit);

    await queryBuilder.applyTagFilters([tagName]);

    const results = await queryBuilder.execute();

    if (results.length > 0) {
      await this.addTagsAndImages(results);
    }

    return results;
  }

  static async searchByColor(colorName, page = 1, limit = 80, sortOrder = 'updatedAt_desc', truncateContent = true, contentLimit = 300) {
    const queryBuilder = new SearchQueryBuilder();

    queryBuilder
      .applyStandardFilters()
      .applyFieldSelection(truncateContent, contentLimit)
      .applySorting(sortOrder)
      .applyPagination(page, limit)
      .applyColorFilters([colorName]);

    const results = await queryBuilder.execute();

    if (results.length > 0) {
      await this.addTagsAndImages(results);
    }

    return results;
  }

  static async searchByYear(yearStr, page = 1, limit = 80, sortOrder = 'updatedAt_desc', truncateContent = true, contentLimit = 300) {
    // Parse year and optional month
    const yearMonthMatch = yearStr.match(/^(\d{4})(?::([a-zA-Z]{3,}))?$/i);
    if (!yearMonthMatch) {
      return [];
    }

    const year = parseInt(yearMonthMatch[1]);
    const month = yearMonthMatch[2] ? this.monthNameToNumber(yearMonthMatch[2]) : null;

    const queryBuilder = new SearchQueryBuilder();

    queryBuilder
      .applyStandardFilters()
      .applyFieldSelection(truncateContent, contentLimit)
      .applySorting(sortOrder)
      .applyPagination(page, limit)
      .applyYearFilter(year);

    if (month) {
      queryBuilder.applyMonthFilter(month, year);
    }

    const results = await queryBuilder.execute();

    if (results.length > 0) {
      await this.addTagsAndImages(results);
    }

    return results;
  }

  static async searchByExactPhrase(phrase, page = 1, limit = 80, sortOrder = 'updatedAt_desc', truncateContent = true, contentLimit = 300) {
    const queryBuilder = new SearchQueryBuilder();

    queryBuilder
      .applyStandardFilters()
      .applyFieldSelection(truncateContent, contentLimit)
      .applySorting(sortOrder)
      .applyPagination(page, limit)
      .applyExactPhrase(phrase);

    const results = await queryBuilder.execute();

    if (results.length > 0) {
      await this.addTagsAndImages(results);
    }

    return results;
  }

  static async searchByText(searchTerm, page = 1, limit = 80, sortOrder = 'updatedAt_desc', truncateContent = true, contentLimit = 300) {
    const queryBuilder = new SearchQueryBuilder();

    queryBuilder
      .applyStandardFilters()
      .applyFieldSelection(truncateContent, contentLimit)
      .applySorting(sortOrder)
      .applyPagination(page, limit)
      .applyTextSearch([searchTerm]);

    const results = await queryBuilder.execute();

    if (results.length > 0) {
      await this.addTagsAndImages(results);
    }

    return results;
  }

  /**
   * Count methods using the unified SearchQueryBuilder
   */
  static async getTagSearchCount(tagName) {
    const queryBuilder = new SearchQueryBuilder();
    queryBuilder.applyStandardFilters();
    await queryBuilder.applyTagFilters([tagName]);
    return await queryBuilder.executeCount();
  }

  static async getColorSearchCount(colorName) {
    const queryBuilder = new SearchQueryBuilder();
    queryBuilder.applyStandardFilters().applyColorFilters([colorName]);
    return await queryBuilder.executeCount();
  }

  static async getYearSearchCount(yearMonthStr) {
    const yearMonthMatch = yearMonthStr.match(/^(\d{4})(?::([a-zA-Z]{3,}))?$/i);
    if (!yearMonthMatch) {
      return 0;
    }

    const year = parseInt(yearMonthMatch[1]);
    const month = yearMonthMatch[2] ? this.monthNameToNumber(yearMonthMatch[2]) : null;

    const queryBuilder = new SearchQueryBuilder();
    queryBuilder.applyStandardFilters().applyYearFilter(year);

    if (month) {
      queryBuilder.applyMonthFilter(month, year);
    }

    return await queryBuilder.executeCount();
  }

  static async getExactPhraseSearchCount(phrase) {
    const queryBuilder = new SearchQueryBuilder();
    queryBuilder.applyStandardFilters().applyExactPhrase(phrase);
    return await queryBuilder.executeCount();
  }

  static async getTextSearchCount(searchTerm) {
    const queryBuilder = new SearchQueryBuilder();
    queryBuilder.applyStandardFilters().applyTextSearch([searchTerm]);
    return await queryBuilder.executeCount();
  }

  /**
   * CRUD Operations using Knex
   */  static async findAll({ page = 1, limit = 80, archived = false, deleted = false, oldestFirst = false, includeDetails = false, truncateContent = true, contentLimit = 300, sortCriteria = null }) {
    console.log(`Note.findAll called with: archived=${archived}, deleted=${deleted}, oldestFirst=${oldestFirst}, sortCriteria=${sortCriteria}`);

    const sortDirection = oldestFirst ? 'asc' : 'desc';
    const offset = (page - 1) * limit;

    // Build base query
    let query = db('notes')
      .where('is_archived', archived)
      .where('is_deleted', deleted);

    // Apply field selection
    if (truncateContent) {
      query.select([
        'id', 'title',
        db.raw(`CASE 
          WHEN length(content) > ? THEN substring(content, 1, ?) || '...'
          ELSE content
        END as content`, [contentLimit, contentLimit]),
        'color', 'is_pinned', 'is_archived', 'is_deleted',
        'created_at', 'updated_at', 'version', 'metadata'
      ]);
    } else {
      query.select('*', 'version');
    }

    // Handle pinned notes for main view first page
    if (page === 1 && !archived && !deleted) {
      // Get all pinned notes
      const pinnedQuery = query.clone()
        .where('is_pinned', true)
        .orderBy([
          { column: 'pinned_at', order: 'desc' },
          { column: 'updated_at', order: 'desc' },
          { column: 'created_at', order: 'desc' }
        ]);

      // Get regular unpinned notes with pagination
      const unpinnedQuery = db('notes')
        .where('is_archived', archived)
        .where('is_deleted', deleted)
        .where('is_pinned', false)
        .whereNotExists(function () {
          this.select('*')
            .from('note_tags')
            .join('tags', 'note_tags.tag_id', 'tags.id')
            .whereRaw('note_tags.note_id = notes.id')
            .where('tags.visible', false);
        }); if (truncateContent) {
          unpinnedQuery.select([
            'id', 'title',
            db.raw(`CASE 
            WHEN length(content) > ? THEN substring(content, 1, ?) || '...'
            ELSE content
          END as content`, [contentLimit, contentLimit]),
            'color', 'is_pinned', 'is_archived', 'is_deleted',
            'created_at', 'updated_at', 'version', 'metadata'
          ]);
        } else {
        unpinnedQuery.select('*', 'version');
      }

      unpinnedQuery
        .orderBy('created_at', sortDirection)
        .limit(limit)
        .offset(offset);

      const [pinnedResults, unpinnedResults] = await Promise.all([
        pinnedQuery,
        unpinnedQuery
      ]);

      const notes = [...pinnedResults, ...unpinnedResults];

      if (includeDetails && notes.length > 0) {
        await this.addTagsAndImages(notes);
      }

      return notes;
    } else if (!archived && !deleted) {
      // For subsequent pages in main view, get only unpinned notes
      query
        .where('is_pinned', false)
        .whereNotExists(function () {
          this.select('*')
            .from('note_tags')
            .join('tags', 'note_tags.tag_id', 'tags.id')
            .whereRaw('note_tags.note_id = notes.id')
            .where('tags.visible', false);
        })
        .orderBy('created_at', sortDirection)
        .limit(limit)
        .offset(offset);
    } else {
      // For archived/deleted views with specific sort orders
      if (deleted) {
        console.log(`Trash view: sortCriteria=${sortCriteria}, sortDirection=${sortDirection}`);

        if (sortCriteria === 'created_at') {
          // Sort by created_at with direction based on oldestFirst
          query
            .orderBy('created_at', sortDirection)
            .limit(limit)
            .offset(offset);
        } else {
          // Default trash sort: ORDER BY trashed_at DESC NULLS LAST, updated_at DESC, created_at DESC
          query
            .orderBy([
              { column: 'trashed_at', order: 'desc', nulls: 'last' },
              { column: 'updated_at', order: 'desc' },
              { column: 'created_at', order: 'desc' }
            ])
            .limit(limit)
            .offset(offset);
        }
      } else if (archived) {
        console.log(`Archive view: sortCriteria=${sortCriteria}, sortDirection=${sortDirection}`);

        if (sortCriteria === 'created_at') {
          // Sort by created_at with direction based on oldestFirst
          query
            .orderBy('created_at', sortDirection)
            .limit(limit)
            .offset(offset);
        } else {
          // Default archive sort: ORDER BY archived_at DESC NULLS LAST, updated_at DESC, created_at DESC
          query
            .orderBy([
              { column: 'archived_at', order: 'desc', nulls: 'last' },
              { column: 'updated_at', order: 'desc' },
              { column: 'created_at', order: 'desc' }
            ])
            .limit(limit)
            .offset(offset);
        }
      } else {
        // Default sort for other views
        query
          .orderBy('created_at', sortDirection)
          .limit(limit)
          .offset(offset);
      }
    }

    const result = await query;

    if (includeDetails && result.length > 0) {
      await this.addTagsAndImages(result);
    }

    return result;
  }

  static async addTagsAndImages(notes, thumbnailsOnly = true) {
    if (!notes || notes.length === 0) return;

    const noteIds = notes.map(note => note.id);    // Fetch tags for all notes
    const tagQuery = db('notes')
      .join('note_tags', 'notes.id', 'note_tags.note_id')
      .join('tags', 'note_tags.tag_id', 'tags.id')
      .select('notes.id as note_id', 'tags.id as tag_id', 'tags.name', 'tags.is_folder', 'tags.visible')
      .whereIn('notes.id', noteIds)
      .orderBy([{ column: 'tags.is_folder', order: 'desc' }, { column: 'tags.name', order: 'asc' }]);

    const tagResults = await tagQuery;    // Fetch images for all notes
    const imageQuery = db('note_images')
      .whereIn('note_id', noteIds)
      .orderBy(['note_id', 'created_at']);

    if (thumbnailsOnly) {
      imageQuery.select('id', 'note_id', 'thumbnail', 'name', 'type', 'size', 'created_at');
    } else {
      imageQuery.select('*');
    }

    const imageResults = await imageQuery;

    // Group results by note_id
    const noteTags = {};
    const noteImages = {};

    tagResults.forEach(row => {
      if (!noteTags[row.note_id]) {
        noteTags[row.note_id] = [];
      } noteTags[row.note_id].push({
        id: row.tag_id,
        name: row.name,
        is_folder: row.is_folder,
        visible: row.visible
      });
    }); imageResults.forEach(row => {
      if (!noteImages[row.note_id]) {
        noteImages[row.note_id] = [];
      }
      noteImages[row.note_id].push(row);
    });    // Attach tags and images to notes
    notes.forEach(note => {
      note.tags = noteTags[note.id] || [];
      note.images = noteImages[note.id] || [];

      // Metadata is already properly maintained by the database trigger
      // The database stores it as JSON with structure: {"tags": ["#tag1", "#tag2"], "color": "$color", "date": "yr:2025:jun"}
      // For client-side search, we need to convert this JSON to a searchable string
      if (note.metadata) {
        try {
          const metadata = typeof note.metadata === 'string' ? JSON.parse(note.metadata) : note.metadata;
          const searchableFields = [];

          if (metadata.tags && Array.isArray(metadata.tags)) {
            searchableFields.push(...metadata.tags);
          }
          if (metadata.color) {
            searchableFields.push(metadata.color);
          }
          if (metadata.date) {
            searchableFields.push(metadata.date);
          }

          // Convert the JSON metadata to a searchable string for client-side filtering
          note.metadataSearchable = searchableFields.join(' ');
        } catch (error) {
          // If metadata isn't valid JSON, treat it as is
          note.metadataSearchable = note.metadata;
        }
      } else {
        note.metadataSearchable = '';
      }
    });
  }

  static async addObjects(notes) {
    if (!notes || notes.length === 0) return;

    const noteIds = notes.map(note => note.id);

    // Fetch objects for all notes
    const objectQuery = db('note_objects')
      .join('objects', 'note_objects.object_id', 'objects.id')
      .select(
        'note_objects.note_id',
        'objects.id',
        'objects.type',
        'objects.title',
        'objects.thumbnail_url',
        'objects.source_url',
        'objects.metadata'
      )
      .whereIn('note_objects.note_id', noteIds)
      .orderBy(['note_objects.note_id', 'note_objects.created_at']);

    const objectResults = await objectQuery;

    // Group objects by note_id
    const noteObjects = {};
    objectResults.forEach(row => {
      if (!noteObjects[row.note_id]) {
        noteObjects[row.note_id] = [];
      }
      noteObjects[row.note_id].push({
        id: row.id,
        type: row.type,
        title: row.title,
        thumbnail_url: row.thumbnail_url,
        source_url: row.source_url,
        metadata: row.metadata
      });
    });

    // Attach objects to notes
    notes.forEach(note => {
      note.objects = noteObjects[note.id] || [];
    });
  }

  static async findById(id, includeDetails = false, fullImages = false) {
    const query = db('notes')
      .select('*', 'version')
      .where('id', id)
      .first();

    const note = await query;

    if (!note) {
      return null;
    }

    if (includeDetails) {
      await this.addTagsAndImages([note], !fullImages);
      await this.addObjects([note]);
    }

    return note;
  }

  static async findManyByIds(ids, includeDetails = true) {
    if (!ids || ids.length === 0) {
      return [];
    }

    const query = db('notes')
      .select('*', 'version')
      .whereIn('id', ids)
      .orderBy('updated_at', 'desc');

    const notes = await query;

    if (includeDetails && notes.length > 0) {
      await this.addTagsAndImages(notes);
      await this.addObjects(notes);
    }

    return notes;
  }

  static async create(noteData) {
    // Convert HTML content to plain text for search indexing
    const plainText = convertHtmlToPlainText(noteData.content || '');

    const noteToInsert = {
      title: noteData.title || '',
      content: noteData.content || '',
      plain_content: plainText,
      color: noteData.color || 'default',
      is_pinned: noteData.is_pinned || false,
      is_archived: noteData.is_archived || false,
      is_deleted: noteData.is_deleted || false,
      created_at: noteData.created_at ? new Date(noteData.created_at) : new Date(),
      updated_at: noteData.created_at ? new Date(noteData.created_at) : new Date(),
      version: 1
    };

    const result = await db('notes').insert(noteToInsert).returning('*');
    return result[0];
  }
  static async update(id, noteData) {
    const updateData = { ...noteData };

    // Convert HTML content to plain text if content is being updated
    if (updateData.content !== undefined) {
      updateData.plain_content = convertHtmlToPlainText(updateData.content);
    }

    // Always update the timestamp and increment version
    updateData.updated_at = new Date();

    // Get current version and increment it
    const currentNote = await db('notes').select('version', 'is_pinned', 'is_archived', 'is_deleted').where('id', id).first();
    if (currentNote) {
      updateData.version = (currentNote.version || 1) + 1;
    }

    // Handle pinned_at field
    if (updateData.is_pinned === true) {
      updateData.pinned_at = new Date();
      updateData.unpinned_at = null;
    } else if (updateData.is_pinned === false) {
      updateData.pinned_at = null;
      updateData.unpinned_at = new Date();
    }

    // Handle archived_at and unarchived_at fields
    if (updateData.is_archived !== undefined && currentNote && updateData.is_archived !== currentNote.is_archived) {
      if (updateData.is_archived === true) {
        updateData.archived_at = new Date();
        updateData.unarchived_at = null;
      } else if (updateData.is_archived === false) {
        updateData.unarchived_at = new Date();
        updateData.archived_at = null;
      }
    }

    // Handle trashed_at and untrashed_at fields
    if (updateData.is_deleted !== undefined && currentNote && updateData.is_deleted !== currentNote.is_deleted) {
      if (updateData.is_deleted === true) {
        updateData.trashed_at = new Date();
        updateData.untrashed_at = null;
      } else if (updateData.is_deleted === false) {
        updateData.untrashed_at = new Date();
        updateData.trashed_at = null;
      }
    }

    const result = await db('notes')
      .where('id', id)
      .update(updateData)
      .returning('*');

    return result[0];
  }

  static async delete(id) {
    const result = await db('notes')
      .where('id', id)
      .del()
      .returning('*');

    return result[0];
  }

  static async getCount({ archived = false, deleted = false }) {
    const result = await db('notes')
      .where('is_archived', archived)
      .where('is_deleted', deleted)
      .count('id as count')
      .first();

    return parseInt(result.count) || 0;
  }
  /**
   * Bulk operations using Knex
   */
  static async bulkUpdate(noteIds, updates) {
    if (!noteIds || noteIds.length === 0) {
      return 0;
    }

    const updateData = { ...updates };
    updateData.updated_at = new Date();

    // Handle pinned_at field for bulk updates
    if (updateData.is_pinned === true) {
      updateData.pinned_at = new Date();
      updateData.unpinned_at = null;
    } else if (updateData.is_pinned === false) {
      updateData.pinned_at = null;
      updateData.unpinned_at = new Date();
    }

    // Handle archived_at and unarchived_at fields for bulk updates
    if (updateData.is_archived === true) {
      updateData.archived_at = new Date();
      updateData.unarchived_at = null;
    } else if (updateData.is_archived === false) {
      updateData.unarchived_at = new Date();
      updateData.archived_at = null;
    }

    // Handle trashed_at and untrashed_at fields for bulk updates
    if (updateData.is_deleted === true) {
      updateData.trashed_at = new Date();
      updateData.untrashed_at = null;
    } else if (updateData.is_deleted === false) {
      updateData.untrashed_at = new Date();
      updateData.trashed_at = null;
    }

    return db('notes')
      .whereIn('id', noteIds)
      .update(updateData);
  }
  static async bulkDelete(noteIds) {
    if (!noteIds || noteIds.length === 0) {
      return 0;
    }

    return db.transaction(async trx => {
      // Delete all tags associations for these notes first (foreign key constraints)
      await trx('note_tags').whereIn('note_id', noteIds).del();

      // Delete all images for these notes (foreign key constraints)
      await trx('note_images').whereIn('note_id', noteIds).del();

      // Delete all version history for these notes
      await trx('note_versions').whereIn('note_id', noteIds).del();

      // Finally delete the notes themselves
      return trx('notes')
        .whereIn('id', noteIds)
        .del();
    });
  }
}

module.exports = Note;
