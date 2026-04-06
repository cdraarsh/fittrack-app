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
    <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[13px] font-black uppercase tracking-widest text-text2">Coach Notes</div>
          <div className="text-[11px] text-text3 mt-0.5">Week {weekNum} — guidance for yourself</div>
        </div>
        {saved && <span className="text-[11px] font-bold text-accent">Saved ✓</span>}
      </div>

      {/* Prompt pills */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {PROMPTS.map(p => (
          <button
            key={p}
            onClick={() => save(text ? `${text}\n• ${p}` : `• ${p}`)}
            className="text-[10px] px-2 py-1 rounded-full bg-bg3 border border-border text-text3 hover:border-accent/40 hover:text-accent transition-colors"
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
        className="w-full bg-bg2 border border-border rounded-[10px] text-sm text-text1 p-3 resize-none outline-none focus:border-accent leading-relaxed"
      />
    </div>
  );
}
