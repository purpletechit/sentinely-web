/**
 * Central site configuration.
 * The marketing site lives on the apex (sentinely.eu); the product app lives on
 * app.sentinely.eu. Every "Log in / Start free trial / Try it free" CTA points
 * at the app. See README for the apex cutover note (owner's responsibility).
 */
export const SITE_ORIGIN = 'https://sentinely.eu';
export const APP_URL = 'https://app.sentinely.eu';

/** Where the app sign-up / trial flow starts. */
export const APP_SIGNUP_URL = `${APP_URL}/register`;
export const APP_LOGIN_URL = `${APP_URL}/login`;

/** Company / contact details (Purple IT s.r.l.). */
export const CONTACT_EMAIL = 'info@sentinely.eu';

/** Social / OG defaults. */
export const OG_IMAGE = '/og.png';
export const TWITTER_HANDLE = '';
