'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Dumbbell, CloudOff, History, RefreshCw, Settings2, Zap } from 'lucide-react';
import { useLocalUserId, useSettings, useSyncEngine, useSyncStatus, useOutboxCounts } from '@/lib/local/hooks';
import { useCueSetup } from '@/lib/audio/hooks';
import RestTimer from '../shared/RestTimer';
import Toast from '../shared/Toast';
import FloatingCoach from '../coach/FloatingCoach';
import { setOverlay } from '@/lib/ui/overlays';
import { UNREACHABLE, humanizeError } from '@/lib/ui/errors';

const NAV = [
  { href: '/today', label: 'Today', icon: Zap },
  { href: '/strength', label: 'Strength', icon: Dumbbell },
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

  // Keyboard up (a text/number field focused): the dock and coach button step aside.
  useEffect(() => {
    const isField = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button'].includes((t as HTMLInputElement).type)));
    // Always derive from what is actually focused: a focused field can be
    // removed (sheet closed, form remounted) without any focusout, so re-check
    // after every focus change and poll briefly while a field counts as focused.
    const check = () => setOverlay({ inputFocused: isField(document.activeElement) });
    const onIn = (e: FocusEvent) => setOverlay({ inputFocused: isField(e.target) });
    const onOut = (e: FocusEvent) => {
      if (!isField(e.relatedTarget)) setOverlay({ inputFocused: false });
      setTimeout(check, 0);
    };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    const poll = setInterval(check, 300);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
      clearInterval(poll);
    };
  }, []);
  const unreachable = sync.state === 'error' && humanizeError(sync.lastError) === UNREACHABLE;

  return (
    <div className="max-w-app mx-auto min-h-screen flex flex-col">
      <header className="bg-bg1 border-b border-accent/10 px-5 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sticky top-0 z-40 flex items-center justify-between">
        <h1 className="font-condensed text-2xl font-black gradient-text tracking-tight">FitTrack</h1>
        <div className="flex items-center gap-3">
          {sync.state === 'offline' ? (
            <span className="flex items-center gap-1 text-xs text-text3" title="Offline — changes are saved on this phone">
              <CloudOff size={13} /> Offline{outbox?.pending ? ` · ${outbox.pending} saved on phone` : ''}
            </span>
          ) : sync.state === 'syncing' ? (
            <RefreshCw size={13} className="text-text3 animate-spin" aria-label="Syncing" />
          ) : outbox?.pending ? (
            <Link href="/settings" className="text-xs text-text3" title={unreachable ? UNREACHABLE : 'Sending to the server'}>
              {outbox.pending} {unreachable ? 'waiting' : 'to sync'}
            </Link>
          ) : null}
          {outbox?.failed.length ? (
            <Link href="/settings" className="text-xs text-warn" title="The server refused some changes — see Settings">
              {outbox.failed.length} not synced ›
            </Link>
          ) : null}
        </div>
      </header>

      {/* Bottom padding clears the nav (56) + rest dock (64) + 16 px. */}
      <main className="flex-1 p-4 pb-[calc(136px+env(safe-area-inset-bottom))]">{children}</main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-bg1 border-t border-border z-40 flex px-2 pb-[env(safe-area-inset-bottom)]">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 min-h-[56px] flex flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                active ? 'text-accent' : 'text-text3 hover:text-text2'
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <FloatingCoach />
      <RestTimer />
      <Toast />
    </div>
  );
}
