# Sheet schema

The Sheet is created by `setup()` (Apps Script) from `TABS` in `templates/apps-script/Sheet.js` and seeded from `Seed.js`. You don't import a template file. Columns can be reordered by hand because code reads by header name, but never rename or delete headers.

| Tab | Columns | Notes |
|---|---|---|
| Settings | key · value · note | Non-secret config (see `SETTING_DEFAULTS`). Secrets live in Script Properties |
| Services | id · name · name_en · duration_min · price · deposit · description · image_url · active | `deposit`: blank = shop rule, 0 = none, n = fixed |
| Hours | day · open · close · closed | `mon…sun` or Thai day names; `HH:MM` text |
| Holidays | date · note | `YYYY-MM-DD` or a date cell |
| Bookings | ref · created_at · status · line_user_id · name · phone · service_id · service_name · start · end · price · deposit · consent_at · slip_trans_ref · slip_amount · paid_at · calendar_event_id · reminded_at · note | Written by the system; owner edits `status` (dropdown) |
| FAQ | keywords · answer · active | Comma-separated keywords; longest match wins; placeholders `{services}` `{hours}` `{address}` `{map_url}` `{phone}` `{booking_url}` `{site_url}` `{shop_name}` |
| Site | key · value | Website copy (`hero_title`, `about`, `highlight_1_title`, …) |
| Staff | name · role · bio · image_url · active | Website only |
| Reviews | name · text · stars · active | Real reviews with permission |
| Gallery | image_url · caption · active | Website only |
| Log | time · level · event · detail | Errors/warnings; trimmed monthly |
| Report | (generated) | Menu 📊 สรุปยอดเดือนนี้ |

To add a column: append it to the end of the relevant `TABS` entry, add the header to the existing Sheet by hand (setup only writes headers on empty tabs), and read it via the header name.
