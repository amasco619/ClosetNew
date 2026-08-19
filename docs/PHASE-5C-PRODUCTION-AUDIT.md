# PHASE 5C — MASTER PRODUCTION AUDIT REPORT

> **Historical report — do not use this document for native identity, OAuth, Apple, Google, or store setup.** Its `com.amodka` and legacy callback findings were superseded by Phase 5C.2 before any public release. Use [PHASE-5C.2-NATIVE-PRODUCTION-FOUNDATION.md](./PHASE-5C.2-NATIVE-PRODUCTION-FOUNDATION.md) and [PHASE-5C.2-MANUAL-ACTIONS-REQUIRED.md](./PHASE-5C.2-MANUAL-ACTIONS-REQUIRED.md) for current, authoritative guidance targeting `com.amodka.app`.

**Project**: Amodka (formerly AuraCloset)  
**Audit date**: 2026-08-18  
**Auditor**: Replit Agent (read-only inspection — no code changes made)  
**Baseline**: Phase 5B.1 complete — 40/40 RLS PASS, 9/9 service-role DELETE PASS, 48/48 npm test PASS, 0 TypeScript errors  
**Constraint**: Recommendation Engine v3.7 FROZEN. No implementation in this phase.

---

## PART 1 — BUSINESS RISK AUDIT

### Priority 0 — Can Lose Money

**P0-A: Premium state is locally trusted, never server-verified at startup**

`contexts/AppContext.tsx` loads `isPremium` from `AsyncStorage` key `@amodka_premium` at boot. The server is never consulted on startup to re-validate premium status against `user_profiles.premium` or `premium_expires_at`. A user who modifies AsyncStorage (jailbroken/rooted device, Android emulator with root access, or iOS simulator) can grant themselves permanent free premium by writing `"true"` to `@amodka_premium`. The server endpoint `/api/user/upgrade-premium` correctly writes to `user_profiles.premium` in Supabase, but the mobile client never reads that column on startup — it trusts the local cache unconditionally.

**P0-B: No payment implementation exists**

`/api/user/upgrade-premium` sets `premium = true` and `premium_expires_at = NOW() + 1 year` with no payment verification of any kind. There is no Stripe, RevenueCat, Google Play Billing, or Apple In-App Purchase integration in the codebase. No webhook handlers. No receipt validation. No subscription state tracking. This endpoint is currently a free premium-grant button accessible to any authenticated user. The `app/(tabs)/premium.tsx` screen exists and contains a CTA but it leads to no verified payment flow.

**P0-C: Subscription expiry is stored but never enforced**

`premium_expires_at` is written to `user_profiles` but never checked at runtime anywhere in the codebase. The app reads `isPremium` from AsyncStorage, not from Supabase, so an expired subscription retains full premium access indefinitely on that device.

**P0-D: No restore-purchases mechanism**

After reinstall or device change, AsyncStorage is cleared. There is no flow to restore a subscription — the user loses premium access and must contact support or repurchase. With real money involved, this pattern generates chargebacks and support escalations.

**P0-E: No cancellation or renewal handling**

There is no subscription cancellation webhook, no Apple App Store Server Notifications handler, and no Google Play Real-time Developer Notifications handler. When a subscription expires or is cancelled, the server state will never be updated automatically.

---

### Priority 1 — Can Lose or Expose Data

**P1-A: `@auracloset_*` keys visible in profile data-export UI**

`app/(tabs)/profile.tsx` lines 784–796 list 13 `@auracloset_*` keys alongside the current `@amodka_*` keys in a user-facing "Clear local data" / debug section. This exposes implementation internals (including the old brand name) to users. The storage migration runs at startup, but old keys may persist on devices that skipped a version or where migration failed silently.

**P1-B: `auracloset://` URI scheme still active in server**

`server/routes.ts:69,77,93` falls back to `"auracloset://"` as the sanitized redirect default.  
`server/index.ts:249,259,275,283` still matches and processes `auracloset://` deep links in the OAuth relay.  
`__tests__/oauthDismissGuard.test.ts:97` uses `auracloset://` as the test target URL.  
`.local/tasks/` task files reference `auracloset://` in root-cause descriptions.  
The `auracloset` scheme is not registered in `app.json` — only `amodka` is. This means if the fallback fires, the deep link is a ghost that iOS/Android cannot route.

**P1-C: `[AuraCloset]` log prefixes in AppContext**

`contexts/AppContext.tsx:491,503` emits `[AuraCloset]` prefixed log strings to the console during wardrobe photo recovery. These are not user-visible but will appear in crash reports and log aggregators under the old brand.

**P1-D: Garment classification logged per user**

`server/classify-garment.ts:788`:
```
console.log(`[classify] user=${userId} → ${subType} (${colorFamily}) conf=${confidence}`)
```
This logs the user's garment classification results (subtype + color family) linked to `userId` to stdout. If stdout flows to a log aggregator (Logtail, Datadog, Papertrail), this creates a persistent record of individual wardrobe items per user. Under NDPA (Nigeria) and GDPR (EU/UK users) garment attributes linked to a specific person are personal data.

**P1-E: IP geolocation fallback sends device IP to ipapi.co without disclosure**

When GPS permission is denied, `constants/weather.ts` calls `https://ipapi.co/json/`. ipapi.co receives the device's public IP address. This is undisclosed third-party data sharing. ipapi.co has its own data retention and processing policies that the user has not been informed about.

**P1-F: No data export mechanism**

There is no way for a user to request a machine-readable copy of their data (wardrobe items, wear logs, outfit reactions, affinity signals, profile). This is required under NDPA Article 29 and GDPR Article 20 (data portability). App Store Connect also prompts for a data access mechanism in the App Privacy section.

**P1-G: SHA-256 image hashes stored in Postgres indefinitely**

`server/bgRemovalStore.ts` stores per-image SHA-256 hashes and per-user usage counts in a Postgres table. These hashes persist after an item is deleted. While a hash alone does not reconstruct an image, it does confirm that a specific image was ever submitted for background removal. There is no TTL or cleanup policy on these records.

**P1-H: `server/README.md` still says "AuraCloset Backend"**

Not a security risk, but it will appear in any developer-facing documentation under the wrong brand.

---

### Priority 2 — Legal and Regulatory Exposure

**Complete data inventory for legal documents:**

| Data category | Storage location | Retention | Third-party processor |
|---|---|---|---|
| Email address | Supabase Auth | Until account deletion | Supabase (EU/US) |
| Password hash (bcrypt) | Supabase Auth | Until account deletion | Supabase |
| Wardrobe images (original) | Supabase Storage `wardrobe-images/` | Until item deletion | Supabase |
| Wardrobe images (background-removed) | Transmitted to PhotoRoom; result returned; original not retained by PhotoRoom (to verify) | Transaction only (PhotoRoom) | PhotoRoom API (EU) |
| Garment images (base64) sent for classification | Transmitted to Gemini; result returned | API transaction only (per Google API terms) | Google Gemini API (US) |
| Garment metadata (subtype, fabric, color, pattern, fit, neckline, sleeve, warmth, occasions) | Supabase `wardrobe_items` + AsyncStorage | Until item deletion | None |
| Body/profile data (height, body type, skin tone, face shape) | AsyncStorage + Supabase `user_profiles` | Until account deletion | None |
| Style preferences, goals, occasions | AsyncStorage + Supabase `user_profiles` | Until account deletion | None |
| Location coordinates (lat/lon) | AsyncStorage `@amodka_weather_v1` only — not transmitted to server | 6-hour TTL cache | Open-Meteo (anonymous, no key) |
| IP address (weather fallback only) | Not stored by the app — sent to ipapi.co | ipapi.co's own policy | ipapi.co |
| Wear history / outfit log dates | AsyncStorage + Supabase `wear_logs` | Until account deletion | None |
| Outfit reactions (love/not-today/worn) | AsyncStorage + Supabase `affinity_signals` | Until account deletion | None |
| Recommendation telemetry (occasion, wardrobe_size, body_type, style_goal) | Server stdout only (no vendor yet) | Session log rotation only | None |
| Image hashes (SHA-256) | Postgres `bg_removal_cache` table | Indefinite — no TTL | None |
| Device locale/timezone | Read via expo-localization at runtime | Not persisted | None |
| Premium status and expiry | AsyncStorage + Supabase `user_profiles` | Until account deletion | None |

**What the Privacy Policy must accurately reflect:**
- PhotoRoom processes wardrobe images for background removal (image sent to PhotoRoom API; result returned; state their data retention period once confirmed)
- Google Gemini processes garment images for AI classification (image sent as base64; structured metadata returned; Google API data usage terms state API inputs are not used for model training — this must be verified and cited)
- Open-Meteo receives anonymous coordinates for weather (no account, no key, GDPR-compliant by design)
- ipapi.co receives the device's public IP address when GPS is denied (undisclosed third-party processor — must be added to privacy policy and consent flow, or the IP fallback must be moved server-side)
- Supabase is the infrastructure processor for auth, database, and storage
- AsyncStorage is local device storage only (not transmitted to servers)
- Account deletion procedure: what it covers (storage files, DB rows, auth user) and timing
- Data retention periods for each category
- User rights: access, rectification, erasure, portability, restriction
- Body/health data: Apple classifies body type and measurements as "Health & Fitness" data in the App Privacy section — this requires explicit disclosure

**What must appear in the App Store "Data Linked to You" disclosure:**
- Contact info (email address)
- Photos/videos (wardrobe images)
- Health & fitness (body type, height — Apple classifies these here)
- Usage data (wear logs, outfit reactions)
- User content (wardrobe items, style preferences)

**What must appear in the Google Play Data Safety form:**
- All categories above
- Image processing by third parties (PhotoRoom, Gemini)
- Explicit disclosure that AI is used for classification
- Explicit disclosure that background removal is performed by PhotoRoom

**Nigeria NDPA considerations:**
- Data controller registration may be required (NITDA)
- Data subject rights must be exercisable in-app (access, correction, deletion — deletion is implemented; access/portability are not)
- Cross-border transfers to Supabase (US), Google (US), PhotoRoom (EU/US) require appropriate safeguards (standard contractual clauses or adequacy decisions)
- A Data Protection Impact Assessment (DPIA) is recommended given the processing of body measurements and wardrobe images

---

## PART 2 — AUTHENTICATION AUDIT

### Email / Password

**Registration**: `POST /api/auth/sign-up` → server validates email format and password strength (minimum 8 characters, at least one uppercase letter and one number) → calls Supabase `signUp`. The endpoint is enumeration-resistant: it always returns a generic success-like message regardless of whether the email already exists. Email confirmation is required before login. **✅ Adequate.**

**Email verification**: Supabase sends a confirmation email. The app shows a "Check your email" screen. On code exchange, `EMAIL_CONFIRMED_KEY` is stored in AsyncStorage. The app gates protected screens behind email confirmation state. **✅ Adequate.**

**Login**: `POST /api/auth/sign-in` → `supabase.auth.signInWithPassword`. Rate-limited at 5 attempts per 15 minutes (Postgres-backed `lockout_store`). After 5 failures within the window, the account is locked for 15 minutes. Error messages are generic ("Invalid credentials") and do not reveal whether the email exists. **✅ Adequate.**

**Logout**: `signOut()` calls `supabase.auth.signOut()`. On failure, falls back to local scope signout so the UI always resets. **✅ Adequate.**

**Password reset**: `POST /api/auth/reset-password` → validates `redirectTo` against an HTTPS-only allowlist → calls Supabase `resetPasswordForEmail`. Enumeration-resistant (always returns 200 regardless of whether the email exists). Redirect URL is sanitized before being passed to Supabase. **✅ Adequate.**

