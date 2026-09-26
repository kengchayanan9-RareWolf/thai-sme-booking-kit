// Amount in Thai words for quotations, e.g. 19000 -> "หนึ่งหมื่นเก้าพันบาทถ้วน".

const DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

// Reads up to 6 digits. `hasHigher` = a larger group precedes this one (for เอ็ด in 1,000,001).
function readGroup(num, hasHigher) {
  const s = String(num);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i]);
    const place = s.length - i - 1;
    if (d === 0) continue;
    if (place === 1 && d === 1) out += 'สิบ';
    else if (place === 1 && d === 2) out += 'ยี่สิบ';
    else if (place === 0 && d === 1 && (s.length > 1 || hasHigher)) out += 'เอ็ด';
    else out += DIGITS[d] + PLACES[place];
  }
  return out;
}

function readInteger(n) {
  if (n === 0) return DIGITS[0];
  const groups = [];
  while (n > 0) { groups.unshift(n % 1000000); n = Math.floor(n / 1000000); }
  return groups.map((g, i) => (g ? readGroup(g, i > 0) : '') + (i < groups.length - 1 ? 'ล้าน' : '')).join('');
}

export function bahtText(amount) {
  const satangTotal = Math.round(Number(amount) * 100);
  if (!Number.isFinite(satangTotal) || satangTotal < 0) throw new Error('Invalid amount: ' + amount);
  const baht = Math.floor(satangTotal / 100);
  const satang = satangTotal % 100;
  if (baht === 0 && satang > 0) return readInteger(satang) + 'สตางค์';
  return readInteger(baht) + 'บาท' + (satang ? readInteger(satang) + 'สตางค์' : 'ถ้วน');
}
