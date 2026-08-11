# PHASE 3 — AuraCloset Outfit Intelligence & Recommendation Engine Forensic Audit

---

## 1. Actual Recommendation Architecture

### Complete Flow

```
Wardrobe items (all)
  → passesConstraints()     — hard gate: colorAversions, noSleeveless, noShortSkirts, maxHeelHeight
  → itemFitsSeason()        — hard gate: seasonTags vs calendar month
  → eligible[]              — the filtered candidate pool for all downstream work

For each scenario in SCENARIOS:
  → scoreItemForProfile(item, scenario, profile, mood)  — per-item score, sorted descending per category
  → pickHeroCandidates(eligible, scenario, profile, 6)  — top 6 by distinctiveness × scenario fit, score ≥ 4
  → weather gate on outerwear heroes

  For each hero:
    → Build core(s): dress solo | top + receding bottoms (×3) | bottom + receding tops (×3)
    → coreFitsScenario() + coreFitsMood()  — hard gates per core

    For each core:
      → Select shoe(s): harmonizing preferred → sorted by recedeScore, top 3
      → Select coat: hero outerwear OR pickWeatherCoat() when wxRule = 'required'
      → Select bag: recede-sorted, harmonizing preferred, active companions respected
      → Select jewelry: first available (one piece only)

      → Hard gates: formalitySpread > 3, ≥3 large-scale patterns, double-volume top+bottom,
                     crop+short, metal clash (when metalPreference set)

      → itemScore = Σ scoreItemForProfile(itemᵢ) × itemAffinityMultiplier(affinity, itemᵢ.id)
      → comboScore = scoreOutfitCombo(outfit, items, profile, season)
         → comboScore.total ×= comboPairAffinityMultiplier(affinity, itemIds)  [premium only]
      → rawTotal = itemScore + comboScore.total
      → reactionAdjusted = rawTotal + adjustScoreForReactions(fingerprint, reactions, today, itemIds)
      → totalScore = reactionAdjusted + wornHistoryBoost(fingerprint, wearHistory, today)
      → rationale = generateRationale(outfit, items, profile, mood, hero.id, undertoneScore)

  → Fallback if no heroes qualify: top 6 dresses + top 6 tops with harmonizing bottoms

  → Sort scoredPool descending
  → Round-robin interleave by heroId (hero diversity)

result = Record<OccasionTag, OutfitSet[]>

applyDailyRotation():
  1. applyFreshnessOrder()          — recently worn → end of pool
  2. applyHeroDiversityOrder()      — yesterday's heroes → end
  3. applyCompletenessBias()        — shoes+bag+jewelry = +1 confidenceScore, re-sort
  4. tieredShuffle(pool, seed)      — stable-sort by score, Fisher-Yates within each third
  5. cursor advancement (per scenario, day-of-week work nudge)
  6. cross-scenario dedup (same fingerprint → first occurrence wins)
```

---

## 2. Every Decision Variable

| Factor | Used? | Where | Type | Notes |
|---|---|---|---|---|
| Occasion tags (item) | ✓ | `scoreItemForProfile` +5 | Soft score | Tags inferred by server; high influence |
| SubType | ✓ | `SCENARIO_AFFINITY` +3, `SUBTYPE_FORMALITY`, `STYLE_GOAL_SUBTYPES`, hero selection | Score + hard gate | Single most-linked data field |
| Color family | ✓ | `classifyPalette`, `colorsHarmonize`, `STYLE_PREFERRED_COLORS`, `UNDERTONE_FLATTERING`, `MOOD_COLORS`, `HAIR_FLATTERING` | Score + filter | Pervasive |
| Perceptual color (HSL) | ✓ | `temperatureHarmony`, `valueSpread`, `saturationDominance`, `itemHsl`, `recedeScore` | Combo score | Falls back to centroid for legacy items |
| Perceptual color (Lab) | Captured, **unused** in recommendation | Stored on item | — | `dominantLab` captured at upload but never consumed by outfitScoring/Rotation |
| Accent color | Partial | `colorAversions` check only | Hard gate | `accentColor` stored on item but **not** used in palette harmony scoring |
| Formality | ✓ | `SUBTYPE_FORMALITY`, `effectiveFormality`, `getScenarioFormality`, spread gate | Score + hard gate | Stored `formalityLevel` unreliable (see comment); subtype lookup preferred |
| Pattern | ✓ | `patternSafety`, hard gate | Score + hard gate | |
| Pattern scale | ✓ | `patternSafety` (large/small distinction), hero distinctiveness, `recedeScore` | Score | Scale contrast rewarded |
| Fabric | ✓ | `textureHarmony`, `recedeScore`, `distinctivenessScore`, `MOOD_FABRICS`, `inferFabric` fallback | Score | Falls back to subtype guess |
| Fabric weight | ✓ | `textureHarmony` cool-season progression | Score | |
| Fit / silhouette | ✓ | `proportionBalance`, `recedeScore`, `bodyTypeProportion`, double-volume gate | Score + hard gate | Only 'loose'/'oversized'/'slim'/'tailored' recognized; 'straight'/'regular' = neutral |
| Neckline | ✓ | `FACE_SHAPE_NECKLINE`, `necklineJewelry` | Score | Only fires when faceShape and neckline both present |
| Sleeve length | Captured, **unused** | Stored on item | — | Captured by Gemini but no rule consumes it |
| Rise | Captured, **unused** | Stored on item | — | Captured by Gemini but **zero** downstream rules use it |
| Warmth band | Partial | `effectiveWarmth`, weather coat selection | Score | Only used for outerwear candidates |
| Style goal (color) | ✓ | `STYLE_PREFERRED_COLORS` +5 primary, +1 secondary | Soft score | Dominant per-item signal |
| Style goal (silhouette) | ✓ | `STYLE_GOAL_SUBTYPES` +3 primary | Soft score | |
| Off-brief penalty | ✓ | −3 when item matches neither style goal color nor silhouette | Soft score | Applied to non-neutrals, non-jewelry |
| Body type | ✓ | `BODY_TYPE_FLATTERING` +3, `bodyTypeProportion` | Score | Per-item and per-combo |
| Height band | ✓ | `heightProportion`, petite stripe penalty | Score | |
| Face shape | ✓ | `FACE_SHAPE_NECKLINE` ±2 | Score | Optional field |
| Undertone | ✓ | `UNDERTONE_FLATTERING` +4, `undertoneHarmony`, `COOL/WARM_CLASHING` | Score | Full-outfit undertone check |
| Skin tone | ✓ | `HIGH_CONTRAST_COLORS` +1 | Score | Weak signal |
| Eye color | ✓ | `EYE_COMPLEMENTARY` +1 | Score | Weak signal |
| Hair color | ✓ | `HAIR_FLATTERING` +2 | Score | |
| Contrast level | ✓ | `contrastMatch` +2 | Score | |
| Metal tone | ✓ | `metalCohesion`, metal mismatch gate | Score + hard gate | |
| Metal preference | ✓ | Jewelry item scorer +2, hard gate | Score + hard gate | |
| Mood | ✓ | `MOOD_COLORS/SUBTYPES/FABRICS` up to +10, `coreFitsMood` hard gate | Score + hard gate | One of the strongest single-day signals |
| Industry | ✓ | `getScenarioFormality('interview')` | Score | Only affects interview formality band |
| Life phase | ✓ | Comfort silhouette +1, fit bonus +1 | Score | Soft; max +2 |
| Season | ✓ | `itemFitsSeason` | Hard gate | Calendar-based, northern hemisphere |
| Weather | ✓ | `outerwearRule`, warmth matching, rain filter | Hard gate + score | Respects user `weatherEnabled` toggle |
| Completeness | ✓ | Shoes +4, bag +3, jewelry +3, outerwear +1, completenessBias +1 | Score | Structurally dominant |
| Reactions | ✓ | `adjustScoreForReactions` ±20 exact / ±6 item-level | Score | Strongest short-term influence |
| Wear history | ✓ | `wornHistoryBoost` +10/+16 | Score | Strongest long-term influence |
| Affinity (item) | ✓ | `itemAffinityMultiplier` [0.7, 1.3] | Multiplier | Cold-start safe |
| Affinity (pair) | ✓ | `comboPairAffinityMultiplier` [0.8, 1.2] | Multiplier | Premium only; cold-start safe |
| Premium tier | ✓ | Pair affinity enabled, 4 vs 2 outfits/scenario | Capability | Affects diversity, not quality directly |
| Scenario availability | ✓ | `SCENARIOS` list filters premium-only scenarios | Availability | interview/wedding/travel/resort/night-out = premium |
| Hero distinctiveness | ✓ | `distinctivenessScore` ≥ 4 gate | Candidate gate | Upstream of all scoring |
| modelConfidence | Display only | Wardrobe badge | — | Not used in any recommendation logic |
| Color temperature (HSL-derived) | ✓ | `temperatureHarmony` via `temperatureOf()` | Combo score | Warm/cool/neutral classification |

