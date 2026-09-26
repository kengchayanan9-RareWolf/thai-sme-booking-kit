/**
 * Pure booking logic shared by Apps Script and the Node test suite.
 * Nothing in here may touch SpreadsheetApp, UrlFetchApp, CalendarApp, etc.
 * Apps Script loads every file into one global scope; Node gets module.exports.
 */
var Lib = (function () {
  var MIN = 60 * 1000;
  var HOUR = 60 * MIN;
  var DAY = 24 * HOUR;

  var STATUS = {
    PENDING: 'PENDING_DEPOSIT',
    CONFIRMED: 'CONFIRMED',
    REVIEW: 'NEEDS_REVIEW',
    EXPIRED: 'EXPIRED',
    CANCELLED: 'CANCELLED',
    COMPLETED: 'COMPLETED',
    NO_SHOW: 'NO_SHOW'
  };

  // Owners type day names in Thai or English; both map to JS getUTCDay() numbers.
  var DAY_KEYS = {
    sun: 0, sunday: 0, 'อาทิตย์': 0, 'อา': 0,
    mon: 1, monday: 1, 'จันทร์': 1, 'จ': 1,
    tue: 2, tuesday: 2, 'อังคาร': 2, 'อ': 2,
    wed: 3, wednesday: 3, 'พุธ': 3, 'พ': 3,
    thu: 4, thursday: 4, 'พฤหัสบดี': 4, 'พฤหัส': 4, 'พฤ': 4,
    fri: 5, friday: 5, 'ศุกร์': 5, 'ศ': 5,
    sat: 6, saturday: 6, 'เสาร์': 6, 'ส': 6
  };

  var TH_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  var TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  // ---------- time helpers (Thailand has no DST, but the offset stays configurable) ----------

  function parseHHMM(s) {
    var m = /^(\d{1,2})[:.](\d{2})(?::\d{2})?$/.exec(String(s).trim());
    if (!m) throw new Error('Bad time (use HH:MM): ' + s);
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function minutesToHHMM(t) {
    var h = Math.floor(t / 60), m = t % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function localToMs(dateStr, minutes, tzOffsetMin) {
    var p = dateStr.split('-').map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2]) + (minutes - tzOffsetMin) * MIN;
  }

  function msToLocalDate(ms, tzOffsetMin) {
    return new Date(ms + tzOffsetMin * MIN).toISOString().slice(0, 10);
  }

  function msToLocalHHMM(ms, tzOffsetMin) {
    return new Date(ms + tzOffsetMin * MIN).toISOString().slice(11, 16);
  }

  function dayOfWeek(dateStr) {
    var p = dateStr.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  }

  function dayKey(value) {
    var k = String(value).trim().toLowerCase().replace(/\.$/, '');
    return Object.prototype.hasOwnProperty.call(DAY_KEYS, k) ? DAY_KEYS[k] : null;
  }

  /** "ส. 3 ต.ค. 2569 14:00" (Buddhist Era year, as Thai customers expect). */
  function thaiDateTime(ms, tzOffsetMin) {
    var d = new Date(ms + tzOffsetMin * MIN);
    return TH_DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + TH_MONTHS[d.getUTCMonth()] + ' ' +
      (d.getUTCFullYear() + 543) + ' ' + msToLocalHHMM(ms, tzOffsetMin);
  }

  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  // ---------- bookings ----------

  function isHoldExpired(b, nowMs, holdMin) {
    return b.status === STATUS.PENDING && nowMs - b.createdMs > holdMin * MIN;
  }

  /** Does this booking occupy its time slot right now? */
  function blocksSlot(b, nowMs, holdMin) {
    if (b.status === STATUS.CONFIRMED || b.status === STATUS.REVIEW || b.status === STATUS.COMPLETED) return true;
    if (b.status === STATUS.PENDING) return !isHoldExpired(b, nowMs, holdMin);
    return false;
  }

  /**
   * Free start times for one service on one local date.
   * opts: { date, hours:{open,close,closed}, holiday, durationMin, stepMin, bufferMin,
   *         busy:[{startMs,endMs,block}], nowMs, minLeadMin, tzOffsetMin, capacity }
   * A busy item with block:true (e.g. owner's own calendar event) closes the slot regardless of capacity.
   */
  function computeSlots(opts) {
    if (opts.holiday || !opts.hours || isClosed(opts.hours.closed)) return [];
    var open = parseHHMM(opts.hours.open);
    var close = parseHHMM(opts.hours.close);
    var step = opts.stepMin || 30;
    var buffer = (opts.bufferMin || 0) * MIN;
    var capacity = opts.capacity || 1;
    var earliest = opts.nowMs + (opts.minLeadMin || 0) * MIN;
    var out = [];
    for (var t = open; t + opts.durationMin <= close; t += step) {
      var s = localToMs(opts.date, t, opts.tzOffsetMin);
      var e = s + opts.durationMin * MIN;
      if (s < earliest) continue;
      var used = 0, blocked = false;
      for (var i = 0; i < opts.busy.length; i++) {
        var b = opts.busy[i];
        if (!overlaps(s, e + buffer, b.startMs, b.endMs + buffer)) continue;
        if (b.block) { blocked = true; break; }
        used++;
      }
      if (!blocked && used < capacity) out.push({ startMs: s, endMs: e, label: minutesToHHMM(t) });
    }
    return out;
  }

  function computeDeposit(price, cfg, override) {
    price = Number(price) || 0;
    if (override !== '' && override !== null && override !== undefined && !isNaN(Number(override))) {
      return Math.min(Number(override), price);
    }
    var v = Number(cfg.deposit_value) || 0;
    if (cfg.deposit_type === 'percent') return Math.min(price, Math.ceil(price * v / 100));
    if (cfg.deposit_type === 'fixed') return Math.min(price, v);
    return 0;
  }

  var REF_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — customers read refs aloud
  function makeRef(randomFn) {
    var s = 'B';
    for (var i = 0; i < 5; i++) s += REF_CHARS.charAt(Math.floor(randomFn() * REF_CHARS.length));
    return s;
  }

  function expiredHolds(bookings, nowMs, holdMin) {
    return bookings.filter(function (b) { return isHoldExpired(b, nowMs, holdMin); });
  }

  /** Confirmed bookings starting tomorrow (local date) that have not been reminded yet. */
  function dueReminders(bookings, nowMs, tzOffsetMin) {
    var tomorrow = msToLocalDate(nowMs + DAY, tzOffsetMin);
    return bookings.filter(function (b) {
      return b.status === STATUS.CONFIRMED && !b.remindedMs && msToLocalDate(b.startMs, tzOffsetMin) === tomorrow;
    });
  }

  /** Finished bookings older than the retention window — their personal data gets anonymized. */
  function retentionExpired(bookings, nowMs, months) {
    var cutoff = nowMs - months * 30.44 * DAY;
    var final = [STATUS.COMPLETED, STATUS.NO_SHOW, STATUS.CANCELLED, STATUS.EXPIRED, STATUS.CONFIRMED];
    return bookings.filter(function (b) {
      return b.startMs < cutoff && final.indexOf(b.status) !== -1 && b.phone !== '-';
    });
  }

  /** Monthly report for operator mode. month = "YYYY-MM" (local). */
  function summarizeMonth(bookings, month, tzOffsetMin) {
    var inMonth = bookings.filter(function (b) { return msToLocalDate(b.startMs, tzOffsetMin).slice(0, 7) === month; });
    var byStatus = {}, services = {}, weekdays = [0, 0, 0, 0, 0, 0, 0];
    var revenue = 0, deposits = 0;
    inMonth.forEach(function (b) {
      byStatus[b.status] = (byStatus[b.status] || 0) + 1;
      var served = b.status === STATUS.COMPLETED || b.status === STATUS.CONFIRMED;
      if (served) {
        revenue += Number(b.price) || 0;
        services[b.serviceName] = (services[b.serviceName] || 0) + 1;
        weekdays[dayOfWeek(msToLocalDate(b.startMs, tzOffsetMin))]++;
      }
      if (served || b.status === STATUS.NO_SHOW) deposits += Number(b.slipAmount) || 0;
    });
    var completed = byStatus[STATUS.COMPLETED] || 0, noShow = byStatus[STATUS.NO_SHOW] || 0;
    var top = Object.keys(services).map(function (k) { return { name: k, count: services[k] }; })
      .sort(function (a, b) { return b.count - a.count; });
    var busiest = weekdays.indexOf(Math.max.apply(null, weekdays));
    return {
      month: month,
      total: inMonth.length,
      byStatus: byStatus,
      bookedRevenue: revenue,
      depositsCollected: deposits,
      noShowRate: completed + noShow ? noShow / (completed + noShow) : 0,
      topServices: top.slice(0, 5),
      busiestWeekday: top.length ? TH_DAYS[busiest] : null
    };
  }

  // ---------- chat ----------

  /** Longest matching keyword wins, so "ราคาทำสี" beats "ราคา". */
  function matchFaq(text, rows) {
    var t = String(text || '').toLowerCase().replace(/\s+/g, '');
    var best = null, bestLen = 0;
    rows.forEach(function (r) {
      if (r.active === false || String(r.active).toUpperCase() === 'FALSE') return;
      String(r.keywords || '').split(/[,\n]/).forEach(function (k) {
        k = k.trim().toLowerCase().replace(/\s+/g, '');
        if (k && t.indexOf(k) !== -1 && k.length > bestLen) { best = r; bestLen = k.length; }
      });
    });
    return best;
  }

  function normalizeThaiPhone(s) {
    var d = String(s || '').replace(/\D/g, '');
    if (d.indexOf('66') === 0 && d.length === 11) d = '0' + d.slice(2);
    return /^0\d{8,9}$/.test(d) ? d : null;
  }

  // ---------- slips ----------

  /** Normalize EasySlip v1 (flat) and v2 (data.rawSlip) responses into one shape. */
  function normalizeEasySlip(json) {
    if (!json) return { ok: false, error: 'EMPTY_RESPONSE' };
    if (json.success === false) return { ok: false, error: (json.error && json.error.code) || 'PROVIDER_ERROR' };
    if (json.status !== undefined && json.status !== 200) return { ok: false, error: String(json.message || 'HTTP_' + json.status) };
    var d = json.data || {};
    var raw = d.rawSlip || d;
    var amount = raw.amount && typeof raw.amount === 'object' ? raw.amount.amount : raw.amount;
    if (amount === undefined || amount === null) amount = d.amountInSlip;
    var rc = raw.receiver || {};
    var acc = rc.account || {};
    var names = [], accounts = [];
    [acc.name, rc.name].forEach(function (n) {
      if (!n) return;
      if (typeof n === 'string') names.push(n);
      else { if (n.th) names.push(n.th); if (n.en) names.push(n.en); }
    });
    [acc.bank && acc.bank.account, acc.proxy && acc.proxy.account, typeof rc.account === 'string' ? rc.account : null]
      .forEach(function (a) { if (a) accounts.push(String(a)); });
    if (!raw.transRef) return { ok: false, error: 'NO_TRANSREF' };
    return {
      ok: true,
      transRef: String(raw.transRef),
      amount: Number(amount),
      dateMs: raw.date ? Date.parse(raw.date) : null,
      receiverNames: names,
      receiverAccounts: accounts,
      isDuplicate: d.isDuplicate === true,
      matchedAccount: d.matchedAccount === undefined || d.matchedAccount === null ? null : !!d.matchedAccount
    };
  }

  function normName(s) {
    return String(s || '').toLowerCase().trim()
      .replace(/^(นางสาว|นาง|นาย|น\.ส\.|ด\.ช\.|ด\.ญ\.|บจก\.|บริษัท|mrs|mr|ms|miss)\.?\s*/, '')
      .replace(/[\s.]/g, '');
  }

  function digitRuns(s) {
    return (String(s || '').match(/\d{3,}/g) || []);
  }

  /** 'match' | 'mismatch' | 'unknown' — slips mask account numbers and truncate names, so match loosely. */
  function receiverCheck(slip, exp) {
    if (slip.matchedAccount === true) return 'match';
    var wantDigits = String(exp.receiverAccounts || '').split(',')
      .map(function (a) { return a.replace(/\D/g, ''); }).filter(Boolean);
    var runs = [];
    (slip.receiverAccounts || []).forEach(function (a) { runs = runs.concat(digitRuns(a)); });
    var account = 'unknown';
    if (wantDigits.length && runs.length) {
      account = runs.some(function (r) {
        return wantDigits.some(function (w) { return w.indexOf(r) !== -1; });
      }) ? 'match' : 'mismatch';
    }
    var wantNames = String(exp.receiverNames || '').split(',').map(normName).filter(Boolean);
    var gotNames = (slip.receiverNames || []).map(normName).filter(function (n) { return n.length >= 3; });
    var name = 'unknown';
    if (wantNames.length && gotNames.length) {
      name = gotNames.some(function (g) {
        return wantNames.some(function (w) { return w.indexOf(g) === 0 || g.indexOf(w) === 0; });
      }) ? 'match' : 'mismatch';
    }
    if (account === 'match' && name !== 'mismatch') return 'match';
    if (account === 'unknown' && name === 'match') return 'match';
    if (account === 'unknown' && name === 'unknown') return 'unknown';
    return 'mismatch';
  }

  /**
   * slip: output of normalizeEasySlip (or any provider adapter with the same shape)
   * exp:  { minAmount, maxAmount, receiverNames, receiverAccounts, usedRefs[], nowMs, maxAgeHours, notBeforeMs }
   */
  function validateSlip(slip, exp) {
    if (!slip || !slip.ok) return { ok: false, reasons: [(slip && slip.error) || 'SLIP_UNREADABLE'] };
    var reasons = [];
    if (slip.isDuplicate || (exp.usedRefs || []).indexOf(slip.transRef) !== -1) reasons.push('DUPLICATE');
    if (!(slip.amount + 0.009 >= exp.minAmount)) reasons.push('AMOUNT_TOO_LOW');
    if (exp.maxAmount && slip.amount > exp.maxAmount + 0.009) reasons.push('AMOUNT_TOO_HIGH');
    var rc = receiverCheck(slip, exp);
    if (rc === 'mismatch') reasons.push('RECEIVER_MISMATCH');
    if (rc === 'unknown') reasons.push('RECEIVER_UNVERIFIED');
    if (slip.dateMs) {
      if (exp.nowMs - slip.dateMs > (exp.maxAgeHours || 24) * HOUR) reasons.push('TOO_OLD');
      if (exp.notBeforeMs && slip.dateMs < exp.notBeforeMs - 10 * MIN) reasons.push('BEFORE_BOOKING');
    }
    return { ok: reasons.length === 0, reasons: reasons };
  }

  function isTruthy(v) {
    return v === true || /^(true|yes|y|1|ใช่)$/i.test(String(v).trim());
  }

  function isClosed(v) {
    return isTruthy(v) || /^(closed|ปิด|หยุด)$/i.test(String(v).trim());
  }

  return {
    STATUS: STATUS, MIN: MIN, HOUR: HOUR, DAY: DAY,
    parseHHMM: parseHHMM, minutesToHHMM: minutesToHHMM, localToMs: localToMs,
    msToLocalDate: msToLocalDate, msToLocalHHMM: msToLocalHHMM, dayOfWeek: dayOfWeek, dayKey: dayKey,
    thaiDateTime: thaiDateTime, overlaps: overlaps,
    isHoldExpired: isHoldExpired, blocksSlot: blocksSlot, computeSlots: computeSlots,
    computeDeposit: computeDeposit, makeRef: makeRef, expiredHolds: expiredHolds,
    dueReminders: dueReminders, retentionExpired: retentionExpired, summarizeMonth: summarizeMonth,
    matchFaq: matchFaq, normalizeThaiPhone: normalizeThaiPhone,
    normalizeEasySlip: normalizeEasySlip, receiverCheck: receiverCheck, validateSlip: validateSlip,
    isTruthy: isTruthy, isClosed: isClosed
  };
})();

if (typeof module !== 'undefined') module.exports = Lib;
