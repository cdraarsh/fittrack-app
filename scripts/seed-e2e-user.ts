/**
 * Seeds the E2E test user with:
 * 1. A valid ft_settings row (onboarded=true)
 * 2. A progress-photos storage bucket (if missing)
 * 3. A seeded photo row in ft_photos
 *
 * Usage: npx tsx --env-file=.env.local scripts/seed-e2e-user.ts
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const USER_ID = process.env.E2E_TEST_USER_ID!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !USER_ID) {
  console.error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, E2E_TEST_USER_ID');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const today = new Date().toISOString().split('T')[0];

// Start of the week containing today (Monday)
const d = new Date();
const day = d.getDay(); // 0=Sun, 1=Mon, ...
const startOfWeek = new Date(d);
startOfWeek.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); // go back to Monday
const weekStart = startOfWeek.toISOString().split('T')[0];

const settings = {
  name: 'E2E Tester',
  startDate: weekStart, // Monday of current week — avoids week offset issues
  gymDays: ['monday', 'wednesday', 'friday', 'saturday'], // lowercase to match DAYS constant
  cals_gym: 2100,
  cals_rest: 1850,
  protein: 155,
  fat: 70,
  weight_start: 80,
  height: 175,
  onboarded: true,
  plan: 'free',
  programWeeks: 16,
};

async function main() {
  // 1. Seed ft_settings
  const { error: settingsErr } = await db
    .from('ft_settings')
    .upsert({ user_id: USER_ID, data: settings, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

  if (settingsErr) {
    console.error('ft_settings seed failed:', settingsErr.message);
    process.exit(1);
  }
  console.log(`✓ ft_settings seeded for ${USER_ID}`);

  // 2. Ensure progress-photos bucket exists
  const { data: buckets } = await db.storage.listBuckets();
  const bucketExists = buckets?.some(b => b.name === 'progress-photos');
  if (!bucketExists) {
    const { error: bucketErr } = await db.storage.createBucket('progress-photos', {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
    });
    if (bucketErr && !bucketErr.message.includes('already exists')) {
      console.error('Bucket create failed:', bucketErr.message);
      process.exit(1);
    }
    console.log('✓ progress-photos bucket created');
  } else {
    console.log('✓ progress-photos bucket already exists');
  }

  // 3. Seed a photo entry — upload the fixture photo directly via service role
  const fixturePath = path.join(process.cwd(), 'e2e/fixtures/progress-photo.jpg');
  if (!fs.existsSync(fixturePath)) {
    console.warn('⚠ Fixture photo not found at', fixturePath, '— skipping photo seed');
    return;
  }

  const storagePath = `${USER_ID}/seed-photo.jpg`;
  const fileData = fs.readFileSync(fixturePath);

  // Upload (upsert so re-runs don't fail)
  const { error: uploadErr } = await db.storage
    .from('progress-photos')
    .upload(storagePath, fileData, { contentType: 'image/jpeg', upsert: true });

  if (uploadErr) {
    console.error('Photo upload failed:', uploadErr.message);
    process.exit(1);
  }

  // Create signed URL valid for 1 year
  const { data: signedData, error: signErr } = await db.storage
    .from('progress-photos')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

  if (signErr || !signedData) {
    console.error('Signed URL failed:', signErr?.message);
    process.exit(1);
  }

  // Upsert the ft_photos row (use stable UUID so re-runs are idempotent)
  const SEED_PHOTO_ID = '00000000-e2e0-0000-0000-000000000001';
  const { error: photoErr } = await db
    .from('ft_photos')
    .upsert(
      { id: SEED_PHOTO_ID, user_id: USER_ID, date: today, url: signedData.signedUrl, storage_path: storagePath, note: 'E2E seed photo' },
      { onConflict: 'id' }
    );

  if (photoErr) {
    console.error('ft_photos seed failed:', photoErr.message);
    process.exit(1);
  }
  console.log(`✓ ft_photos seeded (seed photo url: ${signedData.signedUrl.slice(0, 60)}...)`);
}

main();
