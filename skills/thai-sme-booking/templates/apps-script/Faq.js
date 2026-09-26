/** Rule-based chat: booking intent → booking button, FAQ keywords → answer, anything else → owner. */

function handleText_(ev) {
  const text = String(ev.message.text || '').trim();
  if (/^\/owner\s+/i.test(text)) return registerOwner_(ev, text);

  const cfg = settings_();
  const bookingWords = String(cfg.booking_keywords).split(',').map((k) => k.trim()).filter(Boolean);
  const hit = Lib.matchFaq(text, activeRows_('FAQ'));
  const wantsBooking = Lib.matchFaq(text, [{ keywords: bookingWords.join(',') }]);

  if (hit) {
    reply_(ev.replyToken, [text_(fillPlaceholders_(hit.answer, cfg))]);
    return true;
  }
  if (wantsBooking) {
    reply_(ev.replyToken, [bookingFlex_(cfg)]);
    return true;
  }
  return handleUnmatched(ev);
}

/**
 * Extension point for the 24/7 AI reply agent (thai-sme-booking-kit-pro).
 * Return true if you replied. The default leaves the message for the owner in LINE OA Manager chat.
 */
function handleUnmatched(ev) {
  return false;
}

/** Placeholders the owner can use in FAQ answers. */
function fillPlaceholders_(answer, cfg) {
  const map = {
    shop_name: cfg.shop_name,
    phone: cfg.phone,
    address: cfg.address,
    map_url: cfg.map_url,
    site_url: cfg.site_url,
    booking_url: liffUrl_(cfg),
    services: servicesText_(),
    hours: hoursText_()
  };
  return String(answer).replace(/\{(\w+)\}/g, (m, k) => (map[k] !== undefined && map[k] !== '' ? String(map[k]) : m));
}

function servicesText_() {
  return services_().map((s) => '• ' + s.name + ' ' + baht_(s.price) + ' (' + s.durationMin + ' นาที)').join('\n');
}

function hoursText_() {
  const names = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  return hoursRows_()
    .filter((r) => Lib.dayKey(r.day) !== null)
    .sort((a, b) => ((Lib.dayKey(a.day) + 6) % 7) - ((Lib.dayKey(b.day) + 6) % 7)) // Monday first
    .map((r) => names[Lib.dayKey(r.day)] + ' ' + (Lib.isClosed(r.closed) || !r.open ? 'ปิด' : r.open + '–' + r.close))
    .join('\n');
}

/** Owner links their LINE account by sending "/owner <code>" (code is shown by the setup menu). */
function registerOwner_(ev, text) {
  const code = text.split(/\s+/)[1];
  if (!code || code !== prop_('OWNER_SETUP_CODE')) return false;
  const cfg = settings_();
  const ids = String(cfg.owner_line_user_id || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.indexOf(ev.source.userId) === -1) ids.push(ev.source.userId);
  setSetting_('owner_line_user_id', ids.join(','));
  reply_(ev.replyToken, [text_('ลงทะเบียนรับแจ้งเตือนของร้านเรียบร้อยแล้ว ✅')]);
  return true;
}
