import en from './en.json';
import it from './it.json';

/** Short codes shown in the language switch. */
export const languages = { en: 'EN', it: 'IT' } as const;
export const languageNames = { en: 'English', it: 'Italiano' } as const;
export const locales = ['en', 'it'] as const;
export const defaultLang = 'en';

export type Lang = keyof typeof languages;

const dictionaries: Record<Lang, unknown> = { en, it };

export function isLang(value: string | undefined | null): value is Lang {
  return value === 'en' || value === 'it';
}

/**
 * Resolve a dot-path key against the active dictionary, falling back to the
 * default language if a key is missing. Returns strings, arrays or objects.
 */
export function useTranslations(lang: Lang) {
  const dict = dictionaries[lang] ?? dictionaries[defaultLang];
  const fallback = dictionaries[defaultLang];

  const resolve = (source: unknown, key: string): unknown =>
    key.split('.').reduce<unknown>((acc, part) => {
      if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[part];
      }
      return undefined;
    }, source);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function t(key: string): any {
    const value = resolve(dict, key);
    return value === undefined ? resolve(fallback, key) : value;
  };
}

/** Normalise a pathname: drop trailing slash (except root). */
function normalise(pathname: string): string {
  const p = pathname.replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

/** Detect the active language from a pathname (fallback when no Astro context). */
export function getCurrentLang(pathname: string): Lang {
  const p = normalise(pathname);
  return p === '/it' || p.startsWith('/it/') ? 'it' : 'en';
}

/** Strip the locale prefix, returning the logical path (e.g. "/contact"). */
export function stripLocale(pathname: string): string {
  const p = normalise(pathname);
  if (p === '/it') return '/';
  if (p.startsWith('/it/')) return p.slice(3);
  return p;
}

/** Ensure a trailing slash (root stays "/"). Matches trailingSlash: 'always'. */
function withTrailingSlash(p: string): string {
  if (p === '/') return '/';
  return p.endsWith('/') ? p : `${p}/`;
}

/** Build the URL for a logical path (e.g. "/contact") in the given language. */
export function localizePath(logicalPath: string, lang: Lang): string {
  let p = logicalPath.startsWith('/') ? logicalPath : `/${logicalPath}`;
  p = normalise(p);
  const localized = lang === defaultLang ? p : p === '/' ? '/it' : `/it${p}`;
  return withTrailingSlash(localized);
}

/** Given the current pathname, return the equivalent path in the target language. */
export function alternatePath(pathname: string, lang: Lang): string {
  return localizePath(stripLocale(pathname), lang);
}
