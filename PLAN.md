<!-- /autoplan restore point: /Users/aarsh/.gstack/projects/cdraarsh-fittrack-app/main-autoplan-restore-20260416-121233.md -->
# Plan: Convert FitTrack PWA → Native Android + iOS Apps

**Status:** Draft  
**Branch:** main  
**Version:** 1.6.0 → 1.7.0  
**Date:** 2026-04-16

---

## Problem

FitTrack is a Next.js 15 PWA deployed on Vercel. Users can "Add to Home Screen" on iOS/Android, but this gives them a stripped browser experience — no app store presence, no real push notifications on iOS, no deep OS integration (health data, widgets, haptics). Retention for fitness apps is dramatically better with native-feeling apps in the app stores.

## Goal

Ship FitTrack on the Google Play Store and Apple App Store with:
- The same UI and feature set as the current web app
- Real push notifications on iOS (impossible with web PWA)
- App store discoverability
- Native feel (haptics, splash screen, status bar)

---

## Approach: Capacitor → Live Vercel URL (APPROVED)

Wrap the existing Next.js app using **Ionic Capacitor** — Capacitor's WebView loads `https://fittrack-app-neon.vercel.app`. The native shell provides push notifications (APNs + FCM), haptics, splash screen, and app store presence.

**Zero changes to the existing Next.js codebase.** All API routes, Clerk auth, AI coach, food search, and push subscription logic stay exactly as-is on Vercel.

```typescript
// capacitor.config.ts
{
  appId: 'com.fittrack.app',
  appName: 'FitTrack',
  server: {
    url: 'https://fittrack-app-neon.vercel.app',
    cleartext: false
  }
}
```

**Why this over static export:**
- All 5 API routes work unchanged (Anthropic key never leaves Vercel servers)
- Clerk auth works (WebView + @capacitor/browser for iOS SFSafariViewController)
- Push notifications: replace web-push VAPID with APNs/FCM native tokens
- 3-5 days of work instead of 3-4 weeks

**Platforms:** Android + iOS simultaneously.

---

## Scope

### In scope (v1.7.0 → native)

1. **`capacitor.config.ts`** — New file, configure app ID `com.fittrack.app`, server URL `https://fittrack-app-neon.vercel.app`, `allowNavigation` to Vercel domain only
2. **`android/`** — Capacitor-generated Android project (via `npx cap add android`), `minSdkVersion=30`
3. **`ios/`** — Capacitor-generated iOS project (via `npx cap add ios`)
4. **`lib/push-native.ts`** — Native push notification handler using `@capacitor/push-notifications`; requests permission, registers token, posts to `/api/push/subscribe`
5. **`app/api/push/subscribe/route.ts`** — Add native token path: accepts `{type:'native', platform:'android'|'ios', token:string}` in addition to existing web push body
6. **`app/api/cron/reminders/route.ts`** — Add FCM + APNs send paths alongside existing `web-push`; use FCM batch endpoint; log per-channel success/failure to Supabase
7. **`supabase/migrations/YYYYMMDD_native_push.sql`** — `ALTER TABLE ft_push_subscriptions ADD COLUMN push_type text DEFAULT 'web', ADD COLUMN native_token text, ADD COLUMN native_platform text;` + backfill `UPDATE ... SET push_type = 'web' WHERE native_token IS NULL`
8. **`public/capacitor-offline.html`** — Simple offline fallback page shown when WebView can't reach Vercel
9. **`package.json`** — Add `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`, `@capacitor/push-notifications`, `@capacitor/browser`, `@capacitor/haptics`, `@capacitor/splash-screen`

**NOT in scope (was in original plan, removed):**
- `next.config.ts` changes (no static export needed)
- `components/auth/CapacitorAuth.tsx` (Clerk `@capacitor/browser` handled in `lib/push-native.ts` init, not a separate component)

### Out of scope (deferred)

- Apple Health / Google Fit integration (v2.0)
- App Store screenshots and ASO copy
- In-app purchases / subscription billing
- Background sync when app is closed
- Widget support (iOS Home Screen widgets)
- Biometric auth (Face ID / fingerprint)

---

## Key Technical Challenges

### 1. Clerk auth in WKWebView (iOS) — CRITICAL
Apple's Intelligent Tracking Prevention (ITP) strips cross-site cookies in WKWebView after 24h. Clerk sessions silently expire. Fix: use `@capacitor/browser` to open the sign-in flow in SFSafariViewController (iOS) or Chrome Custom Tab (Android), which share the system browser's cookie jar and are ITP-exempt.

Implementation: detect `Capacitor.isNativePlatform()` in the auth init path; if native, route auth through `Browser.open()` instead of the embedded `<SignIn>` component.

### 2. Push notifications — native vs web
APNs (iOS) and FCM (Android) use device tokens (strings), not Web Push Subscription objects. The `ft_push_subscriptions` table stores Web Push JSON today. Schema migration adds `push_type`, `native_token`, `native_platform` columns. Cron sends via three channels: `web-push` (existing), FCM HTTP v1 API (Android native), APNs HTTP/2 (iOS native).

### 3. FCM + APNs credentials
- Apple Developer Program: $99/yr (required for APNs `.p8` key)
- Google Play Console: $25 one-time
- Firebase project: free, provides FCM service account key
- All credentials stored as Vercel env vars (never in repo)
- APNs `.p8` key expires: set annual calendar reminder

### 4. Offline graceful degradation
WebView requires internet. On no-network: Capacitor Network plugin detects offline → show `capacitor-offline.html` instead of blank screen.

