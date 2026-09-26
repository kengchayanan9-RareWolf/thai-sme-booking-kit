import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadGas } from './gas-harness.mjs';

const require = createRequire(import.meta.url);
const Lib = require('../skills/thai-sme-booking/templates/apps-script/Lib.js');
const TZ = 420;

// An open day (the demo salon closes on Mondays) three-plus days from now.
function openDate() {
  let ms = Date.now() + 3 * Lib.DAY;
  while (Lib.dayOfWeek(Lib.msToLocalDate(ms, TZ)) === 1) ms += Lib.DAY;
  return Lib.msToLocalDate(ms, TZ);
}

let slipResponse = null;
const replies = [];
const pushes = [];
const h = loadGas({
  props: { SHARED_SECRET: 's3cret', LINE_CHANNEL_ACCESS_TOKEN: 'tok', SLIP_API_KEY: 'k', SLIP_PROVIDER: 'easyslip' },
  fetchHandler(url, opts) {
    if (url.endsWith('/message/reply')) { replies.push(JSON.parse(opts.payload)); return { body: '{}' }; }
    if (url.endsWith('/message/push')) { pushes.push(JSON.parse(opts.payload)); return { body: '{}' }; }
    if (url.endsWith('/message/quota')) return { body: { type: 'limited', value: 300 } };
    if (url.endsWith('/message/quota/consumption')) return { body: { totalUsage: 12 } };
    if (url.includes('api-data.line.me')) return { body: 'binary' };
    if (url.includes('easyslip')) return { body: slipResponse };
    return { body: '{}' };
  }
});
const post = (p) => h.post({ secret: 's3cret', ...p });
const slip = (amount, transRef, receiverProxy = 'xxx-xxx-0000') => ({
  success: true,
  data: {
    isDuplicate: false,
    rawSlip: {
      transRef, date: new Date().toISOString(), amount: { amount },
      receiver: { account: { name: { th: 'น.ส. สมหญิง ใ' }, proxy: { account: receiverProxy } } }
    }
  }
});
const image = (userId, id) => ({ kind: 'webhook', body: { events: [{ type: 'message', webhookEventId: 'e' + id, replyToken: 'r' + id, source: { type: 'user', userId }, message: { type: 'image', id } }] } });
const text = (userId, t, id) => ({ kind: 'webhook', body: { events: [{ type: 'message', webhookEventId: 't' + id, replyToken: 'rt' + id, source: { type: 'user', userId }, message: { type: 'text', text: t } }] } });

test('setup creates and seeds every tab, keeps phone numbers as text', () => {
  h.g.setup();
  const names = h.sheets.map((s) => s.name);
  for (const t of ['Settings', 'Services', 'Hours', 'Bookings', 'FAQ', 'Site', 'Log']) assert.ok(names.includes(t), t);
  assert.ok(!names.includes('Sheet1'));
  const settings = Object.fromEntries(h.tab('Settings').map((r) => [r.key, r.value]));
  assert.equal(settings.promptpay_id, '0000000000'); // not coerced to the number 0
  assert.equal(settings.phone, '080-000-0000');
  assert.match(h.properties.OWNER_SETUP_CODE, /^\d{6}$/);
  assert.deepEqual(h.record.triggers.sort(), ['expireHolds', 'onSheetEdit', 'purgeOldData', 'sendReminders']);
});

test('rejects calls without the shared secret', () => {
  assert.equal(h.post({ kind: 'services', secret: 'nope' }).error, 'FORBIDDEN');
});

test('services expose computed deposits', () => {
  const r = post({ kind: 'services' });
  const byId = Object.fromEntries(r.services.map((s) => [s.id, s]));
  assert.equal(byId['cut-women'].depositAmount, 135); // 30% of 450
  assert.equal(byId['cut-men'].depositAmount, 0); // per-service override
  assert.equal(byId.color.depositAmount, 500); // fixed override
  assert.equal(r.shop.name, 'บ้านสวย ซาลอน');
});

let booking;
const date = openDate();

