import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Lib = require('../skills/thai-sme-booking/templates/apps-script/Lib.js');
const { STATUS, MIN, HOUR, DAY } = Lib;
const TZ = 420; // Asia/Bangkok
const at = (date, hhmm) => Lib.localToMs(date, Lib.parseHHMM(hhmm), TZ);

test('time helpers round-trip Bangkok local time', () => {
  const ms = at('2026-10-03', '14:30');
  assert.equal(new Date(ms).toISOString(), '2026-10-03T07:30:00.000Z');
  assert.equal(Lib.msToLocalDate(ms, TZ), '2026-10-03');
  assert.equal(Lib.msToLocalHHMM(ms, TZ), '14:30');
  assert.equal(Lib.dayOfWeek('2026-10-03'), 6); // Saturday
  assert.equal(Lib.thaiDateTime(ms, TZ), 'ส. 3 ต.ค. 2569 14:30');
});

test('day names accept Thai and English', () => {
  assert.equal(Lib.dayKey('จันทร์'), 1);
  assert.equal(Lib.dayKey('Sat'), 6);
  assert.equal(Lib.dayKey('พฤหัสบดี'), 4);
  assert.equal(Lib.dayKey('xyz'), null);
});

const base = {
  date: '2026-10-03', hours: { open: '10:00', close: '12:00', closed: false },
  durationMin: 60, stepMin: 30, busy: [], nowMs: at('2026-10-01', '09:00'), minLeadMin: 120, tzOffsetMin: TZ
};

test('computeSlots lists start times that fit before closing', () => {
  assert.deepEqual(Lib.computeSlots(base).map((s) => s.label), ['10:00', '10:30', '11:00']);
});

test('computeSlots respects closed days, holidays and lead time', () => {
  assert.equal(Lib.computeSlots({ ...base, hours: { ...base.hours, closed: 'ปิด' } }).length, 0);
  assert.equal(Lib.computeSlots({ ...base, holiday: true }).length, 0);
  const sameDay = { ...base, nowMs: at('2026-10-03', '08:30') }; // +120 min lead -> 10:30 earliest
  assert.deepEqual(Lib.computeSlots(sameDay).map((s) => s.label), ['10:30', '11:00']);
});

test('computeSlots removes overlaps, honours capacity, buffer and hard blocks', () => {
  const busy = [{ startMs: at('2026-10-03', '10:30'), endMs: at('2026-10-03', '11:30') }];
  assert.deepEqual(Lib.computeSlots({ ...base, busy }).map((s) => s.label), []);
  assert.deepEqual(Lib.computeSlots({ ...base, busy, capacity: 2 }).map((s) => s.label), ['10:00', '10:30', '11:00']);
  const block = [{ ...busy[0], block: true }];
  assert.deepEqual(Lib.computeSlots({ ...base, busy: block, capacity: 2 }).map((s) => s.label), []);
  const early = [{ startMs: at('2026-10-03', '10:00'), endMs: at('2026-10-03', '10:30') }];
  assert.deepEqual(Lib.computeSlots({ ...base, busy: early }).map((s) => s.label), ['10:30', '11:00']);
  assert.deepEqual(Lib.computeSlots({ ...base, busy: early, bufferMin: 15 }).map((s) => s.label), ['11:00']);
});

test('pending holds block until they expire', () => {
  const now = Date.now();
  const pending = { status: STATUS.PENDING, createdMs: now - 10 * MIN };
  assert.equal(Lib.blocksSlot(pending, now, 20), true);
  assert.equal(Lib.blocksSlot({ ...pending, createdMs: now - 25 * MIN }, now, 20), false);
  assert.equal(Lib.blocksSlot({ status: STATUS.CANCELLED }, now, 20), false);
  assert.equal(Lib.expiredHolds([pending, { ...pending, createdMs: now - 30 * MIN }], now, 20).length, 1);
});

test('computeDeposit handles percent, fixed, none and per-service override', () => {
  assert.equal(Lib.computeDeposit(450, { deposit_type: 'percent', deposit_value: 30 }), 135);
  assert.equal(Lib.computeDeposit(333, { deposit_type: 'percent', deposit_value: 30 }), 100); // ceil(99.9)
  assert.equal(Lib.computeDeposit(150, { deposit_type: 'fixed', deposit_value: 200 }), 150);
  assert.equal(Lib.computeDeposit(450, { deposit_type: 'none' }), 0);
  assert.equal(Lib.computeDeposit(1500, { deposit_type: 'percent', deposit_value: 30 }, 500), 500);
  assert.equal(Lib.computeDeposit(250, { deposit_type: 'percent', deposit_value: 30 }, 0), 0);
  assert.equal(Lib.computeDeposit(250, { deposit_type: 'percent', deposit_value: 30 }, ''), 75);
});

