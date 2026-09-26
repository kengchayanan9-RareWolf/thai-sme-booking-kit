# Payments: PromptPay QR + slip verification

## PromptPay QR (`templates/site/src/lib/promptpay.js`)
EMVCo "Thai QR" payload: tag 29 PromptPay (AID `A000000677010111`) with sub-tag 01 phone (`0066` + 9 digits), 02 national/tax ID (13), or 03 e-wallet (15); tag 53 = 764 (THB); tag 54 = amount; tag 58 = TH; CRC-16/CCITT-FALSE. Byte-for-byte tests against the `dtinth/promptpay-qr` reference vectors live in `tests/promptpay.test.mjs`.
With an amount → dynamic QR (`010212`): the bank app pre-fills the exact deposit, so customers can't mistype it.

**Always test with a real bank app** before go-live: scan → it must show the shop's account name and the amount.

## Slip verification flow (`Slip.js`)
1. The customer sends an image in chat. If they have no PENDING (or recently EXPIRED) booking, the image is ignored and left for the owner.
2. Show the LINE loading animation → download the image (`api-data.line.me`) → provider adapter.
3. The provider returns a normalized slip: `{ ok, transRef, amount, dateMs, receiverNames[], receiverAccounts[], isDuplicate, matchedAccount }`.
4. `Lib.validateSlip` checks:
   - `DUPLICATE`: this `transRef` is already on another booking (or the provider says duplicate)
   - `AMOUNT_TOO_LOW` / `AMOUNT_TOO_HIGH`: must be ≥ deposit and ≤ service price (paying in full is fine)
   - `RECEIVER_MISMATCH` / `RECEIVER_UNVERIFIED`: masked account digits must appear in `receiver_accounts` (or `promptpay_id`), or the truncated name must prefix-match `receiver_names`; the name overrides an unknown account, but a mismatching name vetoes a matching account
   - `TOO_OLD` (> `slip_max_age_hours`), `BEFORE_BOOKING` (transfer earlier than the booking, a reused old slip)
5. Pass → CONFIRMED + Flex confirmation (reply, free) + calendar + owner alert. Fail → NEEDS_REVIEW + polite "ร้านกำลังตรวจสอบ" + owner alert with Thai reasons. An unreadable image → ask for a clearer slip and keep the hold.

## EasySlip (default provider)
- Sign up in the **shop's name**, pick a package (2026 entry packages were about ฿99–350/month; Basic ฿350 ≈ 1,000 slips). Copy the API key → Script Property `SLIP_API_KEY`.
- Default endpoint `https://api.easyslip.com/v2/verify/bank`, multipart field `image`, `Authorization: Bearer <key>`. EasySlip's own docs have shown both `/verify/bank` and `/verify/bank/image` for image upload. If requests fail with 404, set Script Property `SLIP_API_URL` to the path in the current docs. For the legacy v1 API use `SLIP_API_URL=https://developer.easyslip.com/api/v1/verify` and `SLIP_FILE_FIELD=file`. `Lib.normalizeEasySlip` reads both v1 and v2 responses.
- Leave the IP whitelist off (Apps Script uses Google's shared egress IPs).
- Optional: register the shop's accounts in EasySlip and use `matchAccount`. A `matchedAccount` result short-circuits the receiver check.

## Adding another provider (SlipOK, Thunder, …)
```js
// Slip.js
SLIP_PROVIDERS.slipok = function (blob, ctx) {
  const res = UrlFetchApp.fetch('https://api.slipok.com/api/line/apikey/<branch>', { method: 'post',
    headers: { 'x-authorization': prop_('SLIP_API_KEY') }, payload: { files: blob }, muteHttpExceptions: true });
  return Lib.normalizeSlipOk(JSON.parse(res.getContentText())); // write + unit-test this normalizer in Lib.js
};
```
Endpoint and field names above are placeholders. Take them from the provider's current docs, add a normalizer to `Lib.js` with fixture-based tests, then set `SLIP_PROVIDER=slipok`.

## Demo mode
`SLIP_PROVIDER=mock` + Settings `demo_mode=TRUE` accepts any image as a correct slip. Use it for the public demo shop only. The mock refuses to work unless `demo_mode` is on.

## When the owner asks "is it safe?"
- The system confirms only slips whose transaction exists at the bank (via the provider), sent to the shop's account, for at least the deposit, not used before, and dated after the booking.
- Anything odd is never auto-rejected in front of the customer. It goes to the owner with the reason.
- Money always goes directly into the shop's own account. The system never holds funds.
