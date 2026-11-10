import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	schema: z.object({
		title: z.string(),
		// Optional: without one, the first paragraph is used (see summarize()).
		description: z.string().optional(),
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		tags: z.array(z.string()).default([]),
		// Drafts render in `astro dev` but are left out of production builds.
		draft: z.boolean().default(false),
	}),
});

const projects = defineCollection({
	loader: glob({ base: './src/content/projects', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			summary: z.string(),
			date: z.coerce.date(),
			tags: z.array(z.string()).default([]),
			tech: z.array(z.string()).default([]),
			thumbnail: image().optional(),
			// Name of a module in src/scripts/three/ to mount on the project page.
			scene: z.string().optional(),
			repo: z.url().optional(),
			featured: z.boolean().default(false),
			draft: z.boolean().default(false),
		}),
});

// The project wall on /projects/ and the home page. Adding a tile is one
// entry in projects.yaml. A project can also have its own page (notes, a live
// scene) as a file in src/content/projects/.
const tiles = defineCollection({
	loader: file('./src/content/projects.yaml'),
	schema: z.object({
		name: z.string(),
		kind: z.string(),
		description: z.string(),
		// https://... (opens in a new tab) or /projects/<slug>/.
		url: z.string().optional(),
		// A file in src/assets/thumbs/. Defaults to <id>.svg.
		thumbnail: z.string().optional(),
	}),
});

export const collections = { blog, projects, tiles };
