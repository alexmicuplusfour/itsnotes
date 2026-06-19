# Markdown Mirroring — Roadmap

Mirror every note in the database to a mounted folder as a `.md` file with YAML
frontmatter for metadata. End goal is **two-way sync** (edit notes in itsnotes *or*
in an external editor like Obsidian/VS Code), built in phases. The database stays
the source of truth; the folder is a projection.

## The core challenge

Note content is stored as **HTML** (produced by the Tiptap editor), not markdown.
On top of plain HTML, notes contain custom nodes that markdown has no native
concept of:

- **Tag mentions** — `<span data-type="tag-mention">`
- **Object embeds** (goodreads/imdb) — `object-mention` (inline) and `object-card`
  (block), referencing rows in the `objects` table
- **Images** — stored as base64 text inside the DB (`note_images.data`), not files
- **Attachments** — files on disk (`note_attachments.file_path`)
- **Collapsible "details" blocks**, links, reminders, color, pinned/archived/trashed

So mirroring is really *"project a rich HTML document down to markdown + a sidecar of
metadata, and back again."* Markdown is a lossy view of the real data — managing that
loss is the heart of the work.

## Metadata format: YAML frontmatter

Standard `---` block at the top of each file (same convention as Obsidian, Joplin,
Jekyll, Hugo, Pandoc). Preserved by plain-text editors trivially.

```markdown
---
id: 4f3c...           # note UUID — never changes, the stable anchor
title: Books to read
color: teal
pinned: true
archived: false
trashed: false
tags: [reading, 2026]      # regular tags (is_folder = false)
folders: [Work]            # folder-type tags (is_folder = true)
created: 2026-06-19 10:30:00
updated: 2026-06-19 11:05:00
---

Note body in markdown here...
```

## Prior art: Joplin

Joplin also stores notes in its own database, not as markdown files. Its "Markdown +
Front Matter" feature is an export/import format, not live storage. Fields it uses:
`title, created, updated, source, author, latitude/longitude, tags`, plus todo fields.
Attachments go to a `_resources/` folder and are linked. Takeaway: even Joplin treats
markdown-with-frontmatter as a projection, not the source of truth — because of the
same fidelity loss. We do the same.

---

## Tooling & dependencies

The mirror worker is **server-side** (needs DB access, filesystem, `LISTEN`/`NOTIFY`).
Almost everything needed is already installed — the only real gap is the HTML→Markdown
engine.

**Already installed (reuse):**

| Need | Library | Notes |
|---|---|---|
| Parse note HTML (DOM walk) | `jsdom` | server dep |
| MD→HTML (Phase 3 import) | `marked` | also used client-side in `textToHtml.js` |
| Frontmatter YAML | `js-yaml` | present transitively — pin explicitly |
| Reminder RRULE parse/format | `rrule` | already used for reminders |
| Write/convert images to `_resources/` | `sharp` | infer ext/format from bytes |
| File watching (Phase 4) | `chokidar` | present in server modules |
| DB queries + `LISTEN`/`NOTIFY` | `knex` + `pg` | already core deps |

**To add (small):**

- **`turndown`** — the HTML→Markdown engine (the one genuine gap). Register a custom
  **rule** per custom node; standard markdown (headings, lists, bold, links, blockquote,
  code) comes free. Do **not** hand-roll a DOM walker.
  - **`turndown-plugin-gfm` is *not* needed.** Its table rule would mangle our tables
    (block-content cells, no header row → we pass tables through as raw HTML instead),
    and its task-list rule looks for `<input>` checkboxes that Tiptap's
    `<li data-type="taskItem">` doesn't have (→ custom rule). Strikethrough is a
    one-line custom rule. So turndown core + a few custom rules covers everything.
- **`gray-matter`** (optional) — standard frontmatter reader/writer over js-yaml;
  handles `---` delimiters and edge cases. Could use js-yaml directly instead.

