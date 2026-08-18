import { defineCollection } from 'astro:content';
import { z } from 'zod';
import { blogPostsLoader, blogTaxonomiesLoader } from './loaders/blog';

/**
 * The blog lives in the product database and is written in the app console.
 * These collections pull it in during the build, so every article ships as
 * static HTML. Nothing is fetched from the browser.
 *
 * Both loaders fail the build if the API cannot be reached — see
 * src/loaders/blog.ts for why that is the point rather than a rough edge.
 */

const locale = z.enum(['en', 'it']);

/** A category or a tag as it appears on a post. `name` arrives localised. */
const term = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
});

const blog = defineCollection({
  loader: blogPostsLoader(),
  schema: z.object({
    postId: z.string(),
    locale,
    /** Ties the language versions of one piece together. */
    translationKey: z.string(),
    slug: z.string(),
    title: z.string(),
    excerpt: z.string(),
    /** Nullable in the contract, always set in practice. Never invented here. */
    publishedAt: z.coerce.date().nullable().default(null),
    seoTitle: z.string().nullable().default(null),
    seoDescription: z.string().nullable().default(null),
    authorName: z.string(),
    category: term.nullable().default(null),
    tags: z.array(term).default([]),
    /** Downloaded during the build; `file` is relative to src/assets/blog/. */
    cover: z
      .object({
        file: z.string(),
        alt: z.string().nullable().default(null),
        width: z.number().nullable().default(null),
        height: z.number().nullable().default(null),
      })
      .nullable()
      .default(null),
    /** Other published languages of this same post. Empty is legitimate. */
    translations: z.array(z.object({ locale, slug: z.string() })).default([]),
  }),
});

/**
 * Categories and tags that have at least one published post. Terms with
 * `postCount: 0` never make it into the store, so no empty taxonomy page can
 * be generated from it.
 */
const blogTaxonomies = defineCollection({
  loader: blogTaxonomiesLoader(),
  schema: z.object({
    termId: z.string(),
    locale,
    kind: z.enum(['category', 'tag']),
    slug: z.string(),
    name: z.string(),
    postCount: z.number(),
  }),
});

export const collections = { blog, blogTaxonomies };
