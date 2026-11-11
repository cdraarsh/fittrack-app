'use client';

import { useState } from 'react';
import { Check, ChevronDown, Lock, Play } from 'lucide-react';
import Link from 'next/link';
import Spinner from '@/components/app/Spinner';
import SessionLogger from '@/components/workout/SessionLogger';
import { useActiveProgram, useLocalUserId, useProgramSessions } from '@/lib/local/hooks';
import type { ProgramSession } from '@/lib/program/types';

/**
 * The whole block as numbered sessions. Future sessions are preview-only:
 * no skip, no reorder, no opening early.
 */
export default function ProgramPage() {
  const userId = useLocalUserId();
  const program = useActiveProgram(userId);
  const sessions = useProgramSessions(program?.id);
  const [open, setOpen] = useState<string | null>(null);

  if (userId === undefined || program === undefined) return <Spinner />;
  if (!program || !userId) {
    return (
      <p className="text-text2 text-sm">
        No program running. <Link href="/today" className="text-accent underline underline-offset-2">Start one on Today</Link>.
      </p>
    );
  }
  if (!sessions) return <Spinner />;

  const weeks = new Map<number, ProgramSession[]>();
  for (const s of sessions) weeks.set(s.week, [...(weeks.get(s.week) ?? []), s]);
  const done = sessions.filter((s) => s.status === 'complete').length;

  return (
    <div>
      <h2 className="font-condensed text-2xl font-black">{program.name}</h2>
      <p className="text-xs text-text3 mb-4">
        {done}/{sessions.length} sessions complete · sessions unlock in order
      </p>
      {[...weeks.entries()].map(([week, list]) => (
        <section key={week} className="mb-4">
          <div className="text-[11px] font-bold uppercase tracking-widest text-text3 mb-1.5">
            Week {week} · {list[0].phase}
            {list[0].is_deload ? ' · Deload' : ''}
          </div>
          <div className="space-y-1.5">
            {list.map((s) => {
              const active = s.status === 'up_next' || s.status === 'in_progress';
              const expanded = open === s.id;
              return (
                <div key={s.id} className={`border rounded-[10px] ${active ? 'border-accent/40 bg-accent/5' : 'border-border bg-bg2'}`}>
                  {active ? (
                    <Link href="/today" className="flex items-center gap-3 px-3 py-2.5">
                      <Play size={14} className="text-accent" />
                      <span className="flex-1 text-sm font-semibold">Day {s.seq} · {s.title}</span>
                      <span className="text-[10px] font-black uppercase text-accent">{s.status === 'in_progress' ? 'In progress' : 'Up next'}</span>
                    </Link>
                  ) : (
                    <button
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                      onClick={() => setOpen(expanded ? null : s.id)}
                      aria-expanded={expanded}
                    >
                      {s.status === 'complete' ? <Check size={14} className="text-accent" /> : <Lock size={14} className="text-text3" />}
                      <span className={`flex-1 text-sm ${s.status === 'complete' ? 'text-text2' : 'text-text3'}`}>
                        Day {s.seq} · {s.title}
                      </span>
                      <ChevronDown size={14} className={`text-text3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                  {expanded && (
                    <div className="px-3 pb-3">
                      <SessionLogger sessionId={s.id} userId={userId} preview />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