test('makeRef avoids ambiguous characters', () => {
  let i = 0;
  const seq = [0, 0.99, 0.5, 0.25, 0.75];
  const ref = Lib.makeRef(() => seq[i++]);
  assert.match(ref, /^B[A-HJ-NP-Z2-9]{5}$/);
});

test('dueReminders picks tomorrow\'s confirmed, unreminded bookings', () => {
  const now = at('2026-10-02', '18:00');
  const list = [
    { ref: 'A', status: STATUS.CONFIRMED, startMs: at('2026-10-03', '10:00') },
    { ref: 'B', status: STATUS.CONFIRMED, startMs: at('2026-10-03', '23:30'), remindedMs: now },
    { ref: 'C', status: STATUS.PENDING, startMs: at('2026-10-03', '11:00') },
    { ref: 'D', status: STATUS.CONFIRMED, startMs: at('2026-10-04', '10:00') }
  ];
  assert.deepEqual(Lib.dueReminders(list, now, TZ).map((b) => b.ref), ['A']);
});

test('summarizeMonth reports revenue, deposits, no-show rate and top services', () => {
  const b = (status, day, serviceName, price, slipAmount) => ({ status, startMs: at(`2026-10-${day}`, '10:00'), serviceName, price, slipAmount });
  const r = Lib.summarizeMonth([
    b(STATUS.COMPLETED, '03', 'ตัดผม', 250, 0),
    b(STATUS.COMPLETED, '10', 'ทำสี', 1500, 450),
    b(STATUS.NO_SHOW, '10', 'ทำสี', 1500, 450),
    b(STATUS.CONFIRMED, '17', 'ตัดผม', 250, 0),
    b(STATUS.CANCELLED, '17', 'ตัดผม', 250, 0),
    { status: STATUS.COMPLETED, startMs: at('2026-11-01', '10:00'), serviceName: 'x', price: 999 }
  ], '2026-10', TZ);
  assert.equal(r.total, 5);
  assert.equal(r.bookedRevenue, 2000);
  assert.equal(r.depositsCollected, 900);
  assert.equal(r.noShowRate, 1 / 3);
  assert.deepEqual(r.topServices[0], { name: 'ตัดผม', count: 2 });
  assert.equal(r.busiestWeekday, 'ส.');
});

test('retentionExpired only returns old finished bookings not yet anonymized', () => {
  const now = at('2026-10-01', '00:00');
  const old = at('2025-06-01', '10:00');
  const list = [
    { ref: 'A', status: STATUS.COMPLETED, startMs: old, phone: '0812345678' },
    { ref: 'B', status: STATUS.COMPLETED, startMs: old, phone: '-' },
    { ref: 'C', status: STATUS.COMPLETED, startMs: at('2026-09-01', '10:00'), phone: '0812345678' },
    { ref: 'D', status: STATUS.REVIEW, startMs: old, phone: '0812345678' }
  ];
  assert.deepEqual(Lib.retentionExpired(list, now, 12).map((b) => b.ref), ['A']);
});

test('matchFaq prefers the longest keyword and skips inactive rows', () => {
  const rows = [
    { keywords: 'ราคา, price', answer: 'price list' },
    { keywords: 'ราคาทำสี', answer: 'color price' },
    { keywords: 'ที่จอด', answer: 'parking', active: 'FALSE' }
  ];
  assert.equal(Lib.matchFaq('ขอราคาทำสีหน่อยค่ะ', rows).answer, 'color price');
  assert.equal(Lib.matchFaq('PRICE?', rows).answer, 'price list');
  assert.equal(Lib.matchFaq('มีที่จอดไหม', rows), null);
});

test('normalizeThaiPhone', () => {
  assert.equal(Lib.normalizeThaiPhone('081-234-5678'), '0812345678');
  assert.equal(Lib.normalizeThaiPhone('+66 81 234 5678'), '0812345678');
  assert.equal(Lib.normalizeThaiPhone('02-123-4567'), '021234567');
  assert.equal(Lib.normalizeThaiPhone('12345'), null);
});