test('slots follow opening hours and booking creates a pending hold', () => {
  const slots = post({ kind: 'slots', date, serviceId: 'cut-women' }).slots;
  assert.ok(slots.length > 5);
  assert.ok(['09:00', '10:00'].includes(slots[0].label));

  booking = post({ kind: 'book', userId: 'U1', displayName: 'Nok', name: 'นก', phone: '081-234-5678', serviceId: 'cut-women', startMs: slots[0].startMs, consent: true });
  assert.equal(booking.ok, true);
  assert.equal(booking.status, 'PENDING_DEPOSIT');
  assert.equal(booking.deposit, 135);
  assert.equal(booking.promptpayId, '0000000000');
  assert.equal(h.tab('Bookings')[0].phone, '0812345678');

  const again = post({ kind: 'slots', date, serviceId: 'cut-women' }).slots;
  assert.ok(!again.some((s) => s.startMs === slots[0].startMs), 'held slot disappears');
  const clash = post({ kind: 'book', userId: 'U2', name: 'บี', phone: '0899999999', serviceId: 'cut-women', startMs: slots[0].startMs, consent: true });
  assert.equal(clash.error, 'SLOT_TAKEN');
  assert.equal(post({ kind: 'book', userId: 'U2', name: 'บี', phone: '0899999999', serviceId: 'cut-women', startMs: slots[3].startMs, consent: false }).error, 'CONSENT_REQUIRED');
});

test('a valid slip in chat confirms the booking, replies, adds a calendar event and alerts the owner', () => {
  h.g.setSetting_('owner_line_user_id', 'UOWNER');
  slipResponse = slip(135, 'REF-001');
  post(image('U1', 'm1'));
  const row = h.tab('Bookings').find((r) => r.ref === booking.ref);
  assert.equal(row.status, 'CONFIRMED');
  assert.equal(row.slip_trans_ref, 'REF-001');
  assert.equal(replies.at(-1).messages[0].type, 'flex');
  assert.match(replies.at(-1).messages[0].altText, /ยืนยันการจอง/);
  assert.equal(h.record.events.length, 1);
  assert.equal(row.calendar_event_id, 'ev1');
  assert.equal(pushes.at(-1).to, 'UOWNER');
});

test('redelivered webhook events are ignored', () => {
  const before = replies.length;
  post(image('U1', 'm1'));
  assert.equal(replies.length, before);
});

test('a reused slip goes to NEEDS_REVIEW with an owner alert', () => {
  const slots = post({ kind: 'slots', date, serviceId: 'treatment' }).slots;
  const b2 = post({ kind: 'book', userId: 'U3', name: 'ซี', phone: '0811111111', serviceId: 'treatment', startMs: slots.at(-1).startMs, consent: true });
  assert.equal(b2.deposit, 240);
  slipResponse = slip(240, 'REF-001');
  post(image('U3', 'm2'));
  const row = h.tab('Bookings').find((r) => r.ref === b2.ref);
  assert.equal(row.status, 'NEEDS_REVIEW');
  assert.match(row.note, /DUPLICATE/);
  assert.match(pushes.at(-1).messages[0].text, /สลิปนี้เคยใช้แล้ว/);

  // Owner approves in the Sheet → customer gets a pushed confirmation.
  const r = h.tab('Bookings').findIndex((x) => x.ref === b2.ref) + 2;
  h.g.updateRow_('Bookings', r, { status: 'CONFIRMED' });
  const statusCol = h.g.header_(h.g.sheet_('Bookings')).indexOf('status') + 1;
  h.g.onSheetEdit({ range: h.g.sheet_('Bookings').getRange(r, statusCol), oldValue: 'NEEDS_REVIEW' });
  assert.equal(pushes.at(-1).to, 'U3');
  assert.equal(h.record.events.length, 2);
});