**Captured but completely unused in recommendations:** `dominantLab`, `accentColor` (in palette harmony), `rise`, `sleeveLength`.

---

## 3. Scoring Model Reconstruction

### Per-Item Score

```
scoreItemForProfile(item, scenario, profile, mood):

  Scenario fit (max +8):
    +5  item.occasionTags.includes(scenario)
    +3  SCENARIO_AFFINITY[scenario].includes(item.subType)

  Formality band (max +2):
    +2  effectiveFormality(item) within [scenMin, scenMax]
    +1  within [scenMin-1, scenMax+1]

  Style goal — color (max +6):
    +5  item.colorFamily in STYLE_PREFERRED_COLORS[primaryGoal]
    +1  item.colorFamily in STYLE_PREFERRED_COLORS[secondaryGoal]

  Style goal — silhouette (max +3):
    +3  item.subType in STYLE_GOAL_SUBTYPES[primaryGoal]

  Off-brief penalty (only when primaryGoal set, not jewelry, not true neutral):
    -3  item matches NONE of (primary/secondary color, primary/secondary subtype)

  Undertone (max +4):
    +4  item.colorFamily in UNDERTONE_FLATTERING[undertone]

  Skin depth contrast (max +1):
    +1  (skinTone in {'very-light','very-dark','dark'}) AND (colorFamily in HIGH_CONTRAST)

  Eye complementary (max +1):
    +1  item.colorFamily in EYE_COMPLEMENTARY[eyeColor]

  Body type (max +3):
    +3  item.subType in BODY_TYPE_FLATTERING[bodyType]

  Hair × color (max +2):
    +2  item.colorFamily in HAIR_FLATTERING[hairColor]

  Metal × undertone / preference (jewelry only, max +2):
    +2  metalPreference === item.metalTone
    +1  item.metalTone in METAL_FOR_UNDERTONE[undertone]

  Mood (max +10, only when mood set):
    +2  colorFamily in MOOD_COLORS[mood]
    +3  subType in MOOD_SUBTYPES[mood]
    +2  fabric in MOOD_FABRICS[mood]
    +3  item.mood.includes(mood)

  Life phase comfort (max +2, when lifePhase set):
    +1  subType in {wrap-dress, maxi-dress, wide-leg, cardigan, blazer, long-sleeve}
    +1  fit in {'loose', 'oversized', 'regular'}

  Petite stripe penalty:
    -1  heightBand === 'petite' AND pattern === 'stripe' AND patternScale !== 'small'

  Face shape × neckline (±2):
    ±   FACE_SHAPE_NECKLINE[faceShape][item.neckline]  (range −2 to +2)

  Theoretical max (no mood): ≈ 30
  Theoretical max (with mood): ≈ 40
```

### Combo Score

```
scoreOutfitCombo(components, items, profile, season):

  Completeness (max +11):
    +4  shoes present
    +3  bag present
    +3  jewelry present
    +1  outerwear present

  Palette (max +6):
    classifyPalette(colorFamilies) → scorePaletteType():
      mono → +6 | neutral-only → +5 | analogous → +5 | neutral-bridge → +4
      complementary → +4 | triadic → +3 | clash → 0

  Formality cohesion (max +3):
    Spread of effectiveFormality across all items:
      ≤1 → +3 | ≤2 → +2 | ≤3 → +1 | >3 → -2

  Pattern safety (max +2):
    0 patterned → +2
    1 patterned, bold → +2; 1 patterned, small → +1
    2 patterned, same type → -3; 2 both large different → -3
    2 patterned, scale contrast (1 large + 1 small) → +1
    2 patterned, both small different type → 0
    3+ patterned → -4

  Contrast match (max +2):
    contrastLevel=high + outfit has dark+light → +2
    contrastLevel=low + no dark+light mix → +1
    contrastLevel=medium → +1

  Pieces (max +2):
    ≥4 components → +1; ≥5 → +1

  Proportion balance (max +2):
    volume top + slim bottom (or vice versa) → +2
    two-volume → -2
    crop + short → -2 (also hard gate)
    otherwise fitted → +1; dress tailored → +1

  Metal cohesion (±2):
    2+ unique metals, user prefers mixed → +1
    2+ unique metals, no mixed pref → -2
    1 metal, matches preference → +1
    1 metal, wrong preference → -1

  Temperature harmony (via HSL):
    all neutral → +1 | single temperature → +2
    mixed, heavily neutral-bridged → 0
    mixed, some bridging → -1
    unbridged warm+cool → -2

  Value spread (via HSL lightness):
    spread < 0.10 → -2 | 0.10–0.20 → 0 | 0.20–0.50 → +2
    0.50–0.70 → +1 | >0.70 → 0

  Saturation dominance (via HSL, chromatic items only):
    1 chromatic, sat ≥ 0.55 → +2 | 1 chromatic, lower → +1
    multi: hero-second gap ≥ 0.20 → +1
    two high-sat competing → -2 | borderline → -1

  Texture harmony (core items: top/bottom/dress/outerwear):
    1 statement fabric → +3
    2+ statement fabrics → -3
    all flat fabrics → -2
    2 shiny fabrics (silk/satin/leather) → -2
    cool season (fall/winter) + lighter top/heavier bottom or heavier outer/lighter base → +1
    3+ core items, all same weight → -1

  Body-type proportion (max +2):
    pear/apple: slim top + wide-leg bottom → +2
    pear/apple: volume top + wide-leg bottom → -2
    inverted-triangle: A-line bottom → +1
    rectangle: curved/flared silhouette → +1
    hourglass/athletic: fitted dress → +1; slim top + slim bottom → +1

  Hemline × shoe harmony (max +1):
    ankle boots + midi/culottes hemline → -2
    ankle boots + mini or cropped hemline → +1
    heels + mini or midi hemline → +1

  Height proportion (max +2, petite/tall only):
    petite + mono top/bottom color → +2
    petite + cropped outerwear + slim/high-rise bottom → +1
    petite + long outerwear (loose) + wide-leg → -1
    petite + maxi + flats → -1
    petite + horizontal wide stripe → -1
    tall + maxi silhouette → +1
    tall + mono top/bottom → +1
    tall + crop top + low-rise → -1

  Undertone harmony (max +2, not neutral undertone):
    all garments in flattering palette → +2
    one flattering accent + neutral bridge → +1
    1 clashing garment → -1; 2+ → -2 (cap)

  Neckline × jewelry (max +1 per piece):
    turtleneck + necklace → -2; collared/off-shoulder/halter + necklace → -1
    crew/scoop/v-neck/square/boat + necklace → +1
    turtleneck/collared/off-shoulder/halter + earrings → +1

  TOTAL = sum of all above
  Theoretical max: ≈ +35
  Theoretical min: ≈ −20
```

### Final Score Formula

```
rawTotal = Σᵢ [scoreItemForProfile(itemᵢ, scenario, profile, mood)
               × itemAffinityMultiplier(affinity, itemᵢ.id)]
         + comboScore.total [× comboPairAffinityMultiplier(affinity, allItemIds) — premium only]

reactionAdjusted = rawTotal
  + exact-fingerprint love (≤14d: +8; decaying to +2 minimum)
  + exact-fingerprint not-today (≤3d: −20; ≤7d: −12; ≤14d: −6; ≤28d: −2)
  + per-item love (≤14d: +1.5/item, capped ±6 per item)
  + per-item not-today (≤7d: −2.2/item, decaying)

totalScore = reactionAdjusted + wornHistoryBoost
  wornHistoryBoost:
    worn ≤60d: +10 base; worn >60d: +6 base
    +2 per additional wear (cap +6)
    −2 if worn in last 2 days
```

**Hard gates applied after scoring (reject = candidate dropped):**
- `formalitySpread > 3` across all items
- `largePatterned.length >= 3`
- `top.fit && bottom.fit && both isVolume`
- `crop-top && (mini-skirt || shorts || mini-dress)`
- `metalPreference set && !mixed && metals.size >= 2`

---

## 4. Most Influential Factors

### Top 10 Strongest Positive Influences

1. **Completeness stack (shoes + bag + jewelry):** Contributes +11 to combo score, +1 from `completenessBias`, plus the item scores of three additional well-fitting pieces. A complete outfit has a structural +12–25 point advantage over an incomplete one. This is the single largest additive block and reliably dominates pool ranking.

