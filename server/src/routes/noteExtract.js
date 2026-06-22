const express = require('express');
const axios = require('axios');
const { chromium: rawChromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { marked } = require('marked');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const ogs = require('open-graph-scraper');
const UserObject = require('../models/UserObject');
const { extractExternalId } = require('../utils/extractExternalId');
const { extractImageUrls, processAndUploadImages } = require('../utils/imageProcessing');
require('dotenv').config();

// playwright-extra is patched with the puppeteer stealth plugin (it accepts both).
// Stealth masks navigator.webdriver, plugins, WebGL vendor, etc. — needed to clear
// Vercel/Cloudflare challenges, especially from datacenter IPs (e.g. DO droplets)
// where the network alone is enough to trigger a challenge.
const chromium = rawChromium;
chromium.use(StealthPlugin());

const router = express.Router();

// Markers that mean we got an anti-bot challenge page, not the real article.
const CHALLENGE_MARKERS = [
    'vercel security checkpoint',
    'just a moment',
    'attention required! | cloudflare',
    'checking your browser before accessing',
    'cloudflare ray id',
    'ddos protection by cloudflare',
    'enable javascript and cookies to continue',
    'please enable javascript to continue',
    'access denied | cloudflare',
    'one moment, please',
    'verify you are human',
    // Cloudflare's older "One more step" reCAPTCHA interstitial — the one
    // archive.today (archive.ph) throws at datacenter IPs. Distinct wording
    // from "Attention Required", so it needs its own markers.
    'please complete the security check to access',
    'why do i have to complete a captcha',
    'completing the captcha proves you are a human',
];

// Markers that suggest the page is gated behind a paywall or signup. False
// positives are a real risk (legit sites mention "subscribe" in newsletter
// modules), so a paywall hit only counts when the marker is in the title OR
// in the first 1500 chars of body AND the page is unusually short.
const PAYWALL_MARKERS = [
    'subscribe to continue reading',
    'subscribe to read',
    'subscribe to keep reading',
    'subscribe now to continue',
    'to continue reading, log in',
    'this article is for subscribers',
    'this content is for subscribers',
    'this story is for subscribers',
    'log in or subscribe',
    'sign in to continue reading',
    'create a free account to continue',
    'register to read this article',
    "you've reached your free article limit",
    "you've read your free articles",
    'free articles this month',
    'subscriber-only',
    'subscribers only',
    'become a member to read',
    'this is a paid article',
];

// A real desktop Chrome UA + headers. Sending these (instead of axios's default
// `axios/1.x` UA, which sites block or 429 on sight) lets the lightweight fetch
// tiers actually succeed on the many sites that only do shallow UA filtering.
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
};

// Run Readability over rendered HTML, falling back to the raw body when it
// can't isolate an article. Returns { content, title } with content never null.
function parseHtmlToArticle(html, url) {
    const doc = new JSDOM(html, { url });
    const reader = new Readability(doc.window.document.cloneNode(true));
    const article = reader.parse();
    if (article && article.content) {
        return { content: article.content, title: article.title || '' };
    }
    const bodyHtml = doc.window.document.body ? doc.window.document.body.innerHTML : '';
    return { content: bodyHtml || '', title: doc.window.document.title || '' };
}

// Returns null if the page looks usable, otherwise 'challenge' | 'paywall'.
// Both outcomes mean "discard and try the next tier" — archive.org in
// particular often has a pre-paywall snapshot.
function detectBlocker(title, content) {
    const t = String(title || '').toLowerCase();
    const cFull = String(content || '').toLowerCase();
    const cHead = cFull.slice(0, 2000);

    if (CHALLENGE_MARKERS.some(m => t.includes(m) || cHead.includes(m))) return 'challenge';

    const textOnly = String(content || '').replace(/<[^>]+>/g, '').trim();
    // Near-empty Readability output is almost always a challenge stub.
    if (textOnly.length > 0 && textOnly.length < 250) return 'challenge';

    // Paywall: marker in title is strong enough on its own. Marker in body
    // only counts when the article is short enough that the wall is the
    // dominant content (a real 5k-word essay mentioning "subscribe" in a
    // newsletter callout shouldn't trip this).
    const cPaywallHead = cFull.slice(0, 1500);
    if (PAYWALL_MARKERS.some(m => t.includes(m))) return 'paywall';
    if (textOnly.length < 1800 && PAYWALL_MARKERS.some(m => cPaywallHead.includes(m))) return 'paywall';

    return null;
}

// Tracking params that prevent archive.org from finding a snapshot. The
// Wayback availability API matches on the full URL string, so a path with
// ?utm_source=rss-feed appended will miss the canonical snapshot even when
// one exists. Strip these before querying, but leave any other query params
// alone (some article URLs use ?id=123 meaningfully).
const TRACKING_PARAMS = new Set([
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'utm_id', 'utm_brand', 'utm_social', 'utm_social-type',
    'fbclid', 'gclid', 'msclkid', 'dclid', 'yclid',
    'mc_cid', 'mc_eid',
    'ref', 'ref_src', 'ref_url', 'refsrc',
    '_ga', '_gl',
    'igshid', 'twclid', 'ttclid',
]);

function stripTrackingParams(url) {
    try {
        const u = new URL(url);
        const keep = new URLSearchParams();
        for (const [k, v] of u.searchParams) {
            if (!TRACKING_PARAMS.has(k.toLowerCase())) keep.set(k, v);
        }
        u.search = keep.toString();
        u.hash = '';
        return u.toString();
    } catch (_) {
        return url;
    }
}