**Session persistence**: Supabase JS SDK handles via `SecureStore` adapter configured in `lib/supabase.ts`. The access token is stored in Secure Enclave (iOS) / Android Keystore (Android). **✅ Adequate.**

**Session expiration**: `requireAuth` middleware in `server/middleware/auth.ts` calls `supabase.auth.getUser()` for every authenticated request — it does not trust the JWT claims alone, it re-validates with Supabase on every call. This means a revoked token is rejected within seconds. **✅ Adequate.**

**Account deletion**: Two paths — in-app (authenticated DELETE via `requireAuth`) and web OTP form (for users who cannot sign in). Both paths delete Supabase Storage files, all 9 DB tables (wardrobe_items, wear_logs, affinity_signals, outfit_slots, user_profiles, pair_affinity, tryon_profiles, saved_looks, recommendation_cache), and the auth user. Validated 9/9 PASS in Phase 5B.1. **✅ Complete.**

---

### Google OAuth

**Current implementation**: `lib/auth.ts` → `signInWithGoogle()` calls `supabase.auth.signInWithOAuth({ provider: 'google', skipBrowserRedirect: true })` to get the URL, then calls `openOAuthSessionWithFallback()`.

**Development (Expo Go)**: Uses PKCE + a relay pattern. `buildNativeOAuthRedirectTo()` detects the Expo Go environment and builds a relay URL using the stable Replit HTTPS domain (`$REPLIT_DEV_DOMAIN`) with a `nativeCallback` query parameter. The OAuth relay page in `server/index.ts` (lines ~249–283) processes `nativeCallback` and issues a 302 redirect to `exp://`. On iOS, ASWebAuthenticationSession intercepts `exp://`. On Android, Chrome Custom Tab hands off to Expo Go via the `exp://` intent. Deduplication guards (`oauthInProgress`, `handledDeepLink`) prevent double-processing. **This works in development.**

**Production (standalone build)**: `nativeRedirectTo = makeRedirectUri({ scheme: 'amodka' })` → `amodka://`. The standalone build receives the `amodka://` deep link via the Intent Filter registered in `app.json` (Android: `action: VIEW, scheme: amodka, category: BROWSABLE|DEFAULT`). On iOS, the `amodka` scheme is in `app.json expo.scheme`.

**Critical production gap — Android**: `app.json` does not contain a `googleServicesFile` path in the `android` section. The Android OAuth flow using Google Sign-In requires:
1. SHA-1 certificate fingerprint registered in Google Cloud Console for the `com.amodka` package
2. A `google-services.json` file from Firebase Console
3. The file path added to `app.json android.googleServicesFile`

Without this, Google OAuth will silently fail on a production Android build. It may work in Expo Go via the web relay (which uses the web OAuth client, not the Android client) but will fail in a standalone `.apk` or `.aab`.

**Critical production gap — Supabase redirect allowlist**: `amodka://` must be in the Supabase Auth → URL Configuration → Redirect URLs list. The relay logic in `server/index.ts:259` currently also accepts `auracloset://` — this ghost scheme acceptance should be removed once the app is fully rebranded.

**iOS production**: ASWebAuthenticationSession with scheme `amodka://` will work provided the Supabase redirect URL allowlist includes `amodka://**` and the `amodka` scheme is registered in `app.json` (it is). No `universalLinks` or `associatedDomains` are configured (not required for custom-scheme OAuth, but required for Universal Links if ever used).

**Return-to-native behaviour**: On iOS, ASWebAuth intercepts `amodka://` and closes the browser — the user returns to the native app. On Android, Chrome Custom Tab processes the Intent Filter match for `scheme: amodka` — the user returns to the native app. **This is correctly handled for production standalone builds, but only if the `google-services.json` and SHA-1 are configured.**

---

### Apple OAuth / Sign-In

**Current implementation**: `lib/auth.ts` uses `supabase.auth.signInWithOAuth({ provider: 'apple' })` — this is Supabase-mediated Apple OAuth via web flow, NOT native `expo-apple-authentication` (`ASAuthorizationAppleIDRequest`).

**Why this is a production blocker**: Apple App Store Guideline 4.8 states: *"Apps that use a third-party or social login service to set up or authenticate the user's primary account with the app must also offer Sign in with Apple as an equivalent option."* The app offers Google Sign-In. Therefore, native Sign in with Apple is mandatory for App Store approval.

**What the web OAuth flow lacks**:
- `expo-apple-authentication` is **not installed** (not in `package.json`)
- `com.apple.developer.applesignin` entitlement is **not** in `app.json ios.entitlements`
- The Apple Developer App ID does not have the Sign in with Apple capability enabled
- Supabase's Apple provider is not configured with the Service ID and private key

**Private relay email implications**: When a user selects "Hide My Email", Apple sends a relay address (`@privaterelay.appleid.com`) instead of the real email. This relay address is stored in `auth.users.email`. Account deletion via email OTP flow will attempt to send a one-time code to the relay address — Apple forwards it, so this works. However, support workflows referencing the email will see a relay address, not a real one. Passwords cannot be reset (the user has no Apple-relay password). The app's email-based support must handle this gracefully.

**Account linking concern**: A user who first registers with email `user@example.com` and later signs in with Apple's "Hide My Email" creates a new Supabase account with a different email (the relay address). They now have two accounts. Supabase does not automatically link accounts across auth methods. This creates duplicate-account support burden. The inverse (registering via Apple, then attempting email sign-in) produces "user already exists" confusion.

**Required Apple Developer configuration** (not yet done):
1. Enable "Sign in with Apple" capability for the `com.amodka` App ID in Apple Developer Portal
2. Create a Services ID (e.g., `com.amodka.siwa`) with the domain pointing to the Supabase project and return URL `https://<project>.supabase.co/auth/v1/callback`
3. Create an Apple private key with Sign in with Apple entitlement, note the Key ID
4. Enter the Service ID, Team ID, Key ID, and private key `.p8` contents into Supabase → Authentication → Providers → Apple
5. Add `com.apple.developer.applesignin` to `app.json ios.entitlements`
6. Install `expo-apple-authentication` and add it to `app.json plugins`

---

## PART 3 — PAYMENTS & ENTITLEMENTS AUDIT

### Where premium state is stored and its trust classification

| Location | Mechanism | Trust classification |
|---|---|---|
| React state `isPremium` | In-memory; set from AsyncStorage on load | **Client-trusted** |
| `AsyncStorage @amodka_premium` | Local device storage; cleared on reinstall | **Client-trusted** |
| `user_profiles.premium` (Supabase) | PostgreSQL boolean column | **Server-authoritative** |
| `user_profiles.premium_expires_at` | PostgreSQL timestamp | **Server-authoritative (not enforced)** |

### Every entitlement transition classified

| Transition | Mechanism | Classification |
|---|---|---|
| Grant premium | `POST /api/user/upgrade-premium` → DB write | **Server-verified** (write) |
| Load premium on app startup | `AsyncStorage.getItem('@amodka_premium')` | **Client-trusted** ❌ |
| Premium check during session | `isPremium` React state derived from AsyncStorage | **Client-trusted** ❌ |
| Premium check for background removal (server) | Checked via `requireAuth` + optional DB lookup | **Server-verified** ✅ |
| Premium check for outfit generation | `isPremium` state passed from AppContext | **Client-trusted** ❌ |
| Premium check for scenario access | `isPremium` in `app/(tabs)/outfits.tsx` | **Client-trusted** ❌ |
| Premium check for wardrobe item cap | `isPremium ? Infinity : FREE_ITEM_CAP` in AppContext | **Client-trusted** ❌ |
| Subscription expiry enforcement | **Never enforced anywhere** | **Absent** ❌ |
| Subscription cancellation handling | **No mechanism** | **Absent** ❌ |
| Subscription renewal handling | **No mechanism** | **Absent** ❌ |
| Restore purchases after reinstall | **No mechanism** | **Absent** ❌ |
| Refund / revocation handling | **No mechanism** | **Absent** ❌ |

### Specific failure scenarios

| Scenario | Current outcome |
|---|---|
| Payment succeeds but app crashes before AsyncStorage write | User does not receive premium locally; server DB has `premium=true`; on next startup, AsyncStorage check returns false — premium lost from user's perspective despite server record |
| Client reports success without genuine payment | Currently trivially possible: any authenticated call to `/api/user/upgrade-premium` succeeds |
| After reinstall | AsyncStorage cleared → user appears free tier regardless of DB record |
| After device change | Same — no server-to-client sync on startup |
| Payment succeeds but webhook delayed | No webhook infrastructure exists; irrelevant today but critical once payments are live |
| Subscription expires | `premium_expires_at` never read; premium retained indefinitely |
| Cancellation via App Store/Play Store | No server notification handler; premium retained indefinitely |
| Refund granted by Apple/Google | No refund webhook; premium retained indefinitely |

### Required final architecture

The commercial implementation must be server-authoritative:
1. Payment provider (RevenueCat recommended) validates receipt and calls a webhook on Amodka's server
2. Server updates `user_profiles.premium` and `premium_expires_at` based on verified subscription state
3. On every app launch, the client calls a lightweight endpoint (e.g., `GET /api/user/entitlements`) that returns the authoritative premium state from Supabase
4. The client stores this in state (still cached in SecureStore for offline use, but refreshed on every launch)
5. AsyncStorage `@amodka_premium` is deprecated in favour of SecureStore-cached server truth
6. Expiry is enforced server-side: if `premium_expires_at < NOW()`, the endpoint returns `isPremium: false`

---

## PART 4 — SECRET & ENVIRONMENT AUDIT

| Secret / configuration | Client-safe? | Server-only? | Current location | Production recommendation |
|---|---|---|---|---|
| `SUPABASE_URL` | No (contains DB REST path) | ✅ Server-only | Replit Secret | Keep server-only |
| `SUPABASE_SECRET_KEY` (service role key) | ❌ Never | ✅ Server-only | Replit Secret | Keep server-only; rotate before public launch |
| `EXPO_PUBLIC_SUPABASE_URL` | ✅ Publishable (anon endpoint) | — | Replit Secret (EXPO_PUBLIC_) | Bundle in app — intended and correct |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon key) | ✅ Publishable | — | Replit Secret (EXPO_PUBLIC_) | Bundle in app — intended and correct; RLS protects the data |
| `GEMINI_API_KEY` | ❌ Never | ✅ Server-only | Replit Secret | Keep server-only; set daily quota in Google Cloud |
| `PHOTOROOM_API_KEY` | ❌ Never | ✅ Server-only | Replit Secret | Keep server-only |
| `SESSION_SECRET` | ❌ Never | ✅ Server-only | Replit Secret | Keep server-only |
| `DATABASE_URL` | ❌ Never | ✅ Server-only | Replit Secret | Keep server-only (Postgres connection string with credentials) |
| `EXPO_PUBLIC_DOMAIN` | ✅ Publishable | — | Replit env | Required for API URL construction in app |
| Google OAuth Web Client ID | Publishable (client ID is public) | — | Not currently in codebase | Add as `EXPO_PUBLIC_GOOGLE_CLIENT_ID` when implementing Android OAuth |
| Google OAuth Client Secret | ❌ Never | ✅ Supabase dashboard only | Supabase Auth settings | Never put in codebase or EXPO_PUBLIC_ vars |
| Apple Service ID | Publishable | — | Supabase Auth settings | Configure in Supabase only |
| Apple Private Key (.p8) | ❌ Never | ✅ Supabase dashboard only | Supabase Auth settings | Never put in codebase |
| Apple Team ID / Key ID | Publishable | — | Supabase Auth settings | Configure in Supabase only |
| RevenueCat public SDK key | ✅ Publishable | — | To be added as `EXPO_PUBLIC_RC_KEY` | Intended to be bundled in mobile app |
| RevenueCat secret API key | ❌ Never | ✅ Server-only | Replit Secret (future) | Webhook validation only |
| Open-Meteo | N/A — no key required | — | None | No action required |
| ipapi.co | N/A — free tier, no key | — | None | Consider upgrading to authenticated plan for production to avoid rate limits |

