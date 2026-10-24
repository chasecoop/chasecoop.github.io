import * as THREE from 'three';

// Each scene module exports mount(canvas) and returns a cleanup function.
export function mount(canvas: HTMLCanvasElement) {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
	renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100);
	camera.position.set(0, 0, 6);

	const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#a8321f';
	const mesh = new THREE.Mesh(
		new THREE.TorusKnotGeometry(1.1, 0.34, 220, 32),
		new THREE.MeshStandardMaterial({ color: accent, roughness: 0.35, metalness: 0.1 }),
	);
	scene.add(mesh);

	scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.2));
	const key = new THREE.DirectionalLight(0xffffff, 2);
	key.position.set(3, 4, 5);
	scene.add(key);

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
		mesh.geometry.dispose();
		(mesh.material as THREE.Material).dispose();
		renderer.dispose();
	};
}
