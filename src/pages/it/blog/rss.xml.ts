import type { APIRoute } from 'astro';
import { buildRssFeed } from '../../../lib/blog-feed';
import { feedPosts } from '../../../lib/blog-routes';
import { useTranslations } from '../../../i18n/utils';

/** Italian blog feed. Only posts published in Italian appear in it. */
export const GET: APIRoute = async () => {
  const t = useTranslations('it');
  const xml = buildRssFeed('it', await feedPosts('it'), {
    title: t('blog.feedTitle'),
    description: t('pages.blog.description'),
  });

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
};
