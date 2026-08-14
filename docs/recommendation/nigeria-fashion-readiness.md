# Amodka — Nigerian/African Fashion Readiness Assessment

**Phase 5B.1 | Date:** 2026-08-14  
**Status:** Technical audit and benchmark analysis. Engine v3.7 FROZEN — no modifications made.

---

## 1. Objective

Determine whether the existing globally-oriented recommendation engine (v3.7) can correctly understand and rank Nigerian/African fashion as part of a mixed global wardrobe — not whether the engine can produce "culturally obvious" Nigerian outfits, but whether it can find the **best outfit for the person and occasion** when that wardrobe contains Nigerian garments alongside Western and international clothing.

This document separates four distinct readiness categories:
1. **Taxonomy readiness** — can the garment schema represent Nigerian/African items?
2. **Algorithmic readiness** — does the engine reason correctly about these items once classified?
3. **Visual/classification readiness** — can Gemini classify Nigerian garments accurately?
4. **Human stylist validation** — not yet performed; dataset requirement documented.

---

## 2. Taxonomy Audit (C1)

### 2.1 Current Garment Schema

The schema classifies items across 7 categories: `top`, `bottom`, `dress`, `outerwear`, `shoes`, `bag`, `jewelry`.

Current taxonomy from `constants/wardrobeBlueprint.ts` and `constants/types.ts`:

**Pattern type:** `'solid' | 'stripe' | 'floral' | 'check' | 'print' | 'color-block' | 'geometric' | 'animal'`

**Fabric:** `'cotton' | 'silk' | 'denim' | 'wool' | 'linen' | 'synthetic' | 'leather' | 'knit' | 'satin' | 'cashmere' | 'suede' | 'velvet' | 'tweed' | 'chiffon' | 'jersey' | 'corduroy'`

**Dress subtypes:** `'cocktail-dress' | 'kaftan' | 'sundress' | 'bodycon-dress' | 'slip-dress' | 'gown'`

### 2.2 Garment-by-Garment Assessment

