'use client';

import { useState, useRef, useCallback } from 'react';
import type { FoodResult } from '@/app/api/food/search/route';

interface Props {
  onSelect: (entry: { name: string; protein: number; carbs: number; fat: number; calories: number }) => void;
}

export default function FoodSearch({ onSelect }: Props) {
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState<FoodResult[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [selected, setSelected] = useState<FoodResult | null>(null);
  const [amount,   setAmount]   = useState('100');
  const [useUnits, setUseUnits] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res  = await fetch(`/api/food/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  }, []);

  function handleChange(v: string) {
    setQuery(v);
    setSelected(null);
    search(v);
  }

  function pick(f: FoodResult) {
    setSelected(f);
    setResults([]);
    setQuery(f.name);
    // Default: pieces mode if the food has a serving size, else grams
    const hasServing = !!(f.serving_size_g && f.serving_unit);
    setUseUnits(hasServing);
    setAmount(hasServing ? '1' : '100');
  }

  function confirm() {
    if (!selected) return;
    const n      = Math.max(1, parseFloat(amount) || 1);
    const grams  = useUnits && selected.serving_size_g
      ? n * selected.serving_size_g
      : n;
    const scale  = grams / 100;
    onSelect({
      name:     selected.name,
      protein:  +(selected.protein_100g * scale).toFixed(1),
      carbs:    +(selected.carbs_100g   * scale).toFixed(1),
      fat:      +(selected.fat_100g     * scale).toFixed(1),
      calories: Math.round(selected.kcal_100g * scale),
    });
    setQuery(''); setSelected(null); setAmount('100'); setUseUnits(false);
  }

  // Preview macros in real-time as user changes amount
  const previewGrams = selected
    ? useUnits && selected.serving_size_g
      ? (parseFloat(amount) || 1) * selected.serving_size_g
      : (parseFloat(amount) || 100)
    : 0;
  const previewScale = previewGrams / 100;

  const hasServing = selected && selected.serving_size_g && selected.serving_unit;

  return (
    <div className="mb-3">
      <div className="text-[10px] text-text3 uppercase font-bold mb-1.5 tracking-wider">Search Food Database</div>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          placeholder="e.g. paneer, dal, chicken breast…"
          className="w-full bg-bg3 border border-border rounded-xl text-sm px-4 py-3 outline-none focus:border-accent text-text1"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        )}
      </div>

      {results.length > 0 && (
        <div className="mt-1.5 bg-bg2 border border-border rounded-xl overflow-hidden max-h-52 overflow-y-auto">
          {results.map((f, i) => (
            <button key={i} onClick={() => pick(f)}
              className="w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-bg3 transition-colors cursor-pointer">
              <div className="text-sm text-text1 font-medium truncate">{f.name}</div>
              <div className="text-[11px] text-text3 mt-0.5 flex items-center gap-2">
                {f.brand && <span>{f.brand}</span>}
                <span className="text-energy font-semibold">{f.kcal_100g} kcal</span>
                <span className="text-info">P {f.protein_100g}g</span>
                <span className="text-text3">per 100g</span>
                {f.serving_size_g && f.serving_unit && (
                  <span className="text-text3">· {f.serving_size_g}g/{f.serving_unit}</span>
                )}
                {f.source === 'manual' && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-accent/10 text-accent border border-accent/20 uppercase font-bold">IN</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="mt-2 bg-accent/5 border border-accent/20 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-text2 font-semibold truncate">{selected.name}</div>
              <div className="text-[10px] text-text3 mt-0.5">
                Per 100g: {selected.kcal_100g} kcal · P {selected.protein_100g}g · C {selected.carbs_100g}g · F {selected.fat_100g}g
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Unit toggle — only shown for countable foods */}
              {hasServing && (
                <div className="flex rounded-lg overflow-hidden border border-border text-[11px] font-semibold">
                  <button
                    onClick={() => { setUseUnits(false); setAmount('100'); }}
                    className={`px-2 py-1 cursor-pointer transition-colors ${!useUnits ? 'bg-accent/20 text-accent' : 'bg-bg3 text-text3'}`}
                  >g</button>
                  <button
                    onClick={() => { setUseUnits(true); setAmount('1'); }}
                    className={`px-2 py-1 cursor-pointer transition-colors ${useUnits ? 'bg-accent/20 text-accent' : 'bg-bg3 text-text3'}`}
                  >{selected.serving_unit}</button>
                </div>
              )}

              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-16 bg-bg3 border border-border rounded-lg text-sm px-2 py-1.5 outline-none focus:border-accent text-center text-text1"
              />
              {!useUnits && <span className="text-xs text-text3">g</span>}

              <button onClick={confirm}
                className="px-3 py-1.5 bg-gradient-to-r from-energy to-accent text-black font-bold rounded-lg text-xs cursor-pointer active:scale-95 transition-transform">
                Add
              </button>
            </div>
          </div>

          {/* Live macro preview */}
          <div className="flex items-center gap-3 text-[11px] pt-0.5 border-t border-accent/10">
            <span className="text-text3">
              {useUnits
                ? `${amount} ${selected.serving_unit}${parseFloat(amount) !== 1 ? 's' : ''} · ${Math.round(previewGrams)}g`
                : `${Math.round(previewGrams)}g`}
            </span>
            <span className="text-energy font-semibold">{Math.round(selected.kcal_100g * previewScale)} kcal</span>
            <span className="text-info">P {(selected.protein_100g * previewScale).toFixed(1)}g</span>
            <span className="text-text3">C {(selected.carbs_100g * previewScale).toFixed(1)}g</span>
            <span className="text-text3">F {(selected.fat_100g * previewScale).toFixed(1)}g</span>
          </div>
        </div>
      )}
    </div>
  );
}
