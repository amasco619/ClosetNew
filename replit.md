# AuraCloset

## Overview
AuraCloset is a virtual wardrobe + styling assistant mobile app built with Expo (React Native) and Express backend. The tagline is "Your quiet-luxury stylist in your pocket."

## Current State
- **Version**: 1.2.0
- **Last Updated**: 2026-02-23
- **Status**: Dynamic style-aware recommendations

## Architecture
- **Frontend**: Expo Router (file-based routing) with React Native
- **Backend**: Express server on port 5000 (serves landing page + API)
- **State Management**: React Context + AsyncStorage for local persistence
- **Styling**: Custom theme with Inter font family, quiet-luxury color palette

## Key Features
- Multi-step onboarding (body type with illustrated images, eye color, skin tone, style goals)
- Wardrobe digitization with camera/gallery (30-item free cap)
- Garment classification via Google Cloud Vision (POST /api/classify-garment)
- Outfit recommendations by scenario (Work/Casual/Date/Event) with sample images per component
- Wardrobe analytics (category & color distribution)
- WardrobeSlot blueprint system (19 essential items across tops, bottoms, outerwear, shoes, jewelry, dress, bag)
- Starter Recommendations on Home screen (first needed slot per category)
- Slot status tracking (needed/owned) with automatic matching on item add/remove
- Premium tier toggle (unlimited items, blueprint, advanced features)
- Profile management with style constraints

## Project Structure
```
app/
  _layout.tsx          - Root layout with providers
  index.tsx            - Entry routing (onboarding vs tabs)
  onboarding.tsx       - Multi-step style quiz
  add-item.tsx         - Add wardrobe item (camera/gallery)
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
  wardrobeBlueprint.ts - WardrobeSlot model, per-style blueprints, getProfileBlueprint, slot matching
assets/
  body_types/          - Illustrated body shape images (hourglass, pear, apple, rectangle, inverted triangle, athletic)
  recommendations/     - Sample images for wardrobe slots (19 flat-lay fashion photos)
```

## WardrobeSlot Blueprint System
- Dynamic per-style-goal blueprints defined in `constants/wardrobeBlueprint.ts`
- 6 curated blueprint sets: minimal, elevated, bold, romantic, classic, youthful
- `getProfileBlueprint(profile)` selects items based on:
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

## User Preferences
- Quiet luxury aesthetic
- No emojis in the app
- Inter font family throughout
