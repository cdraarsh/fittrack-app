/**
 * FitTrack v2 is a single-user app with no sign-in. Every row belongs to this
 * id; it is the `sub` claim of the Supabase JWT minted by /api/token, so RLS
 * (`public.requesting_user_id()`) keeps working unchanged.
 */
export const OWNER_ID = process.env.NEXT_PUBLIC_OWNER_ID || 'owner';
