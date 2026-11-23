import { trimUrl, LINK_RE, linkTarget, TAG_RE, isTag } from './urls.js';
import { createGraph } from './graph.js';
import { createMinimap } from './minimap.js';
import { initRollingLists } from './playful.js';
import {
  request as api, upload, openEvents, signOut, bindExport, messageLink, isInlineImage, fileLink,
  localThumb, uploadedThumb, releaseThumb, canEmbedVideo, canOpenOriginal,
} from './transport.js';

// ==================== small helpers ====================

const $ = (sel, root = document) => root.querySelector(sel);
const coarse = matchMedia('(pointer: coarse)').matches;
const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ICONS = {
  pin: '<path d="M7.5 2.5h5l-.8 4.2 2.8 2.8v1.2h-4.2V16L10 17.5 9.7 16v-5.3H5.5V9.5l2.8-2.8z" stroke-linejoin="round"/>',
  copy: '<rect x="6.5" y="6.5" width="10" height="10" rx="2"/><path d="M13.5 6.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v7A1.5 1.5 0 0 0 5 13.5h1.5"/>',
  link: '<path d="M8.5 11.5a3.2 3.2 0 0 0 4.6 0l2.6-2.6a3.2 3.2 0 0 0-4.6-4.6l-.9.9"/><path d="M11.5 8.5a3.2 3.2 0 0 0-4.6 0l-2.6 2.6a3.2 3.2 0 0 0 4.6 4.6l.9-.9"/>',
  edit: '<path d="M13.6 3.6a1.8 1.8 0 0 1 2.6 2.6L7.5 15l-3.5.9.9-3.5z" stroke-linejoin="round"/><path d="M12.3 5l2.6 2.6"/>',
  trash: '<path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5.5 5.5l.7 10a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4l.7-10"/>',
  jump: '<path d="M4 10h11M11 5.5l4.5 4.5-4.5 4.5" stroke-linejoin="round"/>',
  search: '<circle cx="8.5" cy="8.5" r="5"/><path d="M12.3 12.3l4.2 4.2"/>',
  menu: '<path d="M3 5.5h14M3 10h14M3 14.5h14"/>',
  plus: '<path d="M10 4.5v11M4.5 10h11"/>',
  send: '<path d="M3.2 3.5l14 6.5-14 6.5 2.2-6.5z" fill="currentColor" stroke-linejoin="round"/>',
  bold: '<path d="M6 4h4.8a3 3 0 0 1 0 6H6zM6 10h5.6a3 3 0 0 1 0 6H6z" stroke-width="2" stroke-linejoin="round"/>',
  italic: '<path d="M8.5 4h6M5.5 16h6M11.5 4l-3 12"/>',
  strike: '<path d="M3.5 10h13M13.5 6.2C13 4.8 11.7 4 10 4 7.9 4 6.5 5.1 6.5 6.6c0 .9.4 1.6 1.2 2.1M6.5 13.6c.5 1.5 1.9 2.4 3.6 2.4 2.1 0 3.6-1.1 3.6-2.8 0-.5-.1-.9-.3-1.2"/>',
  code: '<path d="M7 6l-4 4 4 4M13 6l4 4-4 4"/>',
  codeblock: '<rect x="2.5" y="3.5" width="15" height="13" rx="2"/><path d="M8 8l-2 2 2 2M12 8l2 2-2 2"/>',
  quote: '<path d="M5 4.5v11"/><path d="M9 7h7M9 10h7M9 13h5"/>',
  bullets: '<circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="10" r="1" fill="currentColor"/><circle cx="4.5" cy="14" r="1" fill="currentColor"/><path d="M8 6h8.5M8 10h8.5M8 14h8.5"/>',
  file: '<path d="M5.5 2.5h6l3.5 3.5v10a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 4 16V4a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M11.5 2.5V6H15"/>',
  download: '<path d="M10 3.5v9M6 8.5l4 4 4-4M4 16.5h12"/>',
  logout: '<path d="M8 3.5H5A1.5 1.5 0 0 0 3.5 5v10A1.5 1.5 0 0 0 5 16.5h3M12.5 6.5L16 10l-3.5 3.5M16 10H8"/>',
  retry: '<path d="M15.5 10a5.5 5.5 0 1 1-1.6-3.9M15.5 3.5v3.2h-3.2"/>',
  graph: '<circle cx="5" cy="5.5" r="2"/><circle cx="15" cy="7" r="2"/><circle cx="8" cy="15" r="2"/><circle cx="16" cy="15.5" r="1.5"/><path d="M6.9 6.1l6.2.6M5.8 7.4l1.5 5.7M13.8 8.6l-4.5 4.9M10 15.1l4.5.3"/>',
  fit: '<path d="M3.5 7.5v-4h4M16.5 7.5v-4h-4M3.5 12.5v4h4M16.5 12.5v4h-4"/>',
  close: '<path d="M5 5l10 10M15 5L5 15"/>',
  home: '<path d="M3.5 9.5L10 4l6.5 5.5"/><path d="M5.5 8v8h9V8"/><path d="M8.5 16v-4h3v4"/>',
  play: '<rect x="2.5" y="4.5" width="15" height="11" rx="3"/><path d="M8.5 7.8v4.4l3.8-2.2z" fill="currentColor" stroke-linejoin="round"/>',
  xlogo: '<path d="M4 4l12 12M16 4L4 16" stroke-width="1.7"/>',
  image: '<rect x="3" y="3.5" width="14" height="13" rx="2"/><circle cx="7.5" cy="8" r="1.5"/><path d="M3.5 14.5l4-4 3 3 2-2 4 4"/>',
  tag: '<path d="M3.5 3.5h6l7 7-6 6-7-7z" stroke-linejoin="round"/><circle cx="7" cy="7" r="1.2"/>',
};
function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

function initial(name) {
  return (Array.from(String(name).trim())[0] || 'M').toUpperCase();
}

function humanSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function storage(op, key, value) {
  try {
    if (op === 'get') return localStorage.getItem(key);
    if (op === 'set') localStorage.setItem(key, value);
    if (op === 'del') localStorage.removeItem(key);
  } catch {}
  return null;
}

// ==================== time ====================

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const timeSecFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function longDay(d) {
  const now = new Date();
  const s = `${d.toLocaleDateString('en-US', { weekday: 'long' })}, ${d.toLocaleDateString('en-US', { month: 'long' })} ${ordinal(d.getDate())}`;
  return d.getFullYear() === now.getFullYear() ? s : `${s}, ${d.getFullYear()}`;
}
function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (dayKey(ts) === dayKey(today.getTime())) return 'Today';
  if (dayKey(ts) === dayKey(yest.getTime())) return 'Yesterday';
  return longDay(d);
}
const fullDate = (ts) => `${longDay(new Date(ts))} at ${timeSecFmt.format(ts)}`;

// ==================== formatting (Slack mrkdwn) ====================

