'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Spinner from '@/components/app/Spinner';
import SessionLogger from '@/components/workout/SessionLogger';
import { useCompletedSessions, useLocalUserId, useSettings } from '@/lib/local/hooks';

/** Completed sessions, newest first. Open one to fix a typo (done sets stay done). */
export default function HistoryPage() {
  const userId = useLocalUserId();
  const settings = useSettings(userId);
  const sessions = useCompletedSessions(userId);
  const [open, setOpen] = useState<string | null>(null);

  if (userId === undefined || sessions === undefined) return <Spinner />;
  if (!userId) return null;
  if (sessions.length === 0) return <p className="text-text2 text-sm">No completed sessions yet.</p>;

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString('en-US', { timeZone: settings?.timezone ?? 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
      : '';

  return (
    <div className="space-y-2">
      <h2 className="font-condensed text-2xl font-black mb-2">History</h2>
      {sessions.map((s) => {
        const expanded = open === s.id;
        return (
          <div key={s.id} className="bg-bg2 border border-border rounded-[10px]">
            <button className="w-full flex items-center gap-3 px-3 py-3 text-left" onClick={() => setOpen(expanded ? null : s.id)} aria-expanded={expanded}>
              <div className="flex-1">
                <div className="text-sm font-semibold">
                  Day {s.seq} · {s.title}
                </div>
                <div className="text-xs text-text3">
                  {fmt(s.completed_at)} · week {s.week}
                  {s.cardio_done ? ' · cardio ✓' : ''}
                </div>
              </div>
              <ChevronDown size={14} className={`text-text3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
            {expanded && (
              <div className="px-3 pb-3">
                <SessionLogger sessionId={s.id} userId={userId} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
