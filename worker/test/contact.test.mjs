// Integration tests. Needs: sink on :2526, worker (passing Turnstile test secret) on :8787,
// worker (failing Turnstile test secret) on :8788. See test/run.sh.
import test from 'node:test';
import assert from 'node:assert/strict';

const OK = 'http://127.0.0.1:8787/api/contact';
const FAILTS = 'http://127.0.0.1:8788/api/contact';
const SINK = 'http://127.0.0.1:2526/messages';
const ORIGIN = 'https://markcohanlaw.com';
const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'; // Cloudflare's documented dummy token for test secrets

const valid = () => ({ name: 'Jane Doe', email: 'jane@example.com', phone: '214-555-0100', message: 'I was injured in a car accident last week.', 'cf-turnstile-response': TOKEN });
const post = (url, fields, { origin = ORIGIN, headers = {} } = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fetch(url, { method: 'POST', body: fd, headers: { ...(origin ? { origin } : {}), ...headers } });
};
const inbox = async () => (await fetch(SINK)).json();
const clear = () => fetch(SINK, { method: 'DELETE' });

test.beforeEach(clear);

test('valid submission sends one email with correct headers', async () => {
  const r = await post(OK, valid());
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  const m = await inbox();
  assert.equal(m.length, 1);
  assert.match(m[0].from, /noreply@markcohanlaw\.com/);
  assert.match(m[0].to, /mark@markcohanlaw\.com/);
  assert.match(m[0].replyTo, /jane@example\.com/);
  assert.equal(m[0].subject, 'Website contact: Jane Doe');
  assert.match(m[0].text, /car accident/);
});

test('CORS header present for allowed origin only', async () => {
  const r = await post(OK, valid());
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
});

test('header injection in name cannot add headers', async () => {
  const r = await post(OK, { ...valid(), name: 'Bob\r\nBcc: evil@attacker.test\r\nX-Evil: 1' });
  assert.equal(r.status, 200);
  const [m] = await inbox();
  assert.equal(m.bcc, null);
  assert.ok(!m.rawHeaderKeys.includes('x-evil'));
  assert.ok(!m.subject.includes('\n'));
});

test('honeypot returns fake success and sends nothing', async () => {
  const r = await post(OK, { ...valid(), website: 'http://spam.test' });
  assert.equal(r.status, 200);
  assert.equal((await inbox()).length, 0);
});

test('missing/invalid fields -> 422, nothing sent', async () => {
  for (const bad of [{ name: '' }, { email: 'not-an-email' }, { email: 'a@b' }, { message: 'short' }, { message: 'x'.repeat(3001) }, { phone: '1'.repeat(31) }]) {
    const r = await post(OK, { ...valid(), ...bad });
    assert.equal(r.status, 422, JSON.stringify(bad).slice(0, 40));
  }
  assert.equal((await inbox()).length, 0);
});

test('missing Turnstile token -> 403', async () => {
  const { 'cf-turnstile-response': _t, ...noTok } = valid();
  const r = await post(OK, noTok);
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, 'turnstile_failed');
  assert.equal((await inbox()).length, 0);
});

test('Turnstile rejection (failing secret) -> 403, nothing sent', async () => {
  const r = await post(FAILTS, valid());
  assert.equal(r.status, 403);
  assert.equal((await inbox()).length, 0);
});

test('disallowed or missing Origin -> 403', async () => {
  assert.equal((await post(OK, valid(), { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(OK, valid(), { origin: null })).status, 403);
  assert.equal((await inbox()).length, 0);
});

test('preflight: allowed origin 204, evil origin 403', async () => {
  const ok = await fetch(OK, { method: 'OPTIONS', headers: { origin: ORIGIN, 'access-control-request-method': 'POST' } });
  assert.equal(ok.status, 204);
  const bad = await fetch(OK, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } });
  assert.equal(bad.status, 403);
});

test('wrong method / path / content-type', async () => {
  assert.equal((await fetch(OK, { headers: { origin: ORIGIN } })).status, 405);
  assert.equal((await fetch(OK.replace('/contact', '/other'))).status, 404);
  const r = await fetch(OK, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 415);
});

test('oversized body -> 413', async () => {
  const r = await post(OK, { ...valid(), message: 'x'.repeat(40000) });
  assert.equal(r.status, 413);
  assert.equal((await inbox()).length, 0);
});

test('SMTP failure -> 502 with generic error (no details leaked)', async () => {
  // Port 8789 runs a worker with wrong SMTP password.
  const r = await post('http://127.0.0.1:8789/api/contact', valid());
  assert.equal(r.status, 502);
  const body = await r.json();
  assert.deepEqual(body, { error: 'send_failed' });
});
