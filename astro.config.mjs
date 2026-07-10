// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Canonical production origin. The site is served from the apex (sentinely.eu);
// the app lives on app.sentinely.eu. See README for the apex cutover note.
const SITE = 'https://sentinely.eu';

// https://astro.build/config
export default defineConfig({
  site: SITE,
  // Cloudflare Pages serves `directory`-format output with a trailing slash and
  // 308-redirects the non-slash form. Match that so links/canonical/sitemap all
  // use the trailing slash and never trigger a redirect hop.
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'it'],
    routing: {
      // EN at root (/), IT under /it/. No prefix for the default locale.
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: {
          en: 'en',
          it: 'it',
        },
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
