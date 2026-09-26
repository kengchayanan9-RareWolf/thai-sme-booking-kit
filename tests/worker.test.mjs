import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker, { validSignature, verifyIdToken, corsHeaders } from '../skills/thai-sme-booking/templates/worker/index.js';

const SECRET = 'channel-secret';
const sign = (body) => createHmac('sha256', SECRET).update(body).digest('base64');
const env = {
  GAS_URL: 'https://gas.example/exec', LINE_LOGIN_CHANNEL_ID: '123', ALLOWED_ORIGINS: 'https://shop.pages.dev',
  LINE_CHANNEL_SECRET: SECRET, SHARED_SECRET: 'shared'
};

test('validSignature accepts LINE-style HMAC and rejects tampering', async () => {
  const body = JSON.stringify({ events: [{ type: 'message', message: { text: 'จอง' } }] });
  assert.equal(await validSignature(body, sign(body), SECRET), true);
  assert.equal(await validSignature(body + ' ', sign(body), SECRET), false);
  assert.equal(await validSignature(body, 'not base64 !!', SECRET), false);
  assert.equal(await validSignature(body, '', SECRET), false);
});

test('verifyIdToken returns the LINE user only when LINE accepts the token', async () => {
  const ok = async (url, init) => {
    assert.equal(url, 'https://api.line.me/oauth2/v2.1/verify');
    assert.equal(new URLSearchParams(init.body).get('client_id'), '123');
    return new Response(JSON.stringify({ sub: 'U1', name: 'Nok' }), { status: 200 });
  };
  assert.deepEqual(await verifyIdToken('tok', env, ok), { userId: 'U1', displayName: 'Nok' });
  assert.equal(await verifyIdToken('tok', env, async () => new Response('{}', { status: 400 })), null);
  assert.equal(await verifyIdToken(undefined, env, ok), null);
});

test('corsHeaders only echoes allowed origins', () => {
  assert.equal(corsHeaders('https://shop.pages.dev', env)['Access-Control-Allow-Origin'], 'https://shop.pages.dev');
  assert.equal(corsHeaders('https://evil.example', env)['Access-Control-Allow-Origin'], undefined);
});

test('fetch handler: webhook signature gate, background forward, and /api/book auth', async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: init && init.body });
    if (String(url).includes('oauth2')) return new Response(JSON.stringify({ sub: 'U1', name: 'Nok' }));
    return new Response(JSON.stringify({ ok: true, ref: 'BABCDE' }));
  };
  try {
    const waits = [];
    const ctx = { waitUntil: (p) => waits.push(p) };
    const body = JSON.stringify({ events: [{ type: 'message' }] });

    const bad = await worker.fetch(new Request('https://w.dev/webhook', { method: 'POST', body, headers: { 'x-line-signature': 'AAAA' } }), env, ctx);
    assert.equal(bad.status, 401);

    const good = await worker.fetch(new Request('https://w.dev/webhook', { method: 'POST', body, headers: { 'x-line-signature': sign(body) } }), env, ctx);
    assert.equal(good.status, 200);
    await Promise.all(waits);
    const forwarded = JSON.parse(calls.at(-1).body);
    assert.equal(forwarded.kind, 'webhook');
    assert.equal(forwarded.secret, 'shared');

    const verify = JSON.stringify({ events: [] }); // LINE console "Verify" button
    const v = await worker.fetch(new Request('https://w.dev/webhook', { method: 'POST', body: verify, headers: { 'x-line-signature': sign(verify) } }), env, ctx);
    assert.equal(v.status, 200);

    const res = await worker.fetch(new Request('https://w.dev/api/book', {
      method: 'POST', headers: { Origin: 'https://shop.pages.dev' },
      body: JSON.stringify({ idToken: 'tok', name: 'นก', phone: '0812345678', serviceId: 'cut', startMs: 1, consent: true, userId: 'SPOOFED' })
    }), env, ctx);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://shop.pages.dev');
    const sent = JSON.parse(calls.at(-1).body);
    assert.equal(sent.userId, 'U1'); // taken from the verified token, never from the client body
    assert.equal(sent.consent, true);

    const slots = await worker.fetch(new Request('https://w.dev/api/slots?date=bad&serviceId=x'), env, ctx);
    assert.equal(slots.status, 400);
  } finally {
    globalThis.fetch = realFetch;
  }
});
