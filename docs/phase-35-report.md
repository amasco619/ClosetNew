# Phase 3.5 — Targeted Ranking Calibration: Report

## Overview

Phase 3.5 implemented three targeted calibrations on top of the Phase 3.4 scoring engine, each isolated and benchmarked before combining. The goal was to improve Top-1 ranking accuracy by teaching the engine two concepts it had no prior vocabulary for (focal-point competition, hero-pattern hierarchy) and strengthening a third signal that was too weak to compete with perceptual colour bonuses (silhouette weighting).

---

## Benchmark Instrument

All comparisons use `__tests__/benchmark-phase34.ts`:
- 30 competitive sets (A/B/C/D variants)
- 20 pairwise comparisons
- External rankings produced independently by fashion-trained evaluators

**Phase 3.4 baseline (confirmed before any Phase 3.5 work):**

| Metric | Baseline |
|---|---|
| Top-1 accuracy | 53% (16/30) |
| Top-3 capture | 97% (29/30) |
| Pairwise accuracy | 85% (17/20) |
| Mean regret | 4.2 pts |
| Median regret | 0 pts |
| Max regret | 22 pts |
| Kendall τ | 0.413 |

---

## 3.5A — Visual-Weight / Focal-Point Competition

### What was added

A new `focalCompetition` field in `OutfitScoreBreakdown` and a corresponding computation in `scoreOutfitCombo`.

**Signal design:**

A garment is classified as a "focal competitor" when it satisfies any of:
- **colour-led:** statement fabric (leather / silk / satin / cashmere / velvet) + vivid colour (saturation ≥ 0.55)
- **structure-led:** statement fabric + signature hero silhouette (leather-jacket, blazer, gown, wide-leg, heels, etc.)
- **pattern-led:** bold pattern (large-scale / animal / floral), which is inherently focal regardless of fabric

Two failure modes are penalised:

1. **Garment competition** — `focalGarmentCount >= 2` → `focalCompetition -= 2`
   - Detects: leather jacket + gold satin skirt, velvet blazer + large-floral top, etc.
   - Does NOT fire on: premium quiet pairings (silk + cashmere, leather + wool) where only one garment is focal
   - Range: 0 or −2

2. **Accessory overload** — 3+ vivid (sat ≥ 0.55) accessories (shoes / bag / jewelry) → `focalCompetition -= 2`
   - Detects: red heels + red bag + gold earrings simultaneously demanding attention
   - Threshold: 3 (not 2) because two vivid accents are a deliberate editorial choice
   - Range: 0 or −2

**Maximum total: −4** (both conditions fire simultaneously — unusual in practice).

### Typical adjustments

| Situation | Adjustment |
|---|---|
| Clear single hero (leather jacket + quiet denim + white tee) | 0 |
| Two focal garments (leather jacket + gold satin skirt) | −2 |
| Three vivid accessories | −2 |
| Both conditions | −4 |
| Premium quiet pairing (cream silk + cashmere wide-leg) | 0 (only 1 focal garment) |

### Benchmark results (3.5A)

| Metric | After 3.5A | Delta |
|---|---|---|
| Top-1 accuracy | **57% (17/30)** | **+4pp** |
| Top-3 capture | 97% | 0 |
| Pairwise accuracy | 85% | 0 |
| Mean regret | **3.5 pts** | **−0.7** |
| Median regret | 0 pts | 0 |
| Kendall τ | 0.436 | +0.023 |

**CS27 flipped ✓:** Three vivid accessories (silk + wool + red bag + gold earrings + red heels) now correctly scores below the single-statement-bag variant. The −2 accessory overload penalty dropped the three-accessory outfit by 2 points, breaking the 1-point tie in A's favour.

**CS26 / AP14 partially improved:** The leather jacket + gold satin skirt now carries a −2 focal competition penalty, reducing the gap from −5 (raw) to −3. The outfit does NOT yet flip because the formality cohesion signal adds +4 to the leather/satin/heels outfit (spread=2 → +2) vs −2 for leather/jeans/tee/heels (spread=4 → −2): a structural 4-point swing that the competition penalty alone cannot overcome without over-tuning the focal weight.