**Confirmed: No server secrets are bundled in Expo/React Native code.** All `EXPO_PUBLIC_` variables are legitimately public (anon Supabase key is designed to be public and is protected by RLS). The architecture is correctly separated. There is no `.env` file with hardcoded secrets (per the memory entry, creating such a file would override Replit Secrets and break Supabase initialisation).

---

## PART 5 — AI / IMAGE PROCESSING AUDIT

### Confirmed pipeline order (evidence-based)

```
User selects photo (camera or library)
    ↓
app/add-item.tsx → lib/photoroom.ts
    ↓ POST /api/remove-background (server)
    → server/remove-background.ts
    → PhotoRoom Segment API (multipart/form-data, HTTPS)
    → SHA-256 hash deduplication (Postgres bg_removal_cache)
    → Per-user usage counter (free: 20 lifetime calls)
    → Returns background-removed PNG as base64
    ↓
Background-removed base64 returned to client
    ↓
Client (add-item.tsx) sends background-removed base64 to:
    POST /api/classify-garment (server)
    → server/classify-garment.ts
    → Google Gemini API (base64 image + structured prompt)
    → Gemini returns garment classification JSON
    → Server applies deterministic occasion/season/subtype logic
    → Returns structured WardrobeItem fields (subtype, fabric, color, occasions, etc.)
    ↓
Client assembles WardrobeItem → uploads original photo to Supabase Storage
    → Stores structured metadata to Supabase wardrobe_items table
```

**The requested architecture (PhotoRoom first → Gemini classifies the cleaned garment image) is already the current architecture.** No change is needed. Gemini receives the background-removed image, not the raw photo with background. This is confirmed by the code path: `lib/photoroom.ts` is called in `add-item.tsx` before the classify call.

### Data sent to third parties

**PhotoRoom**: The raw wardrobe image (multipart form-data). PhotoRoom returns a PNG with transparent background. The original is not stored by PhotoRoom after the transaction (to be confirmed in their API terms — see Action 9 in Part 19).

**Gemini**: The background-removed garment image as a base64 string, plus a detailed text prompt describing the classification schema. Gemini returns a JSON object with garment attributes. Per Google's API terms (as of 2026), API inputs are not used to train Google's models. This must be verified at launch and cited in the Privacy Policy.

### Failure handling assessment

| Failure | Server response | Client behaviour | Gap |
|---|---|---|---|
| PhotoRoom 15-second timeout | 504 Gateway Timeout | Alert shown | ✅ Adequate |
| PhotoRoom returns non-PNG | 502 Bad Gateway | Generic error shown | No retry suggestion to user |
| PhotoRoom empty response body | 502 | Generic error | No retry suggestion |
| PhotoRoom rate limit (8/min server-side) | 429 with Retry-After | Client handling not uniformly tested | May expose raw `rate_limit` error string |
| Gemini API key missing | 500 `missing_gemini_api_key` | Likely shows "Something went wrong" | Not user-friendly; classification silently fails |
| Gemini returns malformed JSON | 422 with validation error | Error shown | ✅ Adequate |
| Gemini returns low-confidence result | Result still returned with `modelConfidence < 0.65` | User can manually correct | ✅ Adequate |
| Content guardrail triggered | `ContentGuardrailError` with reason | `Alert.alert('Photo not accepted', reason)` | ✅ User-friendly |
| Supabase Storage upload fails | `uploadPhoto` catches and alerts | Alert shown | ✅ Adequate |

### Cost exposure analysis

**PhotoRoom**: Rate-limited at 8/min server-wide. Free-tier users capped at 20 lifetime calls per `bgRemovalStore`. Premium users have **no daily/monthly cap** beyond the 8/min rate limiter. A single premium user could generate 8 × 60 × 24 = 11,520 PhotoRoom API calls per day. At PhotoRoom's paid API pricing, this is significant uncontrolled cost.

**Gemini**: Global `aiLimiter` at 10/min (not per-user). A single user can consume the full 10/min quota, degrading classification response time for all other users simultaneously. No daily per-user cap. A bulk wardrobe importer (e.g., 100 items) could exhaust the global limiter for minutes.

**Retry amplification**: Neither the client nor the server performs automatic retries. The user manually retries failed classifications. This is the correct behaviour for cost control.

**Duplicate processing prevention**: SHA-256 hash cache in `bgRemovalStore` prevents identical images from being sent to PhotoRoom twice (for the same user). Different users submitting identical images are charged separately — there is no cross-user deduplication (correct for privacy reasons).

---

## PART 6 — RECOMMENDATION ENGINE SAFETY BOUNDARY

*Engine v3.7 is frozen. Only the surrounding integration is audited.*

### Input handling

**Empty wardrobe**: `activeWardrobeItems.length === 0` → `outfitPool` is empty → `applyDailyRotation` returns empty outfits → empty state UI shown. No crash. ✅

**Missing profile data**: All profile fields accessed via optional chaining throughout scoring. Missing `bodyType`, `styleGoals`, or `occasions` arrays default to empty arrays or `null`. The engine receives `null` and does not crash. ✅

**Malformed wardrobe items**: `WardrobeItem` type is enforced at classification time. Items with missing required fields are not added. Low-confidence items pass through with `modelConfidence < 0.65` — the engine uses this in scoring, not as a gate. ✅

**Weather failure**: `loadWeather()` returns `null` on any failure. Engine receives `weather: null`. The outerwear gate and rain filter are disabled (correct fallback — engine does not refuse to generate outfits). ✅

**AI classification failure**: If `/api/classify-garment` fails, the item is not added to the wardrobe. There is no silent partial-add. ✅

**Recommendation generation failure**: The engine is pure function-based (no async calls). It cannot throw from external calls. Internal scoring errors would propagate as uncaught exceptions — no specific error boundary wraps the engine call in `AppContext`. A bug inside the engine could crash the outfit tab silently.

### Identified concerns (non-scoring)

1. **Telemetry `reason` field sometimes undefined**: `recommendation_empty` events emit a `reason` field (`'weather_gate' | 'wardrobe_gap' | 'no_candidates' | 'unknown'`) but not all empty paths populate it — some paths leave `reason: undefined` in the telemetry object. This makes monitoring "why are outfits empty?" ambiguous.

2. **`wardrobe_size` in empty telemetry misleads**: The `wardrobe_size` in `recommendation_empty` reflects total wardrobe count, not the candidate pool size. A user with 30 items where none match the scenario appears to have a "gap" when in fact the scenario filter is the cause.

3. **No JS thread timeout on outfit generation**: Outfit generation is synchronous within the engine. On a large wardrobe (200+ items) with complex scoring, a single generation call could block the JS thread for hundreds of milliseconds. No timeout or yield mechanism exists.

4. **No error boundary around engine call**: If the engine throws an unexpected exception (e.g., from malformed intermediate data), the outfit tab may go blank without an error message.

5. **`applyDailyRotation` reads from AsyncStorage**: If rotation state is corrupted JSON, it resets to `{}` (benign — cursor restarts from 0). ✅

**No hard-constraint violations, crashes, incorrect weather behaviours, or invalid recommendations were identified in the surrounding integration.**

---

## PART 7 — COLD/RAIN WARDROBE GAP DIAGNOSIS

### What is already built

`lib/wardrobeGapDiagnosis.ts` already exists with `diagnoseWeatherGap()`. It:
- Gates on `engineFound === false` first (only diagnoses when the engine genuinely found no outfit)
- Uses item metadata (`warmthBand`, `weight`, `fabric`), never category alone
- Can identify "no rain-friendly outer layer" and "no warm-enough outer layer" as distinct gap types
- Returns a structured `{ gapType, missingCapability, suggestion }` object
- Does not touch v3.7 scoring

`lib/telemetry.ts` already has `reason: 'weather_gate' | 'wardrobe_gap'` in the empty-set telemetry type.

### What is not yet connected

The gap diagnosis result is computed but not surfaced in the UI. `app/(tabs)/outfits.tsx` shows the generic `SCENARIO_EMPTY_HINT` string when no outfit is found. It does not call `diagnoseWeatherGap()` and does not show the structured weather-specific message.

### Available context at the empty-outfit point

At the point where `outfitSets` is empty, the following are all available in scope:
- `activeWardrobeItems: WardrobeItem[]` with full metadata ✅
- `weather: WeatherSnapshot | null` with temperature, precipitation, high/low ✅
- `diagnoseWeatherGap()` function from `lib/wardrobeGapDiagnosis.ts` ✅
- The `profile` and scenario context ✅

### Can this be implemented without changing v3.7?

**Yes.** `diagnoseWeatherGap()` is entirely outside the engine. Connecting it to the empty-state UI is additive — it reads existing state and returns a message string. No engine code is touched.

### Recommended UX

Replace the generic empty-state sub-text with contextual copy driven by the diagnosis result:

- **Rain gap**: *"Your wardrobe doesn't have a waterproof outer layer for today's rain forecast. Adding a trench coat or raincoat will unlock outfits for days like today."* + "Add to wardrobe" CTA
- **Cold gap**: *"It's 8°C today and your wardrobe doesn't have a warm enough layer. A wool coat or puffer would open up more outfit options this season."* + "Add to wardrobe" CTA
- **No gap (scenario filter)**: Keep the existing `SCENARIO_EMPTY_HINT` copy

### Recommended data structure

```typescript
interface WeatherGapResult {
  gapType: 'rain' | 'cold' | 'heat' | null;
  missingCapability: string;   // e.g. "waterproof outer layer"
  suggestion: string;          // e.g. "trench coat or raincoat"
  actionLabel: string;         // CTA text
}
```

### Launch classification

**Launch enhancement (P2)** — not critical path. The infrastructure is 80% built. Connecting it is a small, safe change with high perceived-intelligence value for the user. It directly supports the "elite personal stylist" positioning.

---

## PART 8 — PACKING ASSISTANT / TRAVEL CAPSULE CONCIERGE

### Architectural requirements

A Packing Assistant that feels like "an elite celebrity personal stylist and luxury fashion concierge on retainer" requires all of the following:

| Requirement | Data source | Currently available? |
|---|---|---|
| Destination | User input | Not yet |
| Dates (departure, return) | User input | Not yet |
| Multi-day weather forecast | Open-Meteo 16-day forecast API | API supports it; client weather only fetches current |
| Activities / dress codes | Multi-select from OccasionTag taxonomy | OccasionTag exists; no packing UI |
| Luggage constraint (carry-on only, checked) | User input | Not yet |
| Laundry availability | User input | Not yet |
| Day/night transitions per day | User input or itinerary | Not yet |
| Wardrobe inventory | `WardrobeItem[]` with full metadata | ✅ Available |
| Outfit rotation across N days | `applyDailyRotation` logic | ✅ Available (client-side) |
| Cultural considerations | Partially — occasion tags include `traditional-event` | Partial |
| Missing wardrobe gap identification | `wardrobeGapDiagnosis.ts` | ✅ Available |
| Narrative styling advice | Gemini multi-turn or structured prompt | Possible but high token cost |
| Packing list with quantities | New logic required | Not yet |
| "Versatile piece" optimisation | New ranking logic required | Not yet |

### What would need to be built

