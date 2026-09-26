---
name: thai-sme-booking
description: Build, quote, deploy and maintain LINE-first booking systems for Thai appointment businesses (salons, spas, massage, clinics, tutors, studios) — client intake, Thai quotation (ใบเสนอราคา), LINE OA + LIFF booking, PromptPay deposit QR with automatic bank-slip verification, FAQ chatbot, Google Sheets/Calendar backend, multi-page website edited from the Sheet, owner handoff, and monthly care-plan operations. Use when the user mentions Thai SME clients, LINE OA, จองคิว, มัดจำ, PromptPay/พร้อมเพย์, สลิป/slip checking, ใบเสนอราคา, a shop without a website, or wants to quote, build, deploy, report on, or fix a shop built with this kit.
---

# Thai SME Booking Kit

A done-for-you system for Thai appointment businesses that live in LINE chat. The shop gets:

| Pain (what owners say) | What the kit ships |
|---|---|
| "ตอบแชทถามราคาทั้งวัน" | Rule-based FAQ bot + rich menu, answers from the Sheet; unmatched chats stay with the owner |
| "จองคิวผ่านแชท จดผิด ซ้อนคิว" | LIFF booking page inside LINE: service → date → time, no double booking |
| "ลูกค้าจองแล้วไม่มา" | Exact-amount PromptPay deposit QR + day-before LINE reminder |
| "เช็กสลิปทีละใบ เจอสลิปปลอม" | Slip image → bank verification API → auto-confirm; duplicates, wrong receiver, wrong amount go to review |
| "ไม่มีเว็บไซต์" | 5-page static site + privacy page + Google Business Profile, content edited in the same Sheet |
| "ดูยอดไม่เป็น" | Status-colored Bookings sheet, Google Calendar sync, monthly report |

Hosting is ฿0 (Google Apps Script, Cloudflare Workers/Pages free tiers). The shop pays only LINE OA (free tier usually enough), the slip API (about ฿99–350/month), and optionally a domain.

## Architecture

```
Customer ─ LINE chat / rich menu ─► LINE Messaging API ─► Cloudflare Worker /webhook ─► Apps Script
        └─ LIFF /liff/book (Astro on Cloudflare Pages) ─► Worker /api/* (verifies LIFF ID token) ─┘
Apps Script ─► Google Sheet (Settings, Services, Hours, Holidays, Bookings, FAQ, Site, Staff, Reviews, Gallery, Log)
            ─► Google Calendar · Slip API (EasySlip adapter) · LINE reply/push · Pages deploy hook
```

The Worker exists because Apps Script cannot read request headers (no LINE signature check) and answers with a 302 redirect. It verifies `X-Line-Signature` and LIFF ID tokens, then forwards to Apps Script with `SHARED_SECRET`. The customer's LINE userId always comes from the verified token, never from the request body.

## Ground rules — apply in every mode

1. **Customer-facing text is Thai-first**, polite shop tone (ค่ะ/ครับ per the shop). Code, config keys and these instructions stay English.
2. **Secrets never go in files or git**: LINE token and secret, `SHARED_SECRET`, slip API key and the deploy hook live only in Apps Script Script Properties and `wrangler secret`. `build-config.mjs` prints a suggested `SHARED_SECRET` once. Never write it to disk.
3. **Every account is created in the shop's name** (LINE OA, Google, EasySlip, Cloudflare/GitHub for the site, domain), with the freelancer as admin. The shop pays vendors directly.
4. **Quota-aware messaging**: replies are free and unlimited, pushes count against the LINE OA quota. Confirmations after a slip use reply, and only reminders, owner alerts and owner-approved confirmations push. Do not add new push messages without flagging the quota cost.
5. **`demo_mode` / `SLIP_PROVIDER=mock` never go live in a real shop.** The mock provider accepts any image as a valid slip.
6. **Edit `client.yaml`, not generated files.** Re-run `build-config.mjs` rather than hand-editing `build/`. Content changes after go-live happen in the Sheet.
7. **Vendor prices go stale.** `pricing.yaml → vendor_costs.verified` records when they were checked. If that date is more than 3 months old, re-check LINE OA and slip-API pricing before quoting, and say so.
8. **PDPA**: the booking form requires consent, `/privacy` must be reviewed with the owner before launch, and `purgeOldData` anonymizes old bookings. See `references/pdpa.md`.
9. **Legal and tax text is a template, not advice.** Suggest the owner confirm with an accountant or lawyer when it matters.

## Setup (once per machine)

- Node 20+. Run `npm install` in this skill's directory (dependency: `yaml`).
- CLIs via `npx`: `@google/clasp` (Apps Script) and `wrangler` (Cloudflare). No global installs needed.
- Keep your real rate card private: copy `templates/pricing.example.yaml` to a private location (e.g. `thai-sme-booking-kit-pro/pricing.yaml`) and set your prices.
- Keep client folders private too: `clients/<slug>/client.yaml` (+ generated `build/`), never in the public repo.

## Decide the mode

- **Builder mode**: a new shop, or "quote / build / deploy / set up for a client".
- **Operator mode**: an existing shop, e.g. "report", "change price", "add service", "slip problem", "bot not replying", "quota", "monthly care".

If unclear, ask one question: is this a new client or an existing one?

## Builder mode

### 1. Intake → `client.yaml`
Read `references/intake.md`. Send the owner `templates/intake.th.md` (fits in a LINE message, or use it on a call). Fill `clients/<slug>/client.yaml` starting from `templates/client.example.yaml`. Push back on answers that will hurt the shop, for example a deposit on a ฿150 service, `min_lead_hours: 0`, or no receiver name for slip checks.

