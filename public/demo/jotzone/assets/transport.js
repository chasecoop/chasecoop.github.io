// Demo stand-in for public/assets/transport.js: same exports, no server.
// Everything lives in memory, seeded from seed.json, so a reload starts over.
// demo/build.mjs installs this file as assets/transport.js and rewrites the
// three imports below to their places in the bundle.
import { CATEGORIES, CATEGORY_KEYS, linkKinds, rulesCategory } from './lib/classify.js';
import { buildGraph } from './lib/graph.js';
import { extractUrls, findLinks } from './urls.js';

const MAX_BODY_CHARS = 40000;
const GRAPH_LIMIT = 1500;
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const RASTER = /^image\/(png|jpeg|gif|webp|avif|bmp)$/;

const fail = (status, message) => Object.assign(new Error(message), { status });
const isImageMime = (mime) => /^image\//.test(mime || '');
const randomId = () => Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

// Only files that ship with the demo (or data: URLs) may be shown as images.
const localSrc = (src) => (typeof src === 'string' && src && (/^data:/i.test(src) || !/^([a-z][a-z0-9+.-]*:|\/)/i.test(src)) ? src : null);
const urlKey = (url) => String(url).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
const words = (s) => String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

/**
 * The in-memory server. `emit(event, data)` receives what the real server
 * would broadcast over SSE. Response shapes mirror src/server.js.
 */
