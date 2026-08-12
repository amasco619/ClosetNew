# Phase 3.3B — Recommendation Quality Intelligence: Completion Report

**Date:** 2026-08-12  
**Spec:** `attached_assets/Phase_3.3B_—_Recommendation_Quality_Intelligence_1786547100038.md`  
**Baseline:** Phase 3.3A (65 outfits, mean=77.4, Excellent=21, Strong=41, Acceptable=3)  
**Approach:** Diagnose first, implement second, stop if evidence doesn't support improvement.

---

## 1. Diagnosis Summary

A full benchmark run was performed against `__tests__/benchmark-phase32.ts` before any code was changed.

### Key quality gap identified

The engine could not distinguish **material sophistication** at the outfit level. Two scenarios demonstrated this most clearly:

| Scenario | Description | Internal | External | Gap |
|---|---|---:|---:|---|
| QL1 | Cream silk blouse + camel cashmere wide-leg + leather mule + leather bag | 96 | 80 | Underscored |
| QL2 | Grey cotton tee + beige chinos + white synthetic sneakers + synthetic backpack | 97 | 75 | Overscored |

A boring airport neutral (QL2: all cotton + synthetic) scored **1 point higher** than a quintessential quiet-luxury outfit (QL1: silk + cashmere). This is the primary quality gap the spec targets.

### Root cause

The `textureHarmony` function in `constants/outfitScoring.ts` applied a **blanket −3 penalty** whenever two or more fabrics from `STATEMENT_FABRICS` appeared together in the core garments:

```typescript
// Before 3.3B
if (statementCount === 1) score += 3;
else if (statementCount >= 2) score -= 3;  // ← blanket rule
```

This rule treats all multi-statement combinations identically:
- **Silk + cashmere** (smooth/fluid + soft/matte — the foundation of quiet-luxury dressing) → −3
- **Silk + satin** (two lustrous gloss fabrics competing — bridal/costume) → −3

These are opposite situations. The blanket penalty punished the sophisticated pairing as severely as the genuinely problematic one.

Additionally, `leather` was incorrectly included in `SHINY_FABRICS` (renamed `GLOSS_FABRICS` in 3.3B). Leather is structured and typically matte — it is not gloss-lustrous in the same way silk and satin are. This caused leather+silk combinations to incur an unwarranted double penalty.

### Additional scenarios reviewed

| Scenario | Internal | External | Notes |
|---|---:|---:|---|
| AD6 | 50 | 80 | Silk+cashmere work outfit — textureHarmony fix applies (+4) |
| QL3 | 104 | 76 | Mono-rich navy — overscored; root cause in palette/completeness, out of 3.3B scope |
| QL4 | 95 | 77 | Single silk statement — textureHarmony unchanged (+3); overscore not in textureHarmony |
| W2 | 44 | 80 | Structural: 3-item wardrobe with sundress; weather gating working correctly |
| C6 | 43 | 74 | Structural: ankle-boot/midi hemline penalty + warm/cool tension penalty; both correct |
| FP4/FP6 | — | — | Scenario IDs not found in benchmark; possibly renamed in Phase 3.2 |

W2 and C6 low scores are caused by structural gaps (small wardrobes, correct hemline and temperature penalties), not quality-scoring errors. No changes made for those scenarios.

---

## 2. Implementation

### Single change: `textureHarmony` refinement

**File:** `constants/outfitScoring.ts`

**Changes:**

1. **`SHINY_FABRICS` renamed `GLOSS_FABRICS` and corrected** — `leather` removed. Leather is a statement fabric but structurally matte; only `silk` and `satin` are true gloss-lustrous fabrics that compete when combined.

2. **`statementCount >= 2` rule made context-aware:**

```typescript
// After 3.3B
if (statementCount === 1) {
  score += 3;                    // clear single material hero (unchanged)
} else if (statementCount >= 2) {
  const glossCount = fabrics.filter(f => f && GLOSS_FABRICS.has(f)).length;
  if (glossCount >= 2) {
    score -= 3;                  // competing lustrous fabrics (silk + satin = bridal)
  } else {
    score += 1;                  // intentional material contrast (silk+cashmere, leather+velvet, etc.)
  }
}
```

