# LIFF booking page (`/liff/book`)

Static Astro page + client script. Flow: `liff.init` → login if needed → `GET /api/services` → service → date chips (`days_ahead`) → `GET /api/slots` → name/phone/consent → `POST /api/book` with `liff.getIDToken()`.

## Result screens
- **CONFIRMED** (no deposit): success screen. The customer is told a reminder will come in LINE.
- **PENDING_DEPOSIT**: exact-amount PromptPay QR (`promptPayPayload(promptpayId, deposit)` rendered with `qrcode` as an `<img>`, so a long-press saves it), the shop's PromptPay name, and a countdown of `hold_minutes`. Instructions: save the QR → bank app → scan from album → send the slip in chat. "กลับไปแชท" closes the LIFF window in LINE (or opens the OA chat outside LINE).

## Details that matter
- **Name/phone are remembered** in localStorage for repeat customers. The name falls back to the LINE display name from the ID token.
- **Service preselect**: links like `https://liff.line.me/<id>?service=color` (the website's "จองบริการนี้" buttons) preselect that service.
- **SLOT_TAKEN** refreshes the time grid and explains it in Thai.
- The page is `noindex` and `robots.txt` disallows `/liff/`.
- **Security**: the browser never sends a userId. The Worker verifies the ID token with LINE (`/oauth2/v2.1/verify`, `client_id` = LINE Login channel ID) and uses its `sub`.
- **CORS**: the Worker only allows origins in `ALLOWED_ORIGINS` (the site origin). After adding a custom domain, update it.

## Local UI preview (no LINE needed)
```
cd templates/site   # or clients/<slug>/build/site
npm i && npm run build && npx astro preview
# open http://localhost:4321/liff/book?preview
```
`?preview` works only on localhost. It fakes the LINE login and uses `src/data/site.json` with synthetic slots. It is handy for design tweaks and for demoing the flow to a prospect on a laptop.

## Customizing
- Wording: in `book.astro` (form) and `Messages.js` (chat).
- Colors: Settings `brand_color` (becomes the CSS `--brand`).
- More fields (e.g. "number of people", "notes"): add the input, send it in the `/api/book` body, whitelist it in the Worker's `book()`, store it in a new Bookings column (add it to `TABS.Bookings` at the end), and **never** collect health details.
