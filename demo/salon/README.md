# Demo shop: บ้านสวย ซาลอน (fictional)

Your 30-second sales demo: a live LINE OA a prospect can add on their phone, book a slot, "pay" and get an instant confirmation.

- `demo_mode: true` + `slip_provider: mock` → **any image counts as a valid slip**, so no money moves. A yellow banner on the site and a notice in the booking form say so.
- The PromptPay ID is the placeholder `0000000000`, so the QR scans but no bank will accept it. To demo a real scan, use your own PromptPay with a ฿1 deposit service, and turn mock off.

## Deploy
```bash
npm run demo:build          # → demo/salon/build/ (git-ignored)
```
Then follow `skills/thai-sme-booking/references/deploy-checklist.md` with your own accounts, and set Script Property `SLIP_PROVIDER=mock`.

## Pitch script (Thai)
1. "ลองสแกนเพิ่มเพื่อนร้านตัวอย่างดูครับ" → rich menu
2. พิมพ์ "ราคา" → บอทตอบทันที
3. กด "จองคิว" → เลือกบริการ/เวลา → QR มัดจำยอดตรง
4. ส่งรูปอะไรก็ได้แทนสลิป → "✅ ยืนยันการจองแล้ว" ภายในไม่กี่วินาที
5. เปิด Google Sheet ให้ดูว่าคิวเข้ามาแล้ว + เว็บไซต์ร้าน
6. "ร้านพี่ได้แบบนี้ ราคาเปิดตัว … บาท ค่าดูแลเดือนละ … บาท"
