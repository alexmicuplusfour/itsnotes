// Client-side search matcher used ONLY for live socket updates: when a note is
// created/updated/retagged while you're viewing search results, this decides
// whether that single note should appear in / stay in the current results
// without re-querying the server.
//
// IMPORTANT — this is deliberately NOT a mirror of the server's search engine
// (server/src/models/Note.js). The client only ever has TRUNCATED note content
// (~300 chars) from the socket payload, so it cannot reliably re-run a full-text
// search. Instead it leans on `metadataSearchable` — a compact string of
// "#tag $color yr:date" that the server bakes into every note — which IS complete
// and reliable. So structured filters work well here; free text is best-effort.
// Callers compensate by mostly ADDING (rarely removing) on a client match.
//
// Extracted verbatim from NotesContext so it can be unit tested. Behaviour is
// preserved except: malformed wildcard regexes now fail closed instead of
// throwing (a throw here would crash the socket handler).

const containsText = (str, term) => {
  if (!str) return false;
  return str.toLowerCase().includes(term.toLowerCase());
};

// Search the fields the client actually has: title, (truncated) content, and the
// server-provided metadata string for tags/color/date.
const searchInAllFields = (note, term) => {
  if (containsText(note.title, term)) return true;
  if (containsText(note.content, term)) return true;
  if (note.metadataSearchable && containsText(note.metadataSearchable, term)) return true;
  return false;
};

// Build a wildcard regex from user input. The raw query can contain characters
// that make an invalid regex (e.g. "a*("), so fail closed rather than throw.
const wildcardMatch = (note, term) => {
  let regex;
  try {
    regex = new RegExp(term.replace(/\*/g, '.*'), 'i');
  } catch {
    return false;
  }
  return (
    regex.test(note.title || '') ||
    regex.test(note.content || '') ||
    Boolean(note.metadataSearchable && regex.test(note.metadataSearchable))
  );
};

// Parentheses are decorative grouping ("(zoom OR teams) z"); grouping itself is
// driven by OR adjacency, so strip wrapping parens from non-quoted tokens.
// Mirrors the server tokenizer in server/src/models/Note.js (keep in sync; both
// behaviours are pinned by tests — searchParse.test.js / noteSearchMatch.test.js).
const stripWrappingParens = (token) => {
  if (token.startsWith('"') || token.startsWith("'")) return token;
  return token.replace(/^\(+/, '').replace(/\)+$/, '');
};

// Tokenize a query while keeping quoted phrases (and their quotes) intact.
const tokenizeQuery = (str) => {
  const tokens = [];
  let i = 0;

  while (i < str.length) {
    while (i < str.length && /\s/.test(str[i])) i++;
    if (i >= str.length) break;

    if (str[i] === '"' || str[i] === "'") {
      const quote = str[i];
      let j = i + 1;
      while (j < str.length && str[j] !== quote) j++;
      tokens.push(str.substring(i, j < str.length ? j + 1 : j));
      i = j < str.length ? j + 1 : j;
    } else {
      let j = i;
      while (j < str.length && !/\s/.test(str[j])) j++;
      tokens.push(str.substring(i, j));
      i = j;
    }
  }

  return tokens.map(stripWrappingParens).filter((t) => t.length > 0);
};

// Rejoin a spaced adjacency wildcard "a * b" (tokenized as ['a','*','b']) into a
// single "a * b" token, so the lone '*' doesn't become a match-everything regex.
// Mirrors mergeSpacedWildcards in server/src/models/Note.js.
const isPlainWord = (t) =>
  !!t &&
  t.toUpperCase() !== 'OR' &&
  !t.startsWith('#') && !t.startsWith('$') && !t.startsWith('-') &&
  !t.startsWith('"') && !t.startsWith("'") &&
  !t.startsWith('yr:') && !t.includes('*');

const mergeSpacedWildcards = (tokens) => {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const left = out[out.length - 1];
    const right = tokens[i + 1];
    if (tokens[i] === '*' && isPlainWord(left) && isPlainWord(right)) {
      out[out.length - 1] = `${left} * ${right}`;
      i++; // consume the right-hand neighbour
      continue;
    }
    out.push(tokens[i]);
  }
  return out;
};

// Tokenize with the same structural normalisation the server applies.
const normalizedTerms = (str) => mergeSpacedWildcards(tokenizeQuery(str));

// Match a single token within a term group: exclusion, quoted phrase, wildcard,
// or plain text.
const matchSingleTerm = (note, term) => {
  if (term.startsWith('-') && term.length > 1) {
    return !searchInAllFields(note, term.substring(1));
  }
  if (
    (term.startsWith('"') && term.endsWith('"')) ||
    (term.startsWith("'") && term.endsWith("'"))
  ) {
    return searchInAllFields(note, term.substring(1, term.length - 1));
  }
  if (term.includes('*')) {
    return wildcardMatch(note, term);
  }
  return searchInAllFields(note, term);
};

/**
 * Decide whether `note` matches the live search `query`.
 * Returns true for an empty query (everything matches).
 */
export function doesNoteMatchSearchQuery(note, query) {
  if (!query || query.trim() === '') return true;

  const trimmedQuery = query.trim();

  // Whole-query quoted phrase.
  if (
    (trimmedQuery.startsWith('"') && trimmedQuery.endsWith('"')) ||
    (trimmedQuery.startsWith("'") && trimmedQuery.endsWith("'"))
  ) {
    return searchInAllFields(note, trimmedQuery.substring(1, trimmedQuery.length - 1));
  }

  // ID search: "!<uuid>" matches the note id exactly, or that text anywhere.
  if (trimmedQuery.startsWith('!') && trimmedQuery.length > 1) {
    const actualUuid = trimmedQuery.substring(1);
    return note.id === actualUuid || searchInAllFields(note, actualUuid);
  }

  // Single term (no spaces): wildcard or plain text (parens stripped for parity).
  if (!trimmedQuery.includes(' ')) {
    const single = stripWrappingParens(trimmedQuery);
    if (single.includes('*')) {
      return wildcardMatch(note, single);
    }
    return searchInAllFields(note, single);
  }

  const terms = normalizedTerms(trimmedQuery);
  const hasOrOperator = terms.some((term) => term.toUpperCase() === 'OR');

  if (hasOrOperator) {
    // At least one OR group must match; all terms within a group must match.
    const orGroups = trimmedQuery.split(/\s+OR\s+/i);
    return orGroups.some((group) => {
      const groupTerms = normalizedTerms(group.trim());
      return groupTerms.every((term) => matchSingleTerm(note, term));
    });
  }

  // No OR: every term must match (AND).
  return terms.every((term) => matchSingleTerm(note, term));
}

export default doesNoteMatchSearchQuery;
