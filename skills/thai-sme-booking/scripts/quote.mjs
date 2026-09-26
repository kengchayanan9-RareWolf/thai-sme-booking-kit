#!/usr/bin/env node
// Thai quotation (ใบเสนอราคา) from client.yaml + pricing.yaml.
// Usage: node scripts/quote.mjs <client.yaml> <pricing.yaml> [--out <dir>] [--date YYYY-MM-DD]
// Writes quote-<number>.md and .html (open the HTML → Print → Save as PDF).

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { bahtText } from './bahttext.mjs';

const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

const money = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bkk = (d) => new Date(d.getTime() + 7 * 3600 * 1000);
export const thaiDate = (d) => { const b = bkk(d); return `${b.getUTCDate()} ${TH_MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear() + 543}`; };

export function buildQuote(client, pricing, { date = new Date() } = {}) {
  const p = client.project || {};
  const pkg = (pricing.packages || {})[p.package];
  if (!pkg) throw new Error(`project.package "${p.package}" not found in pricing.yaml packages`);

  const items = [{ label: pkg.name_th, detail: pkg.includes || [], amount: Number(pkg.price) }];
  (p.addons || []).forEach((key) => {
    const a = (pricing.addons || {})[key];
    if (!a) throw new Error(`addon "${key}" not found in pricing.yaml addons`);
    if (a.available === false) throw new Error(`addon "${key}" is not available yet (available: false)`);
    items.push({ label: a.name_th, detail: a.detail ? [a.detail] : [], amount: Number(a.price) });
  });

  const promoKey = p.promo && p.promo !== 'none' ? p.promo : null;
  const promo = promoKey ? (pricing.promos || {})[promoKey] : null;
  if (promoKey && !promo) throw new Error(`promo "${promoKey}" not found in pricing.yaml promos`);
  if (promo && promo.ends && Date.parse(promo.ends + 'T23:59:59+07:00') < date.getTime()) {
    throw new Error(`promo "${promoKey}" ended on ${promo.ends}`);
  }

  const q = pricing.quote || {};
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const discount = promo ? Math.round((Number(pkg.price) * Number(promo.discount_pct)) / 100) : 0;
  const total = subtotal - discount;
  const depositPct = Number(q.deposit_pct ?? 50);
  const deposit = Math.round((total * depositPct) / 100);
  const carePlan = p.care_plan && p.care_plan !== 'none' ? (pricing.care_plans || {})[p.care_plan] : null;
  const b = bkk(date);
  const stamp = `${b.getUTCFullYear()}${String(b.getUTCMonth() + 1).padStart(2, '0')}${String(b.getUTCDate()).padStart(2, '0')}`;

  return {
    number: `QT-${stamp}-${client.slug}`,
    issued: thaiDate(date),
    validUntil: thaiDate(new Date(date.getTime() + Number(q.valid_days ?? 15) * 86400000)),
    freelancer: pricing.freelancer || {},
    client: { shop: client.shop.name, name: p.client_name || '', contact: p.client_contact || client.shop.phone || '' },
    items,
    subtotal,
    promo: promo ? { label: promo.label_th, conditions: promo.conditions_th || [], discount } : null,
    total,
    totalText: bahtText(total),
    schedule: total > 0
      ? [{ label: `งวดที่ 1 (${depositPct}%) — ก่อนเริ่มงาน`, amount: deposit }, { label: `งวดที่ 2 (${100 - depositPct}%) — เมื่อระบบใช้งานได้จริง`, amount: total - deposit }]
      : [],
    care: carePlan ? { label: carePlan.name_th, price: Number(carePlan.price), includes: carePlan.includes || [] } : null,
    extraTask: pricing.extra_task_th || '',
    timelineDays: pkg.timeline_days,
    revisions: q.revisions ?? 2,
    warrantyDays: q.warranty_days ?? 30,
    vatRegistered: q.vat_registered === true,
    vendorCosts: (pricing.vendor_costs || {}).items || [],
    exclusions: pricing.exclusions_th || [],
    notes: pricing.notes_th || [],
    projectNotes: p.notes || ''
  };
}

function termsList(q) {
  return [
    q.timelineDays ? `ระยะเวลาดำเนินการประมาณ ${q.timelineDays} วันทำการ หลังได้รับข้อมูลร้านและชำระงวดที่ 1` : null,
    `แก้ไขงานได้ ${q.revisions} รอบ ภายในขอบเขตงานข้างต้น`,
    `รับประกันการทำงานของระบบ ${q.warrantyDays} วันหลังส่งมอบ`,
    q.care ? `แผนดูแลรายเดือนเริ่มหลังครบระยะรับประกัน` : null,
    q.vatRegistered ? 'ราคายังไม่รวมภาษีมูลค่าเพิ่ม 7%' : 'ผู้ให้บริการไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม ราคานี้จึงไม่มี VAT',
    ...q.notes
  ].filter(Boolean);
}