1. Trip context screen (destination, dates, activities, luggage, laundry gaps)
2. Multi-day weather fetching (Open-Meteo supports 16 days — no new provider needed, just new query params)
3. Packing engine: select N outfits across M days; minimise item count; respect laundry gaps; prioritise versatile pieces; surface missing items
4. Optional Gemini narrative layer: per-day styling rationale, occasion-appropriate packing rationale
5. Packing list output: item-by-item, categorised, with quantity and occasion tags

### Why this must wait until post-v1 launch

**The packing assistant justifies the premium subscription.** Building it before payments are implemented means giving it away for free. Worse, an under-baked version (e.g., a packing list for a wardrobe with only 5 items) actively damages the "elite concierge" positioning — it produces irrelevant suggestions and erodes trust.

Additional blocking dependencies:
- Stable payment infrastructure must exist first (the feature is a premium anchor)
- Users need ≥20 wardrobe items for a meaningful packing list — requires a user base with established wardrobes
- Multi-day weather integration needs production testing
- Gemini narrative layer adds per-request cost that requires a paid subscription to justify
- Server-side outfit generation is a prerequisite for notifications-driven packing reminders

**Classification: Post-launch flagship feature (v2).** The technical foundation (wardrobe data, outfit rotation, weather API, gap diagnosis) exists. Do not build the integration before v1 is stable.

---

## PART 9 — NIGERIA / AFRICA FASHION READINESS

### Taxonomy audit

| Fashion category | Status | Evidence |
|---|---|---|
| **Ankara / African wax print** | **Partial** — `wax-print` exists as a `Pattern` type; Gemini prompt at `server/classify-garment.ts:644` reads: *"Use 'wax-print' for Ankara/African wax-resist textiles with bold repeating motifs."* The pattern type correctly maps. However, there is no `ankara` subtype — an Ankara dress would be classified as `midi-dress` or `maxi-dress` with `pattern: wax-print`. This is technically correct but loses the cultural specificity. | `constants/types.ts:204`, `server/classify-garment.ts:434,644` |
| **Lace** | **Supported** — `lace` is a `Fabric` type. Lace fabric maps to spring/summer season. Lace gowns map to `traditional-event` and `wedding` via the `gown` subtype + fabric combination. | `constants/types.ts:21` |
| **Kaftan** | **Fully supported** — `kaftan` is an explicit dress subtype in `SUBTYPE_OCCASIONS` → `['resort', 'casual', 'traditional-event']`. Included in the Gemini taxonomy prompt at lines 75, 154, 203, 403. | `server/classify-garment.ts:75,154,203` |
| **Traditional-event occasion** | **Supported** — `traditional-event` is an `OccasionTag`. Scenario chip exists in `app/(tabs)/outfits.tsx`. Custom `SCENARIO_EMPTY_HINT` exists. | `constants/types.ts:7`, `app/(tabs)/outfits.tsx` |
| **Gown** | **Supported** — `gown` subtype → `['wedding', 'event', 'traditional-event']`. Explicit in Gemini prompt ("Evening gown"). | `server/classify-garment.ts:71,142` |
| **Agbada** | **Missing** — not a subtype, not in pattern list, not in Gemini prompt. An agbada would likely be misclassified as `outerwear` or an unrecognised garment. | Not found in codebase |
| **Senator styles** | **Missing** — no subtype or description. Would likely be classified as `blazer` or `outerwear`. | Not found |
| **Native wear (generic)** | **Missing** — no generic "native wear" subtype. Partially covered by `traditional-event` occasion tag but the garment taxonomy does not represent the item type. | Not found |
| **Aso-ebi (coordinated group dressing)** | **Missing** — no concept of outfit coordination for group events. The recommendation engine generates individual outfits, not group-coordinated looks. | Not found |
| **Geometric patterns beyond wax-print** | **Partial** — `geometric` pattern exists, which covers some categories of kente and similar woven patterns. `wax-print` covers Ankara. Kente as a specific weave type is not in the taxonomy. | `constants/types.ts:19` |
| **Cultural modesty considerations** | **Partial** — occasion tags and coverage type fields exist but no explicit modesty-level attribute (e.g., sleeve/neckline requirements for conservative dresscodes). | Partial |

### Can Gemini classify these garments?

**Yes, partially**. Gemini's vision model can identify agbada and senator styles visually. The problem is that the taxonomy prompt constrains Gemini's output to a fixed list of subtypes — agbada would be forced into `outerwear` or `dress` because those are the only available subtypes. Adding `agbada`, `senator`, and `native-wear` as valid subtypes in the Gemini prompt would significantly improve classification accuracy for Nigerian garments.

### Can the recommendation engine rank them appropriately?

**Conditionally**. The engine ranks by formality, occasion tags, color harmony, texture harmony, and warmth. Nigerian garments that are correctly tagged with `traditional-event` and appropriate formality scores will rank correctly for that occasion. The gap is in subtype recognition — if an agbada is classified as `outerwear`, it will be recommended in scenarios where outerwear is appropriate (e.g., cold weather) rather than traditional events.

### Is the traditional-event taxonomy work sufficient?

**For kaftans and gowns: yes.** For agbada, senator styles, and aso-ebi: **no**. These are the most common Nigerian menswear categories for traditional events and are entirely unrepresented.

### What benchmark dataset would be required before changing ranking behaviour

A Nigeria/Africa benchmark dataset must include:
- ≥200 wardrobe item images across Ankara, lace, agbada, senator, kaftan, aso-ebi variants
- Ground-truth classification labels: subtype, pattern, fabric, occasion tags, formality score
- Ground-truth outfit combinations for traditional-event, aso-ebi, wedding, brunch scenarios
- Gemini classification accuracy measured against ground truth on each item
- Outfit recommendation relevance scored by Nigerian fashion domain experts on a 1–5 scale
- Baseline comparison: current taxonomy vs extended taxonomy

**Do not change ranking weights before this benchmark exists.** Adding subtypes to the taxonomy (additive change) is safe and does not require a benchmark. Changing scoring weights or outfit selection logic requires controlled measurement.

---

## PART 10 — NOTIFICATIONS FEASIBILITY AUDIT

### What currently exists

`expo-notifications` is **not installed** — it is not in `package.json`. The app has zero push notification infrastructure.

### Architecture required for "Your outfit is ready" morning notifications

**Client-side requirements**:
1. Install `expo-notifications`
2. Permission request flow (system dialogue on first launch or in Profile settings)
3. Token registration: `Notifications.getExpoPushTokenAsync({ projectId })` — requires EAS project ID
4. Store token on server: `POST /api/user/notification-token` → save to `user_profiles.push_token`
5. User preferences: notification time preference, quiet hours, on/off toggle
6. Timezone: must store user timezone in `user_profiles` (currently absent)

**Server-side requirements**:
1. Cron job or scheduled task at 07:00–09:00 local time per user
2. For each user with notifications enabled: fetch weather → run outfit generation (currently client-side — this requires moving outfit generation server-side or using a simplified server-side variant) → send push via Expo Push Service API
3. Idempotency key (user_id + date) to prevent duplicate notifications on retry
4. Exponential backoff on Expo Push Service failures
5. Token cleanup: remove invalid tokens on `DeviceNotRegistered` error response

**Critical dependency: server-side outfit generation**

The current outfit generation engine runs entirely client-side (AppContext). Meaningful notifications require either:
- Moving the full engine server-side (large architectural change, complex dependency)
- Sending a generic "Check your outfit for today" notification without pre-generating it (simpler, less valuable)
- Caching the last generated outfit server-side and re-serving it in the notification

**Weather dependency**: For a weather-aware notification, the server must fetch weather for the user's stored location. The location (lat/lon) is currently stored in AsyncStorage only — the server has no access to it.

**Timezone handling**: Without storing the user's timezone, all notifications would fire at the same UTC time, which produces 02:00 local time for some users.

**Verdict: Post-launch (P3)**. Prerequisites: EAS project setup, stable payments, push token storage schema, user timezone storage, and a decision on whether to move outfit generation server-side.

---

## PART 11 — ADMIN / OBSERVABILITY

### What currently exists

**Telemetry**: `lib/telemetry.ts` emits structured JSON objects to `stdout` with a `[TELEMETRY]` prefix. No vendor is connected. Four event types:

| Event | Fields |
|---|---|
| `recommendation_requested` | occasion, wardrobe_size, weather_context, body_type, style_goal, has_mood |
| `recommendation_generated` | candidate_pool_size, generation_path (strict/relaxed/empty), timing breakdown |
| `recommendation_empty` | occasion, wardrobe_size, weather_context, reason |
| `user_reaction` | reaction type (love/not-today/worn) — no raw wardrobe content |

**Server error logging**: `console.error` with route prefixes (`[auth/sign-in]`, `[upgrade-premium]`, `[classify]`, `[remove-background]`).

**Classification logging**: `server/classify-garment.ts:788` logs `user=${userId} → ${subType} (${colorFamily})` — this is the PII-in-logs concern from P1-D.

**Background removal startup**: `server/remove-background.ts:63` logs whether the PhotoRoom API key is set at server startup.

**No vendor connected**: All telemetry goes to stdout. No Datadog, Logtail, Sentry, Amplitude, or Mixpanel integration exists.

### What an admin dashboard should expose

**Aggregate metrics only — no individual user data:**

| Metric | Data source | PII risk |
|---|---|---|
| Daily active users (by count) | Unique `user_id` count in telemetry events | Low — opaque IDs only |
| Outfit generation success rate | `recommendation_generated.generation_path` aggregation | None |
| Empty recommendation rate by occasion | `recommendation_empty` grouped by occasion | None |
| Empty recommendation reasons | `recommendation_empty.reason` distribution | None |
| AI classification error rate | HTTP error counts on `/api/classify-garment` | None |
| Background removal usage | Per-user counters in `bg_removal_cache` (aggregate) | None |
| Premium conversion rate | Count of successful `/api/user/upgrade-premium` calls | None |
| Wardrobe size distribution | Histogram of `wardrobe_size` from telemetry | None |
| Weather context coverage | % of requests with `weather_context != null` | None |
| API latency percentiles (p50, p95, p99) | Server response time logging | None |
| Rate limit hit rate by endpoint | 429 response counts | None |
| Auth failure rate | `[auth/sign-in]` error counts | None |

**Must NOT expose in dashboard:**
- Raw wardrobe images (any reason)
- User email addresses
- Body measurements or body type linked to any identifier
- Individual item classifications linked to a user
- Location coordinates
- Any combination that re-identifies a specific user

**Recommended minimum stack**: Connect Logtail (or Datadog Logs) to the existing stdout telemetry pipeline via log drain. Parse `[TELEMETRY]` JSON events. Build aggregate dashboards in Logtail's built-in query UI or export to a simple Postgres analytics table. No new telemetry collection is needed — the events are already well-structured.

---

## PART 12 — GRACEFUL ERROR HANDLING

*Format: Technical failure → User-facing behaviour → Recovery action → Telemetry*

### Network and API failures