Validate early with `node scripts/build-config.mjs clients/<slug>/client.yaml`. It refuses bad slugs, invalid PromptPay IDs, duplicate service ids and malformed hours.

### 2. Quote → ใบเสนอราคา
Read `references/quote.md`. Set `project.package`, `addons`, `promo` and `care_plan` in client.yaml, then:

```
node scripts/quote.mjs clients/<slug>/client.yaml <path>/pricing.yaml [--date YYYY-MM-DD]
```

This writes `quote-QT-….md` and `.html`. The HTML prints to an A4 PDF with the amount in Thai words, a 50/50 payment schedule, the care plan, vendor costs the shop pays, exclusions and terms. Summarize the total and the recurring costs for the freelancer in chat, and point out anything unusual (an expired promo, missing add-on prices).

### 3. Build
```
node scripts/build-config.mjs clients/<slug>/client.yaml
```
This produces `clients/<slug>/build/{apps-script, worker, site, NEXT-STEPS.md}`. `Seed.js` holds every Sheet tab's starting content; `site/src/data/site.json` lets the site build before the backend exists.

### 4. Deploy
Follow `references/deploy-checklist.md` in order, and track progress in chat. The order is Google (clasp push → Script Properties → `setup` → web app deploy) → Worker → LINE (Messaging API + LINE Login/LIFF, **published**) → Pages (Git + deploy hook) → put the URLs back into client.yaml → rebuild → redeploy. Details are in `references/line-setup.md`, `apps-script.md`, `liff-booking.md`, `payments-slip.md` and `website.md`.

Steps that need the human (browser logins, OAuth consent, LINE console, bank app scans) are handed over with exact click paths. Use `! <command>` for interactive CLI logins.

### 5. Go-live test and handoff
Run the go-live test script (checklist §7): a ฿1 real deposit, a duplicate slip, a wrong-receiver slip, FAQ, a reminder trigger, a Sheet status change, and a website publish. Then:
- Personalize `templates/owner-guide.th.md` for the shop (export to PDF) and walk the owner through it.
- Owner sends `/owner <code>` in LINE (the code is shown by the setup menu) to receive alerts.
- Set up Google Business Profile with the owner (`references/google-business-profile.md`).
- Confirm the care plan start date (after the warranty).

## Operator mode

Day to day, the owner only touches LINE OA Manager chat and the Sheet. Under a Care/Care+ plan the freelancer runs these. Details are in `references/operator-mode.md`.

| Request | Do |
|---|---|
| Monthly report (Care+) | Sheet menu 🗓️ ระบบจอง → 📊 สรุปยอดเดือนนี้ (writes a `Report` tab: bookings, revenue, deposits, no-show rate, top services, busiest day). Read it (Drive connector or CSV export) and write a short Thai summary with one or two recommendations. |
| Price/service/text change | Edit the Services/Site/FAQ/Staff/Reviews tab → menu 🌐 อัปเดตเว็บไซต์. The booking page reads Services live; only the website needs the rebuild. |
| Slip marked NEEDS_REVIEW | Explain the reason from the `note` column (`REASON_TH` in `Slip.js`). The owner checks their bank app, then sets status to CONFIRMED (customer gets a pushed confirmation + calendar event) or CANCELLED. |
| Bot silent / errors | `references/troubleshooting.md`: check the `Log` tab first, then Worker logs (`npx wrangler tail`), then LINE webhook settings. |
| Quota worry | Menu 📨 เช็กโควต้าข้อความ LINE. Reminders email the owner instead of pushing when the quota would be exceeded. |
| Code update | Edit template → rebuild → `clasp push` → **Deploy → Manage deployments → new version** (the URL stays the same). |

## Extending

- **Slip provider**: add a function to `SLIP_PROVIDERS` in `templates/apps-script/Slip.js` that returns the normalized shape (see `Lib.normalizeEasySlip`), then set Script Property `SLIP_PROVIDER`. Add a normalizer + tests in `Lib.js`.
- **24/7 AI replies**: replace `handleUnmatched(ev)` in `Faq.js` (return `true` if you replied). Use the reply API, answer only from Sheet data, and hand off to a human for anything about money or complaints.
- **Paid add-ons** (multi-staff calendars, customer reschedule) are not in the public kit. Scope them per client; `capacity` already covers "N chairs, no staff choice".

## Development

From the repo root: `npm test` runs the Node test suite (pure logic, PromptPay reference vectors, Worker security, a full Apps Script flow in a vm harness, build and quote generation). Run `npm run regen` after changing `client.example.yaml` or the seed/site shape. For a UI preview of the booking page, run `npm run build && npx astro preview` in `templates/site`, then open `http://localhost:4321/liff/book?preview`.

## Files

```
scripts/build-config.mjs   client.yaml → build/ (Seed.js, wrangler.toml, site .env + site.json)
scripts/quote.mjs          client.yaml + pricing.yaml → Thai quotation (.md + printable .html)
scripts/bahttext.mjs       amounts in Thai words
templates/apps-script/     Code (router) · Booking · Slots · Slip · Faq · Line · Messages · Calendar · Reminders · Site · Setup · Sheet · Lib (pure) · Seed
templates/worker/          Cloudflare Worker proxy (signature + LIFF token checks)
templates/site/            Astro site: / services team reviews contact privacy + /liff/book
templates/client.example.yaml · pricing.example.yaml · intake.th.md · owner-guide.th.md · sheet/README.md
references/                intake · quote · deploy-checklist · line-setup · apps-script · liff-booking · payments-slip · website · google-business-profile · operator-mode · pdpa · troubleshooting
```
