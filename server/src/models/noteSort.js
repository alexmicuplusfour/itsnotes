// Canonical note sort vocabulary, shared by the list and search queries.
//
// Sort names travel unchanged from the client UI through the API to here, where
// they map to prebuilt ORDER BY specs. Nothing user-supplied reaches SQL: an
// unknown name falls back to the view's default. Every spec ends with the id
// column so ordering is fully deterministic — timestamps tie in practice (bulk
// imports stamp many notes with the same second) and offset pagination skips or
// duplicates rows across page boundaries when the order within a tie is left to
// the database.

const ORDER_SPECS = {
  created_desc: [
    { column: 'notes.created_at', order: 'desc' },
    { column: 'notes.id', order: 'desc' },
  ],
  created_asc: [
    { column: 'notes.created_at', order: 'asc' },
    { column: 'notes.id', order: 'asc' },
  ],
  updated_desc: [
    { column: 'notes.updated_at', order: 'desc' },
    { column: 'notes.created_at', order: 'desc' },
    { column: 'notes.id', order: 'desc' },
  ],
  updated_asc: [
    { column: 'notes.updated_at', order: 'asc' },
    { column: 'notes.created_at', order: 'asc' },
    { column: 'notes.id', order: 'asc' },
  ],
  archived_desc: [
    { column: 'notes.archived_at', order: 'desc', nulls: 'last' },
    { column: 'notes.updated_at', order: 'desc' },
    { column: 'notes.created_at', order: 'desc' },
    { column: 'notes.id', order: 'desc' },
  ],
  trashed_desc: [
    { column: 'notes.trashed_at', order: 'desc', nulls: 'last' },
    { column: 'notes.updated_at', order: 'desc' },
    { column: 'notes.created_at', order: 'desc' },
    { column: 'notes.id', order: 'desc' },
  ],
};

const defaultListSort = ({ archived, deleted }) => {
  if (deleted) return 'trashed_desc';
  if (archived) return 'archived_desc';
  return 'created_desc';
};

// Resolve the sort for GET /notes. `sort` is the canonical parameter; the
// pre-unification params `sortCriteria` + `oldestFirst` are accepted as
// deprecated aliases because docs/api.md documents them publicly.
const normalizeListSort = ({ sort, sortCriteria, oldestFirst, archived, deleted } = {}) => {
  if (ORDER_SPECS[sort]) return sort;
  if (oldestFirst) return 'created_asc';
  if (sortCriteria === 'created_at') return 'created_desc';
  return defaultListSort({ archived, deleted });
};

// Resolve the sort for search queries. Accepts canonical names plus the old
// camelCase values (also documented publicly).
const SEARCH_SORT_ALIASES = {
  updatedAt_desc: 'updated_desc',
  updatedAt_asc: 'updated_asc',
  createdAt_desc: 'created_desc',
  createdAt_asc: 'created_asc',
};

const normalizeSearchSort = (sortOrder) => {
  if (ORDER_SPECS[sortOrder]) return sortOrder;
  return SEARCH_SORT_ALIASES[sortOrder] || 'updated_desc';
};

module.exports = { ORDER_SPECS, normalizeListSort, normalizeSearchSort, defaultListSort };
