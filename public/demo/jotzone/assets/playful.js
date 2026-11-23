// Joyful touches. Each one is a small, self-contained effect.

// ---------- rolling index ----------
// A bulleted list stays plain text until the mouse rests on an item for a
// moment. Then that item pops out, and running the mouse up and down the
// list rolls the pop from item to item (neighbours lift a little too, like a
// Rolodex), with one highlight gliding between them. Leaving the list lets
// it settle back to plain text.

const DWELL_MS = 350;   // rest this long on an item to wake the list
const LEAVE_MS = 150;   // grace period before the list settles again

export function initRollingLists(root) {
  const canHover = matchMedia('(hover: hover) and (pointer: fine)');
  let awake = null;      // the woken <ul>
  let current = null;    // the popped <li>
  let glow = null;       // the gliding highlight inside `awake`
  let hovered = null;    // <li> under the mouse, woken or not
  let dwellTimer = 0;
  let leaveTimer = 0;

  const itemsOf = (ul) => [...ul.children].filter((n) => n.tagName === 'LI');

  function place(li) {
    // Scale wide items less so a full-width line never spills past the message.
    const scale = Math.min(1.06, 1 + 26 / Math.max(li.offsetWidth, 1));
    li.style.setProperty('--roll-scale', scale.toFixed(3));
    if (!glow) return;
    glow.style.top = `${li.offsetTop - 2}px`;
    glow.style.height = `${li.offsetHeight + 4}px`;
    glow.style.width = `${Math.min(awake.clientWidth + 18, li.offsetWidth * scale + 30)}px`;
  }

  function pop(li) {
    if (li === current) return;
    const items = itemsOf(awake);
    const i = items.indexOf(li);
    for (const [j, item] of items.entries()) {
      const d = Math.abs(j - i);
      item.classList.toggle('roll-on', d === 0);
      item.classList.toggle('roll-near1', d === 1);
      item.classList.toggle('roll-near2', d === 2);
    }
    current = li;
    place(li);
  }

  function wake(ul, li) {
    sleep();
    awake = ul;
    glow = document.createElement('span');
    glow.className = 'roll-glow';
    glow.setAttribute('aria-hidden', 'true');
    ul.prepend(glow);
    // Start the glow on the item without a slide-in, then let it glide.
    glow.classList.add('roll-instant');
    pop(li);
    requestAnimationFrame(() => {
      if (!glow) return;
      glow.classList.remove('roll-instant');
      ul.classList.add('roll-awake');
    });
  }

  function sleep() {
    clearTimeout(leaveTimer);
    if (!awake) return;
    awake.classList.remove('roll-awake');
    for (const item of itemsOf(awake)) {
      item.classList.remove('roll-on', 'roll-near1', 'roll-near2');
      item.style.removeProperty('--roll-scale');
    }
    const g = glow;
    if (g) { g.classList.add('roll-out'); setTimeout(() => g.remove(), 250); }
    awake = current = glow = null;
  }

  root.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse' || !canHover.matches) return;
    const li = e.target.closest('.body li');
    const ul = li && li.parentElement;
    hovered = li;
    if (awake && !awake.isConnected) sleep(); // the message was re-rendered
    if (awake && ul === awake) {
      clearTimeout(leaveTimer);
      pop(li);
      return;
    }
    clearTimeout(dwellTimer);
    if (!li) return;
    dwellTimer = setTimeout(() => {
      if (hovered === li && li.isConnected) wake(ul, li);
    }, DWELL_MS);
  });

  root.addEventListener('pointerout', (e) => {
    if (e.pointerType !== 'mouse') return;
    const to = e.relatedTarget;
    if (!to || !hovered || !hovered.contains(to)) {
      if (!(to && to.closest && to.closest('.body li'))) { hovered = null; clearTimeout(dwellTimer); }
    }
    if (awake && !(to && awake.contains(to))) {
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(sleep, LEAVE_MS);
    }
  });

  // Scrolling moves the list out from under a still mouse: settle.
  root.closest('.scroller')?.addEventListener('scroll', () => { if (awake) sleep(); }, { passive: true });

  return { get awake() { return awake; } };
}