export function createStore(seed = {}, { now = Date.now(), emit = () => {} } = {}) {
  const name = String(seed.name || 'Me').trim() || 'Me';
  const messages = []; // oldest first, ids ascending
  const previews = new Map(); // urlKey -> preview row
  const uploads = new Map(); // id -> attachment not yet on a message
  let nextId = 1;
  let lastRev = 0;

  const nextRev = () => (lastRev = Math.max(Date.now() * 1000, lastRev + 1));
  const previewFor = (url) => previews.get(urlKey(url)) || null;
  const okPreviews = (m) => extractUrls(m.body).map((url) => ({ url, p: previewFor(url) })).filter((x) => x.p);

  for (const s of [...(seed.messages || [])].sort((a, b) => (b.ago_min || 0) - (a.ago_min || 0))) {
    for (const p of s.previews || []) {
      if (!p || !p.url) continue;
      const image = localSrc(p.image);
      if (p.kind === 'image' && !image) continue;
      previews.set(urlKey(p.url), {
        kind: p.kind || 'page', title: p.title ?? null, description: p.description ?? null, image,
        site_name: p.site_name ?? null, favicon: localSrc(p.favicon), embed: p.embed ?? null,
      });
    }
    const body = String(s.body || '').replace(/\r\n?/g, '\n').trim();
    const m = {
      id: nextId++, body, created_at: now - Math.round((s.ago_min || 0) * 60000), edited_at: null, pinned: !!s.pinned,
      category: null, category_source: 'rules', hidden: [],
      attachments: (s.attachments || []).map((a) => ({
        id: randomId(), filename: String(a.filename || 'file'), mime: String(a.mime || 'application/octet-stream'),
        size: Number(a.size) || 0, url: localSrc(a.src),
      })),
    };
    m.category = CATEGORY_KEYS.includes(s.category) ? s.category : rulesCategory(body, okPreviews(m).map((x) => x.p));
    messages.push(m);
  }

  const find = (id) => messages.find((m) => m.id === id);
  const hasLink = (m) => findLinks(m.body).length > 0;

  function serialize(m) {
    const out = [];
    for (const { url, p } of okPreviews(m)) {
      if (out.length >= 5) break;
      if (m.hidden.includes(url)) continue;
      out.push({ url, kind: p.kind, title: p.title, description: p.description, image: p.image, site_name: p.site_name, favicon: p.favicon, embed: p.embed });
    }
    return {
      id: m.id, body: m.body, created_at: m.created_at, edited_at: m.edited_at ?? null, pinned: !!m.pinned,
      category: m.category || null, category_source: m.category_source || null,
      attachments: m.attachments.map((a) => ({ ...a })), previews: out, rev: nextRev(),
    };
  }

  const FILTERS = {
    pinned: (m) => m.pinned,
    links: hasLink,
    youtube: (m) => linkKinds(m.body).includes(',youtube,'),
    x: (m) => linkKinds(m.body).includes(',x,'),
    images: (m) => linkKinds(m.body).includes(',image,') || m.attachments.some((a) => isImageMime(a.mime)),
    files: (m) => m.attachments.some((a) => !isImageMime(a.mime)),
  };

  // Like the server's search: every word must be in the message (the real
  // one uses a stemmed full-text index; word prefixes come close), or the
  // message links to a page whose title, description or site matches.
  function searcher(text) {
    const terms = String(text).trim().split(/\s+/).map((t) => t.replace(/"/g, '')).filter(Boolean).slice(0, 12).map((t) => t.toLowerCase());
    if (!terms.length) return null;
    return (m) => {
      const body = m.body.toLowerCase();
      const bodyWords = words(body);
      if (terms.every((t) => body.includes(t) || (words(t).length > 0 && words(t).every((w) => bodyWords.some((b) => b.startsWith(w)))))) return true;
      return okPreviews(m).some(({ p }) => terms.every((t) => [p.title, p.description, p.site_name].some((f) => String(f || '').toLowerCase().includes(t))));
    };
  }

  function listMessages(params) {
    const limit = Math.min(Math.max(parseInt(params.get('limit') || '50', 10) || 50, 1), 200);
    const before = parseInt(params.get('before') || '', 10);
    const after = parseInt(params.get('after') || '', 10);
    const around = parseInt(params.get('around') || '', 10);
    const filter = params.get('filter');
    const text = params.get('q');
    const tests = [];
    if (FILTERS[filter]) tests.push(FILTERS[filter]);
    else if (filter && filter.startsWith('cat:')) tests.push((m) => m.category === filter.slice(4));
    if (text && text.trim()) { const s = searcher(text); if (s) tests.push(s); }
    const base = messages.filter((m) => tests.every((t) => t(m)));
    const asc = (cond, n) => base.filter(cond).slice(0, n);
    const desc = (cond, n) => { const r = base.filter(cond); return r.slice(Math.max(r.length - n, 0)); };

    let rows;
    if (Number.isFinite(around)) {
      const half = Math.floor(limit / 2);
      rows = [...desc((m) => m.id < around, half), ...asc((m) => m.id >= around, limit - half)];
    } else if (Number.isFinite(after)) rows = asc((m) => m.id > after, limit);
    else if (Number.isFinite(before)) rows = desc((m) => m.id < before, limit);
    else rows = desc(() => true, limit);

    let hasOlder, hasNewer;
    if (rows.length) {
      hasOlder = base.some((m) => m.id < rows[0].id);
      hasNewer = base.some((m) => m.id > rows[rows.length - 1].id);
    } else {
      hasOlder = Number.isFinite(after) ? base.some((m) => m.id <= after) : false;
      hasNewer = Number.isFinite(before) ? base.some((m) => m.id >= before) : false;
    }
    return { messages: rows.map(serialize), hasOlder, hasNewer };
  }

  function sidebarCounts() {
    const out = { all: messages.length, sources: {}, categories: {}, smart: false };
    for (const [k, test] of Object.entries(FILTERS)) out.sources[k] = messages.filter(test).length;
    for (const m of messages) if (m.category) out.categories[m.category] = (out.categories[m.category] || 0) + 1;
    out.labels = CATEGORIES.map(({ key, label }) => ({ key, label }));
    return out;
  }

  // [id, created_at, text length, flags, category index or -1]
  // flags: 1 link, 2 image, 4 file, 8 pinned, 16 preview card, 32 video embed
  function minimap() {
    const rows = messages.map((m) => {
      const link = hasLink(m);
      let flags = (link ? 1 : 0) | (m.attachments.some((a) => isImageMime(a.mime)) || linkKinds(m.body).includes(',image,') ? 2 : 0) |
        (m.attachments.some((a) => !isImageMime(a.mime)) ? 4 : 0) | (m.pinned ? 8 : 0);
      if (link) {
        for (const url of extractUrls(m.body).slice(0, 5)) {
          const p = previewFor(url);
          if (!p || m.hidden.includes(url)) continue;
          flags |= p.kind === 'video' || p.embed ? 32 : p.kind === 'image' ? 2 : 16;
        }
      }
      return [m.id, m.created_at, [...m.body].length, flags, m.category ? CATEGORY_KEYS.indexOf(m.category) : -1];
    });
    return { categories: CATEGORY_KEYS, rows };
  }

  function graph() {
    const latest = messages.slice(-GRAPH_LIMIT).reverse();
    const byUrl = new Map();
    for (const m of latest) for (const { url, p } of okPreviews(m)) byUrl.set(url, { url, title: p.title, description: p.description });
    const g = buildGraph(latest.map((m) => ({ id: m.id, body: m.body, created_at: m.created_at, pinned: m.pinned ? 1 : 0, files: m.attachments.length })), byUrl);
    g.total = messages.length;
    g.limit = GRAPH_LIMIT;
    return g;
  }

  // The server sorts again once link previews arrive; here that is immediate.
  function recategorize(m) {
    if (m.category_source === 'manual') return;
    m.category = rulesCategory(m.body, okPreviews(m).map((x) => x.p));
    m.category_source = 'rules';
  }

  function createMessage(body = {}) {
    const text = typeof body.body === 'string' ? body.body.replace(/\r\n?/g, '\n').trim() : '';
    if (text.length > MAX_BODY_CHARS) throw fail(400, `Messages are limited to ${MAX_BODY_CHARS} characters`);
    const ids = Array.isArray(body.attachment_ids) ? body.attachment_ids.filter((x) => typeof x === 'string').slice(0, 20) : [];
    const valid = ids.filter((id) => uploads.has(id));
    if (!text && !valid.length) throw fail(400, 'Message is empty');
    const m = {
      id: nextId++, body: text, created_at: Date.now(), edited_at: null, pinned: false, category: null, category_source: 'rules', hidden: [],
      attachments: valid.map((id) => { const a = uploads.get(id); uploads.delete(id); return a; }),
    };
    recategorize(m);
    messages.push(m);
    const msg = serialize(m);
    emit('message', msg);
    return msg;
  }

  function patchMessage(id, body = {}) {
    const m = find(id);
    if (!m) throw fail(404, 'Not found');
    const next = { ...m };
    if (typeof body.body === 'string') {
      const text = body.body.replace(/\r\n?/g, '\n').trim();
      if (text.length > MAX_BODY_CHARS) throw fail(400, `Messages are limited to ${MAX_BODY_CHARS} characters`);
      if (!text && !m.attachments.length) throw fail(400, 'Message is empty');
      if (text !== m.body) { next.body = text; next.edited_at = Date.now(); }
    }
    if (typeof body.pinned === 'boolean') next.pinned = body.pinned;
    if (typeof body.category === 'string') {
      if (!CATEGORY_KEYS.includes(body.category)) throw fail(400, 'Unknown category');
      next.category = body.category;
      next.category_source = 'manual';
    }
    if (typeof body.hide_preview === 'string' && body.hide_preview.length < 4096 && !m.hidden.includes(body.hide_preview)) {
      next.hidden = [...m.hidden, body.hide_preview].slice(-50);
    }
    const bodyChanged = next.body !== m.body;
    Object.assign(m, next);
    if (bodyChanged) recategorize(m);
    const msg = serialize(m);
    emit('message', msg);
    return msg;
  }

  function deleteMessage(id) {
    const i = messages.findIndex((m) => m.id === id);
    if (i < 0) throw fail(404, 'Not found');
    messages.splice(i, 1);
    emit('delete', { id });
    return { ok: true };
  }

  function addUpload({ filename, mime, size, url }) {
    const a = { id: randomId(), filename, mime, size, url };
    uploads.set(a.id, a);
    return { ...a };
  }

  function exportAll() {
    return { app: 'jotzone', name, exported_at: new Date().toISOString(), messages: messages.map(serialize) };
  }

  function request(method, path, body) {
    const url = new URL(path, 'http://local');
    const p = url.pathname;
    let m;
    if (p === '/api/me' && method === 'GET') return { name };
    if (p === '/api/messages' && method === 'GET') return listMessages(url.searchParams);
    if (p === '/api/messages' && method === 'POST') return createMessage(body);
    if ((m = p.match(/^\/api\/messages\/(\d+)$/))) {
      const id = Number(m[1]);
      if (method === 'PATCH') return patchMessage(id, body);
      if (method === 'DELETE') return deleteMessage(id);
      if (method === 'GET') { const row = find(id); if (!row) throw fail(404, 'Not found'); return serialize(row); }
    }
    if (p === '/api/sidebar' && method === 'GET') return sidebarCounts();
    if (p === '/api/minimap' && method === 'GET') return minimap();
    if (p === '/api/graph' && method === 'GET') return graph();
    if (p === '/api/export' && method === 'GET') return exportAll();
    if (p === '/api/logout' && method === 'POST') return { ok: true };
    throw fail(404, 'Not found');
  }

  return { request, addUpload, exportAll };
}

// ==================== browser bindings ====================

const listeners = new Set();
// Events arrive after the current task, as they do over SSE. Copies, so the
// page never shares an object with the store.
function emit(event, data) {
  const copy = JSON.parse(JSON.stringify(data));
  setTimeout(() => { for (const l of listeners) (event === 'delete' ? l.onDelete : l.onMessage)(copy); }, 0);
}

let storePromise = null;
function store() {
  // In the bundle this file is assets/transport.js and seed.json sits one level up.
  storePromise ||= fetch(new URL('../seed.json', import.meta.url))
    .then((r) => (r.ok ? r.json() : {}), () => ({}))
    .then((seed) => createStore(seed, { emit }));
  return storePromise;
}

export async function request(method, path, body) {
  const s = await store();
  const sent = body === undefined ? undefined : JSON.parse(JSON.stringify(body));
  return JSON.parse(JSON.stringify(s.request(method, path, sent)));
}

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read that file'));
    r.readAsDataURL(file);
  });
}