| Technical failure | Current user-facing behaviour | Recovery action for user | Telemetry |
|---|---|---|---|
| PhotoRoom 15s timeout | Server returns 504; client shows generic Alert dialog | "Try again" — user manually retaps | Not currently logged as a specific event |
| PhotoRoom non-PNG response | Server returns 502; client shows generic Alert | "Try again" | Not logged |
| PhotoRoom rate limit (8/min) | Server returns 429; client may show raw `rate_limit` error code | None shown | Not logged |
| Gemini API key missing | Server returns 500 `missing_gemini_api_key`; client shows generic "something went wrong" | None — user cannot recover | Not logged |
| Gemini malformed response | Server returns 422; client shows generic error | "Try again" | Not logged |
| Gemini content guardrail | `ContentGuardrailError` thrown; `Alert.alert('Photo not accepted', reason)` | User sees reason; can upload different photo | Not logged |
| Supabase Storage upload fails | Context catches; Alert shown | "Try again" — item not saved | Not logged |
| Supabase Storage URL broken (orphan) | `orphanDetection.ts` attempts signed URL refresh; falls back to placeholder | Transparent recovery | Not logged |
| Supabase DB write fails | Caught in context; Alert shown | "Try again" | Not logged |
| Network offline (no connectivity) | `fetch` throws `TypeError: Network request failed`; varies by call site | Some screens show technical JS error text | Not logged |
| Expired session (401 from server) | `requireAuth` returns 401; client handling not uniform across all routes | Some routes redirect to login; others may show a blank screen | Not logged |
| Rate limit hit by user (429 with body `{error: "rate_limit"}`) | Raw `rate_limit` string may appear in error Alert on some call sites | None shown | Not logged |
| Weather service offline | `loadWeather()` returns `null`; engine continues without weather | Engine continues — no user notification | Not logged |
| ipapi.co offline | Returns `null`; weather returns `null` | Engine continues — no user notification | Not logged |
| Outfit export share fails | `Alert.alert('Could not export this look', 'Please try again in a moment.')` | User can retry | Not logged |
| Outfit generation produces empty set | Empty state with scenario-specific hint shown | "Add to wardrobe" CTA | `recommendation_empty` event ✅ |

### Key gaps identified

1. **Rate limit errors expose internal error codes**: The `rate_limit` string from the server JSON body may be displayed raw in Alert dialogs on some call sites that do a blanket `error.message` display. Premium UX requires mapping all error codes to human language: `"You've been making a lot of requests — please wait a moment and try again."`

2. **Offline mode is inconsistent**: Different screens handle network failures differently. There is no unified offline detection layer. Some screens go blank, others throw JS errors visible to users.

3. **Expired session handling is not uniform**: All authenticated API calls return 401 on an expired session, but the client-side handlers are not consistent — some routes redirect to the login screen, others may silently fail or show a blank screen.

4. **No retry UX for classification failures**: When Gemini classification fails, the user sees a generic error but there is no "Try again" button — they must close and re-open the add-item flow.

5. **No loading state timeout**: If `generateOutfitSet` somehow hangs (e.g., due to an engine bug on a large wardrobe), the outfit tab spinner runs indefinitely with no timeout or "something went wrong" fallback.

6. **PhotoRoom failures show no retry guidance**: The error message does not tell the user what to do next (e.g., "Try a photo with better lighting").

---

## PART 13 — BRAND / UX AUDIT

### AuraCloset references remaining in the codebase

| Location | Reference | User-visible? | Action required |
|---|---|---|---|
| `app/(tabs)/profile.tsx:784–796` | 13 `@auracloset_*` key names listed in UI data-export section | **Yes** — visible to users in the diagnostics/clear-data section | Replace with `@amodka_*` keys or remove from user-visible list |
| `contexts/AppContext.tsx:491,503` | `[AuraCloset]` console log prefix | No (developer console only) | Replace with `[Amodka]` |
| `server/routes.ts:69,77,93` | `"auracloset://"` as redirect sanitizer fallback | No (server-side) | Replace with `"amodka://"` |
| `server/index.ts:249,259,275,283` | `auracloset://` processed in OAuth relay | No (server-side) | Replace with `"amodka://"` only; remove auracloset handling |
| `server/README.md:1,20` | "AuraCloset Backend", "AuraCloset's internal schema" | No (developer docs) | Update to Amodka |
| `__tests__/oauthDismissGuard.test.ts:97` | `auracloset://auth/callback` test URL | No (test only) | Update to `amodka://auth/callback` |
| `.local/tasks/` (multiple task files) | `auracloset://` in task descriptions | No (internal tasks) | Not critical; archive after tasks are completed |
| `.local/session_plan.md:30` | `"Curated by AuraCloset Atelier"` watermark string | No (session plan) | Not critical |
| `app/_layout.tsx:63` | Code comment only | No | Cosmetic |
| `constants/weather.ts:191` | Code comment only | No | Cosmetic |
| `lib/database.ts:320` | Code comment only | No | Cosmetic |

### AsyncStorage key migration status

- Migration from `@auracloset_*` → `@amodka_*` runs in `_layout.tsx` at every launch (idempotent). ✅
- `lib/storage-migration.ts` covers all major keys. ✅
- `constants/weather.ts: migrateWeatherStorage()` covers weather keys separately. ✅
- **Residual risk**: Users who never upgrade across a version gap may have stale keys. The migration handles this correctly. The only gap is the user-visible key list in `profile.tsx`.

### Package and app identifiers

| Identifier | Current value | Status |
|---|---|---|
| Expo slug | `amodka` | ✅ |
| iOS bundle identifier | `com.amodka` | ✅ |
| Android package name | `com.amodka` | ✅ |
| Deep link scheme | `amodka://` (in `app.json`) | ✅ |
| App display name | `Amodka` (in `app.json`) | ✅ |
| `package.json` name field | `expo-app` | ⚠️ Generic — should be `amodka` |
| EAS project name | Not configured | ❌ |
| Expo Router origin | `https://replit.com/` | ⚠️ Should point to production domain when deployed |

### UI audit (observation only — no redesign)

**Design system tokens** (from `constants/colors.ts`):
- Primary: `#101826` (deep navy)
- Secondary / accent: `#D0B892` (champagne gold)
- Background: `#F5F3F0` (off-white)
- Typography: Inter family throughout (regular, semibold, bold via `@expo-google-fonts/inter`)
- Glass surface tokens: defined and used in welcome/auth screens
- Atmospheric scrim tokens: 5 variations for overlay screens
- Animation system: `<300ms` per spec, `scale(0.97)` press interaction

**Profile page observations**:
- The diagnostics/data-export section lists raw `@auracloset_*` storage keys — confusing and exposes implementation details to end users
- The premium upgrade CTA in the profile leads to a screen with no functioning payment flow
- Data deletion confirmation uses a generic Alert — for an action this destructive, a typed-confirmation pattern would be more appropriate

**Premium screen observations**:
- The paywall exists but shows no actual pricing, subscription terms, or payment mechanism
- The premium badge throughout the app is visually present but not backed by a real entitlement system
- There is likely a visual inconsistency between the premium-locked UI and the freely togglable premium state in development

**Splash/startup experience**:
- `expo-splash-screen` is configured with `backgroundColor: "#F5F3F0"` matching the brand
- `SplashScreen.preventAutoHideAsync()` is called in `_layout.tsx` — the splash screen stays visible while fonts and critical data load
- `expo-font` plugin is present — Inter fonts are loaded before the splash hides

**App icon**:
- `icon.png` is the production icon (not audited for content — just confirming it is configured)
- `adaptiveIcon` uses the same `icon.png` as foreground — best practice recommends a separate foreground image optimised for the Android adaptive icon frame (transparent background, content centred to avoid cropping in circular masks)
- No dark mode icon variant is configured (iOS 16+ supports `ios.darkModeIcon`)
- No notification icon configured (Android requires a small icon in notification templates)

**Empty states**:
- All 13 scenario empty states have custom `SCENARIO_EMPTY_HINT` strings (completed this session) ✅
- Wardrobe empty state, saved looks empty state, wear log empty state — not audited in detail in this pass

**Loading states**:
- Outfit generation shows an `ActivityIndicator` with no timeout — spinner can run indefinitely
- Add-item classification shows a progress animation
- A skeleton loader pattern (placeholder cards) would better match the premium positioning than a centred spinner

**Error states**:
- Error states use `Alert.alert()` throughout — consistent, but feels utilitarian rather than premium
- No inline error state UI (e.g., red banner, toast) — all errors are modal dialogs

---

## PART 14 — NATIVE BUILD / RELEASE PIPELINE

### Current Expo / build configuration

| Component | Version / value | Status |
|---|---|---|
| Expo SDK | `~54.0.27` | ✅ Recent stable |
| Expo Router | `~6.0.17` | ✅ |
| React Native | `^0.81.5` | ✅ |
| React | `^19.1.0` | ✅ |
| TypeScript | `~5.9.2` | ✅ |
| New Architecture | `newArchEnabled: true` | ✅ Fabric + JSI |
| React Compiler | `experiments.reactCompiler: true` | ⚠️ Pre-stable — may cause subtle optimisation bugs in production |
| Typed routes | `experiments.typedRoutes: true` | ✅ |
| EAS CLI | `>= 14.0.0` (in `eas.json`) | ✅ Version spec correct |
| EAS Project ID | **Not in `app.json` or `eas.json`** | ❌ Required for EAS Build |
| `eas.json submit.production` | Empty `{}` | ❌ Needs bundle ID and credentials |
| Environment separation | None — single environment only | ⚠️ Needs dev/staging/prod split |
| Google services file | **Not in `app.json android`** | ❌ Required for Android OAuth + future FCM |
| Apple Sign-In entitlement | **Not in `app.json ios.entitlements`** | ❌ Required for App Store |
| `expo-notifications` | **Not installed** | ❌ Required for push notifications |
| `expo-apple-authentication` | **Not installed** | ❌ Required for App Store |
| Privacy manifest (iOS) | **Not created** | ❌ Required for iOS 17+ |
| App signing | EAS manages (not configured) | Pending EAS setup |

### Native modules requiring special EAS build configuration

| Module | Configuration needed |
|---|---|
| `expo-image-picker` | Permissions strings in `app.json` ✅ (done) |
| `expo-location` | Permissions strings in `app.json` ✅ (done) |
| `expo-secure-store` | iOS Keychain entitlement — auto-configured by EAS |
| `expo-web-browser` | No special config needed |
| `expo-image-manipulator` | No special config needed |
| `react-native-reanimated` | Babel plugin required — check `babel.config.js` |
| `react-native-gesture-handler` | Root-level `<GestureHandlerRootView>` — check `_layout.tsx` |
| `react-native-keyboard-controller` | Plugin may be needed in `app.json` |
| `expo-apple-authentication` (future) | `com.apple.developer.applesignin` entitlement required |
| `expo-notifications` (future) | `com.apple.developer.aps-environment` entitlement required; `google-services.json` required for FCM |

### Blockers for App Store release

1. EAS project not linked — cannot produce a signed `.ipa`
2. Apple Sign-In entitlement missing — App Store rejection under Guideline 4.8
3. `expo-apple-authentication` not installed
4. Privacy manifest (`PrivacyInfo.xcprivacy`) required for iOS 17+ — AsyncStorage (NSUserDefaults), Location, and other API categories must be declared
5. App Store Connect listing not created and populated
6. App Privacy section in App Store Connect not completed
7. Age rating not set
8. Screenshots and metadata not prepared

### Blockers for Google Play release

1. `google-services.json` not configured
2. SHA-1 fingerprint not registered in Google Cloud Console
3. Google Play Console listing not created
4. Data Safety declaration not completed
5. Play Store requires a visible privacy policy URL — not in `app.json`

### Blockers for production OAuth

- **Google Android**: `google-services.json` + SHA-1 fingerprint registration in Google Cloud Console
- **Apple native**: `expo-apple-authentication` package + `com.apple.developer.applesignin` entitlement + Apple Developer capability + Supabase Apple provider configuration

### Blockers for production payments

The entire payment infrastructure (RevenueCat or Stripe) must be built from scratch. No payment code exists.

### Blockers for production push notifications

- `expo-notifications` not installed
- No token storage schema
- No user timezone storage
- No backend cron infrastructure
- EAS project ID required for `getExpoPushTokenAsync`

---

## PART 15 — THIRD-PARTY SERVICES & COST AUDIT

