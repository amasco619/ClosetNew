# Phase 5C.2 — Native Production Foundation & Identity Readiness

**Status:** Complete for code and audit scope. No production deployment, native build, store submission, dashboard configuration, database migration, or secret change was performed.

## 1. What was implemented

- Aligned the Expo SDK 54 dependency set, including the incompatible `expo-image-manipulator` major-version mismatch.
- Set the configured iOS bundle identifier and Android package to the approved target: `com.amodka.app`.
- Kept `amodka` as the only configured mobile URL scheme and retained its Android `VIEW` intent filter.
- Removed the unused always-on location usage description and blocked the generated `android.permission.RECORD_AUDIO` permission. The app still declares only when-in-use location access for weather.
- Retired `auracloset://` from the server-side OAuth relay and password-reset fallback. The relay now accepts `amodka://` and Expo Go `exp://` callbacks only.
- Preserved the existing one-time `@auracloset_*` to `@amodka_*` AsyncStorage migration. It remains idempotent, preserves an existing new-key value, and removes an old key only after a successful write.
- Isolated native OAuth callback recognition and session completion into Node-testable modules. Native OAuth now consumes PKCE code callbacks only at the exact generated callback endpoint; coverage verifies provider errors, invalid/expired codes, cancellation, arbitrary-deep-link rejection, exact-host Expo Go relay destination-to-callback construction (including lookalike-host rejection), and retired AuraCloset callback rejection.
- Replaced remaining current-runtime AuraCloset log prefixes and backend documentation branding with Amodka.

## 2. What was intentionally not implemented

- Native `expo-apple-authentication`, Apple credentials, Apple entitlement configuration, or account-linking policy. The existing Apple button remains browser OAuth through Supabase.
- Native implicit-token session callbacks. They are intentionally rejected because an arbitrary custom-scheme link cannot be safely bound to an initiated PKCE transaction.
- Google native SDK sign-in, Google service configuration files, Google credentials, or provider-console changes. The existing Google flow remains browser OAuth through Supabase.
- EAS project linkage, signing credentials, certificate/provisioning setup, native builds, TestFlight, Play internal testing, production deployment, or store submission.
- Payments, RevenueCat, subscriptions, webhooks, push notifications, Virtual Try-On, Packing Assistant, database migrations, or any Recommendation Engine v3.7 / cold-rain / ranking change.
- Privacy-policy hosting or an iOS privacy manifest, because their final public URLs and API-reason declarations require Product Owner confirmation.

## 3. Native build blockers

| Blocker | Current evidence | Required resolution |
|---|---|---|
| Signed iOS build unproven | No native build was created in this phase. | Product Owner must approve a Replit Expo Launch build and provide/confirm Apple identity ownership. |
| Signed Android build unproven | No internal APK/AAB was created in this phase. | Product Owner must approve a build and create/confirm the Google Play app record before internal testing. |
| Native identifiers need external registration | Source now uses `com.amodka.app`; changing an identifier creates a distinct native app identity. | Register the identifier with Apple and reserve it for Google Play before building. |
| iOS privacy readiness incomplete | No final public privacy-policy URL or privacy manifest is configured. | Product Owner must provide the approved policy URL and data-use declarations. |
| Real-device deep-link behavior unproven | Unit tests cover parsing and handoff only. | Execute the native device plan in Section 9 after provider configuration and a signed build. |

The prior source-level Expo dependency incompatibility is resolved. The declared Expo SDK is `~54.0.37`; matching updates were applied for Expo Constants, Glass Effect, Image Manipulator, Image Picker, Localization, and Keyboard Controller.

## 4. Google authentication blockers

The code path is browser OAuth: Amodka → Supabase Auth → Google → Supabase callback → `amodka://` callback → PKCE session exchange in Amodka. This is not a Google native SDK integration.

- The app cannot prove the Supabase redirect allowlist or Google provider configuration from source code.
- For the present browser flow, Google must redirect to the Supabase callback URL shown by the Supabase Google provider configuration; it should not be configured to redirect directly to `amodka://`.
- Supabase must allow `amodka://**` as the application redirect target.
- A real signed Android/iOS build is required to prove custom-scheme callback delivery, persisted SecureStore session refresh, and correct post-auth navigation.

## 5. Apple authentication blockers

- Apple is currently implemented as browser OAuth through Supabase, not native Sign in with Apple.
- No `expo-apple-authentication` package, Apple capability, `com.apple.developer.applesignin` entitlement, Apple Team ID, Key ID, private key, Service ID, or Supabase Apple provider configuration exists in source.
- If browser Apple OAuth is retained, its Apple Service ID and return URL must be configured in Apple Developer and Supabase.
- If a future phase requires native Apple Sign-In, it must add the native entitlement/plugin, define account-linking behavior, and validate private-relay email plus first-login name/email behavior. That is not implemented here.

## 6. Legacy AuraCloset compatibility status

The Product Owner confirmed that AuraCloset was never publicly released and has no external users or supported legacy builds.

- Retired: `auracloset://` OAuth relay and fallback handling, OAuth test fixtures, runtime log prefixes, and backend documentation branding.
- Preserved deliberately: `@auracloset_*` strings inside the one-time AsyncStorage migration and account-deletion cleanup. They are compatibility inputs, not active application identifiers.
- AsyncStorage behavior is safe: existing `@amodka_*` values win, legacy values are copied only when the new key is absent, and the old key is deleted only after the write succeeds.
- Changing the native bundle/package identifier to `com.amodka.app` creates a new OS app identity. Existing device-local storage is not guaranteed to move across an install under the new identifier; Supabase data is unaffected and was not modified.

