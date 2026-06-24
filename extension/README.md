# itsnotes clipper

A Chrome extension that clips the web article you're reading straight into a note
on your [itsnotes](../) server.

Because the page is captured from **your** browser session, it works even on
articles behind a login or paywall that you can already see. The captured HTML is
sent to the server, which runs it through the same Readability extraction the app
uses (falling back to its own fetch tiers if the capture is thin), then creates a
note with the article, an "Original URL" footer, and any tags you add.

## Install (unpacked)

1. Run `node make-icons.js` once if the `icons/` folder is missing.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select this `extension/` folder.

## Configure

1. In the itsnotes app, go to **Settings → Integrations → Browser Extension** and
   click **Generate token**. Copy the token and note the server address shown.
2. Click the extension's icon, open the **gear** (top-right of the popup), and
   paste the server address and token. Use **Test** to confirm, then **Save**.

## Use

Open any article, click the toolbar icon, tweak the title / add comma-separated
tags (autocompletes from your existing tags as you type), and hit **Save note**.
The note appears in itsnotes immediately. Images in the article are downloaded and
re-hosted on your server (so they survive even if the source goes away). Reopen
the gear any time to change the server or token.

## Files

- `manifest.json` — MV3 manifest.
- `popup.html` / `popup.js` — the clip dialog and the in-popup settings (gear);
  captures the page via `chrome.scripting` and POSTs to `/api/notes/clip`.
- `make-icons.js` — regenerates the PNG icons.
