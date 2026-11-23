// Builds the graph view: messages connected by the websites they link to,
// the #tags they share, and similar wording (TF-IDF cosine). Pure function,
// no database access, so it is easy to test.
import { findLinks, extractUrls, findTags } from '../urls.js';

export { findTags };

const SIM_NEIGHBOURS = 3;
const SIM_MIN = 0.15;

const STOP = new Set((
  'a about above after again against all also am an and any are as at be because been before being below between both but by ' +
  'can could did do does doing down during each few for from further get got had has have having he her here hers him his how ' +
  'i if in into is it its itself just let like me more most my myself no nor not now of off on once only or other our ours out ' +
  'over own really same she should so some such than that the their them then there these they this those through to too under ' +
  'until up very was we were what when where which while who whom why will with would you your yours yourself thing things ' +
  'one two make made much many maybe need want way well yes yeah okay ok gonna lot via www http https com org net html'
).split(' '));

export function siteOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
}

function stem(w) {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

function stripLinks(text) {
  let out = '';
  let at = 0;
  for (const l of findLinks(text)) { out += text.slice(at, l.index) + ' '; at = l.index + l.text.length; }
  return out + text.slice(at);
}

export function tokenize(text) {
  const words = stripLinks(String(text || '')).toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
  const out = [];
  for (let w of words) {
    w = w.replace(/'s$|'/g, '');
    if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w)) continue;
    out.push(stem(w));
  }
  return out;
}

// Readable one-line label: links shown as their site.
function snippet(text, max) {
  let s = String(text || '');
  for (const l of findLinks(s).reverse()) s = s.slice(0, l.index) + (siteOf(l.url) || l.text) + s.slice(l.index + l.text.length);
  s = s.replace(/[*_~`>]/g, '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/**
 * messages: [{ id, body, created_at, pinned, files }] (files = attachment count)
 * previews: Map url -> { title, description }
 * Returns { nodes, edges, groups }.
 */
export function buildGraph(messages, previews = new Map()) {
  const notes = messages.map((m) => {
    const urls = extractUrls(m.body);
    const extra = urls.map((u) => { const p = previews.get(u); return p ? `${p.title || ''} ${p.description || ''}` : ''; }).join(' ');
    const sites = [...new Set(urls.map(siteOf).filter(Boolean))];
    const tags = findTags(m.body);
    let label = snippet(m.body, 80);
    if (!label && urls.length) label = previews.get(urls[0])?.title || sites[0] || '';
    if (!label && m.files) label = m.files === 1 ? 'File' : `${m.files} files`;
    return {
      m, sites, tags,
      terms: tokenize(`${m.body} ${extra} ${tags.join(' ')}`),
      label: label || 'Message',
    };
  });

  const nodes = [];
  const edges = [];
  const index = new Map();
  const addNode = (n) => { index.set(n.id, nodes.length); nodes.push(n); return n; };

  for (const n of notes) {
    addNode({ id: `m${n.m.id}`, kind: 'note', mid: n.m.id, label: n.label, text: snippet(n.m.body, 280), ts: n.m.created_at, pinned: !!n.m.pinned, files: n.m.files || 0, group: null });
  }

  // Hubs: a site or tag shared by two or more messages.
  const hubs = (kind, key, prefix) => {
    const count = new Map();
    for (const n of notes) for (const k of n[key]) count.set(k, (count.get(k) || 0) + 1);
    for (const [k, c] of count) {
      if (c < 2) continue;
      addNode({ id: `${prefix}:${k}`, kind, label: kind === 'tag' ? `#${k}` : k, count: c, group: null });
    }
    for (const n of notes) for (const k of n[key]) {
      if (index.has(`${prefix}:${k}`)) edges.push({ s: `m${n.m.id}`, t: `${prefix}:${k}`, kind, w: 1 });
    }
  };
  hubs('site', 'sites', 's');
  hubs('tag', 'tags', 't');

  // Similar wording: TF-IDF vectors, cosine, top neighbours above a floor.
  const N = notes.length;
  const df = new Map();
  for (const n of notes) for (const t of new Set(n.terms)) df.set(t, (df.get(t) || 0) + 1);
  const tooCommon = N >= 10 ? N * 0.5 : Infinity;
  const vecs = notes.map((n) => {
    const tf = new Map();
    for (const t of n.terms) tf.set(t, (tf.get(t) || 0) + 1);
    const v = new Map();
    let norm = 0;
    for (const [t, c] of tf) {
      const d = df.get(t);
      if (d > tooCommon) continue;
      const w = (1 + Math.log(c)) * Math.log(1 + N / d);
      v.set(t, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of v) v.set(t, w / norm);
    return v;
  });
  const postings = new Map();
  vecs.forEach((v, i) => { for (const [t, w] of v) if (df.get(t) >= 2) { if (!postings.has(t)) postings.set(t, []); postings.get(t).push([i, w]); } });
  const simKeys = new Set();
  vecs.forEach((v, i) => {
    const dot = new Map();
    for (const [t, w] of v) for (const [j, wj] of postings.get(t) || []) if (j !== i) dot.set(j, (dot.get(j) || 0) + w * wj);
    const best = [...dot].filter(([, s]) => s >= SIM_MIN).sort((a, b) => b[1] - a[1]).slice(0, SIM_NEIGHBOURS);
    for (const [j, s] of best) {
      const a = Math.min(i, j), b = Math.max(i, j);
      const key = `${a}-${b}`;
      if (simKeys.has(key)) continue;
      simKeys.add(key);
      edges.push({ s: `m${notes[a].m.id}`, t: `m${notes[b].m.id}`, kind: 'sim', w: Math.round(s * 100) / 100 });
    }
  });

  // Groups: weighted label propagation, deterministic order.
  const adj = nodes.map(() => []);
  for (const e of edges) {
    const a = index.get(e.s), b = index.get(e.t);
    const w = e.kind === 'sim' ? e.w * 2 : 1;
    adj[a].push([b, w]); adj[b].push([a, w]);
  }
  const label = nodes.map((_, i) => i);
  for (let round = 0; round < 12; round++) {
    let changed = false;
    for (let i = 0; i < nodes.length; i++) {
      if (!adj[i].length) continue;
      const score = new Map();
      for (const [j, w] of adj[i]) score.set(label[j], (score.get(label[j]) || 0) + w);
      let bestL = label[i], bestS = -1;
      for (const [l, s] of score) if (s > bestS || (s === bestS && l < bestL)) { bestL = l; bestS = s; }
      if (bestL !== label[i]) { label[i] = bestL; changed = true; }
    }
    if (!changed) break;
  }

  // Keep groups with 2+ messages; name each by its hub or its strongest word.
  const members = new Map();
  nodes.forEach((n, i) => { if (!members.has(label[i])) members.set(label[i], []); members.get(label[i]).push(i); });
  const groups = [];
  for (const idx of members.values()) {
    const noteIdx = idx.filter((i) => nodes[i].kind === 'note');
    if (noteIdx.length < 2) continue;
    const hub = idx.filter((i) => nodes[i].kind !== 'note').sort((a, b) => adj[b].length - adj[a].length)[0];
    let name = hub !== undefined ? nodes[hub].label : null;
    if (!name) {
      const sum = new Map();
      for (const i of noteIdx) for (const [t, w] of vecs[i]) if (df.get(t) >= 2) sum.set(t, (sum.get(t) || 0) + w);
      name = [...sum].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    }
    const g = groups.length;
    groups.push({ id: g, label: name, size: noteIdx.length, hub: hub !== undefined });
    for (const i of idx) nodes[i].group = g;
  }
  return { nodes, edges, groups };
}
