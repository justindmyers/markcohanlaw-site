# Cloudflare setup (markcohanlaw.com)

Order matters. Steps 1-2 change nothing visitors can see. Step 5 is the cutover.

## 0. Prereqs
- Free Cloudflare account. Domain registrar: Namecheap. Current nameservers: ns1/ns2.zerosignalproductions.com.
- A dedicated cPanel mailbox `noreply@markcohanlaw.com` (send-only). The password goes into a Worker secret, never the repo.

## 1. Add the zone, copy DNS exactly (no visible change)
Add `markcohanlaw.com` to Cloudflare (Free plan). Confirm the imported records, all **DNS only (grey cloud)** for now:

| Name | Type | Value |
|---|---|---|
| `@` | A | 51.79.111.135 (WordPress, until cutover) |
| `www` | CNAME | `markcohanlaw.com` |
| `mail`, `webmail`, `cpanel`, `ftp` | A | 51.79.111.135 (always grey cloud) |
| `@` | MX | **change to `mail.markcohanlaw.com`** (priority 0). It currently points at the apex, which moves at cutover. |

Add the email-authentication records cPanel is missing (generate DKIM in cPanel > Email Deliverability):
- SPF: `v=spf1 +a +mx ip4:51.79.111.135 ~all`
- DKIM: the `default._domainkey` TXT value from cPanel
- DMARC: `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:mark@markcohanlaw.com` (tighten to quarantine later)

Then change nameservers at Namecheap to the two Cloudflare ones shown on the dashboard. Wait for "Active". Test: site and mail still work.

## 2. Worker + Turnstile
- Turnstile: create a widget for `markcohanlaw.com` (managed mode). Site key goes in the build env (`PUBLIC_TURNSTILE_SITEKEY`, public). Secret key goes in the Worker secret `TURNSTILE_SECRET`.
- `cd worker && npx wrangler secret put TURNSTILE_SECRET | SMTP_USER | SMTP_PASS` (you type them; nobody else sees them).
- Uncomment the `routes` line in `wrangler.toml` (`markcohanlaw.com/api/contact`), `npx wrangler deploy`.
- Remove the `github.io` origin from `ALLOWED_ORIGINS` after cutover.
- Test first from the github.io test site (add `PUBLIC_CONTACT_ENDPOINT` + sitekey to the workflow env and a `workers.dev` URL).

## 3. Bot and abuse protection (Free plan)
- Security > Bots: **Bot Fight Mode ON**. Optionally "Block AI bots". Verified crawlers (Googlebot, Bingbot) are allowed.
- Security > WAF > Rate limiting rule (Free allows 1): `URI Path equals /api/contact` and `Method equals POST`, 5 requests / 10 s per IP, action Block.
- Security > Settings: Security Level Medium, Browser Integrity Check ON.
- SSL/TLS: mode **Full (strict)**, Always Use HTTPS ON, Minimum TLS 1.2, HSTS (start 6 months, no preload yet).
- Not on Free: Super Bot Fight Mode, Bot Management, advanced rate limiting. Honest expectation: this stops commodity scrapers and floods. The form's real protection is Turnstile + honeypot + server-side validation + the rate limit.

## 4. Security headers (Rules > Transform Rules > Response headers, applied to all requests)
GitHub Pages cannot set headers; Cloudflare can.
```
Content-Security-Policy: default-src 'none'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; form-action 'self'; base-uri 'self'; frame-ancestors 'none'; upgrade-insecure-requests
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```
The built page has no inline scripts/styles/handlers (checked), so no `'unsafe-inline'` is needed. Verify in the browser console after enabling.

## 5. Cutover (GitHub Pages behind Cloudflare)
1. In the repo: remove the three test env vars in `deploy.yml`, add `public/CNAME` with `markcohanlaw.com`, set `PUBLIC_CONTACT_ENDPOINT=https://markcohanlaw.com/api/contact`.
2. GitHub > Settings > Pages > custom domain `markcohanlaw.com`.
3. Cloudflare DNS: apex A records `185.199.108.153`, `.109.153`, `.110.153`, `.111.153` and `www` CNAME `justindmyers.github.io`, **grey cloud first** so GitHub can issue its certificate. Wait for the cert, tick Enforce HTTPS.
4. Then switch those web records to **proxied (orange cloud)**. Leave `mail`, `webmail`, `cpanel`, `ftp` grey.
5. Check: site on both hostnames, form delivers, mail still arrives, headers present. Keep the old WordPress host untouched until all of this passes.

## API token (if scripting this)
Create a custom token and paste it into `~/Documents/Projects/markcohan/.cf-token` yourself (one level above the repo, so it can never be committed; `chmod 600`). Scope it to this zone/account only: Zone Read, DNS Edit, Zone Settings Edit, Zone WAF Edit, Transform Rules Edit, Workers Routes Edit, plus Account: Workers Scripts Edit and Turnstile Edit. Dashboard permission names vary slightly. Revoke the token when finished.