// Two ways to ask Wayback "do you have this URL?":
//   1) Availability API — fast but misses a lot, even for URLs that ARE archived
//   2) CDX server — slower but authoritative
// We try (1) first and fall back to (2) before giving up.
async function findWaybackSnapshotUrl(cleanedUrl) {
    try {
        const avail = await axios.get('https://archive.org/wayback/available', {
            params: { url: cleanedUrl },
            timeout: 8000,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; itsnotes/1.0)' },
        });
        const snap = avail.data?.archived_snapshots?.closest;
        if (snap?.available && snap?.url) return snap.url;
    } catch (e) {
        console.warn(`[archive] availability API errored: ${e.message}`);
    }

    try {
        const cdx = await axios.get('https://web.archive.org/cdx/search/cdx', {
            params: {
                url: cleanedUrl,
                output: 'json',
                limit: '-1',                // most recent first
                filter: 'statuscode:200',   // only real 200s, no error captures
                fl: 'timestamp,original',
            },
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; itsnotes/1.0)' },
        });
        const rows = cdx.data;
        if (Array.isArray(rows) && rows.length > 1) {
            const [timestamp, original] = rows[1]; // row[0] is the header row
            return `https://web.archive.org/web/${timestamp}/${original}`;
        }
    } catch (e) {
        console.warn(`[archive] CDX API errored: ${e.message}`);
    }

    return null;
}

// Wayback Machine snapshot lookup. Cleans the URL first so utm_* etc. don't
// prevent matching. The `if_` flag on the snapshot URL strips the Wayback
// toolbar injection so Readability sees the original page markup.
async function extractViaArchive(url) {
    const cleaned = stripTrackingParams(url);
    const snapUrl = await findWaybackSnapshotUrl(cleaned);
    if (!snapUrl) throw new Error('No archive.org snapshot available.');

    const rawSnapUrl = snapUrl.replace(/\/web\/(\d+)\//, '/web/$1if_/');
    const response = await axios.get(rawSnapUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
        timeout: 30000,
        maxRedirects: 5,
    });
    const doc = new JSDOM(response.data, { url: cleaned });
    const reader = new Readability(doc.window.document.cloneNode(true));
    const article = reader.parse();
    if (article && article.content) {
        return { title: article.title || '', content: article.content };
    }
    throw new Error('Readability could not parse the archive snapshot.');
}

// Jina Reader proxies the URL through its own headless renderer and returns
// clean markdown + title in JSON. Keyless works but is rate-limited and uses
// shared infra Vercel sometimes flags; a JINA_API_KEY (set in env) unlocks
// the premium tier which is much more aggressive about clearing challenges.
async function extractViaJina(url) {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const headers = {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; itsnotes/1.0)',
        // Force the browser engine so JS challenges have a chance of clearing.
        'X-Engine': 'browser',
        // Skip Jina's response cache so we don't get a stale challenge page.
        'X-No-Cache': 'true',
    };
    if (process.env.JINA_API_KEY) {
        headers['Authorization'] = `Bearer ${process.env.JINA_API_KEY}`;
        // Route the fetch through Jina's residential proxy pool. This is the
        // piece that actually beats Vercel/Cloudflare walls: without it Jina
        // fetches from its own datacenter IPs and gets the same challenge we
        // do (verified: aeon returns an 80-char checkpoint without this header
        // and the full 28k-char article with it). Premium feature, so it's
        // gated on having a key.
        headers['X-Proxy'] = 'auto';
    }
    const response = await axios.get(jinaUrl, { headers, timeout: 45000 });
    const data = response.data?.data || response.data;
    const title = data?.title || '';
    const markdown = data?.content || '';
    if (!markdown) throw new Error('Jina Reader returned no content.');
    const html = marked.parse(markdown);
    return { title, content: html };
}