const linkHtml = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label ?? esc(url)}</a>`;

export function formatBody(text) {
  const ph = [];
  const P = (html, block = false) => `\u0000${ph.push({ html, block }) - 1}\u0000`;
  let s = String(text);

  // 1. pull out code, links and URLs so nothing inside them gets formatted
  s = s.replace(/```\n?([\s\S]*?)\n?```/g, (_, code) => P(`<pre class="code-block">${esc(code)}</pre>`, true));
  s = s.replace(/`([^`\n]+)`/g, (_, code) => P(`<code>${esc(code)}</code>`));
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s()]+(?:\([^\s()]*\)[^\s()]*)*)\)/g, (_, label, url) => P(linkHtml(url, esc(label))));
  s = s.replace(new RegExp(LINK_RE.source, 'gi'), (m) => {
    const t = trimUrl(m);
    const url = t && linkTarget(t);
    return url ? P(linkHtml(url, esc(t))) + m.slice(t.length) : m;
  });
  s = s.replace(new RegExp(TAG_RE.source, 'gu'), (m, pre, tag) => {
    if (!isTag(tag)) return m;
    const key = tag.toLowerCase().replace(/[-_]+$/, '');
    return pre + P(`<a class="tag" href="#" data-tag="${esc(key)}" title="Search #${esc(key)}">#${esc(tag)}</a>`);
  });

  // 2. escape the rest
  s = esc(s);

  // 3. inline styles with word-boundary rules
  s = s.replace(/(^|[^\w*])\*(?=\S)([^*\n]*?[^\s*])\*(?![\w*])/gm, '$1<b>$2</b>');
  s = s.replace(/(^|[^\w_])_(?=\S)([^_\n]*?[^\s_])_(?![\w_])/gm, '$1<i>$2</i>');
  s = s.replace(/(^|[^\w~])~(?=\S)([^~\n]*?[^\s~])~(?![\w~])/gm, '$1<s>$2</s>');

  // 4. block quotes and bullets, without a newline before/after block elements
  const segs = [];
  for (const line of s.split('\n')) {
    let m;
    if ((m = line.match(/^\u0000(\d+)\u0000$/)) && ph[m[1]].block) {
      segs.push({ type: 'block', line });
    } else if ((m = line.match(/^&gt; ?(.*)$/))) {
      const last = segs[segs.length - 1];
      if (last && last.type === 'quote') last.lines.push(m[1]); else segs.push({ type: 'quote', lines: [m[1]] });
    } else if ((m = line.match(/^(?:-|\*|•) (.*)$/))) {
      const last = segs[segs.length - 1];
      if (last && last.type === 'list') last.lines.push(m[1]); else segs.push({ type: 'list', lines: [m[1]] });
    } else {
      segs.push({ type: 'text', line });
    }
  }
  let out = '';
  segs.forEach((seg, i) => {
    if (seg.type === 'text') {
      if (i > 0 && segs[i - 1].type === 'text') out += '\n';
      out += seg.line;
    } else if (seg.type === 'block') {
      out += seg.line;
    } else if (seg.type === 'quote') {
      out += `<blockquote>${seg.lines.join('\n')}</blockquote>`;
    } else {
      out += `<ul>${seg.lines.map((l) => `<li>${l}</li>`).join('')}</ul>`;
    }
  });

  // 5. put the placeholders back
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => ph[i].html);
}

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[‍️⃣\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]|\s)+$/u;
function isJumbo(text) {
  const t = (text || '').trim();
  if (!t || !EMOJI_ONLY.test(t)) return false;
  const count = [...t.matchAll(/\p{Extended_Pictographic}/gu)].length + Math.ceil([...t.matchAll(/\p{Regional_Indicator}/gu)].length / 2);
  return count > 0 && count <= 23;
}

function searchTerms() {
  return S.view === 'search' ? S.q.trim().split(/\s+/).map((t) => t.replace(/"/g, '')).filter(Boolean) : [];
}

function highlight(root, terms) {
  if (!terms.length) return;
  const re = new RegExp(terms.map(escRe).join('|'), 'gi');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && n.parentElement.closest('mark') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const t = node.nodeValue;
    re.lastIndex = 0;
    if (!re.test(t)) continue;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    let m;
    while ((m = re.exec(t))) {
      if (!m[0]) { re.lastIndex++; continue; }
      frag.append(t.slice(last, m.index), h('mark', { text: m[0] }));
      last = m.index + m[0].length;
    }
    frag.append(t.slice(last));
    node.replaceWith(frag);
  }
}

// ==================== state ====================

const S = {
  name: 'Me',
  view: 'dm', // dm | pinned | links | files | search
  q: '',
  msgs: new Map(),
  temps: [],
  hasOlder: false,
  hasNewer: false,
  loading: true,
  loadingOlder: false,
  loadingNewer: false,
  atBottom: true,
  unseen: false,
  editingId: null,
  editDraft: null,
  uploads: [],
  seq: 0,
  gen: 0,
};

const els = {
  app: $('#app'), list: $('#list'), scroller: $('#scroller'), banner: $('#banner'), input: $('#input'),
  send: $('#sendBtn'), attach: $('#attachBtn'), file: $('#fileInput'), chips: $('#chips'), composerWrap: $('#composerWrap'),
  main: $('#main'), drop: $('#dropOverlay'), pill: $('#jumpPill'), search: $('#search'), sidebar: $('#sidebar'),
  scrim: $('#scrim'), lightbox: $('#lightbox'), lightboxImg: $('#lightboxImg'), lightboxOpen: $('#lightboxOpen'),
  modal: $('#modal'), toastEl: $('#toast'), hint: $('#hint'),
};

// ==================== api ====================
// api(method, path, body) and the other network calls live in transport.js.

function pageParams(extra = {}) {
  const p = new URLSearchParams({ limit: '50' });
  if (isFilterView(S.view)) p.set('filter', S.view);
  if (S.view === 'search') p.set('q', S.q);
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
  return p;
}

let toastTimer;
function toast(text) {
  els.toastEl.textContent = text;
  els.toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toastEl.hidden = true; }, 2200);
}

// ==================== message bookkeeping ====================

const filtered = () => S.view !== 'dm';

// Sidebar views that map to a server-side filter.
const FILTER_VIEWS = ['pinned', 'links', 'youtube', 'x', 'images', 'files'];
const isFilterView = (v) => FILTER_VIEWS.includes(v) || v.startsWith('cat:');
const VIEW_TITLES = { pinned: '📌 Pinned messages', links: 'Links', youtube: 'YouTube', x: 'X / Twitter', images: 'Images', files: 'Files' };
let categoryLabels = {}; // key -> label, from /api/sidebar
const isImage = (a) => /^image\//.test(a.mime || '');

function matchesView(m) {
  switch (S.view) {
    case 'dm': return true;
    case 'pinned': return m.pinned;
    case 'links': return m.previews.length > 0 || /https?:\/\/|\b[a-z0-9-]+\.[a-z]{2,}\b/i.test(m.body);
    case 'youtube': return /\b(youtube\.com|youtu\.be)\b/i.test(m.body);
    case 'x': return /\b(x\.com|twitter\.com)\//i.test(m.body);
    case 'images': return m.attachments.some(isImage) || m.previews.some((p) => p.kind === 'image');
    case 'files': return m.attachments.some((a) => !isImage(a));
    default:
      if (S.view.startsWith('cat:')) return m.category === S.view.slice(4);
      return null; // search: unknown, keep existing only
  }
}

// Apply a message from the server (POST/PATCH response or SSE). Never let an
// older copy replace a newer one.
function upsert(m) {
  const cur = S.msgs.get(m.id);
  if (cur) {
    if (cur.rev > m.rev) return false;
    if (matchesView(m) === false) S.msgs.delete(m.id);
    else S.msgs.set(m.id, m);
    return true;
  }
  if (S.view === 'dm') {
    if (S.hasNewer) { S.unseen = true; return true; }
    // Older than the loaded window: it will show up when scrolling back.
    if (S.hasOlder && S.msgs.size && m.id < Math.min(...S.msgs.keys())) return false;
    S.msgs.set(m.id, m);
    if (!S.atBottom) S.unseen = true;
    return true;
  }
  if (matchesView(m)) { S.msgs.set(m.id, m); return true; }
  return false;
}

function dropTemp(t) {
  const i = S.temps.indexOf(t);
  if (i >= 0) S.temps.splice(i, 1);
}

function sameAttachments(a, b) {
  return a.length === b.length && a.every((x, i) => x.id === b[i].id);
}

// ==================== rendering ====================

const cache = new Map(); // key -> { el, sig }

function render() {
  const items = [];
  let list = [...S.msgs.values()].sort((a, b) => a.id - b.id);
  if (filtered()) list.reverse();
  else list = list.concat(S.temps);

  if (!filtered() && !S.hasOlder && !S.loading) items.push({ key: 'intro', sig: S.name, build: buildIntro });
  if (filtered() && !list.length && !S.loading) items.push({ key: `empty`, sig: S.view + '\u0001' + S.q, build: buildEmpty });

  let prev = null;
  let prevDay = null;
  for (const m of list) {
    const day = dayKey(m.created_at);
    if (day !== prevDay) {
      const label = dayLabel(m.created_at);
      items.push({ key: `d${day}`, sig: label, build: () => h('div', { class: 'day', role: 'separator' }, h('span', { text: label })) });
      prevDay = day;
      prev = null;
    }
    const compact = !filtered() && !!prev && !m.failed && !prev.failed &&
      m.created_at >= prev.created_at && m.created_at - prev.created_at < 5 * 60 * 1000;
    const key = m.tempId ? `t${m.tempId}` : `m${m.id}`;
    const editing = !m.tempId && S.editingId === m.id;
    const sig = JSON.stringify([m.body, m.edited_at, m.pinned, m.attachments, m.previews, compact, S.view, S.q, editing, m.pending, m.failed, S.name]);
    items.push({ key, sig, build: () => buildMessage(m, compact, editing) });
    prev = m;
  }
  reconcile(items);
  updateChrome();
}

