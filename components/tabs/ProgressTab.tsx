'use client';

import { useState, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { useApp } from '@/lib/store';
import { getWeekNum, calcConsistency, dk } from '@/lib/utils';
import { fmtShort } from '@/lib/utils';
import StreakCard from '../streaks/StreakCard';
import PhotoGrid from '../progress/PhotoGrid';
import ShareCard from '../progress/ShareCard';
import PRTimeline from '../progress/PRTimeline';
import type { MeasurementEntry, RecoveryData } from '@/lib/types';

Chart.register(...registerables);

export default function ProgressTab() {
  const { settings, dayCache, getWeightLog, saveWeightLog, saveSettings } = useApp();
  const [showWForm,   setShowWForm]   = useState(false);
  const [showMForm,   setShowMForm]   = useState(false);
  const [wDate,       setWDate]       = useState(dk(new Date()));
  const [wVal,        setWVal]        = useState('');
  const [mForm,       setMForm]       = useState<Omit<MeasurementEntry,'date'>>({});
  const [mDate,       setMDate]       = useState(dk(new Date()));
  const wChartRef = useRef<HTMLCanvasElement>(null);
  const mChartRef = useRef<HTMLCanvasElement>(null);
  const wChart = useRef<Chart | null>(null);
  const mChart = useRef<Chart | null>(null);

  const wlog        = getWeightLog();
  const s           = settings;
  const startW      = wlog[0]?.weight ?? s?.weight_start ?? 80;
  const curW        = wlog[wlog.length-1]?.weight ?? startW;
  const lost        = +(startW - curW).toFixed(1);
  const hM          = (s?.height ?? 175) / 100;
  const bmi         = +(curW / (hM * hM)).toFixed(1);
  const weekNum     = getWeekNum(settings);
  const cons        = calcConsistency(settings, dayCache);
  const mlog        = (settings?.measurements ?? []).slice().sort((a,b) => a.date.localeCompare(b.date));

  // Recovery trends — last 14 days with any recovery data
  const recoveryDays = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const dateStr = dk(d);
    const rec: RecoveryData = dayCache[dateStr]?.recovery ?? {};
    return { date: dateStr, label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2), ...rec };
  });
  const hasRecovery = recoveryDays.some(d => d.energy != null || d.sleep_quality != null);
  const mLatest     = mlog[mlog.length-1];
  const mFirst      = mlog[0];
  const mFields     = [['Waist','waist'],['Chest','chest'],['L.Arm','leftArm'],['R.Arm','rightArm'],['Hips','hips']] as const;

  // Workout done count
  let doneCount = 0;
  const gymDays = settings?.gymDays ?? [];
  const d = new Date(settings ? settings.startDate + 'T00:00:00' : new Date());
  const now = new Date();
  while (d <= now) {
    const n = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][d.getDay()];
    if (gymDays.includes(n)) {
      const data = dayCache[dk(d)] ?? { wo:{}, check:{}, meals:[], notes:'' };
      if (Object.values(data.wo).some(e => e?.sets?.some(s => s?.done))) doneCount++;
    }
    d.setDate(d.getDate() + 1);
  }

  // Weight chart
  useEffect(() => {
    if (!wChartRef.current || wlog.length === 0) return;
    wChart.current?.destroy();
    wChart.current = new Chart(wChartRef.current, {
      type: 'line',
      data: {
        labels: wlog.map(e => fmtShort(e.date)),
        datasets: [{ data: wlog.map(e => e.weight), borderColor:'#B84B3A', backgroundColor:'rgba(184,75,58,0.07)', borderWidth:2, pointBackgroundColor:'#B84B3A', pointBorderColor:'#F5F1E8', pointBorderWidth:2, pointRadius:5, tension:0.3, fill:true }],
      },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{ backgroundColor:'#FFFDF7', titleColor:'#121110', bodyColor:'#121110', borderColor:'#E0D8C6', borderWidth:1, callbacks:{ label:c => c.raw + ' kg' } } }, scales:{ x:{grid:{color:'rgba(224,216,198,0.5)'}, ticks:{color:'#8F877A',font:{size:11}}}, y:{grid:{color:'rgba(224,216,198,0.5)'}, ticks:{color:'#8F877A',font:{size:11}, callback:v => v+' kg'}, min: Math.max(0, Math.min(...wlog.map(e=>e.weight))-2)} } },
    });
    return () => { wChart.current?.destroy(); };
  }, [wlog.length]);

  // Measurements chart
  useEffect(() => {
    if (!mChartRef.current || mlog.length < 2) return;
    mChart.current?.destroy();
    const colors: Record<string, string> = { waist:'#B84B3A', chest:'#121110', leftArm:'#5A7A3C', rightArm:'#8F877A', hips:'#C68B1E' };
    const labels2: Record<string, string> = { waist:'Waist', chest:'Chest', leftArm:'L.Arm', rightArm:'R.Arm', hips:'Hips' };
    const datasets = Object.entries(colors).filter(([k]) => mlog.some(m => m[k as keyof typeof mForm] != null)).map(([k, color]) => ({
      label: labels2[k], data: mlog.map(m => m[k as keyof typeof mForm] ?? null),
      borderColor:color, backgroundColor:'transparent', borderWidth:2, pointBackgroundColor:color, pointBorderColor:'#F5F1E8', pointBorderWidth:2, pointRadius:4, tension:0.3, spanGaps:true,
    }));
    mChart.current = new Chart(mChartRef.current, { type:'line', data:{ labels:mlog.map(m => fmtShort(m.date)), datasets }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:true, labels:{ color:'#8F877A', font:{size:10}, boxWidth:10 } }, tooltip:{ backgroundColor:'#FFFDF7', titleColor:'#121110', bodyColor:'#121110', borderColor:'#E0D8C6', borderWidth:1, callbacks:{ label:c => c.dataset.label+': '+c.raw+' cm' } } }, scales:{ x:{grid:{color:'rgba(224,216,198,0.5)'}, ticks:{color:'#8F877A',font:{size:10}}}, y:{grid:{color:'rgba(224,216,198,0.5)'}, ticks:{color:'#8F877A',font:{size:10}, callback:v=>v+'cm'}} } } });
    return () => { mChart.current?.destroy(); };
  }, [mlog.length]);

  async function logWeight() {
    const w = parseFloat(wVal);
    if (!wDate || isNaN(w)) return;
    const log = [...wlog];
    const idx = log.findIndex(e => e.date === wDate);
    if (idx >= 0) log[idx].weight = w; else { log.push({ date:wDate, weight:w }); log.sort((a,b)=>a.date.localeCompare(b.date)); }
    await saveWeightLog(log);
    setShowWForm(false); setWVal('');
  }

  async function logMeasurement() {
    const measurements = [...(settings?.measurements ?? [])];
    const entry: MeasurementEntry = { date: mDate, ...mForm };
    const idx = measurements.findIndex(m => m.date === mDate);
    if (idx >= 0) measurements[idx] = entry; else { measurements.push(entry); measurements.sort((a,b)=>a.date.localeCompare(b.date)); }
    await saveSettings({ measurements });
    setShowMForm(false); setMForm({});
  }

  const consColor = cons.pct >= 80 ? 'text-sage' : cons.pct >= 60 ? 'text-mustard' : 'text-clay';
  const consFill  = cons.pct >= 80 ? 'bg-sage' : cons.pct >= 60 ? 'bg-mustard' : 'bg-clay';

  return (
    <div>
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2.5 mb-3">
        {[
          { val: `${curW} kg`,  label:'Current Weight', color:'text-clay' },
          { val: `${lost >= 0 ? '−' : '+'}${Math.abs(lost)} kg`, label:'Lost So Far', color: lost >= 0 ? 'text-clay' : 'text-clay' },
          { val: String(doneCount), label:'Workouts Done', color:'text-clay' },
          { val: String(bmi),   label:'BMI', color:'text-ink' },
        ].map(({ val, label, color }) => (
          <div key={label} className="bg-surface border border-hairline rounded-card p-4 text-center">
            <div className={`font-sans text-3xl font-black ${color}`}>{val}</div>
            <div className="text-[10px] text-ink-3 uppercase tracking-wider font-bold mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Consistency */}
      <div className="bg-surface border border-hairline rounded-card p-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[13px] font-black uppercase tracking-widest text-ink-2">Consistency (28 Days)</div>
          <div className={`font-sans text-3xl font-black ${consColor}`}>{cons.pct}%</div>
        </div>
        <div className="text-xs text-ink-3 mb-2">{cons.completed} of {cons.scheduled} sessions</div>
        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${consFill} transition-all duration-700`} style={{ width: `${cons.pct}%` }} />
        </div>
        <div className="text-[11px] text-ink-3 mt-2">
          {cons.pct >= 80 ? 'Great work — keep the streak alive.' : cons.pct >= 60 ? 'Solid — try to hit every session this week.' : 'Focus on showing up. Even a partial workout counts.'}
        </div>
      </div>

      {/* Weight chart */}
      <div className="bg-surface border border-hairline rounded-card p-4 mb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-black uppercase tracking-widest text-ink-2">Weight Progress</div>
          <button onClick={() => setShowWForm(v => !v)} className="text-xs font-bold px-3 py-1.5 bg-surface-2 border border-hairline rounded-lg text-ink-2">+ Log</button>
        </div>
        {showWForm && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div><div className="text-[10px] text-ink-3 uppercase font-bold mb-1">Date</div><input type="date" value={wDate} onChange={e=>setWDate(e.target.value)} className="w-full bg-surface-2 border border-hairline rounded-lg text-sm px-3 py-2.5 outline-none focus:border-clay text-ink" /></div>
            <div><div className="text-[10px] text-ink-3 uppercase font-bold mb-1">Weight (kg)</div><input type="number" inputMode="decimal" step="0.1" value={wVal} onChange={e=>setWVal(e.target.value)} placeholder="e.g. 82.5" className="w-full bg-surface-2 border border-hairline rounded-lg text-sm px-3 py-2.5 outline-none focus:border-clay text-ink" /></div>
            <button onClick={logWeight} className="py-2.5 bg-clay hover:bg-clay-hover text-surface font-bold rounded-lg text-sm">Save</button>
            <button onClick={() => setShowWForm(false)} className="py-2.5 bg-surface-2 border border-hairline rounded-lg text-sm font-semibold text-ink-2">Cancel</button>
          </div>
        )}
        <div className="relative h-48"><canvas ref={wChartRef} /></div>
      </div>

      {/* Body measurements */}
      <div className="bg-surface border border-hairline rounded-card p-4 mb-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[13px] font-black uppercase tracking-widest text-ink-2">Body Measurements</div>
            <div className="text-xs text-ink-3 mt-0.5">{mlog.length} {mlog.length === 1 ? 'entry' : 'entries'}</div>
          </div>
          <button onClick={() => setShowMForm(v => !v)} className="text-xs font-bold px-3 py-1.5 bg-surface-2 border border-hairline rounded-lg text-ink-2">+ Log</button>
        </div>
        {showMForm && (
          <div className="mb-4 bg-surface-2 border border-hairline rounded-sm p-3.5">
            <div><div className="text-[10px] text-ink-3 uppercase font-bold mb-1">Date</div><input type="date" value={mDate} onChange={e=>setMDate(e.target.value)} className="w-full bg-surface-2 border border-hairline rounded-lg text-sm px-3 py-2.5 mb-2 outline-none focus:border-clay text-ink" /></div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {mFields.map(([label, key]) => (
                <div key={key}><div className="text-[10px] text-ink-3 uppercase font-bold mb-1">{label} (cm)</div>
                <input type="number" inputMode="decimal" step="0.1" placeholder="e.g. 85" value={mForm[key] ?? ''} onChange={e => setMForm(p => ({ ...p, [key]: parseFloat(e.target.value) || undefined }))} className="w-full bg-surface-2 border border-hairline rounded-lg text-sm px-3 py-2 outline-none focus:border-clay text-ink" /></div>
              ))}
            </div>
            <div className="flex gap-2"><button onClick={logMeasurement} className="flex-1 py-2.5 bg-clay hover:bg-clay-hover text-surface font-bold rounded-lg text-sm">Save</button><button onClick={() => setShowMForm(false)} className="flex-[0.6] py-2.5 bg-surface-2 border border-hairline rounded-lg text-sm font-semibold text-ink-2">Cancel</button></div>
          </div>
        )}
        {mLatest ? (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {mFields.map(([label, key]) => {
                const val = mLatest[key]; const fval = mFirst?.[key];
                const delta = val && fval && val !== fval ? +(val - fval).toFixed(1) : null;
                return (
                  <div key={key} className="bg-surface-2 border border-hairline rounded-sm p-2.5 text-center">
                    <div className="font-sans text-xl font-black text-ink-2">{val ?? '—'}</div>
                    <div className="text-[10px] text-ink-3 uppercase tracking-wider font-bold mt-0.5">{label}</div>
                    {delta !== null && <div className={`text-[11px] font-bold mt-0.5 ${delta < 0 ? 'text-clay' : 'text-clay'}`}>{delta > 0 ? '+' : ''}{delta}cm</div>}
                  </div>
                );
              })}
            </div>
            {mlog.length > 1 && <div className="relative h-48"><canvas ref={mChartRef} /></div>}
          </>
        ) : (
          <div className="text-center py-8 text-ink-3 text-sm">No measurements yet — tap + Log to start</div>
        )}
      </div>

      {/* PRs with timeline */}
      <PRTimeline settings={settings} dayCache={dayCache} />

      <StreakCard />

      {/* Recovery trends */}
      {hasRecovery && (
        <div className="bg-surface border border-hairline rounded-card p-4 mb-3">
          <div className="text-[13px] font-black uppercase tracking-widest text-ink-2 mb-3">Recovery Trends (14 days)</div>
          <div className="flex items-end gap-1 h-20 mb-2">
            {recoveryDays.map(d => {
              const e = d.energy ?? 0;
              const sq = d.sleep_quality ?? 0;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5">
                  {e > 0 && (
                    <div
                      className="w-full rounded-t-sm bg-clay/70"
                      style={{ height: `${(e / 5) * 64}px` }}
                      title={`Energy: ${e}/5`}
                    />
                  )}
                  {sq > 0 && e === 0 && (
                    <div
                      className="w-full rounded-t-sm bg-ink-2/50"
                      style={{ height: `${(sq / 5) * 64}px` }}
                      title={`Sleep: ${sq}/5`}
                    />
                  )}
                  {e === 0 && sq === 0 && (
                    <div className="w-full h-1 bg-surface-2 rounded" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-1 mb-2">
            {recoveryDays.map(d => (
              <div key={d.date} className="flex-1 text-center text-[9px] text-ink-3">{d.label}</div>
            ))}
          </div>
          <div className="flex gap-3 text-[10px] text-ink-3">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-clay/70 inline-block" />Energy</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-ink-2/50 inline-block" />Sleep quality</span>
          </div>
          {/* Soreness dots */}
          {recoveryDays.some(d => d.soreness != null) && (
            <div className="mt-3 pt-3 border-t border-hairline">
              <div className="text-[10px] text-ink-3 uppercase font-bold mb-1.5">Soreness (14 days)</div>
              <div className="flex gap-1">
                {recoveryDays.map(d => {
                  const s = d.soreness ?? 0;
                  const color = s === 0 ? 'bg-surface-2' : s <= 2 ? 'bg-clay/60' : s <= 3 ? 'bg-mustard/50' : 'bg-clay/50';
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                      <div className={`w-3 h-3 rounded-full ${color}`} title={s > 0 ? `Soreness: ${s}/5` : 'No data'} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <ShareCard />

      <PhotoGrid />

      {/* Overload rules */}
      <div className="bg-surface border border-hairline rounded-card p-4 mb-3">
        <div className="text-[13px] font-black uppercase tracking-widest text-ink-2 mb-3">Progressive Overload Rules</div>
        {[
          ['Hit top of rep range for ALL sets → add 2.5 kg next session', 'bg-sage'],
          ['Fail the bottom of rep range → drop 2.5 kg and rebuild',      'bg-clay'],
          ['Week 1: Film squat + deadlift. Fix form before adding load',   'bg-ink-2'],
          ['RPE 7 = 3 reps in the tank. No grinding this week',            'bg-mustard'],
        ].map(([txt, dot]) => (
          <div key={txt} className="flex items-start gap-3 py-2.5 border-b border-hairline last:border-0">
            <div className={`w-2 h-2 rounded-full ${dot} flex-shrink-0 mt-1.5`} />
            <span className="text-[13px] text-ink-2 leading-snug">{txt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
