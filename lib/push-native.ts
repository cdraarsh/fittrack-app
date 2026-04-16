/**
 * push-native.ts — Capacitor native push notification handler
 *
 * Called once from AppShell when running inside the native app (not the browser PWA).
 * Handles two things:
 *
 * 1. Push notifications: request permission, get FCM/APNs token, register with /api/push/subscribe
 * 2. Clerk auth ITP fix: on iOS, WKWebView sessions expire after 24h due to Apple ITP.
 *    Route the Clerk sign-in URL through SFSafariViewController (via @capacitor/browser)
 *    which shares the system browser's cookie jar and is ITP-exempt.
 */

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { Browser } from '@capacitor/browser';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

// ─── Platform detection ──────────────────────────────────────────────────────

export const isNative = (): boolean => Capacitor.isNativePlatform();
export const nativePlatform = (): 'android' | 'ios' | null =>
  isNative() ? (Capacitor.getPlatform() as 'android' | 'ios') : null;

// ─── Push notifications ──────────────────────────────────────────────────────

/**
 * Register for native push notifications.
 * - Requests permission (shows system prompt on first call)
 * - On grant: gets FCM (Android) or APNs (iOS) token
 * - Posts token to /api/push/subscribe
 *
 * Safe to call on every app launch — upsert is idempotent.
 */
export async function registerNativePush(): Promise<void> {
  if (!isNative()) return;

  const platform = nativePlatform()!;

  try {
    // Check/request permission
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'prompt') {
      permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== 'granted') {
      console.log('[push-native] permission not granted:', permission.receive);
      return;
    }

    // Register with APNs / FCM — triggers 'registration' event with the token
    await PushNotifications.register();

    // One-time listener for the token
    await new Promise<void>((resolve, reject) => {
      PushNotifications.addListener('registration', async (token) => {
        try {
          const res = await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'native',
              platform,
              token: token.value,
            }),
          });
          if (!res.ok) {
            console.error('[push-native] subscribe failed:', await res.text());
          } else {
            console.log('[push-native] registered:', platform, token.value.slice(0, 12) + '…');
          }
        } catch (err) {
          console.error('[push-native] subscribe error:', err);
        } finally {
          resolve();
        }
      });

      PushNotifications.addListener('registrationError', (err) => {
        console.error('[push-native] registration error:', err);
        reject(err);
      });

      // Safety timeout — don't hang forever if APNs/FCM is slow
      setTimeout(() => resolve(), 10_000);
    });

    // Handle foreground notifications (app is open)
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[push-native] foreground notification:', notification.title);
      // Haptic feedback for foreground notifications
      void Haptics.impact({ style: ImpactStyle.Light });
    });

    // Handle notification tap (app opened from notification)
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[push-native] notification tapped:', action.notification.title);
      // Future: deep link to relevant tab based on notification data
    });
  } catch (err) {
    // Push setup failure is non-fatal — app works without notifications
    console.error('[push-native] setup error (non-fatal):', err);
  }
}

// ─── Clerk auth ITP fix ──────────────────────────────────────────────────────

/**
 * Open a URL in SFSafariViewController (iOS) or Chrome Custom Tab (Android).
 *
 * Use this for Clerk sign-in/sign-up URLs on native platforms.
 * SFSafariViewController shares the system browser's cookie jar — it's ITP-exempt.
 * WKWebView (the default Capacitor WebView) has ITP that kills cross-site
 * cookies/sessions after 24h, which silently expires Clerk sessions.
 *
 * Usage in your sign-in component:
 *   if (isNative()) {
 *     await openInSystemBrowser(clerkSignInUrl);
 *   } else {
 *     // normal <SignIn> component
 *   }
 */
export async function openInSystemBrowser(url: string): Promise<void> {
  await Browser.open({
    url,
    windowName: '_self',
    presentationStyle: 'popover',
  });
}

/**
 * Close the system browser (call after Clerk redirects back into the app).
 */
export async function closeSystemBrowser(): Promise<void> {
  await Browser.close();
}

// ─── Haptics helpers ─────────────────────────────────────────────────────────

/** Light haptic — use on set completion, water log, toggle */
export async function hapticLight(): Promise<void> {
  if (!isNative()) return;
  await Haptics.impact({ style: ImpactStyle.Light });
}

/** Medium haptic — use on workout completion, streak milestone */
export async function hapticMedium(): Promise<void> {
  if (!isNative()) return;
  await Haptics.impact({ style: ImpactStyle.Medium });
}

/** Heavy haptic — use on PR hit, goal reached */
export async function hapticHeavy(): Promise<void> {
  if (!isNative()) return;
  await Haptics.impact({ style: ImpactStyle.Heavy });
}
