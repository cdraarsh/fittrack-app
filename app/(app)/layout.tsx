import AppShell from '@/components/app/AppShell';

/**
 * Signed-in app. Pages are client components reading the local (Dexie) copy,
 * so the HTML is a generic shell the service worker can serve offline.
 * Auth is enforced by middleware.ts.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