// Images only, kept in memory as data: URLs. Nothing leaves the browser.
export function upload(file, { name = file.name, onProgress } = {}) {
  let aborted = false;
  const promise = (async () => {
    if (!RASTER.test(file.type)) throw new Error('Only images can be attached in the demo');
    if (file.size > MAX_IMAGE_BYTES) throw new Error('Images are limited to 1.5 MB in the demo');
    if (file.size === 0) throw new Error('Empty file');
    const url = await readDataUrl(file);
    const s = await store();
    if (aborted) return new Promise(() => {});
    if (onProgress) onProgress(1);
    return s.addUpload({ filename: name, mime: file.type, size: file.size, url });
  })();
  return { promise, abort: () => { aborted = true; } };
}

export function openEvents(handlers) {
  listeners.add(handlers);
  store().then(() => handlers.onOpen());
}

// Signing out of the demo starts it over.
export async function signOut() {
  location.reload();
}

// "Export all" downloads the made-up notes as they are right now.
export function bindExport(link) {
  if (!link) return;
  link.setAttribute('href', '#');
  link.removeAttribute('download');
  link.addEventListener('click', async (e) => {
    e.preventDefault();
    const data = (await store()).exportAll();
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
    a.download = `jotzone-demo-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
  });
}

export const messageLink = (id) => `${location.origin}${location.pathname}#m${id}`;

// Seed pictures are SVG files that ship with the demo, so those show inline too.
export const isInlineImage = (mime) => RASTER.test(mime) || mime === 'image/svg+xml';

export function fileLink(a, viewable) {
  if (!a.url) return {};
  return viewable ? { href: a.url, target: '_blank' } : { href: a.url, download: a.filename };
}

// blob: images are not allowed on the demo's host, so the thumbnail appears
// once the file has been read.
export const localThumb = (file) => null;
export const uploadedThumb = (attachment) => attachment.url;
export const releaseThumb = (url) => {};

// No embedded players in the demo: a video card opens its link in a new tab.
export const canEmbedVideo = false;
export const canOpenOriginal = (src) => !/^data:/i.test(src);
