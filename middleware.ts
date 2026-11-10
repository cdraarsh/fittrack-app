import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

/**
 * App pages require a Clerk session. Public: landing (`/`), `/sign-in`,
 * `/~offline`, static files, and `/api/cron/*` (Vercel Cron authenticates
 * with `Authorization: Bearer $CRON_SECRET`, e.g. /api/cron/garmin,
 * /api/cron/reminders). Other API routes (/api/garmin/*, /api/coach,
 * /api/insight, /api/push/*) call Clerk `auth()` themselves; the middleware
 * still runs on them so `auth()` works.
 */
const isAppPage = createRouteMatcher([
  '/today(.*)',
  '/program(.*)',
  '/history(.*)',
  '/settings(.*)',
  '/dashboard(.*)',
]);
const isCron = createRouteMatcher(['/api/cron/(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (isCron(req)) return;
  if (isAppPage(req)) await auth.protect();
});

export const config = {
  matcher: [
    '/((?!_next|sw\\.js|swe-worker|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