function reconcile(items) {
  const list = els.list;
  const keep = new Set();
  const nodes = items.map((it) => {
    keep.add(it.key);
    let c = cache.get(it.key);
    if (!c || c.sig !== it.sig) {
      const el = it.build();
      if (c) c.el.replaceWith(el);
      c = { el, sig: it.sig };
      cache.set(it.key, c);
    }
    return c.el;
  });
  for (const [key, c] of cache) {
    if (!keep.has(key)) { c.el.remove(); cache.delete(key); }
  }
  let cursor = list.firstChild;
  for (const el of nodes) {
    if (cursor === el) cursor = cursor.nextSibling;
    else list.insertBefore(el, cursor);
  }
  while (cursor) { const next = cursor.nextSibling; cursor.remove(); cursor = next; }
}

function avatarEl(cls = '') {
  return h('span', { class: `avatar ${cls}`.trim(), 'aria-hidden': 'true', text: initial(S.name) });
}

function buildIntro() {
  return h('div', { class: 'intro' },
    avatarEl('xl'),
    h('h2', {}, S.name + ' ', h('span', { class: 'you', text: '(you)' })),
    h('p', { text: 'This is your own space. Jot down thoughts, save links and stash files here. Nobody else can see it, and search, pins and filters help you find things again.' }));
}

function buildEmpty() {
  const copy = {
    pinned: ['No pinned messages', 'Hover over a message and click the pin to keep it here.'],
    links: ['No links yet', 'Messages with links show up here.'],
    files: ['No files yet', 'Messages with attachments show up here.'],
    search: ['No results', `Nothing matched “${S.q}”. Try different words.`],
  }[S.view] || ['Nothing here', ''];
  return h('div', { class: 'empty' }, h('strong', { text: copy[0] }), copy[1]);
}

function tbButton(action, iconName, title, extra = '') {
  return h('button', { type: 'button', class: `tb ${extra}`.trim(), 'data-action': action, title, 'aria-label': title, html: icon(iconName) });
}

function buildMessage(m, compact, editing) {
  const cls = ['msg'];
  if (compact) cls.push('compact');
  if (m.pinned) cls.push('pinned');
  if (m.pending) cls.push('pending');
  if (m.failed) cls.push('failed');
  const el = h('div', { class: cls.join(' '), id: m.id ? `m${m.id}` : null, 'data-id': m.id || null, 'data-temp': m.tempId || null });
  const time = timeFmt.format(m.created_at);
  const timeLink = (cl, text) => (m.id
    ? h('a', { class: cl, href: `#m${m.id}`, title: fullDate(m.created_at), 'data-action': 'jump', text })
    : h('span', { class: cl, title: fullDate(m.created_at), text }));

  const gutter = h('div', { class: 'gutter' });
  if (compact) gutter.append(h('span', { class: 'hover-time' }, timeLink('', time)));
  else gutter.append(avatarEl());
  const content = h('div', { class: 'content' });
  if (m.pinned) content.append(h('div', { class: 'pin-label', text: '📌 Pinned' }));
  if (!compact) content.append(h('div', { class: 'meta' }, h('span', { class: 'author', text: S.name }), timeLink('time', time)));

  if (editing) {
    content.append(buildEditor(m));
  } else if (m.body) {
    const body = h('div', { class: `body${isJumbo(m.body) ? ' jumbo' : ''}`, html: formatBody(m.body) });
    if (m.edited_at) body.append(h('span', { class: 'edited', title: fullDate(m.edited_at), text: '(edited)' }));
    content.append(body);
  }
  if (m.attachments?.length) content.append(h('div', { class: 'attachments' }, m.attachments.map(buildAttachment)));
  if (m.previews?.length && !editing) content.append(h('div', { class: 'unfurls' }, m.previews.map(buildPreview)));
  if (m.failed) {
    content.append(h('div', { class: 'failed-note', 'data-action': 'retry', html: `${icon('retry', 14)}<span>Failed to send. Click to retry.</span>` }));
  }
  el.append(gutter, content);

  if (m.id && !editing) {
    const tb = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Message actions' });
    if (filtered()) tb.append(tbButton('jump', 'jump', 'Jump to message'));
    tb.append(
      tbButton('pin', 'pin', m.pinned ? 'Unpin message' : 'Pin message', m.pinned ? 'on' : ''),
      tbButton('copy', 'copy', 'Copy text'),
      tbButton('copylink', 'link', 'Copy link'),
      tbButton('category', 'tag', m.category ? `Category: ${categoryLabels[m.category] || m.category}` : 'Set category'),
      tbButton('edit', 'edit', 'Edit message'),
      tbButton('delete', 'trash', 'Delete message', 'danger'),
    );
    el.append(tb);
  }
  const terms = searchTerms();
  if (terms.length) {
    content.querySelectorAll('.body, .unfurl-title, .unfurl-desc').forEach((n) => highlight(n, terms));
  }
  return el;
}

function extInfo(filename, mime) {
  const ext = (filename.match(/\.([a-z0-9]{1,5})$/i) || [])[1] || (mime.split('/')[1] || 'file').slice(0, 4);
  const e = ext.toLowerCase();
  let kind = '';
  if (e === 'pdf') kind = 'pdf';
  else if (['doc', 'docx', 'txt', 'rtf', 'md', 'pages', 'odt'].includes(e)) kind = 'doc';
  else if (['xls', 'xlsx', 'csv', 'numbers', 'ods', 'tsv'].includes(e)) kind = 'sheet';
  else if (['zip', 'gz', 'tgz', 'rar', '7z', 'tar', 'bz2', 'xz'].includes(e)) kind = 'zip';
  else if (['js', 'ts', 'py', 'json', 'html', 'css', 'sh', 'rb', 'go', 'rs', 'c', 'cpp', 'swift', 'java', 'xml', 'svg', 'yml', 'yaml'].includes(e)) kind = 'code';
  else if (/^(audio|video|image)\//.test(mime)) kind = 'media';
  return { ext: e.slice(0, 4), kind };
}

function buildAttachment(a) {
  const t = a.mime;
  if (isInlineImage(t)) {
    return h('img', { class: 'att-img', src: a.url, alt: a.filename, title: a.filename, loading: 'lazy', 'data-action': 'lightbox', 'data-src': a.url });
  }
  if (/^video\/(mp4|webm|quicktime)$/.test(t)) {
    return h('video', { class: 'att-video', src: a.url, controls: true, preload: 'metadata', playsinline: true, title: a.filename });
  }
  if (/^audio\//.test(t)) {
    return h('div', { class: 'att-audio' }, h('div', { class: 'att-audio-name', text: a.filename }), h('audio', { src: a.url, controls: true, preload: 'metadata' }));
  }
  const { ext, kind } = extInfo(a.filename, t);
  const viewable = t === 'application/pdf' || t === 'text/plain';
  return h('a', { class: 'att-file', ...fileLink(a, viewable), rel: 'noopener noreferrer', title: a.filename },
    h('span', { class: `ext k-${kind}`, text: ext }),
    h('span', { class: 'att-meta' }, h('span', { class: 'att-name', text: a.filename }), h('span', { class: 'att-size', text: `${humanSize(a.size)}${viewable ? ' · Open' : ' · Download'}` })),
    h('span', { class: 'att-dl', html: icon('download') }));
}

function buildPreview(p) {
  const card = h('div', { class: `unfurl kind-${p.kind}`, 'data-url': p.url });
  card.append(h('button', { type: 'button', class: 'unfurl-x', 'data-action': 'hide-preview', 'data-url': p.url, title: 'Remove preview', 'aria-label': 'Remove preview', text: '×' }));
  const img = (src) => h('img', { class: 'unfurl-img', src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', 'data-action': 'lightbox', 'data-src': src });
  if (p.kind === 'image') {
    card.append(img(p.image));
    return card;
  }
  let host = '';
  try { host = new URL(p.url).hostname.replace(/^www\./, ''); } catch {}
  const site = h('div', { class: 'unfurl-site' });
  if (p.favicon) site.append(h('img', { class: 'unfurl-favicon', src: p.favicon, alt: '', width: 16, height: 16, loading: 'lazy', referrerpolicy: 'no-referrer' }));
  site.append(h('span', { text: p.site_name || host }));
  card.append(site);
  if (p.title) card.append(h('a', { class: 'unfurl-title', href: p.url, target: '_blank', rel: 'noopener noreferrer', text: p.title }));
  if (p.description) card.append(h('div', { class: 'unfurl-desc', text: p.description }));
  if (p.kind === 'video' && p.embed) {
    card.append(h('div', { class: 'yt', 'data-action': 'play-yt', 'data-embed': p.embed, role: 'button', tabindex: '0', 'aria-label': `Play ${p.title || 'video'}` },
      h('img', { src: p.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }),
      h('span', { class: 'yt-play', 'aria-hidden': 'true' })));
  } else if (p.image) {
    card.append(img(p.image));
  }
  return card;
}

function buildEditor(m) {
  const ta = h('textarea', { class: 'edit-input', rows: '1', 'aria-label': 'Edit message' });
  ta.value = S.editDraft ?? m.body;
  ta.addEventListener('input', () => { S.editDraft = ta.value; autosize(ta); });
  ta.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
    else if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !coarse && !insideFence(ta)) { e.preventDefault(); saveEdit(); }
    else if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'i')) { e.preventDefault(); wrapSelection(ta, e.key === 'b' ? '*' : '_'); }
  });
  return h('div', { class: 'edit-box' }, ta,
    h('div', { class: 'edit-actions' },
      h('button', { type: 'button', class: 'btn small', 'data-action': 'edit-cancel', text: 'Cancel' }),
      h('button', { type: 'button', class: 'btn small primary', 'data-action': 'edit-save', text: 'Save' })));
}

