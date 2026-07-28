import { APP_SIGNUP_URL } from '../config';
import type { Lang } from '../i18n/utils';

/**
 * The official catalogue, verified against the application's public plan
 * catalogue on 2026-07-28. This file is the single source of truth for every
 * price and limit on the site: change the numbers here, nowhere else.
 *
 * Human copy (names, taglines, qualitative feature lines) lives in the i18n
 * dictionaries under `pricing.plans.<id>` and is looked up by `id`.
 *
 * Annual billing is ten monthly instalments — two months free. Prices exclude VAT.
 */

/** How a paid add-on is offered on a given plan. */
export type Addon =
  | { kind: 'included' }
  | { kind: 'addon'; price: number }
  | { kind: 'unavailable' }
  /**
   * Priced in the catalogue but NOT yet switched on in the admin console, so
   * the application doesn't offer it. Rendered as unavailable until the console
   * catches up — see WHITE_LABEL_ENTRY_LIVE.
   */
  | { kind: 'pending'; price: number };

export type PlanId = 'free' | 'starterS' | 'starterM' | 'starterL' | 'business';

export type Plan = {
  id: PlanId;
  /** EUR per month, excl. VAT. */
  monthly: number;
  /** EUR per year, excl. VAT — ten monthly instalments. */
  annual: number;
  domains: number;
  /** `null` means unlimited. */
  users: number | null;
  historyDays: number;
  /** Messages per month; `null` means unlimited. */
  messages: number | null;
  aiInsights: Addon;
  whiteLabel: Addon;
  /** EUR/month per domain beyond `domains`; `null` when the plan doesn't allow it. */
  extraDomain: number | null;
  highlighted: boolean;
  /** 'app' → external sign-up URL; 'contact' → localized /contact page. */
  ctaKind: 'app' | 'contact';
  ctaHref: string;
};

/**
 * The €5/mo white-label add-on is defined for Starter S and Starter M but has
 * no price configured in the admin console, so the application does not offer
 * it. Until an admin sets it, the site must NOT advertise "white-label from
 * €5/mo". Flip this to `true` only once both plans are configured in console.
 */
export const WHITE_LABEL_ENTRY_LIVE = false;

/** A real, perpetual tier — not a trial. Rendered as a band above the cards. */
export const freePlan: Plan = {
  id: 'free',
  monthly: 0,
  annual: 0,
  domains: 1,
  users: 1,
  historyDays: 30,
  messages: 1_000,
  aiInsights: { kind: 'unavailable' },
  whiteLabel: { kind: 'unavailable' },
  extraDomain: null,
  highlighted: false,
  ctaKind: 'app',
  ctaHref: APP_SIGNUP_URL,
};

/** The 30-day trial: the front door, with every feature and add-on switched on. */
export const trial = {
  days: 30,
  domains: 3,
  users: 3,
  historyDays: 30,
  messages: 10_000,
} as const;

export const paidPlans: Plan[] = [
  {
    id: 'starterS',
    monthly: 5,
    annual: 50,
    domains: 1,
    users: 3,
    historyDays: 30,
    messages: 10_000,
    aiInsights: { kind: 'addon', price: 4 },
    whiteLabel: { kind: 'pending', price: 5 },
    extraDomain: null,
    highlighted: false,
    ctaKind: 'app',
    ctaHref: APP_SIGNUP_URL,
  },
  {
    id: 'starterM',
    monthly: 18,
    annual: 180,
    domains: 5,
    users: 10,
    historyDays: 60,
    messages: 25_000,
    aiInsights: { kind: 'addon', price: 7 },
    whiteLabel: { kind: 'pending', price: 5 },
    extraDomain: null,
    highlighted: true,
    ctaKind: 'app',
    ctaHref: APP_SIGNUP_URL,
  },
  {
    id: 'starterL',
    monthly: 50,
    annual: 500,
    domains: 25,
    users: 50,
    historyDays: 180,
    messages: 100_000,
    aiInsights: { kind: 'addon', price: 25 },
    whiteLabel: { kind: 'addon', price: 12.5 },
    extraDomain: 4,
    highlighted: false,
    ctaKind: 'app',
    ctaHref: APP_SIGNUP_URL,
  },
  {
    id: 'business',
    monthly: 200,
    annual: 2_000,
    domains: 100,
    users: null,
    historyDays: 180,
    messages: null,
    aiInsights: { kind: 'addon', price: 100 },
    whiteLabel: { kind: 'included' },
    extraDomain: null,
    highlighted: false,
    ctaKind: 'app',
    ctaHref: APP_SIGNUP_URL,
  },
];

/** Free first, then the paid ladder — the order the comparison table uses. */
export const allPlans: Plan[] = [freePlan, ...paidPlans];

/**
 * Resolve an add-on to what a customer can actually buy today. A 'pending'
 * add-on reads as unavailable until it is configured in the console, so the
 * site never sells something the application won't show.
 */
export function resolveAddon(addon: Addon): Addon {
  if (addon.kind === 'pending') {
    return WHITE_LABEL_ENTRY_LIVE ? { kind: 'addon', price: addon.price } : { kind: 'unavailable' };
  }
  return addon;
}

/**
 * The lowest price at which the white-label add-on is genuinely purchasable.
 * Derived from the catalogue so it can never drift from the plans above:
 * €12.50 (Starter L) today, €5 once the entry plans are configured.
 */
export const whiteLabelFromPrice = Math.min(
  ...paidPlans
    .map((plan) => resolveAddon(plan.whiteLabel))
    .flatMap((addon) => (addon.kind === 'addon' ? [addon.price] : [])),
);

const NUMBER_LOCALE: Record<Lang, string> = { en: 'en-GB', it: 'it-IT' };

/**
 * Italian CLDR data sets minimumGroupingDigits to 2, so it-IT would render
 * 1000 as "1000" and only group from five digits up. The catalogue writes
 * "1.000" and "€2.000", so grouping is forced on for both languages.
 */
const GROUPING = { useGrouping: 'always' } as const satisfies Intl.NumberFormatOptions;

/**
 * "€5" / "€12.50" in English, "€5" / "€12,50" in Italian. The symbol is
 * prefixed rather than left to Intl's currency style, which renders "5 €" for
 * it-IT — the catalogue and the application both write it "€5".
 */
export function formatPrice(value: number, lang: Lang): string {
  const amount = new Intl.NumberFormat(NUMBER_LOCALE[lang], {
    ...GROUPING,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `€${amount}`;
}

/** "100,000" in English, "100.000" in Italian. */
export function formatCount(value: number, lang: Lang): string {
  return new Intl.NumberFormat(NUMBER_LOCALE[lang], GROUPING).format(value);
}
