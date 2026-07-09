# Sentinely — marketing site

Static, bilingual (EN/IT) marketing/landing site for **Sentinely**, a multi-tenant
DMARC security / anti-spoofing SaaS. Built with **Astro + TypeScript + Tailwind v4**,
deployed to **Cloudflare Pages** (static build + Pages Functions for the forms).

- Production: `https://sentinely.eu` (apex) — the app lives on `https://app.sentinely.eu`.
- Every "Log in / Start free trial" CTA points at the app.

---

## Stack

| Concern        | Choice                                                       |
| -------------- | ------------------------------------------------------------ |
| Framework      | Astro (static output, zero heavy client JS)                  |
| Language       | TypeScript (`astro check` clean)                             |
| Styling        | Tailwind v4 (`@tailwindcss/vite`) + CSS custom-property tokens |
| i18n           | Astro i18n — EN at `/`, IT under `/it/` (no default prefix)  |
| Fonts          | System stack + system monospace (no webfonts)                |
| Forms          | Cloudflare Pages Functions + Turnstile + AWS SES (SigV4)     |
| Hosting        | Cloudflare Pages                                             |

---

## Getting started

```bash
npm install
npm run dev        # Astro dev server at http://localhost:4321
```

### Scripts

| Script            | What it does                                             |
| ----------------- | -------------------------------------------------------- |
| `npm run dev`     | Astro dev server                                         |
| `npm run build`   | Static build to `dist/`                                  |
| `npm run preview` | Preview the built site (Astro)                           |
| `npm run check`   | `astro check` — TypeScript / template diagnostics        |
| `npm run og`      | Regenerate favicons, app icons and the OG image (sharp)  |

Type-check the Pages Functions separately (they use Workers globals):

```bash
npx tsc -p functions/tsconfig.json --noEmit
```

---

## Project structure

```
public/                 Static assets (favicon.svg, og.png, robots.txt, manifest, icons)
scripts/generate-og.mjs Raster asset generator (run via `npm run og`)
functions/              Cloudflare Pages Functions
  api/contact.ts        POST /api/contact
  api/affiliate.ts      POST /api/affiliate
  _shared/form.ts       Shared validation + Turnstile + email sending
src/
  layouts/BaseLayout.astro   Head/SEO, hreflang, OG, theme, reveal script
  components/                Header, Footer, Hero, VerdictPanel, PricingTable, …
  components/pages/          Page bodies shared by EN + IT routes
  pages/                     EN routes at /, IT routes under /it/
  content/blog/              Blog content collection (one draft placeholder)
  data/                      pricing.ts (prices), signals.ts
  i18n/                      en.json, it.json, utils.ts
  styles/global.css          Design tokens (light/dark) + component classes
```

---

## Design system

All colours are CSS custom properties in `src/styles/global.css`, defined for light
and dark and switched via `prefers-color-scheme` plus a `:root[data-theme="…"]`
override printed by the header theme toggle. Tailwind utilities map to the same
variables via `@theme inline`, so `bg-surface`, `text-ink`, etc. follow the theme.

- **Accent** = warm orange `#E67423` (CTAs, beacon, eyebrows, focus).
- **Green / red** are **semantic only** (DMARC pass/fail), never used as accent.
- **Monospace** is a voice: eyebrows, labels, IPs, KPIs, prices.

---

## Internationalisation

- `defaultLocale: 'en'` at `/`, `it` under `/it/` (`prefixDefaultLocale: false`).
- All copy lives in `src/i18n/en.json` / `it.json`. No hard-coded strings.
- Components read `Astro.currentLocale` and resolve copy with `useTranslations(lang)`.
- `hreflang` alternates (en / it / x-default) and a localized sitemap are emitted
  automatically.
- The header language switch links to the same page in the other language.

To add a page, create the EN file under `src/pages/` and the IT counterpart under
`src/pages/it/`; both usually render the same body component from
`src/components/pages/`.

---

## Forms

Contact (`/contact`) and Affiliates (`/affiliates`) post JSON to Pages Functions:

- **Server-side validation** — required fields + email format (authoritative).
- **Honeypot** — hidden `website_hp` field; filled submissions are accepted then
  silently dropped.
