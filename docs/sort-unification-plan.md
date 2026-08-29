# Note sorting unification — plan

*Written 2026-08-29. Goal: add "Recently Updated" to the main notes list, and while doing it,
tear out the legacy sort plumbing so the whole sorting system speaks one language.*

**Status: built and verified 2026-08-29.** All server tests pass (272, including a new
`noteSort.test.js` and the previously-broken `searchSql.test.js` — its throwaway DB was
built from the baseline migration only and predated `note_sketches`; it now applies every
migration like a fresh install). API verified with 13 live checks (canonical sorts, legacy
aliases, fallbacks, search variants, pinned handling). Browser-verified via Playwright:
menu shows the new option, list reorders, month markers hide/return, the choice survives
reload, and a real edit arriving over the socket bumps the card to the top of the unpinned
section. One nuance found while verifying: a PUT that changes nothing is treated by the
server as a no-op (no `updated_at` bump, no broadcast — pre-existing, correct), so only
real changes float a note.

A review pass the same day fixed four stragglers: the grid view's sticky month header could
show a stale month label while scrolling under Recently Updated (it now resets, like the
list layout already did); a dead `SORT_OPTIONS` import and a stale comment; and the search
route now accepts `q` as an alias for `query` — the API docs had promised it forever, but
the server never implemented it.

## What this is

The sort menu on the main list currently offers only Newest / Oldest (by creation date).
Search — and therefore every folder view, since folders are tag searches — also offers
**Recently Updated**. The main list is the only view without it, and the reason is plumbing,
not product: the client's clean sort vocabulary gets translated into three legacy API
parameters, and the server's main-list query only ever learned to sort by `created_at`.
The translation table even contains a `// fallback for main view` comment where
"Recently Updated" silently degrades to creation-date sort.

Rather than teach the legacy layer one more trick, this plan replaces it: **one canonical
sort vocabulary end to end** (client state → API parameter → SQL), with the legacy
parameters kept as deprecated aliases at the route boundary because `docs/api.md`
documents them publicly.

The payoff of Recently Updated on the main list is real for this app specifically: a note's
`updated_at` is bumped by edits from *any* surface — another device, Claude via MCP, the
MD mirror folder (Obsidian edits land through the mirror worker) — so "whatever I touched
last, anywhere, floats to the top" is something creation-date sort can never give.

## What the deep dive found (all verified in code)

| Piece | Where | State |
| --- | --- | --- |
| Unified sort options | `client/src/contexts/SortingContext.jsx` | Already defines the full vocabulary (`created_desc`, `created_asc`, `updated_desc`, `archived_desc`, `trashed_desc`) with per-view menus and defaults. Main view's menu just doesn't include `updated_desc`. |
| Legacy translation | `SortingContext.jsx` `convertToLegacyParams` / `convertFromLegacyParams` | Converts the vocabulary into `sortCriteria` + `oldestFirst` (list API) and `searchSortOrder` (search API). This is where `updated_desc` degrades to `created_at` for the main view. `convertFromLegacyParams` has **zero callers**. |
| Main list query | `server/src/models/Note.js` `findAll` (~line 1101) | Sorts by `created_at` only; `sortCriteria` is honored only in the archive/trash branches. Field-selection and hidden-tag-filter blocks are copy-pasted three times. Pinned notes are fetched separately on page 1 (by `pinned_at` desc) and prepended. |
| Search query | `Note.js` `applySorting` (~line 362) | Supports `createdAt_asc`, `createdAt_desc`, `updatedAt_desc`; anything else (including the documented `updatedAt_asc` and `relevance`) silently falls back to `updatedAt_desc`. |
| List route | `server/src/routes/notes.js` GET `/` (~line 65) | Passes `oldestFirst` + `sortCriteria` straight through. Search route (~line 115) passes `sortOrder` through. |
| API consumers | one each: `client/src/services/api.js` `getNotes`/`searchNotes`, called only from `NotesContext.jsx` `loadNotes`/`handleSearch`. Extension and MCP tools send **no sort params at all**. `docs/api.md` documents `oldestFirst` and `sortOrder` publicly. `itsnotes-openapi.json` doesn't mention sorting. |
| Month markers | `client/src/components/NotesList.jsx` `notesByMonth` (~line 361), `client/src/components/ListView.jsx` (~line 371) | Main view groups unpinned notes under month headers **by creation month**. A list sorted by `updated_at` would be re-bucketed into creation months and look scrambled. Search/archive/trash already render flat, so they never hit this. ListView also hardcodes newest-month-first, which is already wrong in "Oldest" mode. |
| Live updates | `NotesContext.jsx` `_updateOrRemoveNoteInState` (~line 830) | The single funnel for note state changes: existing notes update **in place** (position preserved); notes entering the view are prepended. All socket events and optimistic edits go through it. |
| What bumps `updated_at` | `Note.js` `update`/`bulkUpdate`; triggers in `server/migrations/0001_baseline.sql` (~line 151) | Every update bumps it (edits, pin/unpin, color, archive/unarchive). DB triggers bump it when a tag is added to / removed from a note, and **renaming a tag bumps every note carrying it**. |
| Indexes / tiebreakers | `0001_baseline.sql` (~line 359) | Index on `created_at`, none on `updated_at`. No ORDER BY anywhere has a tiebreaker — Keep-imported notes share identical timestamps, so offset pagination can skip/duplicate notes at page boundaries **today**. |
| Dead code | `NotesContext.jsx` `setSortNewest`/`setSortOldest`/`toggleSortOrder` (~line 2399); `SortingContext.jsx` `UPDATED_ASC` option + `convertFromLegacyParams`; `Header.jsx` destructures the dead setters (~line 894) but never calls them | All deletable. `SortingContext`'s docstring also claims search defaults to `updated_desc` when the code says `created_desc`. |
| Persistence | `SortingContext.jsx` | Sort choice is plain `useState` — resets to defaults on every page load. |

