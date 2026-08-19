# MANUAL ACTIONS REQUIRED — Phase 5C.2

**Do not start a production deployment, store submission, or payment setup from this guide.** These actions prepare external identities and OAuth settings for later approved native build validation.

## 1. Confirm the Amodka app identity

- **Platform:** Apple Developer
- **Website/dashboard:** [developer.apple.com/account](https://developer.apple.com/account)
- **Navigation:** Certificates, Identifiers & Profiles → Identifiers → **+** → App IDs → App
- **What to click / enter:** Create or confirm an App ID with:
  - Description: `Amodka`
  - Bundle ID: `com.amodka.app`
- **What not to change:** Do not reuse `com.amodka` or `com.auracloset`. Do not create an Apple key yet unless completing the separate Apple-provider action below.
- **Expected result:** `com.amodka.app` appears as an Apple App ID owned by the Product Owner’s Apple Developer team.
- **Send back:** Screenshot of the Identifier details page showing the bundle ID and status. Do not send certificates, keys, Team IDs, or private values.

## 2. Configure Supabase application redirects

- **Platform:** Supabase
- **Website/dashboard:** [supabase.com/dashboard](https://supabase.com/dashboard)
- **Navigation:** Open the Amodka project → Authentication → URL Configuration → Redirect URLs
- **What to click / enter:** Add `amodka://**` as a Redirect URL, then remove any `auracloset://` entry.
- **What not to change:** Do not change the Site URL, JWT settings, email templates, users, database, or storage buckets in this action.
- **Expected result:** The redirect list contains `amodka://**` and no AuraCloset custom-scheme callback.
- **Send back:** Screenshot of the Redirect URLs list with unrelated URLs redacted if preferred.

## 3. Verify Google browser OAuth through Supabase

- **Platform:** Supabase and Google Cloud Console
- **Website/dashboard:** Supabase Dashboard; [console.cloud.google.com](https://console.cloud.google.com)
- **Navigation:**  
  1. Supabase → Authentication → Providers → Google  
  2. Google Cloud Console → APIs & Services → Credentials → the OAuth 2.0 **Web application** client used by Supabase
- **What to click / enter:** In Google Cloud, ensure the authorized redirect URI is the exact Supabase callback URL displayed in the Supabase Google provider screen. In Supabase, ensure the Google provider is enabled and its client configuration is present.
- **What not to change:** Do not add `amodka://` as a Google authorized redirect URI. Google returns to Supabase; Supabase returns to Amodka. Do not create or paste client secrets in Replit source or chat.
- **Expected result:** Google is configured to return to Supabase, and Supabase is allowed to return to `amodka://**`.
- **Send back:** Screenshot of the Supabase Google provider status and the Google client’s redirect URI list, with client IDs/secrets redacted.

## 4. Configure Apple browser OAuth through Supabase

- **Platform:** Apple Developer and Supabase
- **Website/dashboard:** [developer.apple.com/account](https://developer.apple.com/account); Supabase Dashboard
- **Navigation:**  
  1. Apple Developer → Certificates, Identifiers & Profiles → Identifiers → **+** → Services IDs  
  2. Supabase → Authentication → Providers → Apple
- **What to click / enter:** Create or confirm the Apple Service ID and web authentication return URL using the exact callback value shown by the Supabase Apple provider configuration. Configure the corresponding Apple provider values in Supabase.
- **What not to change:** Do not invent a Team ID, Key ID, private key, Service ID, or callback URL. Do not put Apple private keys in the mobile app, server source, or chat.
- **Expected result:** The existing browser-based Apple button can complete through Apple → Supabase → `amodka://` once tested in a native build.
- **Send back:** Confirmation screenshots of the enabled Apple provider and Service ID return URL, with all private identifiers and keys redacted.

## 5. Approve non-production native build validation

- **Platform:** Replit Publishing
- **Website/dashboard:** Replit project → Publish
- **Navigation:** Open the Amodka project → **Publish** → mobile build / launch flow
- **What to click / enter:** Do not start this until the Product Owner explicitly approves a development or internal-test build. When approved, confirm the requested identity is `com.amodka.app`.
- **What not to change:** Do not choose production deployment or store submission. Do not replace the configured identifier with `com.amodka` or any AuraCloset identifier.
- **Expected result:** Replit’s managed mobile build flow recognizes the intended app identity and can manage native signing/provisioning without exposing credentials in the codebase.
- **Send back:** Build status screenshot and the generated non-production build identifier/link. Do not share signing credentials.

## 6. Create store records only when internal testing is approved

### iOS TestFlight prerequisite

- **Platform:** App Store Connect
- **Website/dashboard:** [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
- **Navigation:** Apps → **+** → New App
- **What to click / enter:** Use the Apple App ID `com.amodka.app`, app name `Amodka`, and the Product Owner’s chosen SKU.
- **What not to change:** Do not submit the app for review or release it to the App Store.
- **Expected result:** An app record exists solely to receive a future TestFlight build.
- **Send back:** Screenshot of the app record’s General Information page showing the selected bundle ID.

### Android internal-test prerequisite

- **Platform:** Google Play Console
- **Website/dashboard:** [play.google.com/console](https://play.google.com/console)
- **Navigation:** All apps → Create app
- **What to click / enter:** Use app name `Amodka` and reserve package `com.amodka.app` through the first signed AAB upload when a build is approved.
- **What not to change:** Do not roll out to production or create a public listing.
- **Expected result:** An internal-testing track can accept the approved Android build.
- **Send back:** Screenshot of the Internal testing track status with no production rollout.

## 7. Provide privacy-policy and data-disclosure inputs

- **Platform:** Product Owner, then Replit source and store dashboards
- **Website/dashboard:** Product Owner’s approved policy host; later Apple App Store Connect and Google Play Console
- **Navigation:** N/A until the final public HTTPS privacy-policy URL and data-use declarations are approved.
- **What to click / enter:** Provide the final public HTTPS privacy-policy URL and the approved description of account, wardrobe-photo, location, AI-classification, and analytics data handling.
- **What not to change:** Do not add a placeholder URL or make up Apple privacy-manifest reason codes.
- **Expected result:** Engineering can add verified privacy configuration before store-readiness work.
- **Send back:** The approved policy URL and final disclosure text or a link to the approved legal source.

## 8. Execute the real-device deep-link matrix

- **Platform:** Physical iOS and Android devices using approved non-production builds
- **Website/dashboard:** The installed Amodka build and the configured Google/Apple sign-in pages
- **Navigation:** Open Amodka → Sign in → Continue with Google or Apple
- **What to test:**  
  - iOS: Google cold/warm, Apple cold/warm, logout/login, cancellation, invalid callback, expired callback.  
  - Android: Google cold/warm, logout/login, cancellation, invalid callback, expired callback, and app-process-killed return.
- **What not to change:** Do not test with production customer data or change provider settings while testing.
- **Expected result:** Browser closes or returns automatically to Amodka, the session persists after relaunch, and cancellation/errors leave the user safely on sign-in with an understandable error.
- **Send back:** Short screen recording or screenshots for each platform/provider result, including the build version and whether the app was cold or already running.