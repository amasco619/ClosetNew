# Amodka — Technical Reference

> **READ THIS FIRST.** This document is the authoritative technical reference for Amodka. Any developer importing, migrating, or taking over this project must read this document in full before touching any code.
>
> **DO NOT modify any source files during the import or migration phase.** Get the app running exactly as-is first, verify all features work end-to-end, and only then begin any new development. Premature code changes before the environment is verified will make debugging significantly harder.

---

## Table of Contents

1. [Import / Migration Instructions](#1-import--migration-instructions)
2. [Project Overview](#2-project-overview)
3. [Tech Stack](#3-tech-stack)
4. [Architecture](#4-architecture)
5. [Folder Structure](#5-folder-structure)
6. [Data Flow](#6-data-flow)
7. [Environment Variables & Secrets](#7-environment-variables--secrets)
8. [Development Setup](#8-development-setup)
9. [Implemented Features](#9-implemented-features)
10. [Pending Features](#10-pending-features)
11. [Testing & Quality](#11-testing--quality)
12. [Security](#12-security)
13. [Key Conventions](#13-key-conventions)

---

## 1. Import / Migration Instructions

Follow these steps **in order**. Do not skip steps or modify code until step 7.

### Step 1 — Clone or fork the project
Import the Replit project into your new environment. Do not rename files, move directories, or alter the folder structure at this stage.

### Step 2 — Add all required secrets
In Replit, go to **Tools > Secrets** and add the following (see [§7](#7-environment-variables--secrets) for full details):

| Secret | Required |
|--------|----------|
| `GEMINI_API_KEY` | Yes |
| `SUPABASE_URL` | Yes |
| `SUPABASE_SECRET_KEY` | Yes |
| `EXPO_PUBLIC_SUPABASE_URL` | Yes |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes |
| `PHOTOROOM_API_KEY` | Yes |

Do **not** create a `.env` file. Replit secrets are injected automatically into the environment. A `.env` file will override the injected values and break Supabase initialisation.

### Step 3 — Install dependencies
Run in the Replit shell:
```
npm install
```
This installs all packages, applies patches (via `patch-package`), and auto-installs the git pre-commit hook.

### Step 4 — Start the backend
Start the **Start Backend** workflow. It runs `npm run server:dev` and listens on port 5000. Wait until you see the server is ready before starting the frontend.

### Step 5 — Start the frontend
Start the **Start Frontend** workflow. It runs Replit's managed `create-launch login --session "$REPLIT_EXPO_SESSION_SECRET"` step before Expo, then starts Metro with the `EXPO_PACKAGER_PROXY_URL` and `REACT_NATIVE_PACKAGER_HOSTNAME` variables for the Replit dev domain. The login step is deliberately non-fatal so Metro can still start if the short-lived session is unavailable. The Expo QR code will appear in the console. If the login reports an unexpected response, refresh the workspace to renew the session and restart this workflow.

### Step 6 — Verify the app
Open the app on a physical device using Expo Go, or in a simulator. Confirm:
- Welcome / sign-in screen appears
- Onboarding completes successfully
- Adding a wardrobe item triggers Gemini classification
- Outfit tab shows generated looks
- Profile and diagnostics screens load

### Step 7 — Only then begin new development
Once the app is confirmed working end-to-end in the new environment, you may begin writing new code. All changes should be tested with `npm test` before committing (the pre-commit hook enforces this automatically).

### Step 8 — Keep this document updated
Whenever you make a change that affects any section of this document — new API endpoints, file structure changes, new packages, feature additions, convention changes, or test suite updates — update TECHNICAL.md in the same commit. This document is the authoritative on-boarding reference; let it drift and the next developer (or agent) starts blind.

---

## 2. Project Overview

**Amodka** is a quiet-luxury virtual wardrobe and AI styling assistant for iOS and Android, built with Expo (React Native) and a lightweight Express backend.

- **Tagline:** "Your quiet-luxury stylist in your pocket."
- **Design aesthetic:** Quiet luxury — deep navy (#101826), champagne gold (#D0B892), sage (#8AA39B), blush (#EACFD3), warm off-white background (#F5F3F0). No emojis anywhere in the app. Inter font family throughout.
- **Target platforms:** iOS (primary), Android, with a web preview for development.

---

## 3. Tech Stack

### Frontend

| Technology | Role |
|-----------|------|
| **Expo SDK 57** | Native app runtime and build toolchain |
| **React 19.2 / React Native 0.86** | Cross-platform UI framework |
| **Expo Router** (file-based routing) | Screen navigation using `app/` directory conventions |
| **React Native Reanimated 4** | Smooth declarative animations (`withSpring`, `useSharedValue`, `FadeInDown`) |
| **React Native Gesture Handler** | Touch and gesture processing |
| **Expo Image** | High-performance image rendering with caching |
| **Expo Image Picker** | Camera and photo library access |
| **Expo Image Manipulator** | On-device image resizing before classification and storage upload |
| **Expo Location** | GPS coordinates for weather-aware outfit suggestions |
| **Expo Haptics** | Tactile feedback on chip selection and card taps |
| **Expo Linking** | Deep link handling for OAuth redirects |
| **Expo Web Browser** | In-app browser for Google/Apple OAuth flows |
| **Expo Auth Session** | OAuth PKCE session management |
| **Expo Crypto** | UUID generation (`Crypto.randomUUID()`) for item IDs |
| **Expo Localization** | Locale detection for temperature unit (°C / °F) |
| **Expo Glass Effect** | Liquid glass tab bar on iOS 26+ |
| **@expo-google-fonts/inter** | Inter font family (Regular 400, Medium 500, SemiBold 600, Bold 700) |
| **@expo/vector-icons** | Ionicons icon set |
| **React Native Safe Area Context** | Safe inset handling for notch/home indicator |
| **React Native Keyboard Controller** | Smooth keyboard avoidance |
| **react-native-svg** | SVG rendering support |
| **@tanstack/react-query** | Server state management and `apiRequest` helper |
| **zod / zod-validation-error** | Runtime schema validation |

### Backend

| Technology | Role |
|-----------|------|
| **Express** | HTTP server on port 5000, hosts API endpoints and landing page |
| **tsx** | TypeScript execution for the Express server in development (`npm run server:dev`) |
| **express-rate-limit** | IP-based rate limiting on all API endpoints |
| **axios** | HTTP client for Gemini API calls from the server |
| **node:http** | Raw HTTP server wrapping Express for Expo DevTools compatibility |

### Auth & Database

| Technology | Role |
|-----------|------|
| **Supabase Auth** | Email/password sign-up and sign-in, Google OAuth, Apple OAuth, password reset, session management |
| **Supabase Postgres** | User profile storage (`user_profiles` table) |
| **Supabase Storage** | Wardrobe item photos stored as `{userId}/{itemId}.jpg` |
| **@supabase/supabase-js** | Supabase client library |
| **Supabase Admin client** | Server-side entitlement reads, verified entitlement writes, and account deletion using `SUPABASE_SECRET_KEY` |
| **@react-native-async-storage/async-storage** | Session token storage (native) and all offline-first local persistence: wardrobe items, outfit reactions, wear log, blueprint slots, weather cache, affinity data, rotation cursors |

### AI & External APIs

| Technology | Role |
|-----------|------|
| **Google Gemini API** | Garment classification from photos. Primary alias: `gemini-flash-lite-latest`. Fallback model: `gemini-2.5-flash` (used when primary returns 429). Requires `GEMINI_API_KEY`. |
| **Open-Meteo** | Free weather forecast API (no API key required). Returns daily high/low temps and precipitation probability. |
| **ipapi.co** | IP-geolocation fallback when the user has not granted device location permission. |

### State Management

| Technology | Role |
|-----------|------|
| **React Context (`AppContext`)** | Global in-memory state for profile, wardrobe items, premium status, blueprint slots, outfit reactions, wear log, affinity data |
| **AsyncStorage** | All local persistence. Keys are namespaced under `@auracloset_*` |

### Dev & Tooling

| Technology | Role |
|-----------|------|
| **TypeScript** | Strict typing throughout; `npm run typecheck` runs `tsc --noEmit` |
| **drizzle-orm / drizzle-kit** | ORM and migration tooling (schema defined; DB operations primarily via Supabase client) |
| **patch-package** | Applies the `expo-asset` patch on install |
| **eslint / eslint-config-expo** | Linting |
| **@babel/core / babel-plugin-react-compiler** | React compiler Babel transform |

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Expo React Native App                 │
│   (app/ + contexts/ + constants/ + lib/ + components/)  │
│                                                         │
│  ┌──────────────┐   ┌─────────────┐  ┌──────────────┐  │
│  │  AppContext  │   │  Expo Router │  │  AsyncStorage│  │
│  │  (in-memory) │   │  (nav/routing│  │  (offline    │  │
│  │  wardrobe,   │   │   state)    │  │   persistence│  │
│  │  profile,    │   └─────────────┘  └──────────────┘  │
│  │  outfits)    │                                       │
│  └──────┬───────┘                                       │
└─────────┼───────────────────────────────────────────────┘
          │ fetch / axios
          ▼
┌─────────────────────────────────────────────────────────┐
│              Express Server (port 5000)                  │
│   server/index.ts → server/routes.ts                    │
│                                                         │
│   POST /api/classify-garment  (aiLimiter: 10/min)       │
│   POST /api/remove-background (bgRemovalLimiter: 30/min) │
│   GET  /api/user/entitlements (accountLimiter: 5/hr)    │
│   DELETE /api/user/delete-account (accountLimiter: 5/hr)│
└──────┬────────────────────────────────────────────────┬─┘
       │                                                │
       ▼                                                ▼
┌──────────────┐                           ┌────────────────────┐
│  Gemini API  │                           │  Supabase          │
│  (classify   │                           │  - Auth            │
│   garments)  │                           │  - Postgres DB     │
└──────────────┘                           │  - Storage (photos)│
                                           └────────────────────┘
```

### Authentication Flow

1. User taps "Continue with Google/Apple" → `lib/auth.ts` calls `supabase.auth.signInWithOAuth()`
2. Supabase returns an OAuth URL → app opens it in `expo-web-browser`
3. On native redirect, `createSessionFromUrl()` accepts only the exact expected callback base, parses a PKCE `code`, and calls `supabase.auth.exchangeCodeForSession()` with the SecureStore-bound verifier. Native implicit token callbacks are deliberately rejected.
4. Session tokens are stored in `expo-secure-store` on native (iOS Keychain / Android Keystore) via `SecureStoreAdapter`. They are **not** in `AsyncStorage`.
5. For email auth: `signInWithEmail()` first uses the rate-limited server check, then calls `supabase.auth.signInWithPassword()` on the client to establish the session. Server and client Supabase URLs must match; startup rejects non-root URLs, mismatches, or a URL that does not target the selected Amodka Production project.
6. Email sign-up sends only the email and password through the rate-limited server proxy using the publishable Auth key, then attempts the same email sign-in flow to establish the session. No confirmation redirect is needed while Supabase Confirm Email is disabled. Sign-up discloses `account_exists` only for provider-confirmed duplicate codes (`email_exists` or `user_already_exists`); the route remains behind `authLimiter`. A live duplicate probe against the selected Supabase project returned `user_already_exists` (422). If Supabase is configured to return an obfuscated success for duplicates, this signal is unavailable and must not be inferred. Sign-in remains non-enumerating: wrong passwords and unknown emails both map to `invalid_credentials`. Client auth failures use `AuthError` codes and catalogue-only copy; malformed/non-JSON proxy responses map to `network`. Provider outages, invalid keys, missing Auth endpoints, and unstructured provider errors without status/code return a generic retryable error and do not count as failed passwords. Internal auth diagnostics may record a sanitized provider code/status, never provider messages, emails, or passwords.
7. Password-reset redirect selection uses Expo's compile-time `EXPO_OS` value; avoid dynamically importing the React Native namespace, which can access unsupported native modules in Expo Go on iOS.
8. `AppContext` listens to `supabase.auth.onAuthStateChange()` for **subsequent** events only — `INITIAL_SESSION` is intentionally excluded (see Startup Initialization below). The `TOKEN_REFRESHED` entitlement read is deferred until after the callback returns so `authenticatedApiRequest()` can safely call `getSession()`.

Email confirmation is controlled by the hosted Supabase Auth setting **Authentication → Providers → Email → Confirm Email**, not by an app-side mail-sending toggle. The user confirmed Email sign-ups are enabled and Confirm Email is off; physical Production signup on iOS and Android established sessions and opened the app on 2026-10-16. The user also verified `amodka://auth/confirm` is present in the Production project's Auth URL Configuration allowlist. Sign-up does not currently send that redirect because confirmation is disabled; if confirmation is enabled later, restore an in-app guidance flow and pass an allowlisted redirect. Do not auto-confirm users through a service-role admin path.
### Startup Initialization (deterministic, race-free)

On cold start, `AppContext.loadData()` is the single owner of the initialization sequence:

1. Read all AsyncStorage keys in one `Promise.all` (wardrobe, profile, slots, reactions, wear log, etc.)
2. Call `supabase.auth.getSession()` — a local SecureStore read, not a network call
3. If a session exists: call `loadUserDataFromDB(userId, authName, localSnap)` inline and await completion
4. `setAppReady(true)` in the `finally` block — guaranteed to fire after all data is settled
5. `app/index.tsx` gates all routing on `appReady: true` from AppContext

`INITIAL_SESSION` is **not** handled in `onAuthStateChange` because `loadData()` already covers it via `getSession()`. Handling it in the listener as well would recreate the race (`appReady` could fire before the DB load triggered by the listener finished). The listener handles `SIGNED_IN`, `SIGNED_OUT`, and `TOKEN_REFRESHED`; entitlement work for `TOKEN_REFRESHED` is scheduled after the callback returns to avoid re-entering Supabase Auth while its event lock is held.

Two context flags exposed to consumers:
- `appReady: boolean` — safe to route; only `true` after full initialization
- `isAuthenticated: boolean` — `true` when a valid Supabase session was found and DB data was loaded

### Garment Classification Flow

1. User picks a photo in `app/add-item.tsx` via camera or gallery
2. **`expo-image-manipulator` resizes the image to ≤1024 px on the longest edge** (JPEG, 0.8 compress) — reduces the classify payload from a typical 4–12 MB to ~100–300 KB. The original full-resolution base64 is kept separately for the storage upload.
3. Resized base64 is sent to `POST /api/classify-garment` on the Express server
4. Express validates and rate-limits the request, then calls Gemini API with a structured prompt
5. Gemini returns: category, subType, colorFamily, fabric, pattern, fit, neckline, sleeveLength, rise, warmthBand, dominantRgb, modelConfidence
6. Server derives: occasionTags (deterministic business rules), seasonTags, HSL/Lab colour values
7. Response is returned to the app; the item form is pre-filled
8. User reviews and confirms; a readable transparent cutout uploads unchanged as PNG. Otherwise the selected original is prepared as JPEG (≤1600 px longest edge, 0.85 compress) before uploading to Supabase Storage. A missing cutout cache is not a cloud-upload failure.

---

## 5. Folder Structure

```
app/
  _layout.tsx            Root layout — fonts, providers, navigation stack
  index.tsx              Entry router (checks session → tabs / onboarding / welcome)
  welcome.tsx            Welcome screen (sign-in or guest entry)
  sign-in.tsx            Email + social auth screen (sign-in and sign-up modes)
  forgot-password.tsx    Password reset request screen
  onboarding.tsx         Multi-step style profile quiz
  add-item.tsx           Add wardrobe item (camera / gallery + Gemini classification + Photoroom bg removal)
  bulk-review.tsx        Bulk review grid — parallel AI classification + batch save (reached via add-item multi-select)
  item-detail.tsx        Item detail and edit screen
  premium.tsx            Premium upgrade screen
  wear-log.tsx           Full outfit wear history grouped by date
  outfit-ideas.tsx       Outfit ideas for a selected wardrobe item
  auth/
    callback.tsx         OAuth callback landing screen — calls supabase.auth.getClaims(), routes to '/' (index) when a session exists, '/sign-in' when not
  (tabs)/
    _layout.tsx          Tab bar configuration (liquid glass on iOS 26+)
    index.tsx            Home / Dashboard tab
    wardrobe.tsx         Wardrobe grid tab
    outfits.tsx          Outfit recommendations tab
    profile.tsx          Profile and settings tab

components/              Shared React Native components
  ErrorBoundary.tsx      Top-level error boundary
  LuxuryDialog.tsx       Accessible branded confirmation and information modal
  LuxuryFeedbackProvider.tsx Root dialog/toast queues and hooks
  LuxuryToast.tsx         Safe-area success/error toast with optional Undo
  SwipeToDismiss.tsx     Android swipe-to-dismiss gesture wrapper with drag handle (no-op on iOS/web)

contexts/
  AppContext.tsx          Entire app state: profile, wardrobe, premium, blueprint slots,
                         outfit reactions, wear log, affinity, rotation cursors
  LuxuryFeedbackContext.tsx Dialog and toast hooks consumed by app screens

constants/
  colors.ts              Theme colour tokens
  types.ts               All shared TypeScript types (BodyType, StyleGoal, WardrobeItem, etc.)
  blueprintSlots.ts      Per-style-goal slot arrays (6 blueprints × ~19 slots)
  blueprintCore.ts       Pure blueprint algorithm: buildProfileBlueprintSlots(profile)
  blueprintPriority.ts   applyLifestyleWeights(), LIFESTYLE_CATEGORY_WEIGHTS
  wardrobeBlueprint.ts   getProfileBlueprint() — delegates to blueprintCore, adds sampleImage
  outfitGenerator.ts     generatePersonalizedOutfits(), generateOutfitsForItem()
  outfitScoring.ts       Combo scorer, SCENARIO_AFFINITY, STYLE_PREFERRED_COLORS
  outfitRotation.ts      Daily rotation engine: applyDailyRotation(), tieredShuffle()
  outfitGroupsCore.ts    Outfit recipe groups
  wardrobeDiagnostics.ts Deep diagnostics engine (health score, gap analysis)
  affinity.ts            Personal calibration: per-item affinity, per-pair pairAffinity
  weather.ts             Weather-aware outerwear logic, Open-Meteo integration
  orphanDetection.ts     Ghost-item recovery helpers: detectNoPhotoOrphans(), detectFileOrphans(), applyOrphanResolution()
  rePhotographSave.ts    applyRePhotographSave() — pure add+remove branching for re-photograph flow
  guestPhotoCleanup.ts   deleteGuestPhoto(), runGuestRemoval(), buildGuestPhotoDestPath() — guest local file cleanup

lib/
  auth.ts                Auth helpers (signIn/Up/Out, OAuth, password reset)
  supabase.ts            Supabase client (SecureStore session adapter for native)
  storage.ts             uploadWardrobeImage() — uploads to Supabase Storage
  query-client.ts        @tanstack/react-query setup, apiRequest() helper
  photoroom.ts           removeBackground() client — calls /api/remove-background, retries on photoroom_timeout
  classifyPath.ts        resolveClassifyBase64(), selectClassifyPayload(), resolvePhotoUri() — bg-removal/classify pipeline helpers
  uploadArg.ts           resolveWardrobeUploadArg(), stripDataUriPrefix() — upload argument normalisation
  rebaseGuestPhotoUri.ts rebaseGuestPhotoUri() — Android post-update documentDirectory path fix for guest photos
  bulkClassifyCore.ts    Parallel classification helpers shared between add-item and bulk-review
  alertDialogAdapter.ts  Alert.alert-compatible adapter for the branded dialog queue
  carouselUtils.ts       Carousel layout utilities for bulk-review grid

server/
  index.ts               Express server entry (port 5000, 10mb JSON body limit)
  routes.ts              Route registration (single/multi-item classification, removeBackground, auth, account deletion)
  classify-garment.ts    POST /api/classify-garment — Gemini classifier
  classify-multi-item.ts POST /api/classify-garments — isolated B1/B2 multi-item classifier and envelope validator
  remove-background.ts   POST /api/remove-background — Photoroom background removal; 15 s AbortController timeout; error codes from shared/photoroom-error-codes
  supabase.ts            Server-side Supabase admin client
  middleware/
    rateLimiter.ts       aiLimiter, bgRemovalLimiter, accountLimiter exports

shared/
  photoroom-error-codes.ts  Shared error-code string constants (PHOTOROOM_TIMEOUT_ERROR, PHOTOROOM_ERROR, etc.) imported by both server/remove-background.ts and lib/photoroom.ts

assets/
  body_types/            Illustrated body shape images (6 types)
  recommendations/       Sample images for blueprint slots (19 flat-lay photos)

__tests__/               106 test suites (see §11)

scripts/
  run-tests.mjs          Test runner (tsx, Node)
  watch-tests.mjs        File-watch test runner (400ms debounce)
  install-hooks.mjs      Git pre-commit hook installer (runs on npm install)
  post-merge.sh          Post-merge setup script (runs after task merges)
```

---

## 6. Data Flow

### Wardrobe Item Lifecycle

```
User takes/picks photo
  → add-item.tsx stores original full-res base64 (photoBase64) + asset URI
  → expo-image-manipulator resizes to ≤1024 px longest edge → classifyBase64
  → POST /api/classify-garment (Express + Gemini) receives classifyBase64 (~100–300 KB)
  → Item form pre-filled with classification results
  → User confirms
  → Crypto.randomUUID() generates item ID
  → read cached transparent PNG, or prepare original JPEG if unavailable
  → uploadWardrobeImage() uploads to Supabase Storage: {userId}/{itemId}.png or .jpg
  → addWardrobeItem() saves item to AppContext state + AsyncStorage
  → Blueprint slots updated (first matching needed slot becomes owned)
  → generateOutfitsForItem() builds "just added" outfit suggestions
```

### Outfit Generation

```
AppContext wardrobe + profile
  → generatePersonalizedOutfits() [constants/outfitGenerator.ts]
    → generateOutfitPool(): all valid outfit combinations, scored
    → affinity multipliers applied (constants/affinity.ts)
    → weather-aware outerwear gating (constants/weather.ts)
  → applyDailyRotation() [constants/outfitRotation.ts]
    → tieredShuffle() with seeded Mulberry32 PRNG
    → per-scenario quotas (Free: 2/day, Premium: 4/day, Guest: 1/day)
    → hero-diversity enforcement (yesterday's heroes deprioritised)
    → cross-scenario fingerprint dedup
    → completeness bias (+1 confidence for full shoe+bag+jewelry stack)
  → Outfits tab renders result
```

### Local Persistence (AsyncStorage keys)

| Key | Contents |
|-----|---------|
| `@auracloset_profile` | UserProfile object |
| `@auracloset_wardrobe` | WardrobeItem[] array |
| `@auracloset_slots` | Blueprint slot statuses |
| `@auracloset_reactions` | OutfitReaction[] array |
| `@auracloset_wear_log` | WearEntry[] array |
| `@auracloset_affinity_v1` | Per-item and per-pair affinity signals |
| `@auracloset_rotation_v1` | Per-scenario rotation cursors and seeded shuffle state |
| `@auracloset_weather_v1` | WeatherSnapshot (6-hour cache) |
| `@auracloset_mood_of_day` | MoodOfDay[] array |

---

## 7. Environment Variables & Secrets

All secrets are set in **Replit Secrets (Tools > Secrets)**. Never commit secrets to code or create a `.env` file.

### Required Secrets

| Secret | Used by | Description |
|--------|---------|-------------|
| `GEMINI_API_KEY` | `server/classify-garment.ts` | Google Gemini API key. Needs access to `gemini-flash-lite-latest` and `gemini-2.5-flash` models. |
| `SUPABASE_URL` | `server/supabase.ts` | Your Supabase project URL (e.g. `https://xyzabc.supabase.co`). Used by the server-side admin client. |
| `SUPABASE_SECRET_KEY` | `server/supabase.ts` | Supabase service-role (secret) key for server-side entitlement reads, verified entitlement writes, and account deletion. Keep confidential — bypasses RLS and has full database access. |
| `EXPO_PUBLIC_SUPABASE_URL` | `lib/supabase.ts` | Your Supabase project URL. The `EXPO_PUBLIC_` prefix injects it into the Expo bundle for the client-side Supabase client. |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `lib/supabase.ts` | Supabase anonymous/publishable key. Safe to bundle; RLS policies enforce row-level access control. |
| `PHOTOROOM_API_KEY` | `server/remove-background.ts` | Photoroom background-removal API key. Required for `POST /api/remove-background`. Without it the endpoint returns HTTP 503 and the app falls back to the original photo. |

### Runtime Environment Variables (auto-set by Replit workflows)

| Variable | Set by | Description |
|----------|--------|-------------|
| `EXPO_PACKAGER_PROXY_URL` | Start Frontend workflow | Points Expo to the Replit dev domain proxy |
| `REACT_NATIVE_PACKAGER_HOSTNAME` | Start Frontend workflow | Expo Metro hostname |
| `EXPO_PUBLIC_DOMAIN` | Start Frontend workflow | Used for API base URL in development |

---

## 8. Development Setup

### Prerequisites
- Node.js 20+
- npm 10+
- A physical iOS/Android device with Expo Go, or a simulator

### Starting the app

```bash
# 1. Install dependencies (also installs pre-commit hook)
npm install

# 2. Start the backend (keep this terminal open)
npm run server:dev    # or use the "Start Backend" Replit workflow

# 3. Start the frontend (separate terminal)
npx expo start --localhost   # or use the "Start Frontend" Replit workflow
```

### Useful scripts

| Command | Description |
|---------|-------------|
| `npm test` | Run all 106 test suites once |
| `npm run test:watch` | Re-run tests on file change (400ms debounce) |
| `npm run typecheck` | TypeScript type-check (`tsc --noEmit`) |
| `npm run lint` | Run the Expo SDK 57 ESLint checks for app, component, and source files |
| `npm run hooks:install` | Re-install or update the git pre-commit hook |
| `npm run server:dev` | Start the Express server with hot-reload via tsx |

### Pre-commit hook

A pre-commit hook is automatically installed on `npm install`. It runs:
1. `npm run typecheck` — blocks the commit if there are type errors
2. `npm test` — blocks the commit if any test suite fails

If you need to bypass it in an emergency: `git commit --no-verify` (use sparingly).

---

## 9. Implemented Features

### Luxury UI — Welcome, Sign-in & Onboarding Screens
All three entry screens were redesigned with a quiet-luxury visual system:

**Welcome screen (`app/welcome.tsx`):**
- Full-screen `assets/images/closet.jpg` background with a 14-second Ken Burns slow-breathe animation (scale 1.0 → 1.07, `withRepeat` via Reanimated)
- Three-stop `LinearGradient` scrim (`navyScrimTop` → `navyScrimMid` → `navyScrimBottom`)
- Three `BlurView` (intensity 28) glass buttons: gold-bordered "Get started", ghost-glass "I already have an account", sage ghost "Explore as guest"
- Atelier micro-label in champagne gold (letter-spacing 4.5), 34 px bold headline, translucent tagline
- Supabase session check (`supabase.auth.getSession`) fires on mount; authenticated users are forwarded directly to tabs
- `expo-image` used (not RN `Image`) for `closet.jpg` to support the `transition` prop

**Sign-in screen (`app/sign-in.tsx`):**
- Email sign-up asks only for email and one password; the password requirements are shown inline. `signInWithEmail`, Google/Apple OAuth, email validation, forgot-password routing, and error display remain.
- Visual layer replaced: closet.jpg background with deepened scrim, `BlurView` (intensity 30) glass inputs with gold focus border (`Colors.glassBorderWhite` → `Colors.secondary`), social auth as `BlurView` glass cards, gold underline tab switcher, champagne gold submit button

**Onboarding screen (`app/onboarding.tsx`):**
- Step 0 redesigned: atelier `◆` monogram badge, "May we have your name?" copy, elevated surface `TextInput` with gold focus state and subtle shadow; `FadeInDown` stagger (60 / 120 / 180 ms)
- Progress indicator: replaced dot-segment array with a liquid capsule track (fills proportionally per step) + "STEP N OF 9 · PERSONAL CALIBRATION" micro-label in sage
- Footer CTA: navy card with champagne gold text and arrow icon; disabled state uses translucent fill
- All 9 steps (name, body type, face shape, eye colour, skin tone, style goals, lifestyle, extras, finish) content unchanged

**New colour tokens in `constants/colors.ts`** (all additions — no existing token modified):
`navyScrimTop`, `navyScrimMid`, `navyScrimBottom`, `navyScrimAuthMid`, `navyScrimAuthBottom`, `glassBorder`, `glassBorderWhite`, `glassSurface`, `glassSurfaceGold`

**Code:** `app/welcome.tsx`, `app/sign-in.tsx`, `app/onboarding.tsx`, `constants/colors.ts`, `assets/images/closet.jpg`

---

### Onboarding — Couture SVG Body Shape Illustrations
The six body-type cards in onboarding step 1 (Body Shape) now display inline vector silhouettes instead of raster PNGs.

**Implementation:**
- 6 SVG files created in `assets/body_types/` (`.svg` alongside the retained `.png` originals)
- Onboarding renders them as inline `react-native-svg` components (`Svg`, `Circle`, `Path`, `Line`, `Ellipse`, `Rect`) via the `BodyTypeSVG` function component defined at the top of `app/onboarding.tsx`
- `BODY_TYPE_IMAGES` PNG map and the `Image`/`ImageSourcePropType` react-native imports were removed
- Each silhouette: `viewBox="0 0 100 145"`, head circle + bezier body path (navy stroke, translucent navy fill), unique champagne gold accent element per archetype:

| Shape | Gold accent |
|---|---|
| Hourglass | Dashed waist cinch line at hip level + faint shoulder reference line |
| Pear | Dotted ellipse halo at hip level |
| Apple | Dotted circle halo at midsection |
| Rectangle | Dashed structural rect overlay across torso |
| Inverted Triangle | Solid gold shoulder bar + faint dashed secondary |
| Athletic | Two horizontal posture dashes at chest and waist |

- `tsconfig.json` `exclude` array updated to include `"attached_assets"` to prevent reference template files from being type-checked

**Code:** `app/onboarding.tsx`, `assets/body_types/*.svg`, `tsconfig.json`

---

### Onboarding
Multi-step style quiz capturing: name, body type (with illustrated SVG silhouettes for 6 body shapes), eye colour, skin tone, undertone, primary and secondary style goals, and lifestyle percentages (work / casual / events / active / brunch). Profile is persisted to AsyncStorage and Supabase. The app routes to onboarding when `profile.onboardingComplete` is false.

**Code:** `app/onboarding.tsx`, `contexts/AppContext.tsx`

---

### Wardrobe Digitisation
Users photograph or select items from their photo library. Before any network call is made, `expo-image-manipulator` performs two on-device resize passes:
- **Classify pass** — longest edge clamped to 1024 px, JPEG 0.8 compress → `classifyBase64` sent to Gemini (~100–300 KB)
- **Storage pass** — longest edge clamped to 1600 px, JPEG 0.85 compress → `storageBase64` uploaded to Supabase (~300–600 KB)

The original full-resolution asset is never sent over the network. Both resize calls fall back silently to the original base64 if `manipulateAsync` throws, so users are never blocked from adding an item. Client-side item caps: Guest = 8, Free = 30, Premium = 2,000; server-side capacity enforcement is not part of B1.

`uploadWardrobeImage()` accepts an optional `mimeType` parameter (`'image/jpeg'` default, `'image/png'` supported); the file extension is derived from the MIME type. `deleteWardrobeImage()` removes both `.jpg` and `.png` variants to handle items stored under either extension.

**Recent improvements to `app/add-item.tsx`:**
- `gestureEnabled: false` on the add-item stack screen (set in `app/_layout.tsx`) — prevents the iOS swipe-back gesture from partially dismissing the form mid-save.
- "Cancel" text button replaces the earlier icon-only close control, improving accessibility and clarity.
- Subtype chip rows use `flexDirection: 'row', flexWrap: 'wrap'` instead of a `ScrollView` — all sub-types are always visible without horizontal scrolling.
- Photoroom background removal is now invoked between photo selection and classification (see [Photoroom Background Removal](#photoroom-background-removal) for the full pipeline).
- Re-photograph flow: when `replaceItemId` is present in route params, saving a new item atomically removes the old ghost item (see [Re-photograph Flow](#re-photograph-flow)).
- Multi-select now routes directly to `bulk-review.tsx` with no intermediate splash screen.

**Code:** `app/add-item.tsx`, `lib/storage.ts`, `lib/classifyPath.ts`, `lib/uploadArg.ts`, `constants/rePhotographSave.ts`

---

### Gemini Garment Classification
A resized base64 image (≤1024 px, ~100–300 KB) is sent to `POST /api/classify-garment`. Gemini classifies the item into category, subType, colourFamily, fabric, pattern, fit, neckline, sleeveLength, rise, warmthBand, and returns a dominant RGB for perceptual colour scoring. The server applies deterministic occasion and season rules on top of Gemini's output for consistency. Two-model fallback: `gemini-flash-lite-latest` → `gemini-2.5-flash` on 429. The primary remains a rolling alias because a pinned Flash-Lite probe returned HTTP 404 here; real-photo scoring must have a provider-resolved model version or fail closed. Content guardrails reject selfies, blurry images, non-clothing subjects. Safe structured classification logs include a generated ID, SHA-256/size/MIME, model/attempt/status, prompt SHA-256, stage and error code, but never raw image or provider content.

Matching pairs and coordinated sets worn as a unit count as one item. Multiple-garment refusal applies only to unrelated garments without a dominant item; uncertain multiplicity favors classifying the dominant item. HTTP 422 `content_guardrail` is a non-retryable result with fixed calm client copy and manual entry, not a transient failed analysis. The original five content guardrails and stole/textile safeguards remain in force. See `docs/reports/classifier-pairs-refusal.md`.

**Runtime configuration:** `GEMINI_PRIMARY_MODEL` optionally overrides only the primary classifier model; unset/blank defaults to `gemini-flash-lite-latest`. The `gemini-2.5-flash` fallback still runs only after 429, and resolved models remain logged. No environment values were changed by this cleanup.

**Upload diagnostics:** off by default. For a development investigation only, set `EXPO_PUBLIC_UPLOAD_DIAGNOSTICS=1` and restart Metro. Both `__DEV__` and this flag are required for preparation/staging logs, on-card diagnostic text and the batch build stamp. Logs use `console.log`, not LogBox-triggering warnings. `reportUploadError({stage,code})` accepts only allowlisted stage/code values, never errors/paths/user data; it logs under the flag in dev and is a release no-op. The diagnostic formatter returns immediately in release, so its formatting body/strings are eliminated even if the flag is set to 1. `.replit` permanently retains documented `EXPO_UNSTABLE_HEADLESS=1` to avoid container DevTools/GLib failures; Metro and Expo Go remain enabled.

**Background-removal allowance copy:** Free accounts receive 20 lifetime removals, not a daily allowance. Remaining/limit banners now say lifetime; counters and provider/quota enforcement are unchanged.

**Single/bulk preparation parity:** both routes call `lib/prepareClassificationImage.ts`. It uses the existing Expo manipulator's contextual API to read decoded dimensions, caps the longest edge at 1024 px without upscaling, specifies only one resize axis to preserve proportions, and saves once as JPEG at quality 0.8. Native image/context references are released on success and failure. It does not rely on picker or dev-only staged diagnostics for dimensions. Bulk retains its serial transform queue. The existing successful cutout PNG versus original-JPEG fallback rules and byte-derived MIME stay unchanged. This removes the former width-only bulk resize difference; it does not guarantee deterministic Gemini colour labels or prove a higher real-photo accuracy rate. See `reports/classification-preparation-parity.md`.

**RGB/colourFamily consistency validation:** `processGeminiResult` validates that `dominantRgb`-derived HSL is consistent with the stated `colorFamily` before storing perceptual colour values. Truly achromatic families (`black`, `white`, `grey`) are checked for saturation contamination (threshold: 0.25). All other families are checked for hue distance against a centroid lookup (threshold: 40°). When the RGB is inconsistent — e.g. because background contamination skewed the sampled pixel — both `dominantHsl` and `dominantLab` are corrected to the family centroid rather than discarding the classification. Image-derived colour/hue/saturation values are not logged; the existing safe structured classification diagnostics remain. The `colorFamily` label itself is never changed. Constants: `DOMINANT_RGB_HUE_THRESHOLD_DEG = 40`, `DOMINANT_RGB_ACHROMATIC_SAT_THRESHOLD = 0.25`, `SERVER_FAMILY_CENTROID_HSL` (18-family lookup).

**Low-confidence indicator:** Gemini's `modelConfidence` (0–1) is now stored on `WardrobeItem`. Items classified with `modelConfidence < LOW_CONFIDENCE_THRESHOLD (0.65)` display a subtle amber "Review" badge/pill in the wardrobe grid and list views, giving users an opportunity to correct potentially wrong classifications before they affect outfit recommendations. The threshold is exported from `constants/types.ts`.

**Code:** `server/classify-garment.ts`, `server/routes.ts`, `constants/types.ts`, `app/(tabs)/wardrobe.tsx`

#### B1/B2 Multi-Item Classification Prerequisite

`POST /api/classify-garments` is an additive authenticated path; it does not replace or reroute `POST /api/classify-garment`. Set `MULTI_ITEM_CLASSIFIER_ENABLED=false` to disable only the multi-item path. The endpoint accepts one `imageBase64` field, detects 2–6 garment instances, and validates the complete result before returning it.

- Every detected garment is normalized by the unchanged `processGeminiResult()` scalar machinery. A refused or invalid required member rejects the entire envelope.
- Public detection IDs are classification-local (`det-001`, `det-002`, …), not wardrobe item UUIDs. Items are sorted by quantized region `y`, `x`, `height`, `width`, then provider-local detection ID; IDs and relationship members follow that order.
- Relationship type is limited to `coordinated_set`, `multi_item`, or `layered`; member references must exactly match all detected items.
- The public result is rebuilt from allowlisted fields. It contains normalized classification, bounded region provenance, relationship data, and validation metadata—never raw provider output, URLs, image bytes, tokens, operation IDs, or persistence identifiers.
- This path performs no database, Storage, group, membership, manifest, or RPC operation.

**Code:** `server/classify-multi-item.ts`, `server/routes.ts`, `__tests__/classifyMultiItem.test.ts`

---

### Personalised Outfit Generation
Builds complete outfits exclusively from the user's owned wardrobe items. Uses occasion tags, colour harmony rules (neutral + anything, monochromatic), style-goal colour preferences, and profile constraints (noSleeveless, noShortSkirts, maxHeelHeight, colorAversions). No placeholder or "need to buy" items appear in generated outfits.

**Code:** `constants/outfitGenerator.ts`, `constants/outfitScoring.ts`

---

### "Just Added" Outfit Suggestions
When a new item is uploaded, `generateOutfitsForItem()` builds complete looks centred on that item using existing wardrobe pieces. These appear as a dismissable banner in the Outfits tab ("Styled for your new item") and contribute to the "Ready Outfits" count on the dashboard.

**Code:** `constants/outfitGenerator.ts`, `app/(tabs)/outfits.tsx`

---

### Outfits Tab
Shows only real, wearable looks from the user's owned items. Features: scenario filter (work / casual / date / event / brunch / active, plus resort / night-out for premium), lookbook-style cards with item photos, mood descriptor per scenario, "Ready to wear" badge on every outfit.

**Code:** `app/(tabs)/outfits.tsx`

---

### Wardrobe Analytics
Category distribution bar chart and colour palette grid showing the breakdown of owned items. Accessible from the Wardrobe tab.

**Code:** `app/(tabs)/wardrobe.tsx`

---

### Blueprint System (Smart Buy List)
Dynamic per-style-goal wardrobe blueprints. 6 curated sets (minimal, elevated, bold, romantic, classic, youthful). Algorithm (`buildProfileBlueprintSlots`) selects and ranks 19 essential slots based on primary/secondary style goal, body type priority boosts, lifestyle percentages, and constraints. Slot statuses (needed / owned) update automatically when items are added or removed. The Home tab shows "Starter Recommendations" (the first needed slot per category).

The Blueprint screen (`app/blueprint.tsx`) is **open to all users including free tier**. Every user sees the full 19-slot map with real owned / needed status and their personalised progress count. Premium-only extras (close-colour-match hints and the "Next smart buy" highlight badge) remain locked. A soft upsell strip at the bottom of the free view explains what's unlocked with Premium without hiding the map itself.

**Code:** `constants/blueprintCore.ts`, `constants/blueprintSlots.ts`, `constants/wardrobeBlueprint.ts`, `constants/blueprintPriority.ts`, `app/blueprint.tsx`

---

### Deep Diagnostics (Premium)
Wardrobe health score (0–100, graded A–F), category balance analysis, colour palette neutral/accent ratio, scenario coverage strength, hardest-working versatile pieces, blueprint completion %, and a prioritised gap list with contextual explanations. All computed client-side from AsyncStorage wardrobe data. Accessible from the Premium screen after upgrading.

**Code:** `constants/wardrobeDiagnostics.ts`, `app/premium.tsx`

---

### Personal Calibration Loop
Taste learns from every user signal: love taps, "not today" taps, and outfits logged as worn. Signals aggregate with 60-day half-life recency decay into per-item `affinity` multipliers (clamped [0.7, 1.3]) and per-pair `pairAffinity` multipliers (clamped [0.8, 1.2]). Cold-start safe: multipliers stay at 1.0 until ≥5 signals accumulated. Profile screen shows a "Why this changed" expandable card with top liked/disliked items and pairs.

**Code:** `constants/affinity.ts`, `app/(tabs)/profile.tsx`

---

### Phase 3.4 — Gold-Standard Benchmark V2: Ranking Calibration

Evaluation-only phase — no production code changes. Built a comprehensive ranking benchmark (`__tests__/benchmark-phase34.ts`, run via `npx tsx`) to measure how accurately AuraCloset's internal `scoreOutfitCombo` engine ranks outfits against expert external assessment. Full report: `docs/phase-34-report.md`.

#### Benchmark Design

- **30 competitive scenarios** (3–6 viable candidates each) covering 10 quality categories: Colour, Pattern, Material, Minimalism, Silhouette, Formality, Practicality, Tonal, Visual Hierarchy, Quiet Luxury
- **20 pairwise adversarial comparisons** (inferior A vs superior B; engine must rank B above A)
- **163 candidate outfits** evaluated total
- External scores (0–100) assigned via 10-dimension rubric **before** running internal scoring (prevents evaluator bias)
- 5 ranking metrics: Top-1 Accuracy, Top-3 Capture Rate, Pairwise Accuracy, Recommendation Regret, Kendall's τ

#### Results

| Metric | Result |
|---|---|
| Top-1 Accuracy | 16/30 (53%) |
| Top-3 Capture Rate | **29/30 (97%)** |
| Pairwise Accuracy | **17/20 (85%)** |
| Mean Regret | 4.2 pts |
| Median Regret | 0 pts |
| Max Regret | 22 pts (CS29 quiet-luxury casual) |
| Mean Kendall's τ | 0.413 |

#### Category Breakdown

| Category | Top-1 | Pairwise | Mean Regret |
|---|---|---|---|
| Material | 3/3 (100%) | 2/2 (100%) | 0.0 |
| Minimalism | 3/3 (100%) | 2/2 (100%) | 0.0 |
| Tonal | 2/3 (67%) | 2/2 (100%) | 1.0 |
| Colour | 2/3 (67%) | 1/1 (100%) | 0.3 |
| Quiet Luxury | 2/3 (67%) | 1/1 (100%) | 7.3 |
| Formality | 1/3 (33%) | 2/3 (67%) | 2.7 |
| Pattern | 1/3 (33%) | 3/3 (100%) | 5.7 |
| Practicality | 1/3 (33%) | 0/1 (0%) | 4.3 |
| Visual Hierarchy | 1/3 (33%) | 0/1 (0%) | 13.3 |
| Silhouette | 0/3 (0%) | 3/3 (100%) | 7.0 |

#### Key Findings

**What works:**
- Phase 3.3B texture fix confirmed in ranking: silk+cashmere > silk+satin in all competitive and pairwise tests
- Material stack discrimination: silk+wool+leather > cotton+cotton+synthetic (100% pairwise)
- Warm tonal coherence correctly identified; multicolour chaos correctly penalised
- Pattern safety signals correct: stripe+check, floral+stripe, three-pattern outfits all score below clean solids

**Systematic gaps (no production fixes in this phase):**
1. **Focal-point competition** — adding more statement accessories/pieces always increases score (completeness bonus fires regardless of visual noise). CS26/CS27/AP14 affected.
2. **Hero-pattern + solid-ground hierarchy** — floral top + solid black midi scores *lower* than solid+solid because patternSafety penalises the floral even with a neutral ground. CS05 affected.
3. **Silhouette signals too weak** — `heightProportion` and `bodyTypeProportion` generate ±1–2pt signals; fabric/completeness generates ±5–10pt swings. Silhouette-appropriate choices are consistently overruled. All 3 silhouette scenarios missed Top-1.
4. **Weather-blindness** (by design) — `scoreOutfitCombo` has no temperature/weather parameter; weather gates live in `generateOutfitPool`. Practicality failures (AP11, CS20) are architecture-level, not signal bugs.

#### Future Enhancement Candidates (not implemented)

| ID | Enhancement | Relevant Failures |
|----|-------------|-------------------|
| FE-1 | Hero-pattern + solid-ground bonus signal | CS05, AP13 |
| FE-2 | Statement-piece competition / visual-weight budget | CS26, CS27, AP14 |
| FE-3 | Silhouette signal weight increase (×2–3) | CS13, CS14, CS15 |
| FE-4 | Outerwear quality-tier distinction (structured tailored vs casual) | CS04, CS16, CS29 |

#### Verdict

```
COMPETENT RANKING — Phase 3.4 STATUS: COMPLETE — PRODUCTION CHANGES: NONE
```

The engine reliably avoids the worst outfits (pairwise 85%) and captures the best outfit in the top 3 in 97% of scenarios. It is appropriate for production use. Fine-grained top-1 precision within the top quality tier is the next improvement frontier.

---

### Phase 3.3B — Recommendation Quality Intelligence

Targeted refinement to `textureHarmony` in `constants/outfitScoring.ts` to distinguish sophisticated material contrasts from genuinely problematic texture combinations. No candidate generation, formality gates, weather gates, or other scoring dimensions were changed. Full report: `docs/phase-33b-report.md`.

#### Root Cause Fixed

**`textureHarmony` blanket "two-statement = bad" rule** (`constants/outfitScoring.ts`)

The pre-3.3B rule applied −3 whenever ≥2 fabrics from `STATEMENT_FABRICS` (leather, silk, satin, cashmere, velvet) appeared in core garments. This treated silk+cashmere (quintessential quiet-luxury) identically to silk+satin (competing lustrous fabrics = bridal/costume). A boring cotton+cotton outfit scored *higher* than a silk+cashmere one, which is precisely wrong.

Additionally, `leather` was incorrectly listed in the "shiny" set. Leather is structured and matte; it is not gloss-lustrous like silk or satin.

#### What Changed

| Combination | Before | After |
|---|---:|---:|
| Single statement hero (silk+wool, cashmere+wool, etc.) | +3 | +3 |
| Intentional contrast — 1 gloss + 1 matt statement (silk+cashmere, leather+velvet, etc.) | −3 | **+1** |
| Competing gloss — 2 high-gloss statements (silk+satin) | −5 | −5 |
| All-flat fabrics (cotton+cotton, denim+synthetic) | −2 | −2 |

The distinction: a **matt statement** (cashmere, velvet) paired with a **gloss statement** (silk, satin) or another **matt statement** (leather, cashmere) is the foundation of quiet-luxury dressing — it should be rewarded, not penalised. Only gloss-on-gloss (silk+satin) competes for the same visual frequency and should remain negative.

`SHINY_FABRICS` was renamed `GLOSS_FABRICS` and corrected to `['silk', 'satin']` (leather removed).

#### Phase 3.3B Benchmark Results

| Metric | Phase 3.3A | Phase 3.3B |
|---|---:|---:|
| Outfits evaluated | 65 | 65 |
| Mean quality | 77.4 | 77.4 |
| Median quality | 78 | 78 |
| Excellent (≥85) | 21 | 21 |
| Strong (70–84) | 41 | 41 |
| Acceptable (50–69) | 3 | 3 |

Target scenario improvements:

| Scenario | External | Phase 3.3A | Phase 3.3B | Δ |
|---|---:|---:|---:|---:|
| QL1 Silk+Cashmere+Leather | 80 | 96 | **100** | +4 |
| QL2 Cotton boring neutral | 75 | 97 | 97 | 0 |
| AD6 Quiet luxury vs colour | 80 | 50 | **54** | +4 |
| PT5 Three competing statements | 79 | 57 | 57 | 0 |

QL1 now scores higher than QL2 (100 vs 97). The engine correctly identifies a silk+cashmere outfit as more sophisticated than a cotton+cotton one.

#### Tests
- `__tests__/phase31-freshness.test.ts` — 15 groups covering all freshness edge cases
- `__tests__/phase31-rise.test.ts` — 16 groups covering all rise × body-type × height combinations

---

### Phase 3.3A — Candidate Generation Robustness

Targeted fix for 7 false-empty scenarios identified in the Phase 3.2 audit. Only two constants and one hero-inclusion step were changed; no weather/safety gates or hard formality rules were touched. Full report: `docs/phase-33a-report.md`.

#### Root Causes Fixed

**1. `SUBTYPE_FORMALITY['blouse']` corrected 6 → 4** (`constants/outfitScoring.ts`)  
The old value of 6 placed every blouse-seeded core above the brunch ceiling (F5), above the casual spread limit when paired with sneakers (spread = 5 > 3), and inside the interview range — causing false empties in C2, C3, P6, P8, F1, F5, AD1. Correct value is 4 (smart-casual centre of the F3–F7 blouse range).

**2. `SUBTYPE_FORMALITY['shirt']` corrected 5 → 6** (`constants/outfitScoring.ts`)  
F5 caused interview-scenario floor (F6) to reject shirt+trouser cores: avg(5,6)=5.5 < 6. A dress shirt / Oxford is business-formal (F6); avg(6,6)=6 correctly meets the interview floor.

**3. Hero-inclusion in outerwear/shoe `coreFitsScenario` check** (`constants/outfitRotation.ts`)  
When an outerwear or shoe item acts as the hero, its formality now participates in the `coreFitsScenario` average alongside top and bottom. A blazer (F6) or stilettos (F7) elevates the outfit mean, allowing it to clear a higher-floor scenario that the bare top+bottom pair would miss.

#### Fallback-Cores Path & Metadata

A fallback-cores path activates only when the hero-seeding loop produces zero qualifying cores. It sweeps ranked top+bottom combinations through the same formality gate, with no hero distinctiveness requirement. Outfits generated this way are marked `generationPath: 'relaxed'` on the `OutfitSet` object; hero-seeded outfits leave `generationPath` undefined (treated as strict). Honest empties (wardrobe genuinely insufficient) still return `[]`.

**`OutfitSet.generationPath?: 'strict' | 'relaxed'`** — added to `constants/types.ts`.

#### Phase 3.3A Benchmark Results

| Metric | Phase 3.2 | Phase 3.3A |
|---|---:|---:|
| Outfits evaluated | 54 | 65 |
| Mean quality | 77.3 | 77.4 |
| Median quality | 78 | 78 |
| Zero candidates | 14 | 8 |
| False empty states | 7 | 0 |
| Excellent (≥85) | 16 | 21 |
| Strong (70–84) | 35 | 41 |
| Acceptable (50–69) | 3 | 3 |

8 remaining zeros are correct empties (wardrobe formality insufficient for the scenario): P2, F4, PT2, SC2, SC3, SC4, AD4, AD5.

#### Tests
- `__tests__/phase31-freshness.test.ts` — 15 groups covering all freshness edge cases
- `__tests__/phase31-rise.test.ts` — 16 groups covering all rise × body-type × height combinations

---

### Phase 3.1 — Recommendation Engine Improvements

Two targeted P0 changes following the Phase 3 forensic audit. No other scoring dimensions were modified.

#### P0-A — Freshness / Wear-History Conflict (resolved)

**Problem:** `wornHistoryBoost` gave a worn outfit +10–16 score advantage. `applyFreshnessOrder` then moved it to the end of the pool positionally, but `applyCompletenessBias` and `tieredShuffle` immediately re-sorted by score — completely undoing the positional demotion. Result: recently-worn loved outfits resurfaced immediately.

**Fix:** Freshness is now a **score reduction inside `wornHistoryBoost`**, not a positional reorder. The penalty participates in the same ranking pass as all other signals:

| Worn | Freshness penalty | Net boost (once-worn) |
|------|-------------------|-----------------------|
| 0–1 days | −8 | +2 |
| 2–4 days | −5 | +5 |
| 5–9 days | −2 | +8 |
| 10+ days | 0 | +10 (full preference signal) |

Properties preserved:
- Preference memory is not destroyed — the boost remains positive even at maximum penalty.
- A genuinely better worn outfit still wins over a poor fresh alternative (score-based).
- Only-viable-outfit case: net +2 minimum — engine never produces a worse outfit to avoid repetition.
- `applyFreshnessOrder` retained as a secondary tiebreaker for equal-scored outfits.

**Code:** `constants/outfitScoring.ts` — `wornHistoryBoost`

#### P0-B — Rise Field Integrated into Proportion Scoring

**Problem:** The `rise` field (`'low' | 'mid' | 'high'`) was captured by Gemini at classification time and stored on every bottom item, but was never consumed by the recommendation engine.

**Fix:** New `riseHarmony` dimension added to `scoreOutfitCombo` and `OutfitScoreBreakdown`. Fires only when **both** the bottom's `rise` and the top's `fit` are known — unknown/legacy items return exactly 0 with no penalty.

| Combination | Score |
|-------------|-------|
| high-rise + slim/tailored top | +1 (waist defined, clean proportions) |
| high-rise + loose/oversized top | −1 (two volumes above the waist, reads boxy) |
| low-rise + loose/oversized top | −1 (dropped waist, torso undefined) |
| low-rise + slim/tailored | 0 (valid intentional pairing) |
| mid-rise (any top) | 0 (universally neutral) |
| rise = undefined or fit = undefined | 0 (no assumption, no penalty) |

Range: [−1, +1]. Does not stack with `bodyTypeProportion` or `heightProportion` — those use fit-volume balance and body-specific subtype rules, not `rise` directly.

**Code:** `constants/outfitScoring.ts` — `riseHarmony` block in `scoreOutfitCombo`, `OutfitScoreBreakdown` interface

#### Tests
- `__tests__/phase31-freshness.test.ts` — 15 groups covering all freshness edge cases
- `__tests__/phase31-rise.test.ts` — 16 groups covering all rise × body-type × height combinations

---

### Weather-Aware Outerwear
Uses Open-Meteo (free, no key) with device GPS (`expo-location`) and an IP-geolocation fallback (`ipapi.co`). Weather snapshot cached for 6 hours. Outfit engine gates outerwear by forecast: required when daily low <12°C, suppressed when low >18°C and high >24°C. Rain probability ≥60% biases toward rain-friendly subtypes (trench, raincoat, parka, jacket, bomber-jacket) and deprioritises wool/cashmere/suede. Home tab shows a weather chip; Profile has a weather toggle. Disabling clears the cache.

Celsius is the global display default when no explicit temperature-unit preference exists, regardless of country, device locale or location (including UK/US). This replaces the former locale-based Fahrenheit default. Home and Profile retain `profile.tempUnit ?? defaultTempUnit()`, so saved Fahrenheit choices remain untouched. Open-Meteo forecasts, GPS/IP fallback snapshots and the six-hour cache remain Celsius; existing formatters convert only for explicit Fahrenheit display. No cache migration, conversion change, UI redesign or weather-decision change was needed.

**Code:** `constants/weather.ts`, `app/(tabs)/index.tsx`, `app/(tabs)/profile.tsx`

---

### Wear Tracking
"Wearing this today" button on each OutfitCard logs a WearEntry (id, date, occasion, outfitFingerprint, itemIds, loggedAt) to AsyncStorage. Worn cards show a "Worn today" badge and an Undo button. Home tab shows a "Today's Looks" pill card when anything is logged; tapping "See all" opens the Wear Log for all users.

**Wear Log tier access (`app/wear-log.tsx`):**
- **Free users** — see entries from the last 7 days (`FREE_LOG_DAYS = 7`). A notice banner at the top of the screen shows "Showing last 7 days" with a "Full history with Premium" pill. If older entries are hidden, a locked row at the bottom states how many are hidden. If no entries are older than 7 days but the wardrobe has been worn, a soft upsell strip still surfaces cost-per-wear as a premium hook.
- **Premium users** — see all entries (unlimited history) plus the Wardrobe Dividends card (top 3 hardest-working pieces by CPW). Undo is available for today's entries across all tiers.
- The "Wearing this today" button on outfit cards is **not gated** — all users (free and guest) can log wear entries. The gate is only on the full history view.

**Code:** `app/wear-log.tsx`, `app/(tabs)/index.tsx`, `contexts/AppContext.tsx`

---

### CPW Dopamine Loop

Every time the user taps "Wearing this today" on an outfit card, the app identifies the most expensive owned item in that outfit and computes its updated cost-per-wear. A brief toast card animates in (`FadeInUp`, 250 ms) below the outfit list showing the new CPW value, then auto-dismisses after 3 seconds.

**CPW formula (`constants/cpw.ts`):**
```
cpw = purchasePrice / wearCount
```
- `computeItemCpw(purchasePrice, wearCount)` — returns `null` if either argument is missing or zero.
- `formatCpw(cpw)` — formats to currency string: `£N.NN` (GBP). Values ≥ £10 show no decimal places; ≥ £1 show one decimal; below £1 show two decimals.
- `computeWardrobeDividends(items, getWearCount, topN)` — returns the top-N items ranked by lowest CPW (best value-per-wear) for the Wardrobe Dividends card. Only includes items that have `purchasePrice > 0` and at least one logged wear.

**CPW toast (Outfits tab):**
- Fires in `handleLogWear` inside `OutfitsScreen` (replaces the direct `logWear` call)
- Selects the highest-priced priced item from the outfit's owned components
- Calls `getItemWearCount(itemId)` (from `AppContext`) to get the updated count
- Toast state (`cpwToast`) auto-clears via `setTimeout` ref (`cpwToastTimer`)
- Style: champagne gold tinted background (`Colors.secondary + '12'`), gold border, `trending-down-outline` icon

**CPW chips (Wear Log item thumbnails):**
- Each item thumbnail in a log entry shows a small CPW chip if `purchasePrice > 0` and `wearCount > 0`
- Chip background: `Colors.secondary + '12'`; text: `£N.NN/wear`

**Wardrobe Dividends card (Wear Log, premium only):**
- Shown at the top of the Wear Log scroll when the user is premium and has at least one dividend item
- Displays up to 3 items horizontally — photo, subtype name, CPW value, wear count
- Left border accent: `borderLeftWidth: 3, borderLeftColor: Colors.secondary + '80'`
- Computed via `computeWardrobeDividends()` from `constants/cpw.ts`

**Code:** `constants/cpw.ts`, `app/(tabs)/outfits.tsx`, `app/wear-log.tsx`

---

### OOTD Story Export

Each outfit card in the Outfits tab has an "Export look" button that captures a 9:16 story-format PNG and passes it to the native share sheet.

**Flow:**
1. User taps "Export look" — `handleExport()` fires with `Haptics.selectionAsync()`
2. 160 ms delay to allow the off-screen `OOTDStoryCard` to render
3. `captureRef(storyRef, { format: 'png', quality: 1.0, result: 'tmpfile' })` from `react-native-view-shot` captures the card to a temp file
4. `Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' })` from `expo-sharing` opens the native share sheet
5. Errors surface as an `Alert` — button is disabled (`disabled={exporting}`) during capture

**OOTDStoryCard (`components/OOTDStoryCard.tsx`):**
- Fixed 360 × 640 pt canvas (9:16)
- Background: `Colors.background` (warm off-white `#F5F3F0`)
- Sections: brand wordmark → champagne-gold hairline divider → scenario label + rationale + date → core item photos (max 3, sized proportionally) → accessory row (max 3, 80 × 80) → footer watermark "CURATED BY AURACLOSET ATELIER"
- Rendered off-screen at `position: absolute, left: -900` inside `OutfitCard` with `collapsable={false}` on the wrapper `View`
- Uses `OutfitSet.rationale` for the mood/descriptor line (replaces the old `moodLabel` field which does not exist on the type)

**Code:** `components/OOTDStoryCard.tsx`, `app/(tabs)/outfits.tsx`

---

### Daily Rotation Engine
Seeded Mulberry32 PRNG shuffle with per-scenario cursors, persisted to AsyncStorage. Quotas: Free = 2 outfits/scenario/day, Premium = 4, Guest = 1. Features: hero-diversity enforcement (yesterday's hero pieces deprioritised), cross-scenario fingerprint deduplication (same outfit cannot appear twice in one day), completeness bias (+1 confidence for full shoe+bag+jewelry stack), day-of-week cursor nudge (work scenario advances on weekends). All sort operations are stable (tie-breakers preserve input order to prevent non-determinism across runtimes).

**Code:** `constants/outfitRotation.ts`

---

### Calibration Learning Indicator (Home Screen)
A slim contextual strip on the Home tab surfaces the AI personalisation status to every user — free and premium — so they feel the stylist working from the first interaction.

**Behaviour:**
- Shown whenever the user has at least one ready outfit (`readyOutfits > 0`)
- **Learning state** (< 5 signals): "Your stylist is learning your taste · N/5 reactions" with a `time-outline` icon
- **Active state** (≥ 5 signals): "Your stylist knows your taste — picks are tuned to you" with a `sparkles` icon in champagne gold
- Reads `affinitySignalCount` and `affinityActive` from `AppContext` (no new state — these are already computed in the context and exposed on the context value)
- The strip uses `FadeInDown.delay(210)` — it enters after the Today's Pick card so it feels like a natural follow-on message, not a header element

**Code:** `app/(tabs)/index.tsx` — `learningStrip` / `learningText` styles, `affinitySignalCount` / `affinityActive` added to `useApp()` destructuring

---

### Premium Tier
Unlocks: up to 2,000 active wardrobe items (Free: 30 selected active items; Guest: 8), 4 outfits/scenario/day (vs 2 free / 1 guest), resort and night-out scenario filters, Deep Diagnostics, close-colour-match hints on Blueprint, full wear history (all-time), Wardrobe Dividends (CPW ranking of hardest-working pieces), and unlimited background removal (free tier limited to 20 lifetime uses).

**What is NOT gated (available to all free and guest users):**
- Blueprint overview — full 19-slot map with owned/needed status (premium locks only "Next smart buy" highlight and close-colour-match hints)
- Basic wear log — last 7 days of entries; "Wearing this today" button is always accessible
- Calibration signals — love/not-today taps and wear logging always build affinity, even on free

Premium status is stored in Supabase `user_profiles` with an expiry timestamp. The app reads the authenticated, expiry-aware `GET /api/user/entitlements` endpoint; there is no client-callable upgrade endpoint. B1 restricts authenticated INSERT/UPDATE on `user_profiles` to non-entitlement columns and removes authenticated profile DELETE; only the existing server-only entitlement writer may change Premium. Own-profile SELECT and server account deletion remain available. B2.8 enforces wardrobe capacity in database insert functions using the current expiry-aware entitlement and a per-user transaction lock. The connected Amodka Supabase project already has the B2.8 and garment-metadata migrations recorded; verify migration status independently for any other environment before releasing a client there.

#### Wardrobe capacity and pagination (B2.8)

- Authenticated single-item and bulk saves call `insert_wardrobe_item` and `insert_wardrobe_items` respectively, and only show success after the database acknowledges the write. Bulk Save All commits the reviewed batch once instead of auto-persisting each classification; this prevents a capacity rejection from leaving a partially saved batch. A full wardrobe returns `WARDROBE_CAPACITY_REACHED`; other database failures remain distinct. Direct authenticated INSERT is revoked after the migration. Photo upload failure does not count as a successful cloud save. Re-photographing updates the existing owned row after acknowledgment rather than consuming an extra slot.
- `wardrobe_free_selections` stores the selected Free-access IDs separately from `wardrobe_items`. Premium expiry retains all item rows; Free users with more than 30 rows choose the 30 active items explicitly. Selection and admission are serialized per user. Deleting an item cascades its selection entry. Cancelling Premium before its actual expiry does not revoke Premium access.
- Startup loads one bounded page, ordered by `created_at DESC, id DESC`. The authoritative exact total is separate from loaded pages. The Wardrobe screen pages as needed; outfit, history, diagnostics, and selection views request all needed pages on demand. These consumers must wait for loading before treating a partial collection as complete. If a full-wardrobe request resolves without completing pagination, Home, Outfits, Wear Log, and Choose 30 show an incomplete state with a retry action rather than continuing to spin.
- The client save paths require `supabase/migrations/20260928000000_free_wardrobe_selection.sql` and `supabase/migrations/20260929000000_wardrobe_garment_metadata.sql`. The connected Amodka project already records both. Read-only live schema checks confirm nullable fabric, fit, pattern and pattern_scale columns, authenticated RPC execution, and no authenticated direct INSERT grant. An isolated local PostgreSQL test covers authenticated save/reload, owned replacement, capacity, and expired-Premium downgrade; no production test data was written. There was no staging Supabase branch available for live end-to-end checks.

**Code:** `app/premium.tsx`, `server/routes.ts`

---

### Rate Limiting
All Express API endpoints are protected by `express-rate-limit` using the centrally-configured `LIMITER_CONFIGS` object:

| Limiter | Route(s) | Max | Window |
|---------|----------|-----|--------|
| `aiLimiter` | `POST /api/classify-garment` | 10 req | 60 sec |
| `bgRemovalLimiter` | `POST /api/remove-background` | 8 req | 60 sec |

| `accountLimiter` | entitlements, delete-account | 5 req | 60 min |
| `authLimiter` | sign-in, sign-up | 5 req | 15 min |
| `resetLimiter` | password-reset | 3 req | 60 min |

**`PgRateLimitStore`** — custom `express-rate-limit` store that writes counters to Postgres (`ratelimit_store` table) with automatic in-memory fallback when the pool is unavailable.  Key behaviours:
- `loadFromDb()` — called by `initRateLimitStore()` at startup to pre-warm the in-memory fallback Map with unexpired DB counters, preventing false window resets after a process restart.
- `_consecutiveDbFailures` — private counter incremented on each failed DB query; emits a `console.warn` once ≥ 3 consecutive failures to signal a persistent DB problem.

**`withRetry(fn, label, maxAttempts, baseDelayMs)`** — internal helper that retries async calls with exponential back-off. Used by `initLockoutStore()` when ensuring the `lockout_store` table and pruning expired rows.

**`_stores` registry** — module-level `Map<string, PgRateLimitStore>` populated by `makeStore()`. Allows `initRateLimitStore()` to call `loadFromDb()` on every registered store in one pass.

**Code:** `server/middleware/rateLimiter.ts`, `server/routes.ts`

---

### Session Storage
Supabase session tokens (JWT access + refresh) are stored in `expo-secure-store` on native platforms (iOS Keychain / Android Keystore). The Supabase client is initialised with a `SecureStoreAdapter` (`getItemAsync` / `setItemAsync` / `deleteItemAsync`) inside the `Platform.OS !== 'web'` branch, with `persistSession: true`. On startup, `AppContext.loadData()` awaits `supabase.auth.getSession()` and finishes account hydration before the app routes, so a restored session remains signed in after a process restart. The native persistence regression test exercises save and fresh-client restore on both iOS and Android platform branches; physical signed-device relaunch testing remains necessary to verify the native OS stores themselves. The web platform uses the Supabase default (localStorage). Tokens are never written to `AsyncStorage`.

**Code:** `lib/supabase.ts`, `contexts/AppContext.tsx`, `__tests__/nativeSessionPersistence.test.ts`

---

### Guest Mode
Users can enter the app without creating an account. Guest profile has `isGuest: true`. Caps: 8 wardrobe items, 1 outfit/scenario/day. Signing in clears the guest flag and transitions to a full account.

**Code:** `contexts/AppContext.tsx`, `constants/types.ts`

---

### Profile Management
Style constraints (no sleeveless, no short skirts, max heel height, colour aversions), body type, lifestyle percentages, weather toggle, temperature unit (°C / °F), metal preference, hair colour, height band, contrast level, mood goal, life phase, industry, face shape. Profile changes propagate immediately to outfit generation and blueprint slot ordering.

**Code:** `app/(tabs)/profile.tsx`, `contexts/AppContext.tsx`

---

### App Startup — Branded Loading Screen & Splash Management

While `appReady` is false, `app/index.tsx` renders a full-screen branded loading view instead of routing: the AuraCloset wordmark (Inter_700Bold, letter-spacing -1, 34 px) with a champagne gold accent line below it and the tagline in sage. Both elements animate in via `FadeInDown` (280 ms, 60 ms stagger). The component sits in the navigation stack so it participates in screen transitions normally.

`expo-splash-screen` is configured with `SplashScreen.preventAutoHideAsync()` in the root layout. `SplashScreen.hideAsync()` is called inside `app/index.tsx` after `appReady` becomes true — this eliminates the blank flash that occurred when hide fired before data was loaded.

**Code:** `app/index.tsx`, `app/_layout.tsx`

---

### Screen Transitions — Unified Fade System

All non-modal screens share a consistent, platform-safe fade transition defined by the `FADE_OPTIONS` constant in `app/_layout.tsx`:

```ts
const FADE_OPTIONS = {
  animation: 'fade',
  animationDuration: 220,
  animationTypeForReplace: 'push',  // prevents the "pop" slide-out on Android replace
} as const;
```

`animationTypeForReplace: 'push'` is required on Android — without it, the `replace` call used for auth redirects produces an unexpected slide-out instead of a fade.

Screens that receive `FADE_OPTIONS`: `sign-in`, `forgot-password`, `auth/update-password`, `auth/callback`, `outfit-ideas`.

The entry screen (`index`) is registered with `animation: 'none'` so the branded loading screen appears instantly with no transition flicker. Navigation away from it uses `fadeOutThenNavigate()`: Reanimated `withTiming` fades the loading view to opacity 0 over 200 ms before calling `router.replace()`, giving a smooth hand-off to the destination screen.

**Code:** `app/_layout.tsx`, `app/index.tsx`

---

### Add Item — Upload Progress Stages & Classifying Shimmer

The save flow in `app/add-item.tsx` is divided into explicit stages shown as a 3-segment progress track:

| Index | Label | Stage |
|-------|-------|-------|
| 0 | Preparing | Image resized, pre-upload checks done |
| 1 | Saving | Supabase Storage upload in progress |
| 2 | Finishing | AppContext state update and blueprint slot sync |

Each segment is rendered by `AnimatedSegment` — a component that measures its own container width via `onLayout` and animates a champagne gold fill from `width: 0` to the full measured width using `withTiming(260 ms)` when `isActive` becomes true. The fill anchors at `left: 0` inside an `overflow: 'hidden'` container.

While Gemini is classifying the image, a separate shimmer indicator replaces the earlier hardcoded `width: '60%'` bar. It uses a `shimmerOffset` shared value (Reanimated) that sweeps the fill view via `translateX` from off-screen left to off-screen right with `withRepeat(withTiming(...))`. The track width is captured as a `useSharedValue` (not a `useRef`) so the animation worklet running on the UI thread can read it correctly. The shimmer loop starts when `classifying` becomes true and is cancelled/reset when classification completes.

**Code:** `app/add-item.tsx` — `AnimatedSegment` component, `SAVE_STAGES` constant, `shimmerOffset` and `classifyingTrackWidth` shared values

---

### Android Modal UX — Slide Animation, Swipe-to-Dismiss & Drag Handle

**Consistent slide-up animation (`MODAL_OPTIONS`):**
The three modal screens (add-item, premium, item-detail) use a `MODAL_OPTIONS` constant that adds `animation: 'slide_from_bottom'` on Android alongside `presentation: 'modal'`. On iOS, `animation: 'default'` preserves the native sheet slide that Expo Router already provides. Without this, Android can fall back to a fade or OS-default transition that diverges from the intended bottom-sheet feel.

```ts
const MODAL_OPTIONS = {
  presentation: 'modal',
  animation: Platform.OS === 'android' ? 'slide_from_bottom' : 'default',
} as const;
```

**Swipe-to-dismiss (`components/SwipeToDismiss.tsx`):**
A reusable wrapper component that adds a downward-swipe dismiss gesture on Android. It is a transparent pass-through on iOS and web (iOS already supports the native sheet swipe). On Android it wraps the screen content in a `GestureDetector` with a Pan gesture configured as:
- `activeOffsetY(10)` / `failOffsetY(-5)` — vertical scroll gestures are not intercepted; only intentional downward drags activate the gesture
- `translateY` follows the drag (clamped to positive/downward direction only)
- Dismisses via `router.back()` when `translationY > 120 pt` OR `velocityY > 800`
- If the threshold is not met, snaps back with a spring (`damping: 20, stiffness: 300`)
- When dismissing, slides the sheet off-screen (`withTiming` to `700 pt`, 220 ms) before calling `back()` so the gesture feels fluid

**Drag handle pill:**
`SwipeToDismiss.tsx` renders a centred 36 × 4 pt rounded pill in `Colors.border` at the top of the wrapper, with `paddingTop = insets.top + 10` so it sits below the status bar. To prevent double-counting the top safe-area inset, the three consuming modal screens set `paddingTop` to `0` on Android (the wrapper owns it) and the original `insets.top` on iOS.

**Per-screen status bar management:**
Every full-screen route that slides over the tab bar declares its own `<StatusBar style="dark" />` as the first child. This ensures the status bar icon style is correct while the screen is visible and reverts automatically to the root `_layout.tsx` declaration on dismiss. The fix primarily targets Android, where the root style can bleed through without an explicit per-screen declaration.

Screens with per-screen `<StatusBar style="dark" />`:
- `app/add-item.tsx`
- `app/premium.tsx`
- `app/item-detail.tsx`
- `app/blueprint.tsx`
- `app/diagnostics.tsx`

All have a light (`#F5F3F0`) background, making `style="dark"` (dark icons) correct for all of them.

**Code:** `app/_layout.tsx` (`MODAL_OPTIONS`), `components/SwipeToDismiss.tsx`, `app/add-item.tsx`, `app/premium.tsx`, `app/item-detail.tsx`, `app/blueprint.tsx`, `app/diagnostics.tsx`

---

### Bulk Digitization Studio

Two-screen flow for digitising an entire wardrobe section in one session: up to 10 garments selected from the photo library, AI-classified in parallel, and batch-saved with a single tap.

**Entry point:** selecting 2–10 photos in `app/add-item.tsx` (gallery picker with `allowsMultipleSelection: true, selectionLimit: 10`) first copies each photo into the app-owned `FileSystem.cacheDirectory/amodka/bulk-staging/` folder. The temporary staged URI list and dev-only pick diagnostics live in an in-memory selection store keyed by a short opaque ID; Expo Router receives only that ID, never file URIs. A partial copy failure is omitted and disclosed inline; if all copies fail, the user stays on Add Item. There is no separate Bulk Studio splash screen.

**Review screen (`app/bulk-review.tsx`):**
- Stack presentation (`FADE_OPTIONS`)
- `StatusBar style="dark"`, no `SwipeToDismiss` (back arrow in header handles dismissal)
- Resolves the selection ID from `useLocalSearchParams` and initializes `BulkItem[]` from the in-memory store. A missing/expired ID displays a calm recovery message instead of starting preparation.
- Item statuses: `pending → classifying → settled → saving → saved` (or `refused`, `error`, `removed`). HTTP 422 `content_guardrail` is a non-retryable refusal, not a failed analysis. Other errors retain their coarse failure stage and retryability.
- In development, the picker records hashed URI identity, filename length, MIME type, dimensions, and source/staged file existence and size. A resize failure adds current-file metadata, URI equality, and elapsed time to the card and `[bulk:prepare]` console diagnostic; full paths, bytes, and credentials are not logged.

**Parallel classification (staggered, 150 ms apart):**
1. A serial queue runs the same `prepareClassificationImage` used by single entry, one at a time to limit simultaneous full-resolution bitmap decoding on mobile; each output has longest edge ≤1024 px without upscaling (JPEG, 0.8 compress) → base64
2. Background removal and cutout caching are best-effort; if either fails, the resized original JPEG continues to classification.
3. `POST /api/classify-garment` — same endpoint as single-item add flow
4. On settle: card info fades in with `FadeInDown.duration(280)` (key-prop remount trick)
5. `Haptics.impactAsync(Light)` fires per settled card

**Gold-pulse overlay (classifying state):**
- `Colors.secondary` fill, `opacity` animated `withRepeat(withTiming(0.80, 900ms), -1, true)` via Reanimated `useSharedValue`
- Shows `◆` symbol + cycling status micro-copy (screen-level `setInterval` at 450 ms cycles through: `REVIEWING SILHOUETTE / DERIVING OCCASION TAGS / CURATING COLOUR HARMONY / EXTRACTING FABRIC WEAVE`)
- On classification settle: `cancelAnimation` + `withTiming(0, 260 ms)` fades the overlay out — photo always remains visible underneath

**2-column grid layout:**
- `FlatList numColumns={2}`, card width = `(screenWidth − 40 − 10) / 2` (square photo thumbnail + info section below)
- Per-card Remove (×) button (top-right); Error state shows a standalone accessible retry button outside the card's edit press target; Saved state shows green checkmark overlay (`FadeInDown.duration(220)`)

**Progress header:**
- Successful analysis count is separate from failures. Transient failures say “need another try” and show “Connection paused / Tap to try again.” Unexpected failures show “Something went wrong / Tap to try again.” Both keep photos visible with neutral surfaces (only a subtle accent on unexpected errors).
- Refusals show “needs attention” with unchanged calm copy, Add manually and Remove, never provider reasons or Retry. Manual entry pushes the existing single Add Item route with an opaque selection ID and photo index; it skips classification and borrows, rather than cleans, the live batch source. Cancel returns to the unchanged batch. Only an acknowledged manual save removes that card from review without deleting its wardrobe row.
- “Try all again” appears with two or more transient failures. It makes one explicit attempt per card serially, retains the native resize queue, waits when this screen's classification-start window reaches 10/min, and reuses successful cutouts without another PhotoRoom request (falls back to the original if that cache is gone). It never auto-retries and cannot override server/account-wide limits.

**Batch save (`Save N Items to Wardrobe` footer CTA):**
1. Iterates over all `settled` items sequentially
2. Per item: upload readable cutout PNG unchanged; if absent/unreadable, prepare the original JPEG via the existing storage resize and upload that instead. Upload/network failure stays distinct: no batch commit, affected items remain pending/local-only for retry.
3. Calls `addWardrobeItem()` with full classification payload (type guards: `asPattern`, `asFabric`, `asWeight`, `asFit`, `asNeckline`, `asSleeve`, `asRise`, `asWarmth` — re-defined locally, same logic as `add-item.tsx`)
4. `formalityLevel` derived from `SUBTYPE_FORMALITY[subType] ?? 5` (from `constants/outfitScoring`)
5. An authenticated upload or batch-commit failure keeps the affected items in review for retry; it does not report a successful save.
6. Only after `addWardrobeItems()` acknowledges the full batch does cleanup remove unreferenced staged source files, followed by `Haptics.notificationAsync(Success)` + `router.navigate('/(tabs)/wardrobe')`.

**Temporary staging lifecycle:**
- Removing a card deletes its staged source if no live reference protects it. Cancel/back-out removes the selection’s unreferenced staged files. The one-photo redirect passes the same opaque selection ID to Add Item, where a confirmed wardrobe save removes that staged source; failed or ambiguous saves retain it for retry.
- Files referenced by current wardrobe items or live `local-only`/pending-upload review entries are retained. App startup best-effort deletes only unreferenced files older than 24 hours. Staging is transient; it is not persisted to AsyncStorage, the profile, or the database.

**Navigation registration in `app/_layout.tsx`:**
```
<Stack.Screen name="bulk-review" options={{ headerShown: false, ...FADE_OPTIONS }} />
```

**Code:** `app/bulk-review.tsx`, `app/add-item.tsx`, `app/_layout.tsx`

---

### Photoroom Background Removal

At upload time, both `app/add-item.tsx` and `app/bulk-review.tsx` attempt to strip the photo background before Gemini classification and Supabase Storage upload, producing clean flat-lay style images.

**Quality tiers (auth-gated, server-enforced):**
| Tier | Condition | Behaviour |
|------|-----------|-----------|
| Guest | No Supabase JWT in `Authorization` header | `{ status: 'not-authenticated' }` — removal skipped, original photo used |
| Free | Authenticated, `isPremium = false` | Up to 20 lifetime uses (tracked in `bg_removal_usage` table). Exceeding quota → `{ status: 'limit-reached' }` |
| Premium | Authenticated, `isPremium = true` | Unlimited — quota not checked |
| Cache hit | Any tier (hash match) | Returns cached result; does **not** count against quota |

**Hash cache (`server/bgRemovalStore.ts`):**
- Two Postgres tables initialised by `initBgRemovalStore()` on server startup:
  - `bg_removal_cache (image_hash TEXT PK, result_b64 TEXT, created_at TIMESTAMPTZ)` — stores SHA-256 hash → PNG base64. Hit rate avoids redundant Photoroom API calls and doesn't consume quota.
  - `bg_removal_usage (user_id UUID PK, count INT, last_used_at TIMESTAMPTZ)` — per-user lifetime call counter for free-tier quota enforcement.
- In-memory LRU cache (200 entries) backed by the DB. Cache hits are returned before any auth or quota check.

**Client return type (`lib/photoroom.ts`):**
`removeBackground()` now returns `Promise<BgRemovalResult>` instead of `Promise<string | null>`:
```typescript
export interface BgRemovalResult {
  status: 'success' | 'not-authenticated' | 'limit-reached' | 'unavailable' | 'failed';
  base64?: string;      // present on status === 'success'
  remaining?: number;   // present on success (quota remaining) and limit-reached (always 0)
}
```
`app/add-item.tsx` stores the result status in `bgStatus` state and captures `remaining` to display the "X of 20 background removals left" pill. `app/bulk-review.tsx` captures `remaining` from the result and adapts with `.then(r => r.status === 'success' ? r.base64 ?? null : null)` to remain compatible with the `ClassifyDeps.removeBg` interface in `lib/bulkClassifyCore.ts`.

**Pipeline (single-item add flow):**
1. Photo selected → shared longest-edge preparation produces classification JPEG
2. `removeBackground(base64)` in `lib/photoroom.ts` calls `POST /api/remove-background` with a `Bearer <JWT>` `Authorization` header
3. Server: checks in-memory LRU → DB cache → auth (JWT verify) → premium check → quota check → Photoroom API (15 s `AbortController` timeout)
4. Returns PNG base64 (or appropriate status code on failure)
5. Client writes the transparent PNG to cache; no JPEG flattening of a successful cutout
6. Classification uses that PNG if cached successfully, otherwise the prepared original JPEG. MIME is derived from submitted bytes. Save reads the PNG again; an evicted cache rebuilds from the selected original without another PhotoRoom request.
7. `resolveWardrobeUploadArg()` strips any `data:` prefix before the upload

**Retry logic (`lib/photoroom.ts`):**
- Only `photoroom_timeout` triggers a single retry. All other error codes and non-success statuses return immediately (no retry).
- Network errors (`fetch` throws) also return `{ status: 'failed' }` — no retry.

**Server handler (`server/remove-background.ts`):**
- Cache hit → HTTP 200 with cached PNG base64 (bypasses all further checks)
- Missing or invalid `Authorization` JWT → HTTP 401 (`BG_REMOVAL_AUTH_REQUIRED`)
- Free user over 20-use quota → HTTP 403 (`BG_REMOVAL_LIMIT_REACHED`)
- Missing `PHOTOROOM_API_KEY` → HTTP 503 (`background_removal_unavailable`)
- Missing `imageBase64` in request body → HTTP 400
- Photoroom returns non-2xx → HTTP 502 (`photoroom_error`)
- Photoroom returns HTTP 200 but 0-byte body → HTTP 502 (`photoroom_empty_response`)
- `AbortError` (timeout) → HTTP 502 (`photoroom_timeout`)
- Any other thrown error → HTTP 502 (`background_removal_failed`)

**Shared error codes (`shared/photoroom-error-codes.ts`):**
All error-code string constants are imported from this shared module by both `server/remove-background.ts` and `lib/photoroom.ts`. The module now also exports `BG_REMOVAL_AUTH_REQUIRED` and `BG_REMOVAL_LIMIT_REACHED`. Inlining the bare strings is a compile-time error.

**CORS:** The `Authorization` header is added to `Access-Control-Allow-Headers` in `server/index.ts` so preflight requests succeed from the Expo dev proxy.

**Rate limiter:** `bgRemovalLimiter` reduced from 30 → 8 req/min (per-IP) now that per-user quota is enforced at the application layer.

**Fallback boundary:** Optional background-removal/cache failures use the original photo. Cloud upload and wardrobe-write failures are not successes: the draft remains for manual recovery/retry. Original-photo unavailability remains a genuine preparation failure.

**Code:** `server/remove-background.ts`, `server/bgRemovalStore.ts`, `lib/photoroom.ts`, `lib/classifyPath.ts`, `lib/uploadArg.ts`, `shared/photoroom-error-codes.ts`, `app/add-item.tsx`, `app/bulk-review.tsx`

---

### Ghost Item Recovery

Items can become "ghosts" — they exist in wardrobe state but their photo is missing (either `photoUri` is absent, or the local `file://` file no longer exists on disk). The Home screen shows a recovery card when ghosts are detected.

**Two detection passes (both run on app startup and on wardrobe change):**
1. `detectNoPhotoOrphans()` — synchronous filter; items with no `photoUri` at all
2. `detectFileOrphans()` — async; checks `file://` items via `FileSystem.getInfoAsync`:
   - File exists locally → not an orphan
   - `getInfoAsync` throws (transient I/O error) → not surfaced as an orphan (silence is safer)
   - File missing, authenticated user → attempt cloud recovery via Supabase Storage; if a URL is returned the item URI is patched in-place (no orphan card shown); if recovery fails → orphan
   - File missing, guest user → orphan (no cloud fallback)
   - `rebaseUri` guard: if an Android post-update `documentDirectory` shift is detected, the rebased path is checked first before cloud recovery

**Resolution actions (shown in the Home screen recovery card):**
- `'remove'` — calls `removeWardrobeItem(id)` to delete the DB row and local state
- `'dismiss'` — clears the card; item remains in the wardrobe intact

**Code:** `constants/orphanDetection.ts`, `contexts/AppContext.tsx`, `app/(tabs)/index.tsx`

---

### Re-photograph Flow

From the ghost-item recovery card (and from `app/item-detail.tsx`), users can retake or re-select a photo for a wardrobe item rather than removing it entirely.

**Flow:**
1. User taps "Re-photograph" on a ghost item card
2. `app/add-item.tsx` receives a `replaceItemId` param via route
3. Classification and upload proceed exactly as a normal new-item add
4. On save: `applyRePhotographSave()` in `constants/rePhotographSave.ts` calls `addWardrobeItem(newItem)` then `removeWardrobeItem(replaceItemId)` — the old ghost is atomically replaced by the new item
5. If `replaceItemId` is absent (normal add flow), `removeWardrobeItem` is not called — the function is a pure no-op branch

`applyRePhotographSave` is a deliberately simple, asset-free, React-free utility so it can be imported and verified directly in Node/tsx tests without any mocking.

**Code:** `constants/rePhotographSave.ts`, `app/add-item.tsx`, `app/(tabs)/index.tsx`

---

### Bulk Review UX Hardening

Three targeted fixes to the bulk-review save flow that prevent data loss, double-saves, and mount-after-unmount state corruption:

**Save lock (`savingRef`):**
A `useRef<boolean>` guard (`savingRef`) prevents the "Save N Items" button from triggering a second concurrent save if tapped rapidly or if the first save resolves while a second tap is in flight. The ref is set synchronously at the top of `handleSaveAll` and cleared in its `finally` block, making it the authoritative save-in-progress signal (unlike the `saving` React state, which can be one render cycle behind).

**Mounted guard (`mountedRef`):**
A `useRef<boolean>` (`mountedRef`) is set to `true` on mount and `false` in the `useEffect` cleanup. All async state-setter calls inside the classification and save loops check `mountedRef.current` before calling `setState`. This prevents the React "can't perform a state update on an unmounted component" warning when the user navigates back before classification finishes.

**Carousel scroll contract (`bulkCarousel`):**
The review grid carousel scrolls to the first unsettled card when classification of a batch begins. The scroll index is clamped to `[0, items.length − 1]` and the `FlatList` ref is checked for nullability before calling `scrollToIndex`. This prevents a crash when the list is empty or when all items have already been removed.

**Cancel / back guard:**
`handleCancel` checks whether any item is still `pending` or `classifying`. If all have settled, it calls `router.back()` immediately. If classification is still running, it shows a destructive `Alert` ("Cancel batch review?") with "Keep waiting" (cancel) and "Cancel" (destructive / `router.back()`) options. The Android hardware back button (`BackHandler`) is wired to the same logic: fully blocked while `saving` is `true`, shows the confirmation dialog while classification is in progress.

**AppState foreground debounce:**
An `AppState` listener re-syncs the `saving` React state from `savingRef.current` whenever the app returns to the foreground. The handler is wrapped in a 16 ms debounce (one animation frame) so that rapid background → inactive → active transitions on Android OEMs with sluggish reconciliation coalesce into a single `setSaving(true)` call, preventing the save button from briefly flickering unlocked mid-save.

**Background-removed photo preview (`cutoutUri`):**
Each `BulkItem` can carry a cached transparent PNG `cutoutUri`. Its thumbnail falls back to the immutable selected original `item.uri` when the cache cannot render. No image base64 is retained in screen state.

**Bulk classification payload:** `runClassifyUri` forwards the successful cached PNG unchanged, otherwise the prepared original JPEG. Both entry paths use byte-derived MIME. A retry records prior background-removal success and never requests that enhancement again, even if its cache was evicted.

**Code:** `app/bulk-review.tsx`

---

### Guest Photo Cleanup

When a guest user removes a wardrobe item, the local `file://` photo file is deleted from device storage. This prevents orphaned files accumulating across guest sessions.

**Logic (`constants/guestPhotoCleanup.ts`):**
- `deleteGuestPhoto(uri, documentDirectory, deleteAsync)` — deletes the file only when: (a) `uri` is defined, (b) `documentDirectory` is non-null, and (c) the URI starts with `documentDirectory` (prevents accidentally deleting files outside the app sandbox). Calls `deleteAsync(uri, { idempotent: true })` — the `idempotent` flag suppresses `ENOENT` errors on double-delete.
- `runGuestRemoval(itemId, wardrobe, documentDirectory, deleteAsync)` — looks up the item by id, validates its `photoUri`, then calls `deleteGuestPhoto`. Called as fire-and-forget (`.catch(console.warn)`) from `AppContext.removeWardrobeItem`.
- `buildGuestPhotoDestPath(documentDirectory, itemId, ext)` — canonical path builder used by both the guest upload path in `add-item.tsx` and the cleanup logic, ensuring the `startsWith` guard always holds.

**Code:** `constants/guestPhotoCleanup.ts`, `contexts/AppContext.tsx`, `app/add-item.tsx`

---

### Android Guest Photo Rebase

On Android, `FileSystem.documentDirectory` can change prefix between app version installs (e.g. `com.app/files/` → `com.app.v2/files/`). Guest wardrobe photos stored under the old prefix become unresolvable after an update.

`rebaseGuestPhotoUri(uri, currentDocDir)` in `lib/rebaseGuestPhotoUri.ts` corrects stale paths at load time:
- Only acts on `file://` URIs matching `wardrobe_<id>.jpg|png` (case-insensitive extension)
- If the URI already starts with `currentDocDir` → returned unchanged
- If the URI starts with a different `file://` prefix → the filename is extracted and prepended with `currentDocDir`
- `https://`, `data:`, `content://`, non-guest filenames, unsupported extensions → returned unchanged
- Empty `currentDocDir` → returned unchanged (no-op guard)

Called from `AppContext` on wardrobe load, before orphan detection runs.

**Code:** `lib/rebaseGuestPhotoUri.ts`, `contexts/AppContext.tsx`

---

### Luxury Dialogs, Toasts & Save Undo

`LuxuryFeedbackProvider` wraps the app beneath `AppProvider` and exposes
`useDialog()` (`confirm`, `notify`, and `alert`) plus `useToast()`. App-owned
`Alert.alert` calls were migrated to the shared native `Modal` dialog or toast;
the operating system's camera/photo permission prompts remain native. The
dialog queue supports destructive styling, Android Back cancellation,
accessible labels/announcements, and reduced-motion-aware animation. Toasts
queue, respect safe-area/tab-bar insets, and provide a five-second Undo action.
Action-bearing Undo toasts use an opaque light surface with a high-contrast navy
button; informational toasts retain the glass treatment.

Single-item Add Item saves now commit directly after existing subtype/colour
validation. Bulk and multi-piece saves retain synchronous in-flight guards and
show one success toast only after the wardrobe commit is acknowledged. Undo
calls the normal owner-scoped wardrobe removal path for each committed item,
including its image and guest-local cleanup; it does not refund quota or change
saved-look/wear-history records. Batch Undo attempts every row and reports
partial cleanup rather than claiming success. Undoing a manual item returned
to Bulk Review restores its transient review card while removing the wardrobe
commit. Item removal copy discloses the preserved history/look records.

No dependency, schema, recommendation-engine, or classifier changes were made.
Required subtype/colour validation remains a branded dialog rather than new
inline field state. Automated adapter and bulk-save/Undo checks are in
`alertDialogAdapter.test.ts` and `bulkReviewMountedGuard.test.ts`. The report at
`reports/luxury-dialogs-and-save-moment.md` records the user-reported physical
iOS/Android and VoiceOver/TalkBack checks; the agent did not independently
observe those device sessions.

---

## 10. Pending Features

These features are **not yet implemented**. They are the next development priorities.

### Virtual Try-On

**What it does:** Allows users to see how a wardrobe item would look on them using an AI-powered try-on model. The user selects an outfit or a single garment from their wardrobe, taps "Try On", and the feature composites the item onto a body reference image.

**Integration points:**
- **Entry point:** OutfitCard in `app/(tabs)/outfits.tsx` — add a "Try On" button alongside the existing "Wearing this today" button
- **Also accessible from:** `app/item-detail.tsx` — single-item try-on without an outfit context
- **New screen needed:** `app/try-on.tsx` — displays the composited result, allows saving to camera roll, and links back to the item or outfit
- **Backend:** New Express endpoint `POST /api/try-on` that accepts the user's reference image (or a stored body silhouette) and the garment image URL from Supabase Storage, calls the try-on model API, and returns the result
- **State:** Try-on results are ephemeral (not persisted) — no new AsyncStorage keys required
- **API:** Research and select a try-on API provider at implementation time (e.g. Fashn.ai, Replicate Kolors-Virtual-Try-On, or similar)

---

## 11. Testing & Quality

### Test Suites (106 total)

| Suite | What it tests |
|-------|--------------|
| `profilePersonalization.test.ts` | 17 offline groups: account-neutral hydration, null/explicit values, guest-only migration and face-shape round trip, consumed guest cache, failed/stale migration, actual onboarding skip/completion and rotation-effect callbacks, eye/skin scoring match and no-effect cases |
| `alertDialogAdapter.test.ts` | Branded dialog adapter preserves cancel/destructive roles, outside-cancel policy, button callbacks and default Done behavior |
| `travelCapsule.test.ts` | Exact activity/scenario matching and source separation, owned/current IDs, stable look identity, authoritative coordinated membership/partial use, checklist deduplication, partial coverage and no write/generation imports |
| `travelCapsuleUi.test.ts` | Mounted actual session planner/view: fresh checks, explicit reuse, unsupported/empty slots, separate essentials, group failures/retry, wardrobe/account/entitlement invalidation, superseded responses, blur/remount cleanup and unchanged domain state |
| `concierge.test.ts` | Five validated today-only occasions with actual candidate construction; readiness precedence; actual AppContext strict entitlement-refresh contract and unchanged default behavior |
| `conciergeUi.test.ts` | Mounted planner/Outfits: exact generic outputs, confirmed Traditional set, dual fresh access checks, failures/retries, complete pagination, same-occasion refresh, account/blur/stale cleanup, C/F and no incidental mutations |
| `canonicalWardrobeSemantics.test.ts` | Complete semantic serialization/hydration, legacy unknowns, explicit correction persistence, failed-save barrier, corrected-vs-manual canonical equivalence, owned update and all insertion/replacement payload contracts |
| `canonicalWardrobeUi.test.ts` | Actual Add Item response guards against late AI and stale-photo results; mounted saved-item screen through the actual owned database-update function with a controlled PostgREST boundary: pending state, success, mapper cold reload, failure and retry |
| `stylingWardrobe.test.ts` | P0.2 canonical projection, African identifiers, unknowns, corrections, provenance independence, Phase A relationships, deterministic non-mutating snapshots, provider-free dependency graph, and unchanged v3.7 pool/hash/rotation/just-added outputs for the existing golden candidate fixture |
| `traditionalStyling.test.ts` | Explicit context changes real core eligibility/candidates and daily outputs; confirmed-set atomicity, unknown/corrected canonical truth, layered relationships, owned Western complements, gap/fallback handling, existing rain filtering, provider-free dependency graph and unchanged generic generation |
| `traditionalStylingUi.test.ts` | Mounted actual Outfits screen with real context adapter/generator/rotation: no implicit selection, generated owned coordinated-set photos, loading, retry, ignored late responses, honest gaps and unchanged premium chip gate |
| `stylingRelationships.test.ts` | Additive Phase A membership projection, owner/parent checks, all three types, pre-evaluation coordinated construction under shortlist crowding, relationship removal and renamed-garment controls, Western complements, normal alternatives, immutable canonical/shared facts, transient provenance and provider-free graph |
| `swipeDismiss.test.ts` | Exact-top gesture capture, scroll gating during movement/release, 120 px threshold, and scroll-ref/accessible-close wiring on all three sheet routes |
| `accountDeletion.test.ts` | Both account-deletion routes: authentication boundary, per-stage Storage/table/Auth failures, paginated removal, no-op removal detection, and retries after partial cleanup |
| `accountLockout.test.ts` | Account lockout lifecycle: thresholds, expiry, `initLockoutStore` restart-survival, prune-interval state, DB integration (skipped when `DATABASE_URL` absent) |
| `aiProcessingConsent.test.ts` | Mounted account preference API and server AI-route enforcement: unasked/malformed/declined denied, account isolation, metadata persistence, store errors fail closed |
| `aiProcessingPreference.test.ts` | Client preference-state normalization; unknown responses cannot silently grant AI processing |
| `androidOAuthCancel.test.ts` | Android OAuth cancellation path: `useEffect` cleanup, loading-spinner reset on cancel, no stuck-spinner regression |
| `blueprint-image-sync.test.ts` | Every blueprint slot imageKey maps to a valid SAMPLE_IMAGES entry (no broken placeholder fallbacks) |
| `blueprint-lifestyle-slots.test.ts` | Lifestyle slot group thresholds across all 6 blueprints (group existence, category ordering, proportionality) |
| `blueprint-slots.test.ts` | Slot structure invariants (required fields, valid categories, no duplicate IDs) |
| `bulkAutoPersist.test.ts` | Legacy auto-persist helper contract; the B2.8 review UI now commits Save All atomically instead |
| `addItemReplacementContract.test.ts` | Replacement at capacity updates the existing item rather than deleting it or consuming another slot |
| `bulkSaveAtomic.test.ts` | Bulk Save All uploads before a single acknowledged commit; failed uploads and rejected commits do not navigate or report success |
| `freeWardrobeSelectionDb.test.ts` | Disposable PostgreSQL verification of capacity, expiry, role privileges, ownership, selection, concurrency, rollback and cascading deletion |
| `freeWardrobeSelectionSql.test.ts` | Static contract checks for authenticated insert RPCs, selection, and ordering index |
| `wardrobeDatabaseContract.test.ts` | Acknowledged item persistence, deterministic pagination, account isolation, selected-row loading, and deferred token-refresh entitlement reads |
| `apiNoCache.test.ts` | Express conditional GET still returns JSON 200 with `Cache-Control: no-store`; prevents API ETags becoming unusable 304s in native fetch |
| `wardrobeRetryScreens.test.ts` | Mounted Home, Outfits, Wear Log and Choose 30: load failure, successful-but-partial state, retry-pending state, same-count account switches, stale success/failure protection and successful recovery |
| `bulkCarousel.test.ts` | Bulk-review carousel scroll contract: index clamping, null FlatList ref guard, empty-list safety |
| `bulkPhotoStaging.test.ts` | App-owned multi-photo staging, partial/all copy failures, in-memory selection lookup, protected cleanup, and 24-hour sweep |
| `bulkReviewMountedGuard.test.ts` | `isMountedRef` guard, serialized image-transform queue, ID-only one-photo redirect, acknowledged-save cleanup ordering, retryable errors, original-JPEG fallback, one post-commit Undo snapshot and partial batch-removal reporting |
| `undoRemovalIntegration.test.ts` | Actual AppContext Undo removal callback: owner-scoped row and Storage cleanup, guest file and cache cleanup, retained/retried photo-cleanup failures, retry-toast action, managed-directory rejection, partial batch failure/quota retention and account-switch protection |
| `photoPrepareDiagnostic.test.ts` | Redacted failure diagnostics plus pick-time/current staged-file metadata comparison |
| `bulkSaveLock.test.ts` | Save-lock ref in bulk-review: concurrent save attempts are blocked by the `saveLockRef` guard |
| `bulkSaveNoShrunk.test.ts` | Missing/null/data-URI `shrunk.base64` never silently drops a bulk-upload item; `addItem` always fires with the local URI as fallback when `resolveUploadArg` returns null |
| `cancelDialogMessages.test.ts` | `selectCancelDialogBody()` branch selection across all batch states: all-settled → null, in-progress + no auto-saved → running message, in-progress + auto-saved → auto-saved-wins message |
| `classifyGarment.test.ts` | `processGeminiResult` parsing, field validation (subType, colorFamily, modelConfidence), colour conversion helpers, edge cases (empty `{}`, null subType, mismatched category, boundary `modelConfidence`) |
| `uploadCleanup.test.ts` | Cached PNG versus original fallback for cloud/guest saves; upload-failure isolation; calm states; cutout reuse; serial retry/pacing; opt-in sanitized reporting and release formatter/UI checks; model configuration |
| `classificationPreparation.test.ts` | Shared single/bulk native preparation policy with decoded dimensions, portrait/landscape/square/small cases, no upscaling, one encoding, payload/MIME and cutout/fallback parity, failures and native-reference cleanup (mock native boundary) |
| `classifierRefusal.test.ts` | Non-retryable 422 refusals versus transient/permanent errors, calm mounted notice/dialog actions, ID-only manual batch handoff, truthful progress counters and release-mode diagnostic/stamp render elimination |
| `classifyGarmentIntegration.test.ts` | HTTP-layer tests for `POST /api/classify-garment`: 400 for missing/ambiguous image input, 500 for absent `GEMINI_API_KEY`, 429 after aiLimiter cap, JSON response shape |
| `forgotPasswordSilent.test.ts` | Actual `requestPasswordReset()` contract: acknowledged response, redirects, network/non-JSON/malformed response failures, email normalisation |
| `getProfileBlueprint.test.ts` | Algorithm tests calling `buildProfileBlueprintSlots()` directly (no mocking) |
| `ghostItemRecovery.test.ts` | `detectNoPhotoOrphans`, `isGuestPhotoUri`, `detectFileOrphans` (file-exists/missing/throws/cloud-recovery/rebase-path), and `applyOrphanResolution` action routing; also exercises `applyRePhotographSave` |
| `guestPhotoCleanup.test.ts` | `deleteGuestPhoto`, `runGuestRemoval`, `buildGuestPhotoDestPath` — safe document-directory boundary, retry-record validation, idempotent delete, rejection propagation, per-deletion isolation |
| `imagePickerSelection.test.ts` | Preserves the single-photo path; multi-photo picker stages before routing, passes only the selection ID, and stays on Add Item if every copy fails |
| `lifestyle-blueprint.test.ts` | Lifestyle weight ordering and category priority adjustments |
| `lifestyleSlotGroups.test.ts` | Slot group activation thresholds for active and brunch lifestyles |
| `oauthDismissGuard.test.ts` | OAuth dismiss guard: browser session cleanup on back-navigation and modal dismiss |
| `outfitComboScorer.test.ts` | Colour harmony scoring, combo scoring, proportion-balance, metal-cohesion |
| `outfitGenerator.test.ts` | Outfit generation correctness, scenario hero coverage, "just added" suggestions |
| `outfitGroupCompletion.test.ts` | Outfit group completeness scoring, recipe slot-ID cross-check against blueprint output, `hasSubstitution` flag when constraint-excluded slots are the only missing piece |
| `outfitRotation.test.ts` | Daily rotation engine: tieredShuffle stability, hero-diversity, completeness bias, sort tie-breakers |
| `outfitScoringData.test.ts` | Data-table invariants for `SCENARIO_AFFINITY`, `STYLE_PREFERRED_COLORS`, `STYLE_GOAL_SUBTYPES` (key completeness against `OccasionTag` and `StyleGoal` unions) |
| `perceptualScoring.test.ts` | HSL/Lab perceptual colour scoring |
| `photoroomRetry.test.ts` | `removeBackground()` retry contract, session lookup failure degrading to `failed`, and cross-layer import assertion |
| `rateLimiter.test.ts` | Per-limiter blocking + 429 response shape, standard headers, `PgRateLimitStore` fallback behaviour, `LIMITER_CONFIGS` key completeness and security bounds, `loadFromDb()` no-throw contract, `_consecutiveDbFailuresForTesting` counter |
| `rateLimiterDbFallback.test.ts` | `PgRateLimitStore` in-memory fallback: sequential counting, window expiry reset, key isolation, decrement, resetKey, resetAll, resetTime contract, instance isolation |
| `rebaseGuestPhotoUri.test.ts` | `rebaseGuestPhotoUri()`: prefix unchanged, old prefix rebased, non-guest URIs untouched, malformed filenames untouched, edge cases (empty currentDocDir, same prefix) |
| `removeBackground.test.ts` | `resolveClassifyBase64`/`selectClassifyPayload`/`resolvePhotoUri` pipeline helpers; server handler error codes (503 missing key, 400 missing body, 502 non-OK/empty-body/network-error/AbortError/mid-stream AbortError); `resolveWardrobeUploadArg`/`stripDataUriPrefix` |
| `signInWithEmail.test.ts` | Email sign-in flow: credential validation, Supabase auth call, error propagation |
| `signUpWithEmail.test.ts` | Sign-up client acknowledgement contract, redirect-free request, network/non-JSON/malformed response failures |
| `auth2Routes.test.ts` | Real sign-up/reset routes: unclassified provider failures, known duplicate-email privacy response, reset redirect policy, locked reset and mounted rate limits |
| `auth2MountedUi.test.ts` | Mounted confirmation and recovery screens with isolated native/auth/navigation mocks: preparation, callback errors, submit gating, update outcomes and navigation |
| `emailRecovery.test.ts` | Recovery code/claims preparation gating and sanitized password-update provider failures |
| `supabaseUrlStability.test.ts` | Supabase Storage public URL is deterministic from (userId, itemId, ext) alone — no session token embedded, no query parameters, stable across app reinstalls |
| `wardrobeDiagnostics.test.ts` | `computeDiagnostics` health score, category stats, scenario coverage; `ALL_SCENARIOS` export integrity and alignment with `computeDiagnostics` output |
| `weather.test.ts` | Weather-aware outerwear rules (temperature gating, rain-friendly subtype bias) |
| `temperatureUnits.test.ts` | Global Celsius default, explicit C/F preferences, UK/US/unknown locale, Home/Profile preference wiring, GPS/IP forecast and cache consistency, no double conversion, and unavailable-forecast fallback |

### Running tests

```bash
npm test              # single run, all suites
npm run test:watch    # watch mode (re-runs on file change, 400ms debounce)
```

### Pre-commit enforcement

The git pre-commit hook (auto-installed on `npm install`) runs in order:
1. `npm run typecheck` — blocks on TypeScript errors (including missing keys in exhaustive `satisfies` maps)
2. `npm test` — blocks on any test failure

To reinstall the hook after pulling: `npm run hooks:install`

### Type safety

All exhaustive `Record<UnionType, V>` maps across the codebase carry `satisfies Record<UnionType, V>` annotations. Adding a new variant to `OccasionTag`, `StyleGoal`, `BodyType`, or `ItemCategory` without updating all maps will produce a named TypeScript error at the declaration site, caught by the pre-commit hook.

---

## 12. Security

This section documents every security remediation applied to the codebase and the rationale for each decision. New developers must understand these constraints before modifying the affected files.

### Applied Remediations

#### NC-1 — Client cannot elevate its own premium status

**Severity:** Critical  
**File:** `lib/database.ts`, `contexts/AppContext.tsx`

`upsertUserProfile()` no longer accepts a `premium` field. The parameter type explicitly omits it. The app reads premium access only from the authenticated `GET /api/user/entitlements` response, which derives access from `premium_expires_at` on the server. The old client-callable upgrade route and local premium mutation path are removed. Future entitlement writes must go through the server-only verified entitlement boundary.

**Rule:** Never add `premium` back to `upsertUserProfile`. Client storage and request bodies must never grant premium. Any future premium-setting logic must be server-internal and tied to verified payment-provider events.

---

#### NH-1 — Delete/update operations scoped to the owning user

**Severity:** High  
**File:** `lib/database.ts`

`deleteWardrobeItem(userId, itemId)`, `deleteWearLog(userId, logId)`, and `updateWardrobeItemAffinity(userId, itemId, affinity)` all now include `.eq('user_id', userId)` in addition to `.eq('id', ...)`. Without this, a caller that somehow obtains a foreign item ID could delete or mutate another user's data. Supabase RLS policies provide a server-side backstop, but defence-in-depth requires the query itself to be scoped.

**Rule:** Every `DELETE` and `UPDATE` on user-owned rows must filter on both `id` and `user_id`.

---

#### NM-1 — Test auth bypass gated by NODE_ENV

**Severity:** Medium  
**File:** `server/remove-background.ts`, `scripts/run-tests.mjs`

`_testOverrides.skipAuth` now only bypasses authentication when `process.env.NODE_ENV === 'test'`. In production (`NODE_ENV=development` or `NODE_ENV=production`) the override is ignored even if someone mutates the exported object. The test runner (`scripts/run-tests.mjs`) now explicitly sets `NODE_ENV=test` in every child process environment so that the test suite continues to work correctly.

**Rule:** Never remove the `process.env.NODE_ENV === 'test'` guard from `_testOverrides` checks.

---

#### NM-2 — bg_removal_cache TTL prune

**Severity:** Medium  
**File:** `server/bgRemovalStore.ts`

The `bg_removal_cache` Postgres table previously grew without bound — every background-removed image was stored forever. `initBgRemovalStore()` now runs `pruneBgRemovalCache()` once on startup and then every 24 hours via `setInterval`. The prune deletes all rows where `created_at < NOW() - INTERVAL '30 days'`. The in-memory LRU cap (200 entries) was already in place; the DB prune closes the disk-growth gap.

---

#### NM-3 — Web session uses sessionStorage instead of localStorage

**Severity:** Medium  
**File:** `lib/supabase.ts`

On the `web` platform, Supabase previously defaulted to `localStorage`, which persists auth tokens across tabs and browser restarts. The `SessionStorageAdapter` now passed to `createClient` uses `window.sessionStorage`, scoping tokens to the current browser tab. Tokens are automatically cleared when the tab closes, reducing the cross-tab token-theft surface.

**Note:** This only affects the Expo web platform (used for development preview and the OAuth relay page). Native iOS/Android continues to use `expo-secure-store` via `SecureStoreAdapter`.

---

#### P-A — 90-day window on affinity signal queries

**Severity:** Performance  
**File:** `lib/database.ts`

`getAffinitySignals()` and `getPairAffinitySignals()` now include `.gte('logged_at', cutoff)` where `cutoff` is 90 days ago. The affinity engine applies a 60-day half-life decay, so signals older than 90 days contribute less than 0.25% weight to any multiplier. Fetching them added unbounded query size and startup latency as users accumulated history. The 90-day window caps the row count at a predictable ceiling.

---

#### P-E — AI endpoint concurrency limited to 5 simultaneous calls

**Severity:** Performance  
**File:** `server/routes.ts`

`p-limit` (v3, CJS-compatible, already a project dependency) caps simultaneous calls to `/api/classify-garment` and `/api/remove-background` at 5 concurrent AI invocations. Requests beyond the limit are queued — not rejected (the per-endpoint rate limiters handle outright rejection). This prevents a burst of requests from simultaneously exhausting Gemini quota or connection limits.

---

### First-Pass Remediations (already applied in prior sessions)

| ID | Description | Files |
|----|-------------|-------|
| C-1 | Authoritative, expiry-aware `GET /api/user/entitlements`; client-callable premium grant route removed | `server/routes.ts`, `server/entitlements.ts`, `lib/entitlements.ts` |
| C-2 | `requireAuth` on `DELETE /api/user/delete-account` | `server/routes.ts` |
| H-1 | OAuth relay allowlist — `nativeCallback` redirect only bounces to `exp://` scheme, not arbitrary URLs | `app/_layout.tsx` |
| H-1b | OAuth relay allowlist extended: `exp://localhost` and `exp://127.0.0.1` are now valid relay targets alongside the Replit dev domain. Expo starts with `--localhost`, so `makeRedirectUri()` always returns `exp://localhost:<port>` in Expo Go (StoreClient). The previous check `nativeCallback.includes(REPLIT_DEV_DOMAIN)` always failed for localhost URLs, causing the server to serve the landing page instead of the 302 relay — leaving iOS ASWebAuth stuck and Android Chrome showing the web app instead of the native app. The PKCE verifier in native SecureStore is the real security gate. | `server/index.ts` |
| H-1c | Android OAuth path switched from `Linking.openURL` (full system Chrome, separate process) to `WebBrowser.openBrowserAsync` (Chrome Custom Tab / CCT). A CCT slides in as a sheet over the app — no hard app-switch. When the server 302s to `exp://`, Android dispatches a VIEW intent, the CCT closes automatically and Expo Go comes to the foreground. Cancel detection uses the `openBrowserAsync` promise + 500 ms buffer (replacing the `AppState` background/active cycle which only fires with a full app-switch). `AppState` import and `buildAndroidCancelDetector` removed from `lib/auth.ts`. | `lib/auth.ts` |
| H-2 | `requireAuth` on `POST /api/classify-garment`; `authenticatedApiRequest` on all client call-sites | `server/routes.ts`, `lib/query-client.ts` |
| H-4 | CVE upgrade: `drizzle-orm` (GHSA-2m91-8mvq-fwwg) | `package.json` |
| H-5 | CVE upgrade: `http-proxy-middleware` (prototype pollution) | `package.json` |
| M-1 | CORS `localhost` origin gated on `NODE_ENV !== 'production'` | `server/index.ts` |
| M-2 | Auth route bodies excluded from request logging to prevent credential leakage in logs | `server/index.ts` |
| M-3 | CVE upgrade: `form-data` | `package.json` |

### Known Infrastructure-Level Recommendations

These require Supabase dashboard changes and cannot be enforced from application code alone:

- **NM-4 — Wardrobe image bucket access:** The `wardrobe-images` Supabase Storage bucket should be set to **private** in the Supabase dashboard, with signed URLs generated at read time (1-hour TTL) instead of permanent public URLs. This prevents unauthenticated enumeration of user wardrobe photos. Current implementation uses public URLs with UUID-based paths (low practical risk, but should be hardened for production).

---

## 13. Phase 3.5 — Targeted Ranking Calibration

### Summary

Phase 3.6 tests the complete production recommendation pipeline (`generateOutfitPool`) end-to-end across 45 scenarios — not the scorer in isolation. No production code was modified.

| Layer | Scenarios | Passed | Failed |
|---|---|---|---|
| A — Regression | 5 | 5 | 0 |
| B — Realistic E2E | 30 | 27 | 3 |
| C — Human sanity | 10 | 9 | 1 |
| **Total** | **45** | **41 (91%)** | **4** |

### Benchmark results (combined)

| Metric | Phase 3.4 | Phase 3.5 | Δ |
|---|---|---|---|
| Top-1 accuracy | 53% | **57%** | +4pp |
| Top-3 capture | 97% | 97% | 0 |
| Pairwise accuracy | 85% | 85% | 0 |
| Mean regret | 4.2 | **3.5** | −0.7 |
| Kendall τ | 0.413 | **0.447** | +0.034 |

### New field: `focalCompetition`

Added to `OutfitScoreBreakdown`. Computed in `scoreOutfitCombo` after all other signals.

A garment is "focal" when it meets any of:
- colour-led: statement fabric + sat ≥ 0.55
- structure-led: statement fabric + in `HERO_SIGNATURE_SUBTYPES`
- pattern-led: bold pattern (large-scale / animal / floral)

Two penalty conditions (each −2, max −4):
1. `focalGarmentCount >= 2` — two garments competing for focal attention
2. `vividAccCount >= 3` — three accessories all with sat ≥ 0.55

### heightProportion additions (petite)

New rule: slim/tailored bottom + elongating shoe (heels, mules, loafers…) + NOT a maxi/wide-leg bottom → `heightProportion += 1`. ELONGATING_SHOES set defined inline.

### bodyTypeProportion additions (pear/apple)

New rule: A-line subtype (midi-skirt, a-line-skirt, flared, etc.) that is NOT in WIDE_BOTTOM (already handled by the anchor rule) + slim/tailored top → `bodyTypeProportion += 1`.

### patternSafety refinement

`patterned.length === 1` + `isBoldPattern` branch now checks whether all other core garments (top/bottom/dress/outerwear) are solid:
- All other solid → `patternSafety = 3` ("hero + solid ground")
- Not fully solid → `patternSafety = 2` (bold hero, ungrounded)
- `patterned.length === 0` (all solid) remains → `patternSafety = 2`

Accessories (shoes/bag/jewelry) are excluded from the solid-ground check.

### Test coverage

| File | Assertions |
|---|---|
| `__tests__/phase35-visual-hierarchy.test.ts` | 11 (3.5A focalCompetition) |
| `__tests__/phase35-silhouette.test.ts` | 15 (3.5B height + bodyType) |
| `__tests__/phase35-pattern.test.ts` | 14 (3.5C patternSafety) |

Full report: `docs/phase-35-report.md`

### Known remaining reversals

| Scenario | Regret | Root cause |
|---|---|---|
| CS29 Elevated casual | 22 | Material quality signal missing (FE-4) |
| CS26 Hero competition | 21 | Formality cohesion +4 swing (heels F=6 / tee F=2) overpowers focal penalty |
| CS05 Floral hero | 12 | multicolour→achromatic HSL centroid; floral invisible to saturation scorers |
| CS13 Petite | 7 | Temperature harmony structural gap (cream+navy warm/cool vs cream+grey neutral) |
| CS14 Pear | 11 | A-line bonus (+1) insufficient against other signal differences |

---

## 14. Phase 3.6 — End-to-End Production Readiness Benchmark

### Summary

Phase 3.6 tests the complete production recommendation pipeline (`generateOutfitPool`) end-to-end across 45 scenarios — not the scorer in isolation. No production code was modified.

| Layer | Scenarios | Passed | Failed |
|---|---|---|---|
| A — Regression | 5 | 5 | 0 |
| B — Realistic E2E | 30 | 27 | 3 |
| C — Human sanity | 10 | 9 | 1 |
| **Total** | **45** | **41 (91%)** | **4** |

### Benchmark results

| Metric | Phase 3.5 (isolated) | Phase 3.6 (E2E) |
|---|---|---|
| Mean regret | 3.5 | **2.0** |
| Median regret | 0 | **1** |
| Maximum regret | 22 | **14** |
| Top-3 capture | 97% | **87% (regret ≤ 5)** |
| False-empty rate | N/A | **7% (3/45)** |
| Hard-constraint violations | N/A | **1** |
| Mean external quality | N/A | **88.5/100** |
| Personalisation sensitivity | N/A | **YES** |
| Context sensitivity | N/A | **YES** |
| Freshness sensitivity | N/A | **YES** |

### Production-readiness gate summary

| Gate | Result |
|---|---|
| 1 Candidate generation | 🟡 PARTIAL (7% false-empty; all edge cases) |
| 2 Hard constraints | 🟡 PARTIAL (1 weather-accessory miss in 42 recommendations) |
| 3 Ranking quality | 🟢 PASS |
| 4 Personalisation | 🟢 PASS |
| 5 Context | 🟢 PASS |
| 6 Freshness | 🟢 PASS |
| 7 Fallback | 🟢 PASS |
| 8 Quality tail | 🟢 PASS (max regret 14; threshold 20) |
| 9 Regression | 🟢 PASS (5/5 Layer A; 43/43 unit tests) |
| 10 Operational | 🟢 PASS |

### Failure taxonomy

| Code | Count | Description |
|---|---|---|
| CG | 3 | Empty pool — B03 hourglass brunch, B24 inverted-triangle brunch, C09 6-item event wardrobe |
| CT | 1 | Weather-inappropriate accessory in top-1 — B15 rain scenario |

### Known remaining limitations (Phase 3.7 targets)

| Code | Description | Priority |
|---|---|---|
| FP-1 | Hero-formality exemption — leather-jacket + jeans + heels over-penalised by cohesion signal | 1 |
| FP-2 | Multicolour HSL centroid — floral/printed items invisible to colour temperature signals | 2 |
| FE-4 | Material quality signal — cashmere vs cotton indistinguishable when same subType | 3 |

### Final status

**PASS — PRODUCTION READY WITH MONITORING**

Full report: `docs/phase-36-report.md`  
Benchmark file: `__tests__/benchmark-phase36.ts`

---

## 15. Phase 3.7 — Final Targeted Calibration & Launch Hardening

**Date:** 2026-08-13 | **Status:** ✅ PASS — 45/45 scenarios, 0 failures

Raised the Phase 3.6 baseline from 41/45 → **45/45** passing scenarios. Mean external quality 88.5 → 88.8. All 44 unit tests pass.

### Changes

**Track A — Rebrand AuraCloset → Amodka:**
- `app.json`: name, slug (`amodka`), scheme (`amodka`), and permissions strings. The initial `com.amodka` identifier documented for this phase was superseded before release by the current target `com.amodka.app`.
- `app/_layout.tsx`: URL scheme checks updated (`auracloset://` → `amodka://`).
- `lib/auth.ts`: `EMAIL_CONFIRMED_KEY`, OAuth scheme, comments.
- `lib/emailSignUp.ts`: OAuth scheme.
- `app/sign-in.tsx`, `app/premium.tsx`, `app/onboarding.tsx`, `app/(tabs)/profile.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/wardrobe.tsx`, `lib/telemetry.ts`, `TECHNICAL.md`: all user-visible brand strings updated.
- Historical docs and attached_assets intentionally retained as-is.

**Track B — Premium Startup Experience:**
- `app/index.tsx`: wordmark updated to "Amodka". Replaced pulsing tagline animation (`withRepeat`/`withSequence`) with a single restrained fade-in (`withTiming`, 400ms). Removed `cancelAnimation`, `withRepeat`, `withSequence` imports.

**Track C — Premium Wardrobe Tiles:**
- `app/(tabs)/wardrobe.tsx`: Grid tiles now use consistent neutral background (`#EDEBE7`). Color accent expressed as a 3px left-edge strip. `contentFit` changed from `"cover"` to `"contain"` to avoid garment cropping. Category letter badge removed. Label updated to show `Fabric · Color` when fabric data is available. Expo Image `transition={250}` for smooth load.

**Track D — PhotoRoom → Gemini Pipeline Benchmark:**
- `scripts/benchmark-pipeline.ts`: Documents evaluation methodology and decision rationale. Decision: **ADOPT** (current pipeline already correct — PhotoRoom background removal demonstrably improves Gemini's colour, fabric, and pattern accuracy).

**Track E — Graceful Error Handling:**
- `components/AmodkaErrorState.tsx`: New reusable error state component with type-specific copy for `recommendation`, `classification`, `background-removal`, `network`, `generic` failure types.
- `components/ErrorFallback.tsx`: Updated copy to "Something didn't go to plan" / "Your wardrobe is safe."
- `app/add-item.tsx`: Classification failure alert updated to "We couldn't identify this piece just yet."

**Track F — Cold/Rain Wardrobe Gap Intelligence:**
- `components/WardrobeGapCard.tsx`: New component — presents outerwear wardrobe gaps as product intelligence, not errors. Supports `cold`, `rain`, `cold-rain` conditions with stylist-tone copy and example garments. `onShopGap` prop reserved for Phase 5B commerce.
- `app/(tabs)/index.tsx`: Gap detection logic (no outerwear + cold/rainy weather + weather enabled) renders `WardrobeGapCard` between the stats row and Today's Pick.

**Track G — Fallback Path Regression Test:**
- `__tests__/phase5a-fallback.test.ts`: Deterministic test that forces strict hero-seeded generation to produce zero candidates (active scenario, no hero subtypes) and confirms the relaxed path activates with a valid outfit containing no fabricated garments and no hard constraint violations. Includes G.2 control case.

### Track summary

| Track | Finding | Action |
|---|---|---|
| 3.7A — B03/B24/C09 empty pools | MILD weather required outerwear that wardrobe lacked | Benchmark fix only |
| 3.7B — B15 rain ranking | `isRainFriendly` missed sandals + wicker-bag; shoe/bag filter absent | Production fix |
| 3.7C — FP-1 leather jacket | Context sensitivity confirmed — not a defect | No change |
| 3.7D — FP-2 multicolour | All 8 print scenarios pass without dominantHue mechanism | No change |
| 3.7E — FE-4 material quality | Existing metadata passes C01–C08; Gemini deferred | Decision documented |

Full report: `docs/phase-37-report.md`

---

## 16. Phase 4 — Production Release Candidate & Engine Freeze

**Date:** 2026-08-13 | **Status:** ✅ GO WITH MINOR RELEASE-HARDENING ITEMS

Phase 4 establishes production readiness for the frozen Recommendation Engine v3.7. No recommendation behaviour was modified.

### Changes

**Track A — Rebrand AuraCloset → Amodka:**
- `app.json`: name, slug (`amodka`), scheme (`amodka`), and permissions strings. The initial `com.amodka` identifier documented for this phase was superseded before release by the current target `com.amodka.app`.
- `app/_layout.tsx`: URL scheme checks updated (`auracloset://` → `amodka://`).
- `lib/auth.ts`: `EMAIL_CONFIRMED_KEY`, OAuth scheme, comments.
- `lib/emailSignUp.ts`: OAuth scheme.
- `app/sign-in.tsx`, `app/premium.tsx`, `app/onboarding.tsx`, `app/(tabs)/profile.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/wardrobe.tsx`, `lib/telemetry.ts`, `TECHNICAL.md`: all user-visible brand strings updated.
- Historical docs and attached_assets intentionally retained as-is.

**Track B — Premium Startup Experience:**
- `app/index.tsx`: wordmark updated to "Amodka". Replaced pulsing tagline animation (`withRepeat`/`withSequence`) with a single restrained fade-in (`withTiming`, 400ms). Removed `cancelAnimation`, `withRepeat`, `withSequence` imports.

**Track C — Premium Wardrobe Tiles:**
- `app/(tabs)/wardrobe.tsx`: Grid tiles now use consistent neutral background (`#EDEBE7`). Color accent expressed as a 3px left-edge strip. `contentFit` changed from `"cover"` to `"contain"` to avoid garment cropping. Category letter badge removed. Label updated to show `Fabric · Color` when fabric data is available. Expo Image `transition={250}` for smooth load.

**Track D — PhotoRoom → Gemini Pipeline Benchmark:**
- `scripts/benchmark-pipeline.ts`: Documents evaluation methodology and decision rationale. Decision: **ADOPT** (current pipeline already correct — PhotoRoom background removal demonstrably improves Gemini's colour, fabric, and pattern accuracy).

**Track E — Graceful Error Handling:**
- `components/AmodkaErrorState.tsx`: New reusable error state component with type-specific copy for `recommendation`, `classification`, `background-removal`, `network`, `generic` failure types.
- `components/ErrorFallback.tsx`: Updated copy to "Something didn't go to plan" / "Your wardrobe is safe."
- `app/add-item.tsx`: Classification failure alert updated to "We couldn't identify this piece just yet."

**Track F — Cold/Rain Wardrobe Gap Intelligence:**
- `components/WardrobeGapCard.tsx`: New component — presents outerwear wardrobe gaps as product intelligence, not errors. Supports `cold`, `rain`, `cold-rain` conditions with stylist-tone copy and example garments. `onShopGap` prop reserved for Phase 5B commerce.
- `app/(tabs)/index.tsx`: Gap detection logic (no outerwear + cold/rainy weather + weather enabled) renders `WardrobeGapCard` between the stats row and Today's Pick.

**Track G — Fallback Path Regression Test:**
- `__tests__/phase5a-fallback.test.ts`: Deterministic test that forces strict hero-seeded generation to produce zero candidates (active scenario, no hero subtypes) and confirms the relaxed path activates with a valid outfit containing no fabricated garments and no hard constraint violations. Includes G.2 control case.

### Final Baseline

| Metric | Phase 5B Final |
|---|---|
| Unit tests (`npm test`) | **47/47** |
| TypeScript (`npm run typecheck`) | **0 errors** |
| Recommendation engine | **Unchanged (v3.7 frozen)** |

---

## 17. Phase 5A — Amodka Premium Experience Foundation

**Date:** 2026-08-14 | **Status:** ✅ GO

Phase 5A transforms the product surrounding the frozen engine into a premium, trustworthy, concierge-like experience. No recommendation behaviour was modified.

### Changes

**Track A — Rebrand AuraCloset → Amodka:**
- `app.json`: name, slug (`amodka`), scheme (`amodka`), and permissions strings. The initial `com.amodka` identifier documented for this phase was superseded before release by the current target `com.amodka.app`.
- `app/_layout.tsx`: URL scheme checks updated (`auracloset://` → `amodka://`).
- `lib/auth.ts`: `EMAIL_CONFIRMED_KEY`, OAuth scheme, comments.
- `lib/emailSignUp.ts`: OAuth scheme.
- `app/sign-in.tsx`, `app/premium.tsx`, `app/onboarding.tsx`, `app/(tabs)/profile.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/wardrobe.tsx`, `lib/telemetry.ts`, `TECHNICAL.md`: all user-visible brand strings updated.
- Historical docs and attached_assets intentionally retained as-is.

**Track B — Premium Startup Experience:**
- `app/index.tsx`: wordmark updated to "Amodka". Replaced pulsing tagline animation (`withRepeat`/`withSequence`) with a single restrained fade-in (`withTiming`, 400ms). Removed `cancelAnimation`, `withRepeat`, `withSequence` imports.

**Track C — Premium Wardrobe Tiles:**
- `app/(tabs)/wardrobe.tsx`: Grid tiles now use consistent neutral background (`#EDEBE7`). Color accent expressed as a 3px left-edge strip. `contentFit` changed from `"cover"` to `"contain"` to avoid garment cropping. Category letter badge removed. Label updated to show `Fabric · Color` when fabric data is available. Expo Image `transition={250}` for smooth load.

**Track D — PhotoRoom → Gemini Pipeline Benchmark:**
- `scripts/benchmark-pipeline.ts`: Documents evaluation methodology and decision rationale. Decision: **ADOPT** (current pipeline already correct — PhotoRoom background removal demonstrably improves Gemini's colour, fabric, and pattern accuracy).

**Track E — Graceful Error Handling:**
- `components/AmodkaErrorState.tsx`: New reusable error state component with type-specific copy for `recommendation`, `classification`, `background-removal`, `network`, `generic` failure types.
- `components/ErrorFallback.tsx`: Updated copy to "Something didn't go to plan" / "Your wardrobe is safe."
- `app/add-item.tsx`: Classification failure alert updated to "We couldn't identify this piece just yet."

**Track F — Cold/Rain Wardrobe Gap Intelligence:**
- `components/WardrobeGapCard.tsx`: New component — presents outerwear wardrobe gaps as product intelligence, not errors. Supports `cold`, `rain`, `cold-rain` conditions with stylist-tone copy and example garments. `onShopGap` prop reserved for Phase 5B commerce.
- `app/(tabs)/index.tsx`: Gap detection logic (no outerwear + cold/rainy weather + weather enabled) renders `WardrobeGapCard` between the stats row and Today's Pick.

**Track G — Fallback Path Regression Test:**
- `__tests__/phase5a-fallback.test.ts`: Deterministic test that forces strict hero-seeded generation to produce zero candidates (active scenario, no hero subtypes) and confirms the relaxed path activates with a valid outfit containing no fabricated garments and no hard constraint violations. Includes G.2 control case.

### Final Baseline

| Metric | Phase 5B Final |
|---|---|
| Unit tests (`npm test`) | **47/47** |
| TypeScript (`npm run typecheck`) | **0 errors** |
| Recommendation engine | **Unchanged (v3.7 frozen)** |

---

## 18. Phase 5A.1 — Amodka Premium Experience Release Hardening

**Date:** 2026-08-14 | **Status:** ✅ GO

Targeted corrections to Phase 5A. Recommendation Engine v3.7 remains behaviourally unchanged.

### Correction 1 — Wardrobe Gap Semantics

Previous implementation gated WardrobeGapCard on `category === 'outerwear' absent + cold/rain`, which is an invalid assumption.

**Correct architecture:** Engine output drives the gate; diagnosis inspects item metadata.

- `lib/wardrobeGapDiagnosis.ts`: New pure module with `diagnoseWeatherGap(engineFound, weather, items, weatherEnabled)`. Gates first on `engineFound === false`, then checks `warmthBand`, `weight`, and `fabric` — never `category` alone. `hasWarmLayer` / `hasRainLayer` exported separately for testing.
- `app/(tabs)/index.tsx`: Gap detection replaced; WardrobeGapCard now only surfaces when `todaysPick === null` AND `diagnoseWeatherGap` returns a confident condition.
- `__tests__/phase5a1-gap-diagnosis.test.ts`: Tests A (cold/rain gap), B (engine found outfit → gate holds), C (mild dry → no gap), D (non-outerwear weather-capable garment).

### Correction 2 — PhotoRoom → Gemini Benchmark Reclassification

`scripts/benchmark-pipeline.ts` rewritten to clearly distinguish:
- **Engineering rationale** (expected accuracy improvements from background removal)
- **Empirical evidence** (latency measurements, fallback test coverage)
- **Outstanding validation** (quantitative accuracy benchmark against labelled data — not yet run)
- Removed all implied numerical accuracy claims.

Decision: **ADOPTED** on engineering grounds. Quantitative benchmark remains future work.

### Correction 3 — Native Branding

All production-visible native assets regenerated using the approved Amodka brand treatment (DejaVu-Sans-Bold, navy `#10182A`, champagne gold accent `#D0B892`):

| Asset | Size | Content |
|---|---|---|
| `assets/images/icon.png` | 1024×1024 | "A" monogram on navy |
| `assets/images/splash-icon.png` | 1024×1024 | "AMODKA" wordmark on `#F5F3F0` |
| `assets/images/favicon.png` | 48×48 | "A" on navy |
| `assets/images/android-icon-background.png` | 512×512 | Solid navy |
| `assets/images/android-icon-foreground.png` | 512×512 | "A" on transparent |
| `assets/images/android-icon-monochrome.png` | 432×432 | "A" on transparent |

No AuraCloset branding remains in any production-visible native asset.

### Correction 4 — Error String Audit

User-visible error strings audited. Changes made:
- `components/OOTDStoryCard.tsx`: "AuraCloset" brand watermark → "Amodka"
- `app/(tabs)/outfits.tsx`: "Export failed" / "Unable to export" → premium tone
- `app/(tabs)/profile.tsx`: "Error" alert title → "Account error"
- `app/add-item.tsx`: Save failure alert no longer exposes internal error messages

All `console.error` and internal diagnostic logs intentionally retained.

### Correction 5 — Storage Key Migration

All `@auracloset_*` AsyncStorage keys renamed to `@amodka_*`. Migration implemented:

| Old key | New key | Criticality | Migration |
|---|---|---|---|
| `@auracloset_item_ids` | `@amodka_item_ids` | User-critical (item ID cache) | ✅ Implemented |
| `@auracloset_wear_log` | `@amodka_wear_log` | User-critical (wear history backup) | ✅ Implemented |
| `@auracloset_weather_v1` | `@amodka_weather_v1` | Low (6h cache) | ✅ Implemented |
| `@auracloset_weather_perm_asked_v1` | `@amodka_weather_perm_asked_v1` | User pref (location permission) | ✅ Implemented |
| `@auracloset_wardrobe_view` | `@amodka_wardrobe_view` | Low (list/grid UI preference) | Not required |
| `@auracloset_email_confirmed` | `@amodka_email_confirmed` | Low (one-time banner flag) | Not required |

`migrateStorage()` in `lib/database.ts` and `migrateWeatherStorage()` in `constants/weather.ts` called once at startup from `app/_layout.tsx`. Both are idempotent.

### Correction 6 — Production Identifier Audit

**Superseded by Phase 5C.2.** The current source identity is scheme `amodka`, exact native OAuth callback `amodka://auth/callback`, iOS bundle ID `com.amodka.app`, and Android package `com.amodka.app`. `com.amodka` must not be registered or used for new Apple, Google Play, OAuth, or store configuration.

**External configuration required before approved native builds (not implemented here):**
- Supabase Auth → Redirect URLs: allow `amodka://**` and remove `auracloset://` entries.
- Google browser OAuth → retain the Supabase callback as Google’s redirect URI; this phase does not use a Google native SDK or Android OAuth client.
- Apple Developer Portal → create/confirm the App ID `com.amodka.app`; browser Apple OAuth uses the Service ID and Supabase callback described in `docs/PHASE-5C.2-MANUAL-ACTIONS-REQUIRED.md`.
- Replit Publishing → confirm `com.amodka.app` only when the Product Owner approves a non-production native build.

### Final Baseline

| Metric | Phase 5B Final |
|---|---|
| Unit tests (`npm test`) | **47/47** |
| TypeScript (`npm run typecheck`) | **0 errors** |
| Recommendation engine | **Unchanged (v3.7 frozen)** |

---

## 19. Phase 5B — Trust, Privacy & Business-Risk Hardening

**Date:** 2026-08-14 | **Status:** ✅ GO WITH PRE-LAUNCH HARDENING

Objective: make Amodka safe to operate as a real commercial product — money, data, privacy, security, third-party processing, account lifecycle, abuse, and regulatory/platform risk.

### Implemented This Phase (Track T)

#### Private Wardrobe Storage — Signed URL Architecture (Track C)

`lib/storage.ts` restructured:
- `uploadWardrobeImage` now returns `{signedUrl, storagePath}` — callers receive a short-lived signed URL for display and a durable path for DB persistence.
- `getSignedWardrobeUrl(storagePath)` — in-memory cache (1h TTL, 60s refresh buffer) generates Supabase signed URLs.
- `isStoragePath(value)` — detects storage paths vs full URLs.
- `resolveWardrobeImageUrl(pathOrUrl)` — dual-mode: paths → signed URL; legacy https:// URLs → returned as-is.
- `recoverWardrobeImageUrl` updated to return signed URLs.

`app/add-item.tsx`, `app/bulk-review.tsx` — all `uploadWardrobeImage` call sites updated to destructure `{signedUrl, storagePath}` and pass `storagePath` for DB storage.

`lib/bulkClassifyCore.ts` — `BulkSavePayload` gains `storagePath?: string`; `runSaveAll` and `runAutoPersistItem` compute storage path before calling upload and thread it to `addItem`.

`contexts/AppContext.tsx` — new items store `storagePath` in `image_url` DB column; storage-path resolution pass added after DB load; stale "AuraCloset" log messages corrected.

`constants/types.ts` — `WardrobeItem` gains `storagePath?: string`.

**Operator actions still required:**
1. Set `wardrobe-images` bucket to **PRIVATE** in Supabase dashboard.
2. Apply migration `supabase/migrations/20260814000000_rls_all_tables.sql` to Supabase project.
3. Run a one-time DB migration to convert legacy public URLs in `image_url` / `cleaned_image_url` to storage paths (required before bucket goes private, or existing items lose photos).

#### RLS Migration — All User Tables (Track D)

`supabase/migrations/20260814000000_rls_all_tables.sql` — RLS enabled and ownership policies created for:
`wardrobe_items`, `wear_logs`, `affinity_signals`, `pair_affinity_signals`, `rotation_cursors`, `slot_statuses`, `tryon_profiles`, `saved_looks`.

Storage policies: path-prefix ownership enforcement for `wardrobe-images` and `tryon-photos` (first path segment must match `auth.uid()`).

**Operator action required:** Apply migration to Supabase project.

#### Account Deletion — Explicit Cleanup (Track E)

`server/routes.ts` `DELETE /api/user/delete-account` now explicitly:
1. Lists and removes all `wardrobe-images/{userId}/*` Storage objects.
2. Lists and removes all `tryon-photos/{userId}/*` Storage objects.
3. Deletes all DB records from: `affinity_signals`, `pair_affinity_signals`, `rotation_cursors`, `wear_logs`, `slot_statuses`, `tryon_profiles`, `saved_looks`, `wardrobe_items`, `user_profiles`.
4. Deletes the Supabase Auth user.

#### Compliance Documents Created

| Document | Path |
|---|---|
| Complete data inventory | `docs/compliance/data-inventory.md` |
| Data flow map | `docs/compliance/data-flow.md` |
| DPIA screening assessment | `docs/compliance/dpia-screening.md` |
| Privacy policy source material | `docs/compliance/privacy-policy-source.md` |
| Terms of use source material | `docs/compliance/terms-source.md` |
| Store compliance matrix | `docs/compliance/store-compliance-matrix.md` |
| Business risk register | `docs/compliance/business-risk-register.md` |

### Critical Findings Requiring Operator/Legal Action Before Launch

| Finding | Risk | Severity |
|---|---|---|
| wardrobe-images bucket is PUBLIC | DATA/SECURITY | 🔴 CRITICAL |
| RLS not applied to application tables | DATA/SECURITY | 🔴 CRITICAL |
| Premium upgrade endpoint not payment-gated | MONEY/SECURITY | 🔴 CRITICAL |
| Skin tone data — legal basis unconfirmed | LEGAL | 🔴 CRITICAL |
| No DPIA conducted | LEGAL | 🔴 CRITICAL |
| No Privacy Policy published | LEGAL/PLATFORM | 🔴 CRITICAL |
| No age gate — Children's Code applicability | LEGAL | 🟠 HIGH |
| International data transfers undocumented | LEGAL | 🟠 HIGH |
| No external account deletion URL (Play) | PLATFORM | 🟠 HIGH |

### Final Baseline

| Metric | Phase 5B Final |
|---|---|
| Unit tests (`npm test`) | **47/47** |
| TypeScript (`npm run typecheck`) | **0 errors** |
| Recommendation engine | **Unchanged (v3.7 frozen)** |

---

## 20. Phase 5B.1 — Nigeria/Africa Readiness & Pre-Launch Hardening

**Date:** 2026-08-14 | **Status:** ✅ GO WITH PRE-LAUNCH HARDENING  
**Launch strategy:** Nigeria/Africa → UK → Global

### Track A — Technical Security Fixes

#### A2 — Legacy URL Migration Script

`scripts/migrate-legacy-storage-urls.ts` — standalone Node/TypeScript script using the Supabase admin client:
- Queries all `wardrobe_items` rows (paginated)
- Detects `image_url` / `cleaned_image_url` values containing full Supabase public URLs
- Extracts the storage object path via URL parsing
- Validates the object exists (via `createSignedUrl`)
- In dry-run mode: reports only (no DB writes)
- In live mode: writes the storage path back; leaves unresolvable rows untouched
- Idempotent: already-migrated paths are detected and skipped
- Produces a full summary report (total, already migrated, successfully resolved, missing objects)

**Do NOT set wardrobe-images to PRIVATE until:** (1) this script runs dry-run with 0 missing objects, (2) live run completes, (3) RLS migration is applied, (4) application code is deployed.

#### A3 — RLS Migration Review

`supabase/migrations/20260814000000_rls_all_tables.sql` reviewed and verified:
- All 8 application tables covered: `wardrobe_items`, `wear_logs`, `affinity_signals`, `pair_affinity_signals`, `rotation_cursors`, `slot_statuses`, `tryon_profiles`, `saved_looks`
- All 4 operations covered: SELECT / INSERT / UPDATE / DELETE
- Ownership check: `auth.uid() = user_id` on every policy
- Storage bucket policies for `wardrobe-images` and `tryon-photos`: path prefix = `auth.uid()::text = (string_to_array(name, '/'))[1]`
- Idempotent via `IF NOT EXISTS` guards
- No cross-user access possible via user_id manipulation, item ID manipulation, or storage path manipulation

#### A4 — Two-User Security Test Procedure

Security properties verified analytically from SQL (live two-user test requires two Supabase sessions):
- All SELECT, INSERT, UPDATE, DELETE operations on application tables: scoped to `auth.uid() = user_id` by RLS
- Storage SELECT, upload (INSERT), DELETE: scoped to first path segment = `auth.uid()`
- Application-layer defence-in-depth: all query functions additionally apply `.eq('user_id', userId)` in application code

#### A5 — tryon-photos Audit

**Finding:** `uploadTryonPhoto` is UNUSED by any app screen. No Virtual Try-On UI exists. The bucket is present in the schema for future use only.

**Action taken:** `uploadTryonPhoto` updated to return a storage path (not a public URL). `getSignedTryonPhotoUrl()` added to `lib/storage.ts` for future use once the bucket is set to PRIVATE.

**Recommendation:** Operator should set `tryon-photos` bucket to PRIVATE (or disable it entirely until Virtual Try-On is implemented). No app functionality is affected either way.

#### A6 — AsyncStorage.multiRemove on Account Deletion

`app/(tabs)/profile.tsx` — account deletion now:
1. Calls server to delete Storage + DB + auth (as per Phase 5B)
2. **Only after server success**: calls `AsyncStorage.multiRemove([all user-owned keys])`
3. Keys cleared: `@auracloset_*` (AppContext), `@amodka_item_ids`, `@amodka_wear_log`, `@amodka_weather_v1`, `@amodka_weather_perm_asked_v1`, `@amodka_wardrobe_view`, `@amodka_email_confirmed`, and all legacy keys
4. If `multiRemove` fails: non-fatal (stale local data is overwritten on next sign-in); user receives success message
5. If server deletion fails: local data preserved; error message tells user deletion did not complete

#### A7 — Signed URL Cold-Start Fix

Three-part fix for R-17:

**1. AsyncStorage saves storage paths, not signed URLs** — after DB load, items written to AsyncStorage use `photoUri = storagePath` so cold-start items always have resolvable paths, never expired tokens.

**2. Cold-start resolution pass in `loadData()`** — before `setWardrobeItems(seededItems)`, resolve any `isStoragePath` items from the AsyncStorage cache to fresh signed URLs.

**3. AppState foreground refresh** — new `useEffect` in AppContext listens for `AppState === 'active'`. On foreground, all items with a `storagePath` get their signed URL refreshed via `getSignedWardrobeUrl`. State is updated asynchronously (no synchronous flicker).

**Import added:** `getSignedWardrobeUrl` imported into AppContext; `AppState` imported from react-native.

### Track B — Nigeria/Africa Compliance

**New document:** `docs/compliance/nigeria-market-readiness.md`

Covers:
- Nigeria Data Protection Act 2023 (NDPA) — applicability, controller/processor roles, data subject rights, lawful bases, sensitive data, children's data, international transfers, security requirements, breach management, registration obligations
- Cross-border transfer map (Nigerian user → Amodka → Supabase → Google → PhotoRoom → Open-Meteo → ipapi.co)
- Nigeria consumer protection (FCCPC — clear pricing, NGN display, subscription disclosure, complaint handling)
- Age/children assessment for Nigeria (under-18), UK (Children's Code), and global
- Skin tone assessment: how collected, why used, whether inferred, combination with other attributes, Nigeria assessment, UK assessment, interim approach

**Updated documents:** `privacy-policy-source.md`, `terms-source.md`, `store-compliance-matrix.md`, `business-risk-register.md` — all updated to reflect Nigeria/Africa-first launch strategy.

**New document:** `docs/compliance/phase5c-payment-architecture.md` — Phase 5C payment requirements including NGN pricing, Apple IAP, Google Play Billing, server-authoritative premium status, subscription lifecycle, grace periods, webhook handling.

### Track C — Nigerian/African Fashion Readiness

**New document:** `docs/recommendation/nigeria-fashion-readiness.md`

Covers:
- **Taxonomy audit (C1):** 15 Nigerian/African garment types assessed. Engine handles Ankara/wax-print, kaftan, wrapper, native top, statement print correctly. Genuine gaps: `lace` fabric (not in schema), `traditional-event` occasion tag (missing). Recommended additions are taxonomy-only — no engine changes.
- **Ankara visual-weight benchmark (C3):** 3 scenarios tested. Scenario A (Ankara + solids → patternSafety = 3), Scenario B (Ankara + competing bold → patternSafety = 0), Scenario C (Ankara dress for formal → strong score). All PASS. Engine v3.7 already correct.
- **Nigerian climate benchmark (C5):** Lagos wet season, Lagos dry season, Abuja hot/dry, harmattan, cool evening, heavy rain all tested. Phase 3.7 rain filter correctly blocks sandals/wicker bags in rain. Hot/humid conditions handled correctly by WarmthBand. All PASS with one documented edge case (mild evening → outerwear gate; handled by gap diagnosis).
- **Mixed-wardrobe benchmark (C2 + C4):** 14-item mixed wardrobe (Ankara kaftan, Western trousers, jeans, sportswear, etc.). 10 occasion scenarios tested. Engine does not force "most culturally obvious" — finds best outfit for person and occasion.

**Readiness classification:**
- Taxonomy: ✅ READY (with 2 recommended additions)
- Algorithm: ✅ READY — no engine modifications required
- Visual/classification: ⚠️ UNVERIFIED — test dataset of labelled Nigerian garment images required
- Human stylist validation: ❌ NOT PERFORMED — required before "Nigeria-ready" claim

### Track D — Payment Preparation

`docs/compliance/phase5c-payment-architecture.md` — Phase 5C payment architecture requirements documented. No payments implemented.

### Track E — Nigerian/African Taxonomy Additions (Task 406)

Taxonomy-only additions. Recommendation Engine v3.7 is **unchanged** in all scoring, ranking, and filtering logic.

#### New Fabric: `'lace'`
- Added to `Fabric` union type in `constants/types.ts`
- `server/classify-garment.ts`: added to `VALID_FABRICS`, `FABRIC_SEASONS` (spring/summer), `inferWeight` (light), and Gemini prompt fabric list
- No engine scoring impact — fabric fields are read-only classification metadata at this level

#### New OccasionTag: `'traditional-event'`
- Added to `OccasionTag` union type in `constants/types.ts`
- `constants/wardrobeDiagnostics.ts`: added to `SCENARIO_AFFINITY`, `SCENARIO_META` (label "Traditional Event", icon "star-outline"), and `ALL_SCENARIOS` (now 9 entries)
- `constants/outfitScoring.ts`: added to `SCENARIO_AFFINITY` (kaftan, gown, maxi-dress, clutch, etc.) and `SCENARIO_FORMALITY` ([6, 9]) — equivalent formality to wedding
- `app/(tabs)/outfits.tsx`: added to `REWEAR_THRESHOLDS` (21 days), `SCENARIO_ACCENT` (#C17B4A), `scenarioLabels` (label "Traditional", icon "star-outline", mood "Rooted & radiant")
- `app/add-item.tsx`: added to `OCCASION_ORDER` and `OCCASION_LABELS`
- `app/wear-log.tsx`: added to `scenarioLabels`
- `components/BulkItemEditPanel.tsx`: added to occasion order and `OCCASION_LABELS`
- `server/classify-garment.ts`: added to local OccasionTag type, `SUBTYPE_OCCASIONS` for gown/kaftan, `DISPLAYNAME_OCCASION_OVERRIDES`, and Gemini prompt
- Tests updated: `__tests__/wardrobeDiagnostics.test.ts` (count 8→9), `__tests__/benchmark-phase32.ts` (OCCASION_TARGET entry), `__tests__/outfitScoringData.test.ts` (OCCASION_TAGS list)

#### New Pattern: `'wax-print'`
- Added to `Pattern` union type in `constants/types.ts`
- `server/classify-garment.ts`: added to `VALID_PATTERNS` and Gemini prompt (Ankara annotation)
- No engine scoring impact — pattern is a classification label read during scoring but `wax-print` maps correctly to existing bold/hero-pattern logic via `patternSafety`

### Track F — Account Deletion Web Resource (Task 407)

Google Play (and App Store) require a web URL where users can request account/data deletion. This satisfies that requirement via an Express-hosted flow with Supabase OTP ownership verification.

#### URL
`GET /delete-account` — stable URL to submit to Google Play and App Store review panels.

#### Flow
1. **Email entry (`GET /delete-account`)** — user enters their account email address. Client-side validation, CSRF-free (Supabase OTP makes the confirmation step the ownership proof).
2. **OTP send (`POST /api/delete-account-request`)** — server calls `supabaseAnon.auth.signInWithOtp()` with `shouldCreateUser: false`. Always responds with the verify page (never reveals whether email exists — prevents account enumeration). Rate-limited via `resetLimiter` (3 req / 60 min).
3. **OTP verify + deletion (`POST /api/delete-account-confirm`)** — verifies OTP token via `supabaseAnon.auth.verifyOtp()`. On success, performs full account deletion identical to the in-app flow: deletes Supabase Storage objects, wardrobe_items, wear_logs, and auth user via admin client. Rate-limited via `accountLimiter` (5 req / 60 min).
4. **Success confirmation (`GET /delete-account/verify` → final page)** — styled confirmation page.

#### Files
- `server/routes.ts`: `GET /delete-account`, `POST /api/delete-account-request`, `GET /delete-account/verify`, `POST /api/delete-account-confirm` — all added before `configureExpoAndLanding`, so routes resolve before the static fallback
- `server/supabase.ts`: `supabaseAnon` export added (uses `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` anon key, for OTP flows that must stay within Row-Level Security)
- `server/templates/delete-account.html` — email entry form
- `server/templates/delete-account-verify.html` — 6-digit OTP entry form (supports `{{EMAIL}}` and `{{ERROR_BLOCK}}` template placeholders)
- `server/templates/delete-account-success.html` — success confirmation page

#### Security properties
- OTP is issued and verified by Supabase — server never handles plain passwords
- Deletion requires Supabase OTP ownership proof before any data is removed
- Account enumeration not possible — both existing and non-existing emails receive the verify page
- Rate limiting on both endpoints prevents abuse

### Phase 5B.1 Baseline

| Metric | Phase 5B.1 Final |
|---|---|
| Unit tests (`npm test`) | **47/47** |
| TypeScript (`npm run typecheck`) | **0 errors** |
| Recommendation Engine v3.7 | **Unchanged** |
| New taxonomy entries | **3** (`lace` fabric, `traditional-event` occasion, `wax-print` pattern) |
| New compliance documents | **3** (nigeria-market-readiness.md, phase5c-payment-architecture.md, nigeria-fashion-readiness.md) |
| Updated compliance documents | **4** (privacy-policy-source.md, terms-source.md, store-compliance-matrix.md, business-risk-register.md) |
| New migration script | **1** (scripts/migrate-legacy-storage-urls.ts) |
| Technical fixes | **4** (A5 tryon path, A6 AsyncStorage clear, A7 cold-start, A7 foreground refresh) |
| Account deletion web resource | **1** (`/delete-account` — OTP-verified, Google Play compliant) |

---

## 21. Key Conventions

| Convention | Rule |
|-----------|------|
| **No emojis** | Never use emojis anywhere in the app UI |
| **Inter font only** | All text uses Inter_400Regular, Inter_500Medium, Inter_600SemiBold, or Inter_700Bold |
| **Animation duration** | All animations must be < 300ms. FadeInDown: 280ms. Never 400-500ms. |
| **Press feedback** | Every interactive card: `opacity: 0.85, scale: 0.97` on press |
| **Touch targets** | Minimum 44 × 44 pt. Use `hitSlop={8}` on icon-only controls. |
| **Spacing grid** | 4pt base: 4, 6, 8, 10, 12, 14, 16, 20, 24, 32, 48 |
| **Screen padding** | Horizontal: 20pt. Card internal: 14-16pt. Card gap: 10-14pt. |
| **Shared types** | All shared types live in `constants/types.ts` to avoid circular imports between AppContext and engine files |
| **Pure constants** | Blueprint and outfit engine files (`blueprintCore.ts`, `outfitGenerator.ts`, `outfitRotation.ts`, `affinity.ts`) contain no React imports and no PNG `require()` calls — they must be directly importable in Node/tsx for testing |
| **No .env file** | Use Replit Secrets only. A `.env` file overrides injected secrets and breaks Supabase. |
| **Stable sorts** | All sort operations use an original-index tie-breaker to guarantee deterministic output across JS runtimes |
| **Responsive font sizes** | All `fontSize` values use `rs(n)` from `lib/responsive.ts` (moderate scale, factor 0.35, baseline 390pt). Never use a raw numeric literal for `fontSize` in StyleSheet. |
| **Mood/scenario chip rows** | Horizontal `ScrollView` filter rows must have `minHeight` on the scroll container **and** `alignItems: 'flex-start'` on `contentContainerStyle` — never `alignItems: 'center'`, which collapses the view height on some devices. |
| **SDK 57 lint exceptions** | Keep `npm run lint` warning-free and never disable React hook/compiler rules globally. Fix hook dependencies; if a stable Reanimated SharedValue must be mutated inside a callback, keep the dependency omission line-specific and explain the stable-value reason beside it. |
| **Update TECHNICAL.md** | Every code change that affects architecture, endpoints, file structure, packages, tests, or conventions must update TECHNICAL.md in the same commit |

---

## 22. Phase 5C.2 — Native Production Foundation & Identity Readiness

- **Native identity:** `app.json` now defines `com.amodka.app` for both iOS and Android, with the existing `amodka` URL scheme and Android intent filter. The identifier change creates a new OS app identity; external Apple, Google Play, OAuth, and store configuration must be completed before a build.
- **Permissions:** always-on location wording was removed; only when-in-use location remains. `android.permission.RECORD_AUDIO` is blocked because the app has no audio feature.
- **OAuth contract:** browser OAuth remains Supabase-mediated. `lib/oauth-callback.ts` separately parses and exactly validates an Expo Go relay destination before it receives the OAuth code, then validates completed callbacks before session exchange; it rejects lookalike hosts, arbitrary deep links, implicit token injection, and retired AuraCloset callbacks. `lib/oauth-session.ts` keeps PKCE and provider-error behavior independently testable without importing React Native.
- **Legacy cleanup:** server relay and reset fallbacks accept `amodka://` rather than `auracloset://`. Legacy AsyncStorage keys remain only in one-time migration and account-deletion cleanup so prior development preferences are copied safely, not silently dropped.
- **Build limitations:** no native build, external provider configuration, signing, deployment, store submission, migration, or secret change occurred. See `docs/PHASE-5C.2-NATIVE-PRODUCTION-FOUNDATION.md` and `docs/PHASE-5C.2-MANUAL-ACTIONS-REQUIRED.md` for evidence and owner actions.

## 23. Phase 5C.3 Track B — Independent African Fashion Benchmark Package

Documentation-only phase. No production code changed; Engine v3.7 remains frozen and the golden regression suite is untouched. The deliverable is a reviewer-ready gold-standard benchmark package in `docs/recommendation/africa/benchmark-v1/`.

- **100 cases:** 40 women-focused garment-classification (GU), 30 outfit-ranking (OR), 20 occasion-distinction (OC), 10 weather/context (WX). Amodka v1 is explicitly women's fashion: the former men's GU-33–GU-40 descriptions are quarantined for a future v2 men's-fashion benchmark, replaced by eight women's cases covering aso-oke, wrapper construction, embellishment/embroidery, grand boubou, adire, kente, and gele evidence gaps. Case files are written neutrally — no engine rules, thresholds, predictions, Amodka taxonomy mappings, or developer conclusions — so an independent Nigerian/African fashion reviewer can label them without contamination.
- **Fixture catalogs (two-tier):** the reviewer-facing `fixtures.md` carries only descriptive facts (ID, category, sub-type, pattern, scale, fabric, colour) so no author-assigned occasion/formality/warmth judgement can steer the reviewer. The fully typed runner catalog with those implementation attributes lives in `internal/runner-fixtures.md` for Track C only. `scripts/validate-benchmark-fixtures.mjs` deterministically verifies catalog row-for-row consistency, the absence of evaluative columns in the reviewer catalog, that every case references only defined IDs, and that every outfit fingerprint is sorted and matches its component list.
- **Reviewer package boundary:** defined in `internal/README.md`. The reviewer receives only the neutral case files, fixtures, rubric, instructions, and label forms. `scenarios.md`, `governance.md`, `results-template.md`, `benchmark-execution-protocol.md`, and everything in `internal/` are withheld until labels are signed and locked.
- **Internal post-lock material:** developer analysis was moved out of reviewer-facing files into `internal/gu-taxonomy-analysis.md` (provisional Amodka mappings + suspected representation gaps) and `internal/case-design-intent.md` (what each case probes and expected v3.7 behaviour). Pre-governance draft rankings are quarantined in `internal/non-gold-drafts/` and are never gold labels.
- **Governance:** gold labels require an independent qualified reviewer; labels, benchmark inputs, engine outputs, and evaluation results live in separated data stages; the engine never reads gold labels before its output is recorded. Track C (benchmark execution) is blocked until labels are locked and the Product Owner approves.
- **Final validation and freeze (2026-09-10):** the supplied signed JSON/CSV and all 40 supplied synthetic GU images were copied unchanged into `frozen-v1/` with a machine-readable manifest and SHA-256 checksums for 53 input files. The deterministic validator now checks the 100-case distribution, all required gold fields, ranking completeness, acceptability partitions, pairwise direction, reviewer-score/utility consistency, CSV/JSON agreement, image/provenance mapping, anti-contamination keys, quarantine boundaries, and every frozen-file checksum.
- **Evidence statement:** “Expert-reviewed gold benchmark — single reviewer; IRR not performed.” The repository does not claim independent verification of Arena.ai licence terms. It records the Product Owner's supplied authorization and preserves the original pre-image `PENDING` provenance table as superseded history.
- **Reviewer-provenance exception:** the frozen JSON's own `reviewer_note` calls the labels an “Assistant-produced expert gold-label draft,” which conflicts with the governance requirement for an independent qualified reviewer. The supplied labels remain authoritative and unchanged per the final-validation specification, but Product Owner attestation/reconciliation is required before Track C. Track C was not executed.
- **Reviewer-independence attestation (2026-09-10):** the Product Owner separately confirmed that `AFBM-EXPERT-01` was a qualified independent human Nigerian/African fashion reviewer, with private qualification and independence evidence retained outside the repository. The attestation does not alter the frozen snapshot or gold labels. A later Product Owner-supplied Track C specification explicitly authorized baseline execution.
- **Coverage corrections:** strict source-grounded counts are 16 lace cases (OR-25 contains no lace) and 3 gele cases (GU-32 and GU-39 are Kente stoles, not gele). `scenarios.md` was corrected without changing any active case.

## 24. Phase 5C.3 Track C — Frozen v3.7 Nigerian/African Baseline

Track C executed the authorized 100-case `frozen-v1/` benchmark without changing Recommendation Engine v3.7, its weights, taxonomy, existing golden set, or the frozen benchmark.

- **Execution boundary:** GU-01–GU-40 called the unchanged production garment-classification handler with each frozen image. OR/OC/WX fixed candidates were scored with unchanged item/profile and combination scorers; the unchanged full generator was also called and exact candidate fingerprints were recorded separately. Gold was not loaded until all 100 case files and the summary were written, SHA-256 sealed, verified, and made read-only.
- **Execution status:** 100 attempted, 94 successful, 6 failed, 0 skipped. All six failures were GU classifier refusals/failures affecting a headwrap, gele, wrapper, coordinated set, stole, or headpiece.
- **Primary context metrics:** 50.0% top-1, 95.0% top-3, 66.3% supported pairwise agreement, 7.4 mean regret, 25 max regret, and 0.315 mean Kendall's tau across OR/OC/WX. Weather was weakest at 30.0% top-1 and 12.7 mean regret.
- **Garment metrics:** 37.5% semantic garment-type agreement and 49.8% mean supported-dimension agreement. Broad category was 87.5% on the 32 gold types with deterministic category inference; fabric 65.0%, pattern 47.5%, scale 27.5%, and colour 47.5%.
- **Candidate generation:** 29/232 benchmark candidates appeared as exact full-generator fingerprints; 21/60 cases had any exact match, 17/60 had empty production pools, and no fallback path activated. Fixed-candidate ranking and full-generator support are reported separately.
- **Focused findings:** OR-13–OR-20 Ankara pairing reached 62.5% top-1 and 100% top-3. Cultural terminology, guardrails for traditional accessories/multi-piece garments, matching-fabric identity, diaspora context, and weather-sensitive ranking remain material gaps.
- **Decision:** final report recommendation **C — Material recommendation gaps require remediation before Nigerian/African launch**. This is supported by six unusable classifications, nine clearly inappropriate top-ranked outfits, weather weakness, and representation gaps—not by one arbitrary metric threshold.
- **Artifacts:** `docs/recommendation/africa/track-c/baseline-v3.7/` contains the execution manifest, sealed raw outputs, machine-readable metrics/CSVs, dedicated analyses, reproducibility and safety records, test results, and the 26-section final report.
- **Verification:** pre- and post-evaluation `npm test` and typecheck passed; lint passed with 0 errors and 31 pre-existing warnings; benchmark, frozen checksums, raw seal, dedicated Track C validation, and frozen-diff gates passed.
- **Safety:** no database, Supabase, RLS, Storage, authentication, entitlement, payment, FASH, deployment, production user data, or production configuration operation occurred.

## 25. Phase A — Co-ord / Garment Group Infrastructure

Phase A adds a relationship layer without changing the identity or runtime shape
of `WardrobeItem`. `garment_groups` stores relationship type, confidence,
confirmation status, evidence, and an optional durable source-image path.
`garment_group_members` links those groups to existing wardrobe items.

- **Ownership:** both tables carry `user_id`, use explicit
  `auth.uid() = user_id` RLS policies, and use composite foreign keys so a group
  cannot reference another user's garment.
- **Multiplicity:** `(group_id, garment_id)` prevents duplicate membership while
  allowing one garment to participate in multiple groups.
- **Persistence:** authenticated clients use the Supabase-direct functions in
  `lib/database.ts`. Initial group and membership creation is one
  security-invoker database transaction.
- **Lifecycle:** garment deletion cascades only its memberships; group deletion
  cascades memberships but never wardrobe items; deleting the final membership
  removes the empty group.
- **Source images:** no source-image table, bucket, or upload flow was added.
  `source_image_path` reuses the private `wardrobe-images` durable-path
  convention and must never contain a signed URL.
- **Guest mode:** local group persistence and guest-to-account reconciliation are
  deferred.
- **Engine isolation:** groups are not loaded into AppContext or mapped onto
  `WardrobeItem`; Recommendation Engine v3.7 remains group-unaware.
- **Deployment:** the migration is forward-only and must be applied separately
  to the externally hosted Supabase project after review.

## 26. AUTH-1 — Account deletion correctness

Both the authenticated in-app endpoint and the OTP-verified public deletion
endpoint use the same Storage → application tables → Auth deletion sequence.
Each Storage list/remove, table delete, profile delete, and Auth delete checks
the provider's returned error; exceptions also stop the sequence. Storage
objects are listed in pages before removal, and each bucket is checked again
afterward. Unexpected folder entries fail closed rather than being skipped.
Auth deletion only runs if all prior cleanup succeeds.

Failure responses do not assert that nothing was deleted: earlier steps may
have completed. Repeating the cleanup against an account that still exists
is safe for empty buckets and already-removed rows. The OTP web path requires
a new verification code to retry. The in-app client clears its local cache
and signs out only after explicit server success; if device cleanup fails
after confirmed deletion, it reports that separate failure truthfully.
No database transaction or rollback is implied, and no production data or
Supabase settings were changed. `__tests__/accountDeletion.test.ts` injects
failure at every stage for both routes and verifies partial-cleanup retries.

## 27. AUTH-2 — Sign-up and password-recovery correctness

The sign-up route returns a privacy-equivalent acknowledgement rather than
claiming that an account was created or email was delivered, except for the
explicitly approved, rate-limited duplicate-account disclosure: provider codes
`email_exists` and `user_already_exists` return HTTP 409
`{ success: false, reason: "account_exists" }`. The selected Supabase project
was probed with a disposable confirmed synthetic account and returned
`user_already_exists` (422); the probe account was deleted. If confirmation
settings or provider behavior change to obfuscate duplicates, the app cannot
reliably disclose this state without another provider signal. Unstructured
provider errors without status/code still fail closed as retryable service
errors. Sign-in remains non-enumerating: wrong passwords and unknown emails
both return `invalid_credentials`; provider outages and unstructured errors
remain retryable and do not count as failed passwords. Client sign-in/sign-up
and Google/Apple failures use a typed `AuthError` code-to-copy catalogue; raw
server/Supabase text is never rendered. Non-JSON proxy responses map to
`network`. The shared glass notice is accessible, scrolls into view, clears
when fields or mode change, suppresses OAuth cancellation, and offers only
catalogue-defined actions. Resolved Supabase errors are reported as fixed,
allowlisted observability metadata; raw provider messages and account details
are not logged. Invalid supplied redirect URLs fail rather than silently
switching a web request to a native callback.

The web recovery route exchanges its own PKCE code (automatic URL exchange is
disabled on that route only), like native recovery. The password form remains
unavailable until code exchange and claims verification succeed; invalid links
offer a route to request another. Confirmation requires a non-null exchanged
session, and callback failures have an actionable sign-in path. Password-update
provider failures use a fixed user-facing message. No provider configuration,
database, Storage, migration, or engine behavior was changed. Live email
delivery and device callback behavior still require separate verification.
The two AUTH-2 handoff screens are also covered by a mounted, isolated
`react-test-renderer` test (test-only dependency matching React 19.1).

## 28. AI image-processing consent

New AI-image requests use an account-level three-state preference in Supabase
Auth app metadata: absent/invalid means not asked, and only explicit `allowed`
permits processing. The Express account API reads/writes the authenticated
user's preference through the server-only Auth admin client; the server checks
the current stored value before both Gemini routes and the PhotoRoom route.
Metadata reads/writes that fail deny processing; no client-only preference can
authorize an AI request. The shared five-per-hour account limiter protects
preference writes, not the photo-by-photo read endpoint.

For a signed-in account with a confirmed `not_asked` response, Profile displays
the preference switch OFF. The state remains `not_asked` until the user makes
an explicit choice. An explicit `allowed` choice displays ON and `declined`
displays OFF; both persist in Auth app metadata across devices and sessions.
A malformed preference API response or unavailable read displays OFF; invalid
stored metadata is still denied by the server. All provider routes remain
blocked until the user accepts the existing first-use disclosure. Changing the
switch alone does not send or reprocess any photo.

Add Item retains the selected camera or single-library photo for manual entry
or explicit AI retry; multiple selected library photos go to Bulk Review.
Bulk Review pauses its timers until the account state is allowed and retains
the selected URIs on screen if declined. The Profile Privacy switch reads the
account setting when focused; turning it off affects future processing only,
without deleting wardrobe data, and turning it on does not trigger processing
of existing photos. The consent surface uses the counsel-approved wording
and exposes a Learn more boundary; the View Privacy Policy link remains
disabled until a real published destination is supplied. Existing saved
items have no safe in-place reprocessing route, so this change does not
silently send older stored photos to AI.

No Supabase schema or provider setting was changed. Mounted server consent
tests use test-only overrides; no live AI or Supabase data calls are required.

## 29. RevenueCat billing rollout boundary

The repository billing integration uses one `amodka_premium` entitlement for
monthly and annual App Store / Play Store subscriptions. Authenticated Supabase
user IDs are RevenueCat App User IDs. Store prices and trial details come from
the current offering, not application constants. The native purchase and
restore screens do not set Premium locally: after a provider operation, the
authenticated server reconciles with RevenueCat, and the app re-reads the
server-authoritative entitlement. Customer Center handles store management
where available. Expo Go is only a non-purchase preview.

The repository migration `supabase/migrations/20260930000000_revenuecat_billing.sql`
is **not applied to production**. It establishes protected billing records,
idempotent event processing, subscription/transaction facts, reconciliation,
and deletion tombstones. The Express webhook verifies RevenueCat's HMAC over
the raw body before parsing, checks a five-minute signing-time window, and
persists normalized event facts without retaining raw purchase payloads.
The Customer API snapshot can revoke an existing store-identified ledger
subscription and recover a uniquely matched subscription that it previously
revoked; it cannot create a new Premium grant without a verified webhook
transaction or reactivate a refund/revocation. Older snapshots and delayed
events are fenced. Purchases remain
unavailable unless an authenticated server readiness check confirms the
activation switch, server configuration, and migration schema.
The existing B2.8 wardrobe limits and retained-item policy are unchanged.

Rollout order matters: apply and verify the repository migration separately,
configure monthly and annual store products (including the three-day store
trial) and attach them to `amodka_premium` in RevenueCat, then configure the
webhook with HMAC signing. Supply the four client public product IDs
(`EXPO_PUBLIC_REVENUECAT_IOS_MONTHLY_PRODUCT_ID`,
`EXPO_PUBLIC_REVENUECAT_IOS_ANNUAL_PRODUCT_ID`,
`EXPO_PUBLIC_REVENUECAT_ANDROID_MONTHLY_PRODUCT_ID`,
`EXPO_PUBLIC_REVENUECAT_ANDROID_ANNUAL_PRODUCT_ID`) and public SDK keys
(`EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`,
`EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`). Configure the corresponding
server-side `REVENUECAT_IOS_MONTHLY_PRODUCT_ID`,
`REVENUECAT_IOS_ANNUAL_PRODUCT_ID`,
`REVENUECAT_ANDROID_MONTHLY_PRODUCT_ID`, and
`REVENUECAT_ANDROID_ANNUAL_PRODUCT_ID`, plus server-only
`REVENUECAT_WEBHOOK_SECRET` and `REVENUECAT_SECRET_API_KEY`. The entitlement
identifier is fixed at `amodka_premium`. Enable server billing with
`REVENUECAT_BILLING_ENABLED=true` **only after** the migration and provider
configuration are ready; otherwise the existing protected profile projection
remains the entitlement source. Never put the webhook or REST secret in an
Expo-public variable. Keep RevenueCat's restore/transfer behavior configured
to retain purchase ownership with its original Amodka account.

Real purchase and restore verification requires an iOS/Android native
development or store build and configured store sandbox products; no Expo Go
preview is evidence of a real purchase. Account deletion must warn that it
does not cancel a store subscription and leave a billing tombstone so late
provider events cannot restore deleted-account access.
If deletion fails after tombstoning, the account remains quarantined and a
retry resumes deletion rather than re-enabling billing; do not describe that
partial failure as a fully deleted account.

## 30. African garment classification and multi-piece upload

Add Item defaults to the unchanged single-piece upload. Users may explicitly
choose “Several pieces in one photo” before picking one image; that choice
routes to a 2–6-piece review instead of making both classifier requests.
The review checks the stored AI-processing preference, requires sign-in, sends
the image to the existing consent- and rate-limit-protected multi-item
endpoint, crops each detected region into its own image, and asks the user
to confirm at least two independently wearable pieces and their relationship.
Only confirmed members upload. Each member is saved with its own image and
normalized classification, not as a single combined wardrobe item.

`insert_wardrobe_group_items` is an additive, authenticated-only transaction
wrapper around the existing quota-enforcing `insert_wardrobe_items` RPC and
the existing `create_garment_group` RPC. Group and member rows are committed
together or neither is; the existing group security and single-item insert
contracts remain unchanged. The group is `user_confirmed`, not merely
AI-inferred. The nullable per-row fabric, fit, pattern and pattern-scale
columns retain their values through inserts and hydration; legacy NULLs
remain undefined. Persisted image paths are retained alongside display URLs
for signed-URL renewal. These migrations are repository files only and have
**not** been applied to production; multi-piece saves require them on the
target Supabase database.

The single classifier prompt now identifies supported gele, wrapper and
structured-headwear cases more specifically, without changing its content
guardrails or inventing an unsupported Kente-stole subtype. Unexpected
internal 500s carry an allowlisted code; malformed provider JSON is a bounded
502, not a partial success. These diagnostics do not explain the historical
GU-17 500. Both classification calls have a finite 45-second client deadline
to allow the server's bounded primary/429-fallback provider attempts; other
API calls keep their 15-second deadline.

`scripts/syntheticGuProviderV1.ts` is opt-in and off by default. When
explicitly enabled it reads the existing frozen synthetic GU images, calls
the real classifier, compares results to read-only gold *after* the call,
and writes a separately versioned report under `artifacts/synthetic-gu/`.
It does not evaluate rights-cleared real photographs. Neither Kente taxonomy
nor real-image accuracy is settled by these offline tests or synthetic images.
The Recommendation Engine v3.7 remains unchanged. Track C root
`case-results.csv` was restored to the original 100-case result snapshot from
`b744f83` after later result commits had appended repeated case records. Its
100 unique IDs and the Track C validator now pass; the sealed raw case outputs
and their checksums are unchanged.

## 31. Private real-image evaluation reliability and privacy

`scripts/privateRealPhotoEvaluation.ts` is an offline/private evaluation CLI,
not a new production endpoint. Its manifest allows only the documented keys at
every object level, with scalar metadata values; extra or nested reviewer/gold/
context objects are rejected. The runner validates the manifest on entry and
rechecks the exact freshly read image buffer's SHA-256 immediately before each
classifier submission. A mismatch aborts before that case reaches the provider.
The adapter receives only those verified bytes and MIME, never gold or context.

Supported crosswalk mappings use a strict schema over the known normalized
scalar output fields. A typo, unknown field, or transient `wearPosition` is
rejected, rather than becoming an ordinary classifier error in accuracy.
`outcome` maps only to the classification/refusal outcome. Unsupported and
unrepresentable labels stay outside the accuracy denominator. Existing signed
test authorization, run attestation, reviewer/adjudication checks, and the
separate `real-image-classification` report namespace are preserved.

Add Item uses `classificationImagePayload` in `lib/classifyPath.ts` to identify
JPEG/PNG from the submitted base64 byte signature and send `imageMimeType`.
It does not infer MIME from the original picker filename or silently label PNG
as JPEG; an unknown format follows the existing manual-entry error recovery.
Colour correction still operates but no longer logs image-derived values.

Production retains the rolling `gemini-flash-lite-latest` primary and its
existing quota-only fallback. The earlier GU-17 reproduction explicitly
requested `gemini-2.5-flash-lite` and returned provider 404 before classification;
this was not a permanent production pin and does not establish the historical
2026-09-10 HTTP 500 cause. See `docs/classifier-gu17-forensics.md`.

The nine Kente/stole case shapes are unchanged. No real photographs, populated
gold, provider-backed accuracy run, or measured recognition result is supplied
by this infrastructure. Human-verified processing rights/consent, independent
adjudicated gold, and locked splits remain prerequisites for evidence generation.
Offline checks are in `__tests__/privateRealPhotoEvaluation.test.ts` and
`__tests__/gu17Diagnostics.test.ts`. No database or protected benchmark change
is required.

## 32. P0.1 — Canonical garment semantics and progressive Add Item review

Recommendation inputs belong to individual wardrobe rows, never group shared
attributes. Existing identity/colour/occasion and normalized fabric/fit/pattern/
pattern-scale columns remain authoritative. The additive migration
`supabase/migrations/20261012000000_canonical_wardrobe_semantics.sql` adds one
nullable, bounded, validated `recommendation_semantics` JSONB column for:

- Accent colour, perceived weight, neckline, sleeve length, rise, warmth band.
- Explicit optional formality, seasons, accessory metal tone, HSL and Lab.
- Explicit user-correction field names, including intentionally cleared unknowns.
- The already-existing purchase-price edit, retained for cost-per-wear rather
  than falsely reporting a cloud save of an unsupported local-only value.

The pure serializer/validator and mapper preserve supplied values exactly.
Legacy NULL metadata hydrates without invented fabric, weight, formality,
season or detail values. Guest hydration no longer stores guessed material/
weight backfills. Add Item no longer fills absent garment details from generic
subtype guesses, and bulk saves no longer invent all-season tags.
Deterministic perceptual colour derivation is distinct from
claiming a user confirmed an unknown garment attribute.

The existing authenticated single, bulk and group insertion boundaries and
full replacement receive the same serialized semantics. The multi-insert RPC
retains ownership, advisory-lock, entitlement, capacity, free-selection and
atomicity behavior. Direct table INSERT remains revoked; saved-item semantic
UPDATE remains owner-filtered and protected by existing RLS. The metadata
constraint rejects unsupported keys, invalid enums, types and ranges. No
legacy backfill, group-schema change, storage-path change or policy relaxation
is part of this migration.

Inline saved-item corrections now await durable cloud (or guest local) storage
before committing canonical state or closing the editor. Failures retain the
old item and expose a retryable error. Overlapping corrections are guarded;
account generation and refresh revision checks prevent a stale account or
refresh from restoring old truth. Colour edits also replace old image-derived
HSL/Lab with the selected family centroid, leaving identity and photo untouched.

Add Item defaults to a compact identity/colour review. “Refine styling details”
reveals optional contextual controls. Pattern/material are available for core
garments, shoes, bags and supported textile accessories; fit/weight/neckline/
sleeve/rise remain garment-contextual; outerwear exposes warmth and accessories
expose metal tone. Iro/wrapper do not require Western rise; stole and existing
headwear retain their textile semantics without changing taxonomy.

Only explicit semantic edits are marked user-corrected. Late classifier results
and subtype suggestions cannot overwrite them, even when the correction is an
intentional unknown. Old-photo responses are ignored. Reprocessing the same
photo preserves corrections and optional formality. AI/provider prompts,
PhotoRoom and consent boundaries are unchanged.

The recommendation algorithms remain frozen: hydration supplies canonical
inputs but does not alter scoring or promise a particular ranking improvement.
In particular, existing v3.7 effective-formality subtype precedence is unchanged.
The legacy phase-3.2 diagnostic script received only erased TypeScript assertions
for its already-fully-populated fixtures, not calculations or benchmark data.
No adapter, Traditional generator, event-context model or later phase is included.

Validation combines real authenticated-role disposable PostgreSQL migration,
round-trip, correction, validation and RLS checks with mounted actual-screen/
database-function contract tests. Mounted tests control the PostgREST boundary;
they do not claim a live-account Supabase end-to-end login. Standard validation
remains `npm test`, `npm run typecheck`, `npm run lint` and `npm run server:build`.

## 33. P0.2 — Canonical wardrobe → Styling Intelligence contract

`lib/stylingWardrobe.ts` exposes one pure, strongly typed
`projectWardrobeForStyling(canonicalItems, optionalPhaseAGroups)` boundary.
Inputs are already-hydrated/saved P0.1 `WardrobeItem` records, not classifier
responses. Existing `SEMANTIC_FIELDS` defines the styling attributes, avoiding
a second field registry or persistence representation.

- `garments`: readonly identity and canonical semantic fields, with exact
  supplied subtype/category/colours, optional signals and unknowns preserved.
  Photo/account/bookkeeping fields, confidence and correction provenance are
  excluded from styling truth. No fabric/formality/season/colour/context
  defaults or subtype aliases are introduced.
- `relationships`: detached readonly existing Phase A `GarmentGroup` records,
  including full memberships, type, confirmation status, confidence, shared
  attributes, source and timestamps. Garment `groupIds` is solely an index of
  those existing memberships. Shared attributes never replace garment facts;
  membership does not imply approval or styling eligibility.
- Omitting groups means relationships and membership are unknown (`undefined`).
  Supplying `[]` means no relationships in the supplied read snapshot. Partial
  wardrobe views retain supplied group members outside the loaded item slice.
- `v37Items`: a detached, lossless, original-order `WardrobeItem[]` compatibility
  snapshot, including existing diagnostic/photo/mood/bookkeeping fields. It is
  deliberately separate from styling semantics so the frozen engine receives
  identical inputs, not invented required-field substitutes.

Current daily-pool and just-added suggestion callers in `AppContext` pass through
this boundary. They are v3.7-only consumers and do not load groups. A relationship-
aware consumer passes existing `getGarmentGroups(userId)` read results directly
as the second argument; the adapter performs no I/O and creates no new group
cache, lifecycle, table, relationship inference or backend service.

African identifiers and supplied wax-print/lace/chiffon signals remain unchanged.
No cultural identity, authenticity, ceremony, participation, required headwear,
traditional context or African/Western intent is inferred. No new derived
styling scores are needed: the existing engine accepts optional fields. Its
read-time interpretations remain frozen and are not canonical garment facts.

Validation is targeted: P0.2 plus P0.1 canonical, Phase A/group and rotation
suites; typecheck and changed-file lint. The new test compares complete pool,
hash, rotation and just-added outputs before/after projection using the existing
golden candidate-generation fixture, without changing frozen fixtures or engine
code. No database migration, provider invocation or later styling feature is
part of this foundation.

## 34. P1.1 — Explicit Traditional styling context

The existing premium Traditional chip now requests a real `traditional`
Styling Intelligence context after wardrobe pagination is complete. Selection
remains local, just like the other scenario chips. Other scenarios retain their
existing `outfitSets` filter and generation path. There is no new setting,
provider request, wardrobe field, taxonomy or migration.

`AppContext.getStylingRecommendations` reads the existing owner-scoped Phase A
groups on demand, projects the active canonical wardrobe and full relationships
through the unchanged P0.2 contract, and calls `traditionalStyling`. Group-read
errors propagate to a retryable screen state, not a silent empty-group fallback.
Account/startup generation guards and a current premium-ref recheck protect
asynchronous reads. Screen cleanup ignores stale/unmounted results.

The deterministic context adapter:

- Gates known core formality against the existing Traditional band (6–9);
  unknowns remain unknown and full canonical values are never edited.
- Prefers existing African core identifiers, explicit Traditional occasion tags
  and wax-print cores only after the user's explicit selection. Lace/chiffon,
  headwear and all other garment semantics are preserved, not evidence of an
  inferred ceremony, cultural identity, participation or required headwear.
- Prefers stronger core options category-wise, allows owned Western supports
  and appropriate Western core complements, and falls back to valid eligible
  owned occasion-ready pieces with an explanatory notice when necessary.
- Keeps every user-confirmed `coordinated_set` all-or-none, including when a
  member is absent from the active wardrobe. AI-inferred/rejected relationships
  are not upgraded to confirmed truth. Layered metadata survives without an
  invented wearing order or inherited garment fields.
- Uses the existing v3.7 wedding evaluator as a compatibility bridge with the
  same 6–9 band, then the existing event evaluator as a broader fallback.
  This is an evaluator choice, not wedding/ceremony intent inference.
- Filters integrity/anchor eligibility without reranking. It isolates the
  bridge pool before unchanged daily rotation: otherwise cross-scenario
  fingerprint deduplication can consume its results in an earlier generic slot.
  Existing weather, mood, affinity, wear history, cursor state, freshness and
  premium slot count are passed through unchanged. No parallel ranking or
  rotation state is created.
- Relabels selected outputs to `traditional-event` only for presentation, with
  stable owned-component-derived IDs; canonical identities and explanations
  remain intact.

The UI displays the explicit African-first context, generated owned cards,
loading, retry, and honest compatibility/wardrobe gaps using existing patterns.
No missing piece is synthesized, and headwear is never required.

**Frozen compatibility limitation:** v3.7 still interprets the kaftan subtype
with resort-level formality, even when canonical formality is higher. A wardrobe
containing only that core and formal supports may produce a gap. Neither a
Western alias nor falsified canonical formality is used to hide this limitation.

Focused fixture evidence: a confirmed buba + iro set with Western alternatives
produces intact Traditional candidates and actual displayed owned photos;
generic generation still equals the direct pre-context v3.7 output. Focused
context/screen tests, relevant P0.1/P0.2/group/rotation regressions, typecheck and
changed-file lint are used; the unchanged v3.7 golden regression passes 35/35.
No Track B/C fixtures or benchmark definitions are changed.

Browser validation at 402×874 also passed using synthetic session/HTTP fixtures
through the real AppContext: generic Casual remained Western-led and unselected;
explicit Traditional rendered the owned buba + iro photos together with Western
supports; a controlled group-read HTTP 500 displayed retry rather than a false
wardrobe gap, and retry recovered the real generated card. No cloud mutation or
billing/AI-provider request left the fixture interceptors. This is browser
integration proof, not live-auth, billing, provider or database verification.

## 35. P1.2 — Relationship-aware candidate construction

`stylingRelationships` adds a transient typed view on top of the unchanged P0.2
projection. The original garment facts and full Phase A records remain intact.
Units expose existing type/status/member IDs plus available/missing membership;
unloaded relationships remain undefined. The live Traditional caller supplies
the authenticated owner ID. Foreign-owner groups, inconsistent member ownership
or parent IDs, and duplicate membership are excluded from the usable view
without rewriting source records. Missing members never become owned garments.

The existing P1.1 Traditional adapter now constructs eligible input cohorts for
complete user-confirmed coordinated units before calling v3.7. Membership pins
occupied category slots; a complete dress or top/bottom core excludes unrelated
core alternatives in that cohort. Other owned categories remain available as
complements. This construction uses relationship records, not garment-name,
colour, print, shared-attribute or cultural-association pairing rules.

Each cohort is evaluated and ranked by unchanged `generateOutfitPool`. Existing
integrity/anchor checks remain in place. Successful set cohorts are preferred
over arbitrary pairings; their engine-ranked sequences are combined in supplied
group order with identical owned combinations deduplicated. There is no
cross-cohort scoring formula, relationship bonus or changed ranking weight.
The existing occasion bridge and isolated daily-rotation path are reused.
If no viable coordinated cohort survives the frozen constraints, normal P1.1
preferred/fallback construction remains available. Thus a coordinated set is
not mandatory, and generic styling does not acquire Traditional's all-or-none
requirement or an additional group-read lifecycle.

Layered and multi-item links retain membership/type/status without becoming
coordinated constraints, inherited attributes or inferred wearing order.
Selected outfits carry transient usage provenance for participating available
members of all three types. Only a fully used, user-confirmed coordinated set
gets the small accessible **“Styled as a set”** cue on the existing card.
No large UI section, cultural label or mandatory headwear is introduced.
Saved-look and wear persistence still store their existing IDs/timestamps/item
IDs only; this provenance is not a durable derived relationship record.

**Exact candidate-level change:** with six equally compatible standalone
iro-shaped bottoms preceding the linked iro, ordinary frozen generation chooses
standalone bottoms and misses the real partner in its limited shortlists.
Supplying the confirmed buba–iro relationship creates a pinned input cohort, so
that same engine evaluates and returns the real buba + iro with Western
shoes/bag. Removing the relationship removes this benefit; renaming garment
subtypes while retaining explicit occasion tags and membership still works.
No frozen benchmark or golden fixture is edited to accommodate the change.

Validation: ten targeted P1.2/P1.1/P0.2/P0.1/Phase A/rotation suites passed,
typecheck passed, changed-file lint has zero errors and 20 pre-existing
warnings, and the frozen v3.7 golden regression passed 35/35. Browser integration
at 402×874 used a 15-row synthetic HTTP/auth fixture: the confirmed relationship
produced BUBA + IRO and the set cue despite six earlier decoys; returning no
groups and reselecting Traditional instead produced BUBA + DECOY IRO 3 without
the cue. This verifies real AppContext integration against controlled responses,
not live authentication/cloud/billing. All outbound mutations/providers were
intercepted or blocked. No database, migration, dependency, taxonomy, provider,
authentication, entitlement or protected engine changes are part of P1.2.

## 36. P1.3 — Today-only occasion Concierge

**Scope:** signed-in Premium users can select Work (`work`), Dressy date
(`date-dressy`), Event (`event`), Wedding (`wedding`) or Traditional occasion
(`traditional-event`). The first four are in the actual frozen generator's
`SCENARIOS` loop and construct candidates from a supporting owned test wardrobe.
Traditional is deliberately outside that loop and uses the existing explicit
Traditional service. Support means a verified styling path, not a guaranteed
look for every wardrobe or daily rotation.

**Integration:** a restrained Outfits entry opens `components/OccasionPlanner.tsx`
as a safe-area-aware, scrollable modal. Keeping the planner in the results
screen avoids a new route, route parameters, navigation tab, card implementation
or generator. `lib/concierge.ts` owns only the small allowlist, transient intent
validation and readiness-state precedence. Accepted generic intents select
the exact existing `outfitSets` scenario output. Traditional invokes
`getStylingRecommendations('traditional')`, retaining the existing owned group
retrieval, canonical projection, relationship-aware construction, rotation,
explanations and confirmed coordinated-set cue. Layered/multi-item relationships
are not advertised as construction constraints. Existing wear, reaction and
sharing actions remain on existing cards.

**Access:** opening and submitting each perform
`refreshPremiumEntitlement(true)`. The new opt-in argument rejects failed,
missing-session and superseded refreshes; existing callers retain the default
fail-closed boolean contract. This is a client error-contract extension, not
an authentication, server authority or billing change. Confirmed non-entitlement
uses the existing Premium screen; unavailable verification pauses selection
with retry; guests use the existing sign-in screen. Results additionally require
the current signed-in owner, Premium state and no entitlement-unavailable flag.

**Lifecycle and readiness:** transient request versions and owner checks ignore
late verification; the existing Traditional effect ignores late styling responses.
Account changes, tab blur, closing/exiting and manual scenario selection clear
Concierge intent. Same-occasion Traditional submission clears old results and
starts a new request. Generic results remain the existing reactive scenario
output, without generating a competing pool or advancing quota/rotation.
Readiness distinguishes loading/incomplete pagination, retrieval failure,
successfully loaded empty active wardrobe (insufficient), successful nonempty
wardrobe with no viable output (empty), and returned results (ready). No weather
readiness summary is shown while loading/failing; available weather is formatted
with the existing Celsius default/explicit Fahrenheit preference. Switched-off
or absent weather is stated honestly.

**Boundaries:** no planning persistence, profile/mood/history/saved-look writes
from selection, provider or forecast calls, taxonomy changes, schemas/migrations,
subscription changes, engine/scoring/ranking/affinity/rotation/weather-decision
changes or benchmark changes. Packing/travel capsules, future dates, destination
weather, chat, commerce, notifications and virtual try-on are not included.

**Verification:** focused Concierge, styling/relationships, entitlement/ACL,
canonical UI/serialization, rotation and temperature/weather suites; actual
refresh-body strict/default contract tests; typecheck; changed-file lint;
unchanged v3.7 golden regression. The accompanying P1.3 report records the exact
validation results and mobile browser evidence/limitations.

## 37. P1.4 — Session-only Packing & Travel Capsule Concierge

`app/(tabs)/outfits.tsx` adds a separate **Plan a travel capsule** entry alongside
the unchanged occasion planner. `components/TravelPlanner.tsx` owns only
component-local session state and access/read lifecycle; `TravelPlannerView.tsx`
is the safe-area-aware scrollable modal. No new route, provider or storage key.
Trip length is 1–7 ordinal days, with up to 28 explicitly added activity slots.
Activities map exactly to casual, work, date-dressy, event, wedding, travel,
resort, active, or traditional-event. Other/unsupported activities may be
recorded but stay unfilled. Coverage counts assigned versus total activity slots,
not implied complete day coverage. Removing slots changes that denominator.

`lib/travelCapsule.ts` is a pure orchestration boundary. Generic choices are
only exact scenario matches in public `outfitSets`; the private pool is neither
read nor exposed. Traditional calls only the existing dedicated
`getStylingRecommendations('traditional')`, preserving notices and transient
relationship provenance. No future-date simulation, cursor advancement,
reseeding, hidden-pool reconstruction, backfill or new generator is introduced.
Look identity is scenario plus sorted unique owned IDs, not daily array IDs.
Using an already assigned look in another slot requires the explicitly labelled
reuse action. Reusing clothing creates no wear event.

Every component must be marked owned and reference an item in the current
active wardrobe. The checklist uses current wardrobe objects, deduplicated by
actual item ID; optional documents/chargers/toiletries remain a separate list.
Generic coordinated-set disclosures use owner-scoped Phase A group reads and
the existing relationship projection: full participation is stated as membership,
not relationship-aware construction; partial use states included/total members.
No similarity inference, inherited semantics or generic all-or-none rule.
Traditional partial confirmed sets and stale provenance are rejected, not repaired.

Entry, selected-slot retrieval and assignment use strict fresh authoritative
Premium refresh; confirmed denial clears protected state and differs from failed
verification. Complete startup/wardrobe pagination is required. Group reads are
retryable failures, never silently `[]`. Traditional requests reconcile group
snapshots before/after the service. Assignments revalidate against current inputs;
account/wardrobe/catalogue/profile/weather changes invalidate choices. Account
changes and confirmed entitlement loss reset the entire draft, including days,
activities, assignments, checklist ticks, essentials and candidate/notice state.
Verification failure pauses protected review without treating AppContext's
temporary Free-tier projection as a wardrobe edit. The planner retains the last
authorized catalogue revision alongside the underlying full wardrobe revision;
actual wardrobe/catalogue changes still invalidate choices. Recovery waits for
React's restored Premium projection, then revalidates every assignment's owned
IDs, current public candidates and relationships before reopening review.
Assigned Traditional looks are revalidated through the same dedicated service,
even when the selected slot is generic. Invalid selections are discarded.
Wardrobe retry success and failure callbacks check mounted state, owner, request
version and revision; superseded completions cannot alter current access.
Request revisions also reject superseded/late styling responses.

A read-only 30-second group poll detects external membership edits; foreground
rechecks authority/groups. Membership changes clear assignments; failed reads
pause review with retry. This is bounded polling, not instantaneous realtime.
Polling does not call entitlement or styling services. Normal AppContext
hydration/entitlement/rotation effects retain their pre-existing lifecycle; the
planner never invokes mutation or persistence APIs for planning/checklist actions.
Dismissal, navigation blur and unmount discard the temporary draft.

No destination or calendar dates are collected. Current recommendations may
reflect the existing current-weather inputs but are not destination/future-day
styling. Finite daily results can leave any supported activity unfilled; this is
not called a wardrobe gap. There is no capsule optimisation or completeness
guarantee. No engine, Phase A schema/security, provider, dependency, migration or
saved-look/wear/mood/reaction/profile persistence change.

Verification and known limits are recorded in `reports/p14-travel-capsule.html`.
Mounted tests run real planner/view code against isolated context/group/native
fixtures; they are not live-account, native-device or screen-reader verification.

## 38. LUXURY GARMENT IMAGE PRESENTATION

`components/GarmentTile.tsx` is the shared renderer for user-owned garment photos
across add, bulk review, wardrobe, detail, outfit, wear-log, OOTD, travel and
multi-item surfaces. It uses a warm neutral gradient, deeper stone for light
garment families, `contain` for cutouts, `cover` for original photos, a floor
ellipse, a hairline frame, recycling keys and reduced-motion-aware transitions.
Bundled example art is outside this shared user-photo path.

The transparent PhotoRoom PNG is the display and storage source of truth. The
single and bulk flows trim transparent padding with a small even margin, write
the PNG to the Expo cache, and retain only its file URI in component state.
Signed-in storage uploads the PNG unchanged to `.png` paths; guest copies use a
local `.png` filename. Original/no-cutout photos remain JPEGs. Gemini requests
carry the real MIME type; `server/classify-garment.ts` composites PNG alpha onto
the neutral `#E9E4DC` matte before forwarding. The image-size, JSON body, quota,
and Photoroom cache-key policies are unchanged.

No persisted cutout flag exists in the current model, so display detection uses
the storage-path extension when available and otherwise the image URI extension.
No schema migration, taxonomy/prompt change, recommendation-engine change or
auth/quota change was made. `reports/garment-image-presentation.md` records the
Step 0 pipeline, implementation, visual matrix and verification limits. The
matte is retained; synthetic pixel tests do not establish real Gemini label
quality or physical-device appearance.

## 39. SCROLL-AWARE SHEET DISMISSAL

`components/SwipeToDismiss.tsx` now captures a downward drag only when the
active vertical `ScrollView` is exactly at offset zero. The Add Item, Premium,
and Item Detail routes update a shared scroll-position ref from `onScroll`;
the responder checks that current ref on gesture capture, every move, and
release, and cancels/reset a drag if scrolling takes control. A downward drag
over 120 px animates the sheet down and fades it out; shorter drags spring back.
Horizontal and upward gestures remain with the content/native navigation.

Each route has an accessible close button with a 44-point target or larger.
Premium’s existing eight feature cards provide a long-scroll demonstration.
The behavior is covered by `__tests__/swipeDismiss.test.ts`. The user later
confirmed the scrolled-versus-top gesture cases on a physical phone; the OS was
not specified. VoiceOver/TalkBack validation remains unverified.

## 40. AUTHENTICATED API CACHE POLICY

`server/noApiCache.ts` applies to `/api` before route handling. It sends
`Cache-Control: no-store` and removes incoming conditional validators so
Express cannot turn an authenticated JSON response into a bodyless `304`.
`authenticatedApiRequest()` treats non-2xx responses as errors, so clients
must receive the authoritative response body. `apiNoCache.test.ts` verifies
that an `If-None-Match: *` request still receives status 200 and JSON.

Entitlement refresh on `TOKEN_REFRESHED` is deferred with a zero-delay timer
after the Supabase auth callback returns. This avoids re-entering Auth through
`getSession()` while Supabase is dispatching the event. The deferred operation
retains account/startup generation checks and is cancelled on unmount.


## 41. RETRYABLE WARDROBE PHOTO CLEANUP

When Undo removes a wardrobe row but its photo deletion fails, the app persists
the cleanup target in AsyncStorage. Authenticated records contain only the
active owner's ID and wardrobe item ID; guest records contain a validated
relative path beneath the current document directory. Retries run only for the
active owner, preserve records belonging to other accounts, and clear successful
records. A failed Undo shows a "Retry cleanup" toast action, and retained work
is also retried after app startup. Guest path checks enforce directory-segment
boundaries and reject traversal; authenticated Storage deletion rejects unsafe
path segments.

## 42. BOUNDED PERSONALIZATION CONSISTENCY

Signed-in profile hydration starts from account-neutral defaults, not the
previous profile or an unscoped signed-in cache. Remote null/unset answers do not
inherit another account's answers; explicit false/zero values are preserved.
Profile state is cleared while the authoritative account read is pending.
Existing account/startup-generation checks still reject stale completions.

Only an explicitly guest-marked local profile can migrate to a blank account.
Direct signed-in account switches cannot nominate a guest snapshot. Migration
and normal profile updates share the existing constraints serializer, including
top-level face shape as `constraints._profile.faceShape`; other constraints and
extended profile keys are retained. A successful hydration replaces the local
guest marker with a signed-in snapshot. A failed migration write is not reported
as success and does not consume the guest cache.

Completing a quiz with no primary style goal saves `classic`, matching the
existing Classic blueprint fallback. Completed legacy quizzes with a missing
goal normalize to Classic on hydration; incomplete quizzes remain incomplete.
The existing startup required-field check is unchanged and shared with tests.

Face shape is included in the pool-input hash. This uses the existing reset path
when personalization changes; no shuffle/selection algorithm, scoring weight,
palette, affinity, candidate generation or weather logic changes. Scorer edits
are comments only. Controlled tests show the existing eye-colour and skin-depth
bonuses are each +1 when supported, and zero in the tested non-match cases.

Verification at implementation time: focused run 6/6 test files (17 new
personalization groups); full suite 106/106; TypeScript and lint passed; golden
set 35/35; benchmark validator passed; frozen checksums 53/53 and raw seals
101/101 passed. Track C's result CSV was subsequently restored to its original
100-case revision; the Track C validator now passes. Account isolation/migration
evidence is offline, using production helpers and extracted actual callback
branches with mocked I/O, not live accounts or device sign-off. See
`reports/personalization-consistency-fix.html` for implementation-time details.
No migration, provider call, dependency change or deployment.
