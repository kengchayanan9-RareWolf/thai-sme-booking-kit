/**
 * Google Calendar sync. Confirmed bookings become events (tagged with the booking ref).
 * Any other event on the calendar — lunch, a day off, an all-day event — blocks those slots.
 */

function calendar_() {
  const id = String(settings_().calendar_id || '').trim();
  const cal = id ? CalendarApp.getCalendarById(id) : CalendarApp.getDefaultCalendar();
  if (!cal) throw new Error('Calendar not found: ' + id);
  return cal;
}

function addCalendarEvent_(b) {
  const ev = calendar_().createEvent(
    b.serviceName + ' – ' + b.name,
    new Date(b.startMs),
    new Date(b.endMs),
    { description: 'รหัสจอง ' + b.ref + '\nโทร ' + b.phone + (b.slipAmount ? '\nมัดจำ ' + baht_(b.slipAmount) : '') }
  );
  ev.setTag('bookingRef', b.ref);
  return ev.getId();
}

function removeCalendarEvent_(eventId) {
  try {
    const ev = calendar_().getEventById(eventId);
    if (ev) ev.deleteEvent();
  } catch (err) {
    log_('WARN', 'calendar delete', err);
  }
}

function calendarBlocks_(startMs, endMs) {
  if (!Lib.isTruthy(settings_().calendar_blocks_slots)) return [];
  try {
    return calendar_().getEvents(new Date(startMs), new Date(endMs))
      .filter((ev) => !ev.getTag('bookingRef'))
      .map((ev) => ({ startMs: ev.getStartTime().getTime(), endMs: ev.getEndTime().getTime(), block: true }));
  } catch (err) {
    log_('WARN', 'calendar read', err);
    return [];
  }
}