- **Turnstile** — verified server-side against `TURNSTILE_SECRET_KEY`. If the secret
  is absent (local dev), verification is skipped.
- **Email** — sent to `info@sentinely.eu` with `Reply-To` = the sender, via **AWS
  SES v2** (SigV4 signed with `aws4fetch`). Falls back to **Resend** if SES creds are
  absent. If neither is configured, the request still succeeds and logs a warning
  (dev convenience) — no email is sent.

### Testing forms locally

```bash
npm run build
npx wrangler pages dev dist        # serves the static site + functions
# then, in another terminal:
curl -X POST http://127.0.0.1:8788/api/contact \
  -H 'content-type: application/json' \
  -d '{"name":"Jane","email":"jane@example.com","message":"Hi","lang":"en"}'
```

For a real end-to-end email, create `.dev.vars` (copy from `.dev.vars.example`) with
Turnstile + SES (or Resend) credentials, then run `wrangler pages dev` and submit the
form in the browser.

---

## Environment variables & secrets

### Build-time (public — embedded in the client bundle)

| Name                         | Where                | Notes                                     |
| ---------------------------- | -------------------- | ----------------------------------------- |
| `PUBLIC_TURNSTILE_SITE_KEY`  | Pages build settings | Turnstile **site** key for the widget. Falls back to Cloudflare's "always passes" test key if unset. See `.env.example`. |

### Runtime (secrets — set in Pages → Settings → Environment variables)

| Name                    | Required | Notes                                            |
| ----------------------- | -------- | ------------------------------------------------ |
| `TURNSTILE_SECRET_KEY`  | yes\*    | Turnstile **secret** key. Without it, anti-bot verification is skipped. |
| `AWS_ACCESS_KEY_ID`     | yes\*\*  | AWS SES (recommended provider).                  |
| `AWS_SECRET_ACCESS_KEY` | yes\*\*  | AWS SES.                                         |
| `AWS_REGION`            | no       | SES region (default `eu-west-1`). Match the region where `sentinely.eu` is verified. |
| `MAIL_TO`               | no       | Recipient (default `info@sentinely.eu`).         |
| `MAIL_FROM`             | no       | Sender (default `Sentinely <noreply@sentinely.eu>`). |
| `RESEND_API_KEY`        | no       | Resend fallback (used only if SES creds absent). |

\* Strongly recommended in production. \*\* Required for real email delivery (or use `RESEND_API_KEY`).

See `.env.example` (build-time) and `.dev.vars.example` (runtime, local).

---

## Deploy to Cloudflare Pages

DNS is already on Cloudflare. Create a Pages project pointing at this repo with:

- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Functions:** auto-detected from `functions/` (no extra config).
- **Environment variables / secrets:** set the values from the tables above
  (build-time `PUBLIC_TURNSTILE_SITE_KEY`, runtime Turnstile + SES/Resend).

Manual deploy (optional):

```bash
npm run build
npx wrangler pages deploy dist
```

A `*.pages.dev` preview URL is produced automatically on each deploy.

### ⚠️ Apex cutover — owner's responsibility (do NOT do this as part of the site build)

The apex `sentinely.eu` currently issues a `301 → app.sentinely.eu` via Traefik.
When this site is ready, the **owner** switches the apex to Cloudflare Pages and
removes that transitional 301 on the app side. The site build/preview does not touch
the app, DNS, or the apex.

---

## What's still outstanding (before go-live)

- **Legal text** — `/privacy`, `/terms`, `/gdpr` are structured **placeholders** with
  real company data (Purple IT s.r.l.). Replace with legally reviewed copy; a notice
  banner marks them as placeholder until then.
- **Pricing** — `€19` / `€59` / Custom are **placeholders**. Edit `src/data/pricing.ts`
  (single source of truth for prices) and feature lists in `src/i18n/*.json`.
- **Blog** — collection is provisioned with one `draft: true` placeholder; no posts are
  published yet. The footer "Blog" link is marked *soon*. Add Markdown files under
  `src/content/blog/` with `draft: false` to publish.
- **Turnstile keys** — create a Turnstile widget for `sentinely.eu` and set the real
  site/secret keys.

---

## Company

Sentinely is a product of **Purple IT s.r.l.** — Perugia (PG), Italy — VAT
`IT01881930661` — `info@sentinely.eu`.
