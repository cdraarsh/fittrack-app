/**
 * Deterministic UUID-shaped ids derived from a name, so regenerating the same
 * program (or re-saving the same set) produces the same primary keys and
 * upserts stay idempotent. Not cryptographic — only needs to be collision-free
 * within one user's data.
 */
function hash32(str: string, seed: number): number {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // final avalanche (murmur3 fmix32)
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function deterministicUuid(name: string): string {
  const hex = [0x9e3779b9, 0x7f4a7c15, 0x94d049bb, 0x2545f491]
    .map((seed) => hash32(name, seed).toString(16).padStart(8, '0'))
    .join('');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Stable id for the set_logs row of one set. */
export function setLogId(sessionExerciseId: string, setIndex: number): string {
  return deterministicUuid(`set:${sessionExerciseId}:${setIndex}`);
}