| Service | Trigger | Cost driver | Malicious amplification risk | Server-side protection | Caching |
|---|---|---|---|---|---|
| **Google Gemini** | Every wardrobe item classification (one call per item) | Per-request token cost; image input costs more than text | A single user uploading items rapidly exhausts the global 10/min limiter | Global 10/min `aiLimiter`; no per-user daily cap | None — each item classified once; no result caching |
| **PhotoRoom** | Every background removal request (one call per item) | Per-image API call; PhotoRoom charges on paid plans | Premium users have no monthly cap — 8/min × 24h = up to 11,520 calls/day from one user | 8/min rate limit + free-tier 20-call cap; no premium daily cap | SHA-256 hash cache — identical images served from cache at no additional cost |
| **Supabase Auth** | Every sign-in, sign-up, session refresh | Supabase pro plan pricing by MAU | Auth rate limiter (5/15min) prevents account creation spam | Auth rate limiting ✅ | JWT cached client-side |
| **Supabase Database** | Every DB read/write | Bandwidth + row count (Supabase plan) | RLS prevents cross-user reads; auth required for all writes | RLS + auth middleware | TanStack Query client-side caching |
| **Supabase Storage** | Every photo upload and signed URL generation | Storage size + bandwidth | Per-user upload capped indirectly by item cap (FREE_ITEM_CAP/GUEST_ITEM_CAP) | Auth required; RLS on storage paths | Signed URLs cached client-side (1hr) |
| **Open-Meteo** | Weather fetch on app launch and 6h TTL expiry | Free — no key required | Client-side only; no server cost | None needed (free, generous limits) | 6h AsyncStorage TTL |
| **ipapi.co** | When GPS permission denied and weather fetch falls back | Free tier: ~1000 req/day per IP | Client-side only; no server cost | None needed (free tier) | Cached via weather 6h TTL |
| **Expo Push Service** | Not yet implemented | Free tier generous; scales at volume | N/A | N/A | N/A |

### Flagged amplification risks

**Critical (P1)**: A premium user can call `/api/remove-background` at 8 requests/minute indefinitely. There is no per-user daily cap for premium users. At PhotoRoom paid API pricing, this is a potentially unlimited cost driver from a single account.

**High (P2)**: The `aiLimiter` is global (shared across all users). A single user hitting 10 classify requests within 60 seconds blocks all other users from classifying for the remainder of that minute window. This should be a per-user limiter with a lower sub-limit (e.g., 5/min per user, 10/min global).

**Medium (P2)**: No daily Gemini quota per user. A script repeatedly calling `/api/classify-garment` (with valid authentication) generates Gemini API costs at scale. The 10/min server rate limit is the only protection.

---

## PART 16 — APP STORE / GOOGLE PLAY RISK AUDIT

| Requirement | iOS | Android | Current status | Action required |
|---|---|---|---|---|
| Apple Sign-In (mandatory if any social login exists) | **Required** | Not required | ❌ Missing | Install `expo-apple-authentication`; add entitlement; configure Supabase |
| Account deletion in-app | **Required** (since June 2023) | **Required** | ✅ Implemented | None |
| Privacy policy URL | **Required** | **Required** | ❌ Not in `app.json` or store listing | Add URL to `app.json expo.privacyPolicyUrl`; create and host policy |
| Data collection disclosure | **Required** (App Privacy section) | **Required** (Data Safety) | ❌ Not completed | Complete using Part 1 data inventory |
| Camera permission string | **Required** | **Required** | ✅ In `app.json` | None |
| Photo library permission string | **Required** | **Required** | ✅ In `app.json` | None |
| Location permission string | **Required** (when-in-use) | **Required** | ✅ In `app.json` | None |
| Push notification permissions | Required if using notifications | Required if using notifications | ❌ `expo-notifications` not installed | Install when implementing notifications |
| In-app subscription via Apple IAP | **Required** for digital goods sold on iOS | N/A | ❌ No IAP | Implement via RevenueCat |
| In-app subscription via Google Play Billing | N/A | **Required** for digital goods | ❌ No Google Play Billing | Implement via RevenueCat |
| External payment links (forbidden on iOS) | **Forbidden** for digital goods | Allowed with restrictions | ✅ None present | Do not add |
| AI functionality disclosure | Recommended | **Required** in Data Safety | ❌ Not disclosed | Add to store listing description and Data Safety form |
| User-generated content policy | Recommended | Required in Play policy | ❌ Not drafted | Draft and add to Terms of Use |
| Privacy manifest (`PrivacyInfo.xcprivacy`) | **Required** (iOS 17+) | N/A | ❌ Not created | Create with AsyncStorage, Location declarations |
| `NSUserTrackingUsageDescription` | Required only if tracking (ATT) | N/A | ✅ Not applicable — no tracking | None |
| Age rating | Must declare | Must declare | ❌ Not set | Set in App Store Connect and Play Console |
| App metadata (screenshots, description) | **Required** | **Required** | Cannot verify from codebase | Prepare for both stores |
| Subscription terms (price, duration, renewal) | **Required** on paywall screen | **Required** | ❌ Not present | Add to premium screen before launch |
| Google Sign-In for Android | Required: SHA-1 + `google-services.json` | Same | ❌ Not configured | See Part 14 / Part 2 |
| Adaptive icon foreground image | N/A | Recommended best practice | ⚠️ Using full icon as foreground | Create separate foreground without background |

---

## PART 17 — FINAL PRIORITISED ROADMAP

| Priority | Area | Finding | Risk | Required action | Phase | Post-launch? |
|---|---|---|---|---|---|---|
| **P0** | Payments | No payment implementation; premium granted without payment | Revenue loss; fraudulent premium; App Store rejection without IAP | Implement RevenueCat (Google Play Billing + Apple IAP) | 5D | No |
| **P0** | Entitlements | Premium loaded from AsyncStorage, never server-verified at startup | Client manipulation grants free premium; reinstall loses premium | Verify `user_profiles.premium` + expiry from Supabase on every startup via lightweight endpoint | 5C | No |
| **P0** | Entitlements | `premium_expires_at` stored but never enforced | Expired subscriptions retain access indefinitely | Enforce expiry check in server entitlements endpoint | 5C | No |
| **P0** | Payments | No restore-purchases mechanism | Reinstall = lost premium; chargebacks | RevenueCat handles restore automatically | 5D | No |
| **P0** | Payments | No cancellation/renewal/revocation handling | Cancelled users retain premium indefinitely | RevenueCat webhook → server entitlement update | 5D | No |
| **P1** | Apple Sign-In | Native Apple Sign-In not implemented; only web OAuth | App Store rejection under Guideline 4.8 | Install `expo-apple-authentication`; add entitlement; configure Supabase Apple provider | 5C | No |
| **P1** | Android OAuth | `google-services.json` not configured; SHA-1 not registered | Google OAuth fails on production Android build | Manual: Google Cloud + Firebase + `app.json` update | 5C | No |
| **P1** | EAS | No EAS project ID; no submit config | Cannot build or submit to either store | `eas init`; configure credentials and submit profiles | 5C | No |
| **P1** | Privacy | Privacy Policy does not exist | App Store/Play rejection; NDPA non-compliance | Draft policy using Part 1 facts; host at stable URL; add to `app.json` | 5C | No |
| **P1** | Privacy | ipapi.co receives device IPs without disclosure | NDPA/GDPR compliance risk | Add to Privacy Policy and in-app disclosure; or proxy server-side | 5C | No |
| **P1** | Privacy | AI image processing (Gemini + PhotoRoom) not disclosed | App Store Privacy label rejection; NDPA | Add to Privacy Policy; complete App Store/Play disclosures | 5C | No |
| **P1** | iOS | Privacy manifest (`PrivacyInfo.xcprivacy`) missing | App Store rejection for iOS 17+ APIs | Create manifest declaring AsyncStorage (NSUserDefaults) and Location API usage | 5C | No |
| **P1** | Logging | `classify-garment.ts` logs userId + subtype + color | PII in production logs linked to users | Reduce log to category + confidence only; remove subtype/color from log line | 5C | No |
| **P1** | Cost | No per-user daily cap on PhotoRoom for premium users | Single premium user can generate unbounded API costs | Add daily per-user cap in `bgRemovalStore` (e.g., 100/day) | 5C | No |
| **P1** | Privacy | No data export mechanism | NDPA/GDPR right of access; App Store prompts | Implement data export (JSON) in Profile screen | 5C | Borderline |
| **P2** | Brand | `@auracloset_*` keys visible in profile data-export UI | User confusion; exposes internals | Remove from user-visible list; replace with `@amodka_*` | 5C | Yes |
| **P2** | Brand | `auracloset://` in server fallback and relay | Ghost scheme; inconsistency | Replace with `amodka://` throughout | 5C | Yes |
| **P2** | Brand | `[AuraCloset]` console log prefixes in AppContext | Wrong brand in crash reports | Replace with `[Amodka]` | 5C | Yes |
| **P2** | Brand | `package.json` name is `expo-app` | Wrong name in EAS build metadata | Rename to `amodka` | 5C | Yes |
| **P2** | Brand | `server/README.md` says AuraCloset | Wrong brand in developer docs | Update to Amodka | 5C | Yes |
| **P2** | Brand | `Expo Router origin` set to `replit.com` | Wrong origin in production | Update to production domain | 5C | Yes |
| **P2** | Nigeria taxonomy | Agbada, senator, native-wear missing from Gemini taxonomy | Poor classification for primary market | Add subtypes to Gemini prompt (additive — no benchmark required) | 5C | Yes |
| **P2** | Wardrobe gap UI | `diagnoseWeatherGap()` built but not shown in empty state | Missed user value; generic empty state | Connect diagnosis to empty-state UI in outfits.tsx | 5C | Yes |
| **P2** | Error handling | Rate limit errors expose raw error codes to users | Poor UX; not premium-feeling | Map all error codes to user-friendly strings at call sites | 5C | Yes |
| **P2** | Error handling | Offline mode handling inconsistent across screens | Users see technical error text | Implement unified network error detection and friendly messaging | 5C | Yes |
| **P2** | Cost | Global Gemini limiter not per-user | Single user starves others | Add per-user sub-limiter (e.g., 5/min per user within 10/min global) | 5C | Yes |
| **P2** | Admin | No log aggregator connected | Blind to production errors | Connect Logtail or equivalent to stdout telemetry | 5C | Yes |
| **P2** | Subscription UI | No pricing, terms, or payment UI on premium screen | App Store requires subscription terms visible on paywall | Add price, billing period, renewal terms to premium screen before launch | 5C | No |
| **P2** | Image hashes | SHA-256 hashes stored indefinitely in Postgres | Personal data retention without TTL | Add cleanup job to purge hashes for deleted items | 5C | Yes |
| **P3** | Notifications | Push infrastructure not built | No engagement mechanism | Implement after payments are stable; requires EAS + server-side generation | Post-5D | Yes |
| **P3** | Packing assistant | Not designed or built | — | Build after v1 launch with stable user base | v2 | Yes |
| **P3** | Account linking | OAuth + email may create duplicate accounts | User confusion | Supabase identity linking (when platform supports it) | v1.x | Yes |
| **P3** | Android adaptive icon | Full icon used as adaptive foreground | Clipping in Android icon masks | Create separate foreground PNG for adaptive icon | Post-launch | Yes |
| **P3** | iOS dark mode icon | No dark mode icon variant | Minor visual inconsistency on iOS 16+ | Create dark variant | Post-launch | Yes |

---

## PART 18 — EXPLICIT "DO NOT BUILD YET" LIST

### Virtual Try-On

