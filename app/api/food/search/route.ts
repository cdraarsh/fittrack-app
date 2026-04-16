import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/node';

export const dynamic = 'force-dynamic';

export interface FoodResult {
  name: string;
  brand: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  source: string;
  serving_size_g: number | null;
  serving_unit: string | null;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json([]);

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Check local DB first (manual Indian staples + cached OFF results)
  const { data: local } = await sb
    .from('ft_foods')
    .select('name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g, source, serving_size_g, serving_unit')
    .ilike('name', `%${q}%`)
    .limit(8);

  // Sort: manual (seeded) entries before cached OFF results
  const localHits: FoodResult[] = (local ?? []).sort((a, b) =>
    a.source === 'manual' ? -1 : b.source === 'manual' ? 1 : 0
  );

  if (localHits.length >= 3) {
    return NextResponse.json(localHits);
  }

  // 2. Fall back to Open Food Facts (4s timeout)
  let offHits: FoodResult[] = [];
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&json=1&page_size=8&fields=product_name,brands,nutriments`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const data = await res.json();

    offHits = (data.products ?? [])
      .filter((p: Record<string, unknown>) =>
        p.product_name && (p.nutriments as Record<string, unknown>)?.['energy-kcal_100g']
      )
      .map((p: Record<string, unknown>) => {
        const n = p.nutriments as Record<string, number>;
        return {
          name:         String(p.product_name),
          brand:        String(p.brands ?? ''),
          kcal_100g:    Math.round(n['energy-kcal_100g'] ?? 0),
          protein_100g: +((n['proteins_100g'] ?? 0).toFixed(1)),
          carbs_100g:   +((n['carbohydrates_100g'] ?? 0).toFixed(1)),
          fat_100g:     +((n['fat_100g'] ?? 0).toFixed(1)),
          source:       'openfoodfacts',
          serving_size_g: null,
          serving_unit:   null,
        };
      });

    // 3. Cache new OFF results in the background (fire-and-forget)
    if (offHits.length > 0) {
      void (async () => {
        try { await sb.from('ft_foods').insert(offHits); } catch { /* ignore duplicates */ }
      })();
    }
  } catch (err) {
    // OFF is down or timed out — return whatever we have locally
    Sentry.captureException(err, { extra: { query: q, context: 'open-food-facts-fallback' } });
  }

  // Merge: local entries first, then OFF results not already in local
  const localNames = new Set(localHits.map(f => f.name.toLowerCase()));
  const merged = [
    ...localHits,
    ...offHits.filter(f => !localNames.has(f.name.toLowerCase())),
  ].slice(0, 8);

  return NextResponse.json(merged);
}
