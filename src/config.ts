/**
 * Central site configuration.
 * The marketing site lives on the apex (sentinely.eu); the product app lives on
 * app.sentinely.eu. Every "Log in / Start free trial / Try it free" CTA points
 * at the app. See README for the apex cutover note (owner's responsibility).
 */
export const SITE_ORIGIN = 'https://sentinely.eu';
export const APP_URL = 'https://app.sentinely.eu';

// CTA targets. Per the brief, all CTAs point at the app (https://app.sentinely.eu).
// They default to the app root to avoid assuming sub-routes; if the app exposes
// dedicated paths (e.g. /register, /login), point these there.
export const APP_SIGNUP_URL = APP_URL;
export const APP_LOGIN_URL = APP_URL;

/** Company / contact details (Purple IT s.r.l.). */
export const CONTACT_EMAIL = 'info@sentinely.eu';

/** Social / OG defaults. */
export const OG_IMAGE = '/og.png';
export const TWITTER_HANDLE = '';
