// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://snarezm.com',
	trailingSlash: 'always',
	integrations: [mdx(), sitemap()],
	markdown: {
		// Prism emits classes; Shiki emits inline style attributes the CSP would block.
		syntaxHighlight: 'prism',
	},
	build: {
		// Keep every stylesheet external so the Cloudflare CSP can stay at
		// style-src 'self' with no hashes or 'unsafe-inline'.
		inlineStylesheets: 'never',
	},
	vite: {
		build: {
			// Never inline assets (scripts, fonts, images) as data: or inline code.
			assetsInlineLimit: 0,
		},
	},
});
