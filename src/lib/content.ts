import { getCollection } from 'astro:content';

const isPublished = ({ data }: { data: { draft: boolean } }) => import.meta.env.DEV || !data.draft;

export async function getPosts() {
	const posts = await getCollection('blog', isPublished);
	return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export async function getProjects() {
	const projects = await getCollection('projects', isPublished);
	return projects.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}
