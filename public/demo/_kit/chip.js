// Shared demo chip. Loaded by every demo page:
//   <link rel="stylesheet" href="../_kit/chip.css">
//   <script type="module" src="../_kit/chip.js"></script>
// Optional meta tags: showcase-note (text), showcase-corner (top-left,
// top-right, bottom-left, bottom-right; default bottom-right).
const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

function meta(name) {
	const el = document.querySelector(`meta[name="${name}"]`);
	return el ? (el.getAttribute('content') || '').trim() : '';
}

function el(tag, className, text) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text) node.textContent = text;
	return node;
}

function mount() {
	if (document.querySelector('.showcase-chip')) return;

	const slug = (location.pathname.match(/^\/demo\/([^/]+)/) || [])[1];
	const note = meta('showcase-note');
	const wanted = meta('showcase-corner');
	const corner = 'showcase-' + (CORNERS.includes(wanted) ? wanted : 'bottom-right');

	const chip = el('div', `showcase-chip ${corner}`);
	chip.setAttribute('role', 'group');
	chip.setAttribute('aria-label', 'Demo information');
	if (note) chip.title = note;

	const sep = () => el('span', 'showcase-sep', '·');
	const seps = () => {
		const s = sep();
		s.setAttribute('aria-hidden', 'true');
		return s;
	};

	let panel = null;
	let toggle;
	if (note) {
		toggle = el('button', 'showcase-toggle', 'demo');
		toggle.type = 'button';
		toggle.setAttribute('aria-expanded', 'false');
		toggle.setAttribute('aria-controls', 'showcase-note');
		panel = el('div', `showcase-note ${corner}`);
		panel.id = 'showcase-note';
		panel.hidden = true;
		panel.setAttribute('role', 'region');
		panel.setAttribute('aria-label', 'About this demo');
		panel.append(el('p', '', note));
		const close = el('button', 'showcase-close', 'close');
		close.type = 'button';
		panel.append(close);

		const setOpen = (open) => {
			panel.hidden = !open;
			toggle.setAttribute('aria-expanded', String(open));
		};
		toggle.addEventListener('click', () => setOpen(panel.hidden));
		close.addEventListener('click', () => {
			setOpen(false);
			toggle.focus();
		});
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' && !panel.hidden) {
				setOpen(false);
				toggle.focus();
			}
		});
	} else {
		toggle = el('span', '', 'demo');
	}

	const about = el('a', '', 'about');
	about.href = slug ? `/projects/${slug}/` : '/projects/';
	const reset = el('button', '', 'reset');
	reset.type = 'button';
	reset.addEventListener('click', () => location.reload());

	chip.append(toggle, seps(), el('span', '', 'made-up data'), seps(), about, seps(), reset);
	document.body.append(chip);
	if (panel) document.body.append(panel);
}

if (document.body) mount();
else document.addEventListener('DOMContentLoaded', mount, { once: true });
