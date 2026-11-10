const KEY = 'fittrack:uid';

/** Last signed-in Clerk user id, so the app can open offline before Clerk loads. */
export function getCachedUserId(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setCachedUserId(id: string | null): void {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: online-only fallback */
  }
}