2. **Wear history boost:** +10 for recently worn, +16 maximum with repeat wears. This is the largest single-event number in the system and easily trumps all styling signals for an outfit with significant wear history.

3. **Style goal color (per item, primary):** +5 per item × number of outfit pieces. A 5-item outfit where all pieces match the primary style goal color adds +25 before any styling quality is assessed. For focused wardrobes with a clear style goal, this overwhelms other signals.

4. **Love reaction (recent):** +8 exact fingerprint within 14 days + up to +6 item-level = +14 maximum from a single love event. Decays slowly.

5. **Not-today reaction (inverse — worst negative):** −20 within 3 days. Because this is the single largest negative in the system, avoiding it is the most powerful positive: outfits that have *never* been "not-today'd" maintain their full raw score while rejected alternatives are deeply penalized.

6. **Mood alignment:** When mood is set, up to +10 per item (if color, subtype, fabric, and user tag all align), acting as a powerful daily filter. Additionally, `coreFitsMood` eliminates competing non-mood-aligned outfits, so the mood-aligned outfit faces a smaller competition pool.

7. **Undertone match:** +4 per item in the flattering undertone palette. For a 5-item outfit with all matching undertone colors, this contributes +20 item-score, comparable to the style goal color signal.

8. **Texture harmony (exactly one statement):** +3 to combo score, plus it elevates the hero to high distinctiveness (statement fabric = +5 in `distinctivenessScore`). Outfits built around a silk or leather hero have a consistent advantage.

9. **Palette type (mono/analogous):** +5–6 to combo score. In combination with completeness, a mono palette full outfit has a structural starting advantage of ~+17 before any personalization signals.

10. **Scenario affinity:** +8 per item (max: +5 occasionTags + +3 SCENARIO_AFFINITY). In a well-tagged wardrobe, all items in a scenario-appropriate outfit contribute this — +40 total for a 5-item work outfit where every piece is work-appropriate.

### Top 10 Strongest Negative Influences / Penalties

1. **Not-today reaction (≤3 days):** −20. Eliminates even excellent outfits from the daily pool for several days. Larger in magnitude than any positive styling signal.

2. **Hard gate: formality spread > 3:** Complete candidate elimination. An otherwise excellent outfit pairing stilettos (f=7) with a hoodie (f=1) is simply dropped (spread = 6).

3. **Hard gate: double-volume top + bottom:** Complete elimination. No exception exists for intentional styling of this type.

4. **Two statement textures:** −3 combo (`textureHarmony`) + −4 per supporting item (`recedeScore`). The leather-jacket-over-silk-slip combination — one of fashion's most iconic pairings — is penalized by −3 in the combo scorer even though it's a deliberate editorial choice.

5. **Pattern safety violations:** −3 (same pattern type × 2, or 2 large-scale different types), −4 (3+ patterned). These are significant and can outweigh multiple positive styling signals.

6. **All-flat fabrics:** −2 combo score. Most everyday wardrobes (cotton + denim + synthetic) are all-flat by default. This is a persistent drag on ordinary outfits.

7. **Unbridged warm/cool temperature clash:** −2 to combo, on top of any off-brief penalty on individual items.

8. **All mid-tone value (spread < 0.10):** −2. A perfectly cohesive outfit where every piece happens to land in the mid-tone band is penalized for lack of contrast, even when this is intentional minimalism.

9. **Off-brief penalty:** −3 per item that matches neither the primary nor secondary style goal's colors or silhouettes (and isn't a true neutral or jewelry).

10. **Not-today reaction (item-level, ≤7 days):** −2.2 per item across all outfits containing that item, capped at −6 per item.

### Hidden Dominance

**1. Completeness overwhelms outfit quality.** A mediocre outfit with shoes + bag + jewelry (structural +11 combo + +1 bias + item scores) will reliably outrank a striking but incomplete outfit. In practice, this means a dull-but-complete look beats an elegant two-piece look whenever the latter lacks accessories.

**2. Reactions dominate everything short-term.** A loved+worn outfit accumulates +8 (love) + up to +16 (wear history) = +24 above its base score. Meanwhile a not-today'd outfit loses −20 within 3 days. This 44-point swing is larger than the entire potential range of styling quality signals in combo score (≈ +35 to −20 = 55-point range). Effectively, for active users with feedback history, the reaction score is the primary ranking signal, not outfit quality.

**3. Mood hard gate eliminates large portions of the wardrobe.** When mood is "soft," any core containing black, red, or burgundy is eliminated entirely — not penalized, gone. In wardrobes where every warmer item happens to be black or burgundy (common), a "soft" mood day can produce very few candidates or trigger the fallback path.

**4. Style goal color creates color monotony.** +5 per item for primary goal colors drives the engine to construct outfits where all pieces are from the same narrow color palette. The engine has no signal for "too much of a single palette family."

**5. WornHistoryBoost ↔ freshnessOrder tension.** A recently worn, well-loved outfit has score boosted by +10–16 from `wornHistoryBoost` during pool generation. During rotation, `applyFreshnessOrder` pushes it to the end of the ordered pool. But `applyCompletenessBias` then re-sorts by score, and `tieredShuffle` re-sorts by score again within tiers — which re-elevates the high-score worn outfit back to the top third. The freshness ordering is effectively neutralized for outfits with large wear history boosts.

**6. Hero threshold gatekeeps neutral wardrobes.** `pickHeroCandidates` requires `distinctivenessScore ≥ 4`. In a wardrobe of predominantly neutral items (common for "minimal" or "classic" users), many pieces receive the neutral dampener (−2) plus the flat-fabric penalty (−1), scoring below 4. The fallback path then generates outfits without the hero+recede architecture, producing less intentionally styled results for the users who arguably need the most help.

---

## 5. Expert Stylist Audit

### Colour

**What the engine genuinely understands:**

The engine understands the fundamentals well. The 12-slot colour wheel correctly identifies analogous, complementary, and clash relationships. The perceptual layer (temperature, value spread, saturation dominance) adds real sophistication: it knows that same-temperature outfits read cohesive, that all mid-tone looks read muddy, and that exactly one saturated piece should carry the visual weight. The neutral bridge concept is textbook and correctly implemented.

**What the engine cannot distinguish:**

*Tonal dressing.* A sophisticated tonal outfit — cream blouse, ecru trousers, ivory heels — reads as mono palette (+6) and is indistinguishable from a flat navy-on-navy look also classified as mono. The engine cannot reward intentional variation-within-a-family.

*Sophisticated vs boring neutrals.* Navy + camel + cream (a classic palette used by every great stylist) scores identically to grey + taupe + stone (unremarkable). Both are "neutral-only" (+5). The engine has no concept of what makes a neutral combination interesting.

*Accent colour impact.* `accentColor` is captured at upload — a navy blazer might have `accentColor: 'gold'` for its buttons. This signal is ignored in palette harmony. A cool-undertone user wearing a warm gold accent on an otherwise cool outfit would receive no signal about the temperature tension.

*Near-neutral chromatics.* Olive, navy, and brown are classified as neutrals (`hue: null`) in `COLOR_WHEEL`. This is a judgment call: they behave more like neutrals in practice (wide compatibility), but it means olive + burgundy or navy + burgundy are classified as neutral-bridge (+4) when they could alternatively be read as analogous chromatics.

*Undertone temperature within chromatics.* A warm burgundy and a cool lavender sit at hue positions 0 and 9 respectively — distance 9 on the 12-slot wheel, near-complementary (+4). The warm-cool tension between them is real to a stylist. The hue-wheel approach treats them as a valid complementary pair when a colour consultant might see them as needing a bridge piece.

### Proportion

**What the engine correctly handles:**

The volume/slim balance is well-designed: the hard gate on double-volume and the `proportionBalance` score correctly reward pairing one relaxed piece with one fitted piece. The body-type-specific rules are stylistically accurate. Height-proportion rules are textbook.

**What the engine cannot distinguish:**

*Rise.* This is the most glaring gap. A high-rise wide-leg trouser with a tucked slim blouse creates a clean waist definition and reads tailored. A mid-rise wide-leg with an untucked blouse reads formless. A low-rise wide-leg with a cropped top creates a proportionally confusing silhouette. All three receive identical scoring because `rise` is never consumed.

*The semantics of 'straight' and 'regular' fit.* The proportion system only recognises `'loose'/'oversized'` as volume and `'slim'/'tailored'` as sleek. A `'straight'` or `'regular'` fit is neither — the proportion balance check silently skips it. This is the silent case for most items in most wardrobes.

