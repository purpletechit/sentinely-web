import { AwsClient } from 'aws4fetch';

export interface Env {
  /** Cloudflare Turnstile secret (server-side). If unset, verification is skipped (dev only). */
  TURNSTILE_SECRET_KEY?: string;
  /** Recipient of form emails. Defaults to info@sentinely.eu. */
  MAIL_TO?: string;
  /** Envelope From. Defaults to "Sentinely <noreply@sentinely.eu>". */
  MAIL_FROM?: string;
  /** AWS SES credentials + region (recommended provider). */
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_REGION?: string;
  /** Optional Resend fallback (used only if AWS SES creds are absent). */
  RESEND_API_KEY?: string;
}

type FormType = 'contact' | 'affiliate';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_TO = 'info@sentinely.eu';
const DEFAULT_FROM = 'Sentinely <noreply@sentinely.eu>';
const DEFAULT_REGION = 'eu-west-1';

function json(status: number, data: Record<string, unknown>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** Single-line field: strip CR/LF (header-injection safety) and clamp length. */
function clean(value: unknown, max = 500): string {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Multi-line field: keep newlines, clamp length. */
function cleanMultiline(value: unknown, max = 5000): string {
  return String(value ?? '').trim().slice(0, max);
}

async function verifyTurnstile(secret: string, token: string, ip?: string): Promise<boolean> {
  if (!token) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

async function sendEmail(
  env: Env,
  opts: { subject: string; text: string; replyTo: string },
): Promise<void> {
  const to = env.MAIL_TO || DEFAULT_TO;
  const from = env.MAIL_FROM || DEFAULT_FROM;

  // Preferred: AWS SES v2 (SigV4 via aws4fetch — light, Workers-compatible).
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    const region = env.AWS_REGION || DEFAULT_REGION;
    const aws = new AwsClient({
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      region,
      service: 'ses',
    });
    const endpoint = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;
    const payload = {
      FromEmailAddress: from,
      Destination: { ToAddresses: [to] },
      ReplyToAddresses: [opts.replyTo],
      Content: {
        Simple: {
          Subject: { Data: opts.subject, Charset: 'UTF-8' },
          Body: { Text: { Data: opts.text, Charset: 'UTF-8' } },
        },
      },
    };
    const res = await aws.fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`SES ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    return;
  }

  // Fallback: Resend.
  if (env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from, to, reply_to: opts.replyTo, subject: opts.subject, text: opts.text }),
    });
    if (!res.ok) {
      throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    return;
  }

  // No provider configured — local dev convenience. Do not fail the request.
  console.warn('[form] No email provider configured (set AWS SES or Resend secrets). Skipping send.');
}

export async function handleForm(request: Request, env: Env, type: FormType): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }

  // Honeypot: bots fill the hidden field. Accept silently, drop the submission.
  if (clean(body.website_hp)) {
    return json(200, { ok: true });
  }

  const name = clean(body.name, 200);
  const email = clean(body.email, 320);
  const company = clean(body.company, 300);
  const message = cleanMultiline(body.message, 5000);
  const lang = body.lang === 'it' ? 'it' : 'en';

  // Server-side validation (authoritative).
  if (!name || !EMAIL_RE.test(email) || !message) {
    return json(400, { ok: false, error: 'validation' });
  }

  // Anti-bot: Turnstile (skipped only when no secret is configured, i.e. local dev).
  if (env.TURNSTILE_SECRET_KEY) {
    const ip = request.headers.get('CF-Connecting-IP') ?? undefined;
    const token = clean(body.token, 3000);
    const ok = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, token, ip);
    if (!ok) return json(400, { ok: false, error: 'turnstile' });
  }

  const label = type === 'affiliate' ? 'Affiliate application' : 'Contact message';
  const subject = `[Sentinely] ${label} — ${name}`;
  const text = [
    `Type: ${type}`,
    `Name: ${name}`,
    `Email: ${email}`,
    company ? `Company: ${company}` : null,
    `Language: ${lang}`,
    '',
    type === 'affiliate' ? 'How they plan to refer Sentinely:' : 'Message:',
    message,
    '',
    '— Sent from the Sentinely website form.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  try {
    await sendEmail(env, { subject, text, replyTo: email });
  } catch (err) {
    // Never log message contents; only the failure reason.
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[form] send failed:', detail);
    // `detail` surfaces the provider error (e.g. SES region/verification) to aid
    // setup debugging. It carries no user data — safe to remove once email works.
    return json(502, { ok: false, error: 'send_failed', detail });
  }

  return json(200, { ok: true });
}
