// itsnotes clipper — popup logic.
//
// On open it grabs the active tab's rendered HTML (so logged-in / paywalled
// pages the user can see are captured from THEIR session), prefills the title,
// and on Save posts everything to the configured server's /api/notes/clip.

const els = {
  gear: document.getElementById('gear'),
  form: document.getElementById('form'),
  settings: document.getElementById('settings'),
  title: document.getElementById('title'),
  tags: document.getElementById('tags'),
  tagSuggest: document.getElementById('tagSuggest'),
  save: document.getElementById('save'),
  status: document.getElementById('status'),
  // settings fields
  serverUrl: document.getElementById('serverUrl'),
  token: document.getElementById('token'),
  saveSettings: document.getElementById('saveSettings'),
};

// Captured page data, filled in once the content script runs.
let captured = { url: '', title: '', html: '' };
let configured = false;
let clipInitialized = false;

function setStatus(text, kind) {
  els.status.textContent = text;
  els.status.className = kind || 'muted';
  // Collapse the line when empty so there's no dead space under the button.
  els.status.style.display = text ? 'block' : 'none';
}

async function getConfig() {
  const { serverUrl, token } = await chrome.storage.sync.get(['serverUrl', 'token']);
  return { serverUrl, token };
}

function normalizeUrl(url) {
  return (url || '').trim().replace(/\/$/, '');
}

// --- View switching ---------------------------------------------------------
const ICON_GEAR =
  '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';
const ICON_CLOSE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

function showSettings() {
  els.form.hidden = true;
  els.settings.hidden = false;
  els.gear.innerHTML = ICON_CLOSE;
  els.gear.title = 'Close';
  els.gear.setAttribute('aria-label', 'Close settings');
}

function showClip() {
  els.settings.hidden = true;
  els.form.hidden = false;
  els.gear.innerHTML = ICON_GEAR;
  els.gear.title = 'Settings';
  els.gear.setAttribute('aria-label', 'Settings');
  if (!clipInitialized) initClip();
}

els.gear.addEventListener('click', () => {
  if (els.settings.hidden) {
    showSettings();
  } else if (configured) {
    // Only leave settings once there's a usable config to go back to.
    showClip();
  }
});

// Pull the rendered HTML, title and URL out of the active tab.
async function capturePage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error('No active tab.');

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const iconLink = document.querySelector('link[rel~="icon"]');
      const href = iconLink && iconLink.getAttribute('href');
      return {
        url: location.href,
        title: document.title,
        html: document.documentElement.outerHTML,
        favicon: href ? new URL(href, location.href).href : null,
      };
    },
  });

  // Chrome's own tab favicon is the most reliable; fall back to the page-parsed
  // <link rel=icon>, then to the origin's /favicon.ico.
  let favicon = tab.favIconUrl || result.favicon;
  if (!favicon) {
    try { favicon = new URL('/favicon.ico', result.url).href; } catch (_) { /* ignore */ }
  }
  return { ...result, favicon };
}

// Capture the page and prime the clip form. Runs once, the first time the clip
// view is shown with a valid config.
async function initClip() {
  clipInitialized = true;
  const { serverUrl, token } = await getConfig();

  // Load the app's tags for autocomplete (background; typing works regardless).
  setupTagAutocomplete(serverUrl, token);

  try {
    captured = await capturePage();
    els.title.textContent = '';
    if (captured.favicon) {
      const fav = document.createElement('img');
      fav.className = 'favicon';
      fav.src = captured.favicon;
      fav.alt = '';
      fav.onerror = () => fav.remove(); // drop a broken favicon gracefully
      els.title.appendChild(fav);
    }
    const titleText = document.createElement('span');
    titleText.textContent = captured.title || '';
    els.title.appendChild(titleText);
    setStatus('', 'muted');
  } catch (e) {
    setStatus(`Couldn't read the page: ${e.message}`, 'err');
  }
}

// --- Settings actions -------------------------------------------------------
// Briefly show a message on the Save button, then restore it.
function flashSaveButton(message) {
  els.saveSettings.disabled = false;
  els.saveSettings.textContent = message;
  setTimeout(() => { els.saveSettings.textContent = 'Save'; }, 2000);
}

