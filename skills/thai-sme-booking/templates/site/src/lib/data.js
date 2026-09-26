// Build-time content loader. With PUBLIC_API_BASE set, the Google Sheet (via the Worker) is the
// source of truth and a failed fetch FAILS the build — Cloudflare Pages keeps the last good deploy
// instead of publishing stale content. Without it (local dev, first deploy) we use site.json.
import fallback from '../data/site.json';

let cache;

export async function getSite() {
  if (!cache) cache = withEnv(await load());
  return cache;
}

// The LIFF ID in the Sheet wins; the build env fills it in when the owner's Sheet has none yet.
function withEnv(data) {
  const liffId = import.meta.env.PUBLIC_LIFF_ID;
  if (!data.settings.liff_id && liffId) data = { ...data, settings: { ...data.settings, liff_id: liffId } };
  return data;
}

async function load() {
  const api = import.meta.env.PUBLIC_API_BASE;
  if (!api || api.includes('YOUR-SUBDOMAIN')) return fallback;
  const url = `${api.replace(/\/$/, '')}/api/site`;
  let body = null;
  try {
    body = await (await fetch(url)).json();
  } catch (err) {
    throw new Error(`Could not reach ${url} (${err.cause?.code || err.message}). Check PUBLIC_API_BASE and that the Worker is deployed.`);
  }
  if (!body || !body.ok) throw new Error(`${url} answered ${JSON.stringify(body)} — check GAS_URL and SHARED_SECRET on the Worker.`);
  return body.site;
}
