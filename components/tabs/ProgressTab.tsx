'use client';

import { useState } from 'react';
import { useApp } from '@/lib/store';
import { getWeekNum, dk, fmtShort, getWorkoutMap, computePRs } from '@/lib/utils';
import StreakCard from '../streaks/StreakCard';
import PhotoGrid from '../progress/PhotoGrid';
import ShareCard from '../progress/ShareCard';
import PRTimeline from '../progress/PRTimeline';
import type { MeasurementEntry } from '@/lib/types';

type Period = '4W' | '12W' | '1Y' | 'All';

const WEEK_DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;

function getLiftHistory(exerciseId: string, dayCache: Record<string, any>, count = 8): number[] {
  const entries = Object.entries(dayCache)
    .filter(([, d]) => d.wo?.[exerciseId]?.sets?.some((s: any) => s?.done && s?.weight))
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-count);
  return entries.map(([, d]) => {
    const done = (d.wo?.[exerciseId]?.sets ?? []).filter((s: any) => s?.done && s?.weight);
    return Math.max(0, ...done.map((s: any) => s?.weight ?? 0));
  });
}

function Sparkline({ data, color = '#22c55e' }: { data: number[]; color?: string }) {
  if (data.length < 2) return <div className="h-7 flex items-end"><div className="w-full h-px bg-bg3" /></div>;
  const w = 80, h = 30;
  const min = Math.min(...data), max = Math.max(...data);
  const span = Math.max(max - min, 0.5);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 3 - ((v - min) / span) * (h - 6)}`).join(' ');
  const up = data[data.length - 1] >= data[0];
  return (
    <svg width="100%" height="30" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={up ? color : '#ef4444'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ProgressTab() {
  const { settings, dayCache, getWeightLog, saveWeightLog, saveSettings } = useApp();
  const [period,     setPeriod]     = useState<Period>('12W');
  const [showWForm,  setShowWForm]  = useState(false);
  const [showMForm,  setShowMForm]  = useState(false);
  const [wDate,      setWDate]      = useState(dk(new Date()));
  const [wVal,       setWVal]       = useState('');
  const [mForm,      setMForm]      = useState<Omit<MeasurementEntry,'date'>>({});
  const [mDate,      setMDate]      = useState(dk(new Date()));
  const [selDay,     setSelDay]     = useState(5);

  const wlog      = getWeightLog();
  const s         = settings;
  const weekNum   = getWeekNum(settings);
  const totalWeeks = s?.programWeeks ?? 16;
  const prs       = computePRs(dayCache);
  const mlog      = (settings?.measurements ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const mLatest   = mlog[mlog.length - 1];
  const mFirst    = mlog[0];

  // ── Volume bars (this week, Mon→Sun) ──────────────────────────────────────
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
  const volumeDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = dk(d);
    const data = dayCache[dateStr] ?? {};
    const sets = Object.values(data.wo ?? {}).reduce((sum: number, e: any) =>
      sum + (e?.sets?.filter((s: any) => s?.done).length ?? 0), 0);
    const dayName = WEEK_DAYS[d.getDay()];
    const workoutName = getWorkoutMap(settings)?.[dayName]?.name ?? 'Rest';
    return {
      d: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1).toUpperCase(),
      sets: sets as number,
      name: workoutName,
      isToday: dateStr === dk(today),
    };
  });
  const totalSets = volumeDays.reduce((a, b) => a + b.sets, 0);
  const maxSets = Math.max(...volumeDays.map(d => d.sets), 1);
  const active = volumeDays[selDay];

  // ── Body weight SVG chart ─────────────────────────────────────────────────
  const periodDays = period === '4W' ? 28 : period === '12W' ? 84 : period === '1Y' ? 365 : 9999;
  const cutoff = new Date(today); cutoff.setDate(today.getDate() - periodDays);
  const filteredW = wlog.filter(e => period === 'All' || new Date(e.date) >= cutoff);
  const goalW = s?.weight_start ? +(s.weight_start - 5).toFixed(1) : null;
  const curW  = filteredW[filteredW.length - 1]?.weight ?? wlog[wlog.length - 1]?.weight ?? (s?.weight_start ?? 80);
  const firstW = filteredW[0]?.weight ?? curW;
  const delta = +(curW - firstW).toFixed(1);

  function BodyWeightChart() {
    if (filteredW.length < 2) return (
      <div className="h-24 flex items-center justify-center text-xs text-text3">Log at least 2 weight entries to see a chart</div>
    );
    const vbW = 300, vbH = 90, pad = 6;
    const weights = filteredW.map(e => e.weight);
    const allMin = Math.min(...weights, ...(goalW ? [goalW] : [])) - 0.3;
    const allMax = Math.max(...weights) + 0.3;
    const x = (i: number) => (i / (weights.length - 1)) * (vbW - 12) + 6;
    const y = (v: number) => vbH - pad - ((v - allMin) / (allMax - allMin)) * (vbH - pad * 2);
    const pts = weights.map((w, i) => `${x(i)},${y(w)}`).join(' ');
    const area = `${x(0)},${vbH} ${pts} ${x(weights.length - 1)},${vbH}`;
    const trendColor = delta <= 0 ? '#22c55e' : '#ef4444';
    return (
      <svg width="100%" height="90" viewBox={`0 0 ${vbW} ${vbH}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="bw-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={trendColor} stopOpacity=".2" />
            <stop offset="100%" stopColor={trendColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {goalW && (
          <line x1="0" x2={vbW} y1={y(goalW)} y2={y(goalW)}
            stroke="rgba(167,139,250,.4)" strokeWidth="1" strokeDasharray="3 3" />
        )}
        <polygon points={area} fill="url(#bw-area)" />
        <polyline points={pts} fill="none" stroke={trendColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(weights.length - 1)} cy={y(curW)} r="3.5" fill={trendColor} stroke="#0e1117" strokeWidth="2" />
      </svg>
    );
  }

  // ── Consistency heatmap (12 weeks) ────────────────────────────────────────
  const heatWeeks = Array.from({ length: 12 }, (_, wi) => {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - ((dayOfWeek + 6) % 7) - (11 - wi) * 7);
    return Array.from({ length: 7 }, (_, di) => {
      const d = new Date(weekStart); d.setDate(weekStart.getDate() + di);
      const dateStr = dk(d);
      const data = dayCache[dateStr] ?? {};
      const sets = Object.values(data.wo ?? {}).reduce((sum: number, e: any) =>
        sum + (e?.sets?.filter((s: any) => s?.done).length ?? 0), 0) as number;
      if (sets === 0) return 0;
      if (sets < 8)  return 1;
      if (sets < 16) return 2;
      return 3;
    });
  });
  const heatColors = ['#1e2532', 'rgba(34,197,94,.25)', 'rgba(34,197,94,.55)', '#22c55e'];
  const totalSessions = heatWeeks.flat().filter(v => v > 0).length;

  // ── Key lifts ─────────────────────────────────────────────────────────────
  const KEY_LIFTS = [
    { id: 'bench',    name: 'Bench' },
    { id: 'squat',    name: 'Squat' },
    { id: 'deadlift', name: 'Deadlift' },
    { id: 'shoulder', name: 'OHP' },
  ];

  // ── Workout done count ────────────────────────────────────────────────────
  let doneCount = 0;
  const gymDays = settings?.gymDays ?? [];
  const d0 = new Date(settings ? settings.startDate + 'T00:00:00' : new Date());
  const now = new Date();
  while (d0 <= now) {
    const n = WEEK_DAYS[d0.getDay()];
    if (gymDays.includes(n)) {
      const data = dayCache[dk(d0)] ?? {};
      if (Object.values(data.wo ?? {}).some((e: any) => e?.sets?.some((s: any) => s?.done))) doneCount++;
    }
    d0.setDate(d0.getDate() + 1);
  }

  async function logWeight() {
    const w = parseFloat(wVal);
    if (!wDate || isNaN(w)) return;
    const log = [...wlog];
    const idx = log.findIndex(e => e.date === wDate);
    if (idx >= 0) log[idx].weight = w; else { log.push({ date: wDate, weight: w }); log.sort((a, b) => a.date.localeCompare(b.date)); }
    await saveWeightLog(log);
    setShowWForm(false); setWVal('');
  }

  async function logMeasurement() {
    const measurements = [...(settings?.measurements ?? [])];
    const entry: MeasurementEntry = { date: mDate, ...mForm };
    const idx = measurements.findIndex(m => m.date === mDate);
    if (idx >= 0) measurements[idx] = entry; else { measurements.push(entry); measurements.sort((a, b) => a.date.localeCompare(b.date)); }
    await saveSettings({ measurements });
    setShowMForm(false); setMForm({});
  }

  const mFields = [['Waist','waist'],['Chest','chest'],['L.Arm','leftArm'],['R.Arm','rightArm'],['Hips','hips']] as const;

  return (
    <div>
      {/* Header + period toggle */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-condensed text-[28px] font-black text-text1 leading-none" style={{ letterSpacing: '-.01em' }}>Stats</div>
          <div className="text-[11px] text-text3 mt-1">Wk {weekNum} of {totalWeeks} · Foundation block</div>
        </div>
        <div className="flex bg-bg1 border border-border rounded-sm p-0.5 gap-0.5">
          {(['4W','12W','1Y','All'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className="font-sans font-bold text-[11px] tracking-wide px-2.5 py-1.5 rounded-sm cursor-pointer border transition-all"
              style={{
                background: period === p ? 'rgba(249,115,22,.15)' : 'transparent',
                borderColor: period === p ? 'rgba(249,115,22,.25)' : 'transparent',
                color: period === p ? '#f97316' : '#64748b',
              }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Weekly training load */}
      <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="font-sans text-[10px] font-black uppercase tracking-widest text-text3">Training Load · This Week</div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="font-condensed font-black text-[36px] text-energy leading-none tabular-nums">{totalSets}</span>
              <span className="text-xs text-text3">sets</span>
            </div>
          </div>
          {totalSets > 0 && (
            <span className="font-sans text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.22)', color: '#22c55e' }}>
              This week
            </span>
          )}
        </div>
        <div className="grid grid-cols-7 gap-1.5 items-end h-24">
          {volumeDays.map((day, i) => {
            const h = day.sets ? Math.max(6, (day.sets / maxSets) * 80) : 4;
            const isSel = i === selDay;
            return (
              <button key={i} onClick={() => setSelDay(i)} className="flex flex-col items-center gap-1.5 h-full justify-end p-0 border-none bg-transparent cursor-pointer">
                <div className="w-full rounded-sm" style={{
                  height: h,
                  background: day.sets
                    ? (isSel ? 'linear-gradient(180deg,#f97316,#fb923c)' : 'rgba(249,115,22,.25)')
                    : (day.isToday ? 'repeating-linear-gradient(45deg,#232b38,#232b38 3px,transparent 3px,transparent 6px)' : '#1e2532'),
                  border: day.isToday && !day.sets ? '1px dashed #334155' : 'none',
                  transition: 'background .15s',
                }} />
                <span className="text-[10px] font-bold" style={{ color: isSel ? '#f97316' : day.isToday ? '#94a3b8' : '#64748b' }}>{day.d}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 p-2.5 bg-bg2 border border-border rounded-sm flex justify-between items-center">
          <div>
            <div className="text-xs text-text2">{active?.name ?? 'Rest'}</div>
            <div className="text-[10px] text-text3 mt-0.5">
              {active?.sets ? `${active.sets} sets` : active?.isToday ? 'Workout scheduled' : 'Recovery day'}
            </div>
          </div>
        </div>
      </div>

      {/* Body weight */}
      <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="font-sans text-[10px] font-black uppercase tracking-widest text-text3">Body Weight</div>
          <button onClick={() => setShowWForm(v => !v)} className="text-xs font-bold px-3 py-1.5 bg-bg2 border border-border rounded-sm text-text2 cursor-pointer">+ Log</button>
        </div>
        {showWForm && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] text-text3 uppercase font-bold mb-1">Date</div>
              <input type="date" value={wDate} onChange={e => setWDate(e.target.value)} className="w-full bg-bg3 border border-border rounded-sm text-sm px-3 py-2.5 outline-none focus:border-accent text-text1" />
            </div>
            <div>
              <div className="text-[10px] text-text3 uppercase font-bold mb-1">Weight (kg)</div>
              <input type="number" inputMode="decimal" step="0.1" value={wVal} onChange={e => setWVal(e.target.value)} placeholder="e.g. 82.5" className="w-full bg-bg3 border border-border rounded-sm text-sm px-3 py-2.5 outline-none focus:border-accent text-text1 placeholder:text-text3" />
            </div>
            <button onClick={logWeight} className="py-2.5 text-black font-bold rounded-sm text-sm cursor-pointer" style={{ background: 'linear-gradient(135deg,#22c55e,#4ade80)' }}>Save</button>
            <button onClick={() => setShowWForm(false)} className="py-2.5 bg-bg2 border border-border rounded-sm text-sm font-semibold text-text2 cursor-pointer">Cancel</button>
          </div>
        )}
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-condensed font-black text-[40px] text-text1 leading-none tabular-nums">{curW}</span>
          <span className="text-sm text-text3">kg</span>
          <span className={`text-xs ml-auto tabular-nums ${delta <= 0 ? 'text-accent' : 'text-danger'}`}>
            {delta > 0 ? '+' : ''}{delta} kg
          </span>
        </div>
        {goalW && <div className="text-[10px] text-text3 mb-2">Goal: <span className="text-purple">{goalW} kg</span></div>}
        <BodyWeightChart />
        {filteredW.length >= 2 && (
          <div className="flex justify-between mt-2 text-[11px] text-text3">
            <span>Avg <strong className="text-text1 font-medium tabular-nums">{(filteredW.reduce((a, b) => a + b.weight, 0) / filteredW.length).toFixed(1)}</strong></span>
            <span>Range <strong className="text-text1 font-medium tabular-nums">{Math.min(...filteredW.map(e => e.weight))}–{Math.max(...filteredW.map(e => e.weight))}</strong></span>
            {goalW && <span>To goal <strong className="text-purple font-medium tabular-nums">{(curW - goalW).toFixed(1)}kg</strong></span>}
          </div>
        )}
      </div>

      {/* Consistency heatmap */}
      <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
        <div className="flex justify-between items-baseline mb-3">
          <div className="font-sans text-[10px] font-black uppercase tracking-widest text-text3">Consistency · 12 weeks</div>
          <span className="text-[11px] text-text3"><strong className="text-accent font-medium">{totalSessions}</strong> sessions</span>
        </div>
        <div className="flex gap-2">
          <div className="flex flex-col justify-between text-[9px] text-text3 py-0.5" style={{ gap: '6px' }}>
            {['M','W','F','S'].map(l => <span key={l}>{l}</span>)}
          </div>
          <div className="grid flex-1 gap-0.5" style={{ gridTemplateColumns: 'repeat(12,1fr)' }}>
            {heatWeeks.map((wk, i) => (
              <div key={i} className="grid gap-0.5" style={{ gridTemplateRows: 'repeat(7,1fr)' }}>
                {wk.map((v, j) => (
                  <div key={j} className="rounded-[2px]" style={{ aspectRatio: '1', background: heatColors[v], border: v === 0 ? '1px solid rgba(255,255,255,.02)' : 'none' }} />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-[10px] text-text3 tracking-wide">12 WEEKS AGO</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-text3">Less</span>
            {heatColors.map((c, i) => <div key={i} className="w-2.5 h-2.5 rounded-[2px]" style={{ background: c }} />)}
            <span className="text-[10px] text-text3">More</span>
          </div>
        </div>
      </div>

      {/* Key lifts */}
      <div className="flex justify-between items-baseline mb-2">
        <div className="font-sans text-[10px] font-black uppercase tracking-widest text-text3">Key Lifts</div>
        <span className="text-[11px] text-text3">Top set history</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 mb-3">
        {KEY_LIFTS.map(lift => {
          const history = getLiftHistory(lift.id, dayCache);
          const val = prs[lift.id]?.weight ?? (history[history.length - 1] ?? 0);
          const prev = history[history.length - 2] ?? val;
          const liftDelta = +(val - prev).toFixed(1);
          const hasPR = !!prs[lift.id];
          return (
            <div key={lift.id} className="bg-bg1 border border-border rounded-card p-3" style={{ position: 'relative', overflow: 'hidden' }}>
              {hasPR && (
                <div className="absolute top-2 right-2 text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded" style={{ color: '#f59e0b', background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)' }}>PR</div>
              )}
              <div className="text-[11px] text-text2 font-medium mb-1">{lift.name}</div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="font-condensed font-black text-[26px] text-text1 leading-none tabular-nums">{val || '—'}</span>
                {val > 0 && <span className="text-[10px] text-text3">kg</span>}
              </div>
              <Sparkline data={history} />
              <div className="flex justify-between items-center mt-1">
                <span className="text-[10px] text-text3">e1RM {prs[lift.id] ? Math.round(val * (1 + (prs[lift.id]?.reps ?? 1) / 30)) : '—'}</span>
                {liftDelta !== 0 && (
                  <span className={`text-[10px] font-bold tabular-nums ${liftDelta > 0 ? 'text-accent' : 'text-danger'}`}>
                    {liftDelta > 0 ? '↑' : '↓'} {Math.abs(liftDelta)}kg
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* PRs feed */}
      <PRTimeline settings={settings} dayCache={dayCache} />

      {/* Measurements */}
      <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-sans text-[10px] font-black uppercase tracking-widest text-text3">Measurements</div>
            <div className="text-xs text-text3 mt-0.5">{mlog.length} {mlog.length === 1 ? 'entry' : 'entries'}</div>
          </div>
          <button onClick={() => setShowMForm(v => !v)} className="text-xs font-bold px-3 py-1.5 bg-bg2 border border-border rounded-sm text-text2 cursor-pointer">+ Log</button>
        </div>
        {showMForm && (
          <div className="mb-4 bg-bg2 border border-border rounded-sm p-3.5">
            <div>
              <div className="text-[10px] text-text3 uppercase font-bold mb-1">Date</div>
              <input type="date" value={mDate} onChange={e => setMDate(e.target.value)} className="w-full bg-bg3 border border-border rounded-sm text-sm px-3 py-2.5 mb-2 outline-none focus:border-accent text-text1" />
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {mFields.map(([label, key]) => (
                <div key={key}>
                  <div className="text-[10px] text-text3 uppercase font-bold mb-1">{label} (cm)</div>
                  <input type="number" inputMode="decimal" step="0.1" placeholder="e.g. 85" value={mForm[key] ?? ''} onChange={e => setMForm(p => ({ ...p, [key]: parseFloat(e.target.value) || undefined }))} className="w-full bg-bg3 border border-border rounded-sm text-sm px-3 py-2 outline-none focus:border-accent text-text1 placeholder:text-text3" />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={logMeasurement} className="flex-1 py-2.5 text-black font-bold rounded-sm text-sm cursor-pointer" style={{ background: 'linear-gradient(135deg,#22c55e,#4ade80)' }}>Save</button>
              <button onClick={() => setShowMForm(false)} className="flex-[0.6] py-2.5 bg-bg2 border border-border rounded-sm text-sm font-semibold text-text2 cursor-pointer">Cancel</button>
            </div>
          </div>
        )}
        {mLatest ? (
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Chest', key: 'chest',   color: '#60a5fa' },
              { label: 'Arms',  key: 'leftArm', color: '#22c55e' },
              { label: 'Waist', key: 'waist',   color: '#f59e0b' },
              { label: 'Hips',  key: 'hips',    color: '#a78bfa' },
            ].map(({ label, key, color }) => {
              const mKey = key as keyof typeof mLatest;
              const val = mLatest[mKey];
              const fval = mFirst?.[mKey];
              const mDelta = val && fval && val !== fval ? +(val - fval).toFixed(1) : null;
              const goodDown = key === 'waist';
              const deltaGood = mDelta !== null ? (goodDown ? mDelta < 0 : mDelta > 0) : null;
              return (
                <div key={key} className="bg-bg2 border border-border rounded-sm p-3 text-center">
                  <div className="text-[9px] text-text3 font-bold uppercase tracking-wider">{label}</div>
                  <div className="font-condensed font-bold text-xl mt-1 tabular-nums" style={{ color }}>{val ?? '—'}</div>
                  {mDelta !== null && (
                    <div className={`text-[10px] mt-0.5 tabular-nums font-bold ${deltaGood ? 'text-accent' : 'text-danger'}`}>
                      {mDelta > 0 ? '+' : ''}{mDelta}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6 text-text3 text-sm">No measurements yet — tap + Log to start</div>
        )}
      </div>

      <StreakCard />

      <ShareCard />

      <PhotoGrid />

      {/* Overload rules */}
      <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
        <div className="font-sans text-[10px] font-black uppercase tracking-widest text-text3 mb-3">Progressive Overload Rules</div>
        {[
          ['Hit top of rep range for ALL sets → add 2.5 kg next session', '#22c55e'],
          ['Fail the bottom of rep range → drop 2.5 kg and rebuild',      '#ef4444'],
          ['Week 1: Film squat + deadlift. Fix form before adding load',   '#94a3b8'],
          ['RPE 7 = 3 reps in the tank. No grinding this week',            '#f59e0b'],
        ].map(([txt, dot]) => (
          <div key={txt} className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
            <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: dot }} />
            <span className="text-[13px] text-text2 leading-snug">{txt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
