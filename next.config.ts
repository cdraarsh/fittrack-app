import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

// Service worker: app/sw.ts → public/sw.js (generated at build, not committed).
// Disabled in dev (Turbopack); test offline with `npm run build && npm start`.
const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  cacheOnNavigation: true,
  reloadOnOnline: false, // never reload mid-set; the sync loop handles reconnects
  register: true,
  disable: process.env.NODE_ENV === 'development',
  additionalPrecacheEntries: [{ url: '/~offline', revision: process.env.VERCEL_GIT_COMMIT_SHA ?? `${Date.now()}` }],
});

const config: NextConfig = {};

export default withSerwist(config);