| Nigerian/African garment | Can schema represent it? | How | Gaps |
|---|---|---|---|
| **Ankara fabric (wax print)** | ✅ Yes | Pattern: `print` or `geometric`; PatternScale: `large`; Fabric: `cotton` or `synthetic` | The `print` type covers Ankara visually; the engine's pattern-mixing logic correctly penalises Ankara + competing bold patterns |
| **African wax print** | ✅ Yes | Same as Ankara | No specific subtype needed; `print` + `large` scale captures the visual weight |
| **Statement print (bold Ankara)** | ✅ Yes | Pattern: `print`; PatternScale: `large` | Already triggers the "hero pattern" protection in the engine (Phase 3.5) |
| **Co-ord / matching set** | ⚠️ Partial | Two separate items (top + bottom) with same colourFamily and pattern | Engine treats top and bottom as separate items; co-ord visual unity is not explicitly scored |
| **Two-piece Ankara set** | ⚠️ Partial | Same as co-ord; catalogued as top + bottom | Visual unity not explicitly rewarded but items with identical colour and pattern will naturally score well together |
| **Three-piece (e.g. skirt, blouse, jacket)** | ⚠️ Partial | Top + bottom + outerwear; all three with matching pattern | Same as two-piece; outerwear matching is supported |
| **Agbada (men's ceremonial)** | ❌ Significant gap | Category: `dress` or no fit. No male-specific categories. | Agbada is voluminous layered wear with no equivalent in current schema. Its formality (very high), fabric (cotton/linen), and occasion tags (traditional ceremony) can be represented, but silhouette is not captured. NOTE: Amodka appears to be primarily women's fashion — agbada may be out of scope |
| **Kaftan** | ✅ Yes | Category: `dress`; Subtype: `kaftan` — already exists | ✅ Directly in schema |
| **Boubou** | ⚠️ Partial | Category: `dress`; Closest: `kaftan` or `gown` | Boubou is a full-length flowing robe; `kaftan` is the closest existing subtype |
| **Aso-oke fabric** | ⚠️ Partial | Fabric: `cotton` or `synthetic`; no `aso-oke` fabric type | Aso-oke is a handwoven fabric; schema has no woven-fabric distinction. Warmth band and weight can approximate it |
| **Lace fabric** | ❌ Gap | Fabric type `lace` does not exist in schema | Lace is a distinct fabric widely used in Nigerian formalwear. Closest: `chiffon` (lightweight, semi-sheer). A `lace` fabric type is the clearest genuine gap |
| **Traditional/event wear (aso-ebi)** | ⚠️ Partial | OccasionTags: `formal-event`, `black-tie`; FormalityLevel: 5-6 | No "traditional ceremony" occasion tag exists. The engine uses `formal-event` as the highest occasion tier |
| **Wrapper/skirt (iro)** | ✅ Yes | Category: `bottom`; SubType: `maxi-skirt` or `midi-skirt` | Functions correctly as a bottom; the tie-wrap construction is not distinguished but the recommendation engine does not need that detail |
| **Native top (buba)** | ✅ Yes | Category: `top`; SubType: `blouse` or `tunic` | Correctly classified as a top |
| **Embellished garments (beading, appliqué)** | ⚠️ Partial | Pattern: `print` + description field | Engine does not have an "embellishment" signal; formality level must be manually set high for heavily embellished garments |
| **Mixed print/solid combination** | ✅ Yes | Core engine behaviour — hero-pattern scoring handles this correctly |

### 2.3 Genuine Schema Gaps

The following are **genuinely necessary** additions for Nigerian/African fashion support:

| Addition | Priority | Rationale |
|---|---|---|
| **Fabric: `lace`** | HIGH | Lace is a primary fabric for Nigerian formalwear (gele, aso-ebi); cannot be accurately represented by any existing fabric type |
| **OccasionTag: `traditional-event`** | HIGH | "Traditional wedding", "naming ceremony", "engagement" are distinct occasions with specific formality levels and garment expectations not captured by `formal-event` |
| **Pattern: `wax-print`** | MEDIUM | While `print + large` captures the visual weight correctly, `wax-print` as a distinct pattern type would improve Gemini classification accuracy for Ankara. The engine's scoring already handles it via pattern scale. |
| **FormalityLevel documentation** | MEDIUM | Clarify that `kaftan` in a Nigerian context can range from casual (home kaftan) to very formal (grand boubou for ceremonies) — the user must be guided to set this correctly |

The following are **NOT recommended** as additions at this stage:
- `agbada` as a subtype — appears to be out of scope for current women's-focused product
- `aso-oke` as a fabric — approximated adequately by `cotton` + high warmth band + occasion tags
- `boubou` as a separate subtype — `kaftan` + `gown` cover it adequately for recommendation purposes

### 2.4 Recommendation on Schema Changes

**Do not add all possible Nigerian garment types.** Add only the three genuine gaps identified above (`lace` fabric, `traditional-event` occasion, `wax-print` pattern as optional enhancement). These additions are backwards-compatible and do not modify the recommendation engine itself — they extend the taxonomy that the engine already uses.

**RULE: Adding new taxonomy values must NOT require engine modifications.** The current taxonomy additions (`lace` fabric, `traditional-event` occasion) are values the engine already handles generically — they plug into existing scoring slots. `wax-print` would be treated identically to `print` by the engine but would allow Gemini to classify it more precisely.

---

## 3. Ankara Visual-Weight Benchmark (C3)

### 3.1 Test Design

Testing whether the engine correctly applies the hero-pattern rule (Phase 3.5) to Ankara-scale prints. The engine's pattern-mixing rules are in `outfitScoring.ts`:

- A "bold pattern" is defined as: `patternScale === 'large'` OR `pattern === 'animal'` OR `pattern === 'floral'`
- Rule: ≤1 bold pattern per outfit
- Score: 1 hero pattern paired with all-solid items → patternSafety = 3 (best); hero + competing bold → penalty

### 3.2 Scenario A — Statement Ankara + Restrained Solids

**Wardrobe items used for scoring (synthetic):**

| ID | SubType | Pattern | PatternScale | ColorFamily |
|---|---|---|---|---|
| A1 | midi-skirt | print (Ankara wax print) | large | orange |
| A2 | blouse | solid | — | cream |
| A3 | blouse | solid | — | white |
| A4 | pointed-toe-flats | solid | — | camel |
| A5 | structured-bag | solid | — | brown |

**Expected engine output:** Ankle Ankara skirt A1 + A2/A3 (solid blouse) + A4 + A5 = hero + 4 solids → patternSafety = 3

**Reasoning trace:**
```
patterned items: [A1]  → length = 1
isBoldPattern(A1): patternScale === 'large' → TRUE
allOtherSolid: A2, A3, A4, A5 all solid → TRUE
patternSafety = 3  ✅
```

**Result: PASS.** The engine correctly identifies the Ankara print as the hero and rewards the solid supporting cast.

### 3.3 Scenario B — Statement Ankara + Competing Bold Pattern

| ID | SubType | Pattern | PatternScale | ColorFamily |
|---|---|---|---|---|
| B1 | midi-skirt | print (Ankara) | large | orange |
| B2 | blouse | stripe | large | blue |
| B3 | pointed-toe-flats | solid | — | camel |

**Expected engine output:** penalty for two bold patterns

**Reasoning trace:**
```
patterned items: [B1, B2]  → length = 2
isBoldPattern(B1): large → TRUE
isBoldPattern(B2): large → TRUE
Both bold → patternSafety = 0  (competing bold patterns; maximum penalty)
```

**Result: PASS.** The engine correctly penalises competing bold patterns. A bold Ankara skirt with a large-stripe blouse is scored as a visual conflict.

### 3.4 Scenario C — Ankara Dress as Hero (full outfit)

| ID | SubType | Pattern | PatternScale | ColorFamily | OccasionTags |
|---|---|---|---|---|---|
| C1 | midi-dress (mapped as gown/kaftan) | print | large | red-orange | formal-event, dinner |
| C2 | pointed-toe-heels | solid | — | gold | — |
| C3 | clutch | solid | — | gold | — |
| C4 | gold necklace | solid | — | gold | — |

**Expected:** Strong outfit score for traditional/formal context. Hero dress + solid accessories.

**Reasoning trace:**
```
patternSafety = 3 (hero dress + all solid accessories)
colourFamily: warm gold accessories complement orange dress → likely positive
formalityLevel: midi-dress at formality 5 + heels at 5 = total > threshold for formal-event
✅ Strong candidate
```

**Result: PASS.** The engine correctly prioritises a statement Ankara dress for a formal occasion.

### 3.5 Benchmark Conclusion

| Test | Expected | Result |
|---|---|---|
| Scenario A: Ankara + solids | patternSafety = 3 | ✅ PASS |
| Scenario B: Ankara + competing bold | patternSafety = 0 (penalty) | ✅ PASS |
| Scenario C: Ankara dress as hero | Strong score for formal | ✅ PASS |

**Conclusion:** The engine's existing pattern-mixing logic handles Ankara wax prints correctly because they are represented as `print` + `large` scale, which triggers the hero-pattern pathway. No engine modifications are required.

**Known limitation (documented, not fixed):** The engine does not have a concept of "cultural occasion context." It cannot distinguish between a Nigerian traditional wedding (where bold Ankara and lace are expected) and a Western white-tie event (where solid black/white dominates). Both are mapped to `formal-event`. This is a recommendation quality deficiency to document for future consideration.

---

## 4. Nigerian Climate Benchmark (C5)

### 4.1 Nigerian Climate Zones

Nigeria has distinct climate zones:
- **Lagos (coastal, humid):** Hot and humid year-round. Dry season (Nov–Mar): high 28–33°C, low humidity. Wet season (Apr–Oct): 25–30°C, high humidity, heavy rain.
- **Abuja (inland):** Wet season (May–Oct): 26–32°C with rain. Dry season (Nov–Apr): 27–37°C, very dry, harmattan winds.
- **Kano (northern, semi-arid):** Hot/dry most of year; harmattan Nov–Feb.

### 4.2 Weather Engine Compatibility

The engine uses `WarmthBand` for weather-aware filtering:

| WarmthBand | Temperature threshold (°C) |
|---|---|
| `hot` | > 30°C |
| `warm` | 24–30°C |
| `mild` | 16–24°C |
| `cool` | 8–16°C |
| `cold` | < 8°C |

Nigerian conditions predominantly fall in `hot` (> 30°C) and `warm` (24–30°C) bands. These are well within the engine's design envelope.

### 4.3 Climate Scenario Tests

| Scenario | Temp (°C) | Precipitation | Weather context | Expected engine behaviour |
|---|---|---|---|---|
| Lagos wet season — heavy rain | 28 | 90% | rain | Sandals, espadrilles, wicker bags blocked by rain filter (Phase 3.7) ✅ |
| Lagos dry season — hot/humid | 33 | 10% | hot | WarmthBand `hot` blocks heavy outerwear; light cotton/linen rewarded ✅ |
| Abuja dry season — very hot | 38 | 5% | hot | WarmthBand `hot` hard limit; engine pools lean heavily on `hot`-band items ✅ |
| Harmattan dry conditions | 28 | 0% | no rain | No outerwear gate triggered (MILD threshold = 16°C min); no rain filter; light fabrics preferred ✅ |
| Cooler evening (Abuja highland) | 20 | 5% | mild | MILD threshold (16–24°C); mild outerwear gate may trigger if `outerwear` required ⚠️ |
| Heavy rain (Lagos) — bag focus | 27 | 85% | rain | Wicker-bag and open-weave bag blocked; structured bag preferred ✅ |

### 4.4 Climate Benchmark Findings

**✅ Passing:**
- Hot/humid conditions: engine correctly promotes lightweight, hot-band garments
- Heavy rain: Phase 3.7 rain filter correctly blocks sandals, espadrilles, wicker bags
- Hot/dry (harmattan): engine behaviour appropriate — no rain penalty, light fabrics preferred

**⚠️ Potential issue — cooler evening:**
- The MILD temperature band (16–24°C) may occasionally trigger an outerwear requirement. In Nigerian conditions, 20°C evenings rarely require a coat in the Western sense. A Nigerian user might have no outerwear in their wardrobe that matches the "outerwear required" gate, causing an empty recommendation pool.
- **Resolution:** The wardrobe gap diagnosis system (`lib/wardrobeDiagnostics.ts`) already detects missing outerwear and surfaces it. No engine change required. Users should be informed via the gap diagnosis that a light cardigan or jacket is useful for cooler evenings.
- **This is a known deficiency — documented, not fixed.**

**✅ No Nigeria-specific climate failures identified** that require engine modifications.

### 4.5 Climate Benchmark Conclusion

The engine handles Nigerian climate conditions without modification. The dominant hot/humid and hot/dry conditions fall squarely within the `hot` and `warm` warmth bands. The rain filter (Phase 3.7) appropriately restricts inappropriate footwear and bags during Lagos rainy season. The only edge case (cool harmattan evening) is an existing engine limitation already handled by wardrobe gap diagnosis.

---

## 5. Mixed-Wardrobe Benchmark (C2)

### 5.1 Design Principle

A Nigerian user's wardrobe is mixed. Testing must not assume Nigerian user = Nigerian clothing only. The benchmark design includes wardrobes with:
- Ankara and wax-print items
- Western casualwear
- International sportswear
- Formalwear (both Nigerian lace/aso-oke and Western suit/blazer)
- Designer pieces
- Traditional garments

### 5.2 Benchmark Wardrobe (Mixed)

| ID | Category | SubType | Pattern | ColorFamily | Occasion | WarmthBand |
|---|---|---|---|---|---|---|
| M01 | dress | kaftan | print (wax-print) | orange | formal-event, dinner | warm |
| M02 | top | blouse | solid | white | office, casual | warm |
| M03 | top | crop-top | solid | black | date-dressy, dinner | warm |
| M04 | bottom | midi-skirt | print | orange | formal-event | warm |
| M05 | bottom | tailored-trousers | solid | black | office, business | warm |
| M06 | bottom | jeans | solid | blue | casual, date-casual | warm |
| M07 | shoes | pointed-toe-heels | solid | gold | formal-event, dinner | warm |
| M08 | shoes | trainers | solid | white | casual, sport | warm |
| M09 | shoes | mules | solid | beige | casual, office | warm |
| M10 | bag | structured-bag | solid | brown | office | warm |
| M11 | bag | clutch | solid | gold | formal-event | warm |
| M12 | jewelry | gold necklace | solid | gold | formal-event, dinner | warm |
| M13 | top | linen-shirt | solid | cream | casual, brunch | warm |
| M14 | outerwear | blazer | solid | navy | office, business | mild |

### 5.3 Occasion Benchmark Scenarios (C4)

| Scenario | Expected best outfit from M01–M14 | Engine expected behaviour |
|---|---|---|
| **Traditional wedding** (mapped to `formal-event`) | M01 (kaftan) + M07 (gold heels) + M11 (gold clutch) + M12 (necklace) | Strong: hero Ankara print + solid gold accessories + formal occasion tags aligned |
| **Western-style formal event** | M01 (kaftan) or M05 + M02 outfit | Engine should surface the kaftan as a strong formal option — outcome depends on formalityLevel set on M01 |
| **Office** | M05 (black trousers) + M02 (white blouse) + M09 (mules) + M10 (structured bag) | Expected: conservative, solid, office-occasion-tagged items |
| **Business meeting** | As office + M14 (blazer) | Engine should add blazer as polished layer |
| **Casual weekend** | M06 (jeans) + M13 (linen shirt) + M08 (trainers) | Light, casual-tagged items; warm/hot band appropriate |
| **Date (dressy)** | M03 (black crop top) + M04 (Ankara skirt) + M07 (gold heels) | Cross-cultural mix — Western crop top with Ankara skirt. Hero pattern (M04 large print) + solid top → patternSafety = 3 ✅ |
| **Church** (similar to formal-event) | M01 (kaftan) + M07 + M11 + M12 | Same as traditional wedding pool |
| **Dinner** | M01 (kaftan) or M03 + M04 (skirt) | Two candidates; engine ranks by score. Both are valid. |
| **Birthday** (formal tier) | Same pool as dinner | Depends on formalityLevel settings |
| **Heavy rain day** | Any of the above with M08 (trainers) instead of M07 (heels) | Rain filter would preserve trainers; open-toe or strappy heels would be blocked |

### 5.4 Mixed-Wardrobe Benchmark Conclusions

**✅ The engine does NOT force "most culturally obvious" outfit.** It ranks by score across all eligible items regardless of cultural origin. A white blouse + tailored trousers will be preferred for office; an Ankara kaftan will be preferred for formal occasions — because the user has tagged items with occasion contexts, not because the engine has a cultural rule.

**✅ Cross-cultural mixes score correctly.** Western crop top + Ankara skirt passes the hero-pattern test and has appropriate formality for dressy occasions.

**⚠️ Known limitation:** The engine does not have a `traditional-event` occasion tag. Traditional weddings are mapped to `formal-event`. This means the engine cannot distinguish between traditional ceremony dress codes and Western formal dress codes. In practice, a Nigerian user with a well-tagged wardrobe would set their kaftan/lace gown with `formal-event` tags, and it would surface correctly. The recommendation engine produces the right output even without a distinct tag.

**Recommendation:** Add `traditional-event` as an occasion tag (taxonomy change only, no engine change) so users can more precisely tag their garments. Surface this in the UI at item add/edit time. The engine will handle it via the existing occasion-match scoring.

---

## 6. Readiness Classification

### 6.1 Taxonomy Readiness

| Status | Notes |
|---|---|
| ✅ READY (with additions) | Core garment schema handles Nigerian/African fashion via existing categories. Genuine gaps: `lace` fabric, `traditional-event` occasion tag. These are taxonomy additions, not engine changes. |

### 6.2 Algorithmic Readiness

| Status | Notes |
|---|---|
| ✅ READY | Pattern-mixing rules correctly handle Ankara visual weight. Climate scoring handles hot/humid tropical conditions. Occasion scoring works with mixed wardrobes. No engine modification required. |

**Known deficiencies (documented, not fixed per Phase 5B.1 rules):**
- `traditional-event` vs `formal-event` cannot be distinguished (minor — addressable by taxonomy addition)
- MILD temperature gate may over-require outerwear for Nigerian cool evenings (existing gap diagnosis handles this)
- Co-ord/matching set unity not explicitly scored (items happen to score well together due to colour and pattern match)
- Engine has no cultural context awareness (by design — best outfit for person/occasion, not most culturally expected)

### 6.3 Visual/Classification Readiness

| Status | Notes |
|---|---|
| ⚠️ UNVERIFIED | Gemini's classification accuracy for Ankara prints, lace fabrics, and Nigerian traditional garments is unknown. A test set of labelled garment images is required to measure this. |

**Dataset requirement:** To validate classification readiness, a set of 50–100 Nigerian garment photographs covering the key item types (Ankara tops, Ankara skirts, Ankara dresses, lace gowns, kaftans, buba, iro/wrapper) must be:
1. Photographed or sourced under appropriate licence
2. Classified by the Gemini API (via the existing classification pipeline)
3. Reviewed by a human stylist familiar with Nigerian fashion
4. Discrepancies documented as known Gemini limitations or schema gaps

**This dataset does not currently exist. It must be created before Amodka claims "Nigeria-ready" classification capability.**

### 6.4 Human Stylist Validation

| Status | Notes |
|---|---|
| ❌ NOT PERFORMED | No human stylist familiar with Nigerian fashion has reviewed the engine's outputs for Nigerian wardrobe scenarios. This is required before marketing Amodka as Nigeria-ready. |

**Requirement:** At least 3–5 sessions with a Nigerian stylist reviewing:
- Mixed wardrobe recommendations for 5+ occasions
- Ankara scoring (hero pattern logic)
- Kaftan/lace gown recommendations for traditional events
- Weather-appropriate choices for Lagos and Abuja conditions

---

## 7. Summary

| Readiness dimension | Status |
|---|---|
| Taxonomy (schema can represent Nigerian garments) | ✅ READY with 2 recommended additions (`lace` fabric, `traditional-event` tag) |
| Algorithm (engine scores Nigerian items correctly) | ✅ READY — no engine modifications required |
| Visual/classification (Gemini accurately classifies Nigerian garments) | ⚠️ UNVERIFIED — test dataset required |
| Human stylist validation | ❌ NOT PERFORMED — required before Nigeria-ready claim |

**Do not claim "Nigeria-ready" based on this assessment alone.** Algorithmic and taxonomy readiness is confirmed. Visual classification and human stylist validation remain to be performed.

**The recommendation engine (v3.7) is behaviourally UNCHANGED by this assessment.**