*Torso length.* The engine knows height band (petite/average/tall) but not torso length. A petite woman with a long torso wears cropped pieces completely differently from a petite woman with a short torso.

### Pattern

**What the engine correctly handles:**

The scale-contrast model (large + small = valid editorial choice = +1; same pattern type × 2 = costume = −3) is genuinely sophisticated. This correctly rewards intentional scale contrast, which is how professional stylists actually mix patterns.

**What the engine cannot distinguish:**

*Colour ground of a pattern.* A navy-and-white pinstripe suit trouser is visually far quieter than a red-and-yellow floral blouse, even both classified as "large-scale patterned." The engine treats them identically.

*Horizontal vs vertical stripe orientation.* The engine knows `pattern === 'stripe'` and `patternScale`. It does not know the stripe is horizontal vs vertical. The petite horizontal-stripe penalty fires for any non-small stripe regardless of orientation.

*Pattern narrative.* A Western-themed outfit reads cohesive despite mixing textures and patterns because the pieces share a stylistic language. The engine has no concept of stylistic narrative.

### Formality

**What the engine correctly handles:**

The formality band system with industry-adjusted interview is genuinely useful. The hard gate prevents egregious mismatches. The SUBTYPE_FORMALITY lookup is an accurate proxy for perceived formality.

**What the engine cannot distinguish:**

*Overdressed vs appropriate.* A gown (f=9) and a cocktail dress (f=7) both pass the wedding formality gate [6,9]. A stylist knows the difference.

*Social context nuance within a scenario.* "Date-casual" covers coffee, lunch, and a low-key first date. A stylist would dress differently for each.

### Texture and Fabric

**What the engine correctly handles:**

The statement/flat/shiny taxonomy is astute. The rule that exactly one statement texture carries a look while two fight (+3 vs −3) is what experienced stylists actually follow.

**What the engine cannot distinguish:**

*Leather jacket over silk slip.* This is one of the most iconic contemporary combinations — the structured over the delicate, rough over soft. The engine scores it −3 (two statement textures). There is no exception for the case where the texture contrast is the deliberate point.

*Summer fabric appropriateness.* Linen is mapped as `undefined` in SUBTYPE_FABRIC. A linen wide-leg trouser receives no fabric signal, contributing nothing to texture harmony scoring.

*Relative texture weight within "statement."* Velvet, leather, satin, and cashmere are all equally "statement." But a velvet blazer in winter is far more context-appropriate than a satin skirt at the same event.

---

## 6. Adversarial Recommendation Testing

### Scenario A — Colour Trap

**Profile:** elevated style goal. Cool undertone. **Wardrobe:** silk camel blouse, navy trousers, white button-down, grey cashmere sweater.

**Expected best outfit (stylist):** Camel silk blouse + navy trousers — silk is the statement texture (+3 texture, +5 distinctiveness for the hero), camel + navy is a classic elevated pairing.

**Algorithmic result:** Camel IS in elevated primary colors (+5 style goal); white is NOT. Camel blouse with silk statement texture scores significantly higher on both style goal color and distinctiveness. **Algorithm gets this right.**

---

### Scenario B — Matching-Set Trap

**Profile:** work scenario. **Wardrobe:** navy blazer, navy trousers, grey trousers, white blouse.

**Option A (stylist-wrong):** Navy blazer + navy trousers. `classifyPalette(['navy','navy','white'])` → all neutral → `neutral-only` (+5 palette).

**Option B (stylist-right):** Navy blazer + grey trousers + white blouse. `classifyPalette(['navy','grey','white'])` → all neutral → `neutral-only` (+5 palette — identical).

Both options score identically on palette, formality cohesion, completeness.

**Assessment: Algorithm fails to distinguish.** A stylist immediately knows that navy blazer + navy trousers reads as a wrongly-assembled suit. The engine sees only colorFamily = navy for both, producing identical palette scores. **This is a genuine quality gap with no current remedy.**

---

### Scenario C — Proportion Trap

**Profile:** petite height band. **Wardrobe:** oversized t-shirt (fit: loose), slim jeans (fit: slim), wide-leg trousers (fit: loose), ankle boots.

**Option A (stylist-right):** Oversized t-shirt + slim jeans. `proportionBalance`: volume top + slim bottom → +2. ✓

**Option B (stylist-wrong):** Oversized t-shirt + wide-leg trousers. Hard gate: loose top + loose bottom → **eliminated**. ✓

**Assessment: Algorithm handles this correctly.** However, if either piece were tagged 'straight' or 'regular' fit (neither 'loose' nor 'slim'), neither the hard gate nor the proportion bonus would fire. The proportion system is silently neutral for a large fraction of real-wardrobe items.

---

### Scenario D — Pattern Trap

**Wardrobe:** large floral midi-dress (hero), narrow-stripe trousers, solid black jeans.

**Algorithmic result:** The floral dress generates as a solo core (dress hero = solo). The stripe trousers are never combined with the dress because a dress hero doesn't pair with separate tops/bottoms.

**Assessment: Algorithm avoids the trap by architecture.** Accidentally correct — the dress-as-solo-core design prevents pattern mixing with the hero dress.

---

### Scenario E — Formality Trap

**Profile:** work scenario, corporate. **Wardrobe:** grey blazer, white blouse, navy trousers (all f=6), dark jeans (f=3).

Blouse + trousers: every piece in-band → +2 formality each. Jeans + blazer: jeans f=3 = one step below min → +1 formality only.

**Assessment: Algorithm partially handles this.** The blouse + trousers scores higher on formality. However, it cannot distinguish "smart casual Friday" from "executive meeting" within the same "work" scenario.

---

### Scenario F — Weather vs Style

**Profile:** lowC = 6°C (outerwear required). Silk midi-dress in wardrobe with cream wool coat.

`outerwearRule` → 'required'. `pickWeatherCoat` finds cream wool coat (warmth=cold, within ±1 of needed=cool, harmonizes). Coat added. If no acceptable coat: `wxRule === 'required' && !coat` → outfit dropped.

**Assessment: Algorithm handles weather correctly.** It doesn't serve an impractical outfit. Graceful degradation when no acceptable coat exists.

---

### Scenario G — Body-Proportion Trap

**Profile:** pear body type. Option A: wide-leg trousers + slim-fit blouse. Option B: midi-skirt + oversized sweater.

Option A: `bodyTypeProportion` fires for WIDE_BOTTOM (wide-leg) + slim top → **+2**. Plus both items in pear flattering set → +3 each.
Option B: midi-skirt not in WIDE_BOTTOM → bodyTypeProportion doesn't fire. Only midi-skirt gets pear flattering bonus (+3).

**Assessment: Algorithm correctly ranks A above B.** The wide-leg + slim-top combination for pear shapes is correctly prioritized.

---

### Scenario H — Accessory Overload

**Wardrobe:** gold earrings, gold necklace, gold bracelet, gold ring.

**Algorithmic result:** `const jewel = jewelAll.find(j => !usedIds.has(j.id))` — **finds exactly one** jewelry item.

**Assessment: Algorithm avoids overload by design.** The limitation is that the algorithm can never recommend a genuinely accessorized look (earrings + necklace together). The `necklineJewelry` scorer is sophisticated enough to reason about multiple jewelry types, but the generation loop only ever adds one.

---

### Scenario I — Neutral Monotony

**Wardrobe:** black cotton t-shirt, white trousers, grey sneakers, beige tote, silver earrings.

Palette: neutral-only → +5. Value spread: l range ≈ 0.05 to 0.97 → spread ≈ 0.92 → 0. Saturation: all achromatic → 0. Texture: all flat → −2. Total combo ≈ +13+.

**Assessment: Algorithm fails to detect boredom.** The all-neutral cotton look scores reasonably well (+13+ combo) with no signal that anything is visually underdeveloped. The −2 all-flat penalty is insufficient to flag the combination as lacking interest. No focal point, no visual hierarchy — yet competitive score.

---

### Scenario J — Excessive Coordination

**Wardrobe:** camel cashmere sweater, camel wool trousers, camel leather flats.

Palette: mono (+6). Cashmere = statement, leather = statement → two statements → −3. Value spread: all camel at similar lightness → −2. Total from colour signals ≈ +6−3−2 = +1.

**Assessment: Algorithm partially detects the problem.** The two-statement-texture and all-mid-tone penalties catch aspects of the excessive coordination. However, the mono palette score (+6) still rewards the head-to-toe camel look before these penalties apply, and in some fabric configurations (all-flat camel) the outfit scores reasonably well with no stronger signal that this is over-coordinated.