**Effect per category:**

| Combination | Before | After | Change |
|---|---:|---:|---:|
| Single statement (silk + wool) | +3 | +3 | 0 |
| Intentional contrast: silk + cashmere | −3 | +1 | **+4** |
| Intentional contrast: leather + cashmere | −3 | +1 | **+4** |
| Intentional contrast: velvet + silk | −3 | +1 | **+4** |
| Intentional contrast: cashmere + velvet | −3 | +1 | **+4** |
| Competing gloss: silk + satin | −5 | −5 | 0 |
| Three fabrics, 2 gloss: silk + velvet + satin | −5 | −5 | 0 |
| All-flat: cotton + cotton | −2 | −2 | 0 |

**Bounded impact:** The change shifts `textureHarmony` by +4 for intentional contrasts, from −3 to +1. The signal range remains [−5, +4]. This is well within the spec's requirement that no new component "overwhelm occasion/formality/colour/proportion."

---

## 3. Benchmark Results

### Before vs. After (target scenarios)

| Scenario | External | Before | After | Δ |
|---|---:|---:|---:|---:|
| QL1 Silk+Cashmere+Leather | 80 | 96 | **100** | +4 |
| QL2 Cotton+cotton boring neutral | 75 | 97 | 97 | 0 |
| AD6 Quiet luxury vs colourful noise | 80 | 50 | **54** | +4 |
| PT5 Three competing statements | 79 | 57 | 57 | 0 |
| PT4 Velvet+Denim texture clash | 69 | 58 | 58 | 0 |

**Primary quality improvement:** QL1 now scores 100 vs QL2's 97 — the engine correctly identifies the quiet-luxury outfit as superior to the boring neutral. Before 3.3B, QL2 scored 1 point higher than QL1.

### Overall benchmark (Phase 3.3A baseline → Phase 3.3B)

| Metric | Phase 3.3A | Phase 3.3B |
|---|---:|---:|
| Outfits evaluated | 65 | 65 |
| Mean external quality | 77.4 | 77.4 |
| Median quality | 78 | 78 |
| Excellent (≥85) | 21 | 21 |
| Strong (70–84) | 41 | 41 |
| Acceptable (50–69) | 3 | 3 |
| Poor (<50) | 0 | 0 |

No regressions in external quality distribution. All 8 correct empties remain empty.

### PT5 regression check

PT5 (silk + velvet + satin, three competing statements) was the key regression risk. With the new code:
- `glossCount = 2` (silk + satin) → still scores −3 from the statement rule
- Separate `glossCount2 >= 2` check → still fires −2
- Total textureHarmony for the three-statement outfit: −5 (unchanged ✓)

PT5 Rank 2 improved by +4 because that outfit was silk+velvet (without the satin blazer) — a valid intentional contrast that was incorrectly penalised before.

---

## 4. Tests Written

**`__tests__/phase33b-quality-intelligence.test.ts`** — 18 assertions across 7 sections:

| Section | Description |
|---|---|
| A (5 tests) | Material relationships: silk+cashmere, velvet+silk, leather+cashmere, cashmere+velvet, leather+velvet → all +1 |
| B (2 tests) | Competing gloss: silk+satin → −5; silk+velvet+satin → −5 (regression guard) |
| C (2 tests) | All-flat penalty: cotton+denim → −2; synthetic+cotton+jersey → −2 (regression guard) |
| D (4 tests) | Single statement hero: silk+wool, cashmere+wool, velvet+cotton, leather+cotton → all +3 (regression guard) |
| E (2 tests) | Tonal sophistication: QL1-style total score and textureHarmony both exceed QL2-style |
| F (1 test) | Visual hierarchy: leather+cotton full `scoreOutfitCombo` round-trip → textureHarmony +3 |
| G (1 test) | Context: silk+cashmere+leather work wardrobe produces ≥1 outfit |

