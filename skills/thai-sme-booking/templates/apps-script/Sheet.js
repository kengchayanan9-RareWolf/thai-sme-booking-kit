/** Spreadsheet access. Every tab has a header row; rows are read as objects keyed by header. */

const TABS = {
  Settings: ['key', 'value', 'note'],
  Services: ['id', 'name', 'name_en', 'duration_min', 'price', 'deposit', 'description', 'image_url', 'active'],
  Hours: ['day', 'open', 'close', 'closed'],
  Holidays: ['date', 'note'],
  Bookings: ['ref', 'created_at', 'status', 'line_user_id', 'name', 'phone', 'service_id', 'service_name',
    'start', 'end', 'price', 'deposit', 'consent_at', 'slip_trans_ref', 'slip_amount', 'paid_at',
    'calendar_event_id', 'reminded_at', 'note'],
  FAQ: ['keywords', 'answer', 'active'],
  Site: ['key', 'value'],
  Staff: ['name', 'role', 'bio', 'image_url', 'active'],
  Reviews: ['name', 'text', 'stars', 'active'],
  Gallery: ['image_url', 'caption', 'active'],
  Log: ['time', 'level', 'event', 'detail']
};

const SETTING_DEFAULTS = {
  timezone: 'Asia/Bangkok',
  deposit_type: 'percent',
  deposit_value: 30,
  hold_minutes: 20,
  slot_step_min: 30,
  buffer_min: 0,
  capacity: 1,
  days_ahead: 30,
  min_lead_hours: 2,
  reminder_hour: 18,
  slip_max_age_hours: 24,
  retention_months: 12,
  booking_keywords: 'จอง,นัด,คิว,book',
  owner_alert_via: 'line',
  calendar_blocks_slots: true,
  demo_mode: false,
  brand_color: '#9C6B78'
};

let settingsCache_ = null;

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Missing tab "' + name + '" — run menu ⚙️ ติดตั้ง / ซ่อมระบบ');
  return sh;
}

/** opts.display = true reads what the owner sees (safe for times typed as 10:00). */
function rows_(name, opts) {
  const range = sheet_(name).getDataRange();
  const values = opts && opts.display ? range.getDisplayValues() : range.getValues();
  const header = values.shift().map(String);
  return values
    .map((r, i) => {
      const o = { _row: i + 2 };
      header.forEach((h, j) => { o[h] = r[j]; });
      return o;
    })
    .filter((o) => header.some((h) => o[h] !== '' && o[h] !== null));
}

function header_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
}

/** Strings that Sheets would coerce (phone numbers, IDs, times, dates) are stored as literal text. */
function cell_(v) {
  return typeof v === 'string' && /^[+0-9][0-9\-\s:./]*$/.test(v) ? "'" + v : v;
}

function appendRow_(name, obj) {
  const sh = sheet_(name);
  sh.appendRow(header_(sh).map((h) => (h in obj ? cell_(obj[h]) : '')));
}

function updateRow_(name, rowIndex, patch) {
  const sh = sheet_(name);
  const header = header_(sh);
  Object.keys(patch).forEach((k) => {
    const c = header.indexOf(k);
    if (c >= 0) sh.getRange(rowIndex, c + 1).setValue(cell_(patch[k]));
  });
}

function settings_() {
  if (settingsCache_) return settingsCache_;
  const o = Object.assign({}, SETTING_DEFAULTS);
  rows_('Settings').forEach((r) => {
    const k = String(r.key).trim();
    if (k && r.value !== '') o[k] = r.value;
  });
  settingsCache_ = o;
  return o;
}

function setSetting_(key, value) {
  const row = rows_('Settings').find((r) => String(r.key).trim() === key);
  if (row) updateRow_('Settings', row._row, { value: value });
  else appendRow_('Settings', { key: key, value: value });
  settingsCache_ = null;
}

function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

function tzOffset_() {
  const z = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'Z'); // e.g. +0700
  const sign = z.charAt(0) === '-' ? -1 : 1;
  return sign * (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5)));
}

function ms_(v) {
  if (v instanceof Date) return v.getTime();
  if (!v) return null;
  const t = Date.parse(v);
  return isNaN(t) ? null : t;
}

function ymd_(v) {
  return v instanceof Date ? Utilities.formatDate(v, ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd') : String(v).trim();
}

function isOff_(v) {
  return v === false || /^(false|no|0|ไม่)$/i.test(String(v).trim());
}

function log_(level, event, detail) {
  try {
    appendRow_('Log', { time: new Date(), level: level, event: event, detail: String(detail).slice(0, 2000) });
  } catch (err) {
    console.error(level, event, detail, err);
  }
}

// ---------- typed readers ----------

function toBooking_(r) {
  return {
    row: r._row,
    ref: String(r.ref),
    status: String(r.status),
    lineUserId: String(r.line_user_id),
    name: String(r.name),
    phone: String(r.phone),
    serviceId: String(r.service_id),
    serviceName: String(r.service_name),
    startMs: ms_(r.start),
    endMs: ms_(r.end),
    createdMs: ms_(r.created_at),
    price: Number(r.price) || 0,
    deposit: Number(r.deposit) || 0,
    slipTransRef: String(r.slip_trans_ref || ''),
    slipAmount: Number(r.slip_amount) || 0,
    paidMs: ms_(r.paid_at),
    calendarEventId: String(r.calendar_event_id || ''),
    remindedMs: ms_(r.reminded_at),
    note: String(r.note || '')
  };
}

function bookings_() {
  return rows_('Bookings').map(toBooking_);
}

function findBooking_(ref) {
  return bookings_().find((b) => b.ref === String(ref)) || null;
}

function services_() {
  return rows_('Services')
    .filter((r) => r.id !== '' && !isOff_(r.active))
    .map((r) => ({
      id: String(r.id),
      name: String(r.name),
      nameEn: String(r.name_en || ''),
      durationMin: Number(r.duration_min) || 60,
      price: Number(r.price) || 0,
      deposit: r.deposit,
      description: String(r.description || ''),
      imageUrl: String(r.image_url || '')
    }));
}

function findService_(id) {
  return services_().find((s) => s.id === String(id)) || null;
}

function hoursRows_() {
  return rows_('Hours', { display: true });
}

function hoursFor_(dateStr) {
  const dow = Lib.dayOfWeek(dateStr);
  const row = hoursRows_().find((r) => Lib.dayKey(r.day) === dow);
  return row ? { open: row.open, close: row.close, closed: row.closed || (!row.open && !row.close) } : null;
}

function isHoliday_(dateStr) {
  return rows_('Holidays').some((r) => ymd_(r.date) === dateStr);
}

function activeRows_(name) {
  return rows_(name).filter((r) => !isOff_(r.active));
}
