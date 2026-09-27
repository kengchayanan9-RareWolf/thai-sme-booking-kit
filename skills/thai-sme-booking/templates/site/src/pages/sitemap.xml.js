const PAGES = ['/', '/services/', '/team/', '/reviews/', '/contact/', '/privacy/'];

export function GET({ site }) {
  if (!site) return new Response('Set SITE_URL to generate a sitemap', { status: 404 });
  const urls = PAGES.map((p) => `<url><loc>${new URL(p, site).href}</loc></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'Content-Type': 'application/xml' }
  });
}
