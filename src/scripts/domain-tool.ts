/**
 * The half that the DMARC-delivery and SPF-surface tools have in common: one
 * domain field, one POST, and the reading of what came back.
 *
 * ⚠️ Unlike everything else under `src/lib/`, this module runs in the BROWSER.
 * It is imported from the `<script>` of the two tool components and bundled
 * with them.
 *
 * Three things are settled here once, so the two pages cannot drift apart:
 *
 * 1. ⚠️ **The call goes straight to the API.** Never through a Pages Function —
 *    both routes are rate-limited per IP, and a proxy would put Cloudflare's IP
 *    on every request. No `credentials`: the API's CORS refuses them. CORS is
 *    configured for `sentinely.eu` / `www.sentinely.eu` only, which is why the
 *    call cannot succeed from localhost or from a pages.dev preview.
 *
 * 2. ⚠️ **A 422 is part of the contract, not a crash.** The API answers an
 *    unlookupable domain (an IP address, `localhost`, a single label, a
 *    reserved suffix) with a field-level message that is already written for a
 *    human AND already localised — far better than anything this file could
 *    say. So it is preferred over our own fallback, which exists only for the
 *    case where the body is not what we expect.
 *
 * 3. ⚠️ **Everything the API returns is written with `textContent`.** A domain
 *    is a stranger's input and a DNS record is a stranger's text; neither may
 *    ever be parsed as HTML.
 *
 * Nothing is kept: no storage, no query-string prefill, nothing handed to
 * analytics. The domain typed here leaves no trace once the tab is closed.
 */

export type Severity = 'info' | 'warning' | 'critical';

export interface Note {
  code: string;
  severity: Severity;
  title: string;
  detail: string;
}

export interface RecordIssue {
  code: string;
  severity: Severity;
  message: string;
}

/** The fields both endpoints share, and the only ones this module reads. */
export interface DomainToolData {
  locale: string;
  domain: string;
  unicodeDomain: string;
  determinable: boolean;
  summary: string;
  notes: Note[];
}

/** Strings the script picks at runtime, handed over from the dictionaries. */
export interface DomainToolStrings {
  submit: string;
  submitBusy: string;
  statusBusy: string;
  statusDone: string;
  errors: {
    empty: string;
    invalid: string;
    rateLimited: string;
    network: string;
    server: string;
  };
  severity: Record<Severity, string>;
}

/**
 * Reads the strings island a tool component prints. Escaping `<` at render time
 * is what stops any string closing the script element early; parsing it here
 * keeps every dictionary lookup in one place.
 */
export function readStrings<T>(root: ParentNode, selector = '[data-tool-strings]'): T {
  const el = root.querySelector<HTMLScriptElement>(selector);
  return JSON.parse(el?.textContent ?? '{}') as T;
}

/** `chip` variant for one of the API's own severities. Info is never coloured. */
export function severityChip(severity: Severity): string {
  if (severity === 'critical') return 'chip chip-xs chip-fail';
  if (severity === 'warning') return 'chip chip-xs chip-warn';
  return 'chip chip-xs chip-muted';
}

/**
 * Tidies what somebody pasted into something worth spending a request on.
 *
 * Deliberately normalisation and NOT validation: people paste `me@example.com`
 * out of their address bar and `https://example.com/pricing` out of a tab, and
 * both plainly mean `example.com`. What is left after this goes to the API,
 * whose refusals name the actual problem ("that is an IP address", "that suffix
 * is reserved for local networks") in the visitor's language — a judgement this
 * file would only get wrong.
 */
