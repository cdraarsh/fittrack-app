import { DEFAULT_TEMPLATE, type ProgramTemplate } from './templates';

export interface DayInfo {
  /** 1..days-per-cycle, repeating in order (Day 1, 2, 3, 4, 1, 2, …). */
  day: number;
  /** Which pass through the cycle (1-based). */
  cycle: number;
  /** Exercise category of this day, e.g. "Upper · Push". */
  category: string;
  /** "Day 2 · Lower · Quads" */
  label: string;
}

/**
 * Sessions stay numbered underneath (seq drives the locked progression); the
 * app shows them as a repeating Day 1–4 cycle labelled by exercise category.
 */
export function dayInfo(
  s: { seq: number; template_key: string; title?: string | null },
  template: ProgramTemplate = DEFAULT_TEMPLATE,
): DayInfo {
  const perCycle = Math.max(1, template.rotation.length);
  const day = ((s.seq - 1) % perCycle) + 1;
  const cycle = Math.floor((s.seq - 1) / perCycle) + 1;
  const category =
    template.sessions[s.template_key]?.category ?? (s.title?.split('—').pop()?.trim() || `Day ${day}`);
  return { day, cycle, category, label: `Day ${day} · ${category}` };
}