// Everything that isn't the message list: banner, composer visibility, pill.
function updateChrome() {
  const f = filtered();
  els.list.classList.toggle('filtered', f);
  els.composerWrap.hidden = f;
  els.main.classList.toggle('no-composer', f);
  if (f) {
    const title = VIEW_TITLES[S.view] || (S.view.startsWith('cat:') ? categoryLabels[S.view.slice(4)] || 'Category' : `Search results for “${S.q}”`);
    els.banner.replaceChildren(
      h('span', { class: 'banner-title' }, title, h('span', { class: 'banner-count', text: S.loading ? '' : `${S.msgs.size}${S.hasOlder ? '+' : ''} ${S.msgs.size === 1 ? 'message' : 'messages'}` })),
      h('button', { type: 'button', class: 'btn small', 'data-action': 'back', text: 'Back to messages' }));
    els.banner.hidden = false;
  } else {
    els.banner.hidden = true;
  }
  $('#minimapWrap').hidden = f;
  queueMicrotask(() => minimapFollow()); // the minimap is set up further down this module
  document.querySelectorAll('.nav-item[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === S.view));
  updatePill();
}

function distanceFromBottom() {
  const s = els.scroller;
  return s.scrollHeight - s.scrollTop - s.clientHeight;
}

function updatePill() {
  const show = !filtered() && !S.loading && (S.hasNewer || S.unseen || distanceFromBottom() > els.scroller.clientHeight * 1.5);
  els.pill.hidden = !show;
}

// Scroll events arrive asynchronously, possibly after content has grown, so
// remember where *we* put the scroller and don't mistake that for the user.
let programmaticTop = -1;
function setScrollTop(top) {
  els.scroller.scrollTop = top;
  programmaticTop = els.scroller.scrollTop;
}

function scrollToBottom() {
  setScrollTop(els.scroller.scrollHeight);
  S.atBottom = true;
  S.unseen = false;
}

// ==================== loading ====================

async function fetchPage(extra) {
  const gen = S.gen;
  const d = await api('GET', `/api/messages?${pageParams(extra)}`);
  return gen === S.gen ? d : null;
}

function replaceAll(d) {
  S.msgs.clear();
  for (const m of d.messages) S.msgs.set(m.id, m);
  S.hasOlder = d.hasOlder;
  S.hasNewer = d.hasNewer;
}

async function loadLatest() {
  S.gen++;
  S.loading = true;
  try {
    const d = await fetchPage({});
    if (!d) return;
    S.loading = false;
    replaceAll(d);
    S.unseen = false;
    S.atBottom = !filtered();
    render();
    if (filtered()) setScrollTop(0); else scrollToBottom();
    fillViewport();
  } catch (e) {
    S.loading = false;
    if (e.message !== 'Signed out') toast(`Could not load messages: ${e.message}`);
  }
}

async function loadOlder() {
  if (!S.hasOlder || S.loadingOlder || S.loading || !S.msgs.size) return;
  S.loadingOlder = true;
  try {
    const d = await fetchPage({ before: Math.min(...S.msgs.keys()) });
    if (!d) return;
    const s = els.scroller;
    const prevHeight = s.scrollHeight;
    const prevTop = s.scrollTop;
    for (const m of d.messages) if (!S.msgs.has(m.id)) S.msgs.set(m.id, m);
    S.hasOlder = d.hasOlder;
    render();
    if (!filtered()) setScrollTop(prevTop + (s.scrollHeight - prevHeight));
  } catch {}
  finally { S.loadingOlder = false; }
  fillViewport();
}

async function loadNewer() {
  if (!S.hasNewer || S.loadingNewer || S.loading || !S.msgs.size) return;
  S.loadingNewer = true;
  try {
    const d = await fetchPage({ after: Math.max(...S.msgs.keys()) });
    if (!d) return;
    for (const m of d.messages) if (!S.msgs.has(m.id)) S.msgs.set(m.id, m);
    S.hasNewer = d.hasNewer;
    if (!S.hasNewer) S.unseen = false;
    render();
  } catch {}
  finally { S.loadingNewer = false; }
}

// Keep loading while the list doesn't fill the screen (or we're near the edge).
function fillViewport() {
  requestAnimationFrame(() => {
    const s = els.scroller;
    if (filtered()) {
      if (S.hasOlder && distanceFromBottom() < 400) loadOlder();
    } else {
      if (S.hasOlder && s.scrollTop < 400) loadOlder();
      else if (S.hasNewer && distanceFromBottom() < 400) loadNewer();
    }
  });
}

async function showView(view, q = '') {
  S.view = view;
  S.q = q;
  S.editingId = null;
  S.editDraft = null;
  S.msgs.clear();
  S.hasOlder = S.hasNewer = false;
  S.loading = true;
  render();
  closeDrawer();
  await loadLatest();
}

async function jumpTo(id) {
  closeDrawer();
  if (S.view !== 'dm' || !S.msgs.has(id)) {
    if (S.view === 'search') els.search.value = '';
    S.view = 'dm';
    S.q = '';
    S.editingId = null;
    S.gen++;
    S.loading = true;
    try {
      const d = await fetchPage({ around: id });
      if (!d) return;
      S.loading = false;
      replaceAll(d);
      S.atBottom = false;
      S.unseen = false;
      render();
    } catch (e) {
      S.loading = false;
      toast(`Could not load that message: ${e.message}`);
      return;
    }
  }
  const el = document.getElementById(`m${id}`);
  if (!el) {
    toast('That message no longer exists.');
    if (!S.msgs.size) loadLatest();
    return;
  }
  S.atBottom = false;
  el.scrollIntoView({ block: 'center' });
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 2600);
  S.atBottom = distanceFromBottom() < 60;
  updatePill();
  fillViewport();
}

// ==================== actions ====================

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', { class: 'sr-only' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

function confirmModal(title, text, okLabel = 'OK') {
  return new Promise((resolve) => {
    const ok = h('button', { type: 'button', class: 'btn danger', text: okLabel });
    const cancel = h('button', { type: 'button', class: 'btn', text: 'Cancel' });
    const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('h3', { text: title }), h('p', { text }), h('div', { class: 'modal-actions' }, cancel, ok));
    const prevFocus = document.activeElement;
    const done = (v) => {
      els.modal.hidden = true;
      els.modal.replaceChildren();
      document.removeEventListener('keydown', onKey, true);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
    };
    ok.addEventListener('click', () => done(true));
    cancel.addEventListener('click', () => done(false));
    els.modal.onclick = (e) => { if (e.target === els.modal) done(false); };
    document.addEventListener('keydown', onKey, true);
    els.modal.replaceChildren(box);
    els.modal.hidden = false;
    ok.focus();
  });
}

async function doDelete(id) {
  try {
    await api('DELETE', `/api/messages/${id}`);
    S.msgs.delete(id);
    if (S.editingId === id) { S.editingId = null; S.editDraft = null; }
    render();
  } catch (e) {
    toast(`Could not delete: ${e.message}`);
  }
}

