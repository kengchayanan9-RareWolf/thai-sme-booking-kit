export function GET({ site }) {
  const lines = ['User-agent: *', 'Disallow: /liff/', 'Allow: /'];
  if (site) lines.push(`Sitemap: ${new URL('/sitemap.xml', site).href}`);
  return new Response(lines.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain' } });
}