**Reuse in-house (don't reinvent):**

- The **Tiptap extensions** (`Tiptap*Extension.js`) are the spec for the converter
  rules — their `parseHTML`/`renderHTML` define the exact `data-` attributes for each
  custom node. Read those rather than re-deriving the HTML shape.
- **`markdownToHtml`** in `client/src/utils/textToHtml.js` — Phase 3's importer should
  mirror it so imported `.md` looks identical to the existing drag-drop import path.
- **`resolveTagMentions`** in `client/src/components/Header.jsx` — already turns `#name`
  into tag-mention spans and creates missing tags; Phase 3 import reuses this logic.

**Hand-roll deliberately:**

- **Slugify** — generic slug libs don't guard Windows reserved device names
  (`CON`, `NUL`, `COM1`…), which we need anyway. ~20 lines of in-house code beats a
  partial dependency we'd have to wrap. See "Filename rules".

## Phases

### Phase 0 — Write the spec (no code)

Lock the decisions so we never have to migrate file formats later:

- **Frontmatter fields**: `id`, `title`, `created`, `updated`, `color`, `pinned`,
  `archived`, `trashed`, `tags`, `reminders`, plus an internal `content_hash`.
- **Filename**: see "Filename rules" below (decided).
- **Folder layout**: flat (decided) — see "Folder structure" below.
- **Object embeds**: `![object](object:UUID)` markers — the goodreads/imdb data stays
  in the DB.
- **Deletion**: trashed → move file to `trash/`; hard delete → remove file.

#### Folder structure (decided)

**Flat: all note files live in one folder.** Organization (tags + folders) lives in
frontmatter, not in directory structure.

Why not mirror the DB's folder/tag tree as directories:

- In itsnotes, folders contain **tags**, not notes. A note's link to a folder is
  indirect (note → tags → folder), and `note_tags` is **many-to-many** — a note can
  carry many regular tags *and* many folder-type tags at once (confirmed: this is the
  user's normal usage).
- A filesystem is a **tree** — one file per directory. Projecting many-to-many onto a
  tree requires either **duplicating** each file into every tag's directory (a sync
  nightmare) or **symlinks** (broken on Windows, in git, and in Obsidian/Dropbox sync).
- Flat keeps sync **robust**: adding/removing a tag never moves a file, so no churn and
  no "which copy is real" conflicts. Obsidian's tag pane/search still gives folder-like
  browsing from the frontmatter `tags:` — and correctly shows a note under *all* its
  tags, which a real tree can't.

This matches how tag-first apps (Obsidian, Logseq, Bear) store notes. Apps that *do*
mirror a tree (Joplin) have a single-location container (a notebook); itsnotes does not.

**Tags vs folders in frontmatter:** because a note can hold both kinds, they're two
separate lists — `tags:` (regular, `is_folder = false`) and `folders:` (folder-type,
`is_folder = true`). Per-note frontmatter only records *which* tags/folders are
assigned; the tag hierarchy (parent_id) is a property of the tag definitions in the DB,
not duplicated into every note. The directory layout stays:

```
<mount>/
  shopping-list-4f3c8a2b.md
  pick-up-milk-and-eggs-9a2b1c7d.md
  _resources/        # images (from base64 in DB) + attachments
  trash/             # trashed notes (is_deleted = true)
```

Subfolders are only used for `_resources/` and `trash/` — never for organizing notes.

#### Filename rules (decided)

Identity lives in the frontmatter `id:`, not the filename — import always matches by
`id`. The filename is cosmetic (for browsing/grep), but must be **deterministic and
stable** so sync never wobbles.

**Pattern:** `<slug>-<shortid>.md` — e.g. `shopping-list-4f3c8a2b.md`

- **slug source** (first that exists):
  1. note `title`
  2. first line of `plain_content` (Keep-style notes often have no title — this is the
     common case, not an edge case)
  3. `untitled`
- **shortid**: first 8 hex chars of the note UUID. Always appended (decided), so every
  filename is unique and stable even when two notes share a title/first-line. The mirror
  worker verifies uniqueness against `note_files` and extends the shortid if the rare
  8-char clash ever happens.
- **slug normalization**: lowercase; spaces → hyphens; collapse repeated hyphens; trim
  leading/trailing hyphens, dots, spaces; cap at ~80 chars.
- **Windows safety** (user is on Windows 11): strip `< > : " / \ | ? *` and control
  chars; guard reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`,
  `LPT1`–`LPT9`) by suffixing so a note titled e.g. "CON" still yields a valid name.

**File renames are cosmetic (decided):** the note `title` is authoritative for the
filename. If a user renames a `.md` file in an external editor, the next sync renames it
back to match the title. (Revisit "filename rename → note rename" in Phase 4.) Because
`note_files` tracks each note's current `rel_path`, a title change triggers an
`fs.rename` (git sees a rename, not delete+create churn).

#### Frontmatter fields (final)

```yaml
id: 4f3c8a2b-1c7d-4e2a-9b11-7f0a2c3d4e5f   # note UUID — the stable anchor
title: Weekend                              # may be null/empty
color: teal
pinned: true
archived: false
trashed: false
tags: [reading, films]                      # regular tags (is_folder = false)
folders: [Personal]                         # folder-type tags (is_folder = true)
created: 2026-06-19 10:30:00                 # ISO 8601, UTC, 'T'→space (Joplin-style)
updated: 2026-06-19 11:05:00
reminders:                                  # omit the key entirely if none
  - at: 2026-06-21 09:00:00
    timezone: Europe/Bucharest
    rrule: FREQ=WEEKLY;BYDAY=SA              # optional (one-off reminders omit it)
```

Deliberately **excluded** from frontmatter:

- `content_hash` and `version` — live in the `note_files` DB table, not the file. The
  hash detects whether the user actually edited a file, so storing it inside the file it
  hashes would be circular; it also keeps frontmatter clean.
- Bookkeeping timestamps (`pinned_at`, `unpinned_at`, `trashed_at`, `archived_at`, …) —
  the DB sets these itself when a flag flips. If a user sets `archived: true` in a file,
  import flips `is_archived` and the existing trigger/logic updates the `_at` column.

#### Content conversion (decided)

The note body is stored as **HTML** (Tiptap). Conversion uses real markdown wherever a
native form exists; for custom atoms with no markdown equivalent, one consistent
convention: `[text](object:id)` for an **inline reference** and `![text](id)` for a
**block embed** — mirroring markdown/Obsidian's link-vs-embed distinction.

| In the note (HTML node) | In the `.md` file |
|---|---|
| headings, lists, bold/italic, blockquote, code, links | native markdown |
| tag mention `<span data-type="tag-mention">#x</span>` | inline `#x` **and** frontmatter `tags:` (inline keeps position; frontmatter is authoritative for assignments) |
| inline image — **base64 `src`** (primary form in real data) | decode bytes → write to `_resources/` → `![alt](_resources/img-<hash>.<ext>)`; ext sniffed from the data-URI mime |
| inline image — `<img data-image-id="123">` (newer ref form) | `![alt](_resources/img-123.png)` — id in filename → deterministic round-trip; ext from `note_images.type` |
| remote URL `src` | `![alt](https://…)` kept verbatim |
| attachment `<div data-type="attachment" id=…>` | `[filename](_resources/att-<id>-filename.ext)` (file copied into `_resources/`) |
| object mention `<span data-type="object-mention" data-object-id=…>` | `[title](object:<uuid>)` |
| object card `<div data-type="object-card" objectid=…>` | `![title](object:<uuid>)` on its own line |
| collapsible `<details><summary>` | raw `<details><summary>…</summary>…</details>` (no markdown equivalent; renders in Obsidian/GitHub) |
| task list `<li data-type="taskItem" data-checked="true">` | `- [x]` / `- [ ]` via a **custom rule** — Tiptap's shape has no `<input>` checkbox, so the standard turndown-gfm task-list rule won't match it |
| table `<table class="tiptap-table">` | **raw HTML passthrough** (verbatim, like `<details>`). Real tables hold block content in cells (multiple `<p>`, links) and may lack a header row — neither is expressible in GFM markdown tables. Pretty GFM conversion for genuinely-tabular tables is a later nice-to-have, not worth the data-loss risk |

Notes:

- **Objects and tags are shared, DB-owned entities** (many-to-many via `note_objects` /
  `note_tags`). The `.md` only *references* them by id/name; their data is never the
  file's to own. Import matches objects by `object:<uuid>` and tags by name.
- **Image dimensions** (`width`/`height`, when set) are preserved with a Pandoc/Obsidian
  attribute suffix: `![alt](_resources/img-123.png){width=300}`. Otherwise omitted.
- **`_resources/` filenames embed the source row id** (`img-123`, `att-45`) so the
  reverse path is deterministic. A brand-new file/link a user adds in an external editor
  has no id → import creates a new `note_images` / `note_attachments` row.
- **Orphan associations** (an image/attachment/object linked to the note but not placed
  inline in the body) are an edge case for Phase 2 — likely appended in a trailing
  section so they're never silently dropped.

### Phase 1 — The HTML→Markdown converter

Only the **HTML→MD** direction is needed for the one-way mirror (Phase 2). The files
are a read-only projection — nothing reads them back yet, so MD→HTML is deferred to
Phase 3.

- Handle tag-mentions, object-mention/object-card, images (write to `_resources/`),
  attachments, collapsible `<details>`, links — per the conversion table above.
- **Critical:** emit clean, parseable markers (`object:<uuid>`, `img-<id>`, `att-<id>`)
  so the reverse converter (Phase 3) is straightforward and round-tripping is reliable.
- Faithfulness here is verified by eye (you can read the files). The strict
  `HTML → MD → HTML` round-trip test belongs with MD→HTML in Phase 3, because it only
  matters for write-back safety.

### Phase 2 — One-way export (DB → folder)

A server-side **mirror worker** that keeps the folder in sync with the DB, built as a
**desired-state reconciler**, not just an event handler. New table
`note_files(note_id, rel_path, content_hash, last_synced_at, version)` tracks the
mapping and makes drift-detection cheap. Gated behind a config flag + mount path.

**Reconciliation sweep is the source of correctness:**

- **On startup** — a full pass comparing every DB note against the files (the initial
  export is just this sweep against an empty folder).
- **Periodically** (configurable, default a few minutes) — a cheap pass that fixes
  drift: create files for notes with no `note_files` row, rewrite files whose note
  `updated_at` > `last_synced_at` (or hash mismatch), delete files for notes that no
  longer exist, move trashed notes to `trash/`.

**`pg_notify` is only a fast-path optimization.** `NOTIFY` is fire-and-forget — a
notification is delivered only to a listener connected at that instant. If the worker is
down/restarting/disconnected, that event is lost forever (no queue, no retry). So the
`LISTEN` path just lowers latency for live edits; the periodic sweep guarantees the
folder always converges, making the whole system self-healing.

**At the end of this phase you have a usable, backupable, git-able folder.**

### Phase 3 — Import (folder → DB), manual trigger

A command that reads the folder, parses frontmatter + body, matches notes by `id`,
converts MD→HTML, and reconciles tags/color/flags. Run on demand. Proves the reverse
path with zero live-sync risk.

### Phase 4 — Live two-way watch

A file watcher (chokidar) with:

- debounce
- **content-hash loop prevention** (ignore the change we just wrote ourselves)
- atomic writes (temp file + rename, so a half-saved file never corrupts a note)
- a simple conflict policy (last edit wins, bump `version`, keep a `.conflict` copy so
  nothing is ever silently lost)

### Phase 5 — Polish

Object/attachment edge cases, performance on a large library, a settings toggle in the
UI, and short docs.

---

## Recommended sequencing

Phases 1 and 2 give ~80% of the value (portable, grep-able, version-controlled backup)
at low risk. Ship those, live with them, *then* do 3 → 4. The Phase 1 converters are
the thing most likely to surprise us, so proving them early de-risks everything after.

## References

- [Joplin: Markdown with Front Matter spec](https://joplinapp.org/help/dev/spec/interop_with_frontmatter/)
- [Joplin forum: YAML front matter in markdown export/import](https://discourse.joplinapp.org/t/yaml-front-matter-metadata-in-markdown-export-and-import/9384)