// archive.today (a.k.a. archive.ph / archive.is) is a *separate* archive from
// the Wayback Machine and often has captures — including pre-paywall ones —
// that archive.org doesn't. The catch: it sits behind its own Cloudflare wall
// that challenges datacenter IPs, so we render `/newest/<url>` through the
// stealth Playwright browser rather than plain axios (which just gets a
// challenge page). Reached only as the very last resort.
async function extractViaArchiveToday(url) {
    const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (!chromiumPath) throw new Error('PUPPETEER_EXECUTABLE_PATH not set; archive.today tier unavailable.');

    const cleaned = stripTrackingParams(url);
    // `/newest/` redirects straight to the most recent snapshot when one exists.
    const lookupUrl = `https://archive.ph/newest/${cleaned}`;

    let browser = null;
    try {
        browser = await chromium.launch({
            headless: true,
            executablePath: chromiumPath,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
        const page = await browser.newPage({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        });
        await page.goto(lookupUrl, { waitUntil: 'networkidle', timeout: 30000 });

        // A real capture redirects to a short snapshot id (e.g. archive.ph/AbCdE)
        // whose URL no longer contains the original address. If we're still
        // sitting on a URL that echoes the target back, there's no snapshot —
        // archive.today landed us on its empty search/listing page.
        const targetTail = cleaned.replace(/^https?:\/\//, '');
        if (page.url().includes(targetTail) || page.url().includes('/newest/')) {
            throw new Error('No archive.today snapshot available.');
        }

        const article = parseHtmlToArticle(await page.content(), cleaned);
        if (!article.content) throw new Error('Readability could not parse the archive.today snapshot.');
        return { title: article.title, content: article.content };
    } finally {
        if (browser) { try { await browser.close(); } catch (e) { /* ignore */ } }
    }
}

// Report the remaining token balance for the configured Jina key. Backs the
// "Refresh tokens" button in Settings → Integrations. Hits the same dashboard
// backend the Jina API Key & Billing page uses (undocumented but stable):
// a bad key returns 401, a good one returns the account's wallet.
// POST (not GET) so it doesn't collide with the GET /notes/:id route, which
// would otherwise treat "jina-balance" as a note id — same reason extract-url
// is a POST.
router.post('/jina-balance', async (req, res) => {
    const key = process.env.JINA_API_KEY;
    if (!key) return res.json({ configured: false });

    try {
        const resp = await axios.get('https://embeddings-dashboard-api.jina.ai/api/v1/api_key/user', {
            params: { api_key: key },
            timeout: 10000,
        });
        // Shape isn't formally documented, so unwrap defensively and log the
        // raw wallet once so the field names can be confirmed against a live key.
        const body = resp.data?.data || resp.data || {};
        const wallet = body.wallet || body;
        console.log('[jina-balance] wallet payload:', JSON.stringify(wallet));

        const num = (...cands) => cands.find(v => typeof v === 'number');
        const balance = num(wallet.total_balance, wallet.regular_balance, wallet.balance, body.total_balance);

        return res.json({
            configured: true,
            valid: true,
            balance: balance ?? null,
        });
    } catch (e) {
        if (e.response?.status === 401 || e.response?.status === 403) {
            return res.json({ configured: true, valid: false, error: 'Invalid API key' });
        }
        console.error('[jina-balance] lookup failed:', e.message);
        return res.json({ configured: true, valid: true, balance: null, error: 'Could not fetch balance' });
    }
});

// Extract content from URL - Puppeteer first, Axios fallback
router.post('/extract-url', async (req, res) => {
    const { url, noteId, includeImages = false } = req.body;

    // --- Input validation ---
    if (!url) { return res.status(400).json({ message: 'URL is required' }); }
    try { new URL(url); } catch (_) { return res.status(400).json({ message: 'Invalid URL format provided.' }); }

    // If includeImages is true, noteId is required
    if (includeImages && !noteId) {
        return res.status(400).json({ message: 'Note ID is required when includeImages is true' });
    }
    // --- End Input Validation ---

    // --- Check if this is a Goodreads URL and book already exists ---
    if (url.includes('goodreads.com/book/show/')) {
        const userId = req.user?.id || 1;
        const externalId = extractExternalId(url);

        if (externalId) {
            const existingBook = await UserObject.findByExternalId(userId, externalId);
            if (existingBook) {
                console.log(`[extract-url] Book already exists (external_id: ${externalId}), skipping full extraction`);
                return res.json({
                    message: 'Book already exists',
                    exists: true,
                    book: existingBook,
                    title: existingBook.title,
                    content: '' // Don't extract content for existing books
                });
            }
        }
    }
    // --- End Goodreads check ---

    let extractedContent = null;
    let extractedTitle = null;
    let browser = null; // Playwright browser instance
    let finalError = null;

    // --- Get executable path from environment variable ---
    const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH; // Using same env var name

    // --- Attempt 1: Playwright Method (only if path is configured) ---
    if (chromiumPath) {
        console.log(`Using Chromium path for Playwright: ${chromiumPath}`);
        try {
            console.log(`Attempting extraction via Playwright for ${url}...`);
            browser = await chromium.launch({
                headless: true,
                executablePath: chromiumPath,
                args: [ '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage' ]
            });

            // *** FIX IS HERE: Set userAgent during page creation ***
            const page = await browser.newPage({
                 userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36' // Your UA String
            });
            // *******************************************************

            console.log(`Navigating (Playwright) to ${url}...`);
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            console.log(`Getting rendered content (Playwright) for ${url}...`);
            let article = parseHtmlToArticle(await page.content(), url);

            // Vercel/Cloudflare JS checkpoints often clear themselves a few
            // seconds after the initial load (the page runs a proof-of-work
            // then swaps in the real content). If the first grab looks like a
            // challenge, wait and re-read once before giving up on this tier.
            if (detectBlocker(article.title, article.content) === 'challenge') {
                console.warn(`Playwright got a challenge for ${url}; waiting for it to clear...`);
                try {
                    await page.waitForTimeout(6000);
                    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
                    article = parseHtmlToArticle(await page.content(), url);
                } catch (retryErr) {
                    console.warn(`Playwright challenge re-read failed for ${url}: ${retryErr.message}`);
                }
            }

            await page.close();
            console.log(`Page closed for ${url}.`);

            extractedContent = article.content;
            extractedTitle = article.title;

            // Reject anti-bot interstitials and paywalls so we proceed to the
            // next tier instead of writing junk into the note.
            const blockerPw = detectBlocker(extractedTitle, extractedContent);
            if (blockerPw) {
                console.warn(`Playwright result for ${url} looks like a ${blockerPw} — discarding and falling through.`);
                extractedContent = null;
                extractedTitle = null;
                finalError = new Error(`${blockerPw} detected (Playwright tier).`);
            } else {
                console.log(`Extraction successful via Playwright for ${url}.`);
            }
            // --- End JSDOM part ---

        } catch (playwrightError) {
            console.error(`Playwright extraction failed for ${url} (even with path set):`, playwrightError.message);
            finalError = playwrightError;
            if (browser) { try { await browser.close(); browser = null; } catch (e) { console.error("Error closing browser post-Playwright error:", e); } }
        } finally {
            if (browser) {
                try {
                    console.log(`Closing Playwright browser instance for ${url}...`);
                    await browser.close();
                    browser = null;
                    console.log(`Playwright browser closed for ${url}.`);
                } catch (e) { console.error("Error closing Playwright browser in finally:", e); }
            }
        }
    } else {
        console.warn("PUPPETEER_EXECUTABLE_PATH not set. Skipping Playwright attempt...");
    }

    // --- Attempt 2: Axios Fallback Method (remains the same) ---
    if (extractedContent === null) {
        console.log(`Attempting Axios fallback extraction for ${url}...`);
        try {
            const response = await axios.get(url, {
                headers: BROWSER_HEADERS,
                timeout: 15000,
                maxRedirects: 5,
            });
            const article = parseHtmlToArticle(response.data, url);
            extractedContent = article.content;
            extractedTitle = article.title;
            finalError = null;
            console.log(`Extraction successful via Axios fallback for ${url}.`);

            const blockerAx = detectBlocker(extractedTitle, extractedContent);
            if (blockerAx) {
                console.warn(`Axios result for ${url} looks like a ${blockerAx} — discarding and falling through.`);
                extractedContent = null;
                extractedTitle = null;
                finalError = new Error(`${blockerAx} detected (Axios tier).`);
            }
        } catch (axiosError) {
            console.error(`Axios fallback extraction also failed for ${url}:`, axiosError.message);
            if (!finalError) finalError = axiosError;
        }
    }

    // --- Attempt 3: Wayback Machine snapshot ---
    // Cheaper than Jina and often works for popular sites. Tracking params
    // are stripped before lookup since the availability API matches the
    // full URL string.
    if (extractedContent === null) {
        console.log(`Attempting archive.org fallback for ${url}...`);
        try {
            const arch = await extractViaArchive(url);
            const blockerArch = detectBlocker(arch.title, arch.content);
            if (blockerArch) {
                throw new Error(`archive.org snapshot looks like a ${blockerArch}.`);
            }
            extractedContent = arch.content;
            extractedTitle = arch.title;
            finalError = null;
            console.log(`Extraction successful via archive.org for ${url}.`);
        } catch (archiveError) {
            console.error(`archive.org fallback failed for ${url}:`, archiveError.message);
            if (!finalError) finalError = archiveError;
        }
    }

    // --- Attempt 4: Jina Reader (server-side renderer) ---
    // Reaches here only if every earlier tier failed. Jina renders the page
    // from its own infra, so challenges aimed at our droplet's IP don't apply.
    if (extractedContent === null) {
        console.log(`Attempting Jina Reader fallback for ${url}...`);
        try {
            const jina = await extractViaJina(url);
            const blockerJina = detectBlocker(jina.title, jina.content);
            if (blockerJina) {
                const textLen = String(jina.content || '').replace(/<[^>]+>/g, '').trim().length;
                console.warn(`[Jina blocker] kind=${blockerJina} title="${jina.title}" textLen=${textLen} preview="${String(jina.content || '').replace(/<[^>]+>/g, '').trim().slice(0, 300)}"`);
                throw new Error(`Jina Reader also returned a ${blockerJina} page.`);
            }
            extractedContent = jina.content;
            extractedTitle = jina.title;
            finalError = null;
            console.log(`Extraction successful via Jina Reader for ${url}.`);
        } catch (jinaError) {
            console.error(`Jina Reader fallback failed for ${url}:`, jinaError.message);
            if (!finalError) finalError = jinaError;
        }
    }

    // --- Attempt 5: archive.today snapshot (last resort) ---
    // A different archive from the Wayback Machine, with different (and often
    // pre-paywall) captures. Rendered through Playwright to clear its own
    // Cloudflare wall, so it only runs when chromium is configured.
    if (extractedContent === null) {
        console.log(`Attempting archive.today fallback for ${url}...`);
        try {
            const at = await extractViaArchiveToday(url);
            const blockerAt = detectBlocker(at.title, at.content);
            if (blockerAt) {
                throw new Error(`archive.today snapshot looks like a ${blockerAt}.`);
            }
            extractedContent = at.content;
            extractedTitle = at.title;
            finalError = null;
            console.log(`Extraction successful via archive.today for ${url}.`);
        } catch (archiveTodayError) {
            console.error(`archive.today fallback failed for ${url}:`, archiveTodayError.message);
            if (!finalError) finalError = archiveTodayError;
        }
    }

    // --- Final Response with Image Processing ---
    if (extractedContent !== null) {
        let uploadedImages = [];

        // Process images if requested and noteId is provided
        if (includeImages && noteId) {
            try {
                console.log(`Extracting images from ${url} for note ${noteId}`);

                // Extract image URLs from the content
                const imageUrls = extractImageUrls(extractedContent, url);
                console.log(`Found ${imageUrls.length} images in content`);

                if (imageUrls.length > 0) {
                    // Process and upload images
                    uploadedImages = await processAndUploadImages(imageUrls, noteId);
                    console.log(`Successfully uploaded ${uploadedImages.length} images`);
                }
            } catch (imageError) {
                console.error(`Failed to process images for ${url}:`, imageError.message);
                // Don't fail the entire request if image processing fails
            }
        }

        res.json({
            title: (extractedTitle || '').trim(),
            content: extractedContent.trim(),
            images: uploadedImages
        });
    } else {
        console.error(`All extraction methods failed for ${url}. Reporting last error.`);
        const detailedErrorMsg = finalError ? finalError.message : 'Unknown extraction failure.';
        const paywallHit = /paywall/i.test(detailedErrorMsg);
        const challengeHit = !paywallHit && /challenge/i.test(detailedErrorMsg);
        let errorMessage;
        if (paywallHit) {
            errorMessage = "This article appears to be behind a paywall — no free version found.";
        } else if (challengeHit) {
            errorMessage = "Couldn't read this page — the site is blocked behind an anti-bot wall.";
        } else {
            errorMessage = "Couldn't extract content from this URL.";
        }
        res.status((paywallHit || challengeHit) ? 502 : 500).json({ message: errorMessage, error: detailedErrorMsg });
    }
});

// Helper to decode HTML entities
const decodeHtml = (text) => {
    if (!text) return text;
    try {
        const dom = new JSDOM(text);
        return dom.window.document.body.textContent;
    } catch (e) {
        return text;
    }
};

// Pull the numeric Goodreads id and (optional) title slug out of a book URL.
// Examples: /book/show/376434.Diary_Of_A_Baby -> { id: '376434', slug: 'Diary_Of_A_Baby' }
//           /book/show/12345                  -> { id: '12345',  slug: null }
function parseGoodreadsUrl(url) {
    const m = url.match(/\/book\/show\/(\d+)(?:[._-]([^/?#]+))?/);
    return m ? { id: m[1], slug: m[2] || null } : null;
}

// Primary metadata source: Open Library. Keyless, generous rate limits, returns
// title/author/year/pages/cover/ISBN. Does NOT return ratings — those are dropped
// when this path wins; the OGS/Playwright fallbacks below still attempt them for
// books Open Library doesn't have.
async function fetchOpenLibraryBook(titleQuery) {
    if (!titleQuery) return null;

    const searchUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(titleQuery)}&limit=3`;
    const searchResp = await axios.get(searchUrl, { timeout: 8000 });
    const doc = searchResp.data?.docs?.[0];
    if (!doc?.title) return null;

    const data = {
        title: doc.title,
        author: Array.isArray(doc.author_name) ? doc.author_name.join(', ') : doc.author_name,
    };
    if (doc.first_publish_year) {
        data.publishedYear = String(doc.first_publish_year);
        data.publishedDate = data.publishedYear;
    }
    if (doc.number_of_pages_median) {
        data.total_pages = doc.number_of_pages_median;
        data.pages = `${doc.number_of_pages_median} pages`;
    }
    if (doc.cover_i) {
        data.cover = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
    }

    // Description lives on the work record, not the search result.
    if (doc.key && doc.key.startsWith('/works/')) {
        try {
            const workResp = await axios.get(`https://openlibrary.org${doc.key}.json`, { timeout: 5000 });
            const desc = workResp.data?.description;
            if (desc) {
                data.description = typeof desc === 'string' ? desc : desc.value;
            }
        } catch (e) {
            // Missing description is fine; downstream may fill it from OGS.
        }
    }

    return data;
}

// --- Goodreads Extraction Endpoint ---
router.post('/extract-goodreads', async (req, res) => {
    const { url } = req.body;

    if (!url) { return res.status(400).json({ message: 'URL is required' }); }
    try { new URL(url); } catch (_) { return res.status(400).json({ message: 'Invalid URL format provided.' }); }

    try {
        // Check if book already exists
        const userId = req.user?.id || 1;
        console.log('[extract-goodreads] extractExternalId type:', typeof extractExternalId);
        const externalId = extractExternalId(url);

        if (externalId) {
            const existingBook = await UserObject.findByExternalId(userId, externalId);
            if (existingBook) {
                console.log(`Book already exists (external_id: ${externalId}), skipping extraction`);
                // Return data in the same format as a new extraction
                const source = existingBook.metadata?.source || {};
                return res.json({
                    title: existingBook.title,
                    author: source.author,
                    cover: existingBook.thumbnail_url || source.cover_url,
                    url: existingBook.source_url,
                    rating: source.rating,
                    publishedYear: source.year,
                    total_pages: source.page_count,
                    description: source.description,
                    exists: true // Flag to indicate this was from cache
                });
            }
        }

        console.log(`Attempting Goodreads extraction (OGS) for ${url}...`);

        const { result } = await ogs({ url });

        if (!result.success) {
            throw new Error('Open Graph Scraper failed to fetch data.');
        }

        const data = {
            title: decodeHtml(result.ogTitle),
            description: decodeHtml(result.ogDescription),
            cover: result.ogImage?.[0]?.url,
            url: result.ogUrl || url
        };

        // Extract specifics from JSON-LD
        if (result.jsonLD) {
            // Goodreads sometimes returns an array of JSON-LD objects
            const ld = Array.isArray(result.jsonLD) ? result.jsonLD.find(item => item['@type'] === 'Book') || result.jsonLD[0] : result.jsonLD;

            if (ld) {
                // Prefer JSON-LD data if available
                if (ld.name) data.title = decodeHtml(ld.name);
                if (ld.image) data.cover = ld.image;

                if (ld.author) {
                    const authors = Array.isArray(ld.author) ? ld.author : [ld.author];
                    data.author = decodeHtml(authors.map(a => a.name).join(', '));
                }

                if (ld.aggregateRating) {
                    data.rating = ld.aggregateRating.ratingValue;
                }

                if (ld.numberOfPages) {
                    data.pages = `${ld.numberOfPages} pages`;
                    data.total_pages = parseInt(ld.numberOfPages, 10);
                }

                if (ld.datePublished) {
                    data.publishedDate = ld.datePublished;
                    const match = ld.datePublished.match(/\d{4}/);
                    if (match) {
                        data.publishedYear = match[0];
                    }
                }
            }
        }

        // --- Enhancement: Try to fetch full description and details if OGS result is truncated ---
        try {
            // Only attempt if we have a URL and (description is short OR we are missing published year)
            if (url && ((!data.description || data.description.endsWith('…') || data.description.endsWith('...')) || !data.publishedYear)) {
                console.log('Attempting to fetch full details via Axios...');
                const response = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5'
                    },
                    timeout: 5000 // Short timeout to not delay response too much
                });

                const dom = new JSDOM(response.data);
                const doc = dom.window.document;

                // Goodreads selectors for description
                // 1. New design: div[data-testid="description"]
                // 2. Old design: #description
                const descContainer = doc.querySelector('div[data-testid="description"]') || doc.querySelector('#description');

                if (descContainer) {
                    // Check for hidden span (common in older Goodreads layout for "Show more")
                    const hiddenSpan = descContainer.querySelector('span[style*="display:none"]');
                    if (hiddenSpan) {
                        data.description = decodeHtml(hiddenSpan.textContent.trim());
                    } else {
                        // Newer layout or no hidden span
                        data.description = decodeHtml(descContainer.textContent.trim());
                    }
                    console.log('Successfully extracted full description via Axios/JSDOM');
                }

                // Try to extract published year if missing
                if (!data.publishedYear) {
                    // New design: p[data-testid="publicationInfo"]
                    const pubInfo = doc.querySelector('p[data-testid="publicationInfo"]');
                    if (pubInfo) {
                        const match = pubInfo.textContent.match(/\d{4}/);
                        if (match) data.publishedYear = match[0];
                    } else {
                        // Old design: look for "First published" or "Published" in details
                        // Often in #details .row or similar
                        const details = doc.body.textContent; // Fallback to searching body text if specific selector fails
                        const pubMatch = details.match(/(?:First published|Published)\s+(?:in\s+)?([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+)?(\d{4})/i);
                        if (pubMatch) {
                             // The year is usually the last capturing group or the one that looks like a year
                             // Group 2 is likely the year in the regex above
                             data.publishedYear = pubMatch[2];
                        }
                    }
                }
            }
        } catch (enhancementError) {
            // Silently fail enhancement and stick with OGS data
            console.warn('Full description extraction failed (using OGS fallback):', enhancementError.message);
        }
        // --- End Enhancement ---

        // --- Playwright Fallback: OGS often returns empty when Goodreads/Cloudflare blocks the bot UA.
        //     If we still don't have a title, render the page in chromium and parse JSON-LD + DOM. ---
        if (!data.title) {
            const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH;
            if (chromiumPath) {
                let browser = null;
                try {
                    console.log(`[extract-goodreads] No title from OGS, attempting Playwright fallback for ${url}...`);
                    browser = await chromium.launch({
                        headless: true,
                        executablePath: chromiumPath,
                        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
                    });
                    const page = await browser.newPage({
                        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
                    });
                    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
                    const html = await page.content();
                    await page.close();

                    const dom = new JSDOM(html);
                    const doc = dom.window.document;

                    // Walk all JSON-LD script blocks and pick out Book metadata
                    const ldScripts = doc.querySelectorAll('script[type="application/ld+json"]');
                    for (const script of ldScripts) {
                        try {
                            const parsed = JSON.parse(script.textContent);
                            const ld = Array.isArray(parsed)
                                ? parsed.find(item => item && item['@type'] === 'Book') || parsed[0]
                                : (parsed && (parsed['@type'] === 'Book' ? parsed : parsed));
                            if (!ld) continue;

                            if (ld.name && !data.title) data.title = decodeHtml(ld.name);
                            if (ld.image && !data.cover) data.cover = Array.isArray(ld.image) ? ld.image[0] : ld.image;
                            if (ld.author && !data.author) {
                                const authors = Array.isArray(ld.author) ? ld.author : [ld.author];
                                data.author = decodeHtml(authors.map(a => typeof a === 'string' ? a : a.name).filter(Boolean).join(', '));
                            }
                            if (ld.aggregateRating && !data.rating) {
                                data.rating = ld.aggregateRating.ratingValue;
                            }
                            if (ld.numberOfPages && !data.total_pages) {
                                data.pages = `${ld.numberOfPages} pages`;
                                data.total_pages = parseInt(ld.numberOfPages, 10);
                            }
                            if (ld.datePublished && !data.publishedYear) {
                                data.publishedDate = ld.datePublished;
                                const match = String(ld.datePublished).match(/\d{4}/);
                                if (match) data.publishedYear = match[0];
                            }
                            if (ld.description && !data.description) {
                                data.description = decodeHtml(ld.description);
                            }
                        } catch (parseErr) {
                            // Skip malformed JSON-LD blocks
                        }
                    }

                    // OG meta tags as a second source
                    if (!data.title) {
                        const ogTitle = doc.querySelector('meta[property="og:title"]');
                        if (ogTitle) data.title = decodeHtml(ogTitle.getAttribute('content') || '');
                    }
                    if (!data.cover) {
                        const ogImage = doc.querySelector('meta[property="og:image"]');
                        if (ogImage) data.cover = ogImage.getAttribute('content');
                    }
                    if (!data.description) {
                        const ogDesc = doc.querySelector('meta[property="og:description"]');
                        if (ogDesc) data.description = decodeHtml(ogDesc.getAttribute('content') || '');
                    }

                    // DOM selectors for the modern (React) Goodreads layout
                    if (!data.title) {
                        const titleEl = doc.querySelector('h1[data-testid="bookTitle"]')
                            || doc.querySelector('h1.Text__title1')
                            || doc.querySelector('#bookTitle');
                        if (titleEl) data.title = decodeHtml(titleEl.textContent.trim());
                    }
                    if (!data.author) {
                        const authorEl = doc.querySelector('span[data-testid="name"]')
                            || doc.querySelector('a.ContributorLink')
                            || doc.querySelector('a.authorName span');
                        if (authorEl) data.author = decodeHtml(authorEl.textContent.trim());
                    }
                    if (!data.description) {
                        const descContainer = doc.querySelector('div[data-testid="description"]') || doc.querySelector('#description');
                        if (descContainer) {
                            const hiddenSpan = descContainer.querySelector('span[style*="display:none"]');
                            data.description = decodeHtml((hiddenSpan || descContainer).textContent.trim());
                        }
                    }
                    if (!data.publishedYear) {
                        const pubInfo = doc.querySelector('p[data-testid="publicationInfo"]');
                        if (pubInfo) {
                            const match = pubInfo.textContent.match(/\d{4}/);
                            if (match) data.publishedYear = match[0];
                        }
                    }
                    if (!data.cover) {
                        const coverImg = doc.querySelector('img.ResponsiveImage')
                            || doc.querySelector('div.BookCover img')
                            || doc.querySelector('img#coverImage');
                        if (coverImg) data.cover = coverImg.getAttribute('src');
                    }
                    if (!data.total_pages) {
                        const pagesEl = doc.querySelector('p[data-testid="pagesFormat"]');
                        if (pagesEl) {
                            const match = pagesEl.textContent.match(/(\d+)\s*pages/i);
                            if (match) {
                                data.total_pages = parseInt(match[1], 10);
                                data.pages = `${match[1]} pages`;
                            }
                        }
                    }

                    console.log(`[extract-goodreads] Playwright fallback result: title="${data.title}", author="${data.author}", year=${data.publishedYear}`);
                } catch (playwrightError) {
                    console.error(`[extract-goodreads] Playwright fallback failed for ${url}:`, playwrightError.message);
                } finally {
                    if (browser) {
                        try { await browser.close(); } catch (e) { /* ignore */ }
                    }
                }
            } else {
                console.warn('[extract-goodreads] PUPPETEER_EXECUTABLE_PATH not set, skipping Playwright fallback.');
            }
        }
        // --- End Playwright Fallback ---

        // --- Final Fallback: Open Library (keyless metadata API) ---
        // Reached only if OGS + Axios + Playwright all failed to recover a title.
        // Returns no rating, but preserves a usable book card for sites we can't scrape.
        if (!data.title) {
            const parsed = parseGoodreadsUrl(url);
            if (parsed?.slug) {
                try {
                    const query = parsed.slug.replace(/[_-]+/g, ' ').trim();
                    console.log(`[extract-goodreads] Querying Open Library for: "${query}"`);
                    const olData = await fetchOpenLibraryBook(query);
                    if (olData) {
                        // Don't overwrite anything earlier sources managed to grab
                        for (const key of Object.keys(olData)) {
                            if (data[key] === undefined || data[key] === null || data[key] === '') {
                                data[key] = olData[key];
                            }
                        }
                        console.log(`[extract-goodreads] Open Library hit: "${olData.title}" by ${olData.author}`);
                    } else {
                        console.log('[extract-goodreads] Open Library returned no match.');
                    }
                } catch (olError) {
                    console.warn(`[extract-goodreads] Open Library lookup failed: ${olError.message}`);
                }
            }
        }
        // --- End Open Library Fallback ---

        // Truncate description to 300 characters
        if (data.description && data.description.length > 300) {
            data.description = data.description.substring(0, 300) + '...';
        }

        console.log('Goodreads extraction result:', data);

        if (!data.title) {
            throw new Error('Could not extract book title.');
        }

        res.json(data);

    } catch (error) {
        console.error(`Goodreads extraction failed for ${url}:`, error.message);
        res.status(500).json({ message: 'Goodreads extraction failed', error: error.message });
    }
});

// --- TMDB URL Extraction Endpoint (Movies & TV Shows) ---
router.post('/extract-tmdb', async (req, res) => {
    const { url } = req.body;

    if (!url) { return res.status(400).json({ message: 'URL is required' }); }
    try { new URL(url); } catch (_) { return res.status(400).json({ message: 'Invalid URL format provided.' }); }

    try {
        console.log(`[extract-tmdb] Attempting TMDB extraction for ${url}...`);

        const tmdbMatch = url.match(/\/(movie|tv)\/(\d+)/);
        if (!tmdbMatch) {
            throw new Error('Could not extract TMDB ID from URL. Please provide a valid TMDB movie or TV URL.');
        }
        const [, mediaType, tmdbId] = tmdbMatch;
        console.log(`[extract-tmdb] Extracted type: ${mediaType}, ID: ${tmdbId}`);

        const TMDB_API_KEY = process.env.TMDB_API_KEY;

        if (mediaType === 'movie') {
            const detailsResponse = await axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}`, {
                params: { api_key: TMDB_API_KEY, append_to_response: 'credits' }
            });

            const movie = detailsResponse.data;
            console.log(`[extract-tmdb] Got movie details:`, movie.title);

            let director = null;
            if (movie.credits && movie.credits.crew) {
                const directors = movie.credits.crew.filter(member => member.job === 'Director');
                if (directors.length > 0) {
                    director = directors.map(d => d.name).join(', ');
                }
            }

            const data = {
                type: 'movie',
                title: movie.title,
                poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
                url: url,
                year: movie.release_date ? movie.release_date.substring(0, 4) : null,
                rating: movie.vote_average || null,
                director: director
            };

            console.log('[extract-tmdb] Movie extraction result:', data);

            if (!data.title) { throw new Error('Could not extract movie title.'); }
            return res.json(data);

        } else {
            const detailsResponse = await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}`, {
                params: { api_key: TMDB_API_KEY }
            });

            const show = detailsResponse.data;
            console.log(`[extract-tmdb] Got show details:`, show.name);

            const data = {
                type: 'show',
                title: show.name,
                poster: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : null,
                url: url,
                startYear: show.first_air_date ? show.first_air_date.substring(0, 4) : null,
                endYear: show.status === 'Ended' && show.last_air_date ? show.last_air_date.substring(0, 4) : null,
                rating: show.vote_average || null,
                seasons: show.number_of_seasons || null,
                episodes: show.number_of_episodes || null,
                creator: show.created_by && show.created_by.length > 0
                    ? show.created_by.map(c => c.name).join(', ')
                    : null
            };

            console.log('[extract-tmdb] TV show extraction result:', data);

            if (!data.title) { throw new Error('Could not extract TV show title.'); }
            return res.json(data);
        }

    } catch (error) {
        console.error(`[extract-tmdb] TMDB extraction failed for ${url}:`, error);
        res.status(500).json({
            message: 'TMDB extraction failed',
            error: error?.message || error?.toString() || 'Unknown error'
        });
    }
});

