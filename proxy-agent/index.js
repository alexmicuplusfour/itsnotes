const { io } = require('socket.io-client');

const SERVER_URL = process.env.SERVER_URL;
const PROXY_TOKEN = process.env.PROXY_TOKEN;

if (!SERVER_URL || !PROXY_TOKEN) {
  console.error('[proxy-agent] SERVER_URL and PROXY_TOKEN env vars are required');
  process.exit(1);
}

// Parse to split off a subpath (e.g. https://host/itsnotes) — Socket.IO needs
// the origin and the path passed separately.
let serverUrl;
try {
  serverUrl = new URL(SERVER_URL);
} catch {
  console.error(`[proxy-agent] SERVER_URL is not a valid URL (include the scheme, e.g. https://notes.example.com): ${SERVER_URL}`);
  process.exit(1);
}
const basePath = serverUrl.pathname.replace(/\/$/, '');
const socket = io(`${serverUrl.origin}/proxy`, {
  path: `${basePath}/socket.io`,
  auth: { token: PROXY_TOKEN },
  reconnection: true,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 15000,
  transports: ['websocket'],
});

socket.on('connect', () => console.log(`[proxy-agent] Connected to ${SERVER_URL}`));
socket.on('disconnect', (reason) => console.log(`[proxy-agent] Disconnected: ${reason}`));
socket.on('connect_error', (err) => console.error(`[proxy-agent] Connection error: ${err.message}`));

socket.on('fetch:request', async ({ id, url, method = 'GET', headers = {} }) => {
  console.log(`[proxy-agent] Fetching ${method} ${url}`);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const response = await fetch(url, { method, headers, signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);
    const bodyBuffer = Buffer.from(await response.arrayBuffer());
    const responseHeaders = {};
    response.headers.forEach((v, k) => { responseHeaders[k] = v; });
    socket.emit('fetch:response', {
      id,
      status: response.status,
      headers: responseHeaders,
      body: bodyBuffer.toString('base64'),
    });
  } catch (err) {
    console.error(`[proxy-agent] Fetch failed for ${url}: ${err.message}`);
    socket.emit('fetch:response', { id, error: err.message });
  }
});
