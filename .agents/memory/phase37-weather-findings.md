---
name: Phase 3.7 weather findings
description: Rain filter gaps and MILD weather outerwear gate causing empty pools — what was found and fixed in Phase 3.7.
---

## Rain-averse subtypes gap in isRainFriendly

**Rule:** `isRainFriendly()` in `constants/weatherPure.ts` now has `RAIN_AVERSE_SUBTYPES = new Set(['sandals','espadrilles','flip-flops','wicker-bag'])`. Before Phase 3.7 these returned `true` (neutral default). Always add open-toed footwear and woven bags to this set.

**Why:** External evaluator flagged sandals + wicker-bag as rain-inappropriate but production returned true for both (no fabric specified). B15 failed CT because of this mismatch.

**How to apply:** When adding new shoe or bag subtypes that are open-toed or woven natural fibre, add them to `RAIN_AVERSE_SUBTYPES` in `weatherPure.ts`. Tests live in `__tests__/weather.test.ts` under `isRainFriendly`.

## Shoe + bag rain filter was missing from outfit assembly

**Rule:** In `constants/outfitRotation.ts`, shoe and bag selection now applies `isRainFriendly` when `wxRainy=true`. Before Phase 3.7 only outerwear heroes were rain-filtered.

**Why:** Sandals and wicker-bag could appear in rainy-day outfits because the filter only covered `outerwear` heroes (line 327). Shoes were picked from `shoesAll` without any rain check; bags from `bagsAll` without any rain check.

**How to apply:** If adding new item categories to outfit assembly, add a `(!wxRainy || isRainFriendly(item))` filter to any pool that may contain rain-averse items.

## MILD weather (lowC=10°C) triggers outerwearRule='required'

**Rule:** `outerwearRule(weather)` returns `'required'` when `weather.lowC < 12`. MILD in benchmarks uses `lowC: 10`, which is below this threshold. Any test wardrobe using MILD weather MUST include at least one outerwear item or the pool will be empty (every outfit candidate fails the `if (wxRule === 'required' && !coat) continue` gate).

**Why:** B03, B24, C09 all had MILD weather but no outerwear → pool=0. These were legitimate empties (not pipeline bugs), fixed by adding outerwear to B03/B24 wardrobes and removing weather from C09.

**How to apply:** When writing benchmark scenarios with MILD weather (lowC=10 in the test fixture), always include at least one outerwear item unless the scenario is specifically testing the empty-pool-on-missing-outerwear behaviour.
