# Deploy checklist (per shop)

Do the steps in order; each unlocks the next. Accounts are created **in the shop's name** (use a shop Gmail; you are added as admin). Tick items off in chat as you go.

## 0. Prerequisites
- [ ] `client.yaml` validated, quote accepted, first payment received
- [ ] Shop Google account (Gmail) with 2-step verification, you added as editor where needed
- [ ] Enable the Apps Script API for that account: https://script.google.com/home/usersettings → ON (required by clasp)
- [ ] `node scripts/build-config.mjs clients/<slug>/client.yaml` → note the printed `SHARED_SECRET`

## 1. Google Sheet + Apps Script — `references/apps-script.md`
- [ ] `cd clients/<slug>/build/apps-script`
- [ ] `npx @google/clasp login` (browser; log in as the shop account)
- [ ] `npx @google/clasp create-script --type sheets --title "<shop> ระบบจอง" --rootDir .` (clasp 3; `clasp create` on older versions)
- [ ] ⚠️ **create-script overwrites `appsscript.json`** with a default (timezone America/New_York, no web-app config, no scopes). Re-run `build-config.mjs` to restore it, **then** push. Setup warns if the timezone is wrong
- [ ] `npx @google/clasp push -f`
- [ ] Open the script (`npx @google/clasp open-script`) → ⚙️ Project Settings → Script Properties:
      `SHARED_SECRET`, `SLIP_PROVIDER=easyslip`, `SLIP_API_KEY`, `LINE_CHANNEL_ACCESS_TOKEN` (after step 3), `PAGES_DEPLOY_HOOK` (after step 4)
- [ ] Open the Sheet (`npx @google/clasp open-container`) → reload → menu 🗓️ ระบบจอง → ⚙️ ติดตั้ง / ซ่อมระบบ → authorize ("unverified app" → Advanced → continue: it is the shop's own script) → note the `/owner` code
- [ ] `npx @google/clasp create-deployment -d "v1"` → note the deployment ID → `deploy.gas_url` = `https://script.google.com/macros/s/<deploymentId>/exec` (or UI: Deploy → New deployment → Web app → Execute as **Me**, access **Anyone**)
- [ ] Later code changes: `clasp push -f && clasp update-deployment <deploymentId>`, which keeps the same URL

## 2. Cloudflare Worker
- [ ] Cloudflare account (shop email) → `cd ../worker && npm i && npx wrangler login`
- [ ] `npx wrangler secret put SHARED_SECRET` (same value as Apps Script)
- [ ] `npx wrangler secret put LINE_CHANNEL_SECRET` (after step 3)
- [ ] Update `wrangler.toml` vars via client.yaml (`deploy.gas_url`, `deploy.line_login_channel_id`, `deploy.site_url`) → rebuild → `npx wrangler deploy` → note the URL → `deploy.worker_url`
- [ ] `curl <worker>/api/services` returns `{"ok":true,...}`

## 3. LINE — `references/line-setup.md`
- [ ] LINE Official Account (free plan) → enable Messaging API (creates the provider + channel)
- [ ] Channel secret → `wrangler secret put LINE_CHANNEL_SECRET`. Long-lived channel access token → Script Property
- [ ] Webhook URL `<worker>/webhook` → Verify ✓ → Use webhook ON
- [ ] OA Manager response settings: Chat ON, Webhook ON, **Auto-reply OFF**, Greeting ON
- [ ] LINE Login channel **in the same provider as the OA (check the breadcrumb: it may not be the one you named)**, region **Thailand** (default is Japan), linked OA = this shop → LIFF app: size Full, endpoint `<site>/liff/book/` (trailing slash), scopes `openid profile`, bot link On (Aggressive) → LIFF ID → `deploy.liff_id`; channel ID → `deploy.line_login_channel_id`
- [ ] **Publish** the LINE Login channel (Developing → Published), otherwise customers cannot log in
- [ ] Rich menu in OA Manager (layout in line-setup.md)

## 4. Website — `references/website.md`
- [ ] Rebuild (now with worker_url, liff_id, site_url) → push `build/site` to a Git repo (shop's GitHub, or your private org)
- [ ] Cloudflare → Workers & Pages → Create application → **"Continue to Pages"** (the default creates a Worker!) → Import Git repo → preset Astro, build `npm run build`, output `dist`, env `PUBLIC_API_BASE`, `PUBLIC_LIFF_ID`, `SITE_URL`, `NODE_VERSION=22`
- [ ] Settings → Builds → Deploy hooks → add → URL → Script Property `PAGES_DEPLOY_HOOK`
- [ ] Custom domain (optional) → update `deploy.site_url`, the LIFF endpoint, `ALLOWED_ORIGINS` → rebuild + redeploy the Worker
- [ ] Set Settings `liff_id`, `site_url` in the Sheet (seeded from client.yaml if already known)

## 5. Slip provider — `references/payments-slip.md`
- [ ] EasySlip account in the shop's name → package → API key → Script Property `SLIP_API_KEY`
- [ ] Leave IP whitelist off (Apps Script egress IPs are Google's shared ranges)

## 6. Owner connections
- [ ] Owner adds the OA as a friend and sends `/owner <code>` → menu 🔔 ทดสอบแจ้งเตือน
- [ ] Share the Sheet with the owner (Editor). Calendar: events land in the script owner's calendar (the shop account), so share it with staff phones.
- [ ] Google Business Profile (`references/google-business-profile.md`)

## 7. Go-live test script (do all, on a phone)
1. Add the OA as a friend → rich menu works; type `ราคา`, `เปิดกี่โมง`, `ที่อยู่` → correct FAQ answers
2. Type something random → **no bot reply**, and the message is visible in OA Manager chat
3. Rich menu → จองคิว → LIFF opens logged in → pick service/date/time → consent → confirm
4. Scan the QR in a real bank app: correct **shop name and amount**. Temporarily set a service deposit to ฿1 for this test
5. Pay ฿1 → send the slip in chat → "✅ ยืนยันการจองแล้ว" within seconds → row CONFIRMED → calendar event → owner alert
6. Send the **same slip** for a new booking → NEEDS_REVIEW + owner alert "สลิปนี้เคยใช้แล้ว"
7. In the Sheet set that row to CONFIRMED → customer receives a pushed confirmation
8. Run `sendReminders` from the editor with a booking for tomorrow → reminder arrives
9. Change a price in Services → 🌐 อัปเดตเว็บไซต์ → the site shows the new price within about 2 minutes
10. Restore the real deposit amounts. Check `demo_mode` is FALSE and `SLIP_PROVIDER` is not `mock`
11. Review `/privacy` with the owner (PDPA)

## 8. Handoff
- [ ] Personalized `owner-guide.th.md` (PDF) + 20-minute walkthrough (record it)
- [ ] Credentials stay with the owner. You keep admin roles only
- [ ] Write the go-live date, warranty end, and care plan start in the private client notes
