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

Posts are written as drafts in `drafts/` (git-ignored, so never public) and moved into
`src/content/blog/<slug>.md` when they're done. The `/website` Claude Code skill handles this.
By hand:

```md
---
title: Post title
pubDate: 2026-10-24
description: Optional. Defaults to the first paragraph, for link previews and RSS.
---
```

## Add a project

Create `src/content/projects/<slug>.mdx` with `title`, `summary`, `date`, and optionally `tech`,
`tags`, `thumbnail` (a path to an image in `src/`), `repo` and `featured: true`.

The grid tile is `src/assets/thumbs/<slug>.svg` if it exists. Draw it with `stroke="currentColor"`
and no `style` attributes so it follows the theme and passes the CSP. Without one, the tile falls
back to `thumbnail`, then to the title's first letter.

For a live 3D scene, add `src/scripts/three/<name>.ts` that exports
`mount(canvas: HTMLCanvasElement): () => void` (return a cleanup function) and set
`scene: <name>` in the project's frontmatter. Three.js is bundled, so it only loads on pages that
mount a scene. See `torus-knot.ts` for the pattern.

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
