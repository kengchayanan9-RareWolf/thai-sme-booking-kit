/** Owner menu, one-click setup (tabs, seed data, formatting, triggers) and operator reports. */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🗓️ ระบบจอง')
    .addItem('🌐 อัปเดตเว็บไซต์', 'publishSite')
    .addItem('📊 สรุปยอดเดือนนี้', 'monthlyReport')
    .addItem('📨 เช็กโควต้าข้อความ LINE', 'showQuota')
    .addSeparator()
    .addItem('🔔 ทดสอบแจ้งเตือนเจ้าของร้าน', 'testOwnerAlert')
    .addItem('⚙️ ติดตั้ง / ซ่อมระบบ', 'setup')
    .addToUi();
}

/** Safe to run repeatedly: creates missing tabs, seeds empty ones, re-installs triggers. */
function setup() {
  const ss = ss_();
  Object.keys(TABS).forEach((name) => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]).setFontWeight('bold').setBackground('#F3EDEF');
      sh.setFrozenRows(1);
      const seed = typeof SEED !== 'undefined' ? SEED[name] : null;
      if (seed && seed.length) {
        sh.getRange(2, 1, seed.length, TABS[name].length)
          .setValues(seed.map((r) => TABS[name].map((_, i) => (r[i] === undefined ? '' : cell_(r[i])))));
      }
    }
  });
  const first = ss.getSheets()[0];
  if (first.getName() !== 'Bookings' && first.getLastRow() === 0 && ss.getSheets().length > Object.keys(TABS).length) {
    ss.deleteSheet(first); // the blank "Sheet1" that came with the file
  }
  settingsCache_ = null;
  formatBookings_();
  installTriggers_();

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('OWNER_SETUP_CODE')) {
    props.setProperty('OWNER_SETUP_CODE', String(Math.floor(100000 + Math.random() * 900000)));
  }
  const missing = ['LINE_CHANNEL_ACCESS_TOKEN', 'SHARED_SECRET', 'SLIP_API_KEY'].filter((k) => !props.getProperty(k));
  SpreadsheetApp.getUi().alert(
    'ติดตั้งเรียบร้อย ✅\n\n' +
    'เจ้าของร้าน: เพิ่มเพื่อน LINE OA ของร้าน แล้วพิมพ์\n/owner ' + props.getProperty('OWNER_SETUP_CODE') +
    '\nเพื่อรับแจ้งเตือนการจองและสลิป' +
    (missing.length ? '\n\n⚠️ ยังไม่ได้ตั้ง Script Properties: ' + missing.join(', ') : ''));
}

function formatBookings_() {
  const sh = sheet_('Bookings');
  const header = header_(sh);
  const col = (h) => header.indexOf(h) + 1;
  const rows = sh.getMaxRows() - 1;
  const statuses = Object.keys(Lib.STATUS).map((k) => Lib.STATUS[k]);

  sh.getRange(2, col('status'), rows).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(statuses, true).setAllowInvalid(false).build());
  sh.getRange(2, col('phone'), rows).setNumberFormat('@');
  ['created_at', 'start', 'end', 'consent_at', 'paid_at', 'reminded_at'].forEach((h) => {
    sh.getRange(2, col(h), rows).setNumberFormat('dd/mm/yyyy hh:mm');
  });

  const statusRange = sh.getRange(2, col('status'), rows);
  const colors = {
    PENDING_DEPOSIT: '#FFF4CC', CONFIRMED: '#D9F2E3', NEEDS_REVIEW: '#FAD4D4',
    COMPLETED: '#E3EAF7', NO_SHOW: '#EEEEEE', EXPIRED: '#EEEEEE', CANCELLED: '#EEEEEE'
  };
  sh.setConditionalFormatRules(Object.keys(colors).map((s) =>
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(s).setBackground(colors[s])
      .setRanges([statusRange]).build()));
}

function installTriggers_() {
  const wanted = ['sendReminders', 'expireHolds', 'purgeOldData', 'onSheetEdit'];
  ScriptApp.getProjectTriggers()
    .filter((t) => wanted.indexOf(t.getHandlerFunction()) !== -1)
    .forEach((t) => ScriptApp.deleteTrigger(t));
  const hour = Number(settings_().reminder_hour) || 18;
  ScriptApp.newTrigger('sendReminders').timeBased().everyDays(1).atHour(hour).create();
  ScriptApp.newTrigger('expireHolds').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('purgeOldData').timeBased().onMonthDay(1).atHour(3).create();
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss_()).onEdit().create();
}

/** Writes this month and last month to a "Report" tab (used by operator mode / Care+). */
function monthlyReport() {
  const tz = tzOffset_();
  const now = Date.now();
  const thisMonth = Lib.msToLocalDate(now, tz).slice(0, 7);
  const d = new Date(now + tz * Lib.MIN);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const lastMonth = d.toISOString().slice(0, 7);
  const all = bookings_();
  const reports = [lastMonth, thisMonth].map((m) => Lib.summarizeMonth(all, m, tz));

  const line = (label, fn) => [label].concat(reports.map(fn));
  const rows = [
    ['ตัวชี้วัด', lastMonth, thisMonth],
    line('จำนวนการจองทั้งหมด', (r) => r.total),
    line('ยืนยัน/มาใช้บริการ', (r) => (r.byStatus.CONFIRMED || 0) + (r.byStatus.COMPLETED || 0)),
    line('ไม่มาตามนัด', (r) => r.byStatus.NO_SHOW || 0),
    line('หมดเวลา/ยกเลิก', (r) => (r.byStatus.EXPIRED || 0) + (r.byStatus.CANCELLED || 0)),
    line('รอตรวจสลิป', (r) => r.byStatus.NEEDS_REVIEW || 0),
    line('ยอดจองตามราคาบริการ (บาท)', (r) => r.bookedRevenue),
    line('มัดจำที่ได้รับ (บาท)', (r) => r.depositsCollected),
    line('อัตราไม่มาตามนัด', (r) => Math.round(r.noShowRate * 100) + '%'),
    line('บริการยอดนิยม', (r) => r.topServices.map((s) => s.name + ' (' + s.count + ')').join(', ')),
    line('วันที่ลูกค้าเยอะสุด', (r) => r.busiestWeekday || '-')
  ];
  let sh = ss_().getSheetByName('Report');
  if (!sh) sh = ss_().insertSheet('Report');
  sh.clear();
  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  sh.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#F3EDEF');
  sh.autoResizeColumns(1, 3);
  ss_().setActiveSheet(sh);
}

function showQuota() {
  const q = quota_();
  SpreadsheetApp.getUi().alert(q.limit === null
    ? 'ข้อความ push เดือนนี้: ' + q.used + ' (ไม่จำกัด)'
    : 'ข้อความ push เดือนนี้: ' + q.used + ' / ' + q.limit + '\n(ข้อความตอบกลับอัตโนมัติไม่นับโควต้า)');
}

function testOwnerAlert() {
  alertOwner_('🔔 ทดสอบแจ้งเตือนจากระบบจองของ ' + settings_().shop_name);
  ss_().toast('ส่งแล้ว — ถ้าไม่ได้รับ ให้พิมพ์ /owner <รหัส> ใน LINE OA ก่อน', '🔔', 8);
}
