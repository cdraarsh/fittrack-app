'use client';

// Floating AI coach co-pilot: a button on every app page that opens the coach
// as a bottom sheet. Each message carries the live state of the screen and the
// session in front of the user, so answers fit what they're doing right now.

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import CoachCard from './CoachCard';
import type { CoachContext, CoachPage } from '@/lib/ai/coach';
import { useActiveProgram, useLocalUserId, useProgramSessions, useProgress, useSessionBundle, useSettings } from '@/lib/local/hooks';

const PAGES: CoachPage[] = ['today', 'program', 'history', 'settings'];

export function useCoachContext(): CoachContext {
  const pathname = usePathname();
  const userId = useLocalUserId();
  const settings = useSettings(userId);
  const program = useActiveProgram(userId);
  const sessions = useProgramSessions(program?.id);
  const progress = useProgress(sessions, settings?.unlock_rule ?? 'next_calendar_day', settings?.timezone ?? 'UTC');
  const current = progress?.current ?? progress?.waiting ?? null;
  const bundle = useSessionBundle(current?.id);
  const [minute, setMinute] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setMinute(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  return useMemo(() => {
    const page = PAGES.find((p) => pathname === `/${p}` || pathname.startsWith(`/${p}/`)) ?? 'today';
    if (!current) return { page };
    let setsDone = 0;
    let setsTotal = 0;
    let nextExercise: string | undefined;
    for (const item of bundle?.items ?? []) {
      const done = new Set(item.logs.filter((l) => l.done && l.set_index < item.se.sets).map((l) => l.set_index));
      setsTotal += item.se.sets;
      setsDone += done.size;
      if (!nextExercise && done.size < item.se.sets) nextExercise = item.exercise?.name;
    }
    return {
      page,
      session: {
        seq: current.seq,
        title: current.title,
        status: current.status,
        elapsedMin: current.started_at ? Math.max(0, Math.round((minute - new Date(current.started_at).getTime()) / 60_000)) : undefined,
        setsDone,
        setsTotal,
        nextExercise,
      },
    };
  }, [pathname, current, bundle, minute]);
}

function suggestionsFor(ctx: CoachContext): string[] {
  const s = ctx.session;
  if (s?.status === 'in_progress') {
    return [
      s.nextExercise ? `What weight for ${s.nextExercise}?` : 'What weight next set?',
      'Something hurts — swap it?',
      'Running out of time — what to keep?',
    ];
  }
  if (s?.status === 'up_next') return [`Train Day ${s.seq} or rest today?`, 'How did my last session go?', 'Target loads for today?'];
  if (ctx.page === 'history') return ['How are my main lifts trending?', 'Am I training consistently?'];
  return ['How is my progress?', 'Should I deload soon?'];
}

export default function FloatingCoach() {
  const [open, setOpen] = useState(false);
  const context = useCoachContext();
  const suggestions = useMemo(() => suggestionsFor(context), [context]);
  const inSession = context.session?.status === 'in_progress';

  // Return focus to the coach button when the panel closes.
  const fabRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) fabRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {!open && (
        <button
          ref={fabRef}
          onClick={() => setOpen(true)}
          aria-label="Open AI coach"
          className="fixed z-40 right-[max(1rem,calc(50%-15rem+1rem))] bottom-[calc(72px+env(safe-area-inset-bottom))] w-14 h-14 rounded-full bg-gradient-to-br from-energy to-accent text-black shadow-lg shadow-accent/20 flex items-center justify-center active:scale-95 transition-transform"
        >
          <Sparkles size={22} />
          {inSession && <span className="absolute top-1 right-1 w-3 h-3 rounded-full bg-bg border-2 border-accent" aria-hidden />}
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="AI coach"
            className="w-full max-w-app pb-[env(safe-area-inset-bottom)]"
            onClick={(e) => e.stopPropagation()}
          >
            <CoachCard
              className="!mb-0 rounded-b-none [&>div:nth-child(2)]:max-h-[55vh]"
              context={context}
              suggestions={suggestions}
              onClose={() => setOpen(false)}
              autoFocus
            />
          </div>
        </div>
      )}
    </>
  );
}
