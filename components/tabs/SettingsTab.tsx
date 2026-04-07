'use client';

import { useState } from 'react';
import { useApp } from '@/lib/store';
import { useClerk } from '@clerk/nextjs';
import { DAYS, DEFAULT_GYM_DAYS } from '@/lib/constants';
import { computeTargetsFromTDEE, dk } from '@/lib/utils';
import { toast } from '../shared/Toast';

export default function SettingsTab() {
  const { settings, saveSettings, dayCache, getWeightLog, deleteAllData } = useApp();
  const { signOut } = useClerk();
  const s = settings;

  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showDeleteZone, setShowDeleteZone] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [name,      setName]      = useState(s?.name ?? '');
  const [weight,    setWeight]    = useState(s?.weight_start ?? 80);
  const [height,    setHeight]    = useState(s?.height ?? 175);
  const [startDate,    setStartDate]    = useState(s?.startDate ?? dk(new Date()));
  const [programWeeks, setProgramWeeks] = useState(s?.programWeeks ?? 16);
  const [gymDays,   setGymDays]   = useState<string[]>(s?.gymDays ?? DEFAULT_GYM_DAYS);
  const [calsGym,   setCalsGym]   = useState(s?.cals_gym ?? 2100);
  const [calsRest,  setCalsRest]  = useState(s?.cals_rest ?? 1850);
  const [protein,   setProtein]   = useState(s?.protein ?? 155);
  const [fat,       setFat]       = useState(s?.fat ?? 70);

  const dayLabels = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  function toggleGymDay(day: string) {
    setGymDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  }

  function recalcTDEE() {
    const t = computeTargetsFromTDEE(weight, height);
    setCalsGym(t.cals_gym); setCalsRest(t.cals_rest); setProtein(t.protein); setFat(t.fat);
    toast('Targets recalculated from TDEE');
  }

  async function save() {
    if (gymDays.length === 0) { toast('Select at least 1 gym day'); return; }
    await saveSettings({ name, weight_start: weight, height, startDate, gymDays, cals_gym: calsGym, cals_rest: calsRest, protein, fat, onboarded: true, programWeeks });
    toast('Settings saved ✓');
  }

  async function handleDeleteAll() {
    if (deleteConfirm !== 'DELETE') return;
    setDeleting(true);
    try {
      await deleteAllData();
      await signOut();
    } catch {
      toast('Delete failed — try again');
      setDeleting(false);
    }
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ settings, dayCache, weights: getWeightLog() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `fittrack-export-${dk(new Date())}.json`; a.click();
  }

  return (
    <div>
      {/* Profile */}
      <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
        <div className="text-[13px] font-black uppercase tracking-widest text-text2 mb-4">Profile</div>
        <div className="mb-3">
          <div className="text-[10px] text-text3 uppercase font-bold mb-1.5">Name</div>
          <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-bg3 border border-border rounded-lg text-sm px-3 py-2.5 outline-none focus:border-accent text-text1" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] text-text3 uppercase font-bold mb-1.5">Bodyweight (kg)</div>
            <input type="number" inputMode="decimal" step="0.1" value={weight} onChange={e => setWeight(+e.target.value)} className="w-full bg-bg3 border border-border rounded-lg text-sm px-3 py-2.5 outline-none focus:border-accent text-text1" />
          </div>
          <div>
            <div className="text-[10px] text-text3 uppercase font-bold mb-1.5">Height (cm)</div>
            <input type="number" inputMode="numeric" value={height} onChange={e => setHeight(+e.target.value)} className="w-full bg-bg3 border border-border rounded-lg text-sm px-3 py-2.5 outline-none focus:border-accent text-text1" />
          </div>
        </div>
      </div>

      {/* Program */}
      <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
        <div className="text-[13px] font-black uppercase tracking-widest text-text2 mb-4">Program</div>
        <div className="mb-4">
          <div className="text-[10px] text-text3 uppercase font-bold mb-1.5">Start Date</div>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-bg3 border border-border rounded-lg text-sm px-3 py-2.5 outline-none focus:border-accent text-text1" />
        </div>
        <div className="mb-4">
          <div className="text-[10px] text-text3 uppercase font-bold mb-2">Program Length</div>
          <div className="flex gap-1.5">
            {[8, 10, 12, 16, 20].map(w => (
              <button key={w} onClick={() => setProgramWeeks(w)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                  programWeeks === w ? 'bg-accent/10 border-accent/35 text-accent' : 'bg-bg3 border-border text-text3'
                }`}>
                {w}w
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-text3 uppercase font-bold mb-2">Gym Days</div>
          <div className="grid grid-cols-7 gap-1.5">
            {DAYS.map((day, i) => (
              <button key={day} onClick={() => toggleGymDay(day)}
                className={`py-2.5 rounded-lg text-[10px] font-bold uppercase transition-all border ${
                  gymDays.includes(day) ? 'bg-accent/10 border-accent/35 text-accent' : 'bg-bg3 border-border text-text3'
                }`}>
                {dayLabels[i]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Nutrition */}
      <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[13px] font-black uppercase tracking-widest text-text2">Nutrition Targets</div>
          <button onClick={recalcTDEE} className="text-xs font-bold px-3 py-1.5 bg-bg3 border border-border rounded-lg text-text2">Recalc TDEE</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label:'Gym Day kcal', val:calsGym,  set:setCalsGym  },
            { label:'Rest Day kcal',val:calsRest, set:setCalsRest },
            { label:'Protein (g)',  val:protein,  set:setProtein  },
            { label:'Fat (g)',      val:fat,       set:setFat      },
          ].map(({ label, val, set }) => (
            <div key={label}>
              <div className="text-[10px] text-text3 uppercase font-bold mb-1.5">{label}</div>
              <input type="number" inputMode="numeric" value={val} onChange={e => set(+e.target.value)} className="w-full bg-bg3 border border-border rounded-lg text-sm px-3 py-2.5 outline-none focus:border-accent text-text1" />
            </div>
          ))}
        </div>
      </div>

      <button onClick={save} className="w-full py-3.5 bg-gradient-to-r from-accent to-green-400 text-black font-bold rounded-card text-sm mb-3">
        Save Settings
      </button>

      {/* Data */}
      <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
        <div className="text-[13px] font-black uppercase tracking-widest text-text2 mb-3">Data</div>
        <div className="flex items-center justify-between py-2.5 border-b border-border">
          <div>
            <div className="text-sm text-text2">Export my data</div>
            <div className="text-xs text-text3">Download all logs as JSON</div>
          </div>
          <button onClick={exportData} className="text-xs font-bold px-3 py-1.5 bg-bg3 border border-border rounded-lg text-text2">Export</button>
        </div>
        <div className="flex items-center justify-between py-2.5">
          <div>
            <div className="text-sm text-text2">Plan</div>
            <div className="text-xs text-text3">{s?.plan === 'pro' ? 'Pro — all features unlocked' : 'Free — upgrade coming soon'}</div>
          </div>
          <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg border ${s?.plan === 'pro' ? 'bg-warn/10 border-warn/30 text-warn' : 'bg-bg3 border-border text-text3'}`}>
            {s?.plan?.toUpperCase() ?? 'FREE'}
          </span>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-bg1 border border-red-500/20 rounded-card p-4 mb-3">
        <div className="text-[13px] font-black uppercase tracking-widest text-red-400 mb-3">Danger Zone</div>

        {!showDeleteZone ? (
          <div className="flex items-center justify-between py-1">
            <div>
              <div className="text-sm text-text2">Delete all my data</div>
              <div className="text-xs text-text3">Permanently removes all workouts, nutrition, weight logs, and photos</div>
            </div>
            <button
              onClick={() => setShowDeleteZone(true)}
              className="text-xs font-bold px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 ml-3 shrink-0"
            >
              Delete
            </button>
          </div>
        ) : (
          <div>
            <div className="text-xs text-text3 mb-3 leading-relaxed">
              This will permanently delete all your workouts, meals, weight entries, progress photos, and settings. This cannot be undone.
            </div>
            <div className="text-[10px] text-text3 uppercase font-bold mb-1.5">
              Type <span className="text-red-400">DELETE</span> to confirm
            </div>
            <input
              type="text"
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              className="w-full bg-bg3 border border-red-500/30 rounded-lg text-sm px-3 py-2.5 outline-none focus:border-red-500 text-text1 mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowDeleteZone(false); setDeleteConfirm(''); }}
                className="flex-1 py-2.5 bg-bg3 border border-border rounded-lg text-sm font-bold text-text2"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAll}
                disabled={deleteConfirm !== 'DELETE' || deleting}
                className="flex-1 py-2.5 bg-red-500/10 border border-red-500/40 rounded-lg text-sm font-bold text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
              >
                {deleting ? 'Deleting...' : 'Delete Everything'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="text-center text-[11px] text-text3 pb-4">FitTrack v1.6</div>
    </div>
  );
}
