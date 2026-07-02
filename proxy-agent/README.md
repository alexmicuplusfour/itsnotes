# itsnotes proxy agent

A small Node.js service that runs on your home network and lets your
[itsnotes](../) server route fetches through a residential IP.

Many sites block or challenge requests from datacenter IPs (Cloudflare, Vercel
security checkpoints, paywalls). Because the proxy agent runs at home, it looks
like a normal browser to those sites — so link previews and article extraction
work on pages that would otherwise return a challenge page or a 403.

## How it works

The agent connects to your itsnotes server over a persistent socket. When the
server needs to fetch a URL (for a link preview or article clip), it sends the
request to the agent over the socket; the agent fetches it from the home network
and returns the response. The agent never exposes any port to the internet — all
traffic is outbound from the agent to the server.

## Run with Docker (recommended)

1. Copy `docker-compose.example.yml` to `docker-compose.yml`.
2. In the itsnotes app, go to **Settings → Integrations → Proxy Agent** and copy
   the token shown there.
3. Fill in `SERVER_URL` (your itsnotes address) and `PROXY_TOKEN` in
   `docker-compose.yml`.
4. `docker compose up -d`

## Run with Node

```
npm install
SERVER_URL=https://your-itsnotes-server.example.com \
PROXY_TOKEN=your-proxy-token-here \
node index.js
```

## Files

- `index.js` — the agent; connects via socket.io and handles `fetch:request` events.
- `Dockerfile` — Node 20 Alpine image.
- `docker-compose.example.yml` — template; copy and fill in your values.