`tryon_profiles` table exists in the schema (stores a photo reference), but the AI pipeline for garment overlay on a person's photo requires a specialised computer vision model (ControlNet-style diffusion or a dedicated try-on API like FASHN.ai, Kolors-Virtual-Try-On, or similar). Gemini cannot do this. Building a meaningful try-on feature requires:
- A new AI provider integration with non-trivial per-image cost
- Garment segmentation and pose estimation
- A high-quality wardrobe image library (many users have poor-quality uploads)
- Significant UX work to set expectations correctly

Building it now — before the user base exists or the wardrobe quality benchmark is established — risks shipping a feature that consistently disappoints and damages the "elite stylist" brand. **Wait until v2+ with a dedicated AI provider.**

### Packing Assistant / Travel Capsule Concierge

Fully assessed in Part 8. The technical infrastructure exists but the feature only delivers value when the user has ≥20 wardrobe items, when payments justify premium access, and when server-side outfit generation is stable. An empty or mediocre packing list is worse than no packing list for a premium-positioned app. **Wait until v2.**

### Advanced Social Features (shared wardrobes, outfit voting, aso-ebi coordination)

Social features require a critical mass of users — they are useless with no network. Building social infrastructure before launch means maintaining complex multi-user features with zero users. The feature is genuinely aligned with the Nigerian market (aso-ebi coordination is culturally significant) but must wait until there is a user base to coordinate with. **Wait until v1.x after demonstrating retention.**

### Excessive Gamification (streaks, leaderboards, badges, achievement systems)

The brand positioning is "a quiet-luxury personal stylist in your pocket." Streaks and leaderboards conflict with this register — they signal a consumer fitness app, not an elite concierge. Gamification should only be considered if retention data after launch shows users are not returning. Defaulting to gamification before seeing the data is premature and risks brand damage. **Wait for post-launch retention analysis.**

### Complex Analytics Vendor Integration (Mixpanel, Amplitude, Firebase Analytics)

Connecting a full analytics SDK before launch adds: a new privacy disclosure (user behavioural tracking), a new third-party data processor, additional App Store disclosures, NDPA considerations for behavioural data, and SDK maintenance overhead. The existing stdout telemetry is sufficient for v1. **Connect Logtail to the existing telemetry pipeline first; evaluate a full analytics SDK at v1.x based on what questions the data cannot answer.**

### Complex AI Agents / Multi-Turn Styling Conversations

Gemini multi-turn conversation (a chat interface where users describe their needs and receive iterative outfit suggestions) dramatically increases per-session token cost and latency. The current architecture (classify once → recommend deterministically) is more predictable, debuggable, and cost-controlled. Adding conversational AI before the cost model is understood from real production traffic could make premium unsustainable economically. **Wait until v1.x with production cost data.**

### Recommendation Engine v3.7 Changes

The engine is frozen by specification. **No changes to scoring weights or ranking logic are permitted without: (a) a Nigeria/Africa benchmark dataset as described in Part 9, (b) a controlled A/B framework, and (c) explicit approval.** The surrounding integration may be changed (new subtypes in the Gemini prompt, gap diagnosis UI, error handling), but nothing inside the engine boundary.

---

## PART 19 — MANUAL ACTIONS REQUIRED FROM PRODUCT OWNER

*You are not a developer. These instructions tell you exactly what to click, where, and what to send back.*

---

### Action 1 — Link the project to Expo Application Services (EAS)

**Why**: Without EAS, no production iOS or Android build can be created, signed, or submitted to the App Store or Google Play. EAS is Expo's build and submission infrastructure.

