/**
 * Content-layer loaders that pull the blog out of the product API at build
 * time and hand it to Astro as ordinary collections.
 *
 * ⚠️ Nothing here catches a fetch failure. If the API is down, the loader
 * throws, `astro build` stops, and Cloudflare Pages keeps yesterday's
 * deployment — articles and all — online. That is the intended behaviour: the
 * alternative, quietly building a site with no blog, would get every article
 * deindexed. See src/lib/blog-api.ts.
 */
import type { Loader, LoaderContext } from 'astro/loaders';
import {
  BLOG_LOCALES,
  fetchAllPosts,
  fetchPost,
  fetchTaxonomies,
  type BlogLocale,
} from '../lib/blog-api';
import {
  BODY_MEDIA_DIR_NAME,
  COVER_DIR_NAME,
  downloadCover,
  localiseBodyImages,
  pruneMedia,
} from '../lib/blog-media';

/** The id of a post entry. Unique across both languages. */
export function postEntryId(locale: BlogLocale, slug: string): string {
  return `${locale}/${slug}`;
}

/** The id of a taxonomy entry. */
export function termEntryId(locale: BlogLocale, kind: 'category' | 'tag', slug: string): string {
  return `${locale}/${kind}/${slug}`;
}

/**
 * Turn any failure during the load into one message that says what broke, what
 * it means for this build, and what it does NOT mean for the live site.
 */
function fatal(error: unknown): never {
  const detail = error instanceof Error ? error.message : String(error);
  throw new Error(
    `Blog content could not be loaded from the product API: ${detail}\n\n` +
      `The blog is generated at build time, so this build cannot produce the blog pages ` +
      `and is stopping on purpose rather than publishing a site without them.\n` +
      `Cloudflare Pages keeps the previous deployment online when a build fails, so the live ` +
      `site and its existing articles are unaffected. Fix the API (or the network path to it) ` +
      `and run the build again.`,
    { cause: error },
  );
}

export function blogPostsLoader(): Loader {
  return {
    name: 'sentinely-blog-posts',
    load: async (context: LoaderContext) => {
      const { store, logger, config, parseData, generateDigest, renderMarkdown } = context;
      const coverFiles = new Set<string>();
      const bodyFiles = new Set<string>();
      let loaded = 0;

      try {
        store.clear();

        for (const locale of BLOG_LOCALES) {
          // The listing is deliberately light: no bodyMarkdown, no
          // translations. Both live on the detail route only.
          const summaries = await fetchAllPosts(locale);

          for (const summary of summaries) {
            const post = await fetchPost(locale, summary.slug);

            const cover = post.coverMedia ? await downloadCover(post.coverMedia, config.srcDir) : null;
            if (cover) coverFiles.add(cover.file);

            const body = await localiseBodyImages(post.bodyMarkdown, config.publicDir);
            for (const file of body.files) bodyFiles.add(file);

            const id = postEntryId(locale, post.slug);
            const data = await parseData({
              id,
              data: {
                postId: post.id,
                locale: post.locale,
                translationKey: post.translationKey,
                slug: post.slug,
                title: post.title,
                excerpt: post.excerpt,
                publishedAt: post.publishedAt,
                seoTitle: post.seoTitle,
                seoDescription: post.seoDescription,
                authorName: post.authorName,
                category: post.category,
                tags: post.tags ?? [],
                cover,
                // The OTHER published languages of this same piece. Empty is a
                // legitimate state: a post can exist in one language only.
                translations: post.translations ?? [],
              },
            });

            store.set({
              id,
              data,
              // Astro's own Markdown pipeline, so posts get the same rendering
              // (and syntax highlighting) as any local content.
              rendered: await renderMarkdown(body.markdown),
              digest: generateDigest({ ...data, body: body.markdown }),
            });
            loaded += 1;
          }
        }

        // Drop images belonging to posts that are gone.
        await pruneMedia(config.srcDir, COVER_DIR_NAME, coverFiles);
        await pruneMedia(config.publicDir, BODY_MEDIA_DIR_NAME, bodyFiles);

        logger.info(
          loaded === 0
            ? 'No published posts yet — the blog index will render its empty state.'
            : `Loaded ${loaded} published post(s) across ${BLOG_LOCALES.length} languages.`,
        );
      } catch (error) {
        fatal(error);
      }
    },
  };
}

export function blogTaxonomiesLoader(): Loader {
  return {
    name: 'sentinely-blog-taxonomies',
    load: async (context: LoaderContext) => {
      const { store, logger, parseData, generateDigest } = context;

      try {
        store.clear();
        let kept = 0;

        for (const locale of BLOG_LOCALES) {
          const taxonomies = await fetchTaxonomies(locale);
          const groups = [
            { kind: 'category' as const, terms: taxonomies.categories },
            { kind: 'tag' as const, terms: taxonomies.tags },
          ];

          for (const { kind, terms } of groups) {
            for (const term of terms) {
              // postCount counts published posts only. A term at 0 exists in
              // the console but has nothing to show: generating its page would
              // put an empty, indexable URL on the site.
              if (!term.postCount || term.postCount <= 0) continue;

              const id = termEntryId(locale, kind, term.slug);
              const data = await parseData({
                id,
                data: {
                  termId: term.id,
                  locale,
                  kind,
                  slug: term.slug,
                  // Already localised by the API. Never re-translated here.
                  name: term.name,
                  postCount: term.postCount,
                },
              });
              store.set({ id, data, digest: generateDigest(data) });
              kept += 1;
            }
          }
        }

        logger.info(`Loaded ${kept} blog taxonomy term(s) with at least one published post.`);
      } catch (error) {
        fatal(error);
      }
    },
  };
}
