/**
 * RSS 2.0 for the blog, one feed per language, written at build time.
 *
 * Hand-rolled rather than pulled from a package: the whole feed is a few
 * elements, and the parts that actually go wrong — escaping, RFC-822 dates,
 * relative URLs that break once a reader shows the item on its own — are
 * exactly the parts a dependency would hide.
 */
import { SITE_ORIGIN } from '../config';
import { absoluteUrl, feedPath, metaDescription, postPath, type PostEntry } from './blog';
import type { Lang } from '../i18n/utils';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Wrap HTML so a reader gets it verbatim, without letting it close the block. */
function cdata(html: string): string {
  return `<![CDATA[${html.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

/**
 * Root-relative URLs work on the site and break in a feed reader, which shows
 * the item on its own origin. The rendered body only ever has our own paths in
 * it — covers and body images are downloaded at build time — so making them
 * absolute is a straight substitution.
 */
function absolutise(html: string): string {
  return html.replace(/(\s(?:href|src)=")\/(?!\/)/g, `$1${SITE_ORIGIN}/`);
}

/** RFC-822, as RSS requires. `toUTCString()` is exactly that shape. */
function rfc822(date: Date): string {
  return date.toUTCString();
}

export interface FeedMeta {
  title: string;
  description: string;
}

export function buildRssFeed(lang: Lang, posts: PostEntry[], meta: FeedMeta): string {
  const selfUrl = absoluteUrl(feedPath(lang));
  const homeUrl = absoluteUrl(lang === 'en' ? '/blog/' : '/it/blog/');

  const dates = posts
    .map((post) => post.data.publishedAt)
    .filter((date): date is Date => date instanceof Date);
  const lastBuild = dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date();

  const items = posts
    .map((post) => {
      const url = absoluteUrl(postPath(lang, post.data.slug));
      // `rendered` is set by the loader through Astro's Markdown pipeline.
      const html = (post as { rendered?: { html?: string } }).rendered?.html;

      return [
        '    <item>',
        `      <title>${escapeXml(post.data.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        post.data.publishedAt ? `      <pubDate>${rfc822(post.data.publishedAt)}</pubDate>` : null,
        `      <description>${escapeXml(metaDescription(post))}</description>`,
        `      <dc:creator>${escapeXml(post.data.authorName)}</dc:creator>`,
        post.data.category
          ? `      <category>${escapeXml(post.data.category.name)}</category>`
          : null,
        ...post.data.tags.map((tag) => `      <category>${escapeXml(tag.name)}</category>`),
        html ? `      <content:encoded>${cdata(absolutise(html))}</content:encoded>` : null,
        '    </item>',
      ]
        .filter((line): line is string => line !== null)
        .join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(meta.title)}</title>
    <link>${escapeXml(homeUrl)}</link>
    <description>${escapeXml(meta.description)}</description>
    <language>${lang}</language>
    <lastBuildDate>${rfc822(lastBuild)}</lastBuildDate>
    <atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}