## The canonical vocabulary

The client's existing option strings become the wire format and the SQL mapping key:

| Sort | ORDER BY (always ends with the `id` tiebreaker) |
| --- | --- |
| `created_desc` | `created_at DESC, id DESC` |
| `created_asc` | `created_at ASC, id ASC` |
| `updated_desc` | `updated_at DESC, created_at DESC, id DESC` |
| `updated_asc` | `updated_at ASC, created_at ASC, id ASC` *(search API only — documented, currently fake)* |
| `archived_desc` | `archived_at DESC NULLS LAST, updated_at DESC, created_at DESC, id DESC` |
| `trashed_desc` | `trashed_at DESC NULLS LAST, updated_at DESC, created_at DESC, id DESC` |

Notes: ids are UUIDs, so the tiebreaker carries no meaning — it only makes ordering
deterministic so offset pagination can't skip/duplicate notes when timestamps tie.
Sort names map to these prebuilt specs; nothing user-supplied ever reaches SQL, and an
unknown name falls back to the view's default.

## Changes

Ordered so the app works after every step. One coherent change, committed in slices.

### 1. Server: sort module + `findAll` rebuild

- New pure module `server/src/models/noteSort.js`:
  - `ORDER_SPECS` — the table above, as knex `orderBy` arrays.
  - `normalizeListSort({ sort, sortCriteria, oldestFirst, archived, deleted })` → canonical
    name. Legacy mapping: `sortCriteria === 'created_at'` → `created_asc`/`created_desc` by
    `oldestFirst`; bare `oldestFirst=true` → `created_asc`; otherwise the view default
    (`trashed_desc` for trash, `archived_desc` for archive, `created_desc` for main).
  - `normalizeSearchSort(sortOrder)` → canonical name. Accepts canonical names plus the old
    aliases (`updatedAt_desc`, `updatedAt_asc`, `createdAt_desc`, `createdAt_asc`);
    default `updated_desc`.
- `Note.findAll`: replace `oldestFirst`/`sortCriteria` params with one `sort` param
  (already normalized by the route). Apply `ORDER_SPECS[sort]` in all three branches
  (page-1 unpinned query, later-pages query, archive/trash query). Extract the copy-pasted
  field-selection and hidden-tag-exclusion blocks into small helpers while in there.
  Pinned handling is untouched: page 1 of the main view still fetches pinned notes
  separately, ordered by `pinned_at`, and prepends them.
- `applySorting` (search builder): look up `ORDER_SPECS` via `normalizeSearchSort`.
  This makes `updated_asc` real (it's documented) and gives search the tiebreakers too.
- Route GET `/api/notes`: accept `sort`; call `normalizeListSort` so old callers keep
  working unchanged. Route GET `/api/notes/search`: run `sortOrder` through
  `normalizeSearchSort`.

### 2. Migration

- `server/migrations/0015_notes_updated_at_index.sql`:
  `CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON public.notes(updated_at);`
  Cheap insurance; search already sorts by `updated_at` with no index and no complaints
  at current scale.

### 3. Client: speak canonical, delete the translators

- `api.js`: `getNotes` sends `sort=<canonical>` (drop `oldestFirst`/`sortCriteria`);
  `searchNotes` sends the canonical name as `sortOrder`. One caller each.
- `NotesContext.jsx`: `loadNotes` and `handleSearch` pass the sort option string straight
  through — delete every `convertToLegacyParams` call (also the secondary spots around
  lines 476/499/558/724 that only extract `searchSortOrder`).
- `SortingContext.jsx`: delete `convertToLegacyParams` + `convertFromLegacyParams`;
  fix the stale docstring.

### 4. Client: the feature itself

- `VIEW_AVAILABLE_SORTS.main` → `[created_desc, updated_desc, created_asc]` — the menu
  becomes **Newest / Recently Updated / Oldest**, identical to search's. (Archive/trash
  menus unchanged; their "Recently Archived/Trashed" defaults already are recency sorts.)
  The Header menu builds itself from this list — no UI code changes.
