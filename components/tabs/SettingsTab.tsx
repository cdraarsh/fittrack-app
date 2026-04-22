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

  const [deleteConfirm,  setDeleteConfirm]  = useState('');
  const [showDeleteZone, setShowDeleteZone] = useState(false);
  const [deleting,       setDeleting]       = useState(false);
  const [notifStatus, setNotifStatus] = useState<'default' | 'granted' | 'denied' | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission as 'default' | 'granted' | 'denied';
  });
  const [notifLoading, setNotifLoading] = useState(false);

  const [name,         setName]         = useState(s?.name ?? '');
  const [weight,       setWeight]       = useState(s?.weight_start ?? 80);
  const [height,       setHeight]       = useState(s?.height ?? 175);
  const [startDate,    setStartDate]    = useState(s?.startDate ?? dk(new Date()));
  const [programWeeks, setProgramWeeks] = useState(s?.programWeeks ?? 16);
  const [gymDays,      setGymDays]      = useState<string[]>(s?.gymDays ?? DEFAULT_GYM_DAYS);
  const [calsGym,      setCalsGym]      = useState(s?.cals_gym ?? 2100);
  const [calsRest,     setCalsRest]     = useState(s?.cals_rest ?? 1850);
  const [protein,      setProtein]      = useState(s?.protein ?? 155);
  const [fat,          setFat]          = useState(s?.fat ?? 70);

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

  async function enableNotifications() {
    if (notifStatus === 'unsupported') return;
    setNotifLoading(true);
    try {
      const permission = await Notification.requestPermission();
      setNotifStatus(permission as 'default' | 'granted' | 'denied');
      if (permission !== 'granted') return;
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      toast('Workout reminders enabled ✓');
    } catch (e) {
      console.error('push subscribe error:', e);
      toast('Could not enable notifications');
    } finally {
      setNotifLoading(false);
    }
  }

  async function disableNotifications() {
    setNotifLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      await sub?.unsubscribe();
      await fetch('/api/push/subscribe', { method: 'DELETE' });
      toast('Notifications disabled');
    } catch (e) {
      console.error('push unsubscribe error:', e);
    } finally {
      setNotifLoading(false);
    }
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

  const inputCls = 'w-full bg-bg3 border border-border rounded-sm text-sm px-3 py-2.5 outline-none focus:border-accent text-text1 placeholder:text-text3';
  const cardCls  = 'bg-bg1 border border-border rounded-card p-4 mb-3';
  const labelCls = 'text-[10px] text-text3 uppercase font-bold mb-1.5';

  return (
    <div>
      {/* Profile */}
      <div className={cardCls}>
        <div className="font-sans text-[10px] font-black uppercase tracking-widest text-text3 mb-4">Profile</div>
        <div className="mb-3">
          <div className={labelCls}>Name</div>
          <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className={labelCls}>Bodyweight (kg)</div>
            <input type="number" inputMode="decimal" step="0.1" value={weight} onChange={e => setWeight(+e.target.value)} className={inputCls} />
          </div>
          <div>
            <div className={labelCls}>Height (cm)</div>
            <input type="number" inputMode="numeric" value={height} onChange={e => setHeight(+e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>

      {/* Program */}
      <div className={cardCls}>
        <div className="font-sans text-[10px] font-black uppercase tracking-widest text-text3 mb-4">Program</div>
        <div className="mb-4">
          <div className={labelCls}>Start Date</div>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
        </div>
        <div className="mb-4">
          <div className={labelCls}>Program Length</div>
          <div className="flex gap-1.5">
            {[8, 10, 12, 16, 20].map(w => (
              <button key={w} onClick={() => setProgramWeeks(w)}
                className="flex-1 py-2 rounded-sm text-xs font-bold border transition-all cursor-pointer"
                style={{
                  background: programWeeks === w ? 'rgba(34,197,94,.1)' : '#161b24',
                  borderColor: programWeeks === w ? 'rgba(34,197,94,.3)' : '#232b38',
                  color: programWeeks === w ? '#22c55e' : '#64748b',
                }}>
                {w}w
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className={labelCls}>Gym Days</div>
          <div className="grid grid-cols-7 gap-1.5">
            {DAYS.map((day, i) => (
              <button key={day} onClick={() => toggleGymDay(day)}
                className="py-2.5 rounded-sm text-[10px] font-bold uppercase transition-all border cursor-pointer"
                style={{
                  background: gymDays.includes(day) ? 'rgba(34,197,94,.1)' : '#161b24',
                  borderColor: gymDays.includes(day) ? 'rgba(34,197,94,.3)' : '#232b38',
                  color: gymDays.includes(day) ? '#22c55e' : '#64748b',
                }}>
                {dayLabels[i]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Nutrition */}
      <div className={cardCls}>
        <div className="flex items-center justify-between mb-4">
          <div className="font-sans text-[10px] font-black uppercase tracking-widest text-text3">Nutrition Targets</div>
          <button onClick={recalcTDEE} className="text-xs font-bold px-3 py-1.5 bg-bg2 border border-border rounded-sm text-text2 cursor-pointer hover:bg-bg3 transition-colors">Recalc TDEE</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label:'Gym Day kcal', val:calsGym,  set:setCalsGym  },
            { label:'Rest Day kcal',val:calsRest, set:setCalsRest },
            { label:'Protein (g)',  val:protein,  set:setProtein  },
            { label:'Fat (g)',      val:fat,       set:setFat      },
          ].map(({ label, val, set }) => (
            <div key={label}>
              <div className={labelCls}>{label}</div>
              <input type="number" inputMode="numeric" value={val} onChange={e => set(+e.target.value)} className={inputCls} />
            </div>
          ))}
        </div>
      </div>

      <button onClick={save} className="w-full py-3.5 text-black font-bold rounded-card text-sm mb-3 cursor-pointer active:scale-[0.97] transition-transform" style={{ background: 'linear-gradient(135deg,#22c55e,#4ade80)' }}>
        Save Settings
      </button>

      {/* Data */}
      <div className={cardCls}>
        <div className="font-sans text-[10px] font-black uppercase tracking-widest text-text3 mb-3">Data</div>
        <div className="flex items-center justify-between py-2.5 border-b border-border">
          <div>
            <div className="text-sm text-text2">Export my data</div>
            <div className="text-xs text-text3">Download all logs as JSON</div>
          </div>
          <button onClick={exportData} className="text-xs font-bold px-3 py-1.5 bg-bg2 border border-border rounded-sm text-text2 cursor-pointer">Export</button>
        </div>
        <div className="flex items-center justify-between py-2.5">
          <div>
            <div className="text-sm text-text2">Plan</div>
            <div className="text-xs text-text3">{s?.plan === 'pro' ? 'Pro — all features unlocked' : 'Free — upgrade coming soon'}</div>
          </div>
          <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-sm border ${s?.plan === 'pro' ? 'text-warn' : 'text-text3 border-border'}`}
            style={s?.plan === 'pro' ? { background: 'rgba(245,158,11,.1)', borderColor: 'rgba(245,158,11,.3)' } : { background: '#161b24' }}>
            {s?.plan?.toUpperCase() ?? 'FREE'}
          </span>
        </div>
      </div>

      {/* Notifications */}
      <div className={cardCls}>
        <div className="font-sans text-[10px] font-black uppercase tracking-widest text-text3 mb-3">Notifications</div>
        {notifStatus === 'unsupported' ? (
          <div className="text-xs text-text3 py-2">Push notifications are not supported in this browser.</div>
        ) : notifStatus === 'denied' ? (
          <div className="text-xs text-text3 py-2">Notifications are blocked. Enable them in your browser settings, then reload.</div>
        ) : (
          <div className="flex items-center justify-between py-1">
            <div>
              <div className="text-sm text-text2">Workout reminders</div>
              <div className="text-xs text-text3">
                {notifStatus === 'granted' ? 'Daily push at 7 AM on gym days' : 'Get reminded on every gym day'}
              </div>
            </div>
            {notifStatus === 'granted' ? (
              <button onClick={disableNotifications} disabled={notifLoading}
                className="text-xs font-bold px-3 py-1.5 bg-bg2 border border-border rounded-sm text-text2 disabled:opacity-50 cursor-pointer">
                {notifLoading ? '…' : 'Disable'}
              </button>
            ) : (
              <button onClick={enableNotifications} disabled={notifLoading}
                className="text-xs font-bold px-3 py-1.5 rounded-sm text-accent disabled:opacity-50 cursor-pointer"
                style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)' }}>
                {notifLoading ? '…' : 'Enable'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="bg-bg1 rounded-card p-4 mb-3" style={{ border: '1px solid rgba(239,68,68,.2)' }}>
        <div className="font-sans text-[10px] font-black uppercase tracking-widest text-danger mb-3">Danger Zone</div>
        {!showDeleteZone ? (
          <div className="flex items-center justify-between py-1">
            <div>
              <div className="text-sm text-text2">Delete all my data</div>
              <div className="text-xs text-text3">Permanently removes all workouts, nutrition, weight logs, and photos</div>
            </div>
            <button onClick={() => setShowDeleteZone(true)}
              className="text-xs font-bold px-3 py-1.5 rounded-sm text-danger ml-3 shrink-0 cursor-pointer"
              style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)' }}>
              Delete
            </button>
          </div>
        ) : (
          <div>
            <div className="text-xs text-text3 mb-3 leading-relaxed">
              This will permanently delete all your workouts, meals, weight entries, progress photos, and settings. This cannot be undone.
            </div>
            <div className="text-[10px] text-text3 uppercase font-bold mb-1.5">
              Type <span className="text-danger">DELETE</span> to confirm
            </div>
            <input type="text" value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder="DELETE"
              className="w-full bg-bg2 border rounded-sm text-sm px-3 py-2.5 outline-none text-text1 mb-3 placeholder:text-text3"
              style={{ borderColor: 'rgba(239,68,68,.3)' }} />
            <div className="flex gap-2">
              <button onClick={() => { setShowDeleteZone(false); setDeleteConfirm(''); }}
                className="flex-1 py-2.5 bg-bg2 border border-border rounded-sm text-sm font-bold text-text2 cursor-pointer">
                Cancel
              </button>
              <button onClick={handleDeleteAll} disabled={deleteConfirm !== 'DELETE' || deleting}
                className="flex-1 py-2.5 rounded-sm text-sm font-bold text-danger disabled:opacity-30 disabled:cursor-not-allowed transition-opacity cursor-pointer"
                style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.4)' }}>
                {deleting ? 'Deleting...' : 'Delete Everything'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="text-center text-[11px] text-text3 pb-4">FitTrack v1.7</div>
    </div>
  );
}