### 5. Capacitor JS bridge security
Third-party scripts in the WebView can call Capacitor plugins if not restricted. Fix: `server.allowNavigation` whitelist in `capacitor.config.ts` + strict CSP headers on Vercel responses.

---

## Implementation Steps (APPROVED approach — Capacitor → live URL)

1. `npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios @capacitor/push-notifications @capacitor/browser @capacitor/haptics @capacitor/splash-screen`
2. `npx cap init` — app ID: `com.fittrack.app`, app name: `FitTrack`
3. Write `capacitor.config.ts` — server URL, allowNavigation whitelist, splash screen config
4. `npx cap add android && npx cap add ios`
5. Set `minSdkVersion=30` in `android/app/build.gradle`
6. Write `supabase/migrations/YYYYMMDD_native_push.sql` — ALTER TABLE + backfill UPDATE
7. Update `app/api/push/subscribe/route.ts` — accept native token body shape
8. Write `lib/push-native.ts` — permission request, token registration, `@capacitor/browser` auth routing
9. Update `app/api/cron/reminders/route.ts` — add FCM + APNs send paths
10. Write `public/capacitor-offline.html` — offline fallback
11. Add FCM service account key + APNs `.p8` key to Vercel env vars
12. `npx cap sync`
13. Generate app icons + splash screen from `public/icon-512.png` via `@capacitor/assets`
14. Test in Android Studio emulator + Xcode simulator
15. Test on real devices (see test plan)
16. Submit to Google Play internal test track + TestFlight

---

## Risks

- **Clerk WebView auth** is the highest-risk item — Clerk may change OAuth behavior
- **Apple App Store review** — apps that are "just websites" get rejected; need to demonstrate native value (push notifications, haptics, offline mode)
- **Static export breaks** — any component using `useSearchParams` without Suspense boundary, or dynamic routes without `generateStaticParams`, will fail the build
- **API key security** — moving Anthropic calls to client-side would expose the key in the bundle; must keep those server-side

---

## Risks (updated)

- **Clerk + ITP on iOS** — mitigated by `@capacitor/browser` routing (Critical, resolved in plan)
- **Migration backfill** — included in migration SQL (Critical, resolved in plan)
- **Apple App Store review** — native push + haptics + splash demonstrate native value; risk low
- **FCM rate limiting at scale** — mitigated by batch endpoint + error logging
- **Android keystore loss** — back up to password manager immediately on generation; cannot update app without it
- **APNs certificate expiry** — set calendar reminder for 1 year from enrollment

## Success Criteria

- App installs and runs from Play Store (internal track) within 2 weeks
- App installs and runs from TestFlight within 3 weeks
- Push notifications fire on both iOS and Android
- Clerk sign-in works inside the native shell
- All existing features (workout log, nutrition, AI coach) functional

---

# /autoplan CEO Review

## PRE-REVIEW SYSTEM AUDIT

**Git state:** 12 commits on main branch. No stash, no open PRs. Recent activity concentrated on `generate-plan/route.ts`, `lib/types.ts`, and `TodayTab.tsx` — all safe, no conflicts with this plan.

**Design doc:** Prior /office-hours doc found for AI Friend Layer (v1.5). No design doc for native conversion.

**TODOS.md:** Not present.

**Code pattern inventory:**
- 5 API routes: `/api/coach`, `/api/generate-plan`, `/api/push/subscribe`, `/api/food/search`, `/api/cron/reminders`
- All 4 client-facing routes called via `fetch('/api/...')` from client components
- Clerk: server-side `auth()` in API routes + `useAuth()` in `lib/store.tsx`
- Push: `web-push` server-side VAPID, subscription stored in Supabase
- No static-export-compatible flag set (`output: 'export'` is NOT in `next.config.ts`)

**Taste calibration:**
- Well-designed: `lib/store.tsx` (clean context pattern, stable Supabase client), `app/api/coach/route.ts` (proper auth enforcement, streaming)
- Anti-pattern: plan's `CapacitorAuth.tsx` idea is hypothetical — Clerk's hosted OAuth already works in in-app browsers without a custom component

---

## Step 0: Scope Challenge + Mode Selection

### 0A. Premise Challenge

**Premise 1: Static export is required for Capacitor.**
FALSE. Capacitor can load content in two ways:
1. Static bundle (files copied into `android/` and `ios/`) — requires `output: 'export'`
2. Live URL (WebView loads `https://fittrack-app-neon.vercel.app`) — requires ZERO Next.js changes

The plan chose approach 1 without evaluating approach 2. This is the wrong default. FitTrack has 5 API routes with server-side Clerk auth and Anthropic API keys. Migrating them to static export would break everything and require weeks of re-architecture.

**Premise 2: iOS is equally important as Android for the target market.**
Weak. India's Android market share is ~95% in the 23-27 working professional segment. A Play Store listing delivers the distribution goal immediately. iOS App Store is a follow-up, not a simultaneous requirement.

**Premise 3: `CapacitorAuth.tsx` is needed for Clerk.**
Not established. Clerk's SignIn component (`<SignIn routing="hash">`) already works in mobile WebViews — it's a web component that renders in any browser. The OAuth redirect + custom URL scheme is only needed if using Clerk's hosted sign-in URL directly. FitTrack uses the embedded Clerk component which works fine in WKWebView.

**Premise 4: The app would be rejected by Apple for being a "website wrapper."**
Requires mitigation, not avoidance. Apple App Store Review Guideline 4.2 (minimum functionality) is satisfied by: native push notifications (APNs via Capacitor plugin), haptics, splash screen, offline mode indicators. Many successful fitness apps (Strong, Hevy) started as WebView wrappers.

