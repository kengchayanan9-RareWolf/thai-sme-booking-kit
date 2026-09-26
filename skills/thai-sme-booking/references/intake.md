# Intake → client.yaml

Goal: one conversation (or one LINE message + follow-ups) that yields a valid `client.yaml` and a confident quote.

## How to run it

1. Send `templates/intake.th.md` to the owner. Most owners answer in LINE with photos of their price board. That's fine: transcribe it.
2. Fill `clients/<slug>/client.yaml` from `templates/client.example.yaml`. Keep the comments; they help next time.
3. Run `node scripts/build-config.mjs clients/<slug>/client.yaml` just to validate (the output can be deleted).
4. Read back a short Thai summary to the owner (services and prices, hours, deposit rule, PromptPay account) and ask them to confirm before quoting.

## Field-by-field guidance

| Field | Ask / decide | Watch out for |
|---|---|---|
| `slug` | From the English shop name | lowercase-kebab; becomes `<slug>-api` Worker and `<slug>.pages.dev` |
| `shop.business_type` | Pick the closest schema.org type | HairSalon, BeautySalon, NailSalon, DaySpa, HealthAndBeautyBusiness, MedicalClinic, DentalClinic, Physiotherapy, EducationalOrganization |
| `shop.map_url` / `map_embed_url` | Google Maps → Share → link / "Embed a map" src | The embed URL must be the `src` of the iframe, not the whole tag |
| `services[].duration_min` | Real chair time incl. consultation | Underestimating causes overruns; use `booking.buffer_min` for cleanup |
| `services[].deposit` | Blank = shop rule, `0` = none, number = fixed | Cheap/quick services usually no deposit; long services (color, spa packages) fixed ฿300–500 |
| `payment.deposit_type/value` | Typical: percent 20–30 or fixed ฿100–300 | `none` disables slips entirely (bookings confirm instantly) |
| `payment.promptpay_id` | The account deposits go to | Prefer a shop/business account; a phone PromptPay must be registered to that account |
| `payment.receiver_names` | Exactly as banks print the receiver on a slip, TH and EN | Ask the owner for a recent slip they received, since banks truncate ("น.ส. สมหญิง ใ") |
| `payment.receiver_accounts` | Full bank account number(s) and/or PromptPay IDs | Blank → falls back to `promptpay_id` |
| `hours` | Per weekday `HH:MM-HH:MM` or `closed` | Last start time = close − service duration (automatic) |
| `booking.capacity` | Parallel customers when the customer does not pick staff | Two chairs, any stylist → `2`. Choosing a stylist = paid add-on |
| `booking.min_lead_hours` | How much notice the shop needs | `0` invites bookings the owner can't see in time |
| `booking.calendar_blocks_slots` | Owner blocks time by adding calendar events | Explain: an all-day event = day off |
| `owner.alert_via` | `line` (uses push quota), `email`, `both` | Busy shops on the free LINE plan → `email` or `both` |
| `faq` | Top 5–8 questions they answer daily | Use placeholders `{services} {hours} {address} {map_url} {phone} {booking_url}` so answers stay current |
| `site.*` | Hero title/subtitle, about, three highlights | Write them *with* the owner in their voice; avoid generic "คุณภาพ บริการดี" |
| `reviews` | Real reviews only, with permission | Never invent reviews for a real shop |
| `project.*` | Package, add-ons, promo, care plan | Promo = launch clients only; conditions go on the quote |

## Red flags worth raising before quoting

- The shop wants customers to pick a specific staff member → the `multi_staff` add-on, not base.
- Customers usually pay in cash at the shop and deposits are culturally hard → start with `deposit_type: none` + reminders, and add deposits later.
- More than about 250 bookings/month on the free LINE plan → reminders may exceed the push quota (budget a paid LINE plan or use email alerts).
- A medical/clinic context → extra care with PDPA (health data is sensitive). Collect only name, phone, and service; never symptoms.
