/**
 * Build-time client for the product's public blog API.
 *
 * ⚠️ This module runs in Node during `astro build` — NEVER in the browser. The
 * blog is static: pages are generated at build time so search engines get real
 * HTML. A `fetch` from the client would defeat the whole point (and there is no
 * CORS grant for these routes anyway).
 *
 * ⚠️ Every function here THROWS on failure, and nothing catches it. That is the
 * contract: if the API is unreachable, the build must die. Cloudflare Pages
 * keeps the previous deployment online when a build fails, so a red build means
 * yesterday's site — with all its posts — stays up. A `try/catch` falling back
 * to "zero posts" would instead publish a blog-less site, and Google would
 * deindex every article before anyone noticed.
 *
 * The origin is `APP_URL` from src/config.ts — the same constant the header
 * analyzer uses. No second env var for the same value.
 */
import { APP_URL } from '../config';

/** Read-only, public, published-only. Drafts never cross this boundary. */
export const BLOG_API_BASE = `${APP_URL}/api/v1/blog`;

export const BLOG_LOCALES = ['en', 'it'] as const;
export type BlogLocale = (typeof BLOG_LOCALES)[number];

/** The API's hard ceiling on `limit`; asking for more is a 422. */
const MAX_LIMIT = 100;

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;

export interface BlogTerm {
  id: string;
  slug: string;
  /** Already localised by the API — do not translate it again on this side. */
  name: string;
}

export interface BlogTaxonomyTerm extends BlogTerm {
  /** Counts PUBLISHED posts only: a term with only drafts reports 0. */
  postCount: number;
}

export interface BlogMedia {
  id: string;
  /** Relative to the API origin, e.g. `/api/v1/blog/media/<id>`. */
  url: string;
  mimeType: string;
  alt: string | null;
  /** `null` when the file could not be measured. `null` is not `0`. */
  width: number | null;
  height: number | null;
}

export interface BlogPostSummary {
  id: string;
  locale: BlogLocale;
  translationKey: string;
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  authorName: string;
  category: BlogTerm | null;
  tags: BlogTerm[];
  coverMedia: BlogMedia | null;
}

export interface BlogPostDetail extends BlogPostSummary {
  /** Markdown, not HTML. Present only on the detail route. */
  bodyMarkdown: string;
  /** The OTHER published languages of this same piece. May be empty. */
  translations: Array<{ locale: BlogLocale; slug: string }>;
}

export interface BlogTaxonomies {
  categories: BlogTaxonomyTerm[];
  tags: BlogTaxonomyTerm[];
}

/**
 * Thrown for anything that stops us getting the real content: DNS failure,
 * refused connection, timeout, a non-2xx status, or a body that is not the
 * shape the contract promises.
 */
export class BlogApiError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'BlogApiError';
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause;
    const code =
      cause && typeof cause === 'object' && 'code' in cause
        ? ` (${String((cause as { code: unknown }).code)})`
        : '';
    return `${error.name}: ${error.message}${code}`;
  }
  return String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** GET a JSON route, retrying only what is plausibly transient. */
async function apiGet<T>(path: string): Promise<T> {
  const url = `${BLOG_API_BASE}${path}`;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response;

    try {
      response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // Network level: unresolvable host, refused connection, timeout.
      lastError = new BlogApiError(
        `could not reach the blog API at ${url} — ${describe(error)}`,
        url,
        undefined,
        { cause: error },
      );
      if (attempt < MAX_ATTEMPTS) {
        await sleep(attempt * 1000);
        continue;
      }
      throw lastError;
    }

    if (!response.ok) {
      const body = (await response.text().catch(() => '')).slice(0, 400);
      const error = new BlogApiError(
        `the blog API answered ${response.status} ${response.statusText} for ${url}${body ? ` — ${body}` : ''}`,
        url,
        response.status,
      );
      // 4xx means we asked wrongly; asking again the same way will not help.
      if (response.status < 500 || attempt === MAX_ATTEMPTS) throw error;
      lastError = error;
      await sleep(attempt * 1000);
      continue;
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new BlogApiError(
        `the blog API returned a body that is not JSON for ${url} — ${describe(error)}`,
        url,
        response.status,
        { cause: error },
      );
    }
  }

  throw lastError instanceof Error ? lastError : new BlogApiError(`failed to fetch ${url}`, url);
}

