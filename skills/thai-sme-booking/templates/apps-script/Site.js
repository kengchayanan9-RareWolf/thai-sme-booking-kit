/** Website content comes from the same Sheet. The owner edits tabs, then clicks "อัปเดตเว็บไซต์". */

// Only these Settings keys are ever exposed publicly. Never add IDs, tokens or owner contact here.
const PUBLIC_SETTINGS = [
  'shop_name', 'shop_name_en', 'tagline', 'business_type', 'phone', 'address', 'map_url', 'map_embed_url',
  'line_oa_id', 'liff_id', 'site_url', 'facebook_url', 'instagram_url', 'tiktok_url', 'google_review_url',
  'brand_color', 'deposit_type', 'deposit_value', 'hold_minutes', 'price_range', 'demo_mode', 'privacy_contact',
  'retention_months'
];

function siteData_() {
  const cfg = settings_();
  const settings = {};
  PUBLIC_SETTINGS.forEach((k) => { if (cfg[k] !== undefined && cfg[k] !== '') settings[k] = cfg[k]; });
  const site = {};
  rows_('Site').forEach((r) => { if (r.key) site[String(r.key).trim()] = r.value; });
  return {
    settings: settings,
    site: site,
    services: publicServices_(),
    hours: hoursRows_().map((r) => ({
      day: Lib.dayKey(r.day), open: r.open, close: r.close, closed: Lib.isClosed(r.closed) || !r.open
    })).filter((h) => h.day !== null),
    staff: activeRows_('Staff').map((r) => ({ name: r.name, role: r.role, bio: r.bio, imageUrl: r.image_url })),
    reviews: activeRows_('Reviews').map((r) => ({ name: r.name, text: r.text, stars: Number(r.stars) || 5 })),
    gallery: activeRows_('Gallery').map((r) => ({ imageUrl: r.image_url, caption: r.caption })),
    generatedAt: new Date().toISOString()
  };
}

/** Menu: triggers a Cloudflare Pages rebuild, which re-reads this Sheet through the Worker. */
function publishSite() {
  const hook = prop_('PAGES_DEPLOY_HOOK');
  const ui = SpreadsheetApp.getUi();
  if (!hook) {
    ui.alert('ยังไม่ได้ตั้งค่า PAGES_DEPLOY_HOOK — ติดต่อผู้ดูแลระบบ');
    return;
  }
  const res = UrlFetchApp.fetch(hook, { method: 'post', muteHttpExceptions: true });
  if (res.getResponseCode() < 300) {
    ss_().toast('กำลังอัปเดตเว็บไซต์ ใช้เวลาประมาณ 1–2 นาที', '🌐 เว็บไซต์', 8);
  } else {
    log_('ERROR', 'publishSite', res.getResponseCode() + ' ' + res.getContentText().slice(0, 300));
    ui.alert('อัปเดตเว็บไซต์ไม่สำเร็จ (' + res.getResponseCode() + ') — ดูรายละเอียดในแท็บ Log');
  }
}
