import type { APIRoute } from 'astro';
import { buildRssFeed } from '../../lib/blog-feed';
import { feedPosts } from '../../lib/blog-routes';
import { useTranslations } from '../../i18n/utils';

/** English blog feed. Built once, served as a static file. */
export const GET: APIRoute = async () => {
  const t = useTranslations('en');
  const xml = buildRssFeed('en', await feedPosts('en'), {
    title: t('blog.feedTitle'),
    description: t('pages.blog.description'),
  });

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
};
