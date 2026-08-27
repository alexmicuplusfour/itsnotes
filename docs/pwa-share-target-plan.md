# PWA share target — plan

*Written 2026-08-27, prompted by the first external user feedback: "I'd like to see the PWA as a share target."*

## What this is

On Android, apps that register as a **share target** appear in the system share menu. The goal: from
any app (Chrome, YouTube, gallery, …) tap Share → itsnotes, and the shared thing lands as a new note.
For an installed PWA this takes one manifest entry plus a landing page in the app that receives the
shared data. It is the standard "capture on the go" flow for a notes app.

Two phases:

- **Phase 1 — text and links.** Small change, covers the bulk of real sharing (articles, videos, text snippets).
- **Phase 2 — photos.** Needs service-worker work; do it after the tester reacts to Phase 1.

## What the deep dive found (all verified in code)

The plumbing this feature needs already exists almost end to end:

| Piece | Where | State |
| --- | --- | --- |
| PWA manifest | `client/manifest.json` | Exists, installable; **no `share_target` yet** — that's the missing switch. Vite emits it content-hashed and links it from `index.html`, so edits propagate on each build. |
| Service worker | `client/public/sw.js`, registered at root scope in `client/src/index.jsx` | Exists (cache-only today). Root scope covers a `/share` URL. Untouched in Phase 1; extended in Phase 2. |
| Auth | JWT in localStorage; `client/src/components/ProtectedRoute.jsx` | Login screen renders **in place** — no redirect, URL untouched (`AuthPage` never navigates). A share URL opened while logged out survives the login and then processes. No stashing needed. |
| Create note API | `POST /api/notes` (`server/src/routes/notes.js:247`) | Takes `{title, content}`. Server derives the search text itself (`Note.create` → `plain_content`), and **already generates link previews** for URLs on their own line (`syncLinkPreviews` → `utils/extractLinkUrls.js`, which requires the link to be alone in its paragraph). |
| Plain text → note HTML | `formatPlainTextPasteToHtml` in `client/src/utils/textToHtml.js` | Exactly the converter needed: escapes HTML, one `<p>` per line, preserves blank lines, auto-links bare URLs. Same convention the Keep import uses server-side (`utils/keepNoteToContent.js`). |
| Open note by URL | `/?note=<id>` (`client/src/navigation/`) | Works today; `openNoteById` fetches from the API if the note isn't loaded. Perfect landing after creating the shared note. The server's `note_created` socket event also inserts it into the grid. |
| Image upload | `POST /api/notes/:noteId/images` (`server/src/routes/images.js:89`) | Takes a base64 data URL; server re-encodes to WebP + thumbnail. This is the Phase 2 path for photos. |
| Web server | `client/nginx.conf` | SPA fallback (`try_files … /index.html`) already serves the app for `GET /share` — zero server/nginx changes in Phase 1. |
| Capacitor scripts | root `package.json` (`android:*`) | Leftovers — no `android/` project exists. The PWA is the mobile app, which makes this feature the right investment. |

## Phase 1 — share text and links

**Status: built and verified 2026-08-27** (unit tests on the compose logic in
`client/src/utils/shareToNote.test.js`, plus an end-to-end browser run: `/share` URL → note
created → opened in the editor with the link-preview card). Awaiting deploy + real-device testing.

### Flow

1. User taps Share in any app and picks itsnotes.
2. Android opens the installed PWA at `/share?title=…&text=…&url=…`.
3. A minimal "Saving…" page composes a note from the params, creates it via the normal API,
   then jumps to `/?note=<new id>` — the freshly created note, open in the editor, ready to edit or tag.

### Changes

1. **`client/manifest.json`** — add:

   ```json
   "share_target": {
     "action": "/share",
     "method": "GET",
     "params": { "title": "title", "text": "text", "url": "url" }
   }
   ```

   Also add `"id": "/"` to pin the app's identity explicitly (it's the current default; locking it
   prevents any future `start_url` change from making Android treat the app as a different one).

2. **New `client/src/components/SharePage.jsx`** (~100 lines) — rendered from `App.jsx` via the same
   pattern as the import page (`isImportPage`): when `location.pathname === '/share'`, render only
   this page. It:
   - Runs its create exactly once (ref guard — protects against React double-effects and re-renders).
   - Normalizes the messy reality of Android shares (apps disagree about which field holds what;
     e.g. YouTube puts the URL in `text`): if `url` is empty, pull a URL out of `text`.
   - Composes the body: shared text first, then the URL **on its own line** — that's what triggers
     the server's link-preview card, so a shared video/article gets a rich preview for free.
   - Converts to editor HTML with the existing `formatPlainTextPasteToHtml`.
   - Creates via `notesApi.createNote`, then `navigate('/?note=<id>', { replace: true })` —
     `replace` so back/refresh can't create a duplicate.
   - Empty share → just go home. Failed create (server unreachable) → keep the shared text on
     screen with a Retry button, never silently drop it.

That's the whole phase. No service-worker change, no server change.

### Testing

- **Without a phone:** the landing page is just a URL — open
  `/share?title=Test&text=hello&url=https://example.com` in any browser and watch it create + open
  the note. Covers all composition/edge-case testing on localhost.
- **Manifest sanity:** Chrome DevTools → Application → Manifest (flags share_target errors).
- **The real thing:** deploy (try.itsnotes.app or notes.itsalex.me — share targets need HTTPS +
  installed PWA, so localhost phone testing isn't practical), install via Chrome's Add to Home
  Screen on Android, then share from Chrome, YouTube, and a plain-text source. Re-test: share while
  logged out → login → note still created.

## Phase 2 — share photos

Outline (details firmed up when we get here):

1. Manifest `share_target` switches to `method: "POST"`, `enctype: "multipart/form-data"`, adds a
   `files` entry accepting `image/*` (title/text/url params stay).
2. `sw.js` gets a fetch branch: `POST /share` → read the form data, stash the image files in
   IndexedDB, respond with a redirect to `/share?from=sw`. (File shares must be caught by the
   service worker; nginx never sees the POST.) Bump `SW_VERSION`.
3. `SharePage` sees `from=sw`, pulls the files, creates the note, converts each file to a data URL,
   and uploads through the existing `POST /api/notes/:id/images` — server-side WebP re-encoding and
   thumbnails come along for free.

Scope decision: images only at first (`image/*`). Arbitrary files could route to the attachments
endpoint later if anyone asks.

## Honest limits (worth telling the tester)

- **Android only.** iPhones don't support web share targets at all — Apple hasn't built the API.
  On Android this works in Chrome and Chromium-based browsers.
- **The app must be installed** (Add to Home Screen). A plain browser tab never appears in the share menu.
- **Existing installs pick the change up lazily** — Android re-reads the manifest on a later app
  launch. The tester may need to open the app once or twice, worst case reinstall, before itsnotes
  shows up in their share menu.
- Sharing while fully offline isn't covered in Phase 1 (the landing page needs the network to save anyway).

## Decision needed

**What happens on share — proposed: create the note immediately, then open it in the editor.**
Robust (content is saved even if the user backs out instantly) and matches Keep's feel. The
alternative — open a pre-filled composer *without* saving — avoids stray notes from accidental
shares but risks losing the share if the app is dismissed before saving, and needs more plumbing
through the composer. Recommendation: auto-create; an accidental share is one swipe to trash.

## Effort

- **Phase 1:** small — a few manifest lines + one small component + an `App.jsx` conditional.
  Everything it calls already exists.
- **Phase 2:** moderate — service-worker request interception, IndexedDB handoff, upload loop.