### 0B. Existing Code Leverage

| Sub-problem | Existing code | Reuse status |
|---|---|---|
| UI components | All `components/` + Tailwind | 100% reuse (no changes in WebView approach) |
| Data layer | `lib/store.tsx` + Supabase | 100% reuse |
| Auth | Clerk via `useAuth()` + `auth()` | 100% reuse if WebView approach; 50% if static export |
| AI coach streaming | `app/api/coach/route.ts` | 100% reuse if WebView; needs rewrite if static export |
| Plan generation | `app/api/generate-plan/route.ts` | 100% reuse if WebView; needs rewrite if static export |
| Push notifications | `app/api/push/subscribe/route.ts` + `web-push` | Replace with Capacitor APNs/FCM plugin |
| Food search | `app/api/food/search/route.ts` | 100% reuse if WebView; needs rewrite if static export |

**Plan's static export approach reuses 40% of existing code.** WebView approach reuses 95%.

### 0C. Dream State Mapping

```
CURRENT STATE                    THIS PLAN (as written)           12-MONTH IDEAL
────────────────────────         ────────────────────────         ────────────────────────
Next.js PWA on Vercel            Capacitor + static export        Native apps (Play Store +
Web-only, no App Store           All API routes rewritten         App Store) with real push
PWA "Add to Home Screen"         Clerk auth custom-built          Apple Health / Google Fit
push via web-push (limited)      2-4 weeks of complexity          In-app purchases (₹499/mo)
                                                                   Widget for daily targets
────────────────────────         ────────────────────────         ────────────────────────
```

Better path to 12-month ideal:

```
CURRENT STATE                    BETTER PATH                      12-MONTH IDEAL
────────────────────────         ────────────────────────         ────────────────────────
Next.js PWA on Vercel            Capacitor → live Vercel URL      Same as above
                                 Zero Next.js changes             + static export done
                                 Real push (APNs + FCM)           properly in v2 if needed
                                 1-2 weeks, low risk
                                 Play Store in week 2
```

### 0C-bis. Implementation Alternatives (MANDATORY)

```
APPROACH A: Capacitor → Live Vercel URL (WebView shell)
  Summary: Capacitor wraps a WebView that loads fittrack-app-neon.vercel.app.
           Native shell provides push notifications, haptics, splash screen.
           Zero changes to Next.js codebase.
  Effort:  S (3-5 days)
  Risk:    Low
  Pros:    - No API route changes. Auth, AI, food search all unchanged.
           - Deploys independently of the web app (web stays on Vercel)
           - Fastest path to Play Store (Android week 1)
           - Clerk OAuth works as-is in WebView
  Cons:    - Requires internet (no true offline mode)
           - App Store review risk if no native value added
           - WebView performance slightly worse than native on older Android
  Reuses:  100% of existing Next.js codebase

APPROACH B: Capacitor + Static Export (plan as written)
  Summary: next.config.ts gets `output: 'export'`. All API routes moved
           to direct Supabase/Anthropic client calls or proxied via Vercel.
           CapacitorAuth.tsx built for Clerk OAuth flow.
  Effort:  L (3-4 weeks)
  Risk:    High
  Pros:    - True offline support
           - No Vercel dependency at runtime
           - Faster cold start (no network round-trip for assets)
  Cons:    - All 5 API routes need rewriting (Anthropic key exposed or proxied)
           - Clerk auth custom implementation required
           - Static export breaks `useSearchParams` without Suspense boundaries
           - Food search API (OpenFoodFacts + Supabase) becomes client-side mess
           - High chance of breaking changes during migration
  Reuses:  ~40% of existing codebase

APPROACH C: TWA (Trusted Web Activity) for Android First
  Summary: Android TWA wraps the existing PWA in Chrome Custom Tabs.
           Requires valid manifest.json + service worker (both already exist).
           Gets into Play Store in 1-2 days. iOS via Capacitor WebView later.
  Effort:  XS for Android (1-2 days), S for iOS follow-up (3-5 days)
  Risk:    Very Low for Android
  Pros:    - Android to Play Store in days, not weeks
           - Zero code changes to web app
           - Target market (India) is 95% Android — highest ROI
           - Can run TWA + Capacitor iOS in parallel
  Cons:    - TWA is Android-only (iOS needs Capacitor anyway)
           - Push notifications via TWA require some native code
           - Less control over native UX (uses Chrome, not WKWebView)
  Reuses:  100% of existing codebase

RECOMMENDATION: Approach A (Capacitor → Live URL) or Approach C (TWA-first)
  - For fastest market entry: Approach C (Android TWA this week, Capacitor iOS next week)
  - For single codebase native: Approach A (both platforms, ~1 week total)
  - Approach B (static export) is the worst risk/reward in this stack
```

### 0D. Mode-Specific Analysis (SELECTIVE EXPANSION auto-chosen)

**Complexity check:** Plan as written touches 9 files, introduces 4 new packages and 2 new native projects. That's in range. But the static export choice creates hidden blast radius across all 5 API routes — making it closer to 15+ files in practice.

**Minimum set of changes (WebView approach):**
1. `capacitor.config.ts` (new, 15 lines)
2. `package.json` (4 new Capacitor packages)
3. `lib/push-native.ts` (new, ~50 lines — native push token handler)
4. `app/api/push/subscribe/route.ts` (minor update — accept native token type)
5. `android/` + `ios/` (generated by Capacitor CLI, not hand-written)
6. App icons and splash screen assets

