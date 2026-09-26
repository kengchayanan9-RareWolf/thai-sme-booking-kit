# Pricing your service (for freelancers using this kit)

The code is free. What shops pay for is **getting it working in their shop**: accounts set up in their name, their menu and deposit rules, a tested payment flow, a website, training, and someone to call when LINE changes something.

## Package structure that works

| Tier | Contents | Why |
|---|---|---|
| **Starter** | LINE OA + rich menu, LIFF booking, PromptPay deposit + slip verification, FAQ bot, Calendar sync, reminders, Sheet dashboard, Thai owner guide, 30-day warranty | Solves the daily pain: chat, bookings, slips, no-shows |
| **Complete** | Starter + 5-page website (edited from the Sheet) + Google Business Profile + domain hookup | "No website" + Google Maps visibility |
| **Add-ons** | Multi-staff calendars, customer reschedule/cancel, extra pages, English site, (AI 24/7 replies) | Custom work, priced separately so the base stays fast |
| **Care / Care+** | Monthly monitoring and fixes / + monthly report and 3 content edits | Recurring income; the owner never has to learn the tech |

## Setting your numbers

1. **Delivery time with the kit**: roughly 1.5–2 days for Starter and 3–4 days for Complete, once you've done one.
2. **Target day rate** × days = floor price. Compare to the Thai market (check Fastwork): LINE OA setup ฿2–5k, SME website ฿8–30k, custom booking systems ฿20–80k. You sell a working payment + booking system, so price above "website only" gigs.
3. **Care plan**: ฿500–1,200/month is an easy yes for a shop doing ฿100k+/month. Ten care clients is a meaningful base income.
4. **Launch promo** for your first 2–3 clients: free or 50% setup in exchange for a case study, a review, and 3 months of care. Print "ราคาเปิดตัว" with an end date on the quote.
5. **Pass-through costs**: the shop pays LINE, the slip API and the domain directly, on its own accounts. Never bundle them into a cheap retainer, because a busy shop can eat your margin.

## In the kit

- `templates/pricing.example.yaml`: the structure with example prices. Copy it somewhere **private** and set your own numbers.
- `scripts/quote.mjs`: generates a Thai ใบเสนอราคา (Markdown + printable HTML/PDF) with Thai baht words, 50/50 payment schedule, care plan, vendor costs and terms.
- `references/quote.md`: terms worth keeping (revisions, warranty, VAT line, 3% withholding note).