---

### Scenario K — Duplicate Wardrobe Items

**Wardrobe:** two nearly identical dark blue jeans (different IDs, same subType, same colorFamily).

Both are sorted in `byCategory['bottom']` by profile score. Both may appear in different cores (for different hero tops). Hero round-robin interleaves them. Cross-scenario dedup only catches identical fingerprints within one day.

**Assessment: Algorithm mostly handles this.** In a wardrobe with many identical items, the pool could contain several near-identical outfits. The engine doesn't detect near-duplicate outfits, only exact-ID duplicates.

---

### Scenario L — Wear-History Trap

**Setup:** Outfit A (recently worn, 1 day ago): rawTotal 45 + wornHistoryBoost (+10 −2 damper = +8) = **53**. Outfit B (fresh, similar styling): rawTotal 43.

Rotation pipeline:
1. `applyFreshnessOrder`: A pushed to end: [B, …, A]
2. `applyHeroDiversityOrder`: A's hero also pushed to end
3. `applyCompletenessBias`: Re-sorts by score → A (53) rises above B (43): [A, B, …]
4. `tieredShuffle`: Re-sorts by score within tiers. A in top third. B in middle.

**Assessment: Algorithm fails the freshness intent.** The freshness ordering is systematically overridden by the score-based re-sorts. An outfit worn yesterday with a strong wear history boost will surface in tomorrow's top-of-pool position. The system creates a feedback loop: wearing an outfit boosts its score, which undoes each freshness demotion.

---

### Scenario M — Reaction-Feedback Trap

**Setup:** User loves their red blazer (affinity multiplier = 1.3 max). Today's scenario: resort.

`scoreItemForProfile(blazer, 'resort', profile)` ≈ 0 or negative (blazer not in resort SCENARIO_AFFINITY, not in resort occasionTags, formality f=6 outside resort band [1,4]).

`0 × 1.3 = 0`. The multiplier does not manufacture score from zero.

**Assessment: Algorithm correctly handles this.** The affinity multiplier amplifies existing fit, not off-scenario suitability. However, within appropriate scenarios, the loved item with 1.3× multiplier can outcompete better-in-context alternatives, reinforcing stylistic ruts.

---

### Scenario N — Occasion Ambiguity

**Setup:** "Work" scenario — Tuesday creative meeting vs Thursday board presentation.

**Assessment: Algorithm cannot distinguish.** The engine produces the same recommendations for both occasions. The formality score correctly differentiates items within the work band, but cannot signal "wear your most formal combination today." This is a product scope limitation.

---

### Scenario O — Scarcity

**Setup:** Vivid emerald midi-dress (hero). Only shoes: white sneakers (f=1) and tan sandals (f=3).

Sneakers: formalitySpread = |5−1| = 4 → hard gate → **dropped**. Sandals: spread = |5−3| = 2 → passes. Outfit proceeds with tan sandals.

**Assessment: Algorithm handles scarcity gracefully.** It correctly eliminates the formality-inappropriate sneakers and uses the best available harmonizing option. The outfit appears in the pool with best available shoe rather than being dropped.

---

## 7. "Mathematically Good, Stylistically Bad"

### Case 1: The Over-Coordinated Monochromatic Blazer Set

**Situation:** Burgundy blazer, burgundy midi-skirt, burgundy heels, black bag, black earrings.

**Why the algorithm likes it:** Palette: neutral-bridge (+4). Completeness (+10). Formality cohesion: spread=1 → +3. Value spread: 0.25 → +2. Temperature: single warm → +2. Total combo ≈ +19.

**Why a stylist would reject it:** A burgundy blazer with a burgundy midi-skirt reads as a wrongly-assembled suit — or worse, as someone who bought separates that were supposed to be kept apart. A stylist would immediately break the matching by pairing the blazer with cream or camel trousers.

**Missing concept:** The distinction between intentional same-fabric matching-set (coordinate) and accidental same-color coordination (unintentional). The engine has no awareness of whether two same-color items are a designed set.

**Problem type:** Missing relationship (coordinate-set awareness) + scoring limitation.

---

### Case 2: The Pristine All-Neutral Bore

**Situation:** Navy trousers, white blouse, nude heels, tan tote, gold earrings.

**Algorithm score:** Palette: neutral-only (+5). Temperature: all neutral → +1. Completeness: +10. Formality cohesion: → +3. All-flat fabrics: −2. Total ≈ +17+.

**Why algorithm likes it:** Every signal is minimally acceptable. No red flags. Completeness pushes it high.

**Why a stylist would be dissatisfied:** Navy + white + nude + tan is the styling equivalent of a grey sweatsuit — technically covered but aesthetically empty. No focal point, no tension, no reason to look twice. A stylist would demand either a statement texture, a single chromatic accent, or a silhouette that carries visual weight.

**Missing concept:** Visual interest as a distinct dimension. The algorithm has no signal for "is there anything worth looking at here?"

**Problem type:** Scoring limitation (no positive reward for visual interest) + missing relationship.

---

### Case 3: The Same-Temperature Pastel Stack

**Situation:** "Soft" mood day. Lavender blouse, pink midi-skirt, nude heels.

**Algorithm score:** Both lavender and pink are in MOOD_COLORS['soft'] → +2 mood color per item. Despite −1 temperature penalty and −1 saturation penalty, mood signal more than compensates.

**Why a stylist would be uneasy:** Lavender and pink together without a strong neutral anchor reads as if someone got dressed in the candy aisle. The pairing is hard to wear without looking childish unless there is a very specific styling instinct and strong texture contrast.

**Missing concept:** Within-mood sophistication. The mood system rewards any item that matches the mood; it doesn't evaluate whether the mood is being executed with sophistication or clumsiness.

**Problem type:** Weighting problem (mood signal too strong relative to palette sophistication) + missing contextual reasoning.

---

## 8. "Stylistically Excellent, Algorithmically Penalised"

### Case 1: The Leather Jacket Over Silk Slip Dress

**Combination:** Black leather jacket + ivory silk slip dress + black boots.

**Why a stylist loves it:** Structural over delicate, masculine over feminine, rough over smooth. One of the defining looks of the last 30 years.

**Algorithm score:** `textureHarmony`: leather = statement, silk = statement → two statement textures → **−3**. `recedeScore(jacket, dress_hero)`: heroIsStatement (silk) && itemIsStatement (leather) → **−4**. Net texture penalty alone: −7.

**Missing concept:** Intentional texture contrast as a deliberate styling choice. The algorithm's "exactly one statement texture" rule has no exception for the canonical structured-meets-delicate pairing.

---

### Case 2: Ankle Boots + Midi Skirt (French-Girl Staple)

**Combination:** Black ankle boots + floral midi skirt.

**Why a stylist approves:** One of the most broadly recommended contemporary styling combinations. The boot shaft creates a deliberate visual break that reads modern and European.

**Algorithm score:** `hemlineShoeHarmony`: midi hemline + ankle boots → **−2**. Always. No exception for context, body type, or styling intent.

**Missing concept:** Context-dependent hemline/shoe rules. The ankle-boot penalty is correct as a default but should have an exception for certain body types and styling intents.

---

### Case 3: A Tonal All-Neutral Look with High Textural Variation

**Combination:** Cream cashmere turtleneck + cream wide-leg wool trousers + beige leather loafers + camel structured tote.

**Why a stylist approves:** Quintessential quiet luxury. Intentionally restricted palette; interest comes entirely from texture (cashmere vs wool vs leather) and silhouette. This is exactly how Phoebe Philo would dress someone.

**Algorithm score:** Palette: neutral-only (+5). Cashmere = statement, leather = statement → **two statement textures → −3**. The engine penalizes the very combination that makes this sophisticated.

**Missing concept:** When the palette is deliberately restricted (all neutrals), texture variation becomes the primary expressive dimension, not a competing distraction. The engine has no awareness of this trade-off.

---

### Case 4: The High-Saturation Monochromatic

**Combination:** Red wrap dress + red heels.

**Why a stylist approves:** A deliberate head-to-toe bold colour statement. Completely valid evening or event choice.

**Algorithm score:** `saturationDominance`: two chromatic items, both high saturation, top − second < 0.20 → **−2** (two competing saturated pieces). No exception for when both pieces are intentionally the same colour — mono-colour equal saturation is not competition, it's coherence.

**Missing concept:** Saturation dominance assumes competition between pieces. In a mono-colour look, equal saturation is coherence. The check should exclude mono-palette outfits.

---

## 9. Candidate Generation Audit

### Hero Selection Issues

