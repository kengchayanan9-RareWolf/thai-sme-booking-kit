/** Customer-facing LINE messages (Thai). Edit wording here; layout lives in the Flex builders. */

const MSG = {
  slipUnreadable: 'ขออภัยค่ะ ระบบอ่านสลิปไม่ได้ 🙏\nรบกวนส่งภาพสลิปที่เห็น QR ชัดเจนอีกครั้งนะคะ',
  slipReview: (ref) => 'ได้รับสลิปแล้วค่ะ 🙏 (รหัสจอง ' + ref + ')\nร้านกำลังตรวจสอบ และจะแจ้งยืนยันให้เร็วที่สุดนะคะ',
  reminderFooter: 'หากต้องการเลื่อนหรือยกเลิก กรุณาแจ้งร้านในแชทนี้ล่วงหน้านะคะ'
};

function text_(t) {
  return { type: 'text', text: String(t).slice(0, 5000) };
}

function baht_(n) {
  return '฿' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function kv_(label, value) {
  return {
    type: 'box', layout: 'baseline', spacing: 'sm',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#8A8A8A', flex: 2 },
      { type: 'text', text: String(value), size: 'sm', color: '#222222', flex: 5, wrap: true }
    ]
  };
}

function bubble_(cfg, title, titleColor, rows, button) {
  const bubble = {
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', spacing: 'md',
      contents: [
        { type: 'text', text: title, weight: 'bold', size: 'lg', color: titleColor, wrap: true },
        { type: 'text', text: String(cfg.shop_name || ''), size: 'xs', color: '#8A8A8A' },
        { type: 'separator' }
      ].concat(rows)
    }
  };
  if (button) {
    bubble.footer = {
      type: 'box', layout: 'vertical',
      contents: [{ type: 'button', style: 'primary', color: String(cfg.brand_color || '#9C6B78'), action: button }]
    };
  }
  return bubble;
}

function bookingFlex_(cfg) {
  return {
    type: 'flex',
    altText: 'จองคิวออนไลน์ ' + cfg.shop_name,
    contents: bubble_(cfg, 'จองคิวออนไลน์ได้ตลอด 24 ชม.', '#222222',
      [{ type: 'text', text: 'เลือกบริการ วัน และเวลาที่สะดวกได้เลยค่ะ', size: 'sm', wrap: true, color: '#555555' }],
      { type: 'uri', label: 'จองคิว', uri: liffUrl_(cfg) })
  };
}

function confirmationFlex_(b, cfg) {
  const rows = [
    kv_('รหัสจอง', b.ref),
    kv_('บริการ', b.serviceName),
    kv_('วันเวลา', Lib.thaiDateTime(b.startMs, tzOffset_())),
    kv_('ชื่อ', b.name)
  ];
  if (b.slipAmount) rows.push(kv_('มัดจำ', baht_(b.slipAmount) + ' ✓'));
  if (cfg.address) rows.push(kv_('ที่อยู่', cfg.address));
  return {
    type: 'flex',
    altText: 'ยืนยันการจอง ' + b.ref,
    contents: bubble_(cfg, '✅ ยืนยันการจองแล้ว', '#1B8A4B', rows,
      cfg.map_url ? { type: 'uri', label: 'ดูแผนที่', uri: String(cfg.map_url) } : null)
  };
}

function reminderFlex_(b, cfg) {
  return {
    type: 'flex',
    altText: 'เตือนนัดพรุ่งนี้ ' + Lib.thaiDateTime(b.startMs, tzOffset_()),
    contents: bubble_(cfg, '⏰ เตือนนัดพรุ่งนี้', '#222222', [
      kv_('บริการ', b.serviceName),
      kv_('วันเวลา', Lib.thaiDateTime(b.startMs, tzOffset_())),
      kv_('รหัสจอง', b.ref),
      { type: 'text', text: MSG.reminderFooter, size: 'xs', color: '#8A8A8A', wrap: true }
    ], cfg.map_url ? { type: 'uri', label: 'ดูแผนที่', uri: String(cfg.map_url) } : null)
  };
}
