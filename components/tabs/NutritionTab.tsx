'use client';

import { useState } from 'react';
import { useApp } from '@/lib/store';
import { getTargets, dk } from '@/lib/utils';
import { DAYS } from '@/lib/constants';
import FoodSearch from '../nutrition/FoodSearch';
import MealTemplates, { SaveTemplateButton } from '../nutrition/MealTemplates';
import CalorieBank from '../nutrition/CalorieBank';

type AddMode = 'manual' | 'search';

export default function NutritionTab() {
  const { settings, getDayData, saveDayData } = useApp();
  const [showForm,  setShowForm]  = useState(false);
  const [addMode,   setAddMode]   = useState<AddMode>('manual');
  const [form, setForm] = useState({ name:'', protein:0, carbs:0, fat:0, calories:0 });

  const today    = new Date();
  const isGymDay = settings ? settings.gymDays.includes(DAYS[today.getDay()]) : false;
  const data     = getDayData(today);
  const targets  = getTargets(settings, isGymDay);
  const meals    = data.meals ?? [];

  const tot = meals.reduce((a, m) => ({
    calories: a.calories + m.calories,
    protein:  a.protein  + m.protein,
    carbs:    a.carbs    + m.carbs,
    fat:      a.fat      + m.fat,
  }), { calories:0, protein:0, carbs:0, fat:0 });

  function pct(v: number, max: number) { return Math.min(100, Math.round(v / max * 100)); }

  function resetForm() {
    setForm({ name:'', protein:0, carbs:0, fat:0, calories:0 });
    setShowForm(false);
    setAddMode('manual');
  }

  async function addMeal() {
    if (!form.name.trim()) return;
    const cals = form.calories || Math.round(form.protein * 4 + form.carbs * 4 + form.fat * 9);
    const updated = { ...data, meals: [...meals, { ...form, calories: cals }] };
    await saveDayData(today, updated);
    resetForm();
  }

  async function addFromTemplate(meal: { name: string; protein: number; carbs: number; fat: number; calories: number }) {
    const updated = { ...data, meals: [...meals, meal] };
    await saveDayData(today, updated);
  }

  async function deleteMeal(idx: number) {
    const updated = { ...data, meals: meals.filter((_, i) => i !== idx) };
    await saveDayData(today, updated);
  }

  const macroRows = [
    { label:'Calories', val: tot.calories, max: targets.calories, unit:'kcal' },
    { label:'Protein',  val: tot.protein,  max: targets.protein,  unit:'g'    },
    { label:'Carbs',    val: tot.carbs,    max: targets.carbs,    unit:'g'    },
    { label:'Fat',      val: tot.fat,      max: targets.fat,      unit:'g'    },
  ];

  return (
    <div>
      {/* Macro bars */}
      <div className="bg-surface border border-hairline rounded-card p-4 mb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-black uppercase tracking-widest text-ink-2">Macros Today</div>
          <div className="text-xs text-ink-3">{isGymDay ? 'Gym Day' : 'Rest Day'}</div>
        </div>
        {macroRows.map(({ label, val, max, unit }) => (
          <div key={label} className="flex items-center gap-2.5 mb-3">
            <div className="font-mono text-xs font-bold w-14 flex-shrink-0 text-ink-2">{label}</div>
            <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${pct(val, max) >= 100 ? 'bg-mustard' : 'bg-clay'} transition-all duration-500`} style={{ width: `${Math.min(100, pct(val, max))}%` }} />
            </div>
            <div className="font-mono tabular-nums text-[11px] text-ink-3 w-20 text-right flex-shrink-0">{val} / {max}{unit}</div>
          </div>
        ))}
      </div>

      {/* Calorie bank */}
      <CalorieBank />

      {/* Meals list */}
      <div className="bg-surface border border-hairline rounded-card p-4 mb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-black uppercase tracking-widest text-ink-2">Meals</div>
          <button onClick={() => setShowForm(v => !v)} className="text-xs font-bold px-3 py-1.5 bg-surface-2 border border-hairline rounded-lg text-ink-2">
            {showForm ? '✕ Cancel' : '+ Add Meal'}
          </button>
        </div>

        {showForm && (
          <div className="bg-surface-2 border border-hairline rounded-sm p-3.5 mb-3">
            {/* Mode toggle */}
            <div className="flex gap-2 mb-3">
              {(['manual', 'search'] as AddMode[]).map(m => (
                <button key={m} onClick={() => setAddMode(m)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                    addMode === m ? 'bg-clay-wash border-clay-dim text-clay' : 'bg-surface-2 border-hairline text-ink-3'
                  }`}>
                  {m === 'manual' ? 'Manual Entry' : 'Search DB'}
                </button>
              ))}
            </div>

            {addMode === 'search' ? (
              <FoodSearch onSelect={entry => { setForm({ ...entry, calories: entry.calories }); setAddMode('manual'); }} />
            ) : (
              <>
                <input type="text" placeholder="Meal name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-surface-2 border border-hairline rounded-lg text-sm px-3 py-2.5 mb-2 outline-none focus:border-clay text-ink" />
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {(['protein','carbs','fat','calories'] as const).map(k => (
                    <div key={k}>
                      <div className="text-[10px] text-ink-3 uppercase font-bold mb-1">{k === 'calories' ? 'Calories (auto)' : `${k[0].toUpperCase()}${k.slice(1)} (g)`}</div>
                      <input type="number" inputMode="decimal" value={form[k] || ''} placeholder="0"
                        onChange={e => setForm(p => ({ ...p, [k]: parseFloat(e.target.value) || 0 }))}
                        className="w-full bg-surface-2 border border-hairline rounded-lg text-sm px-3 py-2 outline-none focus:border-clay text-ink" />
                    </div>
                  ))}
                </div>
                <button onClick={addMeal} className="w-full py-3 bg-clay hover:bg-clay-hover text-surface font-bold rounded-lg text-sm">Save Meal</button>
              </>
            )}
          </div>
        )}

        {/* Quick-add from templates */}
        {!showForm && <MealTemplates onAdd={addFromTemplate} />}

        {meals.length === 0 && !showForm && (
          <div className="text-center py-8 text-ink-3 text-sm">No meals logged yet</div>
        )}

        {meals.map((m, i) => (
          <div key={i} className="flex items-start justify-between py-3 border-b border-hairline last:border-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold truncate">{m.name}</div>
                <SaveTemplateButton meal={m} />
              </div>
              <div className="text-[11px] text-ink-3 mt-0.5">P {m.protein}g · C {m.carbs}g · F {m.fat}g</div>
            </div>
            <div className="flex items-center gap-2 ml-3 flex-shrink-0">
              <div className="font-sans text-base font-bold text-mustard">{m.calories}</div>
              <button onClick={() => deleteMeal(i)} className="text-ink-3 hover:text-clay text-lg leading-none">×</button>
            </div>
          </div>
        ))}
      </div>

      {/* Reference meals */}
      <div className="bg-surface border border-hairline rounded-card p-4">
        <div className="text-[13px] font-black uppercase tracking-widest text-ink-2 mb-3">Meal Framework</div>
        {[
          ['Breakfast',   '4 eggs + 2 whites + 2 toast',          '35g','450'],
          ['Lunch',       '200g chicken + 150g rice + salad',      '45g','550'],
          ['Pre-workout', '1 scoop whey + 1 banana',               '25g','250'],
          ['Dinner',      '200g paneer/fish + 2 roti + dal',       '40g','600'],
          ['Night snack', 'Greek yogurt 200g + 10 almonds',        '15g','250'],
        ].map(([n, d, p, c]) => (
          <div key={n} className="flex items-start justify-between py-3 border-b border-hairline last:border-0">
            <div>
              <div className="text-sm font-semibold">{n}</div>
              <div className="text-[11px] text-ink-3">{d}</div>
            </div>
            <div className="text-right ml-3 flex-shrink-0">
              <div className="text-xs text-mustard font-bold">{c} kcal</div>
              <div className="text-[11px] text-ink-2">{p} prot</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