export function renderMarkdown(q) {
  const f = q.freelancer;
  const lines = [
    `# ใบเสนอราคา`,
    '',
    `**เลขที่** ${q.number} · **วันที่** ${q.issued} · **ยืนราคาถึง** ${q.validUntil}`,
    '',
    `**ผู้เสนอราคา:** ${[f.business_name, f.name].filter(Boolean).join(' / ')} · ${f.phone || ''} · ${f.email || ''}${f.line ? ' · LINE ' + f.line : ''}`,
    `**เรียน:** ${q.client.name ? q.client.name + ' — ' : ''}${q.client.shop}${q.client.contact ? ' (' + q.client.contact + ')' : ''}`,
    '',
    '| # | รายการ | จำนวนเงิน (บาท) |',
    '|---|---|---:|'
  ];
  q.items.forEach((it, i) => {
    const detail = it.detail.length ? '<br>' + it.detail.map((d) => '• ' + d).join('<br>') : '';
    lines.push(`| ${i + 1} | **${it.label}**${detail} | ${money(it.amount)} |`);
  });
  if (q.promo) lines.push(`| | ส่วนลด: ${q.promo.label} | -${money(q.promo.discount)} |`);
  lines.push(`| | **รวมทั้งสิ้น** | **${money(q.total)}** |`, '', `(${q.totalText})`, '');
  if (q.promo && q.promo.conditions.length) lines.push('**เงื่อนไขราคาเปิดตัว**', ...q.promo.conditions.map((c) => `- ${c}`), '');
  if (q.schedule.length) lines.push('**การชำระเงิน**', ...q.schedule.map((s) => `- ${s.label}: ${money(s.amount)} บาท`), f.payment ? `- ช่องทาง: ${f.payment}` : '', '');
  if (q.care) lines.push(`**แผนดูแลรายเดือน (ไม่รวมในยอดข้างต้น):** ${q.care.label} — ${money(q.care.price)} บาท/เดือน`, ...q.care.includes.map((c) => `- ${c}`), q.extraTask ? `- ${q.extraTask}` : '', '');
  if (q.vendorCosts.length) {
    lines.push('**ค่าบริการภายนอกที่ร้านชำระเอง (ในชื่อร้าน)**', '', '| รายการ | ค่าใช้จ่ายโดยประมาณ |', '|---|---|');
    q.vendorCosts.forEach((v) => lines.push(`| ${v.item_th} | ${v.cost_th} |`));
    lines.push('');
  }
  if (q.exclusions.length) lines.push('**ไม่รวมในขอบเขตงาน**', ...q.exclusions.map((e) => `- ${e}`), '');
  lines.push('**เงื่อนไข**', ...termsList(q).map((t) => `- ${t}`), '');
  if (q.projectNotes) lines.push(`**หมายเหตุ:** ${q.projectNotes}`, '');
  lines.push('', '______________________ ผู้เสนอราคา          ______________________ ผู้อนุมัติ (ร้าน)', '');
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderHtml(q) {
  const f = q.freelancer;
  const ul = (arr) => (arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  const rows = q.items.map((it, i) => `<tr><td>${i + 1}</td><td><strong>${esc(it.label)}</strong>${ul(it.detail)}</td><td class="num">${money(it.amount)}</td></tr>`).join('');
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ใบเสนอราคา ${esc(q.number)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: 'Sarabun', sans-serif; color: #222; font-size: 14px; line-height: 1.55; max-width: 800px; margin: 24px auto; padding: 0 16px; background: #fff; }
  h1 { font-size: 26px; margin: 0; } header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #222; padding-bottom: 12px; }
  .meta { text-align: right; } .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
  .box { border: 1px solid #ddd; border-radius: 8px; padding: 10px 12px; } .label { color: #666; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; } th, td { border-bottom: 1px solid #e5e5e5; padding: 8px; vertical-align: top; text-align: left; }
  th { background: #f6f6f6; } .num { text-align: right; white-space: nowrap; } td ul { margin: 4px 0 0; padding-left: 18px; color: #555; }
  .total td { font-weight: 700; font-size: 16px; border-top: 2px solid #222; } .words { text-align: right; color: #444; }
  h2 { font-size: 15px; margin: 18px 0 6px; } .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 48px; text-align: center; }
  .sign div { border-top: 1px solid #222; padding-top: 6px; } @media print { body { margin: 0; } }
</style></head><body>
<header><div><h1>ใบเสนอราคา</h1><div>${esc([f.business_name, f.name].filter(Boolean).join(' / '))}</div>
<div class="label">${esc([f.phone, f.email, f.line ? 'LINE ' + f.line : '', f.tax_id ? 'เลขผู้เสียภาษี ' + f.tax_id : ''].filter(Boolean).join(' · '))}</div></div>
<div class="meta"><div><span class="label">เลขที่</span> ${esc(q.number)}</div><div><span class="label">วันที่</span> ${esc(q.issued)}</div><div><span class="label">ยืนราคาถึง</span> ${esc(q.validUntil)}</div></div></header>
<div class="parties"><div class="box"><div class="label">เรียน</div>${esc(q.client.name)}<br><strong>${esc(q.client.shop)}</strong><br>${esc(q.client.contact)}</div>
<div class="box"><div class="label">โครงการ</div>ระบบจองคิวผ่าน LINE พร้อมมัดจำพร้อมเพย์และตรวจสลิปอัตโนมัติ</div></div>
<table><thead><tr><th>#</th><th>รายการ</th><th class="num">จำนวนเงิน (บาท)</th></tr></thead><tbody>${rows}
${q.promo ? `<tr><td></td><td>ส่วนลด: ${esc(q.promo.label)}</td><td class="num">-${money(q.promo.discount)}</td></tr>` : ''}
<tr class="total"><td></td><td>รวมทั้งสิ้น</td><td class="num">${money(q.total)}</td></tr></tbody></table>
<div class="words">(${esc(q.totalText)})</div>
${q.promo && q.promo.conditions.length ? `<h2>เงื่อนไขราคาเปิดตัว</h2>${ul(q.promo.conditions)}` : ''}
${q.schedule.length ? `<h2>การชำระเงิน</h2>${ul(q.schedule.map((s) => `${s.label}: ${money(s.amount)} บาท`).concat(f.payment ? ['ช่องทาง: ' + f.payment] : []))}` : ''}
${q.care ? `<h2>แผนดูแลรายเดือน (ไม่รวมในยอดข้างต้น)</h2><p><strong>${esc(q.care.label)}</strong> — ${money(q.care.price)} บาท/เดือน</p>${ul(q.care.includes.concat(q.extraTask ? [q.extraTask] : []))}` : ''}
${q.vendorCosts.length ? `<h2>ค่าบริการภายนอกที่ร้านชำระเอง (ในชื่อร้าน)</h2><table><tbody>${q.vendorCosts.map((v) => `<tr><td>${esc(v.item_th)}</td><td>${esc(v.cost_th)}</td></tr>`).join('')}</tbody></table>` : ''}
${q.exclusions.length ? `<h2>ไม่รวมในขอบเขตงาน</h2>${ul(q.exclusions)}` : ''}
<h2>เงื่อนไข</h2>${ul(termsList(q))}
${q.projectNotes ? `<p><strong>หมายเหตุ:</strong> ${esc(q.projectNotes)}</p>` : ''}
<div class="sign"><div>ผู้เสนอราคา</div><div>ผู้อนุมัติ (ร้าน)</div></div>
</body></html>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const [clientFile, pricingFile] = args.filter((a, i) => !a.startsWith('--') && !['--out', '--date'].includes(args[i - 1]));
  if (!clientFile || !pricingFile) {
    console.error('Usage: node scripts/quote.mjs <client.yaml> <pricing.yaml> [--out <dir>] [--date YYYY-MM-DD]');
    process.exit(1);
  }
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  try {
    const client = YAML.parse(fs.readFileSync(clientFile, 'utf8'));
    const pricing = YAML.parse(fs.readFileSync(pricingFile, 'utf8'));
    const date = opt('--date') ? new Date(opt('--date') + 'T09:00:00+07:00') : new Date();
    const q = buildQuote(client, pricing, { date });
    const out = path.resolve(opt('--out') || path.dirname(clientFile));
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, `quote-${q.number}.md`), renderMarkdown(q));
    fs.writeFileSync(path.join(out, `quote-${q.number}.html`), renderHtml(q));
    console.log(`✓ ${q.number}: ${money(q.total)} บาท (${q.totalText})`);
    console.log(`  ${path.join(out, `quote-${q.number}.html`)}  → open in a browser → Print → Save as PDF`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