---

## 3.5B — Silhouette / Body-Proportion Weighting

### What was added

Two new targeted rules layered on the existing `bodyTypeProportion` and `heightProportion` signals.

**New petite rule — elongating combination:**
```
// Slim or tailored bottom + elongating shoe (heels, mules, loafers, block-heels…)
// = the classic petite elongation technique: close leg line + heel height
// creates a continuous vertical. Only fires when the bottom is not also penalised
// by the maxi/wide-leg rule (not contradicted).
if (hpBottom && (hpBottom.fit === 'slim' || hpBottom.fit === 'tailored') &&
    hpShoes && ELONGATING_SHOES.has(hpShoes.subType) &&
    !MAXI_LENGTHS.has(hpBottom.subType)) {
  heightProportion += 1;
}
```

ELONGATING_SHOES = `{'heels', 'stilettos', 'block-heels', 'kitten-heels', 'mules', 'pumps', 'loafers', 'strappy-heels'}`

**New pear / apple rule — A-line silhouette with fitted top:**
```
// A-line and midi silhouettes that are NOT in WIDE_BOTTOM (already handled by
// the anchor rule) with a slim/tailored top. This covers midi-skirts, a-line-
// skirt, and flared-skirt as hip-skimming shapes that balance pear figures
// without adding volume.
if (btpTop && btpBottom &&
    A_LINE_SUBTYPES.has(btpBottom.subType) &&
    !WIDE_BOTTOM.has(btpBottom.subType) &&
    isSlimFit(btpTop.fit)) {
  bodyTypeProportion += 1;
}
```

### Sensitivity analysis: why no ×2 multiplier was applied

The spec called for testing ×1.5, ×2, ×2.5, ×3 amplification on existing signals. Diagnostic simulation showed that even ×6 amplification of the new petite slim+heels signal (+1) could not flip CS13 because the perceptual colour signals hold a permanent structural advantage: cream + navy triggers a warm/cool temperature harmony penalty (−1) while cream + grey (the incorrectly winning outfit C) earns +2, creating a 3-point gap that is independent of silhouette. Applying ×6 to overcome this would create regressions in scenarios where the silhouette signal should remain secondary.

**Decision:** Add the targeted rules (which fire in the correct direction for petite and pear scenarios) without amplifying existing magnitudes. The signals are now meaningfully influential without overriding colour, formality, or weather signals — consistent with the Phase 3.5B constraint.

### Benchmark results (3.5B)

| Metric | After 3.5A+B | Delta from 3.5A |
|---|---|---|
| Top-1 accuracy | 57% (17/30) | 0 |
| Top-3 capture | 97% | 0 |
| Pairwise accuracy | 85% | 0 |
| Mean regret | 3.5 pts | 0 |
| Kendall τ | **0.447** | **+0.011** |

Top-1 count held steady; the τ improvement confirms the new signals push scores in the correct relative direction (reducing regret in more scenarios even if not flipping the top-1). CS13 and CS14 did not flip because the colour-signal structural advantage (3–4 pts) exceeds the silhouette signal range (±2 pts).

---

## 3.5C — Hero-Pattern + Solid-Ground Hierarchy

### What was added

A refinement to the `patternSafety` single-pattern branch:

**Before:**
```typescript
} else if (patterned.length === 1) {
  patternSafety = isBoldPattern(patterned[0]) ? 2 : 1;
}
```

