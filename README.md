<p align="center"><img src="docs/logo-wordmark.png" width="275" alt="itsnotes" /></p>

# itsnotes

A self-hosted Google Keep replacement with rich text, tagging, image attachments, and real-time sync across clients. Built with React, Node.js, PostgreSQL, and Socket.io.

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
docker compose up -d --build
```

The app will be available on port 80.

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

## Importing from Google Keep

If you're moving over from Google Keep, you can bring your notes with you:

1. Go to [Google Takeout](https://takeout.google.com/) and request an export of just **Keep**.
2. Download the resulting `.zip` when it's ready.
3. In itsnotes, open **Settings → Backup & Restore → Import from Google Keep → Import from Takeout** and select the `.zip`.

Notes, labels, colors, archive/trash/pin state, and original timestamps come across. Images and other attachments aren't imported yet — those will stay in your Takeout `.zip`.

---

This project is entirely vibecoded.
