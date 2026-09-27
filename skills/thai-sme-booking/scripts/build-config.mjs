#!/usr/bin/env node
// Turns one client.yaml into a deployable build folder:
//   <client dir>/build/apps-script  (+ Seed.js generated from the yaml)
//   <client dir>/build/worker       (wrangler.toml filled in)
//   <client dir>/build/site         (.env filled in)
//   <client dir>/build/NEXT-STEPS.md
// Usage: node scripts/build-config.mjs clients/<slug>/client.yaml [--out <dir>]

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import YAML from 'yaml';
import { formatTarget } from '../templates/site/src/lib/promptpay.js';

const Lib = createRequire(import.meta.url)('../templates/apps-script/Lib.js');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.join(HERE, '..', 'templates');
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function loadClient(file) {
  return YAML.parse(fs.readFileSync(file, 'utf8'));
}

export function validateClient(c) {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };
  need(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.slug || ''), 'slug must be lowercase-kebab (e.g. baan-suay-salon)');
  need(c.shop && c.shop.name, 'shop.name is required');
  need(c.shop && c.shop.phone, 'shop.phone is required');
  const pay = c.payment || {};
  need(['percent', 'fixed', 'none'].includes(pay.deposit_type), 'payment.deposit_type must be percent | fixed | none');
  if (pay.deposit_type !== 'none') {
    try { formatTarget(pay.promptpay_id); } catch { errors.push('payment.promptpay_id is not a valid PromptPay ID'); }
    need(pay.receiver_names || pay.receiver_accounts || pay.promptpay_id, 'payment.receiver_names or receiver_accounts is required for slip checks');
  }
  const services = c.services || [];
  need(services.length > 0, 'at least one service is required');
  const ids = new Set();
  services.forEach((s, i) => {
    need(s.id && s.name, `services[${i}] needs id and name`);
    need(Number(s.duration_min) > 0 && Number(s.price) >= 0, `services[${i}] needs duration_min and price`);
    need(!ids.has(s.id), `duplicate service id "${s.id}"`);
    ids.add(s.id);
  });
  DAYS.forEach((d) => {
    const v = (c.hours || {})[d];
    need(v === 'closed' || /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(String(v || '')), `hours.${d} must be "HH:MM-HH:MM" or closed`);
  });
  return errors;
}

const str = (v) => (v === undefined || v === null ? '' : String(v));

