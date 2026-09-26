# Quoting (ใบเสนอราคา)

## Command
```
node scripts/quote.mjs clients/<slug>/client.yaml <private>/pricing.yaml [--date YYYY-MM-DD] [--out <dir>]
```
Outputs `quote-QT-<yyyymmdd>-<slug>.md` and `.html`. Open the HTML in a browser → Print → Save as PDF (A4, Sarabun font). Send the PDF via LINE.

## What goes on it (from pricing.yaml)
- Package line with its `includes` bullets, plus each add-on at full price.
- Promo discount (applies to the **package price only**). `promos.<key>.ends` is enforced, and an expired promo refuses to render.
- Total, amount in Thai words (`bahttext.mjs`), and a payment schedule from `quote.deposit_pct` (default 50/50: before start / at go-live). A ฿0 total (launch_free) shows no schedule.
- Care plan monthly price (not included in the total) and `extra_task_th`.
- **Vendor costs the shop pays directly**, with `vendor_costs.verified`. Re-check them if that date is older than 3 months.
- Exclusions, terms (timeline, revisions, warranty, VAT line from `quote.vat_registered`), and `notes_th` (e.g. 3% withholding note for juristic clients).

## Pricing guidance for the freelancer (Thai market, 2026)

Anchor on what the shop gets, a working booking and payment system, not "a website". Rough market references (verify on Fastwork before setting yours): LINE OA setup ฿2–5k, SME website ฿8–30k, custom booking systems ฿20–80k.

Suggested structure (set your own numbers in your private pricing.yaml):

| Item | Budget band | Notes |
|---|---|---|
| Starter (LINE booking + slip verify + FAQ + reminders + Sheet) | ฿9–12k | About 1.5–2 days with the kit |
| Complete (+ 5-page site + Google Business Profile + domain) | ฿19–25k | About 3–4 days |
| Multi-staff / reschedule add-ons | ฿2.5–5k each | Custom work, so scope carefully |
| Care / Care+ | ฿500–1,200/month | Care+ adds a monthly report + 3 edits |
| Extra tasks | ฿300–500 each | Publish this so small asks don't become free work |

**Launch promo playbook** (first 2–3 clients): free or 50% setup in exchange for a case study, logo/screenshot permission, a review after 30 days, and 3 months of care. Always print "ราคาเปิดตัว" with an end date so raising prices later is expected, not awkward.

**Unit economics check**: effective day rate = package price ÷ delivery days. Recurring = clients × average care price. Ten clients on care averaging ฿750 is ฿7,500/month.

## Terms worth keeping
- 50% before work, 50% at go-live. Work starts after the owner sends content (price list, photos, logo).
- Two revision rounds within scope. New pages or features are add-ons.
- 30-day warranty. Care plan starts after it.
- All accounts in the shop's name. The freelancer is an admin who can be removed at any time.
- Not VAT-registered → "ราคานี้ไม่มี VAT". Juristic clients may withhold 3% (ภ.ง.ด.3/53) and must give a withholding certificate.