// One button: validate the server + token (an authenticated probe), persist on
// success, and report everything through the button label.
els.saveSettings.addEventListener('click', async () => {
  const serverUrl = normalizeUrl(els.serverUrl.value);
  const token = els.token.value.trim();
  if (!serverUrl || !token) {
    flashSaveButton('Enter server & token');
    return;
  }

  els.saveSettings.disabled = true;
  els.saveSettings.textContent = 'Checking…';
  try {
    const resp = await fetch(`${serverUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status === 401) throw new Error('Invalid token');
    if (!resp.ok) throw new Error(`Server error ${resp.status}`);

    await chrome.storage.sync.set({ serverUrl, token });
    configured = true;
    els.saveSettings.textContent = 'Saved!';
    setTimeout(() => {
      els.saveSettings.disabled = false;
      els.saveSettings.textContent = 'Save';
      showClip();
    }, 700);
  } catch (e) {
    const unreachable = /Failed to fetch|NetworkError|Load failed/i.test(e.message);
    flashSaveButton(unreachable ? "Can't reach server" : e.message);
  }
});

async function init() {
  const { serverUrl, token } = await getConfig();
  configured = Boolean(serverUrl && token);
  if (serverUrl) els.serverUrl.value = serverUrl;
  if (token) els.token.value = token;

  if (configured) {
    showClip();
  } else {
    showSettings();
  }
}

// --- Tag autocomplete ------------------------------------------------------
// Pulls the app's existing tags (best-effort) and suggests them as you type in
// the comma-separated field. New tags can still be typed freely.
let allTags = []; // [{ name, count }]
let suggestions = [];
let activeIndex = -1;

async function setupTagAutocomplete(base, token) {
  try {
    const resp = await fetch(`${base.replace(/\/$/, '')}/api/tags`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return;
    const data = await resp.json();
    allTags = (data.tags || [])
      .filter((t) => t && t.name && !t.is_folder && t.visible !== false)
      .map((t) => ({ name: t.name, count: t.note_count || 0 }));
  } catch (_) {
    // Autocomplete is a convenience; typing still works without it.
  }
}

// The tag being typed is whatever follows the last comma.
function currentFragment() {
  const value = els.tags.value;
  const comma = value.lastIndexOf(',');
  const before = comma === -1 ? '' : value.slice(0, comma + 1);
  const fragment = value.slice(comma + 1).trim();
  return { before, fragment };
}

function alreadyChosen() {
  return new Set(
    els.tags.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
  );
}

function renderSuggestions() {
  els.tagSuggest.innerHTML = '';
  if (suggestions.length === 0) {
    els.tagSuggest.hidden = true;
    return;
  }
  suggestions.forEach((tag, i) => {
    const li = document.createElement('li');
    if (i === activeIndex) li.className = 'active';
    const name = document.createElement('span');
    name.textContent = tag.name;
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = tag.count ? String(tag.count) : '';
    li.append(name, count);
    li.addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep focus, beat the blur handler
      chooseSuggestion(i);
    });
    els.tagSuggest.appendChild(li);
  });
  els.tagSuggest.hidden = false;
}

function updateSuggestions() {
  const { fragment } = currentFragment();
  if (!fragment) {
    suggestions = [];
    activeIndex = -1;
    renderSuggestions();
    return;
  }
  const chosen = alreadyChosen();
  const f = fragment.toLowerCase();
  suggestions = allTags
    .filter((t) => t.name.toLowerCase().includes(f) && !chosen.has(t.name.toLowerCase()))
    .slice(0, 8);
  activeIndex = suggestions.length ? 0 : -1;
  renderSuggestions();
}

function chooseSuggestion(index) {
  const tag = suggestions[index];
  if (!tag) return;
  const { before } = currentFragment();
  const prefix = before ? `${before} ` : '';
  els.tags.value = `${prefix}${tag.name}, `;
  suggestions = [];
  activeIndex = -1;
  renderSuggestions();
  els.tags.focus();
}

els.tags.addEventListener('input', updateSuggestions);
els.tags.addEventListener('keydown', (e) => {
  if (els.tagSuggest.hidden || suggestions.length === 0) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex = (activeIndex + 1) % suggestions.length;
    renderSuggestions();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex = (activeIndex - 1 + suggestions.length) % suggestions.length;
    renderSuggestions();
  } else if (e.key === 'Enter' && activeIndex >= 0) {
    e.preventDefault();
    chooseSuggestion(activeIndex);
  } else if (e.key === 'Escape') {
    suggestions = [];
    activeIndex = -1;
    renderSuggestions();
  }
});
els.tags.addEventListener('blur', () => {
  // Delay so a mousedown on a suggestion still registers.
  setTimeout(() => { els.tagSuggest.hidden = true; }, 120);
});

els.save.addEventListener('click', async () => {
  const { serverUrl, token } = await getConfig();
  if (!serverUrl || !token) {
    showSettings();
    return;
  }

  els.save.disabled = true;
  els.save.textContent = 'Saving…';

  const tags = els.tags.value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  try {
    const base = serverUrl.replace(/\/$/, '');
    const resp = await fetch(`${base}/api/notes/clip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        url: captured.url,
        html: captured.html,
        title: els.title.textContent.trim(),
        tags,
        includeImages: true,
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.message || `Server returned ${resp.status}`);
    }

    els.save.textContent = 'Saved!';
    setTimeout(() => window.close(), 900);
  } catch (e) {
    setStatus(`Failed: ${e.message}`, 'err');
    els.save.textContent = 'Save note';
    els.save.disabled = false;
  }
});

init();
