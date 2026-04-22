'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
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
    protein:  a.protein  + (m.protein ?? 0),
    carbs:    a.carbs    + (m.carbs ?? 0),
    fat:      a.fat      + (m.fat ?? 0),
  }), { calories:0, protein:0, carbs:0, fat:0 });

  function pct(v: number, max: number) { return Math.min(100, Math.round(v / Math.max(1, max) * 100)); }

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

  const calLeft = targets.calories - tot.calories;

  return (
    <div>
      {/* Hero calorie summary */}
      <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
        <div className="flex items-center justify-between mb-1">
          <div className="font-sans text-[10px] font-black uppercase tracking-widest text-text3">Today · {isGymDay ? 'Gym Day' : 'Rest Day'}</div>
          <span className="text-[11px] text-text3">{targets.calories.toLocaleString()} kcal target</span>
        </div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="font-condensed font-black text-[42px] text-energy leading-none tabular-nums" style={{ letterSpacing: '-.01em' }}>
            {tot.calories.toLocaleString()}
          </span>
          <span className={`text-sm font-semibold ${calLeft >= 0 ? 'text-accent' : 'text-danger'}`}>
            {calLeft >= 0 ? `${calLeft.toLocaleString()} left` : `${Math.abs(calLeft).toLocaleString()} over`}
          </span>
        </div>
        <div className="h-1.5 bg-bg3 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct(tot.calories, targets.calories)}%`, background: 'linear-gradient(90deg,#f97316,#22c55e)' }} />
        </div>

        {/* Macro bars */}
        <div className="mt-4 space-y-2.5">
          {[
            { label:'Protein', val: Math.round(tot.protein), max: targets.protein, unit:'g', color: '#60a5fa' },
            { label:'Carbs',   val: Math.round(tot.carbs),   max: targets.carbs,   unit:'g', color: '#a78bfa' },
            { label:'Fat',     val: Math.round(tot.fat),     max: targets.fat,     unit:'g', color: '#ef4444' },
          ].map(({ label, val, max, unit, color }) => (
            <div key={label} className="flex items-center gap-2.5">
              <div className="font-sans text-xs font-bold w-12 flex-shrink-0 text-text2">{label}</div>
              <div className="flex-1 h-1.5 bg-bg3 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct(val, max)}%`, background: color }} />
              </div>
              <div className="font-sans tabular-nums text-[11px] text-text3 w-20 text-right flex-shrink-0">{val} / {max}{unit}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Calorie bank */}
      <CalorieBank />

      {/* Meals list */}
      <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="font-sans text-[10px] font-black uppercase tracking-widest text-text3">Meals</div>
          <button onClick={() => setShowForm(v => !v)} className="text-xs font-bold px-3 py-1.5 bg-bg2 border border-border rounded-sm text-text2 cursor-pointer hover:bg-bg3 transition-colors">
            {showForm ? '✕ Cancel' : '+ Add Meal'}
          </button>
        </div>

        {showForm && (
          <div className="bg-bg2 border border-border rounded-sm p-3.5 mb-3">
            {/* Mode toggle */}
            <div className="flex gap-2 mb-3">
              {(['manual', 'search'] as AddMode[]).map(m => (
                <button key={m} onClick={() => setAddMode(m)}
                  className="flex-1 py-2 rounded-sm text-xs font-bold border transition-all cursor-pointer"
                  style={{
                    background: addMode === m ? 'rgba(34,197,94,.1)' : 'transparent',
                    borderColor: addMode === m ? 'rgba(34,197,94,.3)' : '#232b38',
                    color: addMode === m ? '#22c55e' : '#64748b',
                  }}>
                  {m === 'manual' ? 'Manual Entry' : 'Search DB'}
                </button>
              ))}
            </div>

            {addMode === 'search' ? (
              <FoodSearch onSelect={entry => { setForm({ ...entry, calories: entry.calories }); setAddMode('manual'); }} />
            ) : (
              <>
                <input type="text" placeholder="Meal name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-bg3 border border-border rounded-sm text-sm px-3 py-2.5 mb-2 outline-none focus:border-accent text-text1 placeholder:text-text3" />
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {(['protein','carbs','fat','calories'] as const).map(k => (
                    <div key={k}>
                      <div className="text-[10px] text-text3 uppercase font-bold mb-1">{k === 'calories' ? 'Calories (auto)' : `${k[0].toUpperCase()}${k.slice(1)} (g)`}</div>
                      <input type="number" inputMode="decimal" value={form[k] || ''} placeholder="0"
                        onChange={e => setForm(p => ({ ...p, [k]: parseFloat(e.target.value) || 0 }))}
                        className="w-full bg-bg3 border border-border rounded-sm text-sm px-3 py-2 outline-none focus:border-accent text-text1" />
                    </div>
                  ))}
                </div>
                <button onClick={addMeal} className="w-full py-3 text-black font-bold rounded-sm text-sm cursor-pointer" style={{ background: 'linear-gradient(135deg,#22c55e,#4ade80)' }}>Save Meal</button>
              </>
            )}
          </div>
        )}

        {!showForm && <MealTemplates onAdd={addFromTemplate} />}

        {meals.length === 0 && !showForm && (
          <div className="text-center py-8 text-text3 text-sm">No meals logged yet</div>
        )}

        {meals.map((m, i) => (
          <div key={i} className="flex items-start justify-between rounded-card mb-2 overflow-hidden"
            style={{
              position: 'relative',
              background: 'linear-gradient(180deg, rgba(249,115,22,.06), rgba(22,27,36,.55))',
              border: '1px solid rgba(249,115,22,.2)',
              padding: '14px 16px',
              backdropFilter: 'blur(14px) saturate(150%)',
              WebkitBackdropFilter: 'blur(14px) saturate(150%)',
              boxShadow: '0 10px 24px rgba(0,0,0,.35), 0 1px 0 rgba(255,255,255,.04) inset',
            }}>
            {/* glass highlight */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: 14, pointerEvents: 'none', background: 'radial-gradient(120% 60% at 0% 0%, rgba(255,255,255,.05), transparent 55%)' }} />
            <div className="min-w-0 flex-1" style={{ position: 'relative' }}>
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold truncate text-text1">{m.name}</div>
                <SaveTemplateButton meal={m} />
              </div>
              <div className="text-[11px] text-text2 mt-0.5">P {m.protein ?? 0}g · C {m.carbs ?? 0}g · F {m.fat ?? 0}g</div>
            </div>
            <div className="flex items-center gap-2 ml-3 flex-shrink-0" style={{ position: 'relative' }}>
              <div className="font-condensed text-xl font-bold text-energy tabular-nums">{m.calories}</div>
              <button onClick={() => deleteMeal(i)} className="text-text3 hover:text-danger text-lg leading-none cursor-pointer">×</button>
            </div>
          </div>
        ))}
      </div>

      {/* Meal framework */}
      <div className="bg-bg1 border border-border rounded-card p-4">
        <div className="font-sans text-[10px] font-black uppercase tracking-widest text-text3 mb-3">Meal Framework</div>
        {[
          ['Breakfast',   '4 eggs + 2 whites + 2 toast',          '35g','450'],
          ['Lunch',       '200g chicken + 150g rice + salad',      '45g','550'],
          ['Pre-workout', '1 scoop whey + 1 banana',               '25g','250'],
          ['Dinner',      '200g paneer/fish + 2 roti + dal',       '40g','600'],
          ['Night snack', 'Greek yogurt 200g + 10 almonds',        '15g','250'],
        ].map(([n, d, p, c]) => (
          <div key={n} className="flex items-start justify-between py-3 border-b border-border last:border-0">
            <div>
              <div className="text-sm font-semibold text-text1">{n}</div>
              <div className="text-[11px] text-text3">{d}</div>
            </div>
            <div className="text-right ml-3 flex-shrink-0">
              <div className="text-xs text-warn font-bold">{c} kcal</div>
              <div className="text-[11px] text-text2">{p} prot</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
