# LINE setup

LINE changes console labels often, so verify click paths against the current UI. The concepts below are stable.

## Accounts and channels

```
Provider (e.g. "Baan Suay Salon")          ← one per shop, created when enabling Messaging API
├── Messaging API channel                  ← the LINE OA's bot: webhook, reply/push, channel secret + token
└── LINE Login channel                     ← owns the LIFF app (booking page)
```
**Both channels must be under the same provider.** LINE user IDs are per provider. If they differ, the userId from the LIFF login won't match the userId that sends the slip in chat, and slips never match their booking.

## 1. LINE Official Account + Messaging API
1. https://manager.line.biz → create an account (shop name, category, free "Communication" plan).
2. OA Manager → ⚙️ Settings → Messaging API → **Enable** → create a provider named after the shop.
3. LINE Developers console (https://developers.line.biz) → provider → the new Messaging API channel:
   - **Basic settings → Channel secret** → `npx wrangler secret put LINE_CHANNEL_SECRET`
   - **Messaging API → Channel access token (long-lived) → Issue** → Script Property `LINE_CHANNEL_ACCESS_TOKEN`
   - **Messaging API → Webhook URL** = `https://<slug>-api.<subdomain>.workers.dev/webhook` → **Verify** (should succeed; the Worker answers the empty test event) → **Use webhook: ON**
4. OA Manager → ⚙️ Settings → Response settings (การตอบกลับ):
   - Chat: **ON** (owner still chats manually. Unmatched messages land here)
   - Webhook: **ON**
   - Auto-response messages: **OFF** (otherwise LINE replies too, doubling answers)
   - Greeting message: **ON**. Edit the text, e.g. "ขอบคุณที่เพิ่มเพื่อนค่ะ 🙏 กดเมนู 'จองคิว' ด้านล่างเพื่อจองได้ตลอด 24 ชม."

## 2. LINE Login channel + LIFF
1. Developers console → **same provider** → Create a new channel → **LINE Login** → app type **Web app**. Name it "<shop> จองคิว" and add an icon.
2. **Basic settings → Channel ID** → `deploy.line_login_channel_id` (the Worker uses it to verify ID tokens).
3. **LIFF tab → Add**:
   - Size: **Full**
   - Endpoint URL: `https://<site>/liff/book`
   - Scopes: `openid`, `profile`
   - Bot link feature: **On (Aggressive)**, so customers are asked to add the OA as a friend and can receive the confirmation and reminders
   - → copy the **LIFF ID** (`1234567890-AbCdEfGh`) → `deploy.liff_id` and Settings `liff_id`
4. **Publish the channel** (status "Developing" → "Published"). While it is "Developing", only channel admins/testers can log in, and every real customer gets an error.

## 3. Rich menu (OA Manager → Home → Rich menus)
Recommended 6-area layout (image 2500×1686; design it in Canva with the shop's colors):

| จองคิว 📅 (Link: `https://liff.line.me/<LIFF ID>`) | ราคา 💰 (Text: `ราคา`) | เวลาเปิด 🕘 (Text: `เวลาเปิด`) |
|---|---|---|
| **แผนที่ 📍** (Text: `แผนที่`) | **เว็บไซต์ 🌐** (Link: site URL) | **โทร 📞** (Link: `tel:0xxxxxxxxx`) |

Text actions send a message that the FAQ bot answers (free replies). Set display period "no end date", and set the menu bar text to "เมนู / จองคิว".

## 4. Owner alerts
After `setup`, the Sheet shows a 6-digit code. The owner (and any staff who should receive alerts) adds the OA as a friend and sends `/owner 123456`. Their userIds are saved in Settings `owner_line_user_id` (comma-separated). Each alert is a **push** per person, which counts against the quota.

## Quota and plans
- Replies (FAQ, booking button, slip confirmation) are free and unlimited.
- Pushes count: reminders (1 per booking), owner alerts (1 per owner per event), owner-approved confirmations.
- Thailand free plan quota: check the current value on LINE for Business TH (sources in 2026 list 300–500/month). Paid plans start around ฿1,500/month.
- Rule of thumb: the free plan covers roughly 150–250 bookings/month with reminders on and one owner on LINE alerts. Switch `owner_alert_via` to `email` to save pushes.
- `sendReminders` checks the quota first and emails the owner a call list instead of failing silently.

## LINE Notify is gone
LINE Notify shut down in 2025. Owner alerts therefore use OA push or email; don't build on Notify.