/** Rows for every Sheet tab, in the column order of TABS in templates/apps-script/Sheet.js. */
export function buildSeed(c) {
  const shop = c.shop || {}, owner = c.owner || {}, b = c.booking || {}, pay = c.payment || {};
  const deploy = c.deploy || {}, pdpa = c.pdpa || {};
  const settings = [
    ['shop_name', shop.name, 'ชื่อร้าน (แสดงบนเว็บ แชท และใบยืนยัน)'],
    ['shop_name_en', shop.name_en, ''],
    ['tagline', shop.tagline, 'คำโปรยสั้น ๆ'],
    ['business_type', shop.business_type || 'LocalBusiness', 'ประเภทธุรกิจสำหรับ Google'],
    ['phone', str(shop.phone), 'เบอร์โทรร้าน'],
    ['address', shop.address, 'ที่อยู่ร้าน'],
    ['map_url', shop.map_url, 'ลิงก์ Google Maps'],
    ['map_embed_url', shop.map_embed_url, 'ลิงก์แผนที่สำหรับฝังในเว็บ'],
    ['line_oa_id', shop.line_oa_id, 'LINE ID ของร้าน เช่น @shop'],
    ['liff_id', deploy.liff_id, 'ผู้ดูแลระบบตั้งค่า'],
    ['site_url', deploy.site_url, 'ที่อยู่เว็บไซต์'],
    ['facebook_url', shop.facebook_url, ''],
    ['instagram_url', shop.instagram_url, ''],
    ['tiktok_url', shop.tiktok_url, ''],
    ['google_review_url', shop.google_review_url, 'ลิงก์ขอรีวิว Google'],
    ['brand_color', shop.brand_color || '#9C6B78', 'สีหลักของร้าน'],
    ['price_range', shop.price_range, ''],
    ['promptpay_id', str(pay.promptpay_id), 'พร้อมเพย์ที่รับมัดจำ'],
    ['promptpay_name', pay.promptpay_name || shop.name, 'ชื่อที่แสดงใต้ QR'],
    ['receiver_names', pay.receiver_names, 'ชื่อบัญชีผู้รับตามสลิป คั่นด้วย ,'],
    ['receiver_accounts', str(pay.receiver_accounts), 'เลขบัญชี/พร้อมเพย์ผู้รับ คั่นด้วย ,'],
    ['deposit_type', pay.deposit_type || 'percent', 'percent | fixed | none'],
    ['deposit_value', pay.deposit_value ?? 30, 'เปอร์เซ็นต์ หรือจำนวนบาท'],
    ['hold_minutes', b.hold_minutes ?? 20, 'เวลาจองคิวรอชำระมัดจำ (นาที)'],
    ['slot_step_min', b.slot_step_min ?? 30, 'ระยะห่างเวลาเริ่มแต่ละคิว (นาที)'],
    ['buffer_min', b.buffer_min ?? 0, 'เวลาเตรียมระหว่างคิว (นาที)'],
    ['capacity', b.capacity ?? 1, 'รับลูกค้าพร้อมกันได้กี่คน'],
    ['days_ahead', b.days_ahead ?? 30, 'จองล่วงหน้าได้กี่วัน'],
    ['min_lead_hours', b.min_lead_hours ?? 2, 'ต้องจองล่วงหน้าอย่างน้อยกี่ชั่วโมง'],
    ['reminder_hour', b.reminder_hour ?? 18, 'เวลาส่งเตือนนัดวันพรุ่งนี้ (ชั่วโมง)'],
    ['slip_max_age_hours', pay.slip_max_age_hours ?? 24, 'รับสลิปย้อนหลังได้กี่ชั่วโมง'],
    ['booking_keywords', b.keywords || 'จอง,นัด,คิว,book', 'คำในแชทที่ตอบด้วยปุ่มจองคิว'],
    ['calendar_id', b.calendar_id, 'เว้นว่าง = ปฏิทินหลักของบัญชี'],
    ['calendar_blocks_slots', b.calendar_blocks_slots !== false, 'นัดอื่นในปฏิทินจะปิดคิวช่วงนั้น'],
    ['owner_email', owner.email, 'อีเมลรับแจ้งเตือน'],
    ['owner_alert_via', owner.alert_via || 'line', 'line | email | both'],
    ['owner_line_user_id', '', 'ตั้งอัตโนมัติเมื่อพิมพ์ /owner <รหัส> ใน LINE'],
    ['retention_months', pdpa.retention_months ?? 12, 'PDPA: ลบข้อมูลส่วนตัวลูกค้าหลังกี่เดือน'],
    ['privacy_contact', pdpa.privacy_contact || owner.email, 'PDPA: ช่องทางติดต่อเรื่องข้อมูลส่วนบุคคล'],
    ['demo_mode', deploy.demo_mode === true, 'โหมดทดลอง (ห้ามเปิดในร้านจริง)']
  ].map(([k, v, note]) => [k, v === undefined || v === null ? '' : v, note]);

  const hours = DAYS.map((d) => {
    const v = String((c.hours || {})[d] || 'closed');
    if (v === 'closed') return [d, '', '', true];
    const [open, close] = v.split('-');
    return [d, open, close, false];
  });

  const flag = (x) => (x.active === false ? false : true);
  return {
    Settings: settings,
    Services: (c.services || []).map((s) => [s.id, s.name, s.name_en || '', Number(s.duration_min), Number(s.price),
      s.deposit === undefined || s.deposit === null ? '' : Number(s.deposit), s.description || '', s.image_url || '', flag(s)]),
    Hours: hours,
    Holidays: (c.holidays || []).map((h) => [str(h.date), h.note || '']),
    FAQ: (c.faq || []).map((f) => [f.keywords, f.answer, flag(f)]),
    Site: Object.entries(c.site || {}).map(([k, v]) => [k, str(v)]),
    Staff: (c.staff || []).map((s) => [s.name, s.role || '', s.bio || '', s.image_url || '', flag(s)]),
    Reviews: (c.reviews || []).map((r) => [r.name, r.text, Number(r.stars) || 5, flag(r)]),
    Gallery: (c.gallery || []).map((g) => [g.image_url, g.caption || '', flag(g)]),
    Bookings: [],
    Log: []
  };
}