**`__tests__/outfitComboScorer.test.ts`** — 2 assertions updated:
- `cashmere + silk → textureHarmony −3` corrected to `+1 intentional contrast`
- `velvet + silk → textureHarmony −3` corrected to `+1 intentional contrast`

---

## 5. What Was Explicitly Not Changed

Per spec constraints, none of the following were modified:
- Candidate generation logic (`outfitRotation.ts`)
- Fallback-cores path or freshness signals
- Weather gates, safety gates, or hard formality gates
- Rise harmony, height proportion, hemline–shoe harmony
- Occasion/scenario affinity scoring
- Palette, colour temperature, saturation signals
- Completeness or piece-count bonuses

---

## 6. Scope Decisions

**Tweed and wool added to FLAT_FABRICS?** — No. Wool and tweed are mid-ground fabrics — not statement (no `STATEMENT_FABRICS` membership) but also not flat (not cotton/synthetic/denim/jersey). They correctly fall through both sets, contributing neither a bonus nor a penalty. This is accurate: a wool trouser paired with a silk blouse reads as an elegant ground, not as a flat base or a competing statement.

**W2 / C6 underscoring?** — Not addressed. Root causes are structural (small wardrobe + weather/hemline gates working correctly), not quality-scoring errors. Fixes would require context-sensitive hemline or temperature rules, which falls outside the "no broadly rebalance existing weights" constraint.

**QL3 / SC1 overscoring?** — Not addressed. The overscore in both comes from palette/completeness accumulation, not textureHarmony. Adjusting palette or completeness weights to bring these down risks broad regressions across 65+ scenarios.

---

## 7. Test Suite

**Final state:** 40 passed, 0 failed.

Run: `npm test`

---

## 8. Benchmark Comparison

| Metric | Phase 3.3A | Phase 3.3B | Change |
|---|---:|---:|---:|
| Mean quality | 77.4 | 77.4 | 0 |
| Median | 78 | 78 | 0 |
| Excellent | 21 | 21 | 0 |
| Strong | 41 | 41 | 0 |
| Acceptable | 3 | 3 | 0 |
| Poor | 0 | 0 | 0 |

Target scenario changes:

| Scenario | External | 3.3A Internal | 3.3B Internal | Δ |
|---|---:|---:|---:|---:|
| QL1 Silk+Cashmere+Leather | 80 | 96 | **100** | +4 |
| QL2 Cotton boring neutral | 75 | 97 | 97 | 0 |
| AD6 Quiet luxury vs colour | 80 | 50 | **54** | +4 |
| PT5 Three competing statements | 79 | 57 | 57 | 0 |
| PT4 Velvet+Denim texture clash | 69 | 58 | 58 | 0 |

The external quality distribution is unchanged — no regressions. The targeted internal score improvements bring the engine's assessment of silk+cashmere outfits into alignment with external quality judgement.

---

## 9. Dimension Comparison

| Dimension | Phase 3.3A → Phase 3.3B |
|---|---|
| Colour | Unchanged. Palette, temperature harmony, value spread, saturation all unmodified. |
| Proportion | Unchanged. bodyTypeProportion, heightProportion, proportionBalance all unmodified. |
| Occasion | Unchanged. Scenario affinity, occasion gating, coreFitsScenario all unmodified. |
| Formality | Unchanged. formalityCohesion, effectiveFormality, coreFitsScenario gates all unmodified. |
| Coherence | Unchanged. riseHarmony, hemlineShoeHarmony, metalCohesion all unmodified. |
| Texture | **Changed.** Two-statement penalty (−3) replaced with nuanced gloss-detection rule. Silk+cashmere: −3 → +1. Silk+satin: −5 → −5 (unchanged). |
| Visual interest | Improved. Intentional material contrast (+1) now correctly registers as visual interest rather than noise. |
| Practicality | Unchanged. Weather gates, safety gates, completeness bonuses all unmodified. |
| Personalisation | Unchanged. Affinity multipliers, freshness, wornHistoryBoost all unmodified. |
| Quiet luxury | **Improved.** The signature quiet-luxury pairing (smooth statement + soft statement) now scores positively rather than being penalised. QL1 correctly outscores QL2 after 3.3B. |

