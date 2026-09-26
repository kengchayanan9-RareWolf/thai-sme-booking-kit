/**
 * Thin security proxy in front of Apps Script (free Cloudflare Workers plan).
 * - POST /webhook      LINE webhook: verify X-Line-Signature, ack in <1s, forward in the background
 * - GET  /api/services services + shop info for the LIFF page
 * - GET  /api/slots    ?date=YYYY-MM-DD&serviceId=...
 * - GET  /api/site     public website content (read at build time by the Astro site)
 * - POST /api/book     verify the LIFF ID token, then create a booking for that LINE user
 * Env vars: GAS_URL, LINE_LOGIN_CHANNEL_ID, ALLOWED_ORIGINS
 * Secrets:  LINE_CHANNEL_SECRET, SHARED_SECRET
 */

const enc = new TextEncoder();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (url.pathname === '/webhook' && request.method === 'POST') return await webhook(request, env, ctx);

      if (request.method === 'GET' && url.pathname === '/api/services') {
        return withHeaders(await gas(env, { kind: 'services' }), cors);
      }
      if (request.method === 'GET' && url.pathname === '/api/slots') {
        const date = url.searchParams.get('date') || '';
        const serviceId = url.searchParams.get('serviceId') || '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !serviceId) return json({ ok: false, error: 'BAD_REQUEST' }, 400, cors);
        return withHeaders(await gas(env, { kind: 'slots', date, serviceId }), cors);
      }
      if (request.method === 'GET' && url.pathname === '/api/site') {
        return withHeaders(await gas(env, { kind: 'site' }), cors);
      }
      if (request.method === 'POST' && url.pathname === '/api/book') {
        return withHeaders(await book(request, env), cors);
      }
      return json({ ok: false, error: 'NOT_FOUND' }, 404, cors);
    } catch (err) {
      console.error(err);
      return json({ ok: false, error: 'PROXY_ERROR' }, 502, cors);
    }
  }
};

async function webhook(request, env, ctx) {
  const body = await request.text();
  if (!(await validSignature(body, request.headers.get('x-line-signature'), env.LINE_CHANNEL_SECRET))) {
    return new Response('Invalid signature', { status: 401 });
  }
  const parsed = JSON.parse(body);
  // LINE's "Verify" button sends an empty events array; everything else goes to Apps Script.
  if (parsed.events && parsed.events.length) ctx.waitUntil(gas(env, { kind: 'webhook', body: parsed }));
  return new Response('OK');
}

async function book(request, env) {
  const raw = await request.text();
  if (raw.length > 10000) return json({ ok: false, error: 'TOO_LARGE' }, 413);
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: 'BAD_JSON' }, 400);
  }
  const user = await verifyIdToken(input.idToken, env);
  if (!user) return json({ ok: false, error: 'NOT_LOGGED_IN' }, 401);
  return gas(env, {
    kind: 'book',
    userId: user.userId,
    displayName: user.displayName,
    name: String(input.name || '').slice(0, 60),
    phone: String(input.phone || '').slice(0, 20),
    serviceId: String(input.serviceId || '').slice(0, 40),
    startMs: Number(input.startMs),
    consent: input.consent === true
  });
}

/** HMAC-SHA256(channel secret, raw body), base64 — compared in constant time by crypto.subtle.verify. */
export async function validSignature(body, signature, secret) {
  if (!signature || !secret) return false;
  let sig;
  try {
    sig = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, sig, enc.encode(body));
}

export async function verifyIdToken(idToken, env, fetchImpl = fetch) {
  if (!idToken || typeof idToken !== 'string') return null;
  const res = await fetchImpl('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: env.LINE_LOGIN_CHANNEL_ID })
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.sub ? { userId: data.sub, displayName: data.name || '' } : null;
}

async function gas(env, payload) {
  const res = await fetch(env.GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, secret: env.SHARED_SECRET }),
    redirect: 'follow' // Apps Script answers POST with a 302 to googleusercontent.com
  });
  const text = await res.text();
  try {
    JSON.parse(text);
  } catch {
    console.error('Apps Script returned non-JSON', res.status, text.slice(0, 300));
    return json({ ok: false, error: 'UPSTREAM_ERROR' }, 502);
  }
  return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

export function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const headers = { 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function withHeaders(response, headers) {
  const r = new Response(response.body, response);
  Object.entries(headers).forEach(([k, v]) => r.headers.set(k, v));
  return r;
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}
