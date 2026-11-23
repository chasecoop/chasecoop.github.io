// Graph view: a force-directed layout of messages, site hubs and #tag hubs,
// drawn on a canvas. Zero dependencies. The simulation cools and stops when
// settled, so an open panel costs nothing while idle.

const KINDS = ['site', 'tag', 'sim'];
const REST = { site: 70, tag: 70, sim: 55 };
const CELL = 90;           // repulsion only looks this far (grid buckets)
const ALPHA_MIN = 0.004;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function hashAngle(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 3600) / 3600 * Math.PI * 2;
}

export function createGraph({ canvas, tip, onOpenNote }) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  let nodes = [], edges = [], groups = [], byId = new Map();
  let visibleKinds = new Set(KINDS);
  let alpha = 0, raf = 0;
  const view = { x: 0, y: 0, k: 1 };      // screen = world * k + (W/2 + x, H/2 + y)
  let hover = null, selected = null, drag = null, fitted = false;
  let colors = {};

  function readColors() {
    colors = {
      bg: cssVar('--bg'), text: cssVar('--text'), muted: cssVar('--muted'), faint: cssVar('--faint'),
      edge: cssVar('--graph-edge'), edgeSim: cssVar('--graph-edge-sim'),
      groups: Array.from({ length: 10 }, (_, i) => cssVar(`--graph-${i}`)),
    };
  }
  readColors();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); draw(); });

  const color = (n) => (n.group == null ? colors.faint : colors.groups[n.group % colors.groups.length]);
  const radius = (n) => (n.kind === 'note' ? (n.pinned ? 6.5 : 4.5) : 6 + Math.min(8, Math.sqrt(n.count) * 1.4));
  const shown = (n) => n.kind === 'note' || visibleKinds.has(n.kind);
  const liveEdges = () => edges.filter((e) => visibleKinds.has(e.kind));

  // ---------- data ----------

  function load(data) {
    const old = byId;
    nodes = data.nodes.map((n) => ({ ...n }));
    byId = new Map(nodes.map((n) => [n.id, n]));
    edges = data.edges.map((e) => ({ ...e, a: byId.get(e.s), b: byId.get(e.t) })).filter((e) => e.a && e.b);
    groups = data.groups;
    for (const n of nodes) n.links = [];
    for (const e of edges) { e.a.links.push(e); e.b.links.push(e); }

    // Keep positions of nodes we already had; place new ones near a
    // neighbour, or around a ring by group so clusters start apart.
    let fresh = 0;
    const ring = 120 + Math.sqrt(nodes.length) * 18;
    for (const n of nodes) {
      const prev = old.get(n.id);
      if (prev) { n.x = prev.x; n.y = prev.y; n.vx = 0; n.vy = 0; continue; }
      fresh++;
      const nb = n.links.map((e) => old.get(e.a === n ? e.b.id : e.a.id)).find(Boolean);
      const a = n.group != null ? hashAngle(String(n.group) + 'g') : hashAngle(n.id);
      const r = nb ? 20 : (n.group != null ? ring * 0.6 : ring);
      const bx = nb ? nb.x : Math.cos(a) * r, by = nb ? nb.y : Math.sin(a) * r;
      n.x = bx + (Math.random() - 0.5) * 40;
      n.y = by + (Math.random() - 0.5) * 40;
      n.vx = 0; n.vy = 0;
    }
    if (selected && !byId.has(selected.id)) selected = null;
    if (hover && !byId.has(hover.id)) hover = null;
    if (!fitted) {
      // First layout: settle off-screen, then frame it, so it doesn't explode in.
      alpha = 1;
      for (let i = 0; i < 260 && alpha > ALPHA_MIN; i++) tick();
      fit();
      fitted = true;
      alpha = Math.max(alpha, 0.05);
    } else {
      alpha = Math.max(alpha, fresh ? 0.35 : 0.1);
    }
    start();
  }

  // ---------- physics ----------

  function tick() {
    const live = nodes.filter(shown);
    // Repulsion between nearby nodes (grid buckets).
    const grid = new Map();
    for (const n of live) {
      const key = `${Math.floor(n.x / CELL)},${Math.floor(n.y / CELL)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(n);
    }
    for (const n of live) {
      const cx = Math.floor(n.x / CELL), cy = Math.floor(n.y / CELL);
      for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const cell = grid.get(`${gx},${gy}`);
        if (!cell) continue;
        for (const m of cell) {
          if (m === n) continue;
          let dx = n.x - m.x, dy = n.y - m.y;
          let d2 = dx * dx + dy * dy;
          if (d2 > CELL * CELL) continue;
          if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.25; }
          const f = (n.kind === 'note' ? 900 : 1800) / d2 * alpha;
          n.vx += dx * f * 0.5 / Math.sqrt(d2) * 1;
          n.vy += dy * f * 0.5 / Math.sqrt(d2) * 1;
        }
      }
    }
    // Springs.
    for (const e of liveEdges()) {
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const k = (e.kind === 'sim' ? 0.03 + e.w * 0.08 : 0.06) * alpha;
      const f = (d - REST[e.kind]) * k / d;
      e.a.vx += dx * f; e.a.vy += dy * f;
      e.b.vx -= dx * f; e.b.vy -= dy * f;
    }
    // Gentle pull to the centre; loose notes drift outwards a little more.
    for (const n of live) {
      const g = (n.links.length ? 0.012 : 0.006) * alpha;
      n.vx -= n.x * g; n.vy -= n.y * g;
    }
    for (const n of live) {
      if (drag && drag.node === n) { n.vx = n.vy = 0; continue; }
      n.vx *= 0.6; n.vy *= 0.6;
      const sp = Math.hypot(n.vx, n.vy);
      if (sp > 30) { n.vx *= 30 / sp; n.vy *= 30 / sp; }
      n.x += n.vx; n.y += n.vy;
    }
    alpha *= 0.985;
  }

  function start() {
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function frame() {
    raf = 0;
    if (alpha > ALPHA_MIN || drag) {
      tick();
      if (drag) alpha = Math.max(alpha, 0.12);
      draw();
      raf = requestAnimationFrame(frame);
    } else {
      draw();
    }
  }

  // ---------- view ----------

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    draw();
  }

  function fit() {
    const live = nodes.filter(shown);
    if (!live.length || !W) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of live) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
    const pad = 50;
    const k = Math.min((W - pad * 2) / Math.max(x1 - x0, 1), (H - pad * 2) / Math.max(y1 - y0, 1));
    view.k = Math.max(0.15, Math.min(1.25, k));
    view.x = -((x0 + x1) / 2) * view.k;
    view.y = -((y0 + y1) / 2) * view.k;
    draw();
  }

  const toScreen = (x, y) => [x * view.k + W / 2 + view.x, y * view.k + H / 2 + view.y];
  const toWorld = (sx, sy) => [(sx - W / 2 - view.x) / view.k, (sy - H / 2 - view.y) / view.k];

  function zoomAt(sx, sy, factor) {
    const [wx, wy] = toWorld(sx, sy);
    view.k = Math.max(0.1, Math.min(6, view.k * factor));
    view.x = sx - W / 2 - wx * view.k;
    view.y = sy - H / 2 - wy * view.k;
    draw();
  }

  // ---------- drawing ----------

  function neighbours(n) {
    const s = new Set([n]);
    for (const e of n.links) if (visibleKinds.has(e.kind)) { s.add(e.a); s.add(e.b); }
    return s;
  }

  function draw() {
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const focus = hover || selected;
    const near = focus ? neighbours(focus) : null;
    const dim = (n) => near && !near.has(n);

    ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * (W / 2 + view.x), dpr * (H / 2 + view.y));

    // Group names, faint, behind everything (when zoomed out).
    if (view.k < 1.3 && groups.length) {
      const sums = new Map();
      for (const n of nodes) {
        if (n.group == null || !shown(n)) continue;
        const s = sums.get(n.group) || { x: 0, y: 0, c: 0 };
        s.x += n.x; s.y += n.y; s.c++;
        sums.set(n.group, s);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${15 / view.k}px ${cssVar('--font') || 'sans-serif'}`;
      for (const [g, s] of sums) {
        // Groups named after a hub already have that hub's label on screen.
        if (s.c < 3 || !groups[g]?.label || groups[g].hub) continue;
        ctx.globalAlpha = near ? 0.08 : 0.22;
        ctx.fillStyle = colors.groups[g % colors.groups.length];
        ctx.fillText(groups[g].label, s.x / s.c, s.y / s.c - 28 / view.k);
      }
    }

    // Edges.
    ctx.lineWidth = 1 / view.k;
    for (const e of liveEdges()) {
      const on = near && near.has(e.a) && near.has(e.b) && (e.a === focus || e.b === focus);
      ctx.globalAlpha = near ? (on ? 0.9 : 0.06) : (e.kind === 'sim' ? 0.45 : 0.6);
      ctx.strokeStyle = on ? color(focus) : (e.kind === 'sim' ? colors.edgeSim : colors.edge);
      ctx.lineWidth = (on ? 1.6 : 1) / view.k;
      ctx.beginPath();
      ctx.moveTo(e.a.x, e.a.y);
      ctx.lineTo(e.b.x, e.b.y);
      ctx.stroke();
    }

    // Nodes.
    for (const n of nodes) {
      if (!shown(n)) continue;
      const r = radius(n);
      ctx.globalAlpha = dim(n) ? 0.18 : 1;
      ctx.fillStyle = color(n);
      ctx.beginPath();
      if (n.kind === 'tag') {
        ctx.roundRect(n.x - r, n.y - r, r * 2, r * 2, r * 0.35);
      } else {
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
      if (n.kind !== 'note' || n.files) {
        ctx.lineWidth = (n.kind === 'note' ? 1.5 : 2) / view.k;
        ctx.strokeStyle = colors.bg;
        ctx.stroke();
      }
      if (n.files) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 2.5, 0, Math.PI * 2);
        ctx.lineWidth = 1.2 / view.k;
        ctx.strokeStyle = color(n);
        ctx.stroke();
      }
      if (n === selected || n === hover) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2);
        ctx.lineWidth = 2 / view.k;
        ctx.strokeStyle = colors.text;
        ctx.stroke();
      }
    }

    // Labels: hubs once readable, notes when zoomed in or in focus.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const font = cssVar('--font') || 'sans-serif';
    for (const n of nodes) {
      if (!shown(n)) continue;
      const isHub = n.kind !== 'note';
      const inFocus = near && near.has(n);
      if (!(isHub ? view.k > 0.45 || inFocus : view.k > 1.7 || n === focus || (inFocus && view.k > 0.9))) continue;
      if (dim(n)) continue;
      const size = (isHub ? 12 : 11) / Math.max(view.k, 0.6);
      ctx.font = `${isHub ? 700 : 400} ${size}px ${font}`;
      ctx.globalAlpha = isHub || n === focus ? 1 : 0.8;
      ctx.fillStyle = isHub ? colors.text : colors.muted;
      const label = n.label.length > 32 && n !== focus ? n.label.slice(0, 31) + '…' : n.label;
      ctx.fillText(label, n.x, n.y + radius(n) + 3 / view.k);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- interaction ----------

  function hit(sx, sy) {
    const [wx, wy] = toWorld(sx, sy);
    let best = null, bd = Infinity;
    for (const n of nodes) {
      if (!shown(n)) continue;
      const d = Math.hypot(n.x - wx, n.y - wy);
      const reach = radius(n) + 6 / view.k;
      if (d < reach && d < bd) { best = n; bd = d; }
    }
    return best;
  }

  const fmtDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  function showTip(n, sx, sy) {
    if (!n) { tip.hidden = true; return; }
    tip.replaceChildren();
    const title = document.createElement('div');
    title.className = 'graph-tip-title';
    title.textContent = n.kind === 'note' ? (n.text || n.label) : n.label;
    const meta = document.createElement('div');
    meta.className = 'graph-tip-meta';
    if (n.kind === 'note') {
      const bits = [fmtDate.format(n.ts)];
      if (n.pinned) bits.push('Pinned');
      if (n.files) bits.push(n.files === 1 ? '1 file' : `${n.files} files`);
      meta.textContent = bits.join(' · ') + ' · click to open';
    } else {
      meta.textContent = `${n.count} messages · click to highlight`;
    }
    tip.append(title, meta);
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = sx + 14, y = sy + 14;
    if (x + r.width > W - 8) x = Math.max(8, sx - r.width - 14);
    if (y + r.height > H - 8) y = Math.max(8, sy - r.height - 14);
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }

  const pointers = new Map();
  let pinch = null;
  let down = null;

  const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const [sx, sy] = local(e);
    pointers.set(e.pointerId, [sx, sy]);
    if (pointers.size === 2) {
      const [[ax, ay], [bx, by]] = [...pointers.values()];
      pinch = { d: Math.hypot(ax - bx, ay - by), k: view.k };
      drag = null; down = null;
      return;
    }
    const n = hit(sx, sy);
    down = { sx, sy, moved: false, node: n, vx: view.x, vy: view.y };
    if (n) { drag = { node: n }; start(); }
    showTip(null);
  });

  canvas.addEventListener('pointermove', (e) => {
    const [sx, sy] = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [sx, sy]);
    if (pinch && pointers.size === 2) {
      const [[ax, ay], [bx, by]] = [...pointers.values()];
      const d = Math.hypot(ax - bx, ay - by);
      zoomAt((ax + bx) / 2, (ay + by) / 2, (pinch.k * d / pinch.d) / view.k);
      return;
    }
    if (down) {
      if (Math.hypot(sx - down.sx, sy - down.sy) > 4) down.moved = true;
      if (!down.moved) return;
      if (drag) {
        const [wx, wy] = toWorld(sx, sy);
        drag.node.x = wx; drag.node.y = wy;
      } else {
        view.x = down.vx + (sx - down.sx);
        view.y = down.vy + (sy - down.sy);
        draw();
      }
      return;
    }
    if (e.pointerType === 'mouse') {
      const n = hit(sx, sy);
      if (n !== hover) { hover = n; draw(); }
      canvas.style.cursor = n ? 'pointer' : 'grab';
      showTip(n, sx, sy);
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; down = null; return; }
    const d = down;
    down = null;
    drag = null;
    if (!d || d.moved) return;
    if (!d.node) { selected = null; draw(); return; }
    if (d.node.kind === 'note') {
      selected = d.node;
      draw();
      onOpenNote(d.node.mid);
    } else {
      selected = selected === d.node ? null : d.node;
      draw();
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); pinch = null; down = null; drag = null; });
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !down) { hover = null; showTip(null); draw(); }
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [sx, sy] = local(e);
    zoomAt(sx, sy, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)));
  }, { passive: false });

  new ResizeObserver(() => resize()).observe(canvas);

  return {
    load,
    fit,
    resize,
    setKinds(kinds) {
      visibleKinds = new Set(kinds);
      if (selected && !shown(selected)) selected = null;
      alpha = Math.max(alpha, 0.25);
      start();
    },
    select(mid) {
      selected = byId.get(`m${mid}`) || null;
      draw();
    },
    stats() {
      const live = liveEdges();
      return { notes: nodes.filter((n) => n.kind === 'note').length, edges: live.length, hubs: nodes.filter((n) => n.kind !== 'note' && shown(n)).length };
    },
    // For tests: screen position of a node.
    screenPos(id) { const n = byId.get(id); return n ? toScreen(n.x, n.y) : null; },
  };
}