// Must mirror PUBLIC_SETTINGS in templates/apps-script/Site.js (a test compares both outputs).
const PUBLIC_SETTINGS = [
  'shop_name', 'shop_name_en', 'tagline', 'business_type', 'phone', 'address', 'map_url', 'map_embed_url',
  'line_oa_id', 'liff_id', 'site_url', 'facebook_url', 'instagram_url', 'tiktok_url', 'google_review_url',
  'brand_color', 'deposit_type', 'deposit_value', 'hold_minutes', 'price_range', 'demo_mode', 'privacy_contact',
  'retention_months'
];
const DAY_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** Same shape as siteData_() in Apps Script, so the site can build before the backend exists. */
export function siteFallback(c) {
  const seed = buildSeed(c);
  const cfg = Object.fromEntries(seed.Settings.filter(([, v]) => v !== '').map(([k, v]) => [k, v]));
  const settings = Object.fromEntries(PUBLIC_SETTINGS.filter((k) => k in cfg).map((k) => [k, cfg[k]]));
  const on = (row, i) => row[i] !== false;
  return {
    settings,
    site: Object.fromEntries(seed.Site),
    services: seed.Services.filter((r) => on(r, 8)).map((r) => ({
      id: r[0], name: r[1], nameEn: r[2], durationMin: r[3], price: r[4],
      depositAmount: Lib.computeDeposit(r[4], cfg, r[5]), description: r[6], imageUrl: r[7]
    })),
    hours: seed.Hours.map(([d, open, close, closed]) => ({ day: DAY_INDEX[d], open, close, closed: closed === true || !open })),
    staff: seed.Staff.filter((r) => on(r, 4)).map((r) => ({ name: r[0], role: r[1], bio: r[2], imageUrl: r[3] })),
    reviews: seed.Reviews.filter((r) => on(r, 3)).map((r) => ({ name: r[0], text: r[1], stars: r[2] })),
    gallery: seed.Gallery.filter((r) => on(r, 2)).map((r) => ({ imageUrl: r[0], caption: r[1] })),
    generatedAt: 'fallback'
  };
}

export function seedSource(seed) {
  return '/** Generated by scripts/build-config.mjs from client.yaml. setup() uses it once to fill empty tabs. */\n' +
    'var SEED = ' + JSON.stringify(seed, null, 2) + ';\n';
}

function copyDir(src, dst) {
  fs.cpSync(src, dst, {
    recursive: true,
    filter: (p) => !/[\\/](node_modules|dist|\.astro|\.wrangler)([\\/]|$)/.test(p) && !/[\\/]\.env$/.test(p)
  });
}

