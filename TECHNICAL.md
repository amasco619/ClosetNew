# AuraCloset — Technical Reference

> **READ THIS FIRST.** This document is the authoritative technical reference for AuraCloset. Any developer importing, migrating, or taking over this project must read this document in full before touching any code.
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
| `SUPABASE_SERVICE_ROLE_KEY` | Yes |
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
Start the **Start Frontend** workflow. It runs Expo with the correct `EXPO_PACKAGER_PROXY_URL` and `REACT_NATIVE_PACKAGER_HOSTNAME` environment variables pre-set for the Replit dev domain. The Expo QR code will appear in the console.

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

**AuraCloset** is a quiet-luxury virtual wardrobe and AI styling assistant for iOS and Android, built with Expo (React Native) and a lightweight Express backend.

- **Tagline:** "Your quiet-luxury stylist in your pocket."
- **Design aesthetic:** Quiet luxury — deep navy (#101826), champagne gold (#D0B892), sage (#8AA39B), blush (#EACFD3), warm off-white background (#F5F3F0). No emojis anywhere in the app. Inter font family throughout.
- **Target platforms:** iOS (primary), Android, with a web preview for development.

---

## 3. Tech Stack

### Frontend

| Technology | Role |
|-----------|------|
| **Expo SDK 53+** | Native app runtime and build toolchain |
| **React Native** | Cross-platform UI framework |
| **Expo Router** (file-based routing) | Screen navigation using `app/` directory conventions |
| **React Native Reanimated 3** | Smooth declarative animations (`withSpring`, `useSharedValue`, `FadeInDown`) |
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
| **Supabase Admin client** | Server-side operations (upgrade-premium, delete-account) using `SUPABASE_SERVICE_ROLE_KEY` |
| **@react-native-async-storage/async-storage** | Session token storage (native) and all offline-first local persistence: wardrobe items, outfit reactions, wear log, blueprint slots, weather cache, affinity data, rotation cursors |

### AI & External APIs

| Technology | Role |
|-----------|------|
| **Google Gemini API** | Garment classification from photos. Primary model: `gemini-flash-lite-latest`. Fallback model: `gemini-2.5-flash` (used when primary returns 429). Requires `GEMINI_API_KEY`. |
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
│   POST /api/extract-color     (colorLimiter: 30/min)    │
│   POST /api/user/upgrade-premium (accountLimiter: 5/hr) │
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
3. On redirect, `createSessionFromUrl()` extracts tokens from URL and calls `supabase.auth.setSession()`
4. Session tokens are stored in `expo-secure-store` on native (iOS Keychain / Android Keystore) via `SecureStoreAdapter`. They are **not** in `AsyncStorage`.
5. For email auth: `signInWithEmail()` calls `supabase.auth.signInWithPassword()` directly
6. `AppContext` listens to `supabase.auth.onAuthStateChange()` for **subsequent** events only — `INITIAL_SESSION` is intentionally excluded (see Startup Initialization below)

### Startup Initialization (deterministic, race-free)

On cold start, `AppContext.loadData()` is the single owner of the initialization sequence:

1. Read all AsyncStorage keys in one `Promise.all` (wardrobe, profile, slots, reactions, wear log, etc.)
2. Call `supabase.auth.getSession()` — a local SecureStore read, not a network call
3. If a session exists: call `loadUserDataFromDB(userId, authName, localSnap)` inline and await completion
4. `setAppReady(true)` in the `finally` block — guaranteed to fire after all data is settled
5. `app/index.tsx` gates all routing on `appReady: true` from AppContext

`INITIAL_SESSION` is **not** handled in `onAuthStateChange` because `loadData()` already covers it via `getSession()`. Handling it in the listener as well would recreate the race (`appReady` could fire before the DB load triggered by the listener finished). The listener only handles `SIGNED_IN` (subsequent logins after OAuth/email confirmation) and `SIGNED_OUT`.

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
8. User reviews and confirms; **`expo-image-manipulator` resizes the original to ≤1600 px** (JPEG, 0.85 compress) before uploading to Supabase Storage — reduces storage payload from 6–12 MB to ~300–600 KB with no visible quality loss in thumbnails

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
  SwipeToDismiss.tsx     Android swipe-to-dismiss gesture wrapper with drag handle (no-op on iOS/web)

contexts/
  AppContext.tsx          Entire app state: profile, wardrobe, premium, blueprint slots,
                         outfit reactions, wear log, affinity, rotation cursors

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
  carouselUtils.ts       Carousel layout utilities for bulk-review grid

server/
  index.ts               Express server entry (port 5000, 10mb JSON body limit)
  routes.ts              Route registration (classifyGarment, removeBackground, extractColor, upgrade, delete)
  classify-garment.ts    POST /api/classify-garment — Gemini classifier
  remove-background.ts   POST /api/remove-background — Photoroom background removal; 15 s AbortController timeout; error codes from shared/photoroom-error-codes
  extract-color.ts       POST /api/extract-color — perceptual colour extraction
  supabase.ts            Server-side Supabase admin client
  middleware/
    rateLimiter.ts       aiLimiter, colorLimiter, accountLimiter exports

shared/
  photoroom-error-codes.ts  Shared error-code string constants (PHOTOROOM_TIMEOUT_ERROR, PHOTOROOM_ERROR, etc.) imported by both server/remove-background.ts and lib/photoroom.ts

assets/
  body_types/            Illustrated body shape images (6 types)
  recommendations/       Sample images for blueprint slots (19 flat-lay photos)

__tests__/               26 test suites (see §11)

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
  → expo-image-manipulator resizes original to ≤1600 px → storageBase64 (~300–600 KB)
  → uploadWardrobeImage() uploads storageBase64 to Supabase Storage: {userId}/{itemId}.jpg
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
| `SUPABASE_SERVICE_ROLE_KEY` | `server/supabase.ts` | Supabase service role key for admin operations (upgrade-premium, delete-account). Keep confidential — has full database access. |
| `EXPO_PUBLIC_SUPABASE_URL` | `lib/supabase.ts` | Your Supabase project URL (e.g. `https://xyzabc.supabase.co`). Prefix `EXPO_PUBLIC_` makes it available in the Expo bundle. |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `lib/supabase.ts` | Supabase anonymous/publishable key. Safe to include in the app bundle; RLS policies enforce access control. |
| `PHOTOROOM_API_KEY` | `server/remove-background.ts` | Photoroom background-removal API key. Required for the background-removal pipeline (`POST /api/remove-background`). Without it the endpoint returns HTTP 503 and the app falls back to the original photo. |

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
| `npm test` | Run all 26 test suites once |
| `npm run test:watch` | Re-run tests on file change (400ms debounce) |
| `npm run typecheck` | TypeScript type-check (`tsc --noEmit`) |
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
- All existing auth logic preserved: `signInWithEmail`, `signInWithPassword`, Google/Apple OAuth, `validateEmailField`/`validatePassword`/`validateConfirmPassword`, confirmed-email state, forgot-password routing, error display
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

The original full-resolution asset is never sent over the network. Both resize calls fall back silently to the original base64 if `manipulateAsync` throws, so users are never blocked from adding an item. Item caps: Guest = 8, Free = 30, Premium = unlimited.

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
A resized base64 image (≤1024 px, ~100–300 KB) is sent to `POST /api/classify-garment`. Gemini classifies the item into category, subType, colourFamily, fabric, pattern, fit, neckline, sleeveLength, rise, warmthBand, and returns a dominant RGB for perceptual colour scoring. The server applies deterministic occasion and season rules on top of Gemini's output for consistency. Two-model fallback: `gemini-flash-lite-latest` → `gemini-2.5-flash` on 429. Content guardrails reject selfies, blurry images, non-clothing subjects. A `[classify] payload N KB` log line is emitted at the start of each request for observability.

**Code:** `server/classify-garment.ts`, `server/routes.ts`

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

### Weather-Aware Outerwear
Uses Open-Meteo (free, no key) with device GPS (`expo-location`) and an IP-geolocation fallback (`ipapi.co`). Weather snapshot cached for 6 hours. Outfit engine gates outerwear by forecast: required when daily low <12°C, suppressed when low >18°C and high >24°C. Rain probability ≥60% biases toward rain-friendly subtypes (trench, raincoat, parka, jacket, bomber-jacket) and deprioritises wool/cashmere/suede. Home tab shows a weather chip; Profile has a weather toggle. Disabling clears the cache.

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
Unlocks: unlimited wardrobe items (free tier raised to 30, guest stays 8), 4 outfits/scenario/day (vs 2 free / 1 guest), resort and night-out scenario filters, Deep Diagnostics, close-colour-match hints on Blueprint, full wear history (all-time), Wardrobe Dividends (CPW ranking of hardest-working pieces), and unlimited background removal (free tier limited to 20 lifetime uses).

**What is NOT gated (available to all free and guest users):**
- Blueprint overview — full 19-slot map with owned/needed status (premium locks only "Next smart buy" highlight and close-colour-match hints)
- Basic wear log — last 7 days of entries; "Wearing this today" button is always accessible
- Calibration signals — love/not-today taps and wear logging always build affinity, even on free

Premium status stored in Supabase `user_profiles` table with an expiry timestamp. Upgrade handled via `POST /api/user/upgrade-premium` on the Express server.

**Code:** `app/premium.tsx`, `server/routes.ts`

---

### Rate Limiting
All Express API endpoints are protected by `express-rate-limit` using the centrally-configured `LIMITER_CONFIGS` object:

| Limiter | Route(s) | Max | Window |
|---------|----------|-----|--------|
| `aiLimiter` | `POST /api/classify-garment` | 10 req | 60 sec |
| `bgRemovalLimiter` | `POST /api/remove-background` | 8 req | 60 sec |
| `colorLimiter` | `POST /api/extract-color` | 30 req | 60 sec |
| `accountLimiter` | upgrade-premium, delete-account | 5 req | 60 min |
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
Supabase session tokens (JWT access + refresh) are stored in `expo-secure-store` on native platforms (iOS Keychain / Android Keystore). The Supabase client is initialised with a `SecureStoreAdapter` (`getItemAsync` / `setItemAsync` / `deleteItemAsync`) inside the `Platform.OS !== 'web'` branch. The web platform uses the Supabase default (localStorage). Tokens are never written to `AsyncStorage`.

**Code:** `lib/supabase.ts`

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

**Entry point:** selecting 2–10 photos in `app/add-item.tsx` (gallery picker with `allowsMultipleSelection: true, selectionLimit: 10`) routes directly to `/bulk-review` with URIs encoded as `JSON.stringify(uris)` in route params. There is no longer a separate Bulk Studio splash screen.

**Review screen (`app/bulk-review.tsx`):**
- Stack presentation (`FADE_OPTIONS`)
- `StatusBar style="dark"`, no `SwipeToDismiss` (back arrow in header handles dismissal)
- Parses `uris` param via `useLocalSearchParams`; initialises `BulkItem[]` state (`uri`, `status`, `classification`)
- Item statuses: `pending → classifying → settled → saving → saved` (or `error`, `removed`)

**Parallel classification (staggered, 150 ms apart):**
1. `expo-image-manipulator` resizes each URI to ≤1024 px (JPEG, 0.8 compress) → base64
2. `POST /api/classify-garment` — same endpoint as single-item add flow
3. On settle: card info fades in with `FadeInDown.duration(280)` (key-prop remount trick)
4. `Haptics.impactAsync(Light)` fires per settled card

**Gold-pulse overlay (classifying state):**
- `Colors.secondary` fill, `opacity` animated `withRepeat(withTiming(0.80, 900ms), -1, true)` via Reanimated `useSharedValue`
- Shows `◆` symbol + cycling status micro-copy (screen-level `setInterval` at 450 ms cycles through: `REVIEWING SILHOUETTE / DERIVING OCCASION TAGS / CURATING COLOUR HARMONY / EXTRACTING FABRIC WEAVE`)
- On classification settle: `cancelAnimation` + `withTiming(0, 260 ms)` fades the overlay out — photo always remains visible underneath

**2-column grid layout:**
- `FlatList numColumns={2}`, card width = `(screenWidth − 40 − 10) / 2` (square photo thumbnail + info section below)
- Per-card Remove (×) button (top-right); Error state shows "Tap to retry" overlay; Saved state shows green checkmark overlay (`FadeInDown.duration(220)`)

**Progress header:**
- "X of N analysed" subtitle under "Batch Review" title
- 2 pt progress track (full width) fills as cards settle

**Batch save (`Save N Items to Wardrobe` footer CTA):**
1. Iterates over all `settled` items sequentially
2. Per item: `expo-image-manipulator` resizes URI to ≤1600 px (JPEG, 0.85 compress) → base64 → `uploadWardrobeImage()` → Supabase Storage
3. Calls `addWardrobeItem()` with full classification payload (type guards: `asPattern`, `asFabric`, `asWeight`, `asFit`, `asNeckline`, `asSleeve`, `asRise`, `asWarmth` — re-defined locally, same logic as `add-item.tsx`)
4. `formalityLevel` derived from `SUBTYPE_FORMALITY[subType] ?? 5` (from `constants/outfitScoring`)
5. Falls back to local URI if Supabase upload fails (non-blocking)
6. On completion: `Haptics.notificationAsync(Success)` + `router.navigate('/(tabs)/wardrobe')`

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
type BgRemovalResult =
  | { status: 'success'; base64: string }
  | { status: 'not-authenticated' }
  | { status: 'limit-reached' }
  | { status: 'unavailable' }
  | { status: 'failed' };
```
`app/add-item.tsx` stores the result status in `bgStatus` state. `app/bulk-review.tsx` adapts with a `.then(r => r.status === 'success' ? r.base64 ?? null : null)` wrapper to remain compatible with the `ClassifyDeps.removeBg` interface in `lib/bulkClassifyCore.ts`.

**Pipeline (single-item add flow):**
1. Photo selected → original JPEG base64 captured
2. `removeBackground(base64)` in `lib/photoroom.ts` calls `POST /api/remove-background` with a `Bearer <JWT>` `Authorization` header
3. Server: checks in-memory LRU → DB cache → auth (JWT verify) → premium check → quota check → Photoroom API (15 s `AbortController` timeout)
4. Returns PNG base64 (or appropriate status code on failure)
5. Client re-encodes the PNG to JPEG using `expo-image-manipulator`
6. `resolveClassifyBase64()` / `resolvePhotoUri()` select the final payload: re-encoded JPEG if successful, original JPEG as fallback — Gemini classification and Supabase upload always proceed
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

**Fallback guarantee:** If any step in the pipeline fails (API down, key missing, network error, re-encode throws), the app falls back to the original photo. Users are never blocked from adding an item.

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

**Background-removed photo preview (`displayUri`):**
Each `BulkItem` carries an optional `displayUri` field — a JPEG re-encode of the Photoroom-cleaned PNG. The card thumbnail displays `item.displayUri ?? item.uri` so users see the background-removed version (when available) while the item is still being saved. The original `item.uri` is never mutated.

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

### Test Suites (31 total)

| Suite | What it tests |
|-------|--------------|
| `accountLockout.test.ts` | Account lockout lifecycle: thresholds, expiry, `initLockoutStore` restart-survival, prune-interval state, DB integration (skipped when `DATABASE_URL` absent) |
| `androidOAuthCancel.test.ts` | Android OAuth cancellation path: `useEffect` cleanup, loading-spinner reset on cancel, no stuck-spinner regression |
| `blueprint-image-sync.test.ts` | Every blueprint slot imageKey maps to a valid SAMPLE_IMAGES entry (no broken placeholder fallbacks) |
| `blueprint-lifestyle-slots.test.ts` | Lifestyle slot group thresholds across all 6 blueprints (group existence, category ordering, proportionality) |
| `blueprint-slots.test.ts` | Slot structure invariants (required fields, valid categories, no duplicate IDs) |
| `bulkAutoPersist.test.ts` | Bulk-review auto-persist: items are saved incrementally as classification completes, not only on final submit |
| `bulkCarousel.test.ts` | Bulk-review carousel scroll contract: index clamping, null FlatList ref guard, empty-list safety |
| `bulkReviewMountedGuard.test.ts` | `isMountedRef` guard in bulk-review: async state setters are not called after the component unmounts |
| `bulkSaveLock.test.ts` | Save-lock ref in bulk-review: concurrent save attempts are blocked by the `saveLockRef` guard |
| `classifyGarment.test.ts` | `processGeminiResult` parsing, field validation (subType, colorFamily, modelConfidence), colour conversion helpers, edge cases (empty `{}`, null subType, mismatched category, boundary `modelConfidence`) |
| `classifyGarmentIntegration.test.ts` | HTTP-layer tests for `POST /api/classify-garment`: 400 for missing/ambiguous image input, 500 for absent `GEMINI_API_KEY`, 429 after aiLimiter cap, JSON response shape |
| `getProfileBlueprint.test.ts` | Algorithm tests calling `buildProfileBlueprintSlots()` directly (no mocking) |
| `ghostItemRecovery.test.ts` | `detectNoPhotoOrphans`, `isGuestPhotoUri`, `detectFileOrphans` (file-exists/missing/throws/cloud-recovery/rebase-path), and `applyOrphanResolution` action routing; also exercises `applyRePhotographSave` |
| `guestPhotoCleanup.test.ts` | `deleteGuestPhoto`, `runGuestRemoval`, `buildGuestPhotoDestPath` — cleanup guard (URI must start with documentDirectory), idempotent delete, rejection propagation, per-deletion isolation |
| `lifestyle-blueprint.test.ts` | Lifestyle weight ordering and category priority adjustments |
| `lifestyleSlotGroups.test.ts` | Slot group activation thresholds for active and brunch lifestyles |
| `oauthDismissGuard.test.ts` | OAuth dismiss guard: browser session cleanup on back-navigation and modal dismiss |
| `outfitComboScorer.test.ts` | Colour harmony scoring, combo scoring, proportion-balance, metal-cohesion |
| `outfitGenerator.test.ts` | Outfit generation correctness, scenario hero coverage, "just added" suggestions |
| `outfitGroupCompletion.test.ts` | Outfit group completeness scoring, recipe slot-ID cross-check against blueprint output, `hasSubstitution` flag when constraint-excluded slots are the only missing piece |
| `outfitRotation.test.ts` | Daily rotation engine: tieredShuffle stability, hero-diversity, completeness bias, sort tie-breakers |
| `outfitScoringData.test.ts` | Data-table invariants for `SCENARIO_AFFINITY`, `STYLE_PREFERRED_COLORS`, `STYLE_GOAL_SUBTYPES` (key completeness against `OccasionTag` and `StyleGoal` unions) |
| `perceptualScoring.test.ts` | HSL/Lab perceptual colour scoring |
| `photoroomRetry.test.ts` | `removeBackground()` retry contract: timeout→success, timeout→timeout, no-retry error codes (photoroom_error/invalid/empty), network error, cross-layer import assertion (server + client reference shared constants) |
| `rateLimiter.test.ts` | Per-limiter blocking + 429 response shape, standard headers, `PgRateLimitStore` fallback behaviour, `LIMITER_CONFIGS` key completeness and security bounds, `loadFromDb()` no-throw contract, `_consecutiveDbFailuresForTesting` counter |
| `rebaseGuestPhotoUri.test.ts` | `rebaseGuestPhotoUri()`: prefix unchanged, old prefix rebased, non-guest URIs untouched, malformed filenames untouched, edge cases (empty currentDocDir, same prefix) |
| `removeBackground.test.ts` | `resolveClassifyBase64`/`selectClassifyPayload`/`resolvePhotoUri` pipeline helpers; server handler error codes (503 missing key, 400 missing body, 502 non-OK/empty-body/network-error/AbortError/mid-stream AbortError); `resolveWardrobeUploadArg`/`stripDataUriPrefix` |
| `signInWithEmail.test.ts` | Email sign-in flow: credential validation, Supabase auth call, error propagation |
| `signUpWithEmail.test.ts` | Email sign-up flow: input validation, Supabase account creation, error handling |
| `wardrobeDiagnostics.test.ts` | `computeDiagnostics` health score, category stats, scenario coverage; `ALL_SCENARIOS` export integrity and alignment with `computeDiagnostics` output |
| `weather.test.ts` | Weather-aware outerwear rules (temperature gating, rain-friendly subtype bias) |

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

`upsertUserProfile()` no longer accepts a `premium` field. The parameter type explicitly omits it. The `togglePremium` function in `AppContext` writes only to AsyncStorage (local dev toggle) — it does not write to Supabase. The **only** authoritative write path for the `premium` column is the server-side `POST /api/user/upgrade-premium` endpoint, which is protected by `requireAuth` and uses the Supabase Admin client with `SUPABASE_SERVICE_ROLE_KEY`.

**Rule:** Never add `premium` back to `upsertUserProfile`. Any premium-setting logic must go through the server endpoint.

---

#### NH-1 — Delete/update operations scoped to the owning user

**Severity:** High  
**File:** `lib/database.ts`

`deleteWardrobeItem(userId, itemId)`, `deleteWearLog(userId, logId)`, and `updateWardrobeItemAffinity(userId, itemId, affinity)` all now include `.eq('user_id', userId)` in addition to `.eq('id', ...)`. Without this, a caller that somehow obtains a foreign item ID could delete or mutate another user's data. Supabase RLS policies provide a server-side backstop, but defence-in-depth requires the query itself to be scoped.

**Rule:** Every `DELETE` and `UPDATE` on user-owned rows must filter on both `id` and `user_id`.

---

#### NH-2 — Outbound axios timeout on extract-color

**Severity:** High  
**File:** `server/extract-color.ts`

The `axios.post` call to Google Cloud Vision now passes `{ timeout: 20_000 }` (20 seconds). Without a timeout, a slow or hung GCV response would stall the Node.js event loop for an unbounded duration, blocking all subsequent requests on the same thread.

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

`p-limit` (v3, CJS-compatible, already a project dependency) caps simultaneous calls to `/api/classify-garment`, `/api/extract-color`, and `/api/remove-background` at 5 concurrent AI invocations. Requests beyond the limit are queued — not rejected (the per-endpoint rate limiters handle outright rejection). This prevents a burst of requests from simultaneously exhausting Gemini / GCV memory or connection limits.

---

### First-Pass Remediations (already applied in prior sessions)

| ID | Description | Files |
|----|-------------|-------|
| C-1 | `requireAuth` on `POST /api/user/upgrade-premium` | `server/routes.ts` |
| C-2 | `requireAuth` on `DELETE /api/user/delete-account` | `server/routes.ts` |
| H-1 | OAuth relay allowlist — `nativeCallback` redirect only bounces to `exp://` scheme, not arbitrary URLs | `app/_layout.tsx` |
| H-1b | OAuth relay allowlist extended: `exp://localhost` and `exp://127.0.0.1` are now valid relay targets alongside the Replit dev domain. Expo starts with `--localhost`, so `makeRedirectUri()` always returns `exp://localhost:<port>` in Expo Go (StoreClient). The previous check `nativeCallback.includes(REPLIT_DEV_DOMAIN)` always failed for localhost URLs, causing the server to serve the landing page instead of the 302 relay — leaving iOS ASWebAuth stuck and Android Chrome showing the web app instead of the native app. The PKCE verifier in native SecureStore is the real security gate. | `server/index.ts` |
| H-1c | Android OAuth path switched from `Linking.openURL` (full system Chrome, separate process) to `WebBrowser.openBrowserAsync` (Chrome Custom Tab / CCT). A CCT slides in as a sheet over the app — no hard app-switch. When the server 302s to `exp://`, Android dispatches a VIEW intent, the CCT closes automatically and Expo Go comes to the foreground. Cancel detection uses the `openBrowserAsync` promise + 500 ms buffer (replacing the `AppState` background/active cycle which only fires with a full app-switch). `AppState` import and `buildAndroidCancelDetector` removed from `lib/auth.ts`. | `lib/auth.ts` |
| H-2 | `requireAuth` on `POST /api/classify-garment` and `POST /api/extract-color`; `authenticatedApiRequest` on all client call-sites | `server/routes.ts`, `lib/query-client.ts` |
| H-4 | CVE upgrade: `drizzle-orm` (GHSA-2m91-8mvq-fwwg) | `package.json` |
| H-5 | CVE upgrade: `http-proxy-middleware` (prototype pollution) | `package.json` |
| M-1 | CORS `localhost` origin gated on `NODE_ENV !== 'production'` | `server/index.ts` |
| M-2 | Auth route bodies excluded from request logging to prevent credential leakage in logs | `server/index.ts` |
| M-3 | CVE upgrade: `form-data` | `package.json` |

### Known Infrastructure-Level Recommendations

These require Supabase dashboard changes and cannot be enforced from application code alone:

- **NM-4 — Wardrobe image bucket access:** The `wardrobe-images` Supabase Storage bucket should be set to **private** in the Supabase dashboard, with signed URLs generated at read time (1-hour TTL) instead of permanent public URLs. This prevents unauthenticated enumeration of user wardrobe photos. Current implementation uses public URLs with UUID-based paths (low practical risk, but should be hardened for production).

---

## 13. Key Conventions

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
| **Update TECHNICAL.md** | Every code change that affects architecture, endpoints, file structure, packages, tests, or conventions must update TECHNICAL.md in the same commit |