---

## 10. Internal vs External Alignment

**Before 3.3B:** The engine could not distinguish material sophistication at the outfit level. A cotton+cotton outfit (QL2, internal=97) scored higher than a silk+cashmere outfit (QL1, internal=96) despite the silk+cashmere being the clearly superior choice. The internal signal treated multi-statement-fabric combinations as "over-styled" regardless of whether the fabrics were competing or complementary.

**After 3.3B:** QL1 (silk+cashmere) internal=100 vs QL2 (cotton+cotton) internal=97. The engine now correctly ranks the quiet-luxury outfit above the boring neutral. The 4-point swing is proportionate — the change is meaningful without being dominating.

**AD6 improvement:** The quiet-luxury work outfit (silk+cashmere) that previously scored 50 internal now scores 54. Still well below the external assessment of 80, but the gap is partially closed. The remaining gap (54 vs 80) is structural: the AD6 wardrobe has no bag or jewellery, so completeness is lower than a fully-accessorised outfit, and the 3-piece constraint limits accumulation of bonuses. This is not a scoring error — it is an honest representation of a less-complete outfit.

**PT5 preserved:** The three-competing-statements scenario (silk+velvet+satin) still correctly scores at the bottom of its ranking group (internal=57 vs solid alternatives). The gloss-detection check (glossCount ≥ 2 → −3) correctly identifies silk+satin as competing, even when velvet is present.

---

## 11. False Positives / False Negatives

**Remaining false positives (engine overscores):**

- **QL3** (navy head-to-toe cashmere+wool, internal=104, external=76): The single-statement hero rule (+3 for cashmere) stacks with high palette cohesion and formality cohesion in a monochromatic outfit, accumulating to an unrealistically high score. Root cause is in palette/completeness accumulation, not textureHarmony. Not fixed in 3.3B.
- **SC1** (6-item wardrobe, internal=103, external=79): Completeness and formality bonuses accumulate identically to a full wardrobe because the few available items are all high-quality and formally matched. The engine has no mechanism to discount score when the outfit pool is constrained. Not fixed in 3.3B.

**Remaining false negatives (engine underscores):**

- **QL6 / AD6** (internal ≈53/54, external ≈80): Low score is largely structural — 3-piece outfits without bag/jewellery score 6–7 points lower on completeness alone vs 4-piece outfits. textureHarmony fix contributed +4 to AD6. Residual gap is an honest reflection of lower completeness in the test wardrobe.
- **W2** (internal=44, external=80): Hot-weather linen sundress + sandals + bag — only 1 core garment (sundress) so textureHarmony returns 0. No proportion or weight signal fires. Score is structurally lower for minimal warm-weather outfits; not a quality scoring failure.
- **C6** (internal=43, external=74): Ankle-boot + midi-skirt hemlineShoeHarmony penalty (−2) plus warm/cool temperatureHarmony penalty are both working correctly as individual signals. Together they pull the score below external assessment. A contextual override would be needed to fix this.

**Remaining ranking reversal:**
- **PT3** (stripe+check mix outranks solid navy): Engine gives the pattern-mixed outfit internal=69 while solid navy gets 61, but external assessment reverses this (79 vs 82). The pattern-affinity bonus in outfitRotation.ts awards more style-goal points to the mixed outfit than to the solid one. Not addressed in 3.3B.

---

## 12. Regression Analysis