// Playwright fallback for IMDb: render the page and parse its JSON-LD.
// Used when the TMDB API path fails (e.g. invalid/rate-limited key).
async function extractImdbViaPlaywright(url) {
    const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (!chromiumPath) {
        throw new Error('PUPPETEER_EXECUTABLE_PATH not set; Playwright fallback unavailable.');
    }
    let browser = null;
    try {
        browser = await chromium.launch({
            headless: true,
            executablePath: chromiumPath,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        const page = await browser.newPage({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
        });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        const html = await page.content();
        await page.close();

        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const data = { url };

        // IMDb embeds rich Movie/TVSeries schema in <script type="application/ld+json">.
        const ldScripts = doc.querySelectorAll('script[type="application/ld+json"]');
        for (const script of ldScripts) {
            try {
                const parsed = JSON.parse(script.textContent);
                const items = Array.isArray(parsed) ? parsed : [parsed];
                const ld = items.find(item => item && (item['@type'] === 'Movie' || item['@type'] === 'TVSeries'));
                if (!ld) continue;

                data.type = ld['@type'] === 'Movie' ? 'movie' : 'show';
                if (ld.name) data.title = decodeHtml(ld.name);
                if (ld.image) data.poster = Array.isArray(ld.image) ? ld.image[0] : ld.image;
                if (ld.aggregateRating && ld.aggregateRating.ratingValue !== undefined) {
                    const r = Number(ld.aggregateRating.ratingValue);
                    if (!Number.isNaN(r)) data.rating = r;
                }
                if (ld.datePublished) {
                    const yearMatch = String(ld.datePublished).match(/\d{4}/);
                    if (yearMatch) {
                        if (data.type === 'movie') data.year = yearMatch[0];
                        else data.startYear = yearMatch[0];
                    }
                }
                if (data.type === 'movie' && ld.director) {
                    const directors = Array.isArray(ld.director) ? ld.director : [ld.director];
                    data.director = directors
                        .map(d => typeof d === 'string' ? d : d?.name)
                        .filter(Boolean)
                        .join(', ');
                }
                if (data.type === 'show' && ld.creator) {
                    const creators = Array.isArray(ld.creator) ? ld.creator : [ld.creator];
                    data.creator = creators
                        .map(c => typeof c === 'string' ? c : c?.name)
                        .filter(Boolean)
                        .join(', ');
                }
                break;
            } catch (parseErr) {
                // Skip malformed JSON-LD block
            }
        }

        // OG meta tags fill anything JSON-LD didn't cover.
        if (!data.title) {
            const ogTitle = doc.querySelector('meta[property="og:title"]');
            if (ogTitle) data.title = decodeHtml(ogTitle.getAttribute('content') || '');
        }
        if (!data.poster) {
            const ogImage = doc.querySelector('meta[property="og:image"]');
            if (ogImage) data.poster = ogImage.getAttribute('content');
        }

        // Last-resort DOM selectors for IMDb's modern (React) layout.
        if (!data.title) {
            const titleEl = doc.querySelector('h1[data-testid="hero__pageTitle"] span')
                || doc.querySelector('h1[data-testid="hero-title-block__title"]')
                || doc.querySelector('h1.hero__primary-text');
            if (titleEl) data.title = decodeHtml(titleEl.textContent.trim());
        }

        if (!data.type) {
            const ogType = doc.querySelector('meta[property="og:type"]');
            const t = ogType?.getAttribute('content');
            data.type = (t === 'video.tv_show' || t === 'video.episode') ? 'show' : 'movie';
        }

        if (!data.title) {
            throw new Error('Could not extract title from IMDb page.');
        }
        return data;
    } finally {
        if (browser) {
            try { await browser.close(); } catch (e) { /* ignore */ }
        }
    }
}

// --- Unified IMDb Extraction Endpoint (Movies & TV Shows) ---
router.post('/extract-imdb', async (req, res) => {
    const { url } = req.body;

    if (!url) { return res.status(400).json({ message: 'URL is required' }); }
    try { new URL(url); } catch (_) { return res.status(400).json({ message: 'Invalid URL format provided.' }); }

    console.log(`[extract-imdb] Attempting IMDb extraction for ${url}...`);

    // Extract IMDb ID from URL
    const imdbIdMatch = url.match(/title\/(tt\d+)/);
    if (!imdbIdMatch) {
        return res.status(400).json({ message: 'Could not extract IMDb ID from URL. Please provide a valid IMDb title URL.' });
    }
    const imdbId = imdbIdMatch[1];
    console.log(`[extract-imdb] Extracted IMDb ID: ${imdbId}`);

    // --- Attempt 1: TMDB API (fast, structured) ---
    let tmdbError = null;
    try {
        const TMDB_API_KEY = process.env.TMDB_API_KEY;

        const findResponse = await axios.get(`https://api.themoviedb.org/3/find/${imdbId}`, {
            params: {
                api_key: TMDB_API_KEY,
                external_source: 'imdb_id'
            }
        });

        const movieResults = findResponse.data.movie_results || [];
        const tvResults = findResponse.data.tv_results || [];

        if (movieResults.length > 0) {
            const tmdbId = movieResults[0].id;
            console.log(`[extract-imdb] Found movie with TMDB ID: ${tmdbId}`);

            const detailsResponse = await axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}`, {
                params: { api_key: TMDB_API_KEY, append_to_response: 'credits' }
            });
            const movie = detailsResponse.data;

            let director = null;
            if (movie.credits && movie.credits.crew) {
                const directors = movie.credits.crew.filter(member => member.job === 'Director');
                if (directors.length > 0) {
                    director = directors.map(d => d.name).join(', ');
                }
            }

            const data = {
                type: 'movie',
                title: movie.title,
                poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
                url: url,
                year: movie.release_date ? movie.release_date.substring(0, 4) : null,
                rating: movie.vote_average || null,
                director: director
            };

            if (!data.title) throw new Error('Could not extract movie title.');
            console.log('[extract-imdb] TMDB movie result:', data);
            return res.json(data);

        } else if (tvResults.length > 0) {
            const tmdbId = tvResults[0].id;
            console.log(`[extract-imdb] Found TV show with TMDB ID: ${tmdbId}`);

            const detailsResponse = await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}`, {
                params: { api_key: TMDB_API_KEY }
            });
            const show = detailsResponse.data;

            const data = {
                type: 'show',
                title: show.name,
                poster: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : null,
                url: url,
                startYear: show.first_air_date ? show.first_air_date.substring(0, 4) : null,
                endYear: show.status === 'Ended' && show.last_air_date ? show.last_air_date.substring(0, 4) : null,
                rating: show.vote_average || null,
                seasons: show.number_of_seasons || null,
                episodes: show.number_of_episodes || null,
                creator: show.created_by && show.created_by.length > 0
                    ? show.created_by.map(c => c.name).join(', ')
                    : null
            };

            if (!data.title) throw new Error('Could not extract TV show title.');
            console.log('[extract-imdb] TMDB TV show result:', data);
            return res.json(data);

        } else {
            throw new Error('No movie or TV show found in TMDB for this IMDb ID');
        }
    } catch (error) {
        tmdbError = error;
        const apiMsg = error.response?.data?.status_message;
        console.warn(`[extract-imdb] TMDB path failed: ${apiMsg || error.message}. Falling back to Playwright.`);
    }

    // --- Attempt 2: Playwright fallback (scrape IMDb directly) ---
    try {
        const data = await extractImdbViaPlaywright(url);
        console.log('[extract-imdb] Playwright fallback result:', data);
        return res.json(data);
    } catch (playwrightError) {
        console.error(`[extract-imdb] Playwright fallback failed for ${url}:`, playwrightError.message);
        const reported = tmdbError || playwrightError;
        return res.status(500).json({
            message: 'IMDb extraction failed',
            error: reported?.response?.data?.status_message || reported?.message || 'Unknown error'
        });
    }
});

module.exports = router;