**Where**: [expo.dev](https://expo.dev)

**Steps**:
1. Go to [expo.dev](https://expo.dev) and create an account (or sign in if you already have one).
2. Click **"Create a project"**.
3. Name it: `Amodka`. Organisation: your organisation slug (or personal).
4. After creation, you will see a **Project ID** — a code that looks like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`.
5. Also note your **Expo account username** or **organisation slug** (shown at the top left of the dashboard after login).

**What you should see when successful**: A project page for "Amodka" on expo.dev with a green "Active" status.

**What to send back**: The **Project ID** UUID and your **Expo username** (or organisation slug).

---

### Action 2 — Enable Sign in with Apple for the Amodka App ID (Apple Developer)

**Why**: Apple will reject any app on the App Store that offers Google sign-in without also offering Sign in with Apple. This configuration must happen in your Apple Developer account before the app can be submitted.

**Where**: [developer.apple.com](https://developer.apple.com) → Certificates, Identifiers & Profiles → Identifiers

**Steps**:
1. Sign in at [developer.apple.com](https://developer.apple.com) with your Apple Developer account.
2. In the left menu, click **Identifiers**.
3. Find `com.amodka` in the list and click on it. (If it does not exist, click the **+** button and create a new App ID with bundle ID `com.amodka`.)
4. Scroll down to the **Capabilities** section.
5. Find **Sign in with Apple** and tick the checkbox next to it.
6. Click **Save** at the top right.

**What you should see when successful**: The `com.amodka` identifier page shows a blue tick next to "Sign in with Apple".

**What to send back**: A screenshot of the identifier page showing "Sign in with Apple" ticked, plus your Apple **Team ID** (shown in the top right of the developer portal under your account name, looks like `XXXXXXXXXX`).

---

### Action 3 — Create an Apple Sign in with Apple Key

**Why**: Supabase needs a private key to verify Apple Sign-In tokens. This key is created in your Apple Developer account and must be entered into Supabase.

**Where**: [developer.apple.com](https://developer.apple.com) → Keys

**Steps**:
1. In the Apple Developer portal left menu, click **Keys**.
2. Click the **+** button to create a new key.
3. Name the key: `Amodka Sign In with Apple`.
4. Tick the checkbox next to **Sign in with Apple**.
5. Click **Configure** next to Sign in with Apple.
6. Under "Primary App ID", select `com.amodka` from the dropdown. Click **Save**.
7. Click **Continue**, then **Register**.
8. **IMPORTANT**: On the next screen, click **Download**. You will only be able to download this file once. Save it safely — it is a file ending in `.p8`.
9. On that same screen, note the **Key ID** (a 10-character code).

**What you should see when successful**: A downloaded `.p8` file and a Key ID.

**What to send back**: The **Key ID** (10 characters), your **Team ID** (from Action 2). I will tell you where to enter the `.p8` file content in Supabase — do not share it in the chat.

---

### Action 4 — Create an Apple Services ID for Supabase

**Why**: Supabase needs a Services ID (separate from the App ID) to receive Apple's OAuth callback.

**Where**: [developer.apple.com](https://developer.apple.com) → Certificates, Identifiers & Profiles → Identifiers

**Steps**:
1. Click **Identifiers** in the left menu.
2. Click the **+** button.
3. Select **Services IDs** (not App IDs) and click **Continue**.
4. Description: `Amodka Sign In with Apple Service`
5. Identifier: `com.amodka.siwa`
6. Click **Continue**, then **Register**.
7. Click on `com.amodka.siwa` in the list.
8. Tick **Sign in with Apple** and click **Configure**.
9. Primary App ID: select `com.amodka`.
10. Domains and Subdomains: enter your Supabase project domain, e.g. `<your-project-id>.supabase.co` (find this in your Supabase dashboard — Project Settings → General → Project URL, copy just the domain without `https://`).
11. Return URLs: `https://<your-project-id>.supabase.co/auth/v1/callback`
12. Click **Next**, then **Done**, then **Save**.

**What to send back**: Confirmation that the Services ID `com.amodka.siwa` is created and shows "Sign in with Apple" enabled.

---

### Action 5 — Configure Supabase Apple Provider

**Where**: [app.supabase.com](https://app.supabase.com) → your Amodka project → Authentication → Providers → Apple

**Steps**:
1. Open your Supabase project dashboard.
2. In the left menu, click **Authentication** → **Providers**.
3. Find **Apple** and click it to expand.
4. Toggle it to **Enabled**.
5. **Service ID (client_id)**: enter `com.amodka.siwa`
6. **App ID** (Bundle ID): `com.amodka`
7. **Team ID**: your Apple Team ID from Action 2
8. **Key ID**: your Key ID from Action 3
9. **Private Key**: open the `.p8` file from Action 3 in a text editor (Notepad on Windows, TextEdit on Mac). Copy the entire contents — including the lines `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` — and paste it into this field.
10. Click **Save**.

**What you should see when successful**: The Apple provider shows a green "Enabled" badge.

**What to send back**: A screenshot of the Apple provider page showing "Enabled".

---

### Action 6 — Create a Google Cloud project and configure Google OAuth

**Why**: Android production builds require a registered SHA-1 fingerprint and a `google-services.json` file from Google/Firebase. Without this, Google Sign-In will not work on a standalone Android app.

**Note**: This action requires the EAS project to be set up first (Action 1) so I can provide you with the production SHA-1 fingerprint. Please complete Action 1 first, then I will give you the SHA-1 for step 10.

**Where**: [console.firebase.google.com](https://console.firebase.google.com)

**Steps**:
1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in with a Google account you control.
2. Click **Add project** → name it `Amodka` → accept defaults → click **Create project**.
3. In the Firebase project, click **Add app** → select the **Android** icon.
4. Android package name: `com.amodka`
5. App nickname: `Amodka Android`
6. **SHA-1 certificate fingerprint**: leave blank for now (I will provide this after Action 1).
7. Click **Register app**.
8. Click **Download `google-services.json`** and save the file.
9. Click **Next** through the remaining screens (you do not need to follow the SDK setup instructions).

**What to send back**: The downloaded `google-services.json` file (send it as a file attachment, not pasted text). I will add it to the project.

---

### Action 7 — Configure Supabase Google Provider

**Where**: [app.supabase.com](https://app.supabase.com) → Authentication → Providers → Google

**Steps**:
1. Open your Supabase project dashboard.
2. Click **Authentication** → **Providers** → **Google**.
3. Toggle it to **Enabled**.
4. Note the **Callback URL** shown by Supabase (it looks like `https://<project-id>.supabase.co/auth/v1/callback`). Copy it.
5. Go to [console.cloud.google.com](https://console.cloud.google.com) → your Amodka project → **APIs & Services** → **Credentials**.
6. Click **Create Credentials** → **OAuth 2.0 Client ID** → Application type: **Web application**.
7. Name: `Amodka Supabase`
8. Under **Authorised redirect URIs**, click **Add URI** and paste the Supabase Callback URL from step 4.
9. Click **Create**. Note the **Client ID** and **Client Secret** shown.
10. Go back to Supabase → Google provider → enter the **Client ID** and **Client Secret**.
11. Click **Save**.

**What you should see when successful**: The Google provider in Supabase shows "Enabled" in green.

**What to send back**: Confirmation that the Google provider is Enabled. Also confirm your Supabase project URL (the `https://<project-id>.supabase.co` part).

---

### Action 8 — Verify `amodka://` is in the Supabase redirect URL allowlist

**Where**: [app.supabase.com](https://app.supabase.com) → Authentication → URL Configuration

**Steps**:
1. In Supabase, click **Authentication** → **URL Configuration**.
2. Look at the **Redirect URLs** list.
3. Check if `amodka://**` is listed.
4. If it is not: click **Add URL** → type `amodka://**` → click **Save**.

**What to send back**: Confirmation that `amodka://**` appears in the list. Also confirm that `auracloset://**` does **not** appear — if it does, let me know and I will remove it from the server code.

---

### Action 9 — Confirm PhotoRoom API plan and data retention

**Why**: The Privacy Policy must state how long PhotoRoom retains wardrobe images after processing. This is information only you can look up in your PhotoRoom account.

**Where**: [app.photoroom.com](https://app.photoroom.com)

**Steps**:
1. Sign in to your PhotoRoom account.
2. Go to **API** or **Billing** section.
3. Note: the plan name (Free / Starter / Business / Enterprise) and the monthly API call limit on your plan.
4. Go to PhotoRoom's Terms of Service or Data Processing Agreement and find the **data retention period** for API-submitted images (how long they keep images after processing).

**What to send back**: The plan name, monthly API call limit, and the data retention period for API images (e.g., "images deleted immediately after processing" or "retained for 30 days").

---

### Action 10 — Set daily quota on the Gemini API

**Why**: Without a quota, an unexpected spike in users or a bug could generate thousands of Gemini API calls and a large unexpected Google Cloud bill.

**Where**: [console.cloud.google.com](https://console.cloud.google.com) → the project where your `GEMINI_API_KEY` was created → APIs & Services → Gemini API (or Generative Language API) → Quotas

**Steps**:
1. In Google Cloud Console, select the project where the Gemini API key was created.
2. Go to **APIs & Services** → **Enabled APIs** → click **Gemini API** (or "Generative Language API").
3. Click **Quotas & System Limits**.
4. Find the "Requests per day" quota.
5. Click the pencil icon and set a daily limit appropriate for your expected usage (e.g., 5,000 requests/day to start — increase as needed).
6. Ensure **billing is enabled** on the Google Cloud project.

**What to send back**: Confirmation that a daily quota limit is set and billing is active.

---

### Action 11 — Create the App Store Connect listing (do not submit)

**Why**: The listing must exist before a build can be submitted. Creating it now lets me verify the bundle ID is registered.

**Where**: [appstoreconnect.apple.com](https://appstoreconnect.apple.com)

**Steps**:
1. Sign in with your Apple Developer account.
2. Click **My Apps** → the **+** button → **New App**.
3. Platform: **iOS**
4. Name: **Amodka**
5. Primary Language: English (UK) or English (US) — your choice
6. Bundle ID: select `com.amodka` from the dropdown (it must already exist — created in Action 2)
7. SKU: `amodka-ios` (or any unique string)
8. User Access: Full Access
9. Click **Create**.
10. Do NOT submit the app yet — just create the listing.

**What you should see when successful**: An "Amodka" app entry in your App Store Connect "My Apps" list.

**What to send back**: Confirmation the listing is created.

---

### Action 12 — Create the Google Play Console listing (do not submit)

**Where**: [play.google.com/console](https://play.google.com/console)

**Steps**:
1. Sign in with your Google Play developer account (requires a one-time $25 registration fee if not already registered).
2. Click **Create app**.
3. App name: **Amodka**
4. Default language: English (UK) or English (US)
5. App or game: **App**
6. Free or paid: **Free** (you can add in-app purchases later)
7. Tick the declarations (content guidelines and US export laws).
8. Click **Create app**.
9. Do NOT publish yet — just create the listing.

**What to send back**: Confirmation the listing is created.

---

### Action 13 — Choose your payment provider

**Why**: The entire premium subscription infrastructure must be built before launch. You must choose a provider before I can implement it.

**Options**:

**Option A — RevenueCat (strongly recommended)**
- Handles both Apple In-App Purchase and Google Play Billing from a single SDK
- Manages subscription state, receipt validation, renewal, cancellation, and restore purchases
- Provides webhooks to update your server
- Free tier up to $2,500/month in tracked revenue
- Used by thousands of Expo/React Native apps
- URL: [revenuecat.com](https://revenuecat.com)

**Option B — Stripe**
- Excellent for web payments
- Cannot legally process in-app purchases for digital goods inside a native iOS or Android app without risking App Store rejection (Apple requires IAP for digital goods)
- Appropriate only for a web billing portal as a supplement to RevenueCat

**My recommendation**: Choose RevenueCat. It is the only option that correctly handles both Google Play and Apple IAP together.

**What to send back**: Your choice of payment provider.

---

## PART 20 — PHASE 5C READINESS VERDICT

---

### GO
*Areas that are production-ready and can proceed to implementation immediately.*

- **Email/password authentication** — fully implemented, rate-limited, enumeration-resistant, account-deletion tested. Production-ready.
- **RLS data isolation** — 40/40 PASS. Cross-user data access is provably impossible. Production-ready.
- **Service-role account deletion** — 9/9 PASS. Complete two-path deletion (in-app + web OTP). Production-ready.
- **Background removal pipeline** — PhotoRoom → Gemini order is correct and already implemented. Caching, rate limiting, failure handling, and timeout behaviour are solid. Production-ready subject to per-user daily cap (P1 fix).
- **Gemini classification** — deterministic post-processing applied. Malformed response handling. Low-confidence detection. Extensive taxonomy. Content guardrails. Production-ready.
- **Recommendation Engine v3.7 integration** — surrounding error handling, empty-wardrobe paths, weather-null paths, and session persistence all tested. Engine integration is stable.
- **Wardrobe Storage** — private bucket, signed URL generation, RLS isolation, orphan detection and recovery. Production-ready.
- **Secret separation** — no client-side secrets. All server keys are server-only. EXPO_PUBLIC_ vars are correctly limited to the anon Supabase key and public domain. Production-ready.
- **Nigerian fashion taxonomy (core)** — `kaftan`, `lace`, `wax-print` (Ankara), `gown`, `traditional-event` are supported. A functional core exists for the primary market.
- **Telemetry infrastructure** — structured, privacy-preserving, vendor-agnostic stdout events. Ready to connect to a log aggregator without code changes.
- **Empty-state copy** — all 13 scenario empty states have custom hints. ✅

---

### BLOCKED
*Areas that require manual configuration, external accounts, credentials, legal decisions, or other prerequisites before implementation can begin.*

- **Payments / subscriptions** — blocked on payment provider decision (Action 13) and RevenueCat account setup
- **Native Apple Sign-In** — blocked on Apple Developer configuration (Actions 2–4) and Supabase Apple provider setup (Action 5)
- **Android Google OAuth (production)** — blocked on `google-services.json` (Actions 6–7)
- **EAS Build and Submit** — blocked on EAS project linkage (Action 1)
- **Privacy Policy / Terms of Use** — blocked on legal drafting using the facts from Part 1; must be hosted at a stable URL before store submission
- **App Store Connect listing** — blocked on manual creation (Action 11); required before any build submission
- **Google Play Console listing** — blocked on manual creation (Action 12)
- **Supabase redirect URL** — `amodka://**` must be verified as present (Action 8); `auracloset://**` must be removed
- **PhotoRoom data retention period** — required for Privacy Policy (Action 9)
- **Gemini API quota** — required before production traffic (Action 10)
- **iOS Privacy Manifest** — cannot be auto-generated; requires manual creation and EAS build

---

### NOT YET
*Features that should deliberately wait — building them now would be premature or harmful.*

- **Push notifications** — requires EAS project, server-side outfit generation, user timezone storage, and stable payments. After v1 launch.
- **Packing Assistant / Travel Capsule Concierge** — requires stable user base with ≥20 wardrobe items, payments infrastructure, and server-side generation. v2.
- **Virtual Try-On** — requires a specialised AI model not in the current stack. High cost. Damages brand if under-baked. v2+.
- **Advanced social features** — requires a user base to be social with. v1.x after retention metrics are established.
- **Multi-turn AI styling conversations** — requires understanding per-session Gemini costs from real production traffic before adding conversational overhead. v1.x.
- **Analytics vendor (Mixpanel/Amplitude)** — stdout telemetry is sufficient for v1. Adding a vendor adds privacy disclosures, NDPA exposure, and SDK maintenance. Evaluate at v1.x.
- **Recommendation engine scoring changes** — frozen. Requires Nigeria/Africa benchmark dataset before any weight changes.
- **Server-side outfit generation** — large architectural migration. Prerequisite for notifications but not for v1. After v1 launch.

---

### CRITICAL RISKS
*The five most important things that could prevent a successful commercial launch.*

**Risk 1 — No payment implementation**  
The app cannot generate revenue in its current state. Premium is a free toggle. Any authenticated user can call `/api/user/upgrade-premium` and receive unlimited premium access at no cost. This is the single most important gap. Without payments, there is no commercial product — only a technically impressive demo.

**Risk 2 — Apple Sign-In missing; App Store rejection is certain**  
The App Store will reject the app under Guideline 4.8: any app offering a third-party social login (Google is offered) must also offer Sign in with Apple. The current web-flow Apple OAuth does not satisfy this requirement. The rejection is automatic and non-negotiable. The blockers are developer account configuration and a new native package — both require action before the first TestFlight submission.

**Risk 3 — Premium is client-trusted and manipulable**  
A user on a jailbroken device, Android emulator, or using an automated script can write `"true"` to AsyncStorage key `@amodka_premium` and receive full premium access permanently without paying. At scale, this is an exploitable and detectable attack. The fix requires server-side entitlement verification on startup — a one-week implementation task that must happen before the payment system is activated.

**Risk 4 — No privacy documentation for AI-processed personal data**  
Submitting to the App Store and Google Play without accurate data disclosures (PhotoRoom image processing, Google Gemini image classification, ipapi.co IP address transmission) will result in rejection or post-launch removal. Nigeria NDPA compliance also requires a Privacy Policy, data subject rights mechanisms, and cross-border transfer safeguards. This is a legal task, not a coding task — but it cannot be completed without first confirming the data inventory in Part 1. The inventory is now complete.

**Risk 5 — EAS not configured; no production build is possible**  
There is no EAS project ID in `app.json` or `eas.json`. `eas.json submit.production` is empty. Without EAS, no production-signed `.ipa` or `.aab` can be created, no TestFlight build can be distributed, and no store submission is possible. This is a blocking prerequisite for everything else in the release pipeline. It requires only an Expo account and running `eas init` — but it must happen first.

---

### RECOMMENDED NEXT IMPLEMENTATION TRACK

**Track: Server-Authoritative Entitlements + Apple Sign-In + EAS Foundation**

This is the single track that unblocks the most subsequent work with the least risk of rework.

**Sequence**:
1. **EAS project linkage** (Action 1 from the product owner, then I add the project ID to `app.json` and `eas.json`) — unblocks all subsequent builds and OAuth configurations
2. **Apple Sign-In** (Actions 2–5 from product owner, then I implement `expo-apple-authentication`, add the entitlement, and wire up the native sign-in flow) — unblocks App Store submission
3. **Server-side entitlement verification endpoint** (`GET /api/user/entitlements` → reads `user_profiles.premium` + `premium_expires_at` from Supabase → returns authoritative `{ isPremium, expiresAt }` → client calls this on startup and replaces AsyncStorage as the source of truth) — hardens the premium system before payments go live
4. **Expiry enforcement** (check `premium_expires_at < NOW()` in the entitlement endpoint; return `isPremium: false` if expired) — completes the entitlement hardening
5. **Brand cleanup** (replace `auracloset://` throughout server code; replace `@auracloset_*` in profile UI; rename `package.json` name; update `server/README.md`) — low-risk, high-polish, prepares codebase for first TestFlight

**Why this track first**: Payments cannot be built without a working entitlement system to write into. Apple Sign-In cannot be tested without an EAS build. The brand cleanup is small but must happen before any user-facing TestFlight distribution. This track produces the foundation every subsequent phase depends on, and each step is independently completable — if product owner actions are delayed on one step, the coding steps for another can proceed in parallel.

**Payments (RevenueCat)** follow immediately after this track as Phase 5D.

---

*End of Phase 5C Master Production Audit.*  
*Document status: FINAL — read-only audit. No production code was modified.*  
*Next action: Await product owner responses to Part 19 Actions 1, 2, and 13 to begin Phase 5C implementation.*
