// Shared by the server (src/) and the browser (public/assets/app.js) so URL
// detection is identical on both sides.

// \u0000 is excluded so the client's formatter placeholders never join a URL.
export const URL_RE = /https?:\/\/[^\s<>"'`\u0000]+/g;

// A full http(s) URL, or a bare address like "youtube.com/watch?v=x" or
// "www.example.co.uk". Bare addresses must not follow a word character, "@"
// (emails), ".", "/" or "-".
export const LINK_RE = /https?:\/\/[^\s<>"'`\u0000]+|(?<![\w@./\-\u0000])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?::\d{2,5})?(?:[/?#][^\s<>"'`\u0000]*)?/gi;

// Bare addresses only count when the last label is a common TLD, so file
// names like "notes.txt", "app.js" or "readme.md" stay plain text. Anything
// starting with "www." counts regardless.
const BARE_TLDS = new Set((
  'com net org edu gov mil int io co ai app dev me us uk ca au nz ie de fr es it nl be ch at se no dk fi pl pt ' +
  'jp kr cn tw hk sg in br mx ar cl za tv fm gg ly to info biz xyz online site tech news blog page link shop store ' +
  'design art studio wiki social video music games email cloud'
).split(' '));

const TRAILING = '.,;:!?]}>*_~';

// Strip trailing punctuation that is almost never part of a URL, but keep a
// ")" that closes a "(" inside the URL (Wikipedia-style links).
export function trimUrl(url) {
  let u = url;
  while (u.length) {
    const c = u[u.length - 1];
    if (c === ')') {
      const opens = u.split('(').length - 1;
      const closes = u.split(')').length - 1;
      if (closes > opens) { u = u.slice(0, -1); continue; }
      break;
    }
    if (TRAILING.includes(c)) { u = u.slice(0, -1); continue; }
    break;
  }
  return u;
}

// For a trimmed match, the URL to link to (bare addresses get https://), or
// null if the match isn't a link.
export function linkTarget(text) {
  if (/^https?:\/\//i.test(text)) return /^https?:\/\/[^/?#]+/i.test(text) ? text : null;
  const host = text.match(/^[^/?#:]+/)[0].toLowerCase();
  const tld = host.slice(host.lastIndexOf('.') + 1);
  if (!host.startsWith('www.') && !BARE_TLDS.has(tld)) return null;
  return 'https://' + text;
}

// Every link in the text, in order: { index, text, url } where text is what
// was typed and url is where it points.
export function findLinks(text) {
  const out = [];
  if (!text) return out;
  const re = new RegExp(LINK_RE.source, 'gi');
  let m;
  while ((m = re.exec(text))) {
    const t = trimUrl(m[0]);
    const url = t && linkTarget(t);
    if (url) out.push({ index: m.index, text: t, url });
  }
  return out;
}

// Every distinct link URL in the text, in order of appearance.
export function extractUrls(text) {
  const out = [];
  for (const { url } of findLinks(text)) if (!out.includes(url)) out.push(url);
  return out;
}

// #tag: letters, digits, "_" or "-", not inside a word or after "&" (HTML
// entities) or "/" (URL fragments). Callers require at least one letter.
export const TAG_RE = /(^|[^\p{L}\p{N}_&/#])#([\p{L}\p{N}_-]{1,40})/gu;
export const isTag = (t) => /\p{L}/u.test(t);

// Distinct lowercase tags in the text, in order.
export function findTags(text) {
  const out = [];
  for (const m of String(text || '').matchAll(new RegExp(TAG_RE.source, 'gu'))) {
    const t = m[2].toLowerCase().replace(/[-_]+$/, '');
    if (isTag(t) && !out.includes(t)) out.push(t);
  }
  return out;
}
