---
name: Wardrobe gap diagnosis
description: How and when to surface WardrobeGapCard — must gate on engine output, not weather metadata alone.
---

# Wardrobe Gap Diagnosis

**Rule:** `WardrobeGapCard` must only be shown AFTER the recommendation engine has returned zero valid outfits. Never show it based solely on weather + wardrobe metadata inspection.

**Why:** The spec explicitly prohibits equating "cold/rain + no outerwear category" with "no valid outfit". A garment not categorised as 'outerwear' (e.g. a heavy wool cardigan tagged as 'top') can still satisfy weather requirements, and the engine would find a valid outfit with it.

**Correct flow:**
```
Engine returns 0 outfits (engineFound = false)
       ↓
diagnoseWeatherGap(engineFound, weather, items, weatherEnabled)
       ↓
'cold-rain' | 'cold' | 'rain' | null
```

**Key implementation details:**
- `lib/wardrobeGapDiagnosis.ts` — pure module with `diagnoseWeatherGap`, `hasWarmLayer`, `hasRainLayer`
- `hasWarmLayer` checks: `warmthBand in ['warm','hot']` OR `weight === 'heavy'` OR `fabric in WARM_FABRICS` — no category check
- `hasRainLayer` checks: `subType in RAIN_SUBTYPES` OR `fabric === 'leather' && weight === 'heavy'` — no category check
- Home screen: `todaysPick === null` is the engineFound=false proxy
- `COLD_THRESHOLD = 10°C`, `RAIN_THRESHOLD = precipProbability >= 0.6`

**How to apply:** Any future screen showing wardrobe gap intelligence must use `diagnoseWeatherGap` after getting engine output, not a standalone weather/wardrobe heuristic.
