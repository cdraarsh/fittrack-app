'use client';

import { useState, useRef, useCallback } from 'react';

interface FoodResult {
  name: string;
  brand: string;
  protein100: number;
  carbs100: number;
  fat100: number;
  kcal100: number;
}

interface Props {
  onSelect: (entry: { name: string; protein: number; carbs: number; fat: number; calories: number }) => void;
}

export default function FoodSearch({ onSelect }: Props) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<FoodResult[]>([]);
  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState<FoodResult | null>(null);
  const [grams, setGrams]       = useState('100');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&json=1&page_size=8&fields=product_name,brands,nutriments`;
        const res = await fetch(url);
        const data = await res.json();
        const parsed: FoodResult[] = (data.products ?? [])
          .filter((p: Record<string, unknown>) => p.product_name && (p.nutriments as Record<string, unknown>)?.['energy-kcal_100g'])
          .map((p: Record<string, unknown>) => {
            const n = p.nutriments as Record<string, number>;
            return {
              name:     String(p.product_name),
              brand:    String(p.brands ?? ''),
              protein100: +(n['proteins_100g'] ?? 0).toFixed(1),
              carbs100:   +(n['carbohydrates_100g'] ?? 0).toFixed(1),
              fat100:     +(n['fat_100g'] ?? 0).toFixed(1),
              kcal100:    Math.round(n['energy-kcal_100g'] ?? 0),
            };
          });
        setResults(parsed);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 500);
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
    setGrams('100');
  }

  function confirm() {
    if (!selected) return;
    const g = Math.max(1, parseFloat(grams) || 100);
    const scale = g / 100;
    onSelect({
      name:     selected.name,
      protein:  +(selected.protein100 * scale).toFixed(1),
      carbs:    +(selected.carbs100   * scale).toFixed(1),
      fat:      +(selected.fat100     * scale).toFixed(1),
      calories: Math.round(selected.kcal100 * scale),
    });
    setQuery(''); setSelected(null); setGrams('100');
  }

  return (
    <div className="mb-3">
      <div className="text-[10px] text-text3 uppercase font-bold mb-1.5 tracking-wider">Search Food Database</div>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          placeholder="e.g. chicken breast, oats..."
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
              className="w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-bg3 transition-colors">
              <div className="text-sm text-text1 font-medium truncate">{f.name}</div>
              <div className="text-[11px] text-text3 mt-0.5">
                {f.brand && <span className="mr-2">{f.brand}</span>}
                <span className="text-warn">{f.kcal100} kcal</span>
                <span className="ml-2 text-info">P {f.protein100}g</span>
                <span className="ml-2 text-text3">per 100g</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="mt-2 bg-accent/5 border border-accent/20 rounded-xl p-3 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-text2 font-semibold truncate">{selected.name}</div>
            <div className="text-[10px] text-text3 mt-0.5">
              Per 100g: {selected.kcal100} kcal · P {selected.protein100}g · C {selected.carbs100}g · F {selected.fat100}g
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <input
              type="number" value={grams} onChange={e => setGrams(e.target.value)}
              className="w-16 bg-bg3 border border-border rounded-lg text-sm px-2 py-1.5 outline-none focus:border-accent text-center text-text1"
            />
            <span className="text-xs text-text3">g</span>
            <button onClick={confirm}
              className="px-3 py-1.5 bg-gradient-to-r from-accent to-green-400 text-black font-bold rounded-lg text-xs">
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
