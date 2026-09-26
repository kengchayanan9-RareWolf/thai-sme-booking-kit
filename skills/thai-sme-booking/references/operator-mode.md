# Operator mode (care plans)

## Access you need
- Editor on the shop's Sheet (bound script inside). The Google Drive connector, if available, can read the Sheet directly. Otherwise use File → Download → CSV per tab.
- Cloudflare account membership (Worker logs: `npx wrangler tail <slug>-api`).
- LINE Developers console admin on the provider (webhook status and errors).
- The private client folder with `client.yaml` and `build/`.

## Care (monthly)
- [ ] `Log` tab: any `ERROR` rows since last check? (`WARN line /message/push 429` = out of push quota)
- [ ] Bookings: stuck `NEEDS_REVIEW` rows older than 24 h → nudge the owner
- [ ] Menu 📨 เช็กโควต้าข้อความ LINE: trending past about 80%? → suggest email alerts or a LINE plan
- [ ] Slip API balance/package (EasySlip dashboard): enough for next month?
- [ ] Website loads, booking page opens from the rich menu (spot test)
- [ ] Vendor changes (LINE, EasySlip, Cloudflare announcements) that need action

## Care+ (monthly report)
1. Sheet → 🗓️ ระบบจอง → 📊 สรุปยอดเดือนนี้ → `Report` tab (last month vs this month).
2. Write a short Thai message to the owner, for example:

```
สรุปเดือน ต.ค. 2569 — บ้านสวย ซาลอน
• จองทั้งหมด 86 คิว (เดือนก่อน 71, +21%)
• ยอดตามราคาบริการ ฿48,350 · มัดจำรับแล้ว ฿9,870
• ไม่มาตามนัด 3 คิว (4%) — ลดลงจาก 9% หลังเริ่มเก็บมัดจำ
• บริการยอดนิยม: ทำสีผม (22), ตัดผมผู้หญิง (19)
• วันลูกค้าเยอะสุด: ส.
ข้อแนะนำ: วันพุธคิวว่างเยอะ ลองโปรทรีตเมนต์วันพุธลด 15% ผ่าน LINE ดูไหมคะ
```
3. Apply up to three content edits requested this month (see below).

## Common edits
| Change | Where | Publish |
|---|---|---|
| Price, duration, deposit of a service | Services tab | Booking page: immediately. Website: 🌐 อัปเดตเว็บไซต์ |
| New service | Services tab new row (unique `id`, lowercase-kebab) | same |
| Pause a service | Services `active` = FALSE | same |
| Holiday / day off | Holidays tab (date) or an all-day event in the shop calendar | immediate |
| Opening hours | Hours tab | immediate + website publish |
| FAQ answer | FAQ tab | immediate |
| Hero text, about, staff, reviews, photos | Site / Staff / Reviews / Gallery tabs | website publish |
| Deposit rule | Settings `deposit_type` / `deposit_value` | immediate + website publish |
| Reminder time | Settings `reminder_hour` → menu ⚙️ ติดตั้ง / ซ่อมระบบ (re-creates triggers) | — |

## Code updates across clients
1. Update the public templates (tests green).
2. Per client: `node scripts/build-config.mjs clients/<slug>/client.yaml` → `cd build/apps-script && npx @google/clasp push -f` → **Deploy → Manage deployments → New version**.
3. Worker changes: `cd build/worker && npx wrangler deploy`. Site changes: commit to the site repo (Pages rebuilds).
4. Note the version/date in the client notes.

## Offboarding (client leaves)
Everything is already in the shop's name. Remove yourself as admin/editor, hand over this kit's README + the owner guide, and export a CSV backup of Bookings for them.
