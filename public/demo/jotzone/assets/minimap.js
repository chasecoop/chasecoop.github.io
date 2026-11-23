// Minimap: the whole history as a thin strip of bars (oldest at the top),
// like VS Code's. Bars are coloured by category, sized by how much space the
// message takes. A box shows what's on screen; click or drag it and the
// message list scrolls live underneath.

const MONTHS = new Intl.DateTimeFormat(undefined, { month: 'short' });
const MONTH_YEAR = new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit' });
const DAY = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const MAX_SCALE = 0.06; // minimap px per content px when there's room to spare

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function createMinimap({ canvas, tip, onScrub, onScrubEnd, getVisible, onWheel }) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  let rows = [];          // { id, ts, len, flags, cat, y, h }
  let byId = new Map();
  let scale = 1, total = 0;
  let view = null;        // { top, bottom } in px
  let drag = null;
  let colors = {};

  function readColors() {
    colors = {
      bar: cssVar('--faint'), text: cssVar('--muted'), line: cssVar('--border'),
      box: cssVar('--text'), pin: '#e8a92d',
      cats: Array.from({ length: 9 }, (_, i) => cssVar(`--graph-${i}`)),
    };
  }
  readColors();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); draw(); });

  // Bars are proportional to the space each message takes in the list, like
  // VS Code, so dragging scrolls at an even speed. Messages that have been on
  // screen use their measured height; the rest use an estimate.
  const measured = new Map(); // id -> px, incl. the day divider above it
  let dirty = false;
  function estimate(r, prev) {
    let px = 40 + 22 * Math.max(0, Math.ceil(r.len / 95) - 1);
    if (r.flags & 32) px += 280;        // video embed
    else if (r.flags & 2) px += 300;    // image
    if (r.flags & 16) px += 120;        // preview card
    if (r.flags & 4) px += 64;          // file card
    if (!prev || new Date(prev.ts).toDateString() !== new Date(r.ts).toDateString()) px += 52; // day divider
    return px;
  }

  function layout() {
    let prev = null;
    total = 0;
    for (const r of rows) { r.px = measured.get(r.id) ?? estimate(r, prev); total += r.px; prev = r; }
    scale = Math.min(MAX_SCALE, (H - 8) / (total || 1));
    let y = 4;
    for (const r of rows) { r.y = y; r.h = r.px * scale; y += r.h; }
    dirty = false;
  }

  // Heights measured from the rendered list. Re-layout waits until a drag
  // ends so the minimap never shifts under the pointer.
  function setMeasured(map) {
    let changed = false;
    for (const [id, px] of map) if (Math.abs((measured.get(id) ?? -1) - px) > 1) { measured.set(id, px); changed = true; }
    if (!changed) return;
    if (drag) { dirty = true; return; }
    layout();
    updateView();
  }

  function load(data) {
    rows = data.rows.map(([id, ts, len, flags, cat]) => ({ id, ts, len, flags, cat }));
    byId = new Map(rows.map((r) => [r.id, r]));
    layout();
    updateView();
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = window.devicePixelRatio || 1;
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    layout();
    updateView();
  }

  function updateView() {
    const v = getVisible();
    if (!v || !rows.length) { view = null; draw(); return; }
    // Visible ids may include messages newer than the data; clamp to known rows.
    const a = byId.get(v[0]) || rows.find((r) => r.id >= v[0]) || rows[rows.length - 1];
    const b = byId.get(v[1]) || [...rows].reverse().find((r) => r.id <= v[1]) || rows[0];
    view = { top: Math.min(a.y, b.y), bottom: Math.max(a.y + a.h, b.y + b.h) };
    if (view.bottom - view.top < 8) { const c = (view.top + view.bottom) / 2; view.top = c - 4; view.bottom = c + 4; }
    draw();
  }

  function draw() {
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const left = 6, maxW = W - 16;

    // Month boundaries.
    ctx.font = `600 9px ${cssVar('--font') || 'sans-serif'}`;
    ctx.textBaseline = 'bottom';
    let lastMonth = null, lastLabelY = -99;
    for (const r of rows) {
      const d = new Date(r.ts);
      const m = d.getFullYear() * 12 + d.getMonth();
      if (lastMonth !== null && m !== lastMonth) {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = colors.line;
        ctx.fillRect(0, Math.round(r.y) - 1, W, 1);
        if (r.y - lastLabelY > 16) {
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = colors.text;
          const label = d.getMonth() === 0 ? MONTH_YEAR.format(d) : MONTHS.format(d);
          ctx.textAlign = 'right';
          ctx.fillText(label, W - 3, Math.round(r.y) - 2);
          lastLabelY = r.y;
        }
      }
      lastMonth = m;
    }

    // Bars.
    for (const r of rows) {
      const h = Math.max(1, r.h - (r.h > 3 ? 1 : 0));
      const w = Math.max(6, Math.min(1, (r.len + (r.flags & 1 ? 40 : 0) + 12) / 220) * maxW);
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = r.cat >= 0 && r.cat < colors.cats.length ? colors.cats[r.cat] : colors.bar;
      ctx.fillRect(left, r.y, w, h);
      if (r.flags & 2 && r.h > 4) { // image: a little block below the line
        ctx.globalAlpha = 0.35;
        ctx.fillRect(left, r.y + h * 0.35, Math.min(maxW * 0.5, 26), h * 0.6);
      }
      if (r.flags & 8) { // pinned
        ctx.globalAlpha = 1;
        ctx.fillStyle = colors.pin;
        ctx.fillRect(1, r.y, 3, Math.max(2, h));
      }
    }

    // Viewport box.
    if (view) {
      const top = drag ? drag.top : view.top;
      const hgt = drag ? drag.hgt : view.bottom - view.top;
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = colors.box;
      ctx.fillRect(0, top, W, hgt);
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = colors.box;
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, top + 0.5, W - 1, Math.max(1, hgt - 1));
    }
    ctx.globalAlpha = 1;
  }

  function rowAt(y) {
    if (!rows.length) return null;
    let lo = 0, hi = rows.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (rows[mid].y <= y) lo = mid; else hi = mid - 1;
    }
    return rows[lo];
  }

  function showTip(y, text) {
    if (text == null) { tip.hidden = true; return; }
    tip.textContent = text;
    tip.hidden = false;
    tip.style.top = `${Math.max(4, Math.min(H - 24, y - 10))}px`;
  }

  const localY = (e) => e.clientY - canvas.getBoundingClientRect().top;

  // The message at the middle of the dragged box, and how far into it.
  function target(top) {
    // While dragging, the box keeps the height it had when grabbed, so the
    // list scrolling underneath can't feed back into where it points.
    const hgt = drag ? drag.hgt : view ? view.bottom - view.top : 0;
    const y = Math.max(0, top + hgt / 2);
    const r = rowAt(y);
    return r ? { r, frac: Math.max(0, Math.min(1, (y - r.y) / (r.h || 1))) } : null;
  }
  let scrubRaf = 0;
  function scrubNow() {
    if (scrubRaf) return;
    scrubRaf = requestAnimationFrame(() => {
      scrubRaf = 0;
      if (!drag) return;
      const t = target(drag.top);
      if (t) onScrub(t.r.id, t.frac);
    });
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!rows.length) return;
    canvas.setPointerCapture(e.pointerId);
    const y = localY(e);
    const hgt = view ? view.bottom - view.top : 0;
    // Grab the box where it was clicked, or centre it on a click elsewhere.
    drag = view && y >= view.top && y <= view.bottom ? { offset: y - view.top, hgt } : { offset: hgt / 2, hgt };
    drag.top = y - drag.offset;
    const t = target(drag.top);
    if (t) showTip(y, DAY.format(t.r.ts));
    draw();
    scrubNow();
  });
  canvas.addEventListener('pointermove', (e) => {
    const y = localY(e);
    if (drag) {
      drag.top = y - drag.offset;
      const t = target(drag.top);
      if (t) showTip(y, DAY.format(t.r.ts));
      draw();
      scrubNow();
      return;
    }
    const r = rowAt(y);
    showTip(y, r ? DAY.format(r.ts) : null);
  });
  function end() {
    if (!drag) return;
    const t = target(drag.top);
    drag = null;
    showTip(0, null);
    if (t) onScrub(t.r.id, t.frac);
    onScrubEnd();
    if (dirty) layout();
    updateView();
  }
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { if (!drag) showTip(0, null); });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); onWheel(e.deltaY); }, { passive: false });

  new ResizeObserver(resize).observe(canvas);

  return {
    load,
    setMeasured,
    updateView,
    // For tests: the y of a message's bar.
    yOf(id) { const r = byId.get(id); return r ? r.y + r.h / 2 : null; },
    get view() { return view; },
  };
}