test('an unreadable image asks for a clearer slip and keeps the hold', () => {
  const slots = post({ kind: 'slots', date, serviceId: 'gel-nails' }).slots;
  const b3 = post({ kind: 'book', userId: 'U4', name: 'ดี', phone: '0822222222', serviceId: 'gel-nails', startMs: slots[0].startMs, consent: true });
  slipResponse = { success: false, error: { code: 'SLIP_NOT_FOUND' } };
  post(image('U4', 'm3'));
  assert.equal(h.tab('Bookings').find((r) => r.ref === b3.ref).status, 'PENDING_DEPOSIT');
  assert.match(replies.at(-1).messages[0].text, /อ่านสลิปไม่ได้/);
});

test('wrong receiver is flagged', () => {
  const slots = post({ kind: 'slots', date, serviceId: 'gel-nails' }).slots;
  const b4 = post({ kind: 'book', userId: 'U5', name: 'อี', phone: '0833333333', serviceId: 'gel-nails', startMs: slots.at(-1).startMs, consent: true });
  slipResponse = slip(117, 'REF-XYZ', 'xxx-xxx-9876');
  slipResponse.data.rawSlip.receiver.account.name.th = 'นาย คนอื่น';
  post(image('U5', 'm4'));
  const row = h.tab('Bookings').find((r) => r.ref === b4.ref);
  assert.equal(row.status, 'NEEDS_REVIEW');
  assert.match(row.note, /RECEIVER_MISMATCH/);
});

test('no-deposit services confirm immediately', () => {
  const slots = post({ kind: 'slots', date, serviceId: 'cut-men' }).slots;
  const b = post({ kind: 'book', userId: 'U6', name: 'เอฟ', phone: '0844444444', serviceId: 'cut-men', startMs: slots[0].startMs, consent: true });
  assert.equal(b.status, 'CONFIRMED');
  assert.equal(b.promptpayId, '');
});

test('chat: FAQ answers with placeholders, booking words get the button, others go to the owner', () => {
  post(text('U9', 'ราคาเท่าไหร่คะ', 1));
  assert.match(replies.at(-1).messages[0].text, /ตัดผมผู้หญิง ฿450 \(60 นาที\)/);
  post(text('U9', 'เปิดกี่โมง', 2));
  assert.match(replies.at(-1).messages[0].text, /จันทร์ ปิด/);
  post(text('U9', 'อยากจองพรุ่งนี้', 3));
  assert.equal(replies.at(-1).messages[0].type, 'flex');
  const before = replies.length;
  post(text('U9', 'ช่างว่างไหม ทำทรงนี้ได้หรือเปล่า', 4));
  assert.equal(replies.length, before, 'unmatched text is left for the owner');
});

test('/owner <code> registers an extra owner', () => {
  post(text('UNEW', '/owner ' + h.properties.OWNER_SETUP_CODE, 5));
  const s = Object.fromEntries(h.tab('Settings').map((r) => [r.key, r.value]));
  assert.equal(s.owner_line_user_id, 'UOWNER,UNEW');
  post(text('UBAD', '/owner 000000', 6));
  assert.ok(!Object.fromEntries(h.tab('Settings').map((r) => [r.key, r.value])).owner_line_user_id.includes('UBAD'));
});

test('site data is public-safe', () => {
  const site = post({ kind: 'site' }).site;
  assert.equal(site.settings.shop_name, 'บ้านสวย ซาลอน');
  for (const k of ['promptpay_id', 'owner_email', 'owner_line_user_id', 'receiver_names']) assert.equal(site.settings[k], undefined, k);
  assert.equal(site.services.length, 5);
  assert.equal(site.hours.find((x) => x.day === 1).closed, true);
  assert.equal(site.site.hero_title, 'ผมสวยในแบบที่เป็นคุณ');
});

test('triggers: expire holds, monthly report', () => {
  const rows = h.tab('Bookings');
  const idx = rows.findIndex((r) => r.status === 'PENDING_DEPOSIT') + 2;
  h.g.updateRow_('Bookings', idx, { created_at: new Date(Date.now() - 3600 * 1000) });
  h.g.expireHolds();
  assert.equal(h.tab('Bookings')[idx - 2].status, 'EXPIRED');
  h.g.monthlyReport();
  assert.ok(h.sheets.some((s) => s.name === 'Report'));
});
