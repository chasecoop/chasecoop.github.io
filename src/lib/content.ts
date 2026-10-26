import { getCollection } from 'astro:content';

const isPublished = ({ data }: { data: { draft: boolean } }) => import.meta.env.DEV || !data.draft;

export async function getPosts() {
	const posts = await getCollection('blog', isPublished);
	return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

// One-line summary for link previews and RSS: the post's description, or
// the start of its first paragraph with Markdown stripped.
export function summarize({ data, body }: { data: { description?: string }; body?: string }, max = 160) {
	if (data.description) return data.description;
	const para = (body ?? '')
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.find((p) => p && !/^(#|```|<|import |export |!\[|>|[-*] )/.test(p));
	const text = (para ?? '')
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[*_`~]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : text;
}

export async function getProjects() {
	const projects = await getCollection('projects', isPublished);
	return projects.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}
