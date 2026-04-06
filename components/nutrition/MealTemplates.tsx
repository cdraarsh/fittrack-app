'use client';

import { useApp } from '@/lib/store';
import type { MealEntry, MealTemplate } from '@/lib/types';

interface Props {
  onAdd: (meal: MealEntry) => void;
}

export default function MealTemplates({ onAdd }: Props) {
  const { settings, saveSettings } = useApp();
  const templates = settings?.mealTemplates ?? [];

  async function deleteTpl(id: string) {
    if (!confirm('Remove template?')) return;
    await saveSettings({ mealTemplates: templates.filter(t => t.id !== id) });
  }

  if (templates.length === 0) return null;

  return (
    <div className="mb-3">
      <div className="text-[10px] text-text3 uppercase font-bold mb-2 tracking-wider">Quick Add from Templates</div>
      <div className="flex gap-2 flex-wrap">
        {templates.map(t => (
          <div key={t.id} className="flex items-center gap-1 bg-bg3 border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => onAdd({ name: t.name, protein: t.protein, carbs: t.carbs, fat: t.fat, calories: t.calories })}
              className="pl-3 pr-2 py-2 text-xs font-semibold text-text1 hover:text-accent transition-colors text-left">
              <div className="font-bold">{t.name}</div>
              <div className="text-[10px] text-text3 mt-0.5">{t.calories} kcal · P{t.protein}g</div>
            </button>
            <button onClick={() => deleteTpl(t.id)} className="pr-2 pl-1 py-2 text-text3 hover:text-danger text-sm">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SaveTemplateButton({ meal }: { meal: MealEntry }) {
  const { settings, saveSettings } = useApp();

  async function save() {
    const templates = settings?.mealTemplates ?? [];
    if (templates.some(t => t.name === meal.name)) return;
    const newTpl: MealTemplate = { id: `tpl_${Date.now()}`, ...meal };
    await saveSettings({ mealTemplates: [...templates, newTpl] });
  }

  const isSaved = (settings?.mealTemplates ?? []).some(t => t.name === meal.name);

  return (
    <button
      onClick={save}
      disabled={isSaved}
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
        isSaved
          ? 'text-text3 border-border cursor-default'
          : 'text-accent border-accent/30 hover:bg-accent/10'
      }`}>
      {isSaved ? '★ Saved' : '☆ Save'}
    </button>
  );
}
