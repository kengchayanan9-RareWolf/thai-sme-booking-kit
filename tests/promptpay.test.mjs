import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc16, formatTarget, promptPayPayload } from '../skills/thai-sme-booking/templates/site/src/lib/promptpay.js';

test('crc16 matches the CRC-16/CCITT-FALSE check value', () => {
  assert.equal(crc16('123456789'), '29B1');
});

test('formatTarget picks the right PromptPay sub-tag', () => {
  assert.deepEqual(formatTarget('081-234-5678'), { tag: '01', value: '0066812345678' });
  assert.deepEqual(formatTarget('+66-89-123-4567'), { tag: '01', value: '0066891234567' });
  assert.deepEqual(formatTarget('1-2345-67890-12-3'), { tag: '02', value: '1234567890123' });
  assert.deepEqual(formatTarget('123456789012345'), { tag: '03', value: '123456789012345' });
  assert.throws(() => formatTarget('12345'));
});

// Published test vectors from dtinth/promptpay-qr (index.test.js), matched byte-for-byte.
test('payloads match promptpay-qr reference vectors', () => {
  const vectors = [
    ['0801234567', undefined, '00020101021129370016A000000677010111011300668012345675802TH530376463046197'],
    ['080-123-4567', undefined, '00020101021129370016A000000677010111011300668012345675802TH530376463046197'],
    ['+66-89-123-4567', undefined, '00020101021129370016A000000677010111011300668912345675802TH5303764630429C1'],
    ['1111111111111', undefined, '00020101021129370016A000000677010111021311111111111115802TH530376463047B5A'],
    ['0123456789012', undefined, '00020101021129370016A000000677010111021301234567890125802TH530376463040CBD'],
    ['012345678901234', undefined, '00020101021129390016A00000067701011103150123456789012345802TH530376463049781'],
    ['000-000-0000', 4.22, '00020101021229370016A000000677010111011300660000000005802TH530376454044.226304E469']
  ];
  for (const [id, amount, expected] of vectors) assert.equal(promptPayPayload(id, amount), expected, `${id} ${amount ?? ''}`);
});

test('booking deposit payload is dynamic with a 2-decimal amount', () => {
  const p = promptPayPayload('0812345678', 135);
  assert.ok(p.startsWith('000201010212'));
  assert.ok(p.includes('5406135.00'));
  assert.equal(p.slice(-4), crc16(p.slice(0, -4)));
});
