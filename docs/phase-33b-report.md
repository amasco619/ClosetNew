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
