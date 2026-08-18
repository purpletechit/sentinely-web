/**
 * Shared blog helpers: querying the collections, paginating, building URLs and
 * working out which pages exist in the other language.
 *
 * All of it runs at build time. Nothing here is shipped to the browser.
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import { localizePath, type Lang } from '../i18n/utils';
import { SITE_ORIGIN } from '../config';

export type PostEntry = CollectionEntry<'blog'>;
export type TermEntry = CollectionEntry<'blogTaxonomies'>;
export type TermKind = TermEntry['data']['kind'];

/** Cards sit in a three-column grid on wide screens, so nine fills it evenly. */
export const POSTS_PER_PAGE = 9;

/** Most recent first. A post without a date sorts last rather than crashing. */
export function sortPosts(posts: PostEntry[]): PostEntry[] {
  return [...posts].sort((a, b) => {
    const left = a.data.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    const right = b.data.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (left !== right) return right - left;
    return a.data.title.localeCompare(b.data.title);
  });
}

/**
 * Published posts in one language, newest first.
 *
 * ⚠️ Filtered by locale on purpose. A piece published only in English is a
 * legitimate state, and it must NOT appear in the Italian listing to pad it
 * out — that would show readers a language they did not ask for and put
 * duplicate content under the wrong hreflang.
 */
export async function getPosts(lang: Lang): Promise<PostEntry[]> {
  return sortPosts(await getCollection('blog', ({ data }) => data.locale === lang));
}

/** Terms of one kind in one language. The loader already dropped empty ones. */
export async function getTerms(lang: Lang, kind: TermKind): Promise<TermEntry[]> {
  const terms = await getCollection(
    'blogTaxonomies',
    ({ data }) => data.locale === lang && data.kind === kind,
  );
  return terms.sort((a, b) => a.data.name.localeCompare(b.data.name));
}

export function postsInTerm(posts: PostEntry[], kind: TermKind, termId: string): PostEntry[] {
  return posts.filter((post) =>
    kind === 'category'
      ? post.data.category?.id === termId
      : post.data.tags.some((tag) => tag.id === termId),
  );
}

export interface Paged<T> {
  items: T[];
  /** 1-based. */
  current: number;
  total: number;
  size: number;
}

/**
 * Split into pages, always returning at least one page.
 *
 * That last part matters: with zero posts we still need `/blog/` to exist so it
 * can say there is nothing here yet.
 */
export function paginate<T>(items: T[], size = POSTS_PER_PAGE): Array<Paged<T>> {
  const total = Math.max(1, Math.ceil(items.length / size));
  return Array.from({ length: total }, (_unused, index) => ({
    items: items.slice(index * size, (index + 1) * size),
    current: index + 1,
    total,
    size: items.length,
  }));
}

/* ---------------------------------------------------------------------------
   URLs. Every path goes through localizePath, so it carries the /it prefix and
   the trailing slash Cloudflare Pages serves.
   --------------------------------------------------------------------------- */

export function blogIndexPath(lang: Lang, page = 1): string {
  return localizePath(page > 1 ? `/blog/${page}` : '/blog', lang);
}

export function postPath(lang: Lang, slug: string): string {
  return localizePath(`/blog/${slug}`, lang);
}

export function termPath(lang: Lang, kind: TermKind, slug: string, page = 1): string {
  const base = `/blog/${kind}/${slug}`;
  return localizePath(page > 1 ? `${base}/${page}` : base, lang);
}

export function feedPath(lang: Lang): string {
  // An extension-bearing route: no trailing slash, unlike the page routes.
  return lang === 'en' ? '/blog/rss.xml' : '/it/blog/rss.xml';
}

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_ORIGIN).href;
}

/* ---------------------------------------------------------------------------
   Language alternates.

   These are computed from pages that actually exist, never from a path rule.
   A post can live in one language only; a category can exist in one language
   only; and the two listings can have a different number of pages. Guessing
   "same path with /it in front" would emit hreflang pointing at 404s.
   --------------------------------------------------------------------------- */

export type Alternates = Partial<Record<Lang, string>>;

/** Alternates for a post, straight from what the API says is published. */
export function postAlternates(post: PostEntry): Alternates {
  const alternates: Alternates = { [post.data.locale]: postPath(post.data.locale, post.data.slug) };
  for (const translation of post.data.translations) {
    alternates[translation.locale] = postPath(translation.locale, translation.slug);
  }
  return alternates;
}

/** Alternates for listing page `page`, given how many pages each language has. */
export function listingAlternates(page: number, pageCounts: Record<Lang, number>): Alternates {
  const alternates: Alternates = {};
  for (const lang of ['en', 'it'] as Lang[]) {
    if (page <= pageCounts[lang]) alternates[lang] = blogIndexPath(lang, page);
  }
  return alternates;
}

export function formatDate(date: Date | null, lang: Lang): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', { dateStyle: 'long' }).format(date);
}

/** `<title>` and meta description prefer the SEO fields when the author set them. */
export function metaTitle(post: PostEntry): string {
  return post.data.seoTitle?.trim() || post.data.title;
}

export function metaDescription(post: PostEntry): string {
  return post.data.seoDescription?.trim() || post.data.excerpt;
}

/**
 * BlogPosting structured data. `imageUrl` is the optimised, absolute URL of the
 * cover as it will actually be served — the caller has it after `getImage()`.
 *
 * There is no `dateModified`: the API does not expose an updated timestamp, and
 * a made-up one is worse than none.
 */
export function blogPostingJsonLd(post: PostEntry, imageUrl?: string): Record<string, unknown> {
  const url = absoluteUrl(postPath(post.data.locale, post.data.slug));
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.data.title,
    description: metaDescription(post),
    inLanguage: post.data.locale,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    ...(post.data.publishedAt ? { datePublished: post.data.publishedAt.toISOString() } : {}),
    author: { '@type': 'Person', name: post.data.authorName },
    publisher: {
      '@type': 'Organization',
      name: 'Sentinely',
      logo: { '@type': 'ImageObject', url: absoluteUrl('/brand/sentinely-logo-bimi.svg') },
    },
    ...(imageUrl ? { image: [imageUrl] } : {}),
    ...(post.data.category ? { articleSection: post.data.category.name } : {}),
    ...(post.data.tags.length ? { keywords: post.data.tags.map((tag) => tag.name).join(', ') } : {}),
  };
}
