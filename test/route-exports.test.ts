// @vitest-environment node
/**
 * Next.js route files may only export HTTP handlers and route config; anything
 * else fails `next build` type validation (it broke a production deploy once).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ALLOWED = new Set([
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS',
  'dynamic', 'dynamicParams', 'revalidate', 'fetchCache', 'runtime', 'preferredRegion', 'maxDuration', 'generateStaticParams',
]);

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? routeFiles(p) : e.name === 'route.ts' ? [p] : [];
  });
}

describe('route files', () => {
  it('export only handlers and route config', () => {
    const bad: string[] = [];
    for (const f of routeFiles(path.resolve(__dirname, '../app'))) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:const|let|function|class|interface|type)\s+(\w+)/gm)) {
        if (!ALLOWED.has(m[1])) bad.push(`${path.relative(process.cwd(), f)}: ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