`pickHeroCandidates(eligible, scenario, profile, 6)` — hard limit of 6 heroes, `distinctivenessScore ≥ 4` threshold.

For a neutral wardrobe: items with neutral colorFamily + low saturation + flat fabric receive neutral dampener (−2) and flat-fabric penalty (−1). A perfectly cut white button-down scores: saturation 0 → 0, flat → −1, no signature silhouette → 0, neutral dampener (sat < 0.18) → −2. Total = **−3**. Well below ≥4 threshold.

A wardrobe of beautiful, high-quality neutral pieces — exactly the quiet-luxury wardrobe the product is aimed at — may produce **zero** hero candidates, triggering the fallback path.

**Fallback path limitations:** Uses `dresses.slice(0, 6)` and `tops.slice(0, 6)` without the hero+recede architecture. Supporting pieces are not selected for how well they recede around the hero, producing less intentionally styled outfits.

### Candidate Ceiling

| Wardrobe size | Hero limit | Cores per hero | Shoe options | Max candidates |
|---|---|---|---|---|
| Any | 6 | 3 (for top/bottom heroes) | 3 | 54 (capped at 30) |

For a large wardrobe (50+ pieces), the engine explores roughly 15–27% of the candidate space.

### Concrete Elimination Examples

1. **Season gate on correctly-tagged items:** Linen trousers tagged 'spring/summer' in November → hard-gated out, even if the user would choose them indoors.

2. **Mood hard gate with cream-dominant wardrobe:** `MOOD_CONTRA_COLORS['powerful'] = ['blush', 'pink', 'lavender', 'cream']`. A cream-dominant wardrobe produces zero mood-passing candidates on a "powerful" day.

3. **Hero threshold gate in neutral wardrobes:** A perfect-quality cotton t-shirt as hero? sat ≈ 0.05, flat −1, no signature silhouette, neutral dampener −2 → score ≈ −3. Can never be a hero.

---

## 10. Ranking & Rotation Audit

### Tiered Shuffle

Splitting the pool into thirds and shuffling within each third is a good design. Top-ranked outfits remain in the top third; the specific order is randomised daily by seed. This prevents stale top-of-pool experiences without exposing lower-quality outfits in premium slots.

### Hero Diversification

The round-robin interleaving by heroId in pool construction is excellent. It guarantees the pool surfaces multiple hero pieces before showing the second-best outfit built around hero #1. Combined with `applyHeroDiversityOrder` in rotation, this meaningfully prevents the same focal piece from dominating consecutive days.

### Where Diversification Becomes Harmful

**The wornHistoryBoost ↔ freshnessOrder conflict is the most significant quality issue in the rotation layer.** See Scenario L analysis.

The intent (show fresh alternatives first) is undone by the score-based re-sorts that follow it. A user who loved and wore an outfit yesterday will see it again today because each wear increases its score, which undoes each freshness demotion. The system creates a feedback loop.

**The goal should be:** Continue showing excellent outfits while intelligently avoiding unnecessary repetition. The current system achieves the first half but not the second.

### Cross-Scenario Dedup

The cross-scenario fingerprint deduplication (first occurrence wins) is correct and clean.

### Day-of-Week Work Nudge

Advancing the work cursor on weekends so Monday doesn't start stale. Low impact but directionally correct.

---

## 11. Personalisation Audit

### What the system learns

- **Item-level preferences:** Affinity multiplier [0.7, 1.3]. Loved items appear ~30% more prominently. Cold-start gated at 5 signals. Well-designed.
- **Pair-level preferences (premium):** Pair multiplier [0.8, 1.2]. More conservative, reflecting lower signal strength per pair.
- **Profile-based personalisation (static):** Style goal, body type, undertone, skin tone, eye color, hair color, height, face shape, metal preference, constraints. Set once, never auto-updated.

### What the system does NOT learn

**Style relationships.** A user who consistently loves outfits pairing structured top with fluid skirt has a preference for this volume relationship. The engine learns they love specific items — if the loved structured top is replaced, the preference for the relationship is lost.

**Occasion-specific taste.** Affinity signals from work and casual scenarios are pooled into a single item signal. An item loved in a work outfit gets the same affinity boost when recommended for a casual scenario.

**Trend responsiveness.** A user who starts reacting more positively to bolder pieces would need sustained signal accumulation before the 60-day half-life decay shifted the engine's weighting.

**Negative-space learning.** If the user never taps "not-today" but also never taps "love," the engine learns nothing. Passive acceptance is indistinguishable from muted engagement.

**The core distinction:** The system learns "I like this coat" and "I like this coat with these trousers." It does not learn "I prefer structured outerwear over casual outerwear." Taste evolution happens at the item-attribute level, not the rule level.

---

## 12. Explainability Audit

`generateRationale()` produces a one-sentence explanation from: palette phrase, mood phrase, body flattering note, hair × color harmony note, season note, statement fabric phrase, hero piece description, undertone coda.

### What the rationale reflects

- Palette type (correctly — "a quiet monochromatic palette")
- Hero piece ("built around your camel trench")
- Undertone harmony when score ≥ 2 ("in tones that work with your complexion")
- Mood alignment (when applicable)
- Body-flattering fit (when applicable)

### What the rationale systematically misrepresents

**The actual dominant signal.** If an outfit ranked first because `wornHistoryBoost` gave it +14 above its competitors, the rationale describes the palette, which may be secondary or irrelevant to why the outfit surfaced today.

**The reaction memory.** No rationale explains "this outfit appeared because you loved it recently." A user who sees the same beloved outfit recurring with no explanation may feel the system is repetitive rather than personalised.

**The formality decision.** If a blazer + trousers was chosen for work over jeans + blazer because of formality cohesion, the rationale says nothing about this.

**Proportion reasoning.** A wide-leg trouser paired with a slim blouse for a pear body type generates no proportion rationale. The body flattering note fires from body type alone but doesn't explain which specific pairing achieves the result.

**The contradiction risk.** If an outfit contains a navy blouse and the rationale says "a quiet monochromatic palette" (because most items are neutral), the sentence is technically correct (neutral-bridge) but feels misleading.

### Assessment

The rationale functions as a **static template engine**, not a **reasoning trace**. For outfits ranked primarily by wear history or reactions, it actively misrepresents the engine's logic.

---

## 13. Luxury / Premium Styling Standard

*Evaluating against: "Your quiet-luxury stylist in your pocket."*

### Where the engine can produce quiet-luxury results

When a wardrobe contains clear hero pieces (statement textures, distinctive silhouettes), a profile with complete undertone and style-goal data, and good accessory coverage, the engine reliably generates outfits that tick the boxes: one focal piece, supporting items receding, palette cohesion, appropriate formality. The hero+recede architecture is genuinely aligned with how a professional stylist thinks.

### Where it falls short

**Effortlessness requires quality judgement the engine lacks.** A well-cut camel coat that drapes properly communicates restraint; a budget camel coat reads careless. The engine has no awareness of quality tier.

**Restrained palette sophistication is undetected.** Navy + camel + ivory (classic and expensive-looking) and navy + taupe + stone (technically correct but flat) score identically. The sophistication of specific neutral choices is invisible.

**The neutral hero dampener works against the product positioning.** Quiet-luxury dressing relies on elevated neutral pieces (the perfect white shirt, the butter-soft cashmere, the impeccably tailored trouser). These score low on distinctiveness (neutral dampener applied) and may not be picked as heroes. The algorithm is biased toward vivid or heavily textured heroes — the opposite of quiet luxury.

**The engine produces styling suggestions, not styling opinions.** A real stylist says: "This is wrong, that's better, and here's why." The engine produces the best available combination without the ability to say "nothing in this wardrobe achieves the right result for this occasion."

---

## 14. Quantitative Quality Framework (Proposed External Evaluation)

*Not a change to the current system — a proposed benchmark for evaluating it.*

| Dimension | Proposed Weight | Definition and Rationale |
|---|---|---|
| Colour harmony | 20% | Does the palette read as intentional and cohesive? Evaluates not just whether colours technically work but whether the combination is interesting. Penalizes neutral monotony and excessive coordination equally. |
| Silhouette / proportion | 18% | Does each piece have a clear role in the overall volume composition? High scores for volume+structure contrast; penalties for double-volume or no-interest all-fitted looks where fit never varies. |
| Occasion appropriateness | 15% | Would a knowledgeable social observer read this outfit as correct for the stated context? Includes sub-scenario nuance that the current engine conflates. |
| Visual hierarchy | 12% | Is there exactly one piece the eye goes to first? Evaluates whether there is a clear hero-versus-support relationship rather than several competing focal points or no focal point at all. |
| Formality cohesion | 10% | Do all pieces sit within a coherent formality band? |
| Textural coherence | 8% | Does the fabric mix read intentional? Rewards one statement + supporting flat/mid; penalizes either all-flat boring or statement-on-statement excess. |
| Personalisation fit | 7% | How well does the outfit serve this specific user's profile? |
| Freshness / novelty | 5% | Has the user seen this recently? Is there something new in this recommendation? |
| Luxury / polish | 3% | Does the combination read considered and complete rather than assembled? |
| Practicality | 2% | Physically appropriate for the day? Largely handled by hard gates already. |

