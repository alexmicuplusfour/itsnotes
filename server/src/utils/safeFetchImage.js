const http = require('http');
const https = require('https');
const dns = require('dns').promises;
const net = require('net');
const { URL } = require('url');

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 10000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 0) return true;                            // "this network"
  if (a === 10) return true;                           // RFC1918
  if (a === 127) return true;                          // loopback
  if (a === 169 && b === 254) return true;             // link-local incl. cloud IMDS
  if (a === 172 && b >= 16 && b <= 31) return true;    // RFC1918
  if (a === 192 && b === 168) return true;             // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true;   // CGNAT (RFC6598)
  if (a >= 224) return true;                           // multicast + reserved
  return false;
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  if (/^f[cd]/.test(lower)) return true;     // ULA fc00::/7
  if (/^fe[89ab]/.test(lower)) return true;  // link-local fe80::/10
  if (/^ff/.test(lower)) return true;        // multicast ff00::/8
  return false;
}

function isPrivateAddress(ip) {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return true; // not an IP — fail closed
}

async function resolveAndValidate(hostname) {
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error(`Blocked private address: ${hostname}`);
    }
    return { address: hostname, family: net.isIP(hostname) };
  }
  const addrs = await dns.lookup(hostname, { all: true });
  if (!addrs || addrs.length === 0) {
    throw new Error(`DNS resolution failed for ${hostname}`);
  }
  for (const { address } of addrs) {
    if (isPrivateAddress(address)) {
      throw new Error(`Blocked private address ${address} for ${hostname}`);
    }
  }
  return addrs[0];
}

function fetchOnce(currentUrl, { maxBytes, timeoutMs, requireImageContentType }) {
  return (async () => {
    const parsed = new URL(currentUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Blocked URL scheme: ${parsed.protocol}`);
    }
    const hostname = parsed.hostname;
    const chosen = await resolveAndValidate(hostname);
    const isHttps = parsed.protocol === 'https:';
    const protocol = isHttps ? https : http;
    const port = parsed.port ? Number(parsed.port) : (isHttps ? 443 : 80);

    return await new Promise((resolve, reject) => {
      const req = protocol.get({
        host: hostname,
        port,
        path: `${parsed.pathname}${parsed.search}`,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'image/*',
        },
        timeout: timeoutMs,
        // Pin the connection to the address we already validated. This both
        // skips Node's internal DNS lookup and prevents DNS-rebinding (the
        // second lookup that would otherwise happen at connect time).
        lookup: (_h, _o, cb) => cb(null, chosen.address, chosen.family),
      }, (response) => {
        const status = response.statusCode || 0;

        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          const next = new URL(response.headers.location, currentUrl).href;
          return resolve({ redirectTo: next });
        }

        if (status !== 200) {
          response.resume();
          return reject(new Error(`HTTP ${status}: ${response.statusMessage || ''}`));
        }

        if (requireImageContentType) {
          const ct = (response.headers['content-type'] || '').toLowerCase();
          if (!ct.startsWith('image/')) {
            response.resume();
            return reject(new Error(`Unexpected content-type: ${ct || '(missing)'}`));
          }
        }

        const declared = Number(response.headers['content-length']);
        if (Number.isFinite(declared) && declared > maxBytes) {
          response.resume();
          return reject(new Error(`Response too large (declared ${declared} > ${maxBytes})`));
        }

        const chunks = [];
        let received = 0;
        response.on('data', (chunk) => {
          received += chunk.length;
          if (received > maxBytes) {
            req.destroy();
            return reject(new Error(`Response too large (> ${maxBytes})`));
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          resolve({
            buffer: Buffer.concat(chunks),
            contentType: response.headers['content-type'] || null,
          });
        });
        response.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  })();
}

async function safeFetchImage(urlString, opts = {}) {
  const {
    maxBytes = DEFAULT_MAX_BYTES,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    requireImageContentType = true,
  } = opts;
  let currentUrl = urlString;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const result = await fetchOnce(currentUrl, { maxBytes, timeoutMs, requireImageContentType });
    if (!result.redirectTo) return result;
    currentUrl = result.redirectTo;
  }
  throw new Error(`Too many redirects (> ${maxRedirects})`);
}

module.exports = { safeFetchImage };
