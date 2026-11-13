import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://markcohanlaw.com',
  // Never inline scripts/styles: lets the CSP stay `script-src 'self'` with no 'unsafe-inline'.
  build: { inlineStylesheets: 'never' },
  vite: {
    plugins: [tailwindcss()],
    build: { assetsInlineLimit: 0 },
  },
});
