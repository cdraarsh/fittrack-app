'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { CalendarRange, CloudOff, History, RefreshCw, Settings2, Zap } from 'lucide-react';
import { useLocalUserId, useSettings, useSyncEngine, useSyncStatus, useOutboxCounts } from '@/lib/local/hooks';
import { useCueSetup } from '@/lib/audio/hooks';
import RestTimer from '../shared/RestTimer';
import Toast from '../shared/Toast';

const NAV = [
  { href: '/today', label: 'Today', icon: Zap },
  { href: '/program', label: 'Program', icon: CalendarRange },
  { href: '/history', label: 'History', icon: History },
  { href: '/settings', label: 'Settings', icon: Settings2 },
];

/** Ask the service worker to cache every app route once per session (offline shell). */
function useWarmShell(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn || !('serviceWorker' in navigator)) return;
    if (sessionStorage.getItem('fittrack:warmed')) return;
    void navigator.serviceWorker.ready.then((reg) => {
      reg.active?.postMessage({ type: 'WARM_APP_SHELL' });
      sessionStorage.setItem('fittrack:warmed', '1');
    });
  }, [signedIn]);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const userId = useLocalUserId();
  const settings = useSettings(userId);
  const sync = useSyncStatus();
  const outbox = useOutboxCounts();
  useSyncEngine();
  useCueSetup(settings ? { enabled: settings.sound_enabled, volume: settings.sound_volume } : undefined);
  useWarmShell(!!userId);

  return (
    <div className="max-w-app mx-auto min-h-screen flex flex-col pb-20">
      <header className="bg-bg1 border-b border-accent/10 px-5 py-3 sticky top-0 z-40 flex items-center justify-between">
        <h1 className="font-condensed text-2xl font-black gradient-text tracking-tight">FitTrack</h1>
        <div className="flex items-center gap-3">
          {sync.state === 'offline' ? (
            <span className="flex items-center gap-1 text-[11px] text-text3" title="Offline — changes are saved on this phone">
              <CloudOff size={13} /> Offline{outbox?.pending ? ` · ${outbox.pending}` : ''}
            </span>
          ) : sync.state === 'syncing' ? (
            <RefreshCw size={13} className="text-text3 animate-spin" aria-label="Syncing" />
          ) : outbox?.pending ? (
            <span className="text-[11px] text-text3">{outbox.pending} to sync</span>
          ) : null}
          {outbox?.failed.length ? (
            <Link href="/settings" className="text-[11px] text-warn" title="The server refused some changes — see Settings">
              {outbox.failed.length} not synced
            </Link>
          ) : null}
        </div>
      </header>

      <main className="flex-1 p-4">{children}</main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-bg1 border-t border-border z-40 flex px-2 pb-[env(safe-area-inset-bottom)]">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 min-h-[56px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${
                active ? 'text-accent' : 'text-text3 hover:text-text2'
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <RestTimer />
      <Toast />
    </div>
  );
}