---

## 15. Stylist vs Algorithm Gap Analysis

| Capability | Current Engine | Expert Stylist | Gap | Severity |
|---|---|---|---|---|
| Colour harmony: adjacent, complementary, clash | Strong — 12-slot wheel, clash pairs, bridge logic | Exactly this + warm/cool nuance | Engine misses undertone interaction within chromatics | P2 |
| Tonal dressing (same hue, different shades) | Classified as mono (+6) — no shade variation signal | Explicitly looks for shade layering as the expressive device | No within-family variation signal | P1 |
| Neutral combination sophistication | All neutral-only palettes score identically | Distinguishes classic (navy/camel/cream) from pedestrian (grey/beige/stone) | No weighting for specific neutral combinations | P1 |
| Accent colour impact | accentColor captured, not used | Always considers buttons, lining, trim as part of the palette story | Captured data wasted | P1 |
| Proportion: volume balance | Strong — isVolume/isSleek, hard gate on double-volume | Same + more granular body-shape context | Unrecognized fits ('straight', 'regular') are invisible | P1 |
| Rise impact on proportion | Not implemented | Always considers rise when pairing top + bottom | rise field entirely unused | **P0** |
| Fabric: summer appropriateness | Linen unmapped, season-fabric logic absent | Immediately identifies linen as summer texture | Season-aware fabric rules missing | P2 |
| Intentional two-texture contrast (leather + silk) | Penalized −3 as over-styled | Recognizes as a specific, valid editorial choice | False negative for a canonical combination | P1 |
| Ankle boots + midi hemline | Always penalized −2 | Recognizes as valid modern styling, not always a mistake | Context-blind rule | P1 |
| Matching set recognition | Navy blazer + navy trouser = high mono score | Immediately flags suit-fragment problem | Cannot distinguish intentional coordinate from accidental match | **P0** |
| Pattern narrative / stylistic coherence | Pattern scale and type; no thematic awareness | Reads whether patterns share a visual language | No concept of thematic coherence | P2 |
| Formality sub-context | 12 scenario bands, industry-aware interview | Garden party vs black-tie within same scenario | Intra-scenario differentiation absent | P2 |
| Neutral monotony detection | No penalty for all-neutral, no focal point | Would immediately demand an accent or textural interest | No minimum visual interest requirement | P1 |
| Single jewelry piece | Architecture limits to one | Would often recommend earrings + necklace or bracelet | One-piece jewelry ceiling | P1 |
| Saturation hero in mono outfit | Penalizes equal high-saturation pairs | Would reward a head-to-toe bold-colour statement | False negative for mono-bold looks | P1 |
| Context-aware hero selection | Neutral pieces dampened regardless of quality | Knows a perfect cashmere sweater IS the hero | Neutral hero dampener works against quiet luxury | P1 |
| Wear history / freshness balance | WornHistoryBoost overrides freshnessOrder | Would not keep surfacing the same well-loved outfit daily | Architectural tension in rotation layer | **P0** |
| Style relationship learning | Item and pair level only | Learns "prefers structure + fluid" as a rule | No rule-level learning; only item-level | P2 |
| Rationale accuracy | Palette/hero description; ignores dominant signal | Explains why this specific combination works | Rationale misrepresents actual ranking reasons | P2 |
| Sub-scenario context | Scenario = single band (e.g., "work") | Adjusts within scenario for meeting type, time of day | No sub-scenario signal | P2 |
| Rise + proportion interaction | Unused | Always ties rise to proportion advice | Hard data gap | **P0** |

---

## 16. Determine Whether Gemini Is Actually Needed

### Architecture A — Deterministic Engine Only (Current)

| Criterion | Assessment |
|---|---|
| Expected quality | 75/100 — strong on structure, weak on within-category sophistication |
| Latency | Zero (synchronous, entirely local) |
| Cost | Zero |
| Reliability | 100% — no external failure modes |
| Explainability | High — every decision is traceable to a specific rule |
| Hallucination risk | Zero |
| Scalability | Excellent — O(n) in wardrobe size |
| User experience | Instant, consistent |

Most identified quality gaps (rise usage, accentColor, matching-set detection, single-jewelry-piece ceiling, wear history balance) are fixable within the deterministic architecture. These are data utilization and rule gaps, not reasoning gaps.

### Architecture B — Deterministic Candidate Generation → Gemini Evaluates Shortlist

*Gemini receives 5–10 candidate outfits and ranks/scores them.*

| Criterion | Assessment |
|---|---|
| Expected quality | 82–85/100 — Gemini can distinguish the leather+silk editorial from the accidental two-statement, and recognise the matching-set problem |
| Latency | +2–4 seconds per pool generation (Gemini call per scenario per user) |
| Cost | ~$0.003–0.015 per user per day at current Gemini pricing |
| Reliability | Degrades when Gemini is unavailable; requires fallback to Architecture A |
| Explainability | Reduced — Gemini rationale may not reflect the actual scoring path |
| Hallucination risk | Moderate — Gemini can confabulate styling logic for visually weak outfits |
| Scalability | Cost and latency scale linearly with users and scenarios |
| User experience | Noticeable latency on first daily load |

The quality gain is real but not transformational. Gemini would improve mainly: matching-set detection, intentional texture contrast recognition, neutral sophistication discrimination. These are currently P1 gaps, not P0.

### Architecture C — Deterministic Engine → Gemini as Final Critic / Veto Layer

*Gemini fires only when top-3 outfits are within a narrow score band.*

| Criterion | Assessment |
|---|---|
| Expected quality | 78–80/100 — marginal improvement over A, below B |
| Latency | Conditional; fires infrequently for well-differentiated pools |
| Cost | Fraction of Architecture B |
| Reliability | Degrades when Gemini unavailable; fallback is A |
| Hallucination risk | Lower frequency than B; same per-call risk |

The "when necessary" trigger is the unsolved problem. Defining it precisely introduces a meta-decision that could be inconsistent.

### Recommendation

**Architecture A is the correct choice for now.** The justification:

1. The highest-severity gaps (P0: rise unused, matching-set trap, wornHistory/freshness conflict) are all solvable within the deterministic system — they don't require fashion sense, they require using existing data fields and fixing an architectural conflict.

2. The P1 gaps where Gemini would genuinely help (leather+silk intentional contrast, neutral sophistication, tonal layering) are meaningful quality improvements but not urgent enough to introduce the cost, latency, and reliability risk of an LLM in the hot path.

3. Gemini's highest leverage in this system would be as a *rationale generator* rather than a *scorer* — replacing the template-based rationale with a Gemini-written explanation that accurately reflects why the outfit was chosen. This is a user-experience improvement, not a recommendation-quality improvement, and it carries hallucination risk if not carefully grounded in the actual score breakdown.

4. If Gemini is introduced, the correct order is: fix P0 and P1 deterministic gaps first, then evaluate whether the remaining gap justifies the cost.

---

## 17. Five Highest-Leverage Improvements

### #1 — Use `rise` in proportion scoring

**Current problem:** `rise` (high-waisted/mid-rise/low-rise) is captured by Gemini for every item and stored on `WardrobeItem`. Zero downstream rules consume it. A high-waisted wide-leg trouser paired with a tucked slim blouse is the ideal pairing for a pear body and the ideal elongation technique for petite users. A mid-rise wide-leg with an untucked oversized blouse is a proportion mistake. The engine currently treats these identically.

**Evidence:** `rise` field in `WardrobeItem` type; no reference to `rise` anywhere in `outfitScoring.ts` or `outfitRotation.ts`.

**Proposed solution:** Add `rise` to the `proportionBalance` scorer and the body-type proportion scorer. High-waisted + slim top = +1 (clean waist definition). Low-rise + crop top on tall users = −1. High-waisted + oversized top = 0 (waist obscured, negates the benefit). High-rise + high-rise (two pieces both high-rise) = +0 (compatible).

**Expected improvement:** Directly improves pear/apple body-type recommendations and petite height proportion guidance. Fixes a genuine data-utilization gap with no additional data capture required.