async function patch(id, body) {
  try {
    const m = await api('PATCH', `/api/messages/${id}`, body);
    upsert(m);
    render();
    return m;
  } catch (e) {
    toast(`Could not update: ${e.message}`);
    return null;
  }
}

function startEdit(id) {
  const m = S.msgs.get(id);
  if (!m) return;
  S.editingId = id;
  S.editDraft = m.body;
  render();
  const ta = $('.edit-box textarea', els.list);
  if (!ta) return;
  autosize(ta);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  ta.closest('.msg').scrollIntoView({ block: 'nearest' });
}

function cancelEdit() {
  S.editingId = null;
  S.editDraft = null;
  render();
  if (!filtered() && !coarse) els.input.focus();
}

async function saveEdit() {
  const id = S.editingId;
  const m = S.msgs.get(id);
  if (!m) return cancelEdit();
  const text = (S.editDraft ?? '').trim();
  if (text === m.body) return cancelEdit();
  if (!text && !m.attachments.length) {
    if (await confirmModal('Delete message', 'Saving an empty message deletes it. Delete this message?', 'Delete')) {
      S.editingId = null;
      S.editDraft = null;
      await doDelete(id);
      if (!coarse) els.input.focus();
    }
    return;
  }
  S.editingId = null;
  S.editDraft = null;
  // Show the new text right away; the server copy replaces it.
  S.msgs.set(id, { ...m, body: text, edited_at: Date.now() });
  render();
  if (!filtered() && !coarse) els.input.focus();
  const saved = await patch(id, { body: text });
  if (!saved) { S.msgs.set(id, m); render(); }
}

function lastOwnMessage() {
  if (filtered() || !S.msgs.size) return null;
  return S.msgs.get(Math.max(...S.msgs.keys()));
}

function playYoutube(box) {
  const id = box.dataset.embed;
  if (!/^[\w-]{11}$/.test(id)) return;
  if (!canEmbedVideo) {
    const url = box.closest('.unfurl')?.dataset.url;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  const frame = h('iframe', {
    src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
    title: 'YouTube video',
    allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
    allowfullscreen: true,
    referrerpolicy: 'strict-origin-when-cross-origin',
  });
  box.replaceWith(h('div', { class: 'yt-frame' }, frame));
}

function openLightbox(src) {
  els.lightboxImg.src = src;
  els.lightboxOpen.href = src;
  els.lightboxOpen.hidden = !canOpenOriginal(src);
  els.lightbox.hidden = false;
}
function closeLightbox() {
  els.lightbox.hidden = true;
  els.lightboxImg.removeAttribute('src');
}

els.lightbox.addEventListener('click', (e) => { if (e.target !== els.lightboxOpen) closeLightbox(); });

els.list.addEventListener('click', async (e) => {
  const actionEl = e.target.closest('[data-action]');
  const msgEl = e.target.closest('.msg');
  const id = msgEl?.dataset.id ? Number(msgEl.dataset.id) : null;
  const m = id ? S.msgs.get(id) : null;

  if (actionEl) {
    const action = actionEl.dataset.action;
    switch (action) {
      case 'jump': e.preventDefault(); if (id) jumpTo(id); break;
      case 'pin': if (m) { await patch(id, { pinned: !m.pinned }); toast(m.pinned ? 'Unpinned' : 'Pinned'); } break;
      case 'copy': if (m) { await copyText(m.body); toast('Copied text'); } break;
      case 'copylink': if (id) { await copyText(messageLink(id)); toast('Copied link'); } break;
      case 'category': if (m) openCategoryMenu(actionEl, m); break;
      case 'edit': if (id) startEdit(id); break;
      case 'delete':
        if (id && await confirmModal('Delete message', 'Are you sure you want to delete this message? This can’t be undone.', 'Delete')) await doDelete(id);
        break;
      case 'edit-cancel': cancelEdit(); break;
      case 'edit-save': saveEdit(); break;
      case 'hide-preview': if (id) await patch(id, { hide_preview: actionEl.dataset.url }); break;
      case 'lightbox': e.preventDefault(); openLightbox(actionEl.dataset.src); break;
      case 'play-yt': playYoutube(actionEl); break;
      case 'retry': {
        const t = S.temps.find((x) => String(x.tempId) === msgEl?.dataset.temp);
        if (t) postTemp(t);
        break;
      }
    }
    return;
  }
  // Touch: tap a message to show its toolbar.
  if (coarse && msgEl && !e.target.closest('a, button, video, audio, textarea, iframe, input, .yt')) {
    const was = msgEl.classList.contains('show-tools');
    els.list.querySelectorAll('.msg.show-tools').forEach((x) => x.classList.remove('show-tools'));
    if (!was) msgEl.classList.add('show-tools');
  }
});
els.list.addEventListener('keydown', (e) => {
  const yt = e.target.closest?.('.yt');
  if (yt && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); playYoutube(yt); }
});

els.banner.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="back"]')) {
    els.search.value = '';
    showView('dm');
  }
});

// Broken remote images: inline onerror is blocked by CSP, so listen in capture phase.
document.addEventListener('error', (e) => {
  const t = e.target;
  if (!(t instanceof HTMLImageElement)) return;
  if (t.classList.contains('unfurl-favicon')) t.remove();
  else if (t.classList.contains('unfurl-img')) t.closest('.unfurl')?.classList.add('broken-img');
  else if (t.closest('.yt')) t.remove();
}, true);

// ==================== composer ====================

function autosize(ta) {
  ta.style.height = 'auto';
  const max = Math.round(window.innerHeight * 0.45);
  const h2 = Math.min(ta.scrollHeight, max);
  ta.style.height = `${h2}px`;
  ta.classList.toggle('scrolling', ta.scrollHeight > max);
}

function insideFence(ta) {
  const before = ta.value.slice(0, ta.selectionStart);
  return ((before.match(/```/g) || []).length % 2) === 1;
}

function insertText(ta, text, start, end) {
  ta.focus();
  ta.setSelectionRange(start, end);
  let ok = false;
  try { ok = document.execCommand('insertText', false, text); } catch {}
  if (!ok) {
    ta.setRangeText(text, start, end, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function wrapSelection(ta, before, after = before) {
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  const sel = ta.value.slice(s, e);
  insertText(ta, before + sel + after, s, e);
  if (sel) ta.setSelectionRange(s + before.length, s + before.length + sel.length);
  else ta.setSelectionRange(s + before.length, s + before.length);
}

function prefixLines(ta, prefix) {
  const v = ta.value;
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  const ls = v.lastIndexOf('\n', s - 1) + 1;
  let le = v.indexOf('\n', e);
  if (le < 0) le = v.length;
  const lines = v.slice(ls, le).split('\n');
  const all = lines.every((l) => l.startsWith(prefix));
  const block = lines.map((l) => (all ? l.slice(prefix.length) : prefix + l)).join('\n');
  insertText(ta, block, ls, le);
  if (s === e) ta.setSelectionRange(ls + block.length, ls + block.length);
  else ta.setSelectionRange(ls, ls + block.length);
}

function applyFormat(kind, ta = els.input) {
  switch (kind) {
    case 'bold': return wrapSelection(ta, '*');
    case 'italic': return wrapSelection(ta, '_');
    case 'strike': return wrapSelection(ta, '~');
    case 'code': return wrapSelection(ta, '`');
    case 'codeblock': {
      const s = ta.selectionStart;
      const needNl = s > 0 && ta.value[s - 1] !== '\n';
      return wrapSelection(ta, `${needNl ? '\n' : ''}\`\`\`\n`, '\n```');
    }
    case 'quote': return prefixLines(ta, '> ');
    case 'bullets': return prefixLines(ta, '- ');
  }
}

const fmtBar = $('#fmtBar');
fmtBar.querySelectorAll('.fmt').forEach((b) => { b.innerHTML = icon(b.dataset.fmt, 16); });
fmtBar.addEventListener('mousedown', (e) => { if (e.target.closest('.fmt')) e.preventDefault(); });
fmtBar.addEventListener('click', (e) => {
  const b = e.target.closest('.fmt');
  if (b) applyFormat(b.dataset.fmt);
});

const DRAFT_KEY = 'jotzone:draft';
let draftTimer;
function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    if (els.input.value) storage('set', DRAFT_KEY, els.input.value); else storage('del', DRAFT_KEY);
  }, 250);
}