**After:**
```typescript
} else if (patterned.length === 1) {
  if (isBoldPattern(patterned[0])) {
    // Check if ALL other core garments (top/bottom/dress/outerwear) are solid.
    // If so: hero-pattern + solid ground = "one statement, one canvas" (+3).
    // Otherwise: bold hero without a clean ground, just un-penalised (+2).
    const allOtherSolid = resolved
      .filter(i => i !== patterned[0] &&
        (i.category === 'top' || i.category === 'bottom' ||
         i.category === 'dress' || i.category === 'outerwear'))
      .every(i => !i.pattern || i.pattern === 'solid');
    patternSafety = allOtherSolid ? 3 : 2;
  } else {
    patternSafety = 1;
  }
}
```

**Conditions for +3 (hero + solid ground):**
- Exactly 1 patterned garment (in the entire resolved outfit including accessories)
- That garment is bold (large-scale / animal / floral)
- Every other top / bottom / dress / outerwear item has `pattern === 'solid'` or no pattern field
- Accessories (shoes / bag / jewelry) are excluded from the solid-ground check — only garment categories are evaluated

**Effect on CS05B (floral hero + solid black midi):** `patternSafety` increased from 2 → 3, giving CS05B a +1 advantage over CS05C (all solid). However, CS05B still has a 3-point perceptual disadvantage (tH: multicolour→neutral centroid → +1 vs navy→cool → +2; sD: multicolour→neutral, no dominant vivid centre → 0 vs navy → +2). The multicolour-to-achromatic centroid mapping means the floral top is "invisible" to the saturation-based signals. This is a known limitation tracked as a future Phase 3.6 candidate (multicolour HSL centroid inference).

**AP13 (already correct):** The existing test (two large florals vs one floral hero + solid skirt) continues to pass; the +1 on CS05B does not create regressions here because AP13 relies on the two-pattern penalty (−3 vs +3 hero+solid-ground = 6-pt swing that the +1 does not affect).

### Benchmark results (3.5C)

| Metric | After 3.5A+B+C | Delta from 3.5A+B |
|---|---|---|
| Top-1 accuracy | 57% (17/30) | 0 |
| Top-3 capture | 97% | 0 |
| Pairwise accuracy | 85% | 0 |
| Mean regret | 3.5 pts | 0 |
| Kendall τ | 0.447 | 0 |

The hero-pattern bonus +1 moves CS05B in the correct direction but cannot fully overcome the 3-point perceptual deficit caused by multicolour being mapped to an achromatic centroid.

---

## Combined Phase 3.5 Results

| Metric | Phase 3.4 Baseline | Phase 3.5 Combined | Delta |
|---|---|---|---|
| **Top-1 accuracy** | 53% (16/30) | **57% (17/30)** | **+4pp** |
| Top-3 capture | 97% | 97% | 0 |
| Pairwise accuracy | 85% (17/20) | 85% (17/20) | 0 |
| **Mean regret** | 4.2 pts | **3.5 pts** | **−0.7** |
| Median regret | 0 pts | 0 pts | 0 |
| Max regret | 22 pts | 22 pts | 0 |
| **Kendall τ** | 0.413 | **0.447** | **+0.034** |

### New test coverage

| File | Scope | Assertions |
|---|---|---|
| `__tests__/phase35-visual-hierarchy.test.ts` | 3.5A focalCompetition signal | 11 |
| `__tests__/phase35-silhouette.test.ts` | 3.5B heightProportion + bodyTypeProportion | 15 |
| `__tests__/phase35-pattern.test.ts` | 3.5C patternSafety hero+solid-ground | 14 |

All 43 tests pass (40 legacy + 3 new test files).

---

## Scenarios Fixed

| Scenario | Before | After | Notes |
|---|---|---|---|
| CS27 Accessory overload | Incorrect (A wins, regret=5) | ✓ Correct | −2 accessory overload penalty |

## Scenarios Improved (not flipped)

| Scenario | Before | After | Residual issue |
|---|---|---|---|
| CS26 Hero competition | A=21, B=16, regret=21 | A=19, B=16, regret=21 | 4-pt formality cohesion structural gap prevents flip |
| AP14 | B−A=−5.0 | B−A=−3.0 | Same root cause as CS26 |
| CS05 Floral hero | B=14, C=17, regret=12 | B=15, C=17, regret=12 | Multicolour→achromatic centroid prevents perceptual reward |
| CS13 Petite | A=15 | A=16 | cream/navy temp clash (−1) vs cream/grey neutral (+2) = 3-pt gap |
| CS14 Pear | A gets +1 btp | A=higher | Other signals still favour current winner |

