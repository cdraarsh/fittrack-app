'use client';

import { useState, useEffect } from 'react';
import { useApp } from '@/lib/store';
import { getWeekNum } from '@/lib/utils';

const PROMPTS = [
  'What do you want to focus on this week?',
  'Any form cues to remember?',
  'Sleep / recovery goal this week?',
  'Nutrition priority (e.g. hit protein, prep meals)?',
];

export default function CoachNotes() {
  const { settings, getCoachNote, saveCoachNote } = useApp();
  const weekNum = getWeekNum(settings);
  const [text, setText] = useState(() => getCoachNote(weekNum));
  const [saved, setSaved] = useState(false);

  // Sync if settings load after mount
  useEffect(() => {
    setText(getCoachNote(weekNum));
  }, [weekNum]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(val: string) {
    setText(val);
    await saveCoachNote(weekNum, val);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="bg-surface border border-hairline rounded-card p-4 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="font-sans text-[13px] font-black uppercase tracking-widest text-ink">Coach Notes</div>
          <div className="text-[11px] text-ink-3 mt-0.5">Week <span className="font-mono tabular-nums">{weekNum}</span> — guidance for yourself</div>
        </div>
        {saved && <span className="font-mono text-[11px] font-bold text-sage">Saved ✓</span>}
      </div>

      {/* Prompt pills */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {PROMPTS.map(p => (
          <button
            key={p}
            onClick={() => save(text ? `${text}\n• ${p}` : `• ${p}`)}
            className="text-[10px] px-2 py-1 rounded-full bg-surface-2 border border-hairline text-ink-3 hover:border-clay-dim hover:text-clay transition-colors"
          >
            {p}
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={e => save(e.target.value)}
        placeholder="Write your coaching notes for this week…"
        rows={4}
        className="w-full bg-surface-2 border border-hairline rounded-sm text-sm text-ink p-3 resize-none outline-none focus:border-clay leading-relaxed"
      />
    </div>
  );
}