**Complexity:** Low — additive rule to existing scorer. **Risk:** Low. **Priority:** P0.

---

### #2 — Resolve the WornHistoryBoost ↔ freshnessOrder conflict

**Current problem:** `wornHistoryBoost` raises the score of recently worn outfits by up to +16 during pool generation. `applyFreshnessOrder` then tries to push those same outfits to the end of the pool. But `applyCompletenessBias` and `tieredShuffle` re-sort by score, neutralizing the freshness demotion. The net result: loved outfits are shown repeatedly despite the freshness machinery being in place.

**Evidence:** The sequence in `applyDailyRotation` — freshness order → completeness bias (re-sorts by score) → tieredShuffle (re-sorts by score within tiers). The score raised by wornHistoryBoost is always larger than the positional demotion from freshness ordering.

**Proposed solution:** Apply freshness as a score penalty rather than a positional demotion. Subtract from `rawTotal` (e.g., −5 if worn within 2 days, −3 if within 4 days) rather than reordering the pool. This way, tieredShuffle correctly places the recently worn outfit in a lower tier rather than having the score re-elevate it. The `wornHistoryBoost` for outfits worn >7 days ago remains as an experience-honoring signal.

**Expected improvement:** Users see genuinely fresh combinations first, while well-loved outfits from 2+ weeks ago still surface appropriately. Fixes the most visible user-perceived quality problem.

**Complexity:** Low — change where freshness is applied in the pipeline. **Risk:** Low. **Priority:** P0.

---

### #3 — Include `accentColor` in palette harmony

**Current problem:** `accentColor` (e.g., gold buttons on a navy blazer, white stitching on dark denim) is captured by Gemini and stored on `WardrobeItem`. It is used only in the `colorAversions` hard gate. It is not included in `classifyPalette` or any temperature/harmony scorer. A navy blazer with gold accent over a cream blouse produces a warm/cool interaction (cool navy, warm gold accent, warm cream) that the engine is blind to.

**Evidence:** `accentColor` referenced only in `passesConstraints`. No reference in `colorTheory.ts` or `colorPerceptual.ts`.

**Proposed solution:** Include `accentColor` (when present) as a contributing color in `classifyPalette` with half the weight of the main `colorFamily` — it's an accent, not a primary. Also include it in the `temperatureHarmony` calculation so a warm-accent item isn't treated as a pure cool-family piece.

**Expected improvement:** Catches warm/cool accent conflicts the current engine misses. Rewards stylists who choose accessories that echo their outfit's accent colors. Utilizes already-captured data.

**Complexity:** Medium — requires updating `classifyPalette` to accept weighted colors. **Risk:** Low-medium. **Priority:** P1.

---

### #4 — Penalize neutral monotony with a visual-interest floor

**Current problem:** Outfits where every piece is neutral, every piece has near-zero saturation, and value spread is mid-range receive no specific penalty beyond −2 for all-flat fabrics. An all-neutral, all-mid-tone, all-flat-fabric outfit is the quintessential "I got dressed but not styled" look, yet it scores competitively because it has no active violations.

**Evidence:** Case 2 in §7. `saturationDominance` returns 0 for all-achromatic outfits (achromatic items are filtered from the chromatic pool). `valueSpread` only penalizes very low spread (<0.10). An all-neutral outfit with reasonable lightness range escapes both penalties.

**Proposed solution:** Add a visual-interest check: when all outfit items are neutral-family AND no item has a statement fabric AND saturationDominance returns 0, apply a −2 "no focal point" penalty. Exception: when `patternScale` is present or the palette is specifically `neutral-only` with high value spread (>0.50, indicating intentional light/dark contrast), the penalty is waived.

**Expected improvement:** Demotes the "accidental neutral-only" look below complete outfits with even one accent piece. Encourages the system to surface more interesting combinations when available. Does not penalize the intentionally minimal, high-contrast look.

**Complexity:** Low — additive check in `scoreOutfitCombo`. **Risk:** Low. **Priority:** P1.

---

### #5 — Allow two compatible jewelry pieces per outfit

**Current problem:** The outfit generator adds exactly one jewelry piece per outfit (`jewelAll.find(j => !usedIds.has(j.id))`). Real polished outfits frequently include earrings + necklace, or earrings + bracelet. The `necklineJewelry` scorer is already sophisticated enough to reason about both earrings and necklace interactions — it's wasted with a one-piece ceiling.

**Evidence:** Single `find()` call in `generateOutfitPool`. `necklineJewelry` in `scoreOutfitCombo` iterates `njJewelry` (resolved jewelry items) expecting potentially multiple pieces.

**Proposed solution:** After adding the first jewelry piece, attempt to add a second from a different jewelry subtype (e.g., if first is earrings, try to add a necklace or bracelet). Apply the `metalCohesion` check across both. Gate: only add a second piece when the first piece's subType is 'earrings' and a compatible second piece exists. This respects the existing `metalCohesion` logic and the `necklineJewelry` scorer.

**Expected improvement:** Significantly improves completeness scoring for complete-jewelry users. Produces more polished, styled looks. The `necklineJewelry` signal actually fires for both pieces rather than one.

**Complexity:** Low — extend the jewelry selection loop. **Risk:** Low. **Priority:** P1.

---

### Lower-Priority Improvements (for the record)

- **Matching-set detection:** Track when two items share colorFamily and are both not-jewelry, not-shoes → small similarity penalty (−1) unless they're the same fabric suggesting a coordinate set.
- **Sleeve length seasonal rules:** Summer = no heavy long-sleeve; winter = no sleeveless without outerwear.
- **Horizontal vs vertical stripe detection:** Extend `patternOrientation` to differentiate the petite horizontal-stripe penalty.
- **Sub-scenario signals:** User-supplied context tags ("important meeting," "garden party") that shift the formality target within a band.
- **Style relationship learning:** Extract recurring pairing types (volume+structure, monochrome+statement) from pair affinity to generate pattern-of-preference rules.

---

## 18. Final Verdict

### **STRONG**

The AuraCloset recommendation engine is genuinely more sophisticated than most commercial styling systems. The hero+recede architecture, the texture taxonomy, the proportional balance system, the perceptual HSL/Lab colour signals, the formality band system, and the affinity machinery are all evidence of careful engineering informed by real styling principles. Many adversarial scenarios that should expose weaknesses — weather-vs-style, body proportion, graceful scarcity handling, pattern scale contrast — are handled correctly.

The engine falls below **EXCEPTIONAL** because of four specific failure modes:

1. **The wornHistory/freshness conflict** means active users see favourites repeatedly — the most user-visible quality problem.
2. **Rise is captured but unused** — a P0 data gap that directly affects proportion quality for every trouser/skirt in the system.
3. **The neutral-sophistication gap** means the engine cannot distinguish a classic elevated neutral palette from an accidentally boring one — a critical gap for a product positioning on quiet luxury.
4. **The hero threshold disadvantages exactly-the-right-user** — a user with a minimalist, high-quality neutral wardrobe (the quiet-luxury user) produces fewer heroes and triggers the fallback path more often than a user with vivid statement pieces.

The engine is not **EXCEPTIONAL** but it is unambiguously **STRONG** — one architectural fix and three data-utilization improvements would move it meaningfully toward exceptional.

---

> **If AuraCloset launched tomorrow with this recommendation engine, what would be the three biggest reasons users might think "this app doesn't really understand fashion"?**

**1. "It keeps showing me the same outfit."**
A loved outfit that was worn recently accumulates enough score from `wornHistoryBoost` to neutralize the freshness ordering and surface repeatedly in the daily pool. Users notice this quickly and it undermines the "intelligent stylist" promise because a real stylist varies their suggestions.

**2. "All my outfits look the same."**
The style-goal color signal (+5 per item for primary goal colors) is strong enough to make most recommended outfits feel like variations on a single palette. For a "minimal" user, this means endless black/white/grey/beige combinations with different hero pieces but identical tonal range. The neutral-monotony gap amplifies this — the engine never demands visual interest when the wardrobe's pieces don't naturally provide it.

**3. "It doesn't get the little things right."**
Ankle boots under a midi skirt is one of the most common modern styling choices — the engine always penalises it. A leather jacket over a silk slip dress is an iconic combination — the engine always penalises it. A navy blazer with navy trousers scores as a good palette choice when a stylist would immediately say to mix them. These are not edge cases: they're everyday combinations that fashion-aware users will notice the engine getting wrong with regularity, quietly undermining trust in the recommendations.

---

**PHASE 3 STATUS: COMPLETE**

**CODE CHANGES: NONE**

**IMPLEMENTATION: NOT YET AUTHORISED**
