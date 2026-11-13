/**
 * Re-verify every video in lib/exercises/videos.ts against YouTube oEmbed and
 * check coverage of the exercise library + warm-up/cool-down items.
 *
 *   npx tsx scripts/check-videos.ts
 *
 * Fails (exit 1) when an entry doesn't return 200, or an id is neither mapped
 * nor listed in NO_VIDEO. A changed title/channel is reported as a warning
 * (creators rename videos) — eyeball it still matches the exercise.
 */
import { EXERCISES } from '../lib/exercises/seed';
import { NO_VIDEO, VIDEOS, YOUTUBE_ID_RE, watchUrl } from '../lib/exercises/videos';
import { ROUTINE_ITEMS } from '../lib/program/routines';

async function oembed(videoId: string): Promise<{ status: number; title?: string; author?: string }> {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl(videoId))}&format=json`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url);
      if (r.status !== 200) return { status: r.status };
      const j = (await r.json()) as { title?: string; author_name?: string };
      return { status: 200, title: j.title, author: j.author_name };
    } catch {
      await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
    }
  }
  return { status: 0 };
}

async function main() {
  const expected = [...EXERCISES.map((e) => e.id), ...Object.keys(ROUTINE_ITEMS)];
  const problems: string[] = [];
  const warnings: string[] = [];

  for (const id of expected) {
    if (!VIDEOS[id] && !NO_VIDEO.includes(id)) problems.push(`${id}: no video and not listed in NO_VIDEO`);
  }
  for (const id of Object.keys(VIDEOS)) {
    if (!expected.includes(id)) problems.push(`${id}: mapped but not an exercise or routine item`);
  }

  const entries = Object.entries(VIDEOS);
  let passed = 0;
  const queue = [...entries];
  async function worker() {
    for (let e = queue.shift(); e; e = queue.shift()) {
      const [key, v] = e;
      if (!YOUTUBE_ID_RE.test(v.id)) {
        problems.push(`${key}: malformed video id ${v.id}`);
        continue;
      }
      const r = await oembed(v.id);
      if (r.status !== 200) {
        problems.push(`${key}: ${v.id} → HTTP ${r.status}`);
        continue;
      }
      passed++;
      if (r.title !== v.title) warnings.push(`${key}: title now "${r.title}" (recorded "${v.title}")`);
      if ((r.author ?? '').trim() !== v.channel.trim()) warnings.push(`${key}: channel now "${r.author}" (recorded "${v.channel}")`);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));

  for (const w of warnings) console.warn(`warn  ${w}`);
  for (const p of problems) console.error(`FAIL  ${p}`);
  console.log(
    `${passed}/${entries.length} videos verified (200) · ${expected.length} ids expected · ${NO_VIDEO.length} intentionally without video`,
  );
  process.exit(problems.length ? 1 : 0);
}

void main();
