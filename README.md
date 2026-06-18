<p align="center"><img src="docs/logo-wordmark.png" width="275" alt="itsnotes" /></p>

# itsnotes

A self-hosted Google Keep alternative. It sticks to the familiar masonry layout but overhauls how you actually navigate and organize a large amount of notes.

Instead of an endless wall of text, the feed is broken down by month markers. There are quick-search panels for colors and tags, a basic folder implementation, and a proper list view. It also handles data import natively, so moving off Keep or importing text files is straightforward.

**[Try the demo →](https://try.itsnotes.app)**

**Features:**

- **Better navigation:** The timeline has month markers to break up the list. There are quick-access panels for colors, tags, saved searches, and a calendar.
- **More ways to organize:** Basic folders, internal note linking, and the ability to rename color labels to whatever makes sense to you.
- **View modes:** The standard masonry grid, a stacked view, and a proper dense list view.
- **Customization:** A heavy settings modal to tweak layouts, page backgrounds, and form behaviors.
- **Easy imports:** Drop in a Google Takeout `.zip` to import Keep data, or bulk upload `.txt` and `.md` files directly.
- **Quality of life:** Built-in note history for revisions, plus automatic metadata fetching for books and movies.
- **Optional AI stuff:** Hooks for auto-tagging and reminder parsing, plus a built-in MCP server so external AI clients can query your database.

Built with React, Node.js, PostgreSQL, and Socket.io.

![grid-dark](docs/screenshots/grid-dark.png)

<table>
  <tr>
    <td><img src="docs/screenshots/grid-light.png"/></td>
    <td><img src="docs/screenshots/list-view.png"/></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/search.png"/></td>
    <td><img src="docs/screenshots/settings.png"/></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/note-dark.png"/></td>
    <td><img src="docs/screenshots/note-fullscreen.png"/></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/tagging.png"/></td>
    <td></td>
  </tr>
</table>

## Setup

Requires Docker and Docker Compose.

```bash
git clone https://github.com/alexmicuplusfour/itsnotes
cd itsnotes
cp .env.example .env
cp docker-compose.example.yml docker-compose.yml
```

Edit `.env` to set your database credentials, then:

```bash
docker compose up -d
```

This pulls prebuilt `amd64`/`arm64` images from GHCR. The app will be available on port 80.

### With Caddy (HTTPS + domain)

To run with automatic HTTPS via Caddy:

```bash
cp docker-compose.caddy.example.yml docker-compose.yml
cp Caddyfile.example Caddyfile
```

Edit `Caddyfile` to set your domain, then `docker compose up -d --build`. Caddy handles SSL certificates automatically.

## Configuration

All configuration is via `.env`. See `.env.example` for available options.

Optional AI features (auto-tagging, OCR, summarization) require an OpenAI or Anthropic API key set as `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`.

## Chatting with your notes (MCP)

There's a built-in [MCP](https://modelcontextprotocol.io/) server that lets Claude (and other AI clients) search and read your notes. Turn it on under **Settings → AI → MCP Server** and generate a token. To connect, paste the URL into Claude's custom connector, or run the `claude mcp add` command it gives you for Claude Code.

It's off by default, read-only, and won't work without the token.

## Importing from Google Keep

If you're moving over from Google Keep, you can bring your notes with you:

1. Go to [Google Takeout](https://takeout.google.com/) and request an export of just **Keep**.
2. Download the resulting `.zip` when it's ready.
3. In itsnotes, open **Settings → Backup & Restore → Import from Google Keep → Import from Takeout** and select the `.zip`.

Notes, labels, colors, archive/trash/pin state, and original timestamps come across. Images and other attachments aren't imported yet — those will stay in your Takeout `.zip`.

---

This project is entirely 𝚟𝚒𝚋𝚎𝚌𝚘𝚍𝚎𝚍.
