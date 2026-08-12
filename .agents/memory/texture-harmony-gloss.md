---
name: textureHarmony gloss vs matt distinction
description: The Phase 3.3B rule distinguishing intentional material contrast (silk+cashmere) from competing gloss (silk+satin) in outfitScoring.ts.
---

# textureHarmony — gloss vs matt statement fabrics

## The rule
Two statement fabrics are NOT automatically bad. The key axis is whether both are **high-gloss** (lustrous/fluid), which creates visual competition.

- `GLOSS_FABRICS = ['silk', 'satin']` — fluid, lustrous; two of these together = bridal/costume
- `STATEMENT_FABRICS` includes leather, cashmere, velvet (matt statements) plus silk, satin
- `statementCount >= 2, glossCount >= 2` → **−3** (competing gloss: silk+satin)
- `statementCount >= 2, glossCount < 2` → **+1** (intentional contrast: silk+cashmere, leather+velvet, cashmere+velvet)
- Single statement → **+3** (hero piece)
- All flat (cotton/denim/synthetic/jersey/corduroy) → **−2**

**Why:** Before Phase 3.3B, the blanket rule `statementCount >= 2 → −3` penalised silk+cashmere (quintessential quiet-luxury) identically to silk+satin (costume territory). QL1 (silk+cashmere) scored 1 point LOWER than QL2 (cotton+cotton). After fix: QL1=100, QL2=97.

**Why leather is NOT in GLOSS_FABRICS:** Leather is structured and mostly matte — silk+leather reads as intentional hard/soft contrast, not competing shininess.

## How to apply
- When adding new statement fabrics, decide: is it gloss-lustrous (→ GLOSS_FABRICS) or matt-textured (→ STATEMENT_FABRICS only)?
- The belt-and-braces `glossCount2 >= 2 → −2` check fires in addition to the statementCount rule when glossCount >= 2. Total for silk+satin: −3 − 2 = −5.
- Tests in `__tests__/phase33b-quality-intelligence.test.ts` (sections A and B) validate all combinations.
- Tests in `__tests__/outfitComboScorer.test.ts` were updated to reflect the new expected values (+1 for cashmere+silk, +1 for velvet+silk).

## scoreOutfitCombo test trap
When calling `scoreOutfitCombo` in tests, components MUST have `matchedItemId` set (not just `id`) for the function to resolve item fabrics and compute `textureHarmony`. Without it, `resolved` is empty and textureHarmony returns 0.
Also: 3+ core items with identical `weight` (including default 'medium') trigger the all-same-weight stack penalty (−1). Give test items varied explicit weights ('light'/'mid'/'heavy') when isolating other signals.
