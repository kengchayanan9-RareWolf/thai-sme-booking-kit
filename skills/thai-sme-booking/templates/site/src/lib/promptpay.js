// PromptPay (Thai QR, EMVCo) payload builder. Runs in the browser (LIFF page) and in Node tests.
// Spec summary: tag 29 = PromptPay merchant info (AID A000000677010111),
// sub-tag 01 phone (0066 + 9 digits), 02 national/tax ID (13), 03 e-wallet (15).

export function crc16(str) {
  // CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF. Check value for "123456789" is 29B1.
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function field(id, value) {
  return id + String(value.length).padStart(2, '0') + value;
}

export function formatTarget(id) {
  let digits = String(id).replace(/\D/g, '');
  if (digits.length >= 15) return { tag: '03', value: digits };
  if (digits.length >= 13) return { tag: '02', value: digits };
  if (/^66\d{9}$/.test(digits)) digits = '0' + digits.slice(2);
  if (!/^0\d{9}$/.test(digits)) throw new Error('PromptPay ID must be a 10-digit phone, 13-digit ID, or 15-digit e-wallet');
  return { tag: '01', value: ('0000000000000' + '66' + digits.slice(1)).slice(-13) };
}

// Tag order (58 before 53) follows dtinth/promptpay-qr, whose output Thai bank apps accept;
// tests pin its published vectors byte-for-byte.
export function promptPayPayload(id, amount) {
  const target = formatTarget(id);
  const merchant = field('00', 'A000000677010111') + field(target.tag, target.value);
  const hasAmount = Number(amount) > 0;
  let p = field('00', '01') + field('01', hasAmount ? '12' : '11') + field('29', merchant) +
    field('58', 'TH') + field('53', '764');
  if (hasAmount) p += field('54', Number(amount).toFixed(2));
  p += '6304';
  return p + crc16(p);
}
