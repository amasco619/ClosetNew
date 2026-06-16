# AuraCloset

## Overview
AuraCloset is a virtual wardrobe + styling assistant mobile app built with Expo (React Native) and Express backend. The tagline is "Your quiet-luxury stylist in your pocket."

## Current State
- **Version**: 1.4.0
- **Last Updated**: 2026-06-16
- **Status**: Blueprint engine refactored for testability + full lifestyle-slot coverage

## Architecture
- **Frontend**: Expo Router (file-based routing) with React Native
- **Backend**: Express server on port 5000 (serves landing page + API)
- **State Management**: React Context + AsyncStorage for local persistence
- **Styling**: Custom theme with Inter font family, quiet-luxury color palette

## Key Features
- Multi-step onboarding (body type with illustrated images, eye color, skin tone, style goals)
- Wardrobe digitization with camera/gallery (Guest: 8-item cap, Free: 15-item cap, Premium: unlimited)
- Garment classification via Google Cloud Vision (POST /api/classify-garment)
- **Personalized outfit generation** — dynamic outfit combinations built exclusively from the user's actual wardrobe items. Algorithm uses occasion tags, color harmony (neutral + anything, monochromatic), style goal color preferences, and profile constraints (noSleeveless, noShortSkirts, maxHeelHeight). Each component is always "owned" (real items only).
- **"Just Added" outfit suggestions** — when a user uploads a new clothing item, `generateOutfitsForItem` builds complete looks centered on that new item using existing wardrobe pieces. These appear as a dismissable "Styled for your new item" banner in the Outfits tab and contribute to the "Ready Outfits" count on the dashboard.
- **Outfits tab redesign** — shows only real, wearable looks from the user's wardrobe (no "need" items). Features: scenario filter (work/casual/date/event/brunch/active + premium tiers for resort/night-out), lookbook-style cards with item photos, mood descriptor per scenario, and a "Ready to wear" badge on every outfit.
- Wardrobe analytics (category & color distribution)
- WardrobeSlot blueprint system (19 essential items across tops, bottoms, outerwear, shoes, jewelry, dress, bag)
- Starter Recommendations on Home screen (first needed slot per category)
- Slot status tracking (needed/owned) with automatic matching on item add/remove
- **Deep Diagnostics** (premium) — computed from stored wardrobe data: overall health score (0–100, graded A–F), category balance analysis, colour palette neutral/accent ratio, scenario coverage strength, hardest-working versatile pieces, blueprint completion %, and a prioritised gap list with contextual explanations. Accessible from the Premium page once upgraded.
- **Personal Calibration Loop** — taste learns from every signal: love taps, "not today" taps, and outfits actually worn aggregate (with 60-day half-life recency decay) into per-item `affinity` and per-pair `pairAffinity` multipliers (clamped to [0.7, 1.3] for items, [0.8, 1.2] for pairs — never a blacklist). Cold-start safe: multipliers stay at 1.0 until ≥5 signals have accumulated. Multipliers compose on top of existing additive reaction adjustments inside `generateOutfitPool`. Profile screen has a "Why this changed" expandable card showing top liked/disliked items + pairs and current calibration status. Engine: `constants/affinity.ts`.
- **Weather-Aware Outerwear** — uses Open-Meteo (free, no API key) plus device location (`expo-location`) with an IP-geolocation fallback (`ipapi.co`) so the feature works without the user granting location. Snapshots cached for 6 hours under `@auracloset_weather_v1`. The outfit engine gates outerwear by daily forecast: required when daily low <12°C, suppressed when low >18°C and high >24°C, and biased toward rain-friendly subtypes (trench / raincoat / parka / mac / jacket / bomber-jacket) when rain probability ≥60% — wool / cashmere / suede coats are deprioritised in the rain. A small weather chip on the Home tab and a "Weather-aware outfits" toggle in Profile give the user explicit control. Disabling the toggle clears the cache and reverts to the season + style-only outerwear logic. Engine: `constants/weather.ts`.
- **Wear Tracking** — full outfit wear log system: "Wearing this today" button on each OutfitCard (only shown when outfit has owned items), tapping logs a WearEntry (id, date, occasion, outfitFingerprint, itemIds, loggedAt) to AsyncStorage. Worn cards show green "Worn today" badge + "Undo" button. Wear Log screen (`/wear-log`) shows all entries grouped by date with item thumbnails. Home tab shows "Today's Looks" pill card when anything is logged. Profile tab has a "Track & History" section with Wear Log shortcut showing total log count.
- **Daily rotation engine** — seeded Mulberry32 shuffle with per-scenario cursors, persisted to AsyncStorage. Free: 2 outfits/scenario/day; Premium: 4 outfits/scenario/day. Intelligent engine features: hero-diversity enforcement (yesterday's hero pieces deprioritised), cross-scenario fingerprint dedup (same exact outfit cannot appear twice in one day), completeness bias (full shoe+bag+jewelry stack earns +1 confidence to surface first), day-of-week cursor nudge (work scenario advances on weekends). Engine: `constants/outfitRotation.ts`.
- Premium tier toggle (unlimited items, blueprint, advanced features)
- Profile management with style constraints

## Project Structure
```
app/
  _layout.tsx          - Root layout with providers
  index.tsx            - Entry routing (onboarding vs tabs)
  onboarding.tsx       - Multi-step style quiz
  add-item.tsx         - Add wardrobe item (camera/gallery); 12 OccasionTags, sleeveLength required for top/dress
  premium.tsx          - Premium upgrade screen
  item-detail.tsx      - Item detail view
  (tabs)/
    _layout.tsx        - Tab navigation (liquid glass on iOS 26+)
    index.tsx          - Dashboard with starter recommendations
    wardrobe.tsx       - Wardrobe grid
    outfits.tsx        - Outfit recommendations with component images
    profile.tsx        - Profile & settings
contexts/
  AppContext.tsx        - Main app state (profile, wardrobe, premium, recommendation slots)
constants/
  colors.ts            - Theme colors (navy/champagne gold palette)
  types.ts             - Shared type definitions (BodyType, StyleGoal, UserProfile, etc.)
  blueprintSlots.ts    - All 6 × slot arrays (asset-free); STYLE_BLUEPRINT_SLOTS, STYLE_GOALS, CORE_CATEGORIES
  blueprintPriority.ts - applyLifestyleWeights, LIFESTYLE_CATEGORY_WEIGHTS (asset-free)
  blueprintCore.ts     - Pure, asset-free blueprint algorithm: buildProfileBlueprintSlots(profile),
                         BODY_TYPE_PRIORITY_BOOSTS, BlueprintProfile interface. Tested directly in Node/tsx
                         without PNG asset require() calls. wardrobeBlueprint.ts delegates to this.
  wardrobeBlueprint.ts - WardrobeSlot model, per-style BlueprintItem[] (adds sampleImage via SAMPLE_IMAGES),
                         getProfileBlueprint (delegates to blueprintCore), slot matching
  outfitGenerator.ts   - Personalized outfit generator (generatePersonalizedOutfits). WardrobeItem/OutfitComponent/OutfitSet interfaces live in types.ts (moved from AppContext to avoid circular imports)
server/
  classify-garment.ts  - POST /api/classify-garment; Gemini + GCV; expanded VALID_SUBTYPES for all engine
                         sub-types; GEMINI_PROMPT updated to return OccasionTags from the 12-tag taxonomy
assets/
  body_types/          - Illustrated body shape images (hourglass, pear, apple, rectangle, inverted triangle, athletic)
  recommendations/     - Sample images for wardrobe slots (19 flat-lay fashion photos)
__tests__/
  blueprint-lifestyle-slots.test.ts - Active/brunch slot group threshold tests (10 sections,
                                      all 6 blueprints): group existence, category avg rank improvement
                                      at high lifestyle, category ordering at extreme proportions,
                                      proportionality, spot-checks
  blueprint-slots.test.ts           - Slot structure invariants
  getProfileBlueprint.test.ts       - Algorithm tests calling buildProfileBlueprintSlots directly
                                      (no local mirror; exercises real production code)
  lifestyle-blueprint.test.ts       - Lifestyle weight ordering
  outfitComboScorer.test.ts         - Color harmony + combo scoring
  outfitGenerator.test.ts           - Outfit generation + scenario hero coverage
  outfitRotation.test.ts            - Daily rotation engine
  perceptualScoring.test.ts         - Perceptual color scoring
  weather.test.ts                   - Weather-aware outerwear rules
```

## WardrobeSlot Blueprint System
- Dynamic per-style-goal blueprints defined in `constants/blueprintSlots.ts` (slot data) and
  `constants/blueprintCore.ts` (pure algorithm). `wardrobeBlueprint.ts` wraps blueprintCore to
  attach `sampleImage` and expose `getProfileBlueprint`.
- 6 curated blueprint sets: minimal, elevated, bold, romantic, classic, youthful
- `buildProfileBlueprintSlots(profile)` in `blueprintCore.ts` is the canonical algorithm —
  asset-free, directly importable in Node/tsx, and exercised by `__tests__/getProfileBlueprint.test.ts`
  without any mocking or local mirror.
- `getProfileBlueprint(profile)` in `wardrobeBlueprint.ts` delegates to `buildProfileBlueprintSlots`
  then maps each slot's `imageKey` to a `sampleImage` PNG via `SAMPLE_IMAGES`.
- Algorithm selects items based on:
  - Primary style goal (selects base blueprint set)
  - Secondary style goal (adds lower-priority items from secondary set)
  - Body type (adjusts category priorities — e.g., pear boosts tops/jewelry)
  - Lifestyle percentages (work/casual/events adjust item priority)
  - Constraints (filters heels if flat-only, removes sleeveless, swaps mini for midi)
- Falls back to classic blueprint when no style goal is set
- Shared types extracted to `constants/types.ts` to avoid circular dependencies
- Each slot has: id, category, subType, colorFamily, priority, label, description, sampleImage
- Slots re-initialize automatically when profile style goals change
- When an item is added, the first matching needed slot is updated to owned
- When an item is removed, all slots are re-initialized from the profile-aware blueprint
- Slot statuses are persisted to AsyncStorage under `@auracloset_slots`
- `starterRecommendations` provides the first needed slot per category for the Home screen
- Home screen subtitle dynamically shows "Curated for your [Style] style"

## Garment Classification API
- Endpoint: POST /api/classify-garment (on the existing Express server, port 5000)
- Calls Google Cloud Vision Label Detection to identify garment type and color
- Maps Vision labels to internal schema (garmentType + colorFamily)
- Returns a human-readable `description` field combining color and garment type (e.g. "Grey zip-up hoodie")
- Requires `GCV_API_KEY` secret (Google Cloud Vision API key)
- Implementation: `server/classify-garment.ts`, registered in `server/routes.ts`
- Documentation: `server/README.md`
- Dependencies: axios (for Vision API calls)
- JSON body limit increased to 10mb to support base64 image uploads

## Color Palette
- Primary: #101826 (Deep Navy)
- Secondary: #D0B892 (Champagne Gold)
- Sage: #8AA39B
- Blush: #EACFD3
- Background: #F5F3F0

## UI/UX Design System

### Design Principles (applied across all four tab screens)
Derived from three reference repos: emilkowalski/skill (design engineering), redf0x1/ui-ux-pro-mcp (React Native HIG), and nextlevelbuilder/ui-ux-pro-max-skill (design tokens).

#### Animation
- All animation durations: **< 300 ms** (FadeInDown uses 280 ms; never 400–500 ms)
- Stagger delays: 60 ms → 480 ms maximum across a screen's enter sequence, incremented by ~40–60 ms per layer
- Spring physics: use `withSpring` / `useSharedValue` from Reanimated 3 for interactive press feedback
- Entering animations start from `opacity: 0` + slight Y offset — never scale-from-zero
- Exit animations are asymmetrically fast (ease-in, shorter than enter)
- `FadeInUp` for banners that pop in after content is already visible

#### Press Feedback
- Every interactive card uses `({ pressed }) => [base, pressed && cardPressed]`
- `cardPressed`: `{ opacity: 0.85, transform: [{ scale: 0.97 }] }` — scale 0.97, opacity 0.82–0.85
- Primary CTA buttons (add item, upgrade, empty state action) use `opacity: 0.82, scale: 0.97` on press
- Haptic feedback (`Haptics.selectionAsync()`) on: stat card taps, filter chip selections, action button taps

#### Touch Targets
- Minimum 44 × 44 pt for all interactive elements (enforced via `minHeight: 44` or `hitSlop`)
- Icon-only controls (dismiss, toggle) use `hitSlop={8}` to expand tap area without changing layout

#### Typography Scale (iOS HIG — Inter font family)
| Role | Font | Size | Letter-spacing |
|---|---|---|---|
| Screen title | Inter_700Bold | 30 | -0.8 |
| Section label above title | Inter_400Regular | 11–12 | +0.8, uppercase |
| Section heading | Inter_600SemiBold | 15–16 | -0.2 |
| Card title / label | Inter_600SemiBold | 13–14 | -0.1 |
| Body / description | Inter_400Regular | 12–13 | 0 |
| Caption / meta | Inter_400Regular | 11–12 | 0 |
| Stat number (large) | Inter_700Bold | 22–28 | -0.3 to -0.5 |
| Uppercase micro-label | Inter_500Medium | 10–11 | +0.8–1.0 |

- Section headers follow the pattern: small uppercase label (Inter_400Regular 11–12 px) **above** the bold 30 px title — visible on Home and Wardrobe screens
- Tabular numerals (`fontVariant: ['tabular-nums']`) on any number that changes (counts, scores)

#### Spacing Grid (4 pt base)
4 · 6 · 8 · 10 · 12 · 14 · 16 · 20 · 24 · 32 · 48

- Screen horizontal padding: **20 pt**
- Card internal padding: **14–16 pt**
- Gap between cards: **10–14 pt**
- Gap between chips/pills: **6–8 pt**
- Section title bottom margin: **10–12 pt**

#### Card Shadows (quiet luxury — very subtle)
- Standard card: `shadowColor: Colors.primary, shadowOpacity: 0.04–0.06, shadowRadius: 8–12, shadowOffset: { width: 0, height: 2–4 }, elevation: 1–2`
- Accent cards (pick, worn): `shadowColor: Colors.secondary | Colors.success, shadowOpacity: 0.08–0.1`
- Primary CTA button shadow: `shadowColor: Colors.primary | Colors.secondary, shadowOpacity: 0.25–0.3, shadowRadius: 6–8`
- All cards also carry `borderWidth: 1, borderColor: Colors.border` for hairline separation on light backgrounds

#### Border Radius
- Large cards / stat cards: 16–18 pt
- Small chips / pills: 8–12 pt (pill-shaped: 20 pt)
- Icon containers: 10–14 pt (square-ish)
- Image thumbnails: 10–12 pt

#### Empty States
Every list/grid empty state must include:
1. Rounded icon container (80 × 80, borderRadius 24, `Colors.secondary + '12'` background, `Colors.secondary + '20'` border)
2. Bold title (Inter_600SemiBold 18)
3. Subtitle body text (lineHeight 21)
4. Primary CTA `Pressable` button with navy background + shadow (shown when the wardrobe is completely empty)

#### Accent Details
- Style tips card: `borderLeftWidth: 3, borderLeftColor: Colors.secondary + '60'` for a quiet-luxury left accent
- Worn outfit badge: filled background `Colors.success + '12'` instead of plain text
- Weather chip: `borderWidth: 1, borderColor: Colors.sage + '30'`
- Premium badge: `borderWidth: 1, borderColor: Colors.secondary + '30'`

### Component Patterns

#### Screen Header (Home, Wardrobe, Outfits, Profile)
- Wardrobe / Home: small uppercase subtitle ABOVE the 30 px bold title
- Outfits / Profile: title only (no subtitle label above)
- Profile: centered header with 76 × 76 avatar circle and name below

#### Filter / Scenario Chips
- Inactive: white background, `Colors.border` border
- Active: `Colors.primary` fill, white text
- Premium variant: `Colors.secondary + '60'` border, locked state at `opacity: 0.6`
- Haptic selection feedback on every chip press

#### Stat Bar (Profile)
- Three columns separated by 1 px divider lines
- Card shadow + border for separation from background
- Numbers at 22 px Inter_700Bold with tabular numerals

#### Upgrade Button
- `Colors.secondary` background
- Shadow: `shadowColor: Colors.secondary, shadowOpacity: 0.3`
- `Inter_600SemiBold` label + star icon

## Testing & Quality Automation

### Running tests
- **Single run**: `npm test` — runs all `__tests__/*.test.ts` files via `scripts/run-tests.mjs` (9 suites)
- **Watch mode**: `npm run test:watch` — re-runs affected tests automatically whenever a `.ts`, `.tsx`, or `.mjs` file changes in `__tests__/`, `constants/`, `contexts/`, `app/`, `components/`, `lib/`, `server/`, or `shared/`. Uses a 400 ms debounce. Script: `scripts/watch-tests.mjs`

### Pre-commit hook
A git pre-commit hook (`scripts/install-hooks.mjs`) blocks commits when any test fails.
- **Auto-installed** on `npm install` (wired into `postinstall`)
- **Manual install / reinstall**: `npm run hooks:install`
- The hook runs `node scripts/run-tests.mjs`; a non-zero exit aborts the commit with a clear error message
- If a custom pre-commit hook already exists the installer skips the file and prints instructions for manual integration

## User Preferences
- Quiet luxury aesthetic
- No emojis in the app
- Inter font family throughout
