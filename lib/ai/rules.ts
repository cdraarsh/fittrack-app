// ─── Rule-based daily insight ─────────────────────────────────────────────────
// Pure, no server imports: used when no AI key is configured, when every
// provider fails, and by the client when offline (same stats pack shape).

import type { StatsPack } from './stats';

const fmtKg = (kg: number) => `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`;

function readinessLine(pack: StatsPack): string | null {
  const r = pack.recovery;
  if (!r || r.stale) return null;
  const parts: string[] = [];
  const { sleepH, hrv, restingHr, bodyBattery } = r.metrics;
  if (sleepH.value !== null) parts.push(`sleep ${sleepH.value} h`);
  if (hrv.value !== null) parts.push(hrv.avg28 !== null ? `HRV ${hrv.value} (28d avg ${hrv.avg28})` : `HRV ${hrv.value}`);
  else if (restingHr.value !== null)
    parts.push(restingHr.avg28 !== null ? `RHR ${restingHr.value} (avg ${restingHr.avg28})` : `RHR ${restingHr.value}`);
  if (bodyBattery.value !== null) parts.push(`Body Battery ${bodyBattery.value}`);
  const head =
    r.readiness === 'low'
      ? 'Recovery is low — keep loads, trim a set if it drags'
      : r.readiness === 'moderate'
        ? 'Recovery is so-so — train as planned, stop a rep early'
        : 'Recovery looks good';
  return parts.length ? `${head}: ${parts.join(', ')}.` : `${head}.`;
}

function sessionLine(pack: StatsPack): string | null {
  const p = pack.program;
  if (!p) return null;
  const next = p.nextSession;
  if (!next) return p.total > 0 ? `Program complete: ${p.completed}/${p.total} sessions done.` : null;
  const head = `Up next: session ${next.seq}/${p.total}${next.title ? ` · ${next.title}` : ''}`;
  const loads = next.exercises
    .filter(e => e.targetKg !== null && e.targetKg! > 0)
    .slice(0, 3)
    .map(e => `${e.name} ${fmtKg(e.targetKg!)}${e.sets && e.reps ? ` ${e.sets}×${e.reps}` : ''}`);
  return loads.length ? `${head} — ${loads.join(', ')}.` : `${head}.`;
}

function trendLine(pack: StatsPack): string | null {
  const best = [...pack.trends.e1rm]
    .filter(t => t.changePct !== null)
    .sort((a, b) => Math.abs(b.changePct!) - Math.abs(a.changePct!))[0];
  if (best && best.changePct !== 0) {
    const latest = [...best.weekly].reverse().find(x => x !== null);
    return `${best.name} e1RM ${best.changePct! > 0 ? 'up' : 'down'} ${Math.abs(best.changePct!)}% over 28 days${
      latest != null ? ` (now ${fmtKg(latest)})` : ''
    }.`;
  }
  const a = pack.trends.adherence;
  if (a && a.expected > 0) return `Adherence: ${a.completed}/${a.expected} sessions in the last 28 days (${a.pct}%).`;
  const bw = pack.bodyweight;
  if (bw?.avg7 != null) {
    return bw.change != null
      ? `Bodyweight 7-day avg ${fmtKg(bw.avg7)} (${bw.change >= 0 ? '+' : ''}${bw.change} kg vs the 7 days before).`
      : `Bodyweight 7-day avg ${fmtKg(bw.avg7)}.`;
  }
  return null;
}

export function ruleBasedInsight(pack: StatsPack): string {
  const lines = [readinessLine(pack), sessionLine(pack), trendLine(pack)].filter((l): l is string => !!l);
  if (pack.program?.daysSinceLast != null && pack.program.daysSinceLast >= 4 && lines.length < 3) {
    lines.push(`${pack.program.daysSinceLast} days since your last session — today's a good day to get it done.`);
  }
  return lines.length ? lines.slice(0, 3).join('\n') : 'Log your first session and the daily insight will start here.';
}
