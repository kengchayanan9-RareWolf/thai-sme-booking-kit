# Website (Astro on Cloudflare Pages)

Pages: `/` (hero, highlights, top services, about, reviews, hours, map, CTA) · `/services` · `/team` (staff + gallery) · `/reviews` · `/contact` (hours table, map embed, LINE/phone) · `/privacy` (PDPA notice) · `/liff/book` (booking app) · `/404` · `sitemap.xml` · `robots.txt`. It includes LocalBusiness JSON-LD, OG tags, a sticky mobile "โทร / จองคิว" bar, and the Noto Sans/Serif Thai fonts.

## Content model: the Sheet is the CMS
At build time `src/lib/data.js` fetches `<worker>/api/site`, which returns `siteData_()` from Apps Script (whitelisted public settings + Site/Services/Hours/Staff/Reviews/Gallery tabs).
- `PUBLIC_API_BASE` set → the Sheet is the source of truth; **a failed fetch fails the build**, so Pages keeps the last good version instead of publishing stale content.
- Not set → uses `src/data/site.json` (generated from client.yaml by build-config). This covers local dev and the first deploy.
- Owner flow: edit tabs → menu 🌐 อัปเดตเว็บไซต์ → Apps Script POSTs the Pages deploy hook → rebuild in about 1–2 minutes.
- Site tab keys used by the template: `hero_title`, `hero_subtitle`, `hero_image_url`, `about`, `highlight_{1..3}_title/text`, `cta_text`, `credit_text`, `credit_url` (optional "เว็บไซต์โดย …" footer link: your portfolio lead magnet, but ask the owner first).

## Deploy (Git integration, needed for the deploy hook)
1. Put `clients/<slug>/build/site` in a Git repo (a private repo in the shop's GitHub, or your private org).
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
   - Framework preset **Astro**, build command `npm run build`, output `dist`
   - Environment variables: `PUBLIC_API_BASE=<worker url>`, `PUBLIC_LIFF_ID=<liff id>`, `SITE_URL=<https://site>`, `NODE_VERSION=22`
3. Settings → Builds & deployments → **Deploy hooks** → Add ("sheet-publish", branch main) → copy the URL → Script Property `PAGES_DEPLOY_HOOK`.
4. Custom domain: Pages → Custom domains → add (DNS at Cloudflare is easiest). Then update `deploy.site_url`, the LIFF endpoint URL, and the Worker `ALLOWED_ORIGINS` (rebuild + `wrangler deploy`).

## Images
The template works without images (gradient hero, initials avatars). For real photos: host them somewhere stable (the site repo's `public/`, or a Cloudflare R2/Images URL) and paste the URLs into the Sheet (`hero_image_url`, `Services.image_url`, `Staff.image_url`, `Gallery.image_url`). Compress to under 300 KB (squoosh.app). Google Drive "share" links are not reliable image URLs.

## SEO basics that matter for local shops
- Google Business Profile does more than the website for "ร้านทำผม ใกล้ฉัน" searches, so do it (google-business-profile.md).
- Keep `shop_name`, `address` and `phone` identical across the site, GBP, and the LINE OA profile.
- Put the website URL in the LINE OA profile, Facebook page, and GBP.
- Real Thai service names and area names in `about` and service descriptions beat keyword stuffing.

## Premium themes
The public kit ships one clean theme. Alternative themes (spa, clinic, barber) live in the private pro repo. They swap `global.css` + layout and keep the same data contract.
