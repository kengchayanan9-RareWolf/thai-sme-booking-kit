# PDPA (Thailand Personal Data Protection Act B.E. 2562)

This is practical guidance, not legal advice. For clinics or anything touching health data, recommend the owner get proper advice.

## Roles
- **Data controller**: the shop (decides why and how customer data is used).
- **Data processor**: you (building and maintaining the system under the care plan). LINE, Google, Cloudflare and the slip provider are sub-processors.
- Put a short processing clause in the quote or agreement: you process shop customer data only to operate and maintain the system, keep it confidential, and delete your access and copies when the engagement ends.

## What the kit collects (data minimization)
Name, phone, LINE userId and display name, booking details, consent timestamp, and slip transaction ref + amount. Slip images are **not stored**; they pass through LINE → Apps Script → the slip provider. **Don't add fields for health conditions, ID card numbers, or birthdays.**

## Built-in controls
- **Consent checkbox** on the booking form (required; `consent_at` stored), linking to `/privacy`.
- **`/privacy` page** generated from Settings (`shop_name`, `address`, `privacy_contact`, `retention_months`). Review it with the owner before launch and adjust the wording to their practice.
- **Retention**: `purgeOldData` (monthly trigger) anonymizes name, phone and userId of bookings older than `retention_months` (default 12) while keeping stats.
- **Access control**: the Sheet is shared only with the owner (+ you). Secrets are in Script Properties, not the Sheet. The public site only receives whitelisted settings (`PUBLIC_SETTINGS`).
- **Security**: webhook signature verification, LIFF ID-token verification, shared secret between the Worker and Apps Script.

## Data subject requests (the owner may ask you)
- Access/copy: filter Bookings by phone or LINE userId → export.
- Correction: edit the row.
- Deletion: overwrite name/phone/userId with `-` (as purge does), or delete the row if there is no accounting need.
- Withdraw consent / object: delete the data and stop reminders (set future bookings to CANCELLED).
Respond within 30 days, and log the request (a private note is fine).

## Breach basics
If the Sheet or tokens leak: rotate the LINE channel access token and channel secret, `SHARED_SECRET` (both sides), and the slip API key; restrict Sheet sharing; review the Log. Notify the PDPC within 72 hours if there is risk to individuals; the shop (controller) is responsible for this, and you assist.
