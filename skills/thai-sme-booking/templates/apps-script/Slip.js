/**
 * Deposit slips. The customer sends the slip image in LINE chat; we fetch it from LINE, verify it
 * with the bank through a provider, and confirm the booking — or hand it to the owner for review.
 */

const REASON_TH = {
  DUPLICATE: 'สลิปนี้เคยใช้แล้ว',
  AMOUNT_TOO_LOW: 'ยอดโอนน้อยกว่ามัดจำ',
  AMOUNT_TOO_HIGH: 'ยอดโอนมากกว่าราคาบริการ',
  RECEIVER_MISMATCH: 'ชื่อ/บัญชีผู้รับไม่ตรงกับร้าน',
  RECEIVER_UNVERIFIED: 'ยืนยันบัญชีผู้รับไม่ได้ (ตั้งค่า receiver_names / receiver_accounts)',
  TOO_OLD: 'สลิปเก่าเกินกำหนด',
  BEFORE_BOOKING: 'เวลาโอนก่อนเวลาที่จอง',
  SLOT_TAKEN_AFTER_EXPIRY: 'ชำระหลังหมดเวลาและคิวถูกจองไปแล้ว',
  PROVIDER_DOWN: 'ระบบตรวจสลิปขัดข้อง'
};

/**
 * Provider adapters: (blob, ctx) → the normalized slip shape from Lib.normalizeEasySlip.
 * Add SlipOK, Thunder, etc. here and select with Script Property SLIP_PROVIDER.
 */
const SLIP_PROVIDERS = {
  easyslip: function (blob) {
    const field = prop_('SLIP_FILE_FIELD') || 'image'; // v1 legacy API uses "file"
    const payload = {};
    payload[field] = blob;
    const res = UrlFetchApp.fetch(prop_('SLIP_API_URL') || 'https://api.easyslip.com/v2/verify/bank', {
      method: 'post',
      headers: { Authorization: 'Bearer ' + prop_('SLIP_API_KEY') },
      payload: payload,
      muteHttpExceptions: true
    });
    try {
      return Lib.normalizeEasySlip(JSON.parse(res.getContentText()));
    } catch (err) {
      return { ok: false, error: 'PROVIDER_DOWN' };
    }
  },

  // Demo shops only (Settings demo_mode = TRUE): any image counts as a correct slip.
  mock: function (blob, ctx) {
    if (!Lib.isTruthy(settings_().demo_mode)) return { ok: false, error: 'PROVIDER_DOWN' };
    log_('WARN', 'slip', 'mock provider accepted a slip (demo mode)');
    return {
      ok: true, transRef: 'MOCK-' + Date.now(), amount: ctx.amount, dateMs: Date.now(),
      receiverNames: [], receiverAccounts: [], isDuplicate: false, matchedAccount: true
    };
  }
};

function verifySlipImage_(blob, ctx) {
  const provider = SLIP_PROVIDERS[prop_('SLIP_PROVIDER') || 'easyslip'];
  if (!provider) throw new Error('Unknown SLIP_PROVIDER ' + prop_('SLIP_PROVIDER'));
  return provider(blob, ctx);
}

function handleImage_(ev) {
  const userId = ev.source.userId;
  const now = Date.now();
  const b = bookings_()
    .filter((x) => x.lineUserId === userId &&
      (x.status === Lib.STATUS.PENDING || (x.status === Lib.STATUS.EXPIRED && now - x.createdMs < Lib.DAY)))
    .sort((a, c) => c.createdMs - a.createdMs)[0];
  if (!b) return false; // a photo unrelated to a booking — the owner sees it in LINE OA chat

  startLoading_(userId);
  const cfg = settings_();
  let slip;
  try {
    slip = verifySlipImage_(getMessageContent_(ev.message.id), { amount: b.deposit });
  } catch (err) {
    log_('ERROR', 'slip', err && err.stack ? err.stack : err);
    slip = { ok: false, error: 'PROVIDER_DOWN' };
  }

  if (!slip.ok && slip.error !== 'PROVIDER_DOWN') {
    // No readable slip QR (blurry, cropped, or just a photo): ask again, keep the hold.
    reply_(ev.replyToken, [text_(MSG.slipUnreadable)]);
    return true;
  }

  const usedRefs = bookings_().filter((x) => x.ref !== b.ref && x.slipTransRef).map((x) => x.slipTransRef);
  let result = Lib.validateSlip(slip, {
    minAmount: b.deposit,
    maxAmount: b.price,
    receiverNames: cfg.receiver_names,
    receiverAccounts: cfg.receiver_accounts || cfg.promptpay_id,
    usedRefs: usedRefs,
    nowMs: now,
    maxAgeHours: Number(cfg.slip_max_age_hours) || 24,
    notBeforeMs: b.createdMs
  });
  if (result.ok && b.status === Lib.STATUS.EXPIRED && !isSlotFree_(b.serviceId, b.startMs, b.ref)) {
    result = { ok: false, reasons: ['SLOT_TAKEN_AFTER_EXPIRY'] };
  }

  const patch = { slip_trans_ref: slip.transRef || '', slip_amount: slip.ok ? slip.amount : '' };
  if (result.ok) {
    patch.status = Lib.STATUS.CONFIRMED;
    patch.paid_at = new Date();
    updateRow_('Bookings', b.row, patch);
    const confirmed = Object.assign({}, b, { status: Lib.STATUS.CONFIRMED, slipAmount: slip.amount });
    reply_(ev.replyToken, [confirmationFlex_(confirmed, cfg)]);
    onConfirmed_(confirmed);
  } else {
    patch.status = Lib.STATUS.REVIEW;
    patch.note = 'slip: ' + result.reasons.join(', ');
    updateRow_('Bookings', b.row, patch);
    reply_(ev.replyToken, [text_(MSG.slipReview(b.ref))]);
    alertOwner_('⚠️ สลิปต้องตรวจสอบ ' + b.ref + '\n' + b.name + ' ' + b.phone + '\n' +
      b.serviceName + ' ' + Lib.thaiDateTime(b.startMs, tzOffset_()) + '\n' +
      'เหตุผล: ' + result.reasons.map((r) => REASON_TH[r] || r).join(', ') + '\n' +
      'ตรวจแล้วถูกต้อง → เปลี่ยนสถานะในชีตเป็น CONFIRMED');
  }
  return true;
}
