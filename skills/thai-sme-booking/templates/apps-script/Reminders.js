/** Time-driven jobs, installed by setup(): reminders (daily), hold expiry (10 min), PDPA purge (monthly). */

function sendReminders() {
  const cfg = settings_();
  const due = Lib.dueReminders(bookings_(), Date.now(), tzOffset_());
  if (!due.length) return;

  const q = quota_();
  if (q.limit !== null && q.used + due.length > q.limit) {
    log_('WARN', 'reminders', 'LINE quota too low: ' + q.used + '/' + q.limit + ', need ' + due.length);
    MailApp.sendEmail(String(cfg.owner_email || Session.getEffectiveUser().getEmail()),
      '[' + cfg.shop_name + '] โควต้าข้อความ LINE ไม่พอส่งเตือนนัด',
      'เดือนนี้ใช้ไป ' + q.used + '/' + q.limit + ' ข้อความ ต้องส่งเตือน ' + due.length + ' ราย\n' +
      'รายชื่อลูกค้าพรุ่งนี้:\n' + due.map((b) => b.name + ' ' + b.phone + ' ' + b.serviceName).join('\n') +
      '\n\nพิจารณาอัปเกรดแพ็กเกจ LINE OA หรือโทรเตือนลูกค้าเอง');
    return;
  }

  due.forEach((b) => {
    if (push_(b.lineUserId, [reminderFlex_(b, cfg)])) updateRow_('Bookings', b.row, { reminded_at: new Date() });
  });
}

function expireHolds() {
  const hold = Number(settings_().hold_minutes) || 20;
  Lib.expiredHolds(bookings_(), Date.now(), hold).forEach((b) => {
    updateRow_('Bookings', b.row, { status: Lib.STATUS.EXPIRED, note: 'ไม่ได้ชำระมัดจำภายใน ' + hold + ' นาที' });
  });
}

/** PDPA: anonymize personal data of old bookings but keep rows for revenue statistics. */
function purgeOldData() {
  const months = Number(settings_().retention_months) || 12;
  Lib.retentionExpired(bookings_(), Date.now(), months).forEach((b) => {
    updateRow_('Bookings', b.row, { name: '-', phone: '-', line_user_id: '-', note: 'anonymized (PDPA)' });
  });
  const log = sheet_('Log');
  if (log.getLastRow() > 3000) log.deleteRows(2, log.getLastRow() - 2000);
}
