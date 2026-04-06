'use client';

import { useState } from 'react';
import { useApp } from '@/lib/store';
import { DAYS, WORKOUTS } from '@/lib/constants';
import { getDayDateInWeek, dk, isWoDone } from '@/lib/utils';
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
      <p className="text-xs text-text3 mb-4">Enter weight + reps, then tap ✓ to mark sets done.</p>
      {Object.entries(WORKOUTS).map(([dayName, wo]) => {
        const dayDate = getDayDateInWeek(dayName, settings);
        const isToday = dk(dayDate) === dk(today);
        const dayData = getDayData(dayDate);
        const done    = isWoDone(dayName, dayData);
        const isOpen  = openDays[dayName] ?? isToday;
        const customExs: CustomExercise[] = settings?.customExercises?.[dayName] ?? [];

        return (
          <div key={dayName} className="bg-bg1 border border-border rounded-card mb-3 overflow-hidden">
            {/* Day header */}
            <button
              onClick={() => toggleDay(dayName)}
              className="w-full flex items-center justify-between p-4 hover:bg-bg2 active:bg-bg3 transition-colors duration-150 cursor-pointer"
            >
              <div className="text-left">
                <div className={`font-condensed text-lg font-bold ${isToday ? 'text-accent' : 'text-text1'}`}>
                  {wo.day}{isToday ? ' — Today' : ''}
                </div>
                <div className="text-xs text-text3 mt-0.5">{wo.name}</div>
              </div>
              <div className="flex items-center gap-2">
                {done && <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-accent/10 text-accent border border-accent/22">Done</span>}
                <span className={`text-text3 text-xl transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
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
                  <div key={ex.id} className="bg-bg2 border border-info/20 rounded-[10px] p-3.5 mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-condensed text-base font-bold">{ex.name}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-info/10 text-info border border-info/20 uppercase">Custom</span>
                        {isToday && <button onClick={() => deleteCustomEx(dayName, idx)} className="text-danger/60 hover:text-danger text-sm">✕</button>}
                      </div>
                    </div>
                    <div className="text-[11px] text-text3">{ex.sets} × {ex.reps} reps · Rest {ex.rest}</div>
                  </div>
                ))}

                {/* Add exercise */}
                {isToday && (
                  <>
                    {addExDay !== dayName ? (
                      <button onClick={() => setAddExDay(dayName)} className="w-full py-2.5 bg-bg3 border border-border rounded-[10px] text-sm font-semibold text-text2 mb-3">
                        + Add Exercise
                      </button>
                    ) : (
                      <div className="bg-bg2 border border-accent/18 rounded-[10px] p-3.5 mb-3">
                        <div className="text-xs font-bold text-text2 mb-3">Custom Exercise</div>
                        <input type="text" value={newEx.name} onChange={e => setNewEx(p => ({ ...p, name: e.target.value }))}
                          placeholder="Exercise name" className="w-full bg-bg3 border border-border rounded-lg text-sm px-3 py-2.5 mb-2 outline-none focus:border-accent text-text1" />
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          {[
                            { label:'Sets', val: String(newEx.sets), key:'sets', type:'number' },
                            { label:'Reps', val: newEx.reps, key:'reps', type:'text' },
                            { label:'Rest', val: newEx.rest, key:'rest', type:'text' },
                            { label:'Load (kg)', val: String(newEx.load), key:'load', type:'number' },
                          ].map(f => (
                            <div key={f.key}>
                              <div className="text-[10px] text-text3 uppercase font-bold mb-1">{f.label}</div>
                              <input type={f.type} value={f.val} onChange={e => setNewEx(p => ({ ...p, [f.key]: f.type === 'number' ? +e.target.value : e.target.value }))}
                                className="w-full bg-bg3 border border-border rounded-lg text-sm px-3 py-2 outline-none focus:border-accent text-text1" />
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => addCustomEx(dayName)} className="flex-1 py-2.5 bg-gradient-to-r from-accent to-green-400 text-black font-bold rounded-lg text-sm">Add</button>
                          <button onClick={() => setAddExDay(null)} className="flex-[0.6] py-2.5 bg-bg3 border border-border rounded-lg text-sm font-semibold text-text2">Cancel</button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Cardio */}
                <div className="bg-info/4 border border-info/14 rounded-[10px] p-3.5">
                  <div className="text-[11px] font-bold text-info uppercase tracking-wider mb-1">Cardio</div>
                  <div className="text-sm text-text2 mb-3">{wo.cardio}</div>
                  {isToday && (
                    <button onClick={() => toggleCardio(dayName, dayDate)}
                      className={`w-full py-2.5 rounded-lg text-sm font-bold border transition-all ${
                        dayData.cardio
                          ? 'bg-accent/10 border-accent/28 text-accent'
                          : 'bg-info/9 border-info/18 text-info'
                      }`}>
                      {dayData.cardio ? 'Cardio Done ✓' : 'Mark Cardio Done'}
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