function updateSend() {
  const uploading = S.uploads.some((u) => u.status === 'uploading');
  const ready = S.uploads.some((u) => u.status === 'done');
  els.send.disabled = uploading || !(els.input.value.trim() || ready);
  els.hint.textContent = uploading ? 'Uploading…' : coarse ? '' : 'Return to send · Shift+Return for new line';
}

els.input.addEventListener('input', () => { autosize(els.input); updateSend(); saveDraft(); });
els.input.addEventListener('keydown', (e) => {
  if (e.isComposing || e.keyCode === 229) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && !e.shiftKey && (e.key === 'b' || e.key === 'i')) { e.preventDefault(); applyFormat(e.key === 'b' ? 'bold' : 'italic'); return; }
  if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !mod) {
    if (coarse || insideFence(els.input)) return; // newline
    e.preventDefault();
    send();
    return;
  }
  if (e.key === 'Enter' && mod) { e.preventDefault(); send(); return; }
  if (e.key === 'ArrowUp' && !els.input.value && !mod && !e.shiftKey) {
    const last = lastOwnMessage();
    if (last) { e.preventDefault(); startEdit(last.id); }
  }
});
els.send.addEventListener('click', () => send());

async function send() {
  const body = els.input.value.trim();
  if (S.uploads.some((u) => u.status === 'uploading')) { toast('Wait for uploads to finish'); return; }
  const ups = S.uploads.filter((u) => u.status === 'done');
  if (!body && !ups.length) return;
  if (body.length > 40000) { toast('Messages are limited to 40,000 characters'); return; }
  if (S.view !== 'dm' || S.hasNewer) {
    if (S.view !== 'dm') { els.search.value = ''; S.view = 'dm'; S.q = ''; }
    await loadLatest();
  }
  const temp = {
    tempId: ++S.seq, body, created_at: Date.now(), edited_at: null, pinned: false,
    attachments: ups.map((u) => u.server), previews: [], pending: true, failed: false,
  };
  S.temps.push(temp);
  els.input.value = '';
  autosize(els.input);
  storage('del', DRAFT_KEY);
  clearUploads();
  updateSend();
  S.atBottom = true;
  render();
  scrollToBottom();
  postTemp(temp);
}

async function postTemp(t) {
  t.pending = true;
  t.failed = false;
  render();
  try {
    const m = await api('POST', '/api/messages', { body: t.body, attachment_ids: t.attachments.map((a) => a.id) });
    dropTemp(t);
    upsert(m);
    render();
  } catch (e) {
    if (!S.temps.includes(t)) return;
    t.pending = false;
    t.failed = true;
    render();
  }
}

// ----- uploads -----

function addFiles(fileList) {
  const files = [...fileList].filter((f) => f && f.size >= 0);
  if (!files.length) return;
  if (S.view !== 'dm') { els.search.value = ''; showView('dm'); }
  for (const f of files) {
    const name = f.name || `pasted-${new Date().toISOString().replace(/[:.]/g, '-')}.${(f.type.split('/')[1] || 'bin').replace('jpeg', 'jpg')}`;
    const u = { key: ++S.seq, file: f, name, progress: 0, status: 'uploading', server: null, error: '', thumb: isInlineImage(f.type) ? localThumb(f) : null };
    S.uploads.push(u);
    startUpload(u);
  }
  renderChips();
  updateSend();
  if (!coarse) els.input.focus();
}

function startUpload(u) {
  const up = upload(u.file, {
    name: u.name,
    onProgress: (p) => {
      u.progress = p;
      const bar = els.chips.querySelector(`[data-key="${u.key}"] .chip-bar`);
      if (bar) bar.style.width = `${Math.round(u.progress * 100)}%`;
      const sub = els.chips.querySelector(`[data-key="${u.key}"] .chip-sub`);
      if (sub) sub.textContent = `Uploading… ${Math.round(u.progress * 100)}%`;
    },
  });
  u.abort = up.abort;
  up.promise.then((server) => {
    u.server = server;
    u.status = 'done';
    if (!u.thumb) u.thumb = uploadedThumb(server);
  }, (e) => {
    u.status = 'error';
    u.error = e.message;
  }).then(() => {
    renderChips();
    updateSend();
  });
}

function removeUpload(key) {
  const i = S.uploads.findIndex((u) => u.key === key);
  if (i < 0) return;
  const [u] = S.uploads.splice(i, 1);
  if (u.status === 'uploading') u.abort?.();
  if (u.thumb) releaseThumb(u.thumb);
  renderChips();
  updateSend();
}

function clearUploads() {
  for (const u of S.uploads) if (u.thumb) setTimeout(() => releaseThumb(u.thumb), 30000);
  S.uploads = [];
  renderChips();
}

function renderChips() {
  els.chips.hidden = !S.uploads.length;
  els.chips.replaceChildren(...S.uploads.map((u) => {
    const { ext, kind } = extInfo(u.name, u.file.type || '');
    const sub = u.status === 'uploading' ? `Uploading… ${Math.round(u.progress * 100)}%` : u.status === 'error' ? u.error : humanSize(u.file.size);
    const chip = h('div', { class: `chip ${u.status}`, 'data-key': u.key, title: u.name },
      u.thumb ? h('img', { class: 'chip-thumb', src: u.thumb, alt: '' }) : h('span', { class: `ext k-${kind}`, text: ext }),
      h('span', { class: 'chip-meta' }, h('span', { class: 'chip-name', text: u.name }), h('span', { class: 'chip-sub', text: sub })),
      h('button', { type: 'button', class: 'chip-x', 'data-remove': u.key, title: 'Remove', 'aria-label': `Remove ${u.name}`, text: '×' }),
      h('span', { class: 'chip-bar' }));
    chip.querySelector('.chip-bar').style.width = `${Math.round(u.progress * 100)}%`;
    return chip;
  }));
}
els.chips.addEventListener('click', (e) => {
  const b = e.target.closest('[data-remove]');
  if (b) removeUpload(Number(b.dataset.remove));
});

els.attach.innerHTML = icon('plus', 16);
els.send.innerHTML = icon('send', 18);
els.attach.addEventListener('click', () => els.file.click());
els.file.addEventListener('change', () => { addFiles(els.file.files); els.file.value = ''; });

els.input.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length && !e.clipboardData.getData('text/plain')) {
    e.preventDefault();
    addFiles(files);
  }
});

let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
els.main.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; els.drop.hidden = false; });
els.main.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
els.main.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) els.drop.hidden = true; });
els.main.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  els.drop.hidden = true;
  addFiles(e.dataTransfer.files);
});
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', (e) => { if (hasFiles(e)) e.preventDefault(); });

// ==================== scrolling ====================

els.scroller.addEventListener('scroll', () => {
  if (programmaticTop >= 0 && Math.abs(els.scroller.scrollTop - programmaticTop) < 2) { updatePill(); return; }
  programmaticTop = -1;
  const dist = distanceFromBottom();
  S.atBottom = dist < 60;
  if (S.atBottom && !S.hasNewer) S.unseen = false;
  if (filtered()) {
    if (dist < 400) loadOlder();
  } else {
    if (els.scroller.scrollTop < 400) loadOlder();
    if (dist < 400 && S.hasNewer) loadNewer();
  }
  updatePill();
}, { passive: true });

// Stay pinned to the bottom while images/previews load or the composer grows.
const ro = new ResizeObserver(() => {
  if (S.atBottom && !filtered() && !S.hasNewer) setScrollTop(els.scroller.scrollHeight);
  updatePill();
});
ro.observe(els.list);
ro.observe(els.scroller);

els.pill.addEventListener('click', () => {
  if (S.hasNewer) loadLatest();
  else { els.scroller.scrollTo({ top: els.scroller.scrollHeight, behavior: 'smooth' }); S.unseen = false; S.atBottom = true; updatePill(); }
});

// ==================== search & navigation ====================

let searchTimer;
function runSearch() {
  clearTimeout(searchTimer);
  const q = els.search.value.trim();
  if (!q) { if (S.view === 'search') showView('dm'); return; }
  if (S.view === 'search' && S.q === q) return;
  showView('search', q);
}
els.search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 300); });
els.search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); runSearch(); if (coarse) els.search.blur(); }
  else if (e.key === 'Escape') {
    e.preventDefault();
    els.search.value = '';
    clearTimeout(searchTimer);
    if (S.view === 'search') showView('dm');
    els.search.blur();
  }
});
$('.search-icon').innerHTML = icon('search', 15);
$('#searchKbd').textContent = isMac ? '⌘K' : 'Ctrl K';

