import * as THREE from 'three';

// Each scene module exports mount(canvas) and returns a cleanup function.
export function mount(canvas: HTMLCanvasElement) {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
	renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100);
	camera.position.set(0, 0, 6);

	// A (2,3) trefoil drawn as rings and lengthwise lines (no triangle
	// diagonals) in the stage's foreground colour.
	const tubular = 128;
	const radial = 10;
	const knot = new THREE.TorusKnotGeometry(1.1, 0.34, tubular, radial, 2, 3);
	const at = (j: number, i: number) => j * (radial + 1) + i;
	const lines: number[] = [];
	for (let j = 0; j <= tubular; j++) {
		for (let i = 0; i <= radial; i++) {
			if (i < radial) lines.push(at(j, i), at(j, i + 1));
			if (j < tubular) lines.push(at(j, i), at(j + 1, i));
		}
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', knot.getAttribute('position'));
	geometry.setIndex(lines);
	knot.dispose();
	const material = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.7 });
	const mesh = new THREE.LineSegments(geometry, material);
	scene.add(mesh);

	const setColor = () => {
		const fg = getComputedStyle(canvas).getPropertyValue('--tile-fg').trim();
		material.color.set(fg || '#e9e7e1');
	};
	const scheme = matchMedia('(prefers-color-scheme: dark)');
	scheme.addEventListener('change', setColor);
	setColor();

	const resize = () => {
		const { clientWidth: w, clientHeight: h } = canvas;
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
	};
	const observer = new ResizeObserver(resize);
	observer.observe(canvas);
	resize();

	// Drag to spin; otherwise idle rotation (unless the visitor prefers reduced motion).
	const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
	let dragging = false;
	let vx = still ? 0 : 0.004;
	let vy = still ? 0 : 0.006;
	canvas.addEventListener('pointerdown', (e) => {
		dragging = true;
		canvas.setPointerCapture(e.pointerId);
	});
	canvas.addEventListener('pointerup', () => (dragging = false));
	canvas.addEventListener('pointermove', (e) => {
		if (!dragging) return;
		vy = e.movementX * 0.002;
		vx = e.movementY * 0.002;
	});

	renderer.setAnimationLoop(() => {
		mesh.rotation.x += vx;
		mesh.rotation.y += vy;
		if (!dragging && !still) {
			vx += (0.004 - vx) * 0.02;
			vy += (0.006 - vy) * 0.02;
		}
		renderer.render(scene, camera);
	});

	return () => {
		renderer.setAnimationLoop(null);
		observer.disconnect();
		scheme.removeEventListener('change', setColor);
		geometry.dispose();
		material.dispose();
		renderer.dispose();
	};
}
