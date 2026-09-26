export const DAY_TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const DAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const baht = (n) => '฿' + Number(n).toLocaleString('en-US');

export const truthy = (v) => v === true || /^(true|yes|1)$/i.test(String(v ?? ''));

export function lineChatUrl(s) {
  return s.line_oa_id ? `https://line.me/R/ti/p/${encodeURIComponent(s.line_oa_id)}` : '';
}

/** LIFF booking link; the optional service id is forwarded to /liff/book as ?service=. */
export function bookingUrl(s, serviceId) {
  if (s.liff_id) return `https://liff.line.me/${s.liff_id}${serviceId ? `?service=${encodeURIComponent(serviceId)}` : ''}`;
  return lineChatUrl(s) || '/contact';
}

export function telUrl(phone) {
  return 'tel:' + String(phone || '').replace(/[^\d+]/g, '');
}

/** Monday-first list of { label, text } for opening hours. */
export function hoursList(hours) {
  return [...hours]
    .sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7))
    .map((h) => ({ day: h.day, label: DAY_TH[h.day], text: h.closed ? 'ปิด' : `${h.open} – ${h.close}` }));
}

export function depositNote(settings, service) {
  if (!service.depositAmount) return 'ไม่ต้องมัดจำ';
  return `มัดจำ ${baht(service.depositAmount)}`;
}

export function localBusinessJsonLd(data) {
  const s = data.settings;
  const sameAs = [s.facebook_url, s.instagram_url, s.tiktok_url].filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': s.business_type || 'LocalBusiness',
    name: s.shop_name,
    alternateName: s.shop_name_en || undefined,
    description: s.tagline || undefined,
    telephone: s.phone || undefined,
    url: s.site_url || undefined,
    priceRange: s.price_range || undefined,
    address: s.address ? { '@type': 'PostalAddress', streetAddress: s.address, addressCountry: 'TH' } : undefined,
    hasMap: s.map_url || undefined,
    sameAs: sameAs.length ? sameAs : undefined,
    openingHoursSpecification: data.hours.filter((h) => !h.closed).map((h) => ({
      '@type': 'OpeningHoursSpecification', dayOfWeek: DAY_EN[h.day], opens: h.open, closes: h.close
    }))
  };
}

/** First grapheme of the name without a Thai honorific, for avatar placeholders. */
export function initials(name) {
  const bare = String(name || '?').replace(/^(พี่|คุณ|น้อง)\s*/, '').trim() || '?';
  const first = new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(bare)[Symbol.iterator]().next().value;
  return first ? first.segment : '?';
}