document.querySelectorAll('[data-icon]').forEach((n) => { n.innerHTML = icon(n.dataset.icon, 16); });
function goHome() {
  els.search.value = '';
  if (S.view === 'dm') { closeDrawer(); if (S.hasNewer) loadLatest(); else scrollToBottom(); return; }
  showView('dm');
}
// Delegated: category items are generated from the server's counts.
$('.nav').addEventListener('click', (e) => {
  const b = e.target.closest('.nav-item[data-view]');
  if (!b) return;
  const v = b.dataset.view;
  if (v === 'dm') return goHome();
  els.search.value = '';
  showView(v);
});
$('#homeBtn').addEventListener('click', goHome);

// ==================== sidebar counts & categories ====================

const catNav = $('#catNav');
let sidebarTimer = 0;
const fmtCount = (n) => (n > 999 ? `${(n / 1000).toFixed(n > 9999 ? 0 : 1)}k` : String(n));

async function refreshSidebar() {
  let d;
  try { d = await api('GET', '/api/sidebar'); } catch { return; }
  categoryLabels = Object.fromEntries(d.labels.map((c) => [c.key, c.label]));
  const counts = { all: d.all, ...d.sources };
  document.querySelectorAll('.nav-count[data-count]').forEach((n) => {
    const v = counts[n.dataset.count] || 0;
    n.textContent = v ? fmtCount(v) : '';
    n.closest('.nav-item').classList.toggle('is-empty', !v && n.dataset.count !== 'all');
  });
  $('#smartBadge').hidden = !d.smart;
  // Categories with at least one message, biggest first, "Other" last.
  const cats = d.labels.filter((c) => d.categories[c.key])
    .sort((a, b) => (a.key === 'other') - (b.key === 'other') || d.categories[b.key] - d.categories[a.key]);
  catNav.replaceChildren(...cats.map((c, i) => h('button', { class: `nav-item${S.view === `cat:${c.key}` ? ' active' : ''}`, type: 'button', 'data-view': `cat:${c.key}` },
    h('span', { class: `nav-icon cat-dot cat-${d.labels.findIndex((x) => x.key === c.key)}` }),
    h('span', { class: 'nav-label', text: c.label }),
    h('span', { class: 'nav-count', text: fmtCount(d.categories[c.key]) }))));
  if (!cats.length) catNav.replaceChildren(h('div', { class: 'nav-hint', text: 'Categories appear here as you save things.' }));
  if (S.view.startsWith('cat:')) updateChrome();
}
function sidebarChanged() {
  clearTimeout(sidebarTimer);
  sidebarTimer = setTimeout(() => { refreshSidebar(); loadMinimap(); }, 800);
}

// ==================== minimap ====================

const minimapWrap = $('#minimapWrap');
// First and last message ids at least partly on screen.
function visibleRange() {
  const box = els.scroller.getBoundingClientRect();
  let first = null, last = null;
  for (const el of els.list.querySelectorAll('.msg[data-id]')) {
    const r = el.getBoundingClientRect();
    if (r.bottom < box.top + 4) continue;
    if (r.top > box.bottom - 4) break;
    const id = Number(el.dataset.id);
    if (first === null) first = id;
    last = id;
  }
  return first === null ? null : [first, last];
}
// Live scrubbing from the minimap, like VS Code: keep the point under the
// drag centred in the list, fetching that stretch of history when it isn't
// loaded yet (one request at a time, always for the latest target).
let scrub = null;
let scrubLoading = false;
function placeScrub() {
  const el = scrub && document.getElementById(`m${scrub.id}`);
  if (!el) return false;
  const s = els.scroller;
  const top = el.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop;
  setScrollTop(top + scrub.frac * el.offsetHeight - s.clientHeight / 2);
  S.atBottom = distanceFromBottom() < 60;
  updatePill();
  return true;
}
// Load more in the direction of travel before the drag reaches the edge of
// what's loaded, so the list extends instead of being rebuilt.
const SCRUB_MARGIN = 25;
function scrubPrefetch(id) {
  const ids = [...S.msgs.keys()].sort((a, b) => a - b);
  const i = ids.indexOf(id);
  if (i < 0) return;
  if (i < SCRUB_MARGIN && S.hasOlder) loadOlder();
  if (ids.length - 1 - i < SCRUB_MARGIN && S.hasNewer) loadNewer();
}
async function scrubTo(id, frac) {
  scrub = { id, frac, ended: false };
  if (S.view !== 'dm') return;
  if (placeScrub()) { if (!scrubLoading) scrubPrefetch(id); return; }
  if (scrubLoading) return;
  scrubLoading = true;
  try {
    while (scrub && !document.getElementById(`m${scrub.id}`)) {
      const target = scrub.id;
      S.gen++;
      const d = await fetchPage({ around: target, limit: 150 });
      if (!d) break;
      S.loading = false;
      replaceAll(d);
      S.unseen = false;
      render();
      if (!document.getElementById(`m${target}`)) break; // deleted meanwhile
    }
  } catch {} finally { scrubLoading = false; }
  placeScrub();
  if (scrub && scrub.ended) finishScrub();
}
function finishScrub() {
  scrub = null;
  S.atBottom = distanceFromBottom() < 60;
  fillViewport();
  updatePill();
}
// Released (e.g. a quick click): if that stretch is still loading, finish
// once it lands so the list still ends up where the click pointed.
function scrubEnd() {
  if (scrubLoading && scrub) { scrub.ended = true; return; }
  finishScrub();
}
const minimap = createMinimap({
  canvas: $('#minimap'),
  tip: $('#minimapTip'),
  getVisible: visibleRange,
  onScrub: scrubTo,
  onScrubEnd: scrubEnd,
  onWheel: (dy) => els.scroller.scrollBy({ top: dy }),
});
window.__minimap = minimap; // read by the browser tests
let minimapRaf = 0;
function minimapFollow() {
  if (minimapRaf || minimapWrap.hidden) return;
  minimapRaf = requestAnimationFrame(() => { minimapRaf = 0; measureForMinimap(); minimap.updateView(); });
}
// Real heights of rendered messages, each including the gap and any day
// divider above it, so the minimap matches the list exactly where it can.
function measureForMinimap() {
  if (S.view !== 'dm') return;
  // Each message's block runs from its day divider (if it has one) to the
  // top of whatever comes next, matching the minimap's estimate.
  const kids = [...els.list.children];
  const tops = kids.map((el) => el.getBoundingClientRect().top);
  const map = new Map();
  kids.forEach((el, i) => {
    if (!el.matches('.msg[data-id]') || i === kids.length - 1) return;
    const start = i > 0 && kids[i - 1].classList.contains('day') ? tops[i - 1] : tops[i];
    map.set(Number(el.dataset.id), tops[i + 1] - start);
  });
  if (map.size) minimap.setMeasured(map);
}
async function loadMinimap() {
  try { minimap.load(await api('GET', '/api/minimap')); } catch {}
}
els.scroller.addEventListener('scroll', minimapFollow, { passive: true });
// Images loading mid-drag change heights: keep the scrub point steady.
new ResizeObserver(() => { if (scrub) placeScrub(); minimapFollow(); }).observe(els.list);

// Category picker from the message toolbar.
let catMenu = null;
function closeCategoryMenu() {
  if (catMenu) { catMenu.remove(); catMenu = null; }
}
function openCategoryMenu(anchor, m) {
  closeCategoryMenu();
  const keys = Object.keys(categoryLabels);
  catMenu = h('div', { class: 'cat-menu', role: 'menu', 'aria-label': 'Set category' },
    h('div', { class: 'cat-menu-title', text: m.category_source === 'manual' ? 'Category (set by you)' : 'Category' }),
    ...keys.map((k, i) => h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(m.category === k), class: `cat-menu-item${m.category === k ? ' on' : ''}`, 'data-cat': k },
      h('span', { class: `cat-dot cat-${i}` }), h('span', { text: categoryLabels[k] }))));
  document.body.append(catMenu);
  const r = anchor.getBoundingClientRect();
  const mr = catMenu.getBoundingClientRect();
  catMenu.style.left = `${Math.max(8, Math.min(r.right - mr.width, innerWidth - mr.width - 8))}px`;
  catMenu.style.top = `${r.bottom + 6 + mr.height > innerHeight ? Math.max(8, r.top - mr.height - 6) : r.bottom + 6}px`;
  catMenu.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    closeCategoryMenu();
    const updated = await patch(m.id, { category: b.dataset.cat });
    if (updated) toast(`Moved to ${categoryLabels[b.dataset.cat]}`);
  });
  catMenu.querySelector('.on, button').focus();
}
document.addEventListener('pointerdown', (e) => { if (catMenu && !catMenu.contains(e.target) && !e.target.closest('[data-action="category"]')) closeCategoryMenu(); });

