import { APP_SIGNUP_URL } from '../config';

/**
 * Pricing structure. Prices are PLACEHOLDERS — confirm before go-live.
 * This is the single source of truth for prices: change the numbers here.
 * Human copy (names, taglines, feature lists) lives in the i18n dictionaries
 * under `pricing.tiers.<id>` and is looked up by `id`.
 */
export type PricingTier = {
  id: 'starter' | 'growth' | 'agency';
  /** Monthly price. `null` means "Custom" (shown via i18n priceLabel). */
  price: number | null;
  currency: string;
  currencySymbol: string;
  highlighted: boolean;
  /** 'app' → external sign-up URL; 'contact' → localized /contact page. */
  ctaKind: 'app' | 'contact';
  ctaHref: string;
};

export const pricingTiers: PricingTier[] = [
  {
    id: 'starter',
    price: 19,
    currency: 'EUR',
    currencySymbol: '€',
    highlighted: false,
    ctaKind: 'app',
    ctaHref: APP_SIGNUP_URL,
  },
  {
    id: 'growth',
    price: 59,
    currency: 'EUR',
    currencySymbol: '€',
    highlighted: true,
    ctaKind: 'app',
    ctaHref: APP_SIGNUP_URL,
  },
  {
    id: 'agency',
    price: null,
    currency: 'EUR',
    currencySymbol: '€',
    highlighted: false,
    ctaKind: 'contact',
    ctaHref: '/contact',
  },
];