| Signal | Status |
|---|---|
| Candidate generation | ✅ Unchanged — `generateOutfitPool` not modified |
| Fallback-cores path | ✅ Unchanged — `generationPath: 'relaxed'` logic unmodified |
| Freshness penalty | ✅ Unchanged — `wornHistoryBoost` not modified |
| Rise harmony | ✅ Unchanged — `riseHarmony` not modified |
| Weather gates | ✅ Unchanged — `outerwearRule`, `isRainy`, seasonal gates not modified |
| Formality gates | ✅ Unchanged — `coreFitsScenario`, `effectiveFormality` not modified |
| Personalisation | ✅ Unchanged — affinity multipliers, `scoreItemForProfile`, `applyFreshnessOrder` not modified |
| Silk+satin penalty | ✅ Preserved at −5 (−3 from glossCount≥2 + −2 belt-and-braces) |
| All-flat penalty | ✅ Preserved at −2 |
| Single-statement hero | ✅ Preserved at +3 |
| Full test suite | ✅ 40 passed, 0 failed |

---

## 13. Remaining Quality Gaps

**1. PT3 pattern-ranking reversal** (most impactful)  
The engine ranks a stripe+check mixed-pattern outfit above a solid-navy outfit in the same wardrobe, despite the solid being the stylistically superior choice. Root cause is style-affinity bonuses in `outfitRotation.ts` over-rewarding pattern variety. Affects any user where the style-affinity system has accumulated signal towards patterned pieces.

**2. SC1 / QL3 score inflation**  
Completeness + formality + palette bonuses can accumulate to 100+ internal scores on outfits from small or monochromatic wardrobes. The engine has no score-ceiling awareness for constrained wardrobes. May create misleading confidence signals if internal scores are ever surfaced to users.

**3. P1 petite ranking reversal**  
For petite users, the wide-leg option scores within 10 points of the slim-trouser option, occasionally ranking ahead. The `heightProportion` signal for petite users does not apply a strong enough disadvantage to volume-heavy silhouettes.

**4. W2 / C6 structural underscoring**  
Low-accessory warm-weather outfits (W2) and warm/cool colour tension outfits (C6) score below external assessments. These are correct penalty applications (hemlineShoeHarmony, temperatureHarmony, completeness) that happen to combine unfavourably. Fixing these would require context-aware penalty weighting by occasion/season.

---

## 14. Gemini Assessment

**Gemini: NOT IMPLEMENTED.**

The gaps addressed in Phase 3.3B were solvable deterministically: the silk+cashmere vs silk+satin distinction is a structural rule (gloss-luminosity taxonomy), not a visual judgement requiring image understanding.

The **remaining gaps** split into two categories:

**Deterministically solvable:**
- PT3 (pattern ranking reversal) — style-affinity weight adjustment in `outfitRotation.ts`
- P1 (petite volume silhouette) — stronger `heightProportion` disadvantage for MAXI_LENGTHS on petite
- SC1/QL3 (score inflation) — wardrobe-size-aware score ceiling or completeness normalisation

**Likely requiring visual/LLM judgement to fully resolve:**
- C6 (warm/cool tension as "intentional" vs "unresolved clash") — a rule cannot distinguish intentional chromatic tension from an accidental mismatch; this requires understanding of the user's stylistic intent and the specific garments involved
- W2 (minimal hot-weather completeness) — the engine treats missing jewellery as a deficit in all contexts; understanding that a beach/resort outfit is stylistically complete with 3 pieces requires contextual awareness beyond rule-based signals

None of the remaining gaps are severe enough to recommend implementing Gemini at this stage. The deterministically solvable gaps (PT3, P1, SC1) represent the highest-value next work.

---

## 15. Recommendation

**PASS — QUALITY IMPROVED**

The primary quality gap identified in diagnosis (silk+cashmere outfits scoring below cotton+cotton outfits) has been resolved. QL1 now correctly outranks QL2. The change is bounded, relationship-based, and does not rely on fabric prestige. No regressions were introduced across the 65-outfit benchmark. The signal is proportionate (±4 points maximum effect) and does not overwhelm the existing formality, colour, or occasion signals.

---

## 16. Final Status

**PHASE 3.3B STATUS: COMPLETE**

**GEMINI: NOT IMPLEMENTED**