## Remaining Reversals

| Scenario | Regret | Root cause |
|---|---|---|
| CS29 Elevated casual | 22 pts | Engine cannot distinguish cashmere quality from cotton; requires FE-4 (material-quality signal) |
| CS26 Hero competition | 21 pts | Formality cohesion structural advantage (heels F=6, tee F=2 → spread=4 → −2) outweighs focal penalty |
| CS05 Floral hero | 12 pts | multicolour → achromatic HSL centroid; floral top invisible to saturation scorers |
| CS13 Petite | 7 pts | Temperature harmony structural advantage (cream+navy warm/cool = −1 vs cream+grey neutral = +2) |
| CS14 Pear | 11 pts | A-line midi (+1 new btp) insufficient against formality/completeness differences |
| CS15 Rectangle | 3 pts | Slim silk mono outfit disadvantaged vs wide-leg+slim combo on completeness and tH |

---

## Constraints Respected

- ✅ All 40 pre-existing unit tests still pass
- ✅ CS07A, CS22A, CS28A (quiet luxury / material) unaffected
- ✅ CS04B, CS06D, AP01, AP05, AP09B, AP13 (pattern) all correct and unaffected
- ✅ CS10, CS11, CS12 (minimalism) unaffected
- ✅ No hard formality gates modified
- ✅ No textureHarmony modifications (focalCompetition is a separate signal)
- ✅ patternSafety penalties (−3, −4) unchanged; only the single-bold-hero path refined
- ✅ focalCompetition is bounded: maximum −4 (two conditions, each −2)

---

---

## 12. Gemini Assessment

> **No Gemini implementation.** This section assesses whether remaining reversals are deterministic scoring gaps or require AI-level judgment.

### Remaining reversal classification

| Scenario | Reversal type | Deterministic fix available? |
|---|---|---|
| **CS29** Elevated casual (regret 22) | **AI-suitable** — distinguishing a cashmere crew-neck + tailored chinos + suede loafers from a logo tee + joggers requires *material quality inference* (fabric hand, brand tier, construction) that no deterministic rule can derive from subtype + colorFamily alone. This is the clearest candidate for a Gemini-backed quality signal (FE-4). | No — requires material quality perception |
| **CS26 / AP14** Hero competition (regret 21) | **Deterministic** — the reversal is caused by the formality cohesion signal rewarding `heels` (F=6) in outfit A while penalising the spread in outfit B (heels=6 / tee=2 → −2). The fix is a calibration decision (weight adjustment or a "single-hero exemption" on formality cohesion), not a judgment call. | Yes — FP-1 weight re-calibration |
| **CS05** Floral hero (regret 12) | **Deterministic** — `colorFamily:'multicolour'` maps to an achromatic HSL centroid (s=0), making the floral top invisible to saturationDominance and temperatureHarmony. The fix is to compute a non-trivial centroid for multicolour items (e.g., dominant hue inference or a fixed vivid proxy). | Yes — FP-2 multicolour centroid |
| **CS13** Petite silhouette (regret 7) | **Deterministic** — cream + navy triggers a warm/cool temperatureHarmony penalty (−1 vs +2 for cream + grey = 3-point structural gap). The outfit IS better by silhouette rules, but colour harmony score dominates. Fix: increase the silhouette signal ceiling or introduce a "silhouette trumps minor colour mismatch" multiplier for body-type-targeted outfits. | Yes — silhouette weight increase |
| **CS14** Pear proportion (regret 11) | **Deterministic** — A-line midi bonus (+1 new from 3.5B) is insufficient against formality and completeness differences. Fix requires either a larger A-line bonus or a competing signal re-examination. | Yes — further weight calibration |
| **CS15** Rectangle mono (regret 3) | **Deterministic** — slim silk monochrome vs wide-leg + slim combo; the multi-piece outfit earns higher completeness and tH bonuses. Gap is small and may self-resolve with CS29/FE-4 changes. | Yes — minor; likely resolves collaterally |

