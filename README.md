# snarezm.com

Personal hub: writing and projects, including Three.js experiments. Built with
[Astro](https://astro.build), deployed to GitHub Pages by GitHub Actions on every push to `main`,
and served through Cloudflare at [snarezm.com](https://snarezm.com).

## Develop

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
```

## Add a blog post

Create `src/content/blog/<slug>.md` (or `.mdx`):

```md
---
title: Post title
description: One-line summary shown in lists and the RSS feed.
pubDate: 2026-10-24
tags: [threejs]
draft: true   # optional: visible in dev, left out of the live site
---
```

## Add a project

Create `src/content/projects/<slug>.mdx` with `title`, `summary`, `date`, and optionally `tech`,
`tags`, `thumbnail` (a path to an image in `src/`), `repo` and `featured: true`.

For a live 3D scene, add `src/scripts/three/<name>.ts` that exports
`mount(canvas: HTMLCanvasElement): () => void` (return a cleanup function) and set
`scene: <name>` in the project's frontmatter. Three.js is bundled, so it only loads on pages that
mount a scene. See `spinning-cube.ts` for the pattern.

## Security rules for this repo

The live site sends a strict Content Security Policy from Cloudflare:
`script-src 'self'; style-src 'self'`. So:

- **No CDN scripts or styles.** Install packages with npm so they get bundled.
- **No inline `<script>`, `<style>`, `style="..."` attributes or `on*=` handlers** in built HTML.
  Astro component `<script>` and `<style>` tags are fine because they build to external files.
- Syntax highlighting uses Prism (classes) rather than Shiki (inline styles) for this reason.
- Fonts are self-hosted via Fontsource packages rather than Astro's `<Font>` component,
  which injects an inline `<style>`.
- This repo is public. Don't commit secrets, and use `draft: true` for unpublished posts.
