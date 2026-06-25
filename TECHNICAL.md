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
12. [Key Conventions](#12-key-conventions)

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
4. Session tokens are stored in `AsyncStorage` on native (the Supabase client is initialised with `storage: AsyncStorage`)
5. For email auth: `signInWithEmail()` calls `supabase.auth.signInWithPassword()` directly
6. `AppContext` listens to `supabase.auth.onAuthStateChange()` for session updates

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
  add-item.tsx           Add wardrobe item (camera / gallery + Gemini classification)
  item-detail.tsx        Item detail and edit screen
  premium.tsx            Premium upgrade screen
  wear-log.tsx           Full outfit wear history grouped by date
  outfit-ideas.tsx       Outfit ideas for a selected wardrobe item
  (tabs)/
    _layout.tsx          Tab bar configuration (liquid glass on iOS 26+)
    index.tsx            Home / Dashboard tab
    wardrobe.tsx         Wardrobe grid tab
    outfits.tsx          Outfit recommendations tab
    profile.tsx          Profile and settings tab

components/              Shared React Native components
  ErrorBoundary.tsx      Top-level error boundary

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

lib/
  auth.ts                Auth helpers (signIn/Up/Out, OAuth, password reset)
  supabase.ts            Supabase client (SecureStore session adapter for native)
  storage.ts             uploadWardrobeImage() — uploads to Supabase Storage
  query-client.ts        @tanstack/react-query setup, apiRequest() helper

server/
  index.ts               Express server entry (port 5000, 10mb JSON body limit)
  routes.ts              Route registration (classifyGarment, extractColor, upgrade, delete)
  classify-garment.ts    POST /api/classify-garment — Gemini classifier
  extract-color.ts       POST /api/extract-color — perceptual colour extraction
  supabase.ts            Server-side Supabase admin client
  middleware/
    rateLimiter.ts       aiLimiter, colorLimiter, accountLimiter exports

assets/
  body_types/            Illustrated body shape images (6 types)
  recommendations/       Sample images for blueprint slots (19 flat-lay photos)

__tests__/               12 test suites (see §11)

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

### Pending / Future Secrets

| Secret | Used by | Description |
|--------|---------|-------------|
| `PHOTOROOM_API_KEY` | `app/add-item.tsx` (to be wired) | Photoroom background-removal API key. Already owned. See [§10](#10-pending-features) for integration plan. |

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
| `npm test` | Run all 12 test suites once |
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

The original full-resolution asset is never sent over the network. Both resize calls fall back silently to the original base64 if `manipulateAsync` throws, so users are never blocked from adding an item. Item caps: Guest = 8, Free = 15, Premium = unlimited.

`uploadWardrobeImage()` accepts an optional `mimeType` parameter (`'image/jpeg'` default, `'image/png'` supported); the file extension is derived from the MIME type. `deleteWardrobeImage()` removes both `.jpg` and `.png` variants to handle items stored under either extension.

**Code:** `app/add-item.tsx`, `lib/storage.ts`

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

**Code:** `constants/blueprintCore.ts`, `constants/blueprintSlots.ts`, `constants/wardrobeBlueprint.ts`, `constants/blueprintPriority.ts`

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
"Wearing this today" button on each OutfitCard logs a WearEntry (id, date, occasion, outfitFingerprint, itemIds, loggedAt) to AsyncStorage. Worn cards show a "Worn today" badge and an Undo button. Wear Log screen groups all entries by date with item thumbnails. Home tab shows a "Today's Looks" pill card when anything is logged.

**Code:** `app/wear-log.tsx`, `app/(tabs)/index.tsx`, `contexts/AppContext.tsx`

---

### Daily Rotation Engine
Seeded Mulberry32 PRNG shuffle with per-scenario cursors, persisted to AsyncStorage. Quotas: Free = 2 outfits/scenario/day, Premium = 4, Guest = 1. Features: hero-diversity enforcement (yesterday's hero pieces deprioritised), cross-scenario fingerprint deduplication (same outfit cannot appear twice in one day), completeness bias (+1 confidence for full shoe+bag+jewelry stack), day-of-week cursor nudge (work scenario advances on weekends). All sort operations are stable (tie-breakers preserve input order to prevent non-determinism across runtimes).

**Code:** `constants/outfitRotation.ts`

---

### Premium Tier
Unlocks: unlimited wardrobe items, 4 outfits/scenario/day (vs 2), resort and night-out scenario filters, Deep Diagnostics. Premium status stored in Supabase `user_profiles` table with an expiry timestamp. Upgrade is handled via `POST /api/user/upgrade-premium` on the Express server.

**Code:** `app/premium.tsx`, `server/routes.ts`

---

### Rate Limiting
All Express API endpoints are protected by `express-rate-limit` using the centrally-configured `LIMITER_CONFIGS` object:

| Limiter | Route(s) | Max | Window |
|---------|----------|-----|--------|
| `aiLimiter` | `POST /api/classify-garment` | 10 req | 60 sec |
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

### Photoroom Background Remover

**What it does:** Automatically removes the background from wardrobe item photos at upload time, producing clean flat-lay style images with a transparent or white background. This significantly improves the visual quality of outfit card thumbnails.

**API:** The Photoroom background-removal API. The owner already has an API key — add it to Replit Secrets as `PHOTOROOM_API_KEY`.

**Integration points:**
- **Where to add it:** `app/add-item.tsx`, in the `pickImage()` function, immediately after the photo is selected and before it is uploaded to Supabase Storage
- **Flow:**
  1. User picks photo → base64 obtained
  2. Call `POST /api/remove-background` on the Express server (new endpoint)
  3. Express calls Photoroom API with the image, returns the processed image as base64 or a URL
  4. Replace `photoUri` and `photoBase64` in add-item state with the background-removed version
  5. Continue to Gemini classification and Supabase upload as normal
- **New server file:** `server/remove-background.ts`
- **New route:** `POST /api/remove-background` (apply `aiLimiter` rate limiting)
- **Fallback:** If the Photoroom call fails (network error or API error), silently fall back to the original photo — the user should not be blocked from adding an item due to background-removal failure
- **Secret to add:** `PHOTOROOM_API_KEY` in Replit Secrets

---

## 11. Testing & Quality

### Test Suites (18 total)

| Suite | What it tests |
|-------|--------------|
| `accountLockout.test.ts` | Account lockout lifecycle: thresholds, expiry, `initLockoutStore` restart-survival, prune-interval state, DB integration (skipped when `DATABASE_URL` absent) |
| `blueprint-image-sync.test.ts` | Every blueprint slot imageKey maps to a valid SAMPLE_IMAGES entry (no broken placeholder fallbacks) |
| `blueprint-lifestyle-slots.test.ts` | Lifestyle slot group thresholds across all 6 blueprints (group existence, category ordering, proportionality) |
| `blueprint-slots.test.ts` | Slot structure invariants (required fields, valid categories, no duplicate IDs) |
| `classifyGarment.test.ts` | `processGeminiResult` parsing, field validation (subType, colorFamily, modelConfidence), colour conversion helpers, edge cases (empty `{}`, null subType, mismatched category, boundary `modelConfidence`) |
| `classifyGarmentIntegration.test.ts` | HTTP-layer tests for `POST /api/classify-garment`: 400 for missing/ambiguous image input, 500 for absent `GEMINI_API_KEY`, 429 after aiLimiter cap, JSON response shape |
| `getProfileBlueprint.test.ts` | Algorithm tests calling `buildProfileBlueprintSlots()` directly (no mocking) |
| `lifestyle-blueprint.test.ts` | Lifestyle weight ordering and category priority adjustments |
| `lifestyleSlotGroups.test.ts` | Slot group activation thresholds for active and brunch lifestyles |
| `outfitComboScorer.test.ts` | Colour harmony scoring, combo scoring, proportion-balance, metal-cohesion |
| `outfitGenerator.test.ts` | Outfit generation correctness, scenario hero coverage, "just added" suggestions |
| `outfitGroupCompletion.test.ts` | Outfit group completeness scoring, recipe slot-ID cross-check against blueprint output, `hasSubstitution` flag when constraint-excluded slots are the only missing piece |
| `outfitRotation.test.ts` | Daily rotation engine: tieredShuffle stability, hero-diversity, completeness bias, sort tie-breakers |
| `outfitScoringData.test.ts` | Data-table invariants for `SCENARIO_AFFINITY`, `STYLE_PREFERRED_COLORS`, `STYLE_GOAL_SUBTYPES` (key completeness against `OccasionTag` and `StyleGoal` unions) |
| `perceptualScoring.test.ts` | HSL/Lab perceptual colour scoring |
| `rateLimiter.test.ts` | Per-limiter blocking + 429 response shape, standard headers, `PgRateLimitStore` fallback behaviour, `LIMITER_CONFIGS` key completeness and security bounds, `loadFromDb()` no-throw contract, `_consecutiveDbFailuresForTesting` counter |
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

## 12. Key Conventions

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
| **Update TECHNICAL.md** | Every code change that affects architecture, endpoints, file structure, packages, tests, or conventions must update TECHNICAL.md in the same commit |