const v2 = {
  success: true,
  data: {
    isDuplicate: false, matchedAccount: null, amountInSlip: 135,
    rawSlip: {
      transRef: '68370160657749I376388B35', date: '2026-10-01T09:05:00+07:00', amount: { amount: 135 },
      receiver: { bank: { short: 'KBANK' }, account: { name: { th: 'น.ส. สมหญิง ใ', en: 'MS. SOMYING J' }, proxy: { type: 'MSISDN', account: 'xxx-xxx-5678' } } }
    }
  }
};
const v1 = {
  status: 200,
  data: {
    transRef: '015000100000ABC', date: '2026-10-01T09:05:00+07:00', amount: { amount: 135 },
    receiver: { account: { name: { th: 'นาย สมชาย ใจดี' }, bank: { type: 'BANKAC', account: 'xxx-x-x4321-x' } } }
  }
};

test('normalizeEasySlip reads v1, v2 and error shapes', () => {
  const a = Lib.normalizeEasySlip(v2);
  assert.equal(a.ok, true);
  assert.equal(a.amount, 135);
  assert.deepEqual(a.receiverNames, ['น.ส. สมหญิง ใ', 'MS. SOMYING J']);
  assert.deepEqual(a.receiverAccounts, ['xxx-xxx-5678']);
  const b = Lib.normalizeEasySlip(v1);
  assert.equal(b.transRef, '015000100000ABC');
  assert.deepEqual(b.receiverAccounts, ['xxx-x-x4321-x']);
  assert.equal(Lib.normalizeEasySlip({ success: false, error: { code: 'SLIP_NOT_FOUND' } }).error, 'SLIP_NOT_FOUND');
  assert.equal(Lib.normalizeEasySlip({ status: 404, message: 'slip_not_found' }).error, 'slip_not_found');
});

test('validateSlip accepts a correct slip and flags each fraud pattern', () => {
  const slip = Lib.normalizeEasySlip(v2);
  const exp = {
    minAmount: 135, maxAmount: 450, receiverNames: 'สมหญิง ใจดี, SOMYING JAIDEE', receiverAccounts: '0812345678',
    usedRefs: [], nowMs: Date.parse('2026-10-01T09:10:00+07:00'), maxAgeHours: 24, notBeforeMs: Date.parse('2026-10-01T09:00:00+07:00')
  };
  assert.deepEqual(Lib.validateSlip(slip, exp), { ok: true, reasons: [] });
  assert.deepEqual(Lib.validateSlip(slip, { ...exp, usedRefs: [slip.transRef] }).reasons, ['DUPLICATE']);
  assert.deepEqual(Lib.validateSlip({ ...slip, amount: 100 }, exp).reasons, ['AMOUNT_TOO_LOW']);
  assert.deepEqual(Lib.validateSlip({ ...slip, amount: 450 }, exp).reasons, []); // paid in full is fine
  assert.deepEqual(Lib.validateSlip({ ...slip, amount: 5000 }, exp).reasons, ['AMOUNT_TOO_HIGH']);
  assert.deepEqual(Lib.validateSlip(slip, { ...exp, receiverAccounts: '0899999999', receiverNames: 'อื่น ๆ' }).reasons, ['RECEIVER_MISMATCH']);
  assert.deepEqual(Lib.validateSlip(slip, { ...exp, receiverAccounts: '', receiverNames: '' }).reasons, ['RECEIVER_UNVERIFIED']);
  assert.deepEqual(Lib.validateSlip(slip, { ...exp, nowMs: exp.nowMs + 2 * DAY }).reasons, ['TOO_OLD']);
  assert.deepEqual(Lib.validateSlip(slip, { ...exp, notBeforeMs: exp.notBeforeMs + 2 * HOUR }).reasons, ['BEFORE_BOOKING']);
  assert.deepEqual(Lib.validateSlip({ ok: false, error: 'SLIP_NOT_FOUND' }, exp).reasons, ['SLIP_NOT_FOUND']);
});

test('receiverCheck: name alone can confirm when the slip hides the account', () => {
  const slip = Lib.normalizeEasySlip(v1);
  assert.equal(Lib.receiverCheck({ ...slip, receiverAccounts: [] }, { receiverNames: 'สมชาย ใจดี' }), 'match');
  assert.equal(Lib.receiverCheck(slip, { receiverAccounts: '123-4-54321-0', receiverNames: 'สมชาย ใจดี' }), 'match');
  assert.equal(Lib.receiverCheck(slip, { receiverAccounts: '123-4-54321-0', receiverNames: 'สมศรี' }), 'mismatch');
  assert.equal(Lib.receiverCheck({ ...slip, matchedAccount: true }, {}), 'match');
});