/**
 * Shape check with a readable failure. The collection schema validates every
 * field properly later; this exists so a changed contract reads as "the API
 * changed shape" instead of a stack trace deep inside Astro.
 */
function assertPost(value: unknown, url: string): asserts value is BlogPostSummary {
  if (!isRecord(value) || typeof value.slug !== 'string' || typeof value.title !== 'string') {
    const seen = JSON.stringify(value)?.slice(0, 200) ?? String(value);
    throw new BlogApiError(
      `unexpected post shape from ${url} — expected objects with at least { slug, title }, got ${seen}`,
      url,
    );
  }
}

/**
 * Every published post in one language.
 *
 * ⚠️ Paginated by `offset`. The query accepts ONLY `locale`, `limit` and
 * `offset`, and is strictly validated — sending `page` (which appears in the
 * response `meta` as a computed output, not an input) answers 422.
 */
export async function fetchAllPosts(locale: BlogLocale): Promise<BlogPostSummary[]> {
  const collected: BlogPostSummary[] = [];
  const seen = new Set<string>();
  let offset = 0;

  for (;;) {
    const path = `/posts?locale=${locale}&limit=${MAX_LIMIT}&offset=${offset}`;
    const url = `${BLOG_API_BASE}${path}`;
    const payload = await apiGet<{ data: unknown; meta: unknown }>(path);

    if (
      !Array.isArray(payload?.data) ||
      !isRecord(payload.meta) ||
      typeof payload.meta.total !== 'number'
    ) {
      throw new BlogApiError(
        `unexpected response shape from ${url} — expected { data: [], meta: { total: number } }`,
        url,
      );
    }

    for (const item of payload.data) {
      assertPost(item, url);
      // A post published between two turns of this loop shifts the window and
      // can repeat an entry; keep the first sighting.
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      collected.push(item);
    }

    // An empty page is the only termination we fully trust: `total` can move
    // underneath us while we walk.
    if (payload.data.length === 0 || collected.length >= payload.meta.total) break;
    offset += payload.data.length;
  }

  return collected;
}

/** One post, with its body and its other published languages. */
export async function fetchPost(locale: BlogLocale, slug: string): Promise<BlogPostDetail> {
  const path = `/posts/${locale}/${encodeURIComponent(slug)}`;
  const url = `${BLOG_API_BASE}${path}`;
  const post = await apiGet<unknown>(path);

  assertPost(post, url);
  if (typeof (post as BlogPostDetail).bodyMarkdown !== 'string') {
    throw new BlogApiError(`post ${locale}/${slug} came back without a bodyMarkdown string`, url);
  }
  return post as BlogPostDetail;
}

/** Categories and tags for one language, each with its published-post count. */
export async function fetchTaxonomies(locale: BlogLocale): Promise<BlogTaxonomies> {
  const path = `/taxonomies?locale=${locale}`;
  const url = `${BLOG_API_BASE}${path}`;
  const payload = await apiGet<{ data: unknown }>(path);
  const data = payload?.data;

  if (!isRecord(data) || !Array.isArray(data.categories) || !Array.isArray(data.tags)) {
    throw new BlogApiError(
      `unexpected response shape from ${url} — expected { data: { categories: [], tags: [] } }`,
      url,
    );
  }
  return data as unknown as BlogTaxonomies;
}

/** Absolute URL for a media path the API returns relative to its own origin. */
export function absoluteMediaUrl(relativeUrl: string): string {
  return new URL(relativeUrl, APP_URL).href;
}