**Summary:** 1 of 6 remaining reversals (CS29) is genuinely AI-suitable. The other 5 are deterministic scoring calibration problems addressable within Phase 3.6 without model inference.

---

## 13. Production Readiness Assessment

The engine is **NOT declared production-ready** on the basis of Phase 3.5 improvements alone.

### Current state

| Dimension | Status |
|---|---|
| Top-1 accuracy | 57% — below a viable production threshold (target: ≥70%) |
| Mean regret | 3.5 pts — acceptable drift on average, but max regret of 22 pts means users can still encounter badly wrong recommendations |
| Coverage of body-type signals | Partial — pear and petite addressed; hourglass, rectangle, inverted-triangle remain weakly tuned |
| Material quality signal (FE-4) | Missing — engine cannot distinguish elevated casual from logo casual |
| Multicolour centroid (FP-2) | Missing — floral and mixed-print tops are invisible to saturation-based scoring |
| Formality cohesion calibration (FP-1) | Pending — hero-formality exemption not yet implemented |
| End-to-end benchmark | Not yet run — Phase 3.6 spec defines the full E2E production readiness benchmark |

### Assessment

The engine has made measurable, documented progress through Phases 3–3.5 (τ from 0.31 to 0.447; Top-1 from 37% to 57%). The remaining failures are understood, classified, and have deterministic fix paths. However:

- **57% Top-1** means 4 in 10 top recommendations are wrong. This is insufficient for a production recommendation engine where the first result is the default user action.
- **Max regret of 22 pts** is an unacceptable tail — users with elevated casual wardrobes will receive notably wrong recommendations.
- **FE-4 (material quality)** and **FP-2 (multicolour centroid)** are unimplemented signals with known reversal cases. Neither is a minor calibration; both require new scoring infrastructure.

**The engine is ready to proceed to Phase 3.6 as the structured end-to-end production readiness benchmark** — not as a claim of production fitness, but as the next required validation gate.

---

## 14. Final Status

### **PASS WITH CONCERNS**

**Rationale:**

✅ All three Phase 3.5 calibrations implemented correctly  
✅ `focalCompetition` fires in the correct direction with no regressions  
✅ CS27 reversed (accessory overload correctly penalised)  
✅ 43/43 unit tests pass  
✅ Top-1 +4pp, mean regret −0.7, τ +0.034 vs Phase 3.4  
✅ Remaining failures classified: 5 deterministic, 1 AI-suitable  

⚠️ Top-1 accuracy (57%) below production threshold  
⚠️ Max regret (22 pts, CS29) is an unacceptable tail  
⚠️ FE-4 (material quality) and FP-2 (multicolour centroid) are unimplemented  
⚠️ CS26 / AP14 not fully resolved — focal competition penalty insufficient alone  
⚠️ CS05 not resolved — structural multicolour centroid limitation  

**Ready for Phase 3.6 — End-to-End Production Readiness Benchmark:** YES  
**Declared production-ready:** NO

---

## Future Candidates (Phase 3.6)

- **FP-1 (CS26 / AP14):** Increase focal competition penalty weight OR introduce a "hierarchy clarity" bonus for outfits with one focal garment + high-recede supporting pieces. Requires careful calibration against the formality cohesion structural advantage.
- **FP-2 (CS05):** Assign a non-zero saturation centroid to `multicolour` items (or detect pattern centroid from dominant hues) so floral tops can register as vivid/dominant in saturation-based signals.
- **FE-4 (CS29):** Material-quality / brand-tier signal to distinguish premium-fabric elevated casual from logo-casual; currently indistinguishable at the fabric level.