export function build(clientFile, outDir) {
  const c = loadClient(clientFile);
  const errors = validateClient(c);
  if (errors.length) throw new Error('client.yaml has problems:\n  - ' + errors.join('\n  - '));
  const out = outDir || path.join(path.dirname(clientFile), 'build');
  const deploy = c.deploy || {};
  fs.mkdirSync(out, { recursive: true });

  copyDir(path.join(TEMPLATES, 'apps-script'), path.join(out, 'apps-script'));
  fs.writeFileSync(path.join(out, 'apps-script', 'Seed.js'), seedSource(buildSeed(c)));

  copyDir(path.join(TEMPLATES, 'worker'), path.join(out, 'worker'));
  const siteUrl = (deploy.site_url || `https://${c.slug}.pages.dev`).replace(/\/$/, '');
  const toml = fs.readFileSync(path.join(TEMPLATES, 'worker', 'wrangler.toml'), 'utf8')
    .replace(/^name = ".*"$/m, `name = "${c.slug}-api"`)
    .replace(/^GAS_URL = ".*"$/m, `GAS_URL = "${deploy.gas_url || 'https://script.google.com/macros/s/REPLACE_ME/exec'}"`)
    .replace(/^LINE_LOGIN_CHANNEL_ID = ".*"$/m, `LINE_LOGIN_CHANNEL_ID = "${deploy.line_login_channel_id || 'REPLACE_ME'}"`)
    .replace(/^ALLOWED_ORIGINS = ".*"$/m, `ALLOWED_ORIGINS = "${new URL(siteUrl).origin}"`);
  fs.writeFileSync(path.join(out, 'worker', 'wrangler.toml'), toml);

  copyDir(path.join(TEMPLATES, 'site'), path.join(out, 'site'));
  fs.writeFileSync(path.join(out, 'site', 'src', 'data', 'site.json'), JSON.stringify(siteFallback(c), null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'site', '.env'), [
    `PUBLIC_API_BASE=${(deploy.worker_url || `https://${c.slug}-api.YOUR-SUBDOMAIN.workers.dev`).replace(/\/$/, '')}`,
    `PUBLIC_LIFF_ID=${deploy.liff_id || ''}`,
    `SITE_URL=${siteUrl}`,
    ''
  ].join('\n'));

  fs.writeFileSync(path.join(out, 'NEXT-STEPS.md'), nextSteps(c, siteUrl));
  return { out, client: c };
}

function nextSteps(c, siteUrl) {
  const p = c.payment || {};
  return `# Next steps — ${c.shop.name} (${c.slug})

Full walkthrough: skills/thai-sme-booking/references/deploy-checklist.md

1. **Apps Script + Sheet** (in \`apps-script/\`):
   - \`npx @google/clasp create-script --type sheets --title "${c.shop.name} ระบบจอง" --rootDir .\`
   - ⚠️ create-script overwrites appsscript.json (timezone → America/New_York): re-run this build-config, then \`npx @google/clasp push -f\`
   - Script Properties: SHARED_SECRET, SLIP_PROVIDER=${p.slip_provider || 'easyslip'}${p.slip_provider === 'mock' ? '' : ', SLIP_API_KEY'}, LINE_CHANNEL_ACCESS_TOKEN (after LINE), PAGES_DEPLOY_HOOK (after Pages)
   - In the Sheet: menu 🗓️ ระบบจอง → ⚙️ ติดตั้ง / ซ่อมระบบ (authorize), then \`npx @google/clasp create-deployment -d "v1"\` → web app URL = https://script.google.com/macros/s/<deploymentId>/exec
   - Later code updates: \`clasp push -f && clasp update-deployment <deploymentId>\` (URL stays the same)
2. **Worker**: \`cd worker && npm i && npx wrangler secret put LINE_CHANNEL_SECRET && npx wrangler secret put SHARED_SECRET && npx wrangler deploy\`
3. **LINE**: webhook URL = <worker-url>/webhook, LIFF endpoint = ${siteUrl}/liff/book/ (trailing slash)
4. **Site**: Cloudflare → Create application → "Continue to Pages" (not Workers) → build \`npm run build\`, output \`dist\`, root \`site\`, env from \`site/.env\`
5. Put gas_url / worker_url / liff_id / line_login_channel_id into client.yaml → re-run build-config → redeploy
6. Go-live test script: deploy-checklist.md §7
`;
}

// ---------- CLI ----------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const outIdx = args.indexOf('--out');
  if (!file) {
    console.error('Usage: node scripts/build-config.mjs <client.yaml> [--out <dir>]');
    process.exit(1);
  }
  try {
    const { out, client } = build(path.resolve(file), outIdx !== -1 ? path.resolve(args[outIdx + 1]) : undefined);
    console.log(`✓ Build for ${client.shop.name} written to ${out}`);
    console.log(`\nSuggested SHARED_SECRET (paste into Apps Script Script Properties AND wrangler secret; not saved anywhere):\n  ${crypto.randomBytes(24).toString('base64url')}\n`);
    console.log(`Next: ${path.join(out, 'NEXT-STEPS.md')}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
