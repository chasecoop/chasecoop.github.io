---
title: Hello, world
description: Why this site exists and what's going to show up here.
pubDate: 2026-10-24
tags: [meta]
---

This is the first post on snarezm.com. The plan is simple: write up what I'm learning and keep a
gallery of the things I build, especially interactive 3D in the browser.

## How it's built

The site is [Astro](https://astro.build), deployed to GitHub Pages and served through Cloudflare.
Posts are Markdown files in the repo, and every push to `main` rebuilds the site.

```ts
export function mount(canvas: HTMLCanvasElement) {
	// every 3D project starts here
}
```

More soon.
