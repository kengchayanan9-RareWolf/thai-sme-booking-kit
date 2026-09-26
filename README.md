# Thai SME Booking Kit · ชุดระบบจองคิวผ่าน LINE สำหรับร้านไทย

**ระบบจองคิว + มัดจำพร้อมเพย์ + ตรวจสลิปอัตโนมัติ + แชทบอท + เว็บไซต์ร้าน** สำหรับร้านที่รับลูกค้าแบบนัดหมาย (ร้านทำผม สปา นวด เล็บ คลินิก ติวเตอร์) ค่าโฮสติ้ง **฿0** ใช้ LINE OA + Google Sheets + Cloudflare ทั้งหมดแพ็กเป็น **Claude Skill** ให้ฟรีแลนซ์ใช้ Claude ช่วยเก็บข้อมูลลูกค้า ออกใบเสนอราคา ติดตั้ง และดูแลรายเดือน

**A free, open-source Claude skill** for freelancers who build LINE-first booking systems for Thai appointment businesses: intake → Thai quotation → LINE OA + LIFF booking → PromptPay deposit QR with automatic bank-slip verification → FAQ bot → Google Sheets/Calendar backend → multi-page website edited from the Sheet → owner handoff → monthly care plan.

> 🎬 **Demo shop:** _add your live demo link + LINE QR here after deploying `demo/salon`_

---

## ร้านเจอปัญหาอะไร → ระบบช่วยอย่างไร

| ปัญหาของร้าน | สิ่งที่ได้ |
|---|---|
| ตอบแชทถามราคา/เวลาเปิดทั้งวัน | บอทตอบคำถามที่พบบ่อยจาก Google Sheets + ริชเมนู (ข้อความอื่นยังถึงร้านตามปกติ) |
| จองผ่านแชท จดผิด คิวซ้อน | หน้าจองคิวใน LINE เลือกบริการ วัน เวลา ไม่มีคิวชน |
| ลูกค้าจองแล้วไม่มา | มัดจำผ่าน QR พร้อมเพย์ยอดตรง + ข้อความเตือนนัดล่วงหน้า 1 วัน |
| เช็กสลิปทีละใบ เจอสลิปปลอม | ส่งสลิปในแชท → ตรวจกับธนาคาร → ยืนยันคิวอัตโนมัติ สลิปซ้ำ/ผู้รับผิด/ยอดไม่ครบ ส่งให้ร้านตรวจ |
| ไม่มีเว็บไซต์ | เว็บ 5 หน้า + นโยบายความเป็นส่วนตัว (PDPA) + Google Maps แก้เนื้อหาจากชีตเดียวกัน |
| ไม่รู้ยอดแต่ละเดือน | ชีตแยกสีตามสถานะ + Google Calendar + รายงานรายเดือน |

## How it works

```
Customer ─ LINE chat / rich menu ─► LINE Messaging API ─► Cloudflare Worker /webhook ─► Google Apps Script
        └─ LIFF booking page (Astro, Cloudflare Pages) ─► Worker /api/* (verifies LINE ID token) ─┘
Apps Script ─► Google Sheet (bookings, services, FAQ, website content) · Google Calendar
            ─► Slip-verification API (EasySlip adapter) · LINE reply/push · Pages rebuild hook
```