That's it. 4 hand-written files, 2 generated native projects. One week.

**Expansion opportunities (cherry-pick candidates):**
1. **Haptics** — `@capacitor/haptics` on workout set completion (logged → buzz). 30 min.
2. **Status bar theming** — match `#080b10` background. 10 min.
3. **TWA + Android for week 1** — ship to Play Store before iOS is ready. 1-2 days.
4. **App icon + splash** — design from existing brand. Uses `@capacitor/assets`. 2 hours.
5. **Google Fit / Apple Health step count read** — show steps on Today tab. 1 week.
6. **Offline graceful degradation** — detect network offline, disable coach + food search, show banner. 2 hours.

### 0E. Temporal Interrogation

```
HOUR 1 (setup):     npx cap init, add platforms. Decision: which URL to load?
                    Need: final Vercel production URL (fittrack-app-neon.vercel.app)

HOUR 2-3 (push):    APNs requires Apple Developer account ($99/yr). Do you have one?
                    FCM requires Firebase project. Do you have one?
                    These are blocking external dependencies, not code.

HOUR 4-5 (test):    Android emulator in Android Studio. iOS in Xcode.
                    Clerk sign-in: does the WebView honor Clerk's CORS settings?
                    Need to test actual OAuth flow, not assume it works.

HOUR 6+ (stores):   Google Play Console account ($25 one-time).
                    Apple App Store Connect ($99/yr with Developer account).
                    App Store review timeline: Android ~3 days, iOS ~7-14 days.
                    Need: privacy policy URL, app screenshots, app description.
```

### 0F. Mode Selection

AUTO-DECIDED: **SELECTIVE EXPANSION** — this is an infrastructure addition to an existing product. Core scope (Capacitor wrapper) is right. The plan's chosen technical approach (static export) is wrong. Surfacing the approach correction as a USER CHALLENGE.

---

## USER CHALLENGE: Static Export vs WebView-at-Vercel

**What the plan says:** Use Capacitor + static export (`output: 'export'`), rewriting all API routes for client-side execution.

**What both analysis and engineering best practice recommend:** Use Capacitor pointing at the live Vercel URL. Zero Next.js changes required. Same App Store outcome. 80% less work.

**Why:** FitTrack has 5 server-side API routes that depend on Clerk auth and contain the Anthropic API key. Static export drops all of them. Rewriting them either exposes secrets in the client bundle or requires building a proxy layer — which is just a worse version of what Vercel already does. The WebView approach reuses 100% of the existing codebase.

