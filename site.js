'use strict';
// Where is the server? This app is opened in one of two ways:
//  - straight from the Pi (its tunnel or home Wi-Fi address): the API lives on the same
//    origin and the sign-in cookie does the auth - nothing special;
//  - from the fixed link (GitHub Pages): the API is wherever the Pi's tunnel currently is.
//    The Pi publishes that address as a DNS TXT record on its DuckDNS name
//    ("main=https://...;gf=https://..."); we read it over DNS-over-HTTPS, and the sign-in
//    token goes in the Authorization header instead of a cookie.
// Everything below is shared by index.html and login.html.

const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
const paramOrStored = (param, key, fallback) => {
  const q = new URLSearchParams(location.search).get(param);
  if (q) lsSet(key, q);
  return (q || lsGet(key) || fallback).replace(/[^a-z0-9.-]/gi, '') || fallback;
};

const SITE = paramOrStored('site', 'hw_site', 'main');                          // which copy: main (me) or gf
const DIRECTORY = paramOrStored('dir', 'hw_dir', 'gerald-homework.duckdns.org'); // DNS name that carries the Pi's address
const DOH = ['https://cloudflare-dns.com/dns-query', 'https://dns.google/resolve'];

let HOSTED = false;     // true when served from the fixed link, not from the Pi itself
let API_BASE = '';      // '' = same origin

function authToken() { return HOSTED ? lsGet(`hw_token_${SITE}`) || '' : ''; }
function setAuthToken(tok) { if (HOSTED) lsSet(`hw_token_${SITE}`, tok || ''); }
function apiUrl(path) { return API_BASE + path; }
function apiHeaders(extra = {}) {
  const h = { ...extra };
  const tok = authToken();
  if (tok) h.Authorization = `Bearer ${tok}`;
  return h;
}
// relative, so it works at / on the Pi and at /homework/ on the fixed link
function loginUrl() { return `login.html${location.hash}`; }
function appUrl() { return `./${location.hash}`; }

// Same origin or hosted? Ask once per origin: the Pi answers /api/auth with JSON, a static host doesn't.
async function detectMode() {
  const cached = lsGet('hw_mode');
  if (cached === 'local' || cached === 'hosted') { HOSTED = cached === 'hosted'; return; }
  try {
    const r = await fetch('api/auth', { cache: 'no-store' });
    HOSTED = !(r.headers.get('content-type') || '').includes('application/json');
    lsSet('hw_mode', HOSTED ? 'hosted' : 'local');
  } catch { HOSTED = false; }   // no network at all: assume the Pi, and don't remember the guess
}

// Read "main=https://...;gf=https://..." from the DuckDNS TXT record.
async function lookupDirectory() {
  for (const ep of DOH) {
    try {
      const r = await fetch(`${ep}?name=${encodeURIComponent(DIRECTORY)}&type=TXT`, { headers: { accept: 'application/dns-json' }, cache: 'no-store' });
      const d = await r.json();
      const txt = (d.Answer || []).filter(a => a.type === 16).map(a => String(a.data).replace(/"\s+"/g, '').replace(/^"|"$/g, '')).join('');
      const map = {};
      for (const part of txt.split(';')) { const i = part.indexOf('='); if (i > 0) map[part.slice(0, i).trim()] = part.slice(i + 1).trim(); }
      const url = map[SITE];
      if (url && /^https?:\/\//.test(url)) return url.replace(/\/+$/, '');
    } catch { /* try the next resolver */ }
  }
  return '';
}

let lastLookup = 0;
// Sets API_BASE. `fresh` ignores the remembered address (used after a request failed); lookups are throttled.
async function resolveApi({ fresh = false } = {}) {
  if (!HOSTED) { API_BASE = ''; return true; }
  const remembered = lsGet(`hw_api_${SITE}`) || '';
  if (remembered && !fresh) { API_BASE = remembered; return true; }
  if (Date.now() - lastLookup < 20000) return !!API_BASE;
  lastLookup = Date.now();
  const found = await lookupDirectory();
  if (found) { API_BASE = found; lsSet(`hw_api_${SITE}`, found); return true; }
  API_BASE = remembered;
  return !!API_BASE;
}

// fetch() against the API; if the Pi's address changed (tunnel restarted), look it up again and retry once
async function apiFetch(path, init = {}) {
  if (HOSTED && !API_BASE) { await resolveApi({ fresh: true }); if (!API_BASE) throw new TypeError('no server address'); }
  try { return await fetch(apiUrl(path), init); }
  catch (err) {
    if (!HOSTED) throw err;
    const before = API_BASE;
    await resolveApi({ fresh: true });
    if (!API_BASE || API_BASE === before) throw err;
    return fetch(apiUrl(path), init);
  }
}

async function initSite() { await detectMode(); await resolveApi(); }
