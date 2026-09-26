import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import YAML from 'yaml';
import { buildQuote, renderMarkdown, renderHtml, thaiDate } from '../skills/thai-sme-booking/scripts/quote.mjs';

const T = 'skills/thai-sme-booking/templates';
const client = () => YAML.parse(fs.readFileSync(`${T}/client.example.yaml`, 'utf8'));
const pricing = YAML.parse(fs.readFileSync(`${T}/pricing.example.yaml`, 'utf8'));
const date = new Date('2026-09-27T09:00:00+07:00');

test('thaiDate uses Buddhist Era and Thai month names', () => {
  assert.equal(thaiDate(date), '27 กันยายน 2569');
});

test('complete package without promo: total, 50/50 schedule, Thai words', () => {
  const q = buildQuote(client(), pricing, { date });
  assert.equal(q.number, 'QT-20260927-baan-suay-salon');
  assert.equal(q.total, 20000);
  assert.equal(q.totalText, 'สองหมื่นบาทถ้วน');
  assert.deepEqual(q.schedule.map((s) => s.amount), [10000, 10000]);
  assert.equal(q.care.price, 1200);
  assert.equal(q.validUntil, '12 ตุลาคม 2569');
});

test('launch promo discounts the package only, add-ons stay full price', () => {
  const c = client();
  c.project.promo = 'launch_half';
  c.project.addons = ['multi_staff'];
  const q = buildQuote(c, pricing, { date });
  assert.equal(q.subtotal, 24000);
  assert.equal(q.promo.discount, 10000);
  assert.equal(q.total, 14000);
  const free = buildQuote({ ...c, project: { ...c.project, promo: 'launch_free', addons: [] } }, pricing, { date });
  assert.equal(free.total, 0);
  assert.deepEqual(free.schedule, []);
});

test('guards: unknown package, unavailable add-on, expired promo', () => {
  const c = client();
  assert.throws(() => buildQuote({ ...c, project: { package: 'gold' } }, pricing, { date }), /package/);
  assert.throws(() => buildQuote({ ...c, project: { package: 'starter', addons: ['ai_agent'] } }, pricing, { date }), /not available/);
  assert.throws(() => buildQuote({ ...c, project: { package: 'starter', promo: 'launch_free' } }, pricing, { date: new Date('2027-02-01') }), /ended/);
});

test('renderers include the key sections and escape HTML', () => {
  const c = client();
  c.project.notes = '<script>alert(1)</script>';
  const q = buildQuote(c, pricing, { date });
  const md = renderMarkdown(q);
  const html = renderHtml(q);
  for (const s of ['ใบเสนอราคา', 'รวมทั้งสิ้น', 'สองหมื่นบาทถ้วน', 'ค่าบริการภายนอกที่ร้านชำระเอง', 'ไม่มี VAT']) {
    assert.ok(md.includes(s), `md: ${s}`);
    assert.ok(html.includes(s), `html: ${s}`);
  }
  assert.ok(!html.includes('<script>alert'));
});
