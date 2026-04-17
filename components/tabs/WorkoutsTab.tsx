'use client';

import { useState } from 'react';
import { ChevronRight, Check } from 'lucide-react';
import { useApp } from '@/lib/store';
import { DAYS } from '@/lib/constants';
import { getDayDateInWeek, dk, isWoDone, getWorkoutMap } from '@/lib/utils';
import ExerciseBlock from '../workout/ExerciseBlock';
import { toast } from '../shared/Toast';
import type { CustomExercise } from '@/lib/types';

export default function WorkoutsTab() {
  const { settings, saveSettings, getDayData, saveDayData } = useApp();
  const [openDays,    setOpenDays]    = useState<Record<string, boolean>>({});
  const [addExDay,    setAddExDay]    = useState<string | null>(null);
  const [newEx,       setNewEx]       = useState({ name:'', sets:3, reps:'8–12', rest:'60s', load:0 });
  const today = new Date();

  function toggleDay(dayName: string) {
    setOpenDays(prev => ({ ...prev, [dayName]: !prev[dayName] }));
  }

  async function toggleCardio(dayName: string, date: Date) {
    const data = getDayData(date);
    await saveDayData(date, { ...data, cardio: !data.cardio });
  }

  async function addCustomEx(dayName: string) {
    if (!newEx.name.trim()) { toast('Enter an exercise name'); return; }
    const customMap = { ...(settings?.customExercises ?? {}) };
    if (!customMap[dayName]) customMap[dayName] = [];
    const id = `custom_${dayName}_${Date.now()}`;
    customMap[dayName] = [...customMap[dayName], { id, ...newEx }];
    await saveSettings({ customExercises: customMap });
    toast(`Added ${newEx.name}`);
    setAddExDay(null);
    setNewEx({ name:'', sets:3, reps:'8–12', rest:'60s', load:0 });
  }

  async function deleteCustomEx(dayName: string, idx: number) {
    if (!confirm('Remove this exercise?')) return;
    const customMap = { ...(settings?.customExercises ?? {}) };
    customMap[dayName] = [...(customMap[dayName] ?? [])];
    customMap[dayName].splice(idx, 1);
    await saveSettings({ customExercises: customMap });
    toast('Exercise removed');
  }

  return (
    <div>
      <p className="text-xs text-ink-3 mb-4">Enter weight + reps, then tap the checkmark to mark sets done.</p>
      {Object.entries(getWorkoutMap(settings)).map(([dayName, wo]) => {
        const dayDate = getDayDateInWeek(dayName, settings);
        const isToday = dk(dayDate) === dk(today);
        const dayData = getDayData(dayDate);
        const done    = isWoDone(dayName, dayData, getWorkoutMap(settings));
        const isOpen  = openDays[dayName] ?? isToday;
        const customExs: CustomExercise[] = settings?.customExercises?.[dayName] ?? [];

        return (
          <div key={dayName} className="bg-surface border border-hairline rounded-card mb-3 overflow-hidden">
            {/* Day header */}
            <button
              onClick={() => toggleDay(dayName)}
              className="w-full flex items-center justify-between p-4 hover:bg-surface-2 active:bg-surface-2 transition-colors duration-150 cursor-pointer"
            >
              <div className="text-left">
                <div className={`font-sans text-lg font-bold ${isToday ? 'text-clay' : 'text-ink'}`}>
                  {wo.day}{isToday ? ' — Today' : ''}
                </div>
                <div className="text-xs text-ink-3 mt-0.5">{wo.name}</div>
              </div>
              <div className="flex items-center gap-2">
                {done && <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-clay-wash text-clay border border-clay-dim">Done</span>}
                <ChevronRight size={18} className={`text-ink-3 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} />
              </div>
            </button>

            {isOpen && (
              <div className="px-4 pb-4">
                {/* Standard exercises */}
                {wo.exercises.map(ex => (
                  <ExerciseBlock key={ex.id} ex={ex} data={dayData} isToday={isToday} date={dayDate} dayName={dayName} />
                ))}

                {/* Custom exercises */}
                {customExs.map((ex, idx) => (
                  <div key={ex.id} className="bg-surface-2 border border-info/20 rounded-sm p-3.5 mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-sans text-base font-bold">{ex.name}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-info/10 text-ink-2 border border-info/20 uppercase">Custom</span>
                        {isToday && <button onClick={() => deleteCustomEx(dayName, idx)} className="text-clay/60 hover:text-clay cursor-pointer"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>}
                      </div>
                    </div>
                    <div className="text-[11px] text-ink-3">{ex.sets} × {ex.reps} reps · Rest {ex.rest}</div>
                  </div>
                ))}

                {/* Add exercise */}
                {isToday && (
                  <>
                    {addExDay !== dayName ? (
                      <button onClick={() => setAddExDay(dayName)} className="w-full py-2.5 bg-surface-2 border border-hairline rounded-sm text-sm font-semibold text-ink-2 mb-3">
                        + Add Exercise
                      </button>
                    ) : (
                      <div className="bg-surface-2 border border-clay-dim rounded-sm p-3.5 mb-3">
                        <div className="text-xs font-bold text-ink-2 mb-3">Custom Exercise</div>
                        <input type="text" value={newEx.name} onChange={e => setNewEx(p => ({ ...p, name: e.target.value }))}
                          placeholder="Exercise name" className="w-full bg-surface-2 border border-hairline rounded-lg text-sm px-3 py-2.5 mb-2 outline-none focus:border-clay text-ink" />
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          {[
                            { label:'Sets', val: String(newEx.sets), key:'sets', type:'number' },
                            { label:'Reps', val: newEx.reps, key:'reps', type:'text' },
                            { label:'Rest', val: newEx.rest, key:'rest', type:'text' },
                            { label:'Load (kg)', val: String(newEx.load), key:'load', type:'number' },
                          ].map(f => (
                            <div key={f.key}>
                              <div className="text-[10px] text-ink-3 uppercase font-bold mb-1">{f.label}</div>
                              <input type={f.type} value={f.val} onChange={e => setNewEx(p => ({ ...p, [f.key]: f.type === 'number' ? +e.target.value : e.target.value }))}
                                className="w-full bg-surface-2 border border-hairline rounded-lg text-sm px-3 py-2 outline-none focus:border-clay text-ink" />
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => addCustomEx(dayName)} className="flex-1 py-2.5 bg-clay hover:bg-clay-hover text-surface font-bold rounded-lg text-sm">Add</button>
                          <button onClick={() => setAddExDay(null)} className="flex-[0.6] py-2.5 bg-surface-2 border border-hairline rounded-lg text-sm font-semibold text-ink-2">Cancel</button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Cardio */}
                <div className="bg-info/4 border border-info/14 rounded-sm p-3.5">
                  <div className="text-[11px] font-bold text-ink-2 uppercase tracking-wider mb-1">Cardio</div>
                  <div className="text-sm text-ink-2 mb-3">{wo.cardio}</div>
                  {isToday && (
                    <button onClick={() => toggleCardio(dayName, dayDate)}
                      className={`w-full py-2.5 rounded-lg text-sm font-bold border transition-all ${
                        dayData.cardio
                          ? 'bg-clay-wash border-clay-dim text-clay'
                          : 'bg-info/9 border-info/18 text-ink-2'
                      }`}>
                      {dayData.cardio ? <span className="flex items-center justify-center gap-1.5"><Check size={14} /> Cardio Done</span> : 'Mark Cardio Done'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
