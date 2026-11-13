// Contact-form Worker for markcohanlaw.com
// POST /api/contact  (multipart/form-data or urlencoded)  ->  Turnstile check  ->  email via SMTP.
// No message is stored or logged. Secrets (TURNSTILE_SECRET, SMTP_USER, SMTP_PASS) live in Worker secrets.
import { WorkerMailer } from 'worker-mailer';

const MAX_BODY_BYTES = 16 * 1024;
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

const json = (body, status, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });

// Strip CR/LF and other control chars so user input can never inject mail headers.
const oneLine = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').trim();
const body = (s) => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();

function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    return { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600', vary: 'origin' };
  }
  return null;
}

async function verifyTurnstile(token, ip, env) {
  if (!token) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const data = await r.json();
    return data.success === true;
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/contact') return json({ error: 'not_found' }, 404);

    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return cors ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 });
    }
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { allow: 'POST, OPTIONS', ...(cors ?? {}) });

    // Only accept browser posts from our own site.
    const origin = request.headers.get('origin');
    if (!cors) return json({ error: 'forbidden' }, 403);
    const h = cors;

    const len = Number(request.headers.get('content-length') ?? 0);
    if (len > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413, h);

    const ip = request.headers.get('cf-connecting-ip') ?? '';
    if (env.LIMITER) {
      const { success } = await env.LIMITER.limit({ key: ip || origin || 'anon' });
      if (!success) return json({ error: 'rate_limited' }, 429, { 'retry-after': '60', ...h });
    }

    let form;
    try {
      const ct = request.headers.get('content-type') ?? '';
      if (!/multipart\/form-data|application\/x-www-form-urlencoded/i.test(ct)) return json({ error: 'bad_request' }, 415, h);
      const text = await request.clone().text();
      if (text.length > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413, h);
      form = await request.formData();
    } catch {
      return json({ error: 'bad_request' }, 400, h);
    }

    // Honeypot: pretend success so bots learn nothing.
    if (oneLine(form.get('website')) !== '') return json({ ok: true }, 200, h);

    const name = oneLine(form.get('name'));
    const email = oneLine(form.get('email'));
    const phone = oneLine(form.get('phone'));
    const message = body(form.get('message'));

    const errors = {};
    if (name.length < 1 || name.length > 100) errors.name = true;
    if (email.length > 200 || !EMAIL_RE.test(email)) errors.email = true;
    if (phone.length > 30) errors.phone = true;
    if (message.length < 10 || message.length > 3000) errors.message = true;
    if (Object.keys(errors).length) return json({ error: 'invalid', fields: Object.keys(errors) }, 422, h);

    const token = form.get('cf-turnstile-response');
    if (!(await verifyTurnstile(typeof token === 'string' ? token : '', ip, env))) {
      return json({ error: 'turnstile_failed' }, 403, h);
    }

    const text = [
      'New message from the markcohanlaw.com contact form.',
      '',
      `Name:  ${name}`,
      `Email: ${email}`,
      `Phone: ${phone || '(not given)'}`,
      '',
      message,
      '',
      '--',
      'Reply to this email to answer the sender. This message was not stored anywhere else.',
    ].join('\n');

    try {
      await WorkerMailer.send(
        {
          host: env.SMTP_HOST,
          port: Number(env.SMTP_PORT),
          secure: env.SMTP_SECURE === 'true',
          startTls: env.SMTP_STARTTLS === 'true',
          credentials: { username: env.SMTP_USER, password: env.SMTP_PASS },
          authType: 'plain',
          socketTimeoutMs: 15000,
        },
        {
          from: { name: 'Website contact form', email: env.SMTP_FROM },
          to: env.CONTACT_TO,
          reply: { name, email },
          subject: `Website contact: ${name}`.slice(0, 120),
          text,
        },
      );
    } catch (err) {
      // Log the error class only. Never log visitor content.
      console.error('smtp_send_failed', err?.name ?? 'Error');
      return json({ error: 'send_failed' }, 502, h);
    }
    return json({ ok: true }, 200, h);
  },
};
