# itsnotes REST API

itsnotes exposes a REST API used by its own frontend. You can call it from external scripts or apps using a long-lived token.

## Authentication

All endpoints (except `/api/health`) require a token passed as a Bearer header:

```
Authorization: Bearer <your-token>
```

**Getting a token**

1. `POST /api/auth/login` with your credentials — returns a short-lived session token.
2. Use that token to call `POST /api/auth/api-token` — returns a long-lived token (10 years).
3. Save the long-lived token. Treat it like a password.

```bash
# Step 1 — log in, capture the token
SESSION=$(curl -s -X POST https://your-instance/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "you", "password": "..."}' | jq -r '.token')

# Step 2 — mint a long-lived API token
curl -s -X POST https://your-instance/api/auth/api-token \
  -H "Authorization: Bearer $SESSION" | jq -r '.token'
# → eyJ...  (save this)
```

All subsequent requests use the long-lived token — no need to log in again.

---

## Notes

### List notes

```
GET /api/notes
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number |
| `limit` | number | 80 | Results per page |
| `archived` | boolean | false | Return archived notes |
| `deleted` | boolean | false | Return trashed notes |
| `oldestFirst` | boolean | false | Sort by creation date ascending |
| `includeDetails` | boolean | false | Include tags, images, and object links on each note |
| `truncateContent` | boolean | true | Truncate note content |
| `contentLimit` | number | 401 | Max chars when truncated |

**Response**

```json
{
  "notes": [ ...note objects... ],
  "totalCount": 412,
  "totalPages": 6,
  "currentPage": 1
}
```

---

### Search notes

```
GET /api/notes/search?query=...
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `query` or `q` | string | — | Search query (required) |
| `page` | number | 1 | Page number |
| `limit` | number | 80 | Results per page |
| `sortOrder` | string | `updatedAt_desc` | One of: `updatedAt_desc`, `updatedAt_asc`, `createdAt_desc`, `createdAt_asc`, `relevance` |
| `includeDetails` | boolean | false | Include tags, images, and object links |
| `truncateContent` | boolean | true | Truncate note content |
| `contentLimit` | number | 601 | Max chars when truncated |

**Search operators**

| Syntax | Example | Effect |
|---|---|---|
| Plain words | `coffee recipe` | AND match — all words must appear |
| `#tag` | `#reading` | Filter by tag name |
| `$color` | `$blue` | Filter by color label |
| `yr:year` | `yr:2024` | Filter by year |
| `yr:year:month` | `yr:2024:jan` | Filter by year and month |
| `"phrase"` | `"dark mode"` | Exact phrase match |
| `-word` | `-deleted` | Exclude word |
| `OR` | `coffee OR tea` | Either term |

---

### Get a single note

```
GET /api/notes/:id
```

Pass `?includeDetails=true` to include tags, images, and linked objects.

**Response:** `{ "note": { ...note object... } }`

---

## Note object

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Coffee brewing notes",
  "content": "<p>V60 at 94°C...</p>",
  "plain_content": "V60 at 94°C...",
  "color": "default",
  "is_pinned": false,
  "is_archived": false,
  "is_deleted": false,
  "created_at": "2024-03-15T10:22:00.000Z",
  "updated_at": "2024-03-15T11:05:00.000Z",
  "pinned_at": null,
  "archived_at": null,
  "trashed_at": null,

  "tags": [
    { "id": "...", "name": "reading", "color": null }
  ],
  "images": [
    { "id": 42, "name": "photo.jpg", "size": 204800 }
  ]
}
```

- `content` is HTML. `plain_content` is the stripped text version, better for full-text processing.
- `tags` and `images` are only present when `includeDetails=true`.
- Color values: `default`, `red`, `orange`, `yellow`, `green`, `teal`, `blue`, `purple`, `pink`, `brown`, `gray`.

---

## Tags

### List all tags

```
GET /api/tags
```

Returns all tags with a `note_count` field on each.

### Get notes by tag

```
GET /api/tags/:id/notes
```

Accepts the same `page`, `limit`, `includeDetails`, and `truncateContent` params as `GET /api/notes`.

---

## Example: fetch notes from a given month

```bash
TOKEN="eyJ..."
BASE="https://your-instance"

curl "$BASE/api/notes/search?query=yr:2023:mar&includeDetails=true&limit=100" \
  -H "Authorization: Bearer $TOKEN"
```

## Example: get all notes with a tag

```bash
# First, find the tag ID
curl "$BASE/api/tags" -H "Authorization: Bearer $TOKEN"

# Then fetch its notes
curl "$BASE/api/tags/<tag-id>/notes?includeDetails=true" \
  -H "Authorization: Bearer $TOKEN"
```

---

## CRUD

The same token works for write operations. The main endpoints:

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/notes` | Create a note. Body: `{ title, content }` |
| `PUT` | `/api/notes/:id` | Update a note |
| `DELETE` | `/api/notes/:id` | Permanently delete a note |
| `PATCH` | `/api/notes/:id/archive` | Archive |
| `PATCH` | `/api/notes/:id/trash` | Move to trash |
| `PATCH` | `/api/notes/:id/pin` | Toggle pin |
| `POST` | `/api/notes/:id/tags` | Add tag. Body: `{ name }` or `{ id }` |
| `DELETE` | `/api/notes/:id/tags/:tagId` | Remove tag |

Note `content` is HTML. To create a plain-text note, wrap it in a `<p>` tag.
