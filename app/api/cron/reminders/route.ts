import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export const dynamic = 'force-dynamic';

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// ─── FCM (Android) ────────────────────────────────────────────────────────────

/** Minimal JWT builder for Google service account using Web Crypto (no external deps) */
async function buildServiceAccountJwt(clientEmail: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: clientEmail, sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })}`;
  const pemBody = privateKeyPem.replace(/-----.*?-----/g, '').replace(/\s/g, '');
  const keyData = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyData, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsigned));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${unsigned}.${sigB64}`;
}

async function sendFcm(token: string, title: string, body: string): Promise<void> {
  const saKey     = process.env.FCM_SERVICE_ACCOUNT_KEY;
  const projectId = process.env.FCM_PROJECT_ID;
  if (!saKey || !projectId) throw new Error('FCM_SERVICE_ACCOUNT_KEY or FCM_PROJECT_ID not set');
  const sa  = JSON.parse(saKey) as { client_email: string; private_key: string };
  const jwt = await buildServiceAccountJwt(sa.client_email, sa.private_key);
  const { access_token } = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })).json() as { access_token: string };
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token, notification: { title, body }, android: { priority: 'high' } } }),
  });
  if (!res.ok) throw new Error(`FCM ${res.status}: ${await res.text()}`);
}

// ─── APNs (iOS) ──────────────────────────────────────────────────────────────

async function sendApns(deviceToken: string, title: string, body: string): Promise<void> {
  const keyId    = process.env.APNS_KEY_ID;
  const teamId   = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID ?? 'com.fittrack.app';
  const p8Key    = process.env.APNS_P8_KEY;
  if (!keyId || !teamId || !p8Key) throw new Error('APNs env vars not set (APNS_KEY_ID, APNS_TEAM_ID, APNS_P8_KEY)');

  const now = Math.floor(Date.now() / 1000);
  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsigned = `${encode({ alg: 'ES256', kid: keyId })}.${encode({ iss: teamId, iat: now })}`;

  const pemBody = p8Key.replace(/-----.*?-----/g, '').replace(/\s/g, '');
  const keyData = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyData, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, new TextEncoder().encode(unsigned)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const res = await fetch(`https://api.push.apple.com/3/device/${deviceToken}`, {
    method: 'POST',
    headers: {
      'authorization':  `bearer ${unsigned}.${sigB64}`,
      'apns-topic':     bundleId,
      'apns-push-type': 'alert',
      'apns-priority':  '10',
      'content-type':   'application/json',
    },
    body: JSON.stringify({ aps: { alert: { title, body }, sound: 'default', badge: 1 } }),
  });
  if (!res.ok) throw new Error(`APNs ${res.status}: ${await res.text()}`);
}

// ─── Cron handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  webpush.setVapidDetails(
    process.env.VAPID_EMAIL!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  const todayName = DAY_NAMES[new Date().getUTCDay()];

  const { data: subs, error } = await supabaseAdmin
    .from('ft_push_subscriptions')
    .select('user_id, push_type, subscription, native_token, native_platform');

  if (error || !subs?.length) return NextResponse.json({ sent: 0 });

  const { data: settingsRows } = await supabaseAdmin
    .from('ft_settings')
    .select('user_id, data')
    .in('user_id', subs.map(s => s.user_id));

  const settingsMap = new Map((settingsRows ?? []).map(r => [r.user_id, r.data]));

  const title      = 'Time to train 💪';
  const body       = "Today's a gym day — open FitTrack to log your workout.";
  const webPayload = JSON.stringify({ title, body, tag: 'workout-reminder', url: '/dashboard' });

  let webSent = 0, fcmSent = 0, apnsSent = 0;
  const errors: string[] = [];

  await Promise.allSettled(subs.map(async (sub) => {
    if (!settingsMap.get(sub.user_id)?.gymDays?.includes(todayName)) return;

    if (sub.push_type === 'native') {
      if (!sub.native_token || !sub.native_platform) return;
      try {
        if (sub.native_platform === 'android') { await sendFcm(sub.native_token, title, body); fcmSent++; }
        else if (sub.native_platform === 'ios') { await sendApns(sub.native_token, title, body); apnsSent++; }
      } catch (err) { errors.push(`native(${sub.native_platform}): ${String(err)}`); }
    } else {
      if (!sub.subscription?.endpoint) return;
      try { await webpush.sendNotification(sub.subscription, webPayload); webSent++; }
      catch (err) { errors.push(`web: ${String(err)}`); }
    }
  }));

  if (errors.length) console.error('[cron/reminders] errors:', errors);
  console.log('[cron/reminders]', { webSent, fcmSent, apnsSent, errors: errors.length });
  return NextResponse.json({ webSent, fcmSent, apnsSent, errors: errors.length });
}