- **Security**: the Worker verifies LINE webhook signatures and LIFF ID tokens (Apps Script can't read headers), then forwards to Apps Script with a shared secret.
- **Quota-aware**: confirmations use free LINE replies; only reminders and owner alerts use push quota.
- **Slip checks**: amount ≥ deposit, receiver = the shop, transaction not reused, dated after the booking. Anything odd goes to the owner, never auto-rejected in front of the customer.
- **PDPA**: consent on booking, generated privacy page, automatic anonymization after N months.

## Install the skill

| Where | How |
|---|---|
| Claude Code (plugin) | `/plugin marketplace add kengchayanan9-RareWolf/thai-sme-booking-kit` then `/plugin install thai-sme-booking@thai-sme-booking-kit` |
| Claude Code (manual) | Copy `skills/thai-sme-booking` to `~/.claude/skills/` (personal) or `.claude/skills/` (project) |
| Claude.ai / Desktop | Zip `skills/thai-sme-booking` → Settings → Capabilities → Skills → Upload |

Then ask Claude things like: _"New client: a nail salon in Chiang Mai, here's their price list…"_, _"ออกใบเสนอราคาแพ็กเกจ complete ให้ร้านนี้"_, _"สรุปยอดเดือนนี้ให้ร้านบ้านสวย"_.

## Quick start (freelancer)

```bash
git clone https://github.com/kengchayanan9-RareWolf/thai-sme-booking-kit && cd thai-sme-booking-kit
npm install && npm test                      # 50 tests, including a full Apps Script flow in a vm harness

mkdir -p clients/my-shop && cp skills/thai-sme-booking/templates/client.example.yaml clients/my-shop/client.yaml
# edit client.yaml (or let Claude fill it from the intake)

npm run quote -- clients/my-shop/client.yaml skills/thai-sme-booking/templates/pricing.example.yaml
npm run new-client -- clients/my-shop/client.yaml   # → clients/my-shop/build/{apps-script,worker,site}
```
Then follow [`references/deploy-checklist.md`](skills/thai-sme-booking/references/deploy-checklist.md). `clients/` is git-ignored: keep client data in a private repo.

## What the shop pays (paid directly, accounts in the shop's name)

| Item | Cost (verify, prices change) |
|---|---|
| LINE Official Account | Free tier; paid plans (from ~฿1,500/month) only if push messages exceed the free quota |
| Slip verification (EasySlip or similar) | ~฿99–350/month depending on volume |
| Google Sheets / Calendar / Apps Script, Cloudflare Workers + Pages | Free |
| Domain (optional) | ~฿400–1,000/year |

How to price your service: [PRICING.md](PRICING.md).

## Repo layout

```
skills/thai-sme-booking/
  SKILL.md            the skill (builder + operator modes)
  references/         deploy checklist, LINE, Apps Script, LIFF, payments, website, GBP, PDPA, operator, troubleshooting
  scripts/            build-config.mjs (client.yaml → build) · quote.mjs (Thai quotation) · bahttext.mjs
  templates/          apps-script/ · worker/ · site/ (Astro) · client.example.yaml · pricing.example.yaml · Thai intake + owner guide
demo/salon/           fictional demo shop (demo_mode, mock slips)
tests/                node:test suite
```

## Development

- `npm test`: pure logic, PromptPay payloads matched byte-for-byte to `promptpay-qr` reference vectors, Worker signature/token checks, and an end-to-end Apps Script flow (setup → book → slip → review → owner approval → FAQ → reminders → report) with in-memory Google service fakes.
- `npm run regen` after editing `client.example.yaml`.
- Booking UI preview without LINE: `cd skills/thai-sme-booking/templates/site && npm i && npm run build && npx astro preview` → `http://localhost:4321/liff/book?preview`.

## Roadmap

- 24/7 AI chat replies (plugs into `handleUnmatched` in `Faq.js`)
- Multi-staff calendars, customer reschedule/cancel
- More site themes (spa, clinic, barber)

## จ้างติดตั้ง / Hire me

อยากได้ระบบนี้ให้ร้านของคุณแบบติดตั้งให้ครบ พร้อมดูแลรายเดือน → ติดต่อผ่าน GitHub: [@kengchayanan9-RareWolf](https://github.com/kengchayanan9-RareWolf) (เปิด Issue หรือส่งข้อความได้เลย)

## License & notes

MIT — see [LICENSE](LICENSE). Not affiliated with LINE, Google, Cloudflare or EasySlip. PDPA and tax text in this kit are templates, not legal advice.
