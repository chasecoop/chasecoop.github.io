// Category rules and link kinds, copied from src/classify.js for the demo.
import { extractUrls } from '../urls.js';

export const CATEGORIES = [
  { key: 'research', label: 'Research & learning', desc: 'articles, papers, docs, tutorials, courses, lectures, reference material, things to learn or look into' },
  { key: 'entertainment', label: 'Entertainment', desc: 'music, movies, TV, games, funny videos, memes, podcasts and videos watched for fun' },
  { key: 'news', label: 'News', desc: 'current events, politics, journalism, announcements, industry news' },
  { key: 'shopping', label: 'Shopping', desc: 'products, gear, wish lists, things to buy, deals, groceries' },
  { key: 'ideas', label: 'Ideas', desc: 'own ideas, brainstorms, "what if", project or app ideas, creative sparks' },
  { key: 'todo', label: 'To-dos', desc: 'tasks, reminders, errands, appointments, things to do or remember' },
  { key: 'work', label: 'Work', desc: 'job tasks, meetings, colleagues, work projects and documents' },
  { key: 'personal', label: 'Personal', desc: 'family, friends, health, home, finances, personal notes and journaling' },
  { key: 'food', label: 'Recipes & food', desc: 'recipes, cooking, restaurants, coffee, drinks' },
  { key: 'other', label: 'Other', desc: 'anything that fits none of the above' },
];
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);


// ---------- link kinds (exact, used for the Sources section) ----------

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp)$/i;

export function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^(www|m|mobile)\./, ''); } catch { return ''; }
}

// ",youtube,x,image," style string so SQL can match with LIKE '%,youtube,%'.
export function linkKinds(body) {
  const kinds = new Set();
  for (const url of extractUrls(body)) {
    const h = hostOf(url);
    if (h === 'youtube.com' || h === 'youtu.be' || h.endsWith('.youtube.com')) kinds.add('youtube');
    if (h === 'x.com' || h === 'twitter.com') kinds.add('x');
    try { if (IMAGE_EXT.test(new URL(url).pathname)) kinds.add('image'); } catch {}
  }
  return kinds.size ? `,${[...kinds].join(',')},` : '';
}

// ---------- rules (no key, or the AI failed) ----------

const SITE_RULES = [
  ['entertainment', ['youtube.com', 'youtu.be', 'vimeo.com', 'twitch.tv', 'netflix.com', 'spotify.com', 'soundcloud.com', 'tiktok.com', 'imdb.com', 'letterboxd.com', 'steampowered.com', 'bandcamp.com']],
  ['news', ['nytimes.com', 'cnn.com', 'bbc.com', 'bbc.co.uk', 'reuters.com', 'apnews.com', 'washingtonpost.com', 'theguardian.com', 'npr.org', 'wsj.com', 'bloomberg.com', 'theverge.com', 'axios.com', 'politico.com', 'news.ycombinator.com']],
  ['shopping', ['amazon.com', 'amzn.to', 'ebay.com', 'etsy.com', 'bestbuy.com', 'target.com', 'walmart.com', 'bhphotovideo.com', 'adorama.com', 'costco.com', 'ikea.com']],
  ['research', ['arxiv.org', 'wikipedia.org', 'github.com', 'stackoverflow.com', 'medium.com', 'developer.mozilla.org', 'nature.com', 'scholar.google.com', 'coursera.org', 'khanacademy.org', 'docs.python.org']],
  ['food', ['allrecipes.com', 'seriouseats.com', 'cooking.nytimes.com', 'bonappetit.com', 'foodnetwork.com', 'epicurious.com']],
];

const WORD_RULES = [
  ['todo', /\b(to-?do|remember to|don'?t forget|need to|have to|call|book|schedule|deadline|appointment|renew|pay the)\b/],
  ['shopping', /\b(buy|order|purchase|price|deal|wishlist|wish list|grocer(y|ies))\b/],
  ['food', /\b(recipe|cook|bake|baking|dinner|lunch|breakfast|ingredients|restaurant|coffee|espresso)\b/],
  ['ideas', /\b(idea|ideas|what if|brainstorm|could build|concept)\b/],
  ['work', /\b(meeting|sprint|prd|jira|standup|stand-up|roadmap|quarterly|okrs?|stakeholders?|manager)\b/],
  ['research', /\b(learn|paper|study|tutorial|how to|course|lecture|docs|documentation|research)\b/],
  ['entertainment', /\b(movie|film|show|song|album|game|podcast|episode|trailer|concert)\b/],
  ['news', /\b(news|election|breaking|announced|report)\b/],
  ['personal', /\b(birthday|mom|dad|kids?|family|wife|husband|doctor|dentist|health|vacation|trip)\b/],
];

export function rulesCategory(body, previews = []) {
  const text = [body, ...previews.map((p) => `${p.title || ''} ${p.description || ''}`)].join(' ').toLowerCase();
  // Words about intent ("buy", "remember to") beat the website.
  for (const [cat, re] of WORD_RULES.slice(0, 2)) if (re.test(text)) return cat;
  for (const url of extractUrls(body)) {
    const h = hostOf(url);
    for (const [cat, hosts] of SITE_RULES) if (hosts.some((d) => h === d || h.endsWith('.' + d))) return cat;
  }
  for (const [cat, re] of WORD_RULES.slice(2)) if (re.test(text)) return cat;
  return 'other';
}