**What we might be missing:** The user may want offline support (no internet = app doesn't work with WebView approach). The user may want to sell the app on Play Store without requiring ongoing Vercel hosting costs.

**If this recommendation is wrong, the cost is:** You keep the plan's static export approach, spend 3-4 extra weeks migrating API routes, and likely hit breaking issues with Clerk auth in static context.

**Your original direction stands unless you explicitly change it.**

---

## Section 1: Architecture Review

### Architecture Diagram (WebView approach — recommended)

```
┌─────────────────────────────────────────────────────────────┐
│  CAPACITOR NATIVE SHELL (iOS / Android)                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  WebView (WKWebView / Android WebView)              │   │
│  │  loads: https://fittrack-app-neon.vercel.app        │   │
│  │                                                     │   │
│  │  ← existing Next.js app, unchanged →               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Native Plugins:                                            │
│  @capacitor/push-notifications → APNs (iOS) / FCM (Android)│
│  @capacitor/haptics             → device vibration          │
│  @capacitor/splash-screen       → launch screen             │
│  @capacitor/browser             → OAuth popups (if needed)  │
└─────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
  Vercel Edge Network             Firebase Cloud Messaging
  (existing, unchanged)           / APNs (new)
         │
         ├── /api/coach       → Anthropic (server key safe)
         ├── /api/generate-plan → Anthropic (server key safe)  
         ├── /api/food/search  → Supabase + OpenFoodFacts
         ├── /api/push/subscribe → Supabase (stores device token)
         └── Supabase DB (all data)
```

**Coupling:** Adding Capacitor creates a new dependency on the deployed Vercel URL. If Vercel goes down, the native app stops working. Mitigation: Vercel has 99.99% uptime SLA on Pro plan.

**Rollback posture:** Easy. If the native app has issues, users continue using the PWA on web. No DB migrations, no data changes.

**Security architecture:** All secrets stay server-side on Vercel. The native app shell has no secrets. APNs/FCM device tokens stored in Supabase under the user's row.

**Single point of failure:** Vercel deployment. Same as today. No new SPOFs introduced.

### Architecture Diagram (Static Export approach — plan as written, NOT recommended)

```
┌─────────────────────────────────────────────────────────────┐
│  CAPACITOR NATIVE SHELL (iOS / Android)                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Static HTML/JS bundle (built into app binary)      │   │
│  │  → Client calls Supabase directly                   │   │
│  │  → Client calls Anthropic directly (KEY IN BUNDLE!) │   │
│  │  → Food search: direct Supabase + OFF fetch         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Problems:                                                  │
│  ⚠ ANTHROPIC_API_KEY exposed in bundle (SECURITY ISSUE)    │
│  ⚠ Clerk server-side auth() calls break entirely           │
│  ⚠ useSearchParams() needs Suspense wrappers               │
│  ⚠ All 5 API routes require rewriting (~200 LOC of risk)   │
└─────────────────────────────────────────────────────────────┘
```

### Section 2: Error & Rescue Map

| Codepath | What can go wrong | Handled? |
|---|---|---|
| Capacitor → Vercel URL load | Network unavailable on app open | No — shows blank WebView. Need offline page. |
| APNs registration | User denies notification permission | No — silent failure, no retry prompt |
| APNs registration | Token registration API call fails | No — push silently broken |
| FCM token | Firebase project misconfigured | No — crash at build time |
| Clerk OAuth in WebView | CORS block on WebView | Unknown — needs testing |
| Push notification tap | Deep link routing in Capacitor | Not specified in plan |

**Gaps:** 5 unhandled error paths. Most critical: Anthropic key exposure in static export approach (security), and offline blank screen in WebView approach (UX).

### Section 3: Security & Threat Model

**WebView approach:**
- No new attack surface. The native shell doesn't handle secrets.
- APNs/FCM tokens: stored in Supabase under user row — same auth model as existing data.
- Risk: WebView can access JavaScript bridge if Capacitor plugins are misconfigured. Mitigation: only register the plugins you use.

**Static export approach (if chosen):**
- CRITICAL: Anthropic API key would need to be bundled in the app or a separate proxy. Bundling it exposes the key to anyone who decompiles the APK. This is a blocker-level security issue.
- Supabase service role key cannot be in the client bundle — would allow any user to bypass RLS.
- Mitigation: proxy layer on Vercel (essentially recreating the existing API routes). This negates the static export benefit.

### Section 4: Data Flow & Interaction Edge Cases

```
Push notification tap:
  NATIVE OS ──▶ Capacitor plugin ──▶ JavaScript event ──▶ ??? 
                                                            │
                                                      Plan doesn't specify
                                                      deep link routing.
                                                      User lands on which page?
```

**Not specified:** What happens when a push notification is tapped while the app is closed vs backgrounded vs foregrounded? Three distinct states, each needs a handler.

**Edge case: app update.** When a new version deploys to Vercel, the WebView will load it automatically on next launch. This is GOOD — no app store update required for most changes.

### Section 5: Test Plan

| Test | Type | Status |
|---|---|---|
| App launches in Android emulator | Manual | Not in plan |
| App launches in iOS simulator | Manual | Not in plan |
| Clerk sign-in completes in WebView | Manual | Not in plan |
| Push notification fires on real Android device | Manual | Not in plan |
| Push notification fires on real iOS device | Manual | Requires Apple Developer account |
| All existing E2E tests still pass (web) | Automated | Existing `.github/workflows/qa.yml` |
| App Store internal track install | Manual | Not in plan |

**Note:** Existing QA workflow (`qa.yml`) tests the web app only. Mobile testing is manual. Consider adding Detox or Maestro for native E2E later.

### Section 6: Performance

**WebView approach:** Each navigation loads from Vercel CDN. First load on app open: ~1-2s (same as web). Subsequent loads: cached by Next.js + Vercel. No performance regression vs web.

**Static export approach:** App bundle grows by ~300-500KB for bundled assets. First load: instant (no network). But AI features (coach, plan generation) still require network.

### Section 7: Deployment

**Release process (WebView approach):**
1. Update web app → deploy to Vercel → instant
2. Update native shell (Capacitor plugins, icons) → rebuild → submit to stores → 3-14 day review

**Version strategy:** Native app version (1.0.0) is separate from web app version (1.7.0). Native version only bumps when the Capacitor shell changes.

### Section 8: Observability

**Not in plan.** Add:
- Capacitor crash reporting (Sentry React Native SDK or Firebase Crashlytics)
- Track push notification delivery and open rate
- Track WebView load time on app open

### Section 9: Accessibility

No regression — native WebView renders the same HTML as the browser. Existing accessibility (if any) is preserved.

### Section 10: Internationalization

N/A — app is in English, targeting India.

### Section 11: UI/Design Scope

Detected: yes. See Phase 2 Design Review below.

---

## NOT In Scope (deferred)

- Apple Health / Google Fit integration → TODOS.md
- In-app purchases / subscription billing → TODOS.md
- Background sync when app is closed → TODOS.md
- Biometric auth (Face ID / fingerprint) → TODOS.md
- Offline-first mode with local SQLite → future consideration only if WebView approach has problems
- Widget (iOS Home Screen / Android home screen) → TODOS.md

## What Already Exists

| Sub-problem | Existing code |
|---|---|
| UI, state, data | 100% of existing Next.js app |
| Push notification server | `app/api/push/subscribe/route.ts` |
| Web push subscription logic | `components/tabs/SettingsTab.tsx:68` |
| Service worker | `public/sw.js` |
| App manifest | `public/manifest.json` |

## CEO Completion Summary

| Section | Finding | Severity | Decision |
|---|---|---|---|
| Premise: static export required | FALSE — WebView approach is better | Critical | USER CHALLENGE |
| Premise: iOS = Android priority | India is 95% Android | High | Recommend Android-first |
| Security: API key in static export | Key exposed if static export used | Critical | Blocks static export approach |
| Error handling: offline WebView | Blank screen, not handled | Medium | Add offline fallback page |
| Error handling: APNs permission denied | Silent failure | Medium | Add retry/prompt logic |
| Error handling: push tap deep link | Not specified | Medium | Needs specification |
| Observability: crash reporting | Not in plan | Low | Add Crashlytics |

## CEO Dual Voices

**CLAUDE SUBAGENT (independent strategic review):**

> "The technical plan is mostly sound (WebView approach over static export is the right call). The strategic plan is solving the wrong problem.
>
> **Critical:** The plan never asks: why does FitTrack have 0 paying users? Building a native shell solves distribution, but distribution is not the constraint when you have no proven retention or monetization. Risk: spending 2-4 weeks on native packaging then learning the product-market fit problem is upstream.
>
> **Assumed premise (high):** 'App store discoverability will drive user acquisition' — India fitness apps (HealthifyMe, Cult.fit) dominate via brand + paid UA, not organic browse. Discoverability for a v1 with 0 reviews is near-zero.
>
> **6-month regret:** April 2027: native app live on Play Store with 0 downloads. The founder spent Q2 on WebView wrappers instead of talking to 20 potential users.
>
> **Dismissed alternative:** WhatsApp/Instagram referral loop for the existing PWA could get 50 test users in 2 weeks at zero engineering cost. That data would determine whether native is worth building at all.
>
> **Competitive risk:** HealthifyMe, Fittr, Cult.fit have native apps + 10M+ users. The moat is the AI coach, not the app store listing. Fix retention and willingness-to-pay on 20 users via the existing PWA first. Then wrap it."

**CODEX:** Unavailable — proceeding with Claude subagent only [subagent-only].

```
CEO DUAL VOICES — CONSENSUS TABLE:
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Premises valid?                   NO      N/A    CONCERN
  2. Right problem to solve?           NO      N/A    CONCERN
  3. Scope calibration correct?        MIXED   N/A    MIXED
  4. Alternatives sufficiently explored?NO     N/A    CONCERN
  5. Competitive/market risks covered? NO      N/A    CONCERN
  6. 6-month trajectory sound?         RISK    N/A    CONCERN
═══════════════════════════════════════════════════════════════
Key: CONCERN = concern flagged. MIXED = WebView approach right, strategy risky.
Single model review — all findings tagged [subagent-only].
```

**Cross-phase theme emerging:** The subagent and primary review independently identified the same root concern — distribution before validation. This is a high-confidence signal.

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|----------|
| 1 | CEO | Mode: SELECTIVE EXPANSION | Mechanical | P3 (pragmatic) | Feature enhancement on existing system | EXPANSION |
| 2 | CEO | WebView vs static export | USER CHALLENGE | — | Both analysis and eng best practice agree static export is wrong approach | Static export |
| 3 | CEO | Android-first recommendation | Taste | P6 (bias to action) | India is 95% Android, TWA gets Play Store in 1-2 days | iOS-first |
| 4 | CEO | Approach A (Capacitor→URL) recommended | Taste | P1+P5 | Complete native support, explicit over clever, lowest risk | Approach B |
| 5 | CEO | Android-first (TWA or Capacitor) | Taste | P6 | India 95% Android, fastest path to Play Store | iOS-first |
| 6 | Design | Offline page required | Mechanical | P1 | Blank WebView on no internet is poor UX | Skip it |
| 7 | Design | Splash screen from existing assets | Mechanical | P5 | public/icon-512.png already exists | Custom design |
| 8 | Eng | DB migration needs backfill | Mechanical | P1 | Existing rows get NULL not 'web' — breaks first cron run | Skip backfill |
| 9 | Eng | Clerk auth via @capacitor/browser | Mechanical | P1 | ITP kills WKWebView sessions after 24h | Embedded component |
| 10 | Eng | CSP + allowNavigation in capacitor config | Mechanical | P5 | Blocks JS bridge from third-party XSS | Skip it |
| 11 | Eng | FCM batch endpoint + error logging | Mechanical | P1 | Rate limiting causes silent failure at scale | Individual sends |
| 12 | Eng | minSdkVersion=30 | Mechanical | P5 | Android 10 WebView too old for Next.js 15 | No constraint |

---

# Phase 3: Eng Review

## Scope Challenge

Plan touches: `capacitor.config.ts` (new), `package.json`, `lib/push-native.ts` (new), `app/api/push/subscribe/route.ts` (update), generated `android/` + `ios/` dirs, plus app icons. 6 hand-written files plus Capacitor-generated native projects. In range.

**Critical gap the plan doesn't resolve:** The push subscription system stores Web Push Subscription JSON objects (`{ endpoint, keys: { auth, p256dh } }`) in `ft_push_subscriptions.subscription`. Native push uses FCM registration tokens (strings, ~150 chars) or APNs device tokens. These are different types. The schema and cron reminder route need to handle both simultaneously (users may have web + native).

## Architecture ASCII Diagram

```
BEFORE (web only):
─────────────────────────────────────────────
  Browser                Vercel
  ┌──────────┐           ┌────────────────────────────┐
  │ FitTrack │──fetch──▶│ /api/push/subscribe         │
  │   PWA    │           │   stores WebPushSubscription│──▶ Supabase
  │ sw.js    │◀──push── │ /api/cron/reminders          │
  └──────────┘           │   sends via web-push VAPID  │──▶ Browser Push
                         └────────────────────────────┘

AFTER (WebView approach):
─────────────────────────────────────────────
  Capacitor App          Vercel
  ┌──────────────────┐   ┌────────────────────────────┐
  │ @cap/push-notifs │──▶│ /api/push/subscribe (update)│
  │  token: "fcm_xxx"│   │  stores: {type:'native',   │──▶ Supabase
  │  or "apns_xxx"   │   │   platform:'android'|'ios', │    ft_push_subscriptions
  │ WebView          │   │   token: "fcm_xxx"}         │    (schema needs update)
  │  (Vercel app)    │   │ /api/cron/reminders (update)│
  └──────────────────┘   │  sends web-push for web subs│──▶ Browser Push
                         │  sends FCM for android      │──▶ FCM ──▶ Android
                         │  sends APNs for iOS         │──▶ APNs ──▶ iOS
                         └────────────────────────────┘
```

## Section 1: Architecture

**New coupling introduced:** `app/api/cron/reminders/route.ts` needs to branch on subscription type. Low coupling concern — it's a cron that already knows about subscription shapes.

**Schema change needed:** `ft_push_subscriptions` table currently stores `subscription jsonb` (Web Push subscription object). Needs to accommodate native tokens. Options:
1. Add columns: `push_type text` ('web'|'native'), `native_token text`, `native_platform text`
2. Store everything as JSON, use type discriminator in the JSON

Option 1 is cleaner (explicit, queryable, no JSON parsing in SQL).

**Required migration:**
```sql
ALTER TABLE ft_push_subscriptions
  ADD COLUMN push_type text DEFAULT 'web',
  ADD COLUMN native_token text,
  ADD COLUMN native_platform text;
```

## Section 2: Code Quality

`lib/push-native.ts` (plan mentions it but doesn't spec it):
```typescript
// What it needs to do:
// 1. Check if running in Capacitor (PushNotifications.checkPermissions)
// 2. Request permission if not granted
// 3. Get registration token
// 4. POST to /api/push/subscribe with {type: 'native', platform, token}
// 5. Handle permission denied gracefully (don't retry every launch)
```

`app/api/push/subscribe/route.ts` needs to handle two body shapes:
- Web: `{ endpoint, keys: { auth, p256dh } }` (current)
- Native: `{ type: 'native', platform: 'android'|'ios', token: string }` (new)

`app/api/cron/reminders/route.ts` needs to send via three channels:
- `web-push` for web subscriptions (current)
- FCM HTTP v1 API for Android native tokens (new)
- APNs HTTP/2 for iOS native tokens (new)

## Section 3: Test Plan (NEVER SKIP)

### Test diagram — new codepaths

| New codepath | Test type | Coverage |
|---|---|---|
| Capacitor app launches in Android WebView | Manual emulator | Not written |
| Capacitor app launches in iOS WKWebView | Manual simulator | Not written |
| `lib/push-native.ts` → permission granted flow | Manual device | Not written |
| `lib/push-native.ts` → permission denied flow | Manual device | Not written |
| `lib/push-native.ts` → token registration to API | Unit test | Not written |
| `/api/push/subscribe` POST with native body | Unit test | Not written |
| `/api/push/subscribe` POST with web body | Existing behavior | Not written |
| Cron sends FCM notification | Integration test | Not written |
| Cron sends APNs notification | Integration test | Not written |
| Push notification tap → app opens | Manual device | Not written |
| Existing web PWA push still works | Regression | Implicit |

**Critical gap:** The plan includes zero test specification for native paths. All native testing is manual.

**What would break at 2am Friday:** FCM credential rotation (Firebase service account key expires → all Android notifications silently fail). Add monitoring: log FCM send success/failure rate, alert on >10% failure.

### Test plan artifact

```
FITTRACK NATIVE — TEST PLAN v1.0

AUTOMATED (existing):
  - qa.yml E2E: web app flows (unchanged)
  - Unit tests: push API endpoint shape validation (NEW — write these)

MANUAL (required before store submission):
  Android:
    □ App installs from local build
    □ Sign in via Clerk (OAuth flow in WebView)
    □ Dashboard loads, all tabs functional
    □ Workout log, nutrition, AI coach all work
    □ Push notification received on device
    □ Push notification tap opens app
    □ App works on Android 10, 12, 14

  iOS:
    □ App installs from TestFlight
    □ Sign in via Clerk
    □ Dashboard loads, all tabs functional
    □ Push notification received on device
    □ Push notification tap opens app
    □ App works on iOS 16, 17, 18

EXTERNAL DEPENDENCIES:
  □ Apple Developer Program enrolled ($99/yr)
  □ APNs certificate generated
  □ Google Play Console account ($25 one-time)
  □ Firebase project created
  □ FCM service account key in Vercel env vars
```

## Section 4: Performance

No regression. WebView approach loads from Vercel CDN — same as browser. Capacitor adds ~2MB to app binary (native shell + plugins). Acceptable.

**Concern:** Cold start on slow network — WebView loads `fittrack-app-neon.vercel.app` which has auth redirect. User sees a white screen for 1-2s before the dashboard loads. Mitigation: splash screen stays visible until `app_ready` event fires.

## Section 5: Security (Eng perspective)

**Not a new concern (WebView approach):** All API keys stay on Vercel servers. Native shell has no secrets.

**New concern:** FCM service account key needs to be added to Vercel env vars. This is a `FIREBASE_SERVICE_ACCOUNT_JSON` (Base64-encoded JSON ~2KB). Must be set via `vercel env add` not committed to repo.

**APNs:** Uses a `.p8` key file. Same — add as env var, not committed.

## Section 6: Deployment

**Play Store:** Internal test track → open testing → production. Requires: app bundle signed with keystore (generate once, store securely — do NOT lose this). If the keystore is lost, you cannot update the app.

**App Store:** TestFlight → App Store. Requires: Xcode cloud or manual archive + upload.

## Section 7: Failure Modes Registry

| Failure mode | Probability | Impact | Plan addresses? |
|---|---|---|---|
| FCM key expires or is revoked | Low | All Android push breaks | No |
| APNs certificate expires (1yr) | Medium | All iOS push breaks | No |
| Vercel deployment fails, app shows error | Low | All native app users can't use app | No |
| Android keystore lost | Very low | Can never update Play Store app | No |
| Clerk WebView CORS blocks OAuth | Unknown | Users can't sign in on native | No |
| Firebase project deleted | Very low | All Android push breaks | No |

**Critical gap:** APNs certificates expire annually. Plan needs a reminder/automation to renew.

## Eng Completion Summary

| Section | Finding | Severity |
|---|---|---|
| Schema: ft_push_subscriptions | Needs new columns for native token type | High |
| Code: cron/reminders | Needs 3-channel send logic (web/FCM/APNs) | High |
| Tests: native paths | Zero test specification for native | Medium |
| APNs cert expiry | Not in plan, silent failure annually | Medium |
| Keystore backup | Not mentioned, loss = can't update app | High |
| Cold start UX | Splash screen needs app_ready signal | Low |

## ENG DUAL VOICES

**CLAUDE ENG SUBAGENT findings:**

> **Critical: Clerk iOS session expiry via ITP in WKWebView.** Apple's Intelligent Tracking Prevention strips cross-site cookies after 24h in WKWebView. Clerk sessions silently expire. The plan says "test it" but this will break in production after one day. Fix: use `@capacitor/browser` (SFSafariViewController on iOS, Chrome Custom Tab on Android) for the Clerk auth flow regardless of whether the embedded component appears to work in testing.
>
> **Critical: `ft_push_subscriptions` migration backfill missing.** `ALTER TABLE ADD COLUMN push_type text DEFAULT 'web'` only sets DEFAULT for NEW rows. Existing rows get `NULL`. Any query filtering `WHERE push_type = 'web'` misses all existing subscribers. First cron run after migration sends zero web push notifications. Fix: add `UPDATE ft_push_subscriptions SET push_type = 'web' WHERE native_token IS NULL;` inside the migration transaction.
>
> **High: Capacitor JS bridge exposed to third-party scripts.** Any XSS'd script (analytics, error tracker) running in the WebView can call Capacitor plugins. Fix: set `server.allowNavigation` to only the Vercel domain and configure strict CSP.
>
> **High: FCM rate limit + no queue.** Current cron sends individually. FCM per-project rate limits will cause partial failures at scale with no error surface. Fix: use FCM batch endpoint (500 messages/request) + log per-channel success/failure counts to Supabase.
>
> **High: Android WebView minimum version not pinned.** Android 10 ships WebView 83; Next.js 15 likely uses CSS/JS requiring Chrome 105+. Fix: set `minSdkVersion=30` (Android 11, WebView 86+, ~92% of Indian active devices).

**CODEX:** Unavailable [subagent-only]

```
ENG DUAL VOICES — CONSENSUS TABLE:
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Architecture sound?               MOSTLY  N/A    PARTIAL
  2. Test coverage sufficient?         NO      N/A    CONCERN
  3. Performance risks addressed?      YES     N/A    CONFIRMED
  4. Security threats covered?         NO      N/A    CONCERN
  5. Error paths handled?              NO      N/A    CONCERN
  6. Deployment risk manageable?       RISK    N/A    CONCERN
═══════════════════════════════════════════════════════════════
[subagent-only] — Codex unavailable.
```

## Updated Eng Completion Summary

| Section | Finding | Severity | Source |
|---|---|---|---|
| ft_push_subscriptions schema | Needs new columns | High | Primary |
| cron/reminders | Needs 3-channel send logic | High | Primary |
| Migration backfill | Missing — existing web subs lost | Critical | Subagent |
| Clerk iOS ITP | Sessions expire 24h in WKWebView | Critical | Subagent |
| Capacitor JS bridge | XSS → plugin call risk | High | Subagent |
| FCM rate limiting | No queue → silent partial failure | High | Subagent |
| Android minSdkVersion | Not pinned → CSS crash on Android 10 | High | Subagent |
| APNs cert expiry | Annual renewal not in plan | Medium | Primary |
| Android keystore backup | Not mentioned | High | Primary |
| Test coverage: native | Zero automated tests for native paths | Medium | Primary |


---

## GSTACK REVIEW REPORT

| Review | Phase | Runs | Status | Key Findings |
|--------|-------|------|--------|--------------|
| CEO Review | Phase 1 | 1 | issues_open | Static export approach wrong (USER CHALLENGE → resolved); PMF concern flagged |
| CEO Voices | Phase 1 | 1 | issues_open | Claude subagent [subagent-only]; 0/6 confirmed, 6 concerns |
| Design Review | Phase 2 | 1 | clean | Offline page + splash screen added; no unresolved issues |
| Eng Review | Phase 3 | 1 | issues_open | 2 critical: Clerk ITP, migration backfill; 5 high: JS bridge, FCM queue, minSdkVersion, keystore, APNs expiry |
| Eng Voices | Phase 3 | 1 | issues_open | Claude subagent [subagent-only]; 1/6 confirmed, 5 concerns |
| DX Review | — | 0 | skipped | FitTrack is not a developer tool |

**VERDICT:** APPROVED with fixes incorporated. The plan has been updated to reflect:
- Capacitor → live Vercel URL (not static export)
- Clerk auth via @capacitor/browser (ITP fix)
- DB migration backfill for existing push subscribers
- Android minSdkVersion=30
- FCM batch endpoint + error logging
- capacitor.config.ts allowNavigation + CSP

Test plan artifact: `~/.gstack/projects/cdraarsh-fittrack-app/main-native-app-test-plan-*.md`
