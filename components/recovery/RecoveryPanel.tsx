'use client';

import { useApp } from '@/lib/store';
import { DAYS } from '@/lib/constants';
import type { RecoveryData } from '@/lib/types';

const SCALE_LABELS: Record<string, string[]> = {
  energy:        ['Drained', 'Low', 'Okay', 'Good', 'Energised'],
  soreness:      ['None', 'Mild', 'Moderate', 'High', 'Very sore'],
  mood:          ['Low', 'Meh', 'Neutral', 'Good', 'Great'],
  sleep_quality: ['Terrible', 'Poor', 'Okay', 'Good', 'Excellent'],
};

const SCALE_COLORS: Record<number, string> = {
  1: 'bg-clay-wash border-clay-dim text-clay',
  2: 'bg-clay-wash border-clay-dim text-clay',
  3: 'bg-surface-2 border-hairline-2 text-mustard',
  4: 'bg-surface-2 border-hairline-2 text-sage',
  5: 'bg-sage/10 border-sage/40 text-sage',
};

function ScaleRow({
  label, field, value, onChange,
}: {
  label: string;
  field: keyof RecoveryData;
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  const labels = SCALE_LABELS[field as string] ?? [];
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-hairline last:border-0">
      <div>
        <div className="text-sm text-ink">{label}</div>
        {value != null && (
          <div className="text-[11px] text-ink-3 mt-0.5">{labels[value - 1] ?? ''}</div>
        )}
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => onChange(value === n ? 0 : n)}
            className={`w-8 h-8 rounded-sm border font-mono text-xs font-bold transition-colors cursor-pointer ${
              value === n ? SCALE_COLORS[n] : 'bg-surface-2 border-hairline text-ink-3/50'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function RecoveryPanel() {
  const { settings, getDayData, saveDayData } = useApp();
  const today    = new Date();
  const todayName = DAYS[today.getDay()];
  const isGymDay  = settings?.gymDays?.includes(todayName) ?? false;
  const data     = getDayData(today);
  const rec      = data.recovery ?? {};

  async function patch(updates: Partial<RecoveryData>) {
    const next: RecoveryData = { ...rec, ...updates };
    // Remove zero values (means "unset")
    for (const k of Object.keys(next) as (keyof RecoveryData)[]) {
      if (next[k] === 0) delete next[k];
    }
    await saveDayData(today, { ...data, recovery: next });
  }

  const title = isGymDay ? 'Readiness Check' : 'Recovery Check';
  const subtitle = isGymDay
    ? 'How are you going into this session?'
    : 'How is your body recovering?';

  return (
    <div className="bg-surface border border-hairline rounded-card p-4 mb-3">
      <div className="mb-3">
        <div className="font-sans text-[13px] font-black uppercase tracking-widest text-ink">{title}</div>
        <div className="text-xs text-ink-3 mt-0.5">{subtitle}</div>
      </div>

      <ScaleRow label="Energy"        field="energy"        value={rec.energy}        onChange={v => patch({ energy: v })} />
      <ScaleRow label="Sleep quality" field="sleep_quality" value={rec.sleep_quality} onChange={v => patch({ sleep_quality: v })} />
      <ScaleRow label="Soreness"      field="soreness"      value={rec.soreness}      onChange={v => patch({ soreness: v })} />
      <ScaleRow label="Mood"          field="mood"          value={rec.mood}          onChange={v => patch({ mood: v })} />

      {/* Optional numeric fields */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <div className="font-mono text-[10px] text-ink-3 uppercase font-bold mb-1">Sleep hours</div>
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min="4"
            max="12"
            placeholder="e.g. 7.5"
            value={rec.sleep_hours ?? ''}
            onChange={e => patch({ sleep_hours: parseFloat(e.target.value) || undefined })}
            className="w-full bg-surface-2 border border-hairline rounded-sm font-mono tabular-nums text-sm px-3 py-2 outline-none focus:border-clay text-ink"
          />
        </div>
        <div>
          <div className="font-mono text-[10px] text-ink-3 uppercase font-bold mb-1">Resting HR (bpm)</div>
          <input
            type="number"
            inputMode="numeric"
            placeholder="e.g. 58"
            value={rec.resting_hr ?? ''}
            onChange={e => patch({ resting_hr: parseInt(e.target.value) || undefined })}
            className="w-full bg-surface-2 border border-hairline rounded-sm font-mono tabular-nums text-sm px-3 py-2 outline-none focus:border-clay text-ink"
          />
        </div>
      </div>
    </div>
  );
}
