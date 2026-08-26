/**
 * Central site configuration.
 * The marketing site lives on the apex (sentinely.eu); the product app lives on
 * app.sentinely.eu. Every "Log in / Start free / Try it free" CTA points at the
 * app. See README for the apex cutover note (owner's responsibility).
 */
export const SITE_ORIGIN = 'https://sentinely.eu';
export const APP_URL = 'https://app.sentinely.eu';

/**
 * Registration. A public route of the application: someone who has never signed
 * up lands on the sign-up form, not on a login screen they cannot get past.
 *
 * EVERY acquisition CTA on the site points here — the header button, the hero,
 * the closing panel, and all six of the pricing section's (Free, Trial and the
 * four plan cards). There is deliberately no second constant for "the app root
 * but for a CTA": choosing a plan is still choosing to sign up.
 */
export const APP_SIGNUP_URL = `${APP_URL}/sign-up`;

/**
 * Sign-in. The app root sends an unauthenticated visitor to the login form, so
 * the root IS the login entry point. Only "Log in" may point here — sending an
 * acquisition CTA to the root is what put a login form in front of people who
 * do not have an account yet.
 */
export const APP_LOGIN_URL = APP_URL;

/**
 * Cloudflare Turnstile SITE key — PUBLIC (embedded in the page and validated by
 * hostname, so committing it is safe and standard). Production uses the real
 * key; local dev uses Cloudflare's "always passes" test key. Overridable at
 * build via the PUBLIC_TURNSTILE_SITE_KEY env var. The matching SECRET key lives
 * only as a Cloudflare Pages secret (TURNSTILE_SECRET_KEY) — never in the repo.
 */
export const TURNSTILE_SITE_KEY = '0x4AAAAAADzLiVWZJ-TCyVmg';
export const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA';

/**
 * Public header-analysis endpoint, on the product API.
 *
 * ⚠️ The page calls this DIRECTLY from the browser — never through a Pages
 * Function. The product rate-limits this route per IP; a proxy would put
 * Cloudflare's IP on every request, so one abuser would burn the whole
 * allowance for everyone. CORS is configured product-side for this one route
 * and only for `https://sentinely.eu` / `https://www.sentinely.eu`, which is
 * why the call fails on localhost and on the pages.dev preview.
 */
export const HEADER_ANALYSIS_ENDPOINT = `${APP_URL}/api/v1/tools/header-analysis`;

/**
 * Input ceiling of that endpoint, in UTF-8 BYTES (not characters — a subject in
 * Cyrillic or CJK weighs up to 3× its `.length`). Mirrored here so the page can
 * refuse an oversized paste before spending a request on a certain 422.
 */
export const HEADER_ANALYSIS_MAX_BYTES = 64 * 1024;

/**
 * The two public domain-lookup tools, on the same product API and under the
 * same rule as the analysis above: the browser calls them DIRECTLY. Both are
 * rate-limited per IP product-side — 10/min for the DMARC report delivery,
 * 5/min for the SPF surface, which is lower because a single request there can
 * cost ten DNS queries. A Pages Function in front would hand Cloudflare's IP to
 * every request, so one abuser would spend the whole allowance for everyone.
 *
 * ⚠️ Neither fetch may send `credentials`: the API's CORS refuses them on
 * purpose, and sending them fails the request outright.
 */
export const DMARC_REPORT_DELIVERY_ENDPOINT = `${APP_URL}/api/v1/tools/dmarc-report-delivery`;
export const SPF_SURFACE_ENDPOINT = `${APP_URL}/api/v1/tools/spf-surface`;

/** Company / contact details (Purple IT s.r.l.). */
export const CONTACT_EMAIL = 'info@sentinely.eu';

/** Social / OG defaults. */
export const OG_IMAGE = '/og.png';
export const TWITTER_HANDLE = '';
