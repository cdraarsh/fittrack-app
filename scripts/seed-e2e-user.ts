/**
 * Seeds the E2E test user's v2 settings (no program: the app generates one).
 *
 * Usage: npx tsx --env-file=.env.local scripts/seed-e2e-user.ts
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const USER_ID = process.env.E2E_TEST_USER_ID || process.env.NEXT_PUBLIC_OWNER_ID || 'owner';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !USER_ID) {
  console.error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, E2E_TEST_USER_ID');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const { error } = await db.from('user_settings').upsert(
  { user_id: USER_ID, preferred_days: [1, 2, 4, 5], timezone: 'UTC', unlock_rule: 'immediate' },
  { onConflict: 'user_id' },
);
if (error) {
  console.error(error);
  process.exit(1);
}
console.log('Seeded user_settings for', USER_ID);