export function normaliseDomain(raw: string): string {
  let value = raw.trim();
  if (value.length === 0) return '';

  // A pasted URL: drop the scheme, then everything from the first delimiter on.
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  // A pasted address: keep the domain half.
  const at = value.lastIndexOf('@');
  if (at >= 0) value = value.slice(at + 1);
  value = value.split(/[/?#]/)[0] ?? '';
  // A pasted host:port, and the DNS root's trailing dot.
  value = value.replace(/:\d+$/, '').replace(/\.+$/, '');

  // Case-folding is safe for ASCII and for the Unicode a visitor types in an
  // IDN; the API does the punycode conversion and echoes back both forms.
  return value.toLocaleLowerCase();
}

/** Locale-aware digits. `null` is never a number — see `formatCount`. */
export function formatNumber(value: number, lang: string): string {
  return value.toLocaleString(lang === 'it' ? 'it-IT' : 'en-GB');
}

/**
 * ⚠️ `null` is not `0`.
 *
 * A count the API could not establish means "there is no number to give here" —
 * an SPF record that resolves per message authorises MORE than a record with a
 * fixed list, not zero. Printing `0` would say the opposite of the truth, so a
 * missing count is printed as the same em dash the API's own summary uses.
 */
export const NO_NUMBER = '—';

export function formatCount(value: number | null | undefined, lang: string): string {
  return typeof value === 'number' ? formatNumber(value, lang) : NO_NUMBER;
}

interface SetupOptions<T extends DomainToolData> {
  root: HTMLElement;
  endpoint: string;
  lang: string;
  strings: DomainToolStrings;
  /** Called with the payload of a 200. Everything else never reaches it. */
  onData: (data: T) => void;
  /** Called before a request, and on clear, so the tool can hide its result. */
  onReset: () => void;
}

/**
 * Wires the form of one tool: submit, clear, loading state, error line.
 *
 * The caller keeps the rendering; this keeps the round trip identical on both
 * pages, which is the whole point — an error worded one way on one tool and
 * another way on the other is the kind of drift nobody notices for months.
 */
export function setupDomainTool<T extends DomainToolData>(options: SetupOptions<T>): void {
  const { root, endpoint, lang, strings, onData, onReset } = options;

  const q = <E extends Element>(selector: string) => root.querySelector<E>(selector);

  const form = q<HTMLFormElement>('[data-tool-form]');
  const input = q<HTMLInputElement>('[data-tool-input]');
  const submitBtn = q<HTMLButtonElement>('[data-tool-submit]');
  const submitLabel = q<HTMLElement>('[data-tool-submit-label]');
  const clearBtn = q<HTMLButtonElement>('[data-tool-clear]');
  const errorEl = q<HTMLElement>('[data-tool-error]');
  const statusEl = q<HTMLElement>('[data-tool-status]');

  if (!form || !input || !submitBtn || !submitLabel || !errorEl || !statusEl) return;

  const setError = (message: string | null) => {
    errorEl.textContent = message ?? '';
    errorEl.hidden = !message;
  };

  // Leaves the live region alone on the way out: the caller announces the
  // outcome, and clearing here would wipe what it just said.
  const setLoading = (loading: boolean) => {
    submitBtn.toggleAttribute('data-loading', loading);
    submitLabel.textContent = loading ? strings.submitBusy : strings.submit;
    if (loading) statusEl.textContent = strings.statusBusy;
  };

  clearBtn?.addEventListener('click', () => {
    input.value = '';
    setError(null);
    statusEl.textContent = '';
    onReset();
    input.focus();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setError(null);

    const domain = normaliseDomain(input.value);
    if (domain.length === 0) {
      setError(strings.errors.empty);
      input.focus();
      return;
    }
    // Show the visitor what was actually looked up, so a pasted address or URL
    // does not leave them wondering which part we used.
    input.value = domain;

    setLoading(true);
    onReset();

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, locale: lang }),
      });

      if (!res.ok) {
        if (res.status === 429) {
          // The API's own 429 body is not localised; ours is, and it is also
          // the one that says the limit is what keeps the tool free.
          setError(strings.errors.rateLimited);
        } else if (res.status === 422) {
          setError(await validationMessage(res, strings.errors.invalid));
        } else {
          setError(strings.errors.server);
        }
        return;
      }

      const payload = (await res.json()) as { data?: T };
      if (!payload?.data) {
        setError(strings.errors.server);
        return;
      }
      onData(payload.data);
      statusEl.textContent = strings.statusDone;
    } catch {
      // Network, CORS or malformed JSON — the visitor can only retry, and the
      // reason is never worth exposing.
      setError(strings.errors.network);
    } finally {
      setLoading(false);
    }
  });
}

/**
 * The API's reason for refusing a domain, preferred over our own.
 *
 * `errors[0].message` is the field-level sentence — the specific one, and the
 * one the API localises. `message` is the envelope's summary. Our fallback runs
 * only when neither is there.
 */
async function validationMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as {
      error?: { message?: string; errors?: { field?: string; message?: string }[] };
    };
    const field = body.error?.errors?.find((entry) => typeof entry.message === 'string');
    return field?.message || body.error?.message || fallback;
  } catch {
    return fallback;
  }
}
