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
      <p className="text-xs text-text3 mb-4">Enter weight + reps, then tap the checkmark to mark sets done.</p>
      {Object.entries(getWorkoutMap(settings)).map(([dayName, wo]) => {
        const dayDate = getDayDateInWeek(dayName, settings);
        const isToday = dk(dayDate) === dk(today);
        const dayData = getDayData(dayDate);
        const done    = isWoDone(dayName, dayData, getWorkoutMap(settings));
        const isOpen  = openDays[dayName] ?? isToday;
        const customExs: CustomExercise[] = settings?.customExercises?.[dayName] ?? [];

        // The first exercise that isn't fully done gets liquid-glass treatment
        const firstActiveIdx = isToday
          ? wo.exercises.findIndex(ex => {
              const sets = dayData.wo?.[ex.id]?.sets ?? [];
              const doneSets = sets.filter(s => s?.done).length;
              return doneSets < ex.sets;
            })
          : -1;

        return (
          <div key={dayName} className="bg-bg1 border border-border rounded-card mb-3 overflow-hidden">
            {/* Day header */}
            <button
              onClick={() => toggleDay(dayName)}
              className="w-full flex items-center justify-between p-4 hover:bg-bg2 active:bg-bg2 transition-colors duration-150 cursor-pointer"
            >
              <div className="text-left">
                <div className={`font-condensed text-lg font-bold ${isToday ? 'text-accent' : 'text-text1'}`}>
                  {wo.day}{isToday ? ' — Today' : ''}
                </div>
                <div className="text-xs text-text3 mt-0.5">{wo.name}</div>
              </div>
              <div className="flex items-center gap-2">
                {done && (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full border" style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.25)', color: '#22c55e' }}>
                    Done
                  </span>
                )}
                <ChevronRight size={18} className={`text-text3 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} />
              </div>
            </button>

            {isOpen && (
              <div className="px-4 pb-4">
                {wo.exercises.map((ex, idx) => (
                  <ExerciseBlock
                    key={ex.id}
                    ex={ex}
                    data={dayData}
                    isToday={isToday}
                    date={dayDate}
                    dayName={dayName}
                    isActive={isToday && idx === firstActiveIdx}
                  />
                ))}

                {/* Custom exercises */}
                {customExs.map((ex, idx) => (
                  <div key={ex.id} className="bg-bg2 rounded-sm p-3.5 mb-3" style={{ border: '1px solid rgba(96,165,250,.2)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-condensed text-base font-bold text-text1">{ex.name}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase text-text2" style={{ background: 'rgba(96,165,250,.1)', border: '1px solid rgba(96,165,250,.2)' }}>Custom</span>
                        {isToday && (
                          <button onClick={() => deleteCustomEx(dayName, idx)} className="text-danger/60 hover:text-danger cursor-pointer">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] text-text3">{ex.sets} × {ex.reps} reps · Rest {ex.rest}</div>
                  </div>
                ))}

                {/* Add exercise */}
                {isToday && (
                  <>
                    {addExDay !== dayName ? (
                      <button onClick={() => setAddExDay(dayName)} className="w-full py-2.5 bg-bg2 border border-border rounded-sm text-sm font-semibold text-text2 mb-3 cursor-pointer hover:bg-bg3 transition-colors">
                        + Add Exercise
                      </button>
                    ) : (
                      <div className="bg-bg2 border border-accent/20 rounded-sm p-3.5 mb-3">
                        <div className="text-xs font-bold text-text2 mb-3">Custom Exercise</div>
                        <input type="text" value={newEx.name} onChange={e => setNewEx(p => ({ ...p, name: e.target.value }))}
                          placeholder="Exercise name" className="w-full bg-bg3 border border-border rounded-sm text-sm px-3 py-2.5 mb-2 outline-none focus:border-accent text-text1 placeholder:text-text3" />
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
                                className="w-full bg-bg3 border border-border rounded-sm text-sm px-3 py-2 outline-none focus:border-accent text-text1" />
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => addCustomEx(dayName)} className="flex-1 py-2.5 text-black font-bold rounded-sm text-sm cursor-pointer" style={{ background: 'linear-gradient(135deg,#22c55e,#4ade80)' }}>Add</button>
                          <button onClick={() => setAddExDay(null)} className="flex-[0.6] py-2.5 bg-bg3 border border-border rounded-sm text-sm font-semibold text-text2 cursor-pointer">Cancel</button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Cardio */}
                <div className="rounded-sm p-3.5" style={{ background: 'rgba(96,165,250,.04)', border: '1px solid rgba(96,165,250,.14)' }}>
                  <div className="text-[11px] font-bold text-text2 uppercase tracking-wider mb-1">Cardio</div>
                  <div className="text-sm text-text2 mb-3">{wo.cardio}</div>
                  {isToday && (
                    <button onClick={() => toggleCardio(dayName, dayDate)}
                      className={`w-full py-2.5 rounded-sm text-sm font-bold border transition-all cursor-pointer ${
                        dayData.cardio
                          ? 'text-accent'
                          : 'text-text2'
                      }`}
                      style={{
                        background: dayData.cardio ? 'rgba(34,197,94,.1)' : 'rgba(96,165,250,.09)',
                        borderColor: dayData.cardio ? 'rgba(34,197,94,.3)' : 'rgba(96,165,250,.18)',
                      }}>
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