$('#logoutBtn').addEventListener('click', () => signOut());
bindExport($('.sidebar-foot a[download]'));

// mobile drawer
const menuBtn = $('#menuBtn');
menuBtn.innerHTML = icon('menu', 20);
function closeDrawer() { document.body.classList.remove('drawer-open'); }
menuBtn.addEventListener('click', () => document.body.classList.toggle('drawer-open'));
els.scrim.addEventListener('click', closeDrawer);

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    els.search.focus();
    els.search.select();
    return;
  }
  if (e.key === 'Escape') {
    if (catMenu) { closeCategoryMenu(); return; }
    if (!els.lightbox.hidden) { closeLightbox(); return; }
    if (document.body.classList.contains('drawer-open')) { closeDrawer(); return; }
    if (G.open && narrow()) { setGraphOpen(false); return; }
  }
  // Typing anywhere lands in the composer, like Slack.
  const t = e.target;
  const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable;
  if (!typing && !mod && !e.altKey && e.key.length === 1 && !filtered() && els.modal.hidden && els.lightbox.hidden && !coarse) {
    els.input.focus();
  }
});

window.addEventListener('hashchange', () => {
  const m = location.hash.match(/^#m(\d+)$/);
  if (m) {
    history.replaceState(null, '', location.pathname + location.search);
    jumpTo(Number(m[1]));
  }
});

// ==================== graph view ====================

const G = {
  panel: $('#graphPanel'), btn: $('#graphBtn'), stats: $('#graphStats'), empty: $('#graphEmpty'),
  graph: null, open: false, timer: 0, gen: 0,
};
const narrow = () => matchMedia('(max-width: 760px)').matches;

function graphKinds() {
  return [...document.querySelectorAll('.graph-chip.on')].map((b) => b.dataset.kind);
}

function graphStatus(data) {
  const st = G.graph.stats();
  const parts = [`${st.notes} ${st.notes === 1 ? 'message' : 'messages'}`, `${st.edges} ${st.edges === 1 ? 'connection' : 'connections'}`];
  if (data && data.total > data.limit) parts.push(`latest ${data.limit} shown`);
  G.stats.textContent = parts.join(' · ');
  if (!st.notes) G.empty.textContent = 'Nothing saved yet. Your messages will show up here as dots.';
  else if (!st.edges) G.empty.textContent = 'No connections yet. Messages connect when they link to the same website, share a #tag, or use similar words.';
  G.empty.hidden = !!st.edges;
}

async function loadGraph() {
  const gen = ++G.gen;
  try {
    const data = await api('GET', '/api/graph');
    if (gen !== G.gen || !G.open) return;
    G.lastData = data;
    G.graph.load(data);
    graphStatus(data);
  } catch (e) {
    if (G.open) toast(`Could not load the graph: ${e.message}`);
  }
}

function setGraphOpen(open) {
  G.open = open;
  G.panel.hidden = !open;
  els.app.classList.toggle('graph-open', open);
  G.btn.setAttribute('aria-pressed', String(open));
  storage(open ? 'set' : 'del', 'jotzone:graph', '1');
  if (open) {
    if (!G.graph) {
      G.graph = createGraph({
        canvas: $('#graphCanvas'),
        tip: $('#graphTip'),
        onOpenNote: (id) => {
          if (narrow()) setGraphOpen(false);
          jumpTo(id);
        },
      });
    }
    window.__graph = G.graph; // read by the browser tests
    G.graph.resize();
    loadGraph();
  } else {
    clearTimeout(G.timer);
  }
}

// Messages changed somewhere: refresh after things go quiet.
function graphChanged() {
  if (!G.open) return;
  clearTimeout(G.timer);
  G.timer = setTimeout(loadGraph, 1200);
}

G.btn.addEventListener('click', () => setGraphOpen(!G.open));
$('#graphClose').addEventListener('click', () => setGraphOpen(false));
$('#graphFit').addEventListener('click', () => G.graph && G.graph.fit());
document.querySelectorAll('.graph-chip').forEach((b) => b.addEventListener('click', () => {
  b.classList.toggle('on');
  b.setAttribute('aria-pressed', String(b.classList.contains('on')));
  if (G.graph) { G.graph.setKinds(graphKinds()); graphStatus(G.lastData); }
}));

// #tag in a message: search for it.
els.list.addEventListener('click', (e) => {
  const a = e.target.closest('a.tag');
  if (!a) return;
  e.preventDefault();
  e.stopPropagation();
  els.search.value = `#${a.dataset.tag}`;
  runSearch();
}, true);

// ==================== realtime ====================

let everOpened = false;
function connect() {
  openEvents({
    onOpen() {
      if (everOpened && S.view === 'dm' && S.atBottom && !S.hasNewer && S.editingId == null) loadLatest();
      everOpened = true;
    },
    onMessage(m) {
      if (!m || typeof m.id !== 'number') return;
      if (!S.msgs.has(m.id)) {
        const t = S.temps.find((x) => !x.failed && x.body === m.body && sameAttachments(x.attachments, m.attachments));
        if (t) dropTemp(t);
      }
      if (upsert(m) || S.temps.length) render();
      graphChanged();
      sidebarChanged();
    },
    onDelete(d) {
      if (S.msgs.delete(d.id)) {
        if (S.editingId === d.id) { S.editingId = null; S.editDraft = null; }
        render();
      }
      graphChanged();
      sidebarChanged();
    },
  });
}

// ==================== playful touches ====================

window.__rolling = initRollingLists(els.list); // exposed for the browser tests

// ==================== iOS keyboard ====================

// iOS Safari keeps the layout viewport full height when the keyboard opens
// and scrolls the page instead, pushing the header off screen. Size the app
// to the visible area and keep the page itself at the top.
if (window.visualViewport) {
  const vv = window.visualViewport;
  let lastH = 0;
  const fit = () => {
    const h = Math.round(vv.height);
    if (h !== lastH) {
      const wasBottom = S.atBottom;
      lastH = h;
      document.documentElement.style.setProperty('--vvh', `${h}px`);
      if (wasBottom && !filtered()) requestAnimationFrame(scrollToBottom);
    }
    if (window.scrollY || vv.offsetTop) window.scrollTo(0, 0);
  };
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', fit);
  fit();
}

// ==================== boot ====================

function prefillFromQuery() {
  const p = new URLSearchParams(location.search);
  const title = (p.get('title') || '').trim();
  const text = (p.get('text') || '').trim();
  const url = (p.get('url') || '').trim();
  if (!title && !text && !url) return false;
  const parts = [];
  if (title && !text.includes(title)) parts.push(title);
  if (text) parts.push(text);
  if (url && !text.includes(url)) parts.push(url);
  const s = parts.join('\n');
  els.input.value = els.input.value ? `${els.input.value}\n${s}` : s;
  history.replaceState(null, '', location.pathname + location.hash);
  return true;
}

async function boot() {
  if (coarse) els.hint.textContent = '';
  const draft = storage('get', DRAFT_KEY);
  if (draft) els.input.value = draft;
  const prefilled = prefillFromQuery();
  autosize(els.input);
  updateSend();
  if (prefilled) saveDraft();

  try {
    const me = await api('GET', '/api/me');
    S.name = me.name || 'Me';
  } catch {}
  document.querySelectorAll('.me-name').forEach((n) => { n.textContent = S.name; });
  document.querySelectorAll('.sidebar .avatar').forEach((n) => { n.textContent = initial(S.name); });

  const hash = location.hash.match(/^#m(\d+)$/);
  if (hash) {
    history.replaceState(null, '', location.pathname + location.search);
    S.loading = true;
    await jumpTo(Number(hash[1]));
    if (!S.msgs.size) await loadLatest();
  } else {
    await loadLatest();
  }
  connect();
  refreshSidebar();
  loadMinimap();
  if (storage('get', 'jotzone:graph') && !narrow()) setGraphOpen(true);
  if (!coarse || prefilled) {
    els.input.focus();
    const n = els.input.value.length;
    els.input.setSelectionRange(n, n);
  }
}

boot();
