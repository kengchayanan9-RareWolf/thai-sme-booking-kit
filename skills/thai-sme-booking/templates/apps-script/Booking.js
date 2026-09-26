/** Booking lifecycle: create (from LIFF) → PENDING_DEPOSIT → CONFIRMED (slip or owner) → COMPLETED. */


function publicServices_() {
  const cfg = settings_();
  return services_().map((s) => ({
    id: s.id,
    name: s.name,
    nameEn: s.nameEn,
    durationMin: s.durationMin,
    price: s.price,
    depositAmount: Lib.computeDeposit(s.price, cfg, s.deposit),
    description: s.description,
    imageUrl: s.imageUrl
  }));
}

function bookingShopInfo_() {
  const cfg = settings_();
  return {
    name: cfg.shop_name,
    daysAhead: Number(cfg.days_ahead) || 30,
    holdMinutes: Number(cfg.hold_minutes) || 20,
    brandColor: cfg.brand_color,
    lineOaId: cfg.line_oa_id || '',
    demoMode: Lib.isTruthy(cfg.demo_mode),
    privacyUrl: cfg.privacy_url || (cfg.site_url ? String(cfg.site_url).replace(/\/$/, '') + '/privacy' : '')
  };
}

/** req comes from the Worker: { userId, displayName, name, phone, serviceId, startMs, consent }. */
function createBooking_(req) {
  if (!req.userId) return { ok: false, error: 'NOT_LOGGED_IN' };
  if (!req.consent) return { ok: false, error: 'CONSENT_REQUIRED' };
  const name = String(req.name || '').trim().slice(0, 60);
  if (!name) return { ok: false, error: 'NAME_REQUIRED' };
  const phone = Lib.normalizeThaiPhone(req.phone);
  if (!phone) return { ok: false, error: 'BAD_PHONE' };
  const svc = findService_(req.serviceId);
  if (!svc) return { ok: false, error: 'BAD_SERVICE' };

  const cfg = settings_();
  const startMs = Number(req.startMs);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let booking;
  try {
    // One open hold per customer: a new booking replaces their unpaid one, so nobody can hoard slots.
    // Their own hold is ignored in the check so they can re-submit the same time.
    const mine = bookings_().filter((b) => b.lineUserId === req.userId && b.status === Lib.STATUS.PENDING);
    if (!isSlotFree_(svc.id, startMs, mine.length ? mine[0].ref : undefined)) return { ok: false, error: 'SLOT_TAKEN' };
    mine.forEach((b) => updateRow_('Bookings', b.row, { status: Lib.STATUS.CANCELLED, note: 'replaced by a newer booking' }));

    const deposit = Lib.computeDeposit(svc.price, cfg, svc.deposit);
    const existing = bookings_().map((b) => b.ref);
    let ref;
    do { ref = Lib.makeRef(Math.random); } while (existing.indexOf(ref) !== -1);

    const now = new Date();
    booking = {
      ref: ref,
      status: deposit > 0 ? Lib.STATUS.PENDING : Lib.STATUS.CONFIRMED,
      lineUserId: req.userId,
      name: name,
      phone: phone,
      serviceId: svc.id,
      serviceName: svc.name,
      startMs: startMs,
      endMs: startMs + svc.durationMin * Lib.MIN,
      createdMs: now.getTime(),
      price: svc.price,
      deposit: deposit,
      slipAmount: 0
    };
    appendRow_('Bookings', {
      ref: ref,
      created_at: now,
      status: booking.status,
      line_user_id: req.userId,
      name: name,
      phone: phone,
      service_id: svc.id,
      service_name: svc.name,
      start: new Date(booking.startMs),
      end: new Date(booking.endMs),
      price: svc.price,
      deposit: deposit,
      consent_at: now,
      note: req.displayName ? 'LINE: ' + String(req.displayName).slice(0, 60) : ''
    });
    SpreadsheetApp.flush();
    booking.row = sheet_('Bookings').getLastRow();
  } finally {
    lock.releaseLock();
  }

  if (booking.status === Lib.STATUS.CONFIRMED) onConfirmed_(booking);

  return {
    ok: true,
    ref: booking.ref,
    status: booking.status,
    serviceName: booking.serviceName,
    startMs: booking.startMs,
    startText: Lib.thaiDateTime(booking.startMs, tzOffset_()),
    price: booking.price,
    deposit: booking.deposit,
    promptpayId: booking.deposit > 0 ? String(cfg.promptpay_id) : '',
    promptpayName: String(cfg.promptpay_name || ''),
    holdMinutes: Number(cfg.hold_minutes) || 20
  };
}

/** Runs once a booking is confirmed by slip, by the owner, or because no deposit was needed. */
function onConfirmed_(b) {
  try {
    const eventId = addCalendarEvent_(b);
    if (eventId && b.row) updateRow_('Bookings', b.row, { calendar_event_id: eventId });
  } catch (err) {
    log_('WARN', 'calendar', err);
  }
  alertOwner_('✅ จองใหม่ ' + b.ref + '\n' + b.serviceName + '\n' + Lib.thaiDateTime(b.startMs, tzOffset_()) +
    '\n' + b.name + ' ' + b.phone + (b.slipAmount ? '\nมัดจำ ' + baht_(b.slipAmount) : ''));
}

/**
 * Installable onEdit trigger (created by setup). The owner manages bookings by changing the
 * status dropdown: approving a slip that needed review, or cancelling.
 */
function onSheetEdit(e) {
  const sh = e.range.getSheet();
  if (sh.getName() !== 'Bookings' || e.range.getNumRows() !== 1 || e.range.getRow() < 2) return;
  const header = header_(sh);
  if (header[e.range.getColumn() - 1] !== 'status') return;

  settingsCache_ = null;
  const b = bookings_().find((x) => x.row === e.range.getRow());
  if (!b) return;
  const before = String(e.oldValue || '');

  if (b.status === Lib.STATUS.CONFIRMED && (before === Lib.STATUS.REVIEW || before === Lib.STATUS.PENDING || before === Lib.STATUS.EXPIRED)) {
    updateRow_('Bookings', b.row, { paid_at: new Date() });
    onConfirmed_(b);
    push_(b.lineUserId, [confirmationFlex_(b, settings_())]);
  } else if (b.status === Lib.STATUS.CANCELLED && b.calendarEventId) {
    removeCalendarEvent_(b.calendarEventId);
  }
}
