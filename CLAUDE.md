# Mark Cohan Law: static site

Astro (static) + Tailwind v4, deployed to GitHub Pages at markcohanlaw.com. Contact form posts to a Cloudflare Worker (Turnstile + SMTP), see `worker/` (not built yet).

**Browser Support:** Baseline Widely Available. Newer features only with feature detection and graceful degradation.

## Rules
- Run the `modern-web-guidance` skill before writing HTML/CSS/client JS.
- No inline scripts/styles (CSP is `script-src 'self'`). Astro is configured to emit separate files.
- No secrets in the repo. Public build-time values only: `PUBLIC_CONTACT_ENDPOINT`, `PUBLIC_TURNSTILE_SITEKEY`.
- Site copy lives in `src/content.ts`. Do not invent firm claims, results, or credentials.
- Legal-site rule: no testimonials/guarantees without Mark's approval; keep the "no attorney–client relationship" notice by the form.

## Status
`/b` (editorial) and `/c` (minimal) are design previews. Pick one, then promote it to `/`.
