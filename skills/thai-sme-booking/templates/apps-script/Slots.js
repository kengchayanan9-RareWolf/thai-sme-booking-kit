/** Availability: opening hours − holidays − active bookings − owner's own calendar events. */

function availableSlots_(dateStr, serviceId, excludeRef) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) return [];
  const svc = findService_(serviceId);
  if (!svc) return [];
  const cfg = settings_();
  const tz = tzOffset_();
  const now = Date.now();
  const dayStart = Lib.localToMs(dateStr, 0, tz);
  const dayEnd = dayStart + Lib.DAY;
  if (dayEnd < now || dayStart > now + (Number(cfg.days_ahead) || 30) * Lib.DAY) return [];

  const hold = Number(cfg.hold_minutes) || 20;
  const busy = bookings_()
    .filter((b) => b.ref !== excludeRef && b.startMs && Lib.overlaps(b.startMs, b.endMs, dayStart, dayEnd))
    .filter((b) => Lib.blocksSlot(b, now, hold))
    .map((b) => ({ startMs: b.startMs, endMs: b.endMs }))
    .concat(calendarBlocks_(dayStart, dayEnd));

  return Lib.computeSlots({
    date: dateStr,
    hours: hoursFor_(dateStr),
    holiday: isHoliday_(dateStr),
    durationMin: svc.durationMin,
    stepMin: Number(cfg.slot_step_min) || 30,
    bufferMin: Number(cfg.buffer_min) || 0,
    busy: busy,
    nowMs: now,
    minLeadMin: (Number(cfg.min_lead_hours) || 0) * 60,
    tzOffsetMin: tz,
    capacity: Number(cfg.capacity) || 1
  }).map((s) => ({ startMs: s.startMs, label: s.label }));
}

function isSlotFree_(serviceId, startMs, excludeRef) {
  const dateStr = Lib.msToLocalDate(Number(startMs), tzOffset_());
  return availableSlots_(dateStr, serviceId, excludeRef).some((s) => s.startMs === Number(startMs));
}
