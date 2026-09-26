# Troubleshooting

Start with the **`Log` tab** in the Sheet, then Worker logs (`npx wrangler tail <slug>-api`), then the LINE Developers console (Messaging API → webhook "Verify" and error statistics).

| Symptom | Likely cause | Fix |
|---|---|---|
| Bot never replies | Webhook OFF / wrong URL; Worker `LINE_CHANNEL_SECRET` wrong (401 in `wrangler tail`) | Set `<worker>/webhook`, Use webhook ON, Verify; re-put the secret |
| Bot replies twice | LINE OA auto-response still ON | OA Manager → Response settings → Auto-response OFF |
| Worker logs "Apps Script returned non-JSON" | `GAS_URL` wrong, web app not deployed as *Anyone*, or a script error before JSON | Re-deploy the web app (Anyone), check the URL ends with `/exec`, check Log/Executions |
| `{"ok":false,"error":"FORBIDDEN"}` | `SHARED_SECRET` differs between the Worker and Script Properties | Set the same value in both |
| Code fix has no effect | Pushed but didn't create a **new deployment version** | Deploy → Manage deployments → ✏️ → New version |
| LIFF: "เปิดระบบจองไม่สำเร็จ" | Wrong `PUBLIC_LIFF_ID`; endpoint URL mismatch | Check the LIFF ID and endpoint `<site>/liff/book` |
| Customers can't log in to LIFF (you can) | LINE Login channel still **Developing** | Publish the channel |
| Booking: "กรุณาเปิดหน้านี้ผ่าน LINE อีกครั้ง" (NOT_LOGGED_IN) | ID token expired or Worker `LINE_LOGIN_CHANNEL_ID` wrong | Re-open the LIFF; fix the channel ID var |
| CORS error in the LIFF console | Site origin not in `ALLOWED_ORIGINS` (e.g. after a custom domain) | Update the var → `wrangler deploy` |
| Slip sent, nothing happens | Customer has no PENDING/EXPIRED booking (e.g. booked under another LINE account); image ignored by design | Owner handles it in chat; check the Bookings `line_user_id` |
| Every slip → NEEDS_REVIEW `RECEIVER_UNVERIFIED` | `receiver_names` / `receiver_accounts` not set | Fill them in exactly as a real slip shows |
| Every slip → `RECEIVER_MISMATCH` | Name/account differs from what the bank prints (English vs Thai, truncated) | Add both TH and EN names; add the full bank account number |
| Slip errors `PROVIDER_DOWN` | Wrong API key, package exhausted, endpoint changed | Check the EasySlip dashboard; set `SLIP_API_URL`/`SLIP_FILE_FIELD` per current docs |
| LIFF slots and LINE userId don't match slips | LINE Login and Messaging API channels under **different providers** | Recreate the LINE Login channel under the OA's provider |
| No reminders | Trigger missing; push quota exhausted (Log `429`); booking not CONFIRMED | Menu ⚙️ ติดตั้ง / ซ่อมระบบ; check quota; check status |
| Owner gets no alerts | `/owner` not registered; `owner_alert_via` = email | Send `/owner <code>`; menu 🔔 ทดสอบแจ้งเตือน |
| Phone numbers lost their leading 0 | Someone typed them into a number-formatted column | Column is formatted as text by setup; retype with a leading `'` |
| Times show as 10:00:00 or wrong | Hours cells converted to time values | The kit reads display values, so either format works. Keep `HH:MM` |
| "อัปเดตเว็บไซต์" fails | `PAGES_DEPLOY_HOOK` missing or deleted; site not Git-connected | Recreate the hook; Pages must use Git integration |
| Pages build fails "Could not reach …/api/site" | Worker down or `PUBLIC_API_BASE` wrong | Fix the Worker. The previous site version stays live meanwhile |
| Double booking happened | Owner edited Bookings by hand, or capacity > 1 | Check `capacity`; manual rows must have correct start/end |

## Useful manual runs (Apps Script editor → select function → Run)
`setup` · `expireHolds` · `sendReminders` · `monthlyReport` · `testOwnerAlert` · `publishSite`. Executions history (left sidebar) shows errors with stack traces.
