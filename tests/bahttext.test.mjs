import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bahtText } from '../skills/thai-sme-booking/scripts/bahttext.mjs';

test('bahtText reads Thai amounts correctly', () => {
  const cases = {
    0: 'ศูนย์บาทถ้วน',
    1: 'หนึ่งบาทถ้วน',
    11: 'สิบเอ็ดบาทถ้วน',
    21: 'ยี่สิบเอ็ดบาทถ้วน',
    101: 'หนึ่งร้อยเอ็ดบาทถ้วน',
    250: 'สองร้อยห้าสิบบาทถ้วน',
    9500.5: 'เก้าพันห้าร้อยบาทห้าสิบสตางค์',
    19000: 'หนึ่งหมื่นเก้าพันบาทถ้วน',
    0.25: 'ยี่สิบห้าสตางค์',
    1000000: 'หนึ่งล้านบาทถ้วน',
    1000001: 'หนึ่งล้านเอ็ดบาทถ้วน',
    2310000: 'สองล้านสามแสนหนึ่งหมื่นบาทถ้วน'
  };
  for (const [n, words] of Object.entries(cases)) assert.equal(bahtText(Number(n)), words, `amount ${n}`);
});
