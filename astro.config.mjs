import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://markcohanlaw.com',
  base: process.env.BASE_PATH ?? '/',
  // Never inline scripts/styles: lets the CSP stay `script-src 'self'` with no 'unsafe-inline'.
  build: { inlineStylesheets: 'never' },
  vite: {
    plugins: [tailwindcss()],
    build: { assetsInlineLimit: 0 },
  },
});