- **Persistence:** `SortingContext` initializes per-view sort from localStorage
  (single JSON key, e.g. `itsnotes_sort_prefs`) with a lazy `useState` initializer,
  validates each stored value against that view's available sorts (fall back to default),
  and writes through in `setSortForView`. Defaults unchanged — Newest stays the default;
  the choice just survives reloads.
- **Live bump-to-top:** in `_updateOrRemoveNoteInState`'s `updateNotesList`, when the
  updated note already exists in the list and the *main list's* active sort is
  `updated_desc`, move it to the front of the array instead of updating in place
  (front of array = top of the unpinned section; pinned notes render from their own
  sorted memo, so a pinned note moving in the array is harmless). Read the current sort
  via a ref, matching the file's existing ref pattern, to avoid re-creating the callback.
  Because everything funnels through this function, one change covers local edits, other
  devices, MCP edits, and mirror imports. Search results keep their intentional
  in-place behavior.

### 5. Client: month markers step aside

Month headers only make sense when the list is in creation-date order.

- Shared helper in `SortingContext.jsx`: `isCreatedSort(option)` (true for
  `created_desc`/`created_asc`).
- `NotesList.jsx`: when the active sort isn't a created sort, `notesByMonth` returns the
  flat structure (same shape search uses) and the render condition treats it as flat —
  exactly how search/archive/trash render today. Flip back to Newest and markers return.
- `ListView.jsx`: add the same condition to its flat-list check (~line 372), and fix the
  existing bug while there: its month-group sort hardcodes newest-first (~line 399) —
  make it respect `created_asc` like `NotesList` does.

### 6. Teardown

- `NotesContext.jsx`: delete `setSortNewest`, `setSortOldest`, `toggleSortOrder` and their
  context exports (~lines 2399–2405, 2696–2698, 2776).
- `Header.jsx`: delete the dead `setSortNewest, setSortOldest` destructure (~line 894).
- `SortingContext.jsx`: delete the unreachable `UPDATED_ASC` client option ("Oldest
  Updated" — no view offers it; it lives on server-side only, for the public search API).

### 7. Docs

- `docs/api.md`:
  - GET `/api/notes`: document `sort` with the canonical values; mark
    `oldestFirst`/`sortCriteria` as deprecated aliases that still work.
  - Search: list what the server now actually supports — canonical names plus the
    `updatedAt_desc`-style aliases; **remove `relevance`** (it was never implemented).

## Deliberately accepted behavior (not bugs)

- **"Updated" is broader than editing text.** Pin/unpin, color change, tagging, and
  unarchiving all bump `updated_at`; renaming a tag bumps every note carrying it (DB
  trigger), so a folder rename floats all its notes at once under Recently Updated.
  Same as search's Recently Updated today, just more visible on the main list.
- **Offset-pagination drift.** Under `updated_desc`, edits happening mid-scroll shift page
  boundaries; a note can be missed until the next refresh (duplicates are already filtered
  client-side). Same artifact class the app accepts elsewhere (e.g. new notes prepend to
  the top even in Oldest mode). The `id` tiebreaker fixes the *deterministic* part
  (timestamp ties); the *live-mutation* part stays best-effort by design.
- **Pinned section is sovereign.** Sort options reorder only the unpinned section; pins
  stay ordered by pin time. Matches current behavior in every view.
- **Search live-updates stay in place.** The client search matcher is best-effort by
  design; no bump-to-top there.

## Verification

1. `cd server && npm test` — existing Jest suite plus a new `noteSort.test.js` covering:
   canonical passthrough, every legacy alias, unknown values → view defaults, and that
   every spec ends with the `id` tiebreaker.
2. Apply migration 0015 to the localhost DB (disposable — test freely).
3. Browser, main view: flip Newest → Recently Updated → Oldest; confirm order changes,
   month markers hide under Recently Updated and return under Newest/Oldest, in both grid
   and stacked layouts.
4. Edit a note mid-list under Recently Updated → it moves to the top of the unpinned
   section immediately. Edit its mirror `.md` file → same (after mirror import fires).
5. Pin, recolor, tag a note under Recently Updated → floats to top (expected).
6. Reload the app → sort choice per view survives; fresh profile → defaults to Newest.
7. Archive/trash/search views: unchanged behavior, sorts still work.
8. API compatibility: `GET /api/notes?oldestFirst=true` and
   `GET /api/notes/search?sortOrder=updatedAt_desc` still return correctly ordered
   results (aliases), and the new `sort=updated_desc` / `sortOrder=updated_asc` work.
9. "Load more" under Recently Updated pages without duplicates (dedup + tiebreaker).

## Scope

Nine files + one migration: `SortingContext.jsx`, `NotesContext.jsx`, `api.js`,
`NotesList.jsx`, `ListView.jsx`, `Header.jsx`, `server/src/models/Note.js` (+ new
`noteSort.js` + test), `server/src/routes/notes.js`, `docs/api.md`,
`server/migrations/0015_notes_updated_at_index.sql`.
