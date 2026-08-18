/**
 * `getStaticPaths` helpers for the blog.
 *
 * Everything the routes need is derived here from both languages at once,
 * because the interesting questions are cross-language ones: does this post
 * exist in Italian, does the other language have a page 3, does this category
 * exist over there. Answering them from the data — rather than from a path
 * rule — is what keeps hreflang pointing at pages that are really built.
 */
import {
  POSTS_PER_PAGE,
  blogIndexPath,
  getPosts,
  getTerms,
  paginate,
  postAlternates,
  postPath,
  postsInTerm,
  termPath,
  type Alternates,
  type Paged,
  type PostEntry,
  type TermEntry,
  type TermKind,
} from './blog';
import { locales, type Lang } from '../i18n/utils';

interface BlogWorld {
  posts: Record<Lang, PostEntry[]>;
  categories: Record<Lang, TermEntry[]>;
  tags: Record<Lang, TermEntry[]>;
}

async function loadWorld(): Promise<BlogWorld> {
  const world: BlogWorld = {
    posts: {} as Record<Lang, PostEntry[]>,
    categories: {} as Record<Lang, TermEntry[]>,
    tags: {} as Record<Lang, TermEntry[]>,
  };
  for (const lang of locales) {
    world.posts[lang] = await getPosts(lang);
    world.categories[lang] = await getTerms(lang, 'category');
    world.tags[lang] = await getTerms(lang, 'tag');
  }
  return world;
}

function pageCount(items: unknown[]): number {
  return Math.max(1, Math.ceil(items.length / POSTS_PER_PAGE));
}

export interface ListingPageProps {
  page: Paged<PostEntry>;
  alternates: Alternates;
  categories: TermEntry[];
  tags: TermEntry[];
}

/**
 * The blog index: page 1 at `/blog/`, the rest at `/blog/2/`.
 *
 * Always yields at least one page. With no posts at all that page is the one
 * that has to exist to say so.
 */
export async function listingPaths(lang: Lang) {
  const world = await loadWorld();
  const counts = Object.fromEntries(
    locales.map((code) => [code, pageCount(world.posts[code])]),
  ) as Record<Lang, number>;

  return paginate(world.posts[lang]).map((page) => ({
    params: { page: page.current === 1 ? undefined : String(page.current) },
    props: {
      page,
      alternates: Object.fromEntries(
        locales
          .filter((code) => page.current <= counts[code])
          .map((code) => [code, blogIndexPath(code, page.current)]),
      ) as Alternates,
      categories: world.categories[lang],
      tags: world.tags[lang],
    } satisfies ListingPageProps,
  }));
}

export interface PostPageProps {
  post: PostEntry;
  alternates: Alternates;
  /** Where the header language switch should send each language. */
  switchTo: Alternates;
}

/** One page per published post in this language. */
export async function postPaths(lang: Lang) {
  const posts = await getPosts(lang);

  return posts.map((post) => {
    const alternates = postAlternates(post);
    return {
      params: { slug: post.data.slug },
      props: {
        post,
        alternates,
        // Where a translation does not exist there is no hreflang to emit —
        // but the switch still has to lead somewhere real, so it falls back to
        // that language's blog index rather than to an invented slug.
        switchTo: Object.fromEntries(
          locales.map((code) => [code, alternates[code] ?? blogIndexPath(code)]),
        ) as Alternates,
      } satisfies PostPageProps,
    };
  });
}

export interface TermPageProps {
  term: TermEntry;
  page: Paged<PostEntry>;
  alternates: Alternates;
  switchTo: Alternates;
  categories: TermEntry[];
  tags: TermEntry[];
}

/**
 * Category and tag pages.
 *
 * ⚠️ Generated only where posts actually exist. The loader already drops terms
 * the API reports with `postCount: 0`; this intersects that with the posts we
 * really loaded, so no empty listing can reach the sitemap under any
 * disagreement between the two.
 */
export async function termPaths(lang: Lang, kind: TermKind) {
  const world = await loadWorld();
  const termsByLang = kind === 'category' ? world.categories : world.tags;
  const paths = [];

  for (const term of termsByLang[lang]) {
    const posts = postsInTerm(world.posts[lang], kind, term.data.termId);
    if (posts.length === 0) continue;

    // The same term in the other language, if it has one and it is not empty
    // there either. Matched on the term id: slugs and names are per-language.
    const counterparts = new Map<Lang, { term: TermEntry; pages: number }>();
    for (const code of locales) {
      const twin = termsByLang[code].find((candidate) => candidate.data.termId === term.data.termId);
      if (!twin) continue;
      const twinPosts = postsInTerm(world.posts[code], kind, term.data.termId);
      if (twinPosts.length === 0) continue;
      counterparts.set(code, { term: twin, pages: pageCount(twinPosts) });
    }

    for (const page of paginate(posts)) {
      const alternates: Alternates = {};
      for (const [code, counterpart] of counterparts) {
        if (page.current > counterpart.pages) continue;
        alternates[code] = termPath(code, kind, counterpart.term.data.slug, page.current);
      }

      paths.push({
        params: {
          slug: term.data.slug,
          page: page.current === 1 ? undefined : String(page.current),
        },
        props: {
          term,
          page,
          alternates,
          switchTo: Object.fromEntries(
            locales.map((code) => [code, alternates[code] ?? blogIndexPath(code)]),
          ) as Alternates,
          categories: world.categories[lang],
          tags: world.tags[lang],
        } satisfies TermPageProps,
      });
    }
  }

  return paths;
}

/** Posts for the feed of one language, newest first and capped. */
export async function feedPosts(lang: Lang, limit = 20): Promise<PostEntry[]> {
  return (await getPosts(lang)).slice(0, limit);
}

export { postPath };
