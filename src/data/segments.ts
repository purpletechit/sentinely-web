/**
 * The three audiences Sentinely is sold to. One product, one promise, three
 * doors: each page frames the same DMARC evidence in that audience's language.
 *
 * Slugs are shared across locales — the router prefixes `/it` — so they stay in
 * English. Human copy lives in the i18n dictionaries under `solutions.<id>`.
 */
export type SegmentId = 'marketing' | 'security' | 'agencies';

export type Segment = {
  id: SegmentId;
  /** Logical path, passed through `localizePath` for the active language. */
  path: string;
};

export const segments: Segment[] = [
  { id: 'marketing', path: '/solutions/email-marketing' },
  { id: 'security', path: '/solutions/it-security' },
  { id: 'agencies', path: '/solutions/agencies' },
];