## 7. Environment and secrets findings

| Variable / category | Mobile-safe? | Server-only? | Finding |
|---|---:|---:|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Yes | No | Bundled into the mobile app by design; it identifies the Supabase project. |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | No | Bundled into the mobile app by design; access remains protected by Supabase RLS. |
| `SUPABASE_SECRET_KEY` | No | Yes | Must remain server-only; never add it to an Expo public variable or mobile `.env`. |
| `GEMINI_API_KEY` | No | Yes | Server-side garment classification only. |
| `PHOTOROOM_API_KEY` | No | Yes | Server-side background removal only. |
| Google / Apple OAuth secrets | No | Yes | Must exist only in the relevant provider dashboard and Supabase server-side provider configuration. |
| Future RevenueCat credentials | No | Yes | Not introduced in this phase. |
| Weather / telemetry credentials | Depends on provider | Usually | No new credentials or telemetry service was added. |

No `.env` file was created. No secret value was read, changed, printed, or placed into mobile code. Replit documentation confirms that secrets are managed through the Secrets pane and are synced to a published environment; this phase does not publish the app.

## 8. MANUAL ACTIONS REQUIRED

See [PHASE-5C.2-MANUAL-ACTIONS-REQUIRED.md](./PHASE-5C.2-MANUAL-ACTIONS-REQUIRED.md). These are external prerequisites for native build and provider validation. Do not perform a deployment, store submission, or credential-sharing action as part of this phase.

## 9. Test results

### Code-level checks

- `npm test`: **51 passed, 0 failed**.
- `npm run typecheck`: **0 errors**.
- `npm run lint`: **0 errors, 31 existing warnings**. No lint warning was introduced by this phase.
- Expo SDK dependency alignment assertion: **passed**.
- Native identity configuration assertion: **passed**.
- `oauthCallback.test.ts`: native callback scheme and payload validation.
- `oauthSession.test.ts`: PKCE exchange, empty callback, invalid/expired code, and parsed provider-error behavior.
- `oauthDismissGuard.test.ts`: cancelled/dismissed/locked browser states do not create a session; successful callback does.
- `storageKeyMigration.test.ts`: existing migration coverage verifies old-key migration, collision preservation, idempotence, and write-before-delete ordering.
- Static configuration assertion verifies `amodka`, `com.amodka.app`, microphone block, and no always-on location declaration.
- Browser sanity check: `/sign-in` rendered in the Expo web preview with both **Continue with Google** and **Continue with Apple** entry points and no Phase 5C.2-related browser console error. This check did not invoke OAuth or create data.

### Native-device tests still required

Do not treat browser or unit results as proof of production OAuth. After the required external configuration and an approved signed build:

| Platform | Tests |
|---|---|
| iOS | Google cold/warm login, Apple cold/warm login, logout/login, cancellation, invalid callback, expired callback, private-relay email and returning-user behavior. |
| Android | Google cold/warm login, logout/login, cancellation, invalid callback, expired callback, and process-killed callback recovery. |

These results validate source-level behavior only; the real-device matrix remains mandatory before claiming production OAuth readiness.

## 10. Files changed

- `app.json`
- `package.json`
- `package-lock.json`
- `lib/oauth-callback.ts`
- `lib/oauth-session.ts`
- `lib/auth.ts`
- `app/_layout.tsx`
- `app/sign-in.tsx`
- `server/routes.ts`
- `server/index.ts`
- `contexts/AppContext.tsx`
- `server/README.md`
- `__tests__/oauthCallback.test.ts`
- `__tests__/oauthSession.test.ts`
- `__tests__/oauthDismissGuard.test.ts`
- `TECHNICAL.md`
- This report and the linked manual-action guide

Not changed: Recommendation Engine files, Supabase schema/migrations, production data, Replit secrets, payment code, deployment configuration in external dashboards, and store records.

## 11. Remaining P0/P1 risks

| Priority | Risk | Mitigation / owner |
|---|---|---|
| P0 | A native build with unregistered `com.amodka.app` cannot be distributed or correctly associated with a store app. | Product Owner: register/confirm Apple and Google identities before any build. |
| P0 | OAuth may fail to return to the app if the Supabase redirect allowlist or provider callback configuration is absent. | Product Owner: complete the Supabase, Google, and Apple actions; then execute device tests. |
| P1 | Apple button is visible but native Apple Sign-In is not implemented. | Product Owner decides whether browser OAuth is acceptable; otherwise schedule a native Apple Sign-In phase. |
| P1 | Privacy-policy URL and iOS privacy manifest are missing. | Product Owner provides approved privacy/legal content before store readiness work. |
| P1 | Device-local data may not persist across a new app identifier install. | Preserve Supabase as source of truth; test upgrade/reinstall with development data before distributing builds. |

## 12. Recommended next phase

**Phase 5C.3 — Provider Configuration, Approved Native Builds, and Device Validation.**

Only after Product Owner approval, complete the external actions in the linked guide, create non-production iOS/Android builds through Replit’s publishing flow, run the device matrix, and record evidence. Keep payments, production deployment, store submission, and Recommendation Engine work out of that phase unless separately approved.