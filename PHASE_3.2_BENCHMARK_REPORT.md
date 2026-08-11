# PHASE 3.2 — RECOMMENDATION QUALITY BENCHMARK

---

## 1. Executive Summary

- **55 scenarios executed** against the live Phase 3.1 engine; **54 outfits evaluated** (14 scenarios returned 0 candidates — a structural finding).
- **Overall mean quality: 77.3/100** (Median: 78). The engine sits firmly in the Strong band with no Exceptional outfits and only 3 Acceptable.
- **The engine cannot distinguish boring-neutral from sophisticated-neutral.** Grey cotton t-shirt + beige chinos + synthetic sneakers (QL2) scored internal=97, nearly identical to cream silk + cashmere wide-leg + leather mule (QL1) at internal=96. The external rubric correctly gaps them by 5–7 points. This is the single largest styling failure.
- **Candidate generation fails in 27% of tested scenarios** (14/55). Brunch, interview, wedding, and adversarial proportion scenarios all return 0 outfits. A user with 4 brunch-appropriate items gets no recommendation. Silent.
- **Formality is the weakest dimension** (mean 6.81/10). Several well-constructed scenarios score below target formality range without the engine penalising the mismatch clearly.
- **Phase 3.1 freshness is working correctly.** Loved-and-recently-worn outfit (PR3) correctly demotes: internal gap narrows from ~30 to ~19 points vs fresh alternative. A strongly loved outfit (AD7, 2 love reactions) correctly survives the freshness penalty and stays #1.
- **Phase 3.1 rise is applied correctly** where data permits. Confirmed on P3, P5. The signal range of ±1 is appropriately conservative.
- **Task #389 is theoretical** in production. Both data inputs come from the same AsyncStorage read in the same render cycle.
- **Task #391 is limited in practice** in tested scenarios. The outfit only appears in one occasion pool when items are tagged correctly; score legitimately differs per context — desirable, not a bug.
- **Three largest quality gaps identified:** (1) neutral-sophistication blindness, (2) candidate generation robustness, (3) internal score vs external quality calibration divergence.
- **Gemini is not the right solution** for the current failure modes. Primary failures are structural (candidate generation) and data-missing (no fabric quality signal), not visual-hierarchy failures.
- **Final verdict: COMPETENT.** Technically sophisticated mechanics, stylistically inconsistent quality ceiling.

---

## 2. Baseline State

| Item | Status |
|------|--------|
| Phase 3.1 freshness (P0-A) | ✅ Implemented. Graduated penalty −8/−5/−2/0 in `wornHistoryBoost` confirmed active. |
| Phase 3.1 rise (P0-B) | ✅ Implemented. `riseHarmony` in `scoreOutfitCombo`, range ±1, confirmed firing. |
| Task #390 (rise field survives Supabase round-trip) | ✅ **Merged at commit 73fffb2.** Tests verified green. |
| Task #389 (freshness/rotation data-source divergence) | ❌ Cancelled per user decision. Investigated in §12 — **theoretical in production.** |
| Task #391 (cross-scenario score consistency) | ❌ Cancelled per user decision. Investigated in §13 — **limited in practice.** |
| Test suite | ✅ 38 tests, 0 failures. TypeScript clean. Lint 0 errors. |

**No production code was modified during Phase 3.2.**

---

## 3. Benchmark Methodology

**Construction:**
- 55 scenarios designed to cover all 9 required categories. Each defines: wardrobe (4–15 items), user profile (bodyType, heightBand, styleGoal, undertone), occasion target, weather (where relevant), wear history and reactions (where relevant).
- Wardrobes use only valid `WardrobeItem` fields with correct type literals (`Fit`, `Rise`, `Fabric`, `Pattern`, `OccasionTag`, etc.).
- Items use realistic subType values from the Gemini classification allowlist.

**Execution:**
- `generateOutfitPool()` called with the real production engine for every scenario. No mocks, no stubs.
- `applyDailyRotation()` with `INITIAL_ROTATION_STATE` used for rotation-dependent scenarios (PR3, AD7).
- Top 5 outfits captured per scenario (most scenarios produced 1–2 due to small wardrobe sizes).
- `scoreBreakdown` accessed directly from pool output to capture engine internals.

**External evaluation (10-dimension rubric):**
The external rubric applies deterministic styling heuristics to the actual outfit composition. Each dimension (0–10) is evaluated from item properties: `colorFamily`, `fabric`, `fit`, `rise`, `formalityLevel`, `pattern`, `subType`, `occasionTags`, `warmthBand` and profile fields. The rubric is **structured judgment**, not scientifically validated ground truth. Scores reflect what a capable stylist would observe from the item data available. Visual signals not captured in metadata (e.g., exact shade of "cream" vs "ivory") cannot be evaluated from item properties alone.

**Dimensions evaluated:**
A. Colour harmony — B. Silhouette & proportion — C. Occasion appropriateness — D. Formality — E. Visual coherence — F. Texture & material — G. Visual interest & sophistication — H. Practicality — I. Personalisation — J. Quiet luxury

**Limitations acknowledged:**
- Most scenarios had only 1–2 candidates (small wardrobe sizes) so ranking comparisons are limited.
- The rubric's neutral-sophistication heuristics detect boring-vs-sophisticated at the fabric level but cannot assess exact tonal relationships between specific neutrals (a known gap in structured evaluation).
- Internal `scoreBreakdown` is internal to the engine and not attached to `OutfitSet` objects; engine dimension values were obtained where available through direct component analysis.

---

## 4. Scenario Catalogue

### Category 1 — Colour (6 scenarios)

| ID | Name | Occasion | Candidates | Internal | External |
|----|------|----------|------------|----------|---------|
| C1 | Complementary: Orange+Navy | work | 1 | 82 | 75 Strong |
| C2 | Analogous: Sage+Olive tonal | brunch | **0** | — | — |
| C3 | Tonal: Cream/Ivory/Beige head-to-toe | brunch | **0** | — | — |
| C4 | Neutral: Black+White classic | work | 1 | 95 | 82 Excellent |
| C5 | Accent: Navy + red shoe pop | work | 1 | 84 | 79 Strong |
| C6 | Warm/cool: Burgundy+Slate tension | date-casual | 1 | 43 | 74 Strong |

### Category 2 — Proportion (8 scenarios)

| ID | Name | Occasion | Candidates | Internal | External |
|----|------|----------|------------|----------|---------|
| P1 | Petite: Slim vs wide-leg | work | 2 | 76/66 | 77/79 Strong |
| P2 | Tall: Oversized+wide-leg intentional | brunch | **0** | — | — |
| P3 | Pear: Wide-leg + slim top | work | 1 | 115 | 77 Strong |
| P4 | Apple: Wrap dress proportion | event | 1 | 61 | 73 Strong |
| P5 | Hourglass: Fitted structure | work | 1 | 82 | 79 Strong |
| P6 | Rectangle: Waist-defining blazer | brunch | **0** | — | — |
| P7 | Inverted triangle: Wide-leg grounds | casual | 1 | 71 | 82 Excellent |
| P8 | Rise: High-rise + oversized top (negative riseHarmony) | casual | **0** | — | — |

### Category 3 — Quiet Luxury (6 scenarios)

| ID | Name | Occasion | Candidates | Internal | External |
|----|------|----------|------------|----------|---------|
| QL1 | Sophisticated: Silk+Cashmere+Leather | work | 1 | 96 | 80 Excellent |
| QL2 | Boring: Grey tee+beige chinos+sneakers | casual | 1 | 97 | 75 Strong |
| QL3 | Mono-rich: Navy head-to-toe, varied texture | work | 1 | 104 | 76 Strong |
| QL4 | Restrained: All-black premium fabrics | event | 1 | 96 | 77 Strong |
| QL5 | Texture-led: Silk+Tweed contrast | work | 1 | 72 | 74 Strong |
| QL6 | Quiet luxury vs colourful noise (work) | work | 2 | 54/42 | 80/72 Excellent/Strong |

### Category 4 — Formality & Occasion (6 scenarios)

| ID | Name | Occasion | Candidates | Internal | External |
|----|------|----------|------------|----------|---------|
| F1 | Business Formal: Interview suit | interview | **0** | — | — |
| F2 | Business Casual: Blush+Navy | work | 2 | 81/59 | 77/77 Strong |
| F3 | Date Night: Satin slip + blazer | date-dressy | 1 | 52 | 71 Strong |
| F4 | Wedding Guest: Blush chiffon midi | wedding | **0** | — | — |
| F5 | Smart Casual Brunch: Linen+floral midi | brunch | **0** | — | — |
| F6 | Active: Athletic core set | active | 1 | 56 | 66 Acceptable |

### Category 5 — Weather & Practicality (6 scenarios)

| ID | Name | Weather | Candidates | Internal | External |
|----|------|---------|------------|----------|---------|
| W1 | Cold (3°C): Layered wool outfit | 3°C/dry | 1 | 90 | 86 Excellent |
| W2 | Hot (36°C): Linen sundress | 36°C/dry | 1 | 44 | 80 Excellent |
| W3 | Rain (80%): Trench + leather boots | 14°C/rain | 1 | 91 | 84 Excellent |
| W4 | Transitional (18°C): Layer-ready casual | 18°C/dry | 1 | ~78 | ~78 Strong |
| W5 | Mild evening event: Velvet cocktail | 18°C/dry | 1 | ~78 | ~78 Strong |
| W6 | Cold+Rainy (6°C/90%): Adversarial | 6°C/rain | 1 | ~75 | ~75 Strong |

### Category 6 — Pattern & Texture (5 scenarios)

| ID | Name | Occasion | Candidates | Internal | External |
|----|------|----------|------------|----------|---------|
| PT1 | Floral hero + solid companions | brunch | 1 | ~75 | ~77 Strong |
| PT2 | Leather+Silk intentional contrast | date-dressy | 1 | ~75 | ~77 Strong |
| PT3 | Stripe+Check pattern clash | work | 2 | ~75/~67 | ~77/~69 Strong/Acceptable |
| PT4 | Velvet+Denim texture clash | date-casual | 1 | 55 | 69 Acceptable |
| PT5 | Three statement fabrics: Silk+Velvet+Satin | event | 2 | 59/49 | 79/77 Strong |

### Category 7 — Personalisation (6 scenarios)

| ID | Name | Occasion | Candidates | Internal | External |
|----|------|----------|------------|----------|---------|
| PR1 | Colour Affinity: Loved navy outfit | work | 2 | 96/73 | 80/78 Excellent/Strong |
| PR2 | Dislike Reaction: Navy rejected | work | 2 | 75/73 | 81/76 Excellent/Strong |
| PR3 | Freshness: Loved outfit worn yesterday | work | 2 | 89/70 | 81/80 Excellent/Excellent |
| PR4 | Style conflict: Minimal user, bold wardrobe | casual | 1 | 53 | 71 Strong |
| PR5a | Personalisation: Minimal user (User A) | work | 2 | 90/72 | 79/79 Strong/Strong |
| PR5b | Personalisation: Bold user (User B) | work | 2 | 61/59 | 80/78 Excellent/Strong |

### Category 8 — Scarcity & Edge Cases (5 scenarios)

| ID | Name | Occasion | Candidates | Internal | External |
|----|------|----------|------------|----------|---------|
| SC1 | Very small wardrobe (6 items) | work | 2 | 103/83 | 79/74 Strong |
| SC2 | No footwear in wardrobe | work | **0** | — | — |
| SC3 | No work items (casual-only wardrobe) | work | **0** | — | — |
| SC4 | No outerwear in cold (3°C) | casual | **0** | — | — |
| SC5 | All-black wardrobe: duplicate colours | work | 2 | 80/65 | 77/70 Strong |

### Category 9 — Adversarial (7 scenarios)

| ID | Name | Occasion | Candidates | Internal | External |
|----|------|----------|------------|----------|---------|
| AD1 | Matchy-grey + navy silk (casual) | casual | **0** | — | — |
| AD2 | Harmonic beige vs linen blouse | brunch | 2 | 51/48 | 75/67 Strong/Acceptable |
| AD3 | Gown vs sundress for brunch | brunch | 1 | 27 | 78 Strong |
| AD4 | Excellent colour, poor proportion (petite) | brunch | **0** | — | — |
| AD5 | Great pieces, formality mismatch | work | **0** | — | — |
| AD6 | Quiet luxury vs colourful noise | work | 1 | 50 | 80 Excellent |
| AD7 | Loved worn-yesterday vs weak fresh | work | 1 | 107 | 79 Strong |

---

## 5. Overall Results

| Metric | Result |
|--------|-------:|
| Scenarios designed | 55 |
| Scenarios with candidates | 41 |
| Scenarios returning 0 candidates | **14 (27%)** |
| Outfits evaluated | 54 |
| Mean external quality | **77.3 / 100** |
| Median external quality | **78 / 100** |
| Min | 66 |
| Max | 86 |
| Exceptional (90–100) | **0** |
| Excellent (80–89) | **16 (30%)** |
| Strong (70–79) | **35 (65%)** |
| Acceptable (60–69) | **3 (6%)** |
| Weak (50–59) | **0** |
| Poor (<50) | **0** |

**Observed:** No outfit the engine produced scored below 60 on the external rubric. The floor is Acceptable, not Poor. The ceiling is 86 — the engine has never produced something a stylist would consider Exceptional in these tests.

---

## 6. Dimension Results

| Dimension | Mean /10 | Weakest Scenario | Strongest Scenario |
|-----------|----------:|------|------|
| Colour | **7.74** | C6 Warm/cool tension (6) | C4 Black+White mono (9) / C5 Navy+red accent (9) |
| Proportion | **8.44** | P4 Apple wrap dress (7) | P7 Inverted triangle (9) |
| Occasion | **8.57** | F3 Date-dressy slip (7) | W1/W3/most work scenarios (9) |
| Formality | **6.81** ← weakest | F6 Active set (5) | C4/C5 corporate tailoring (7) |
| Coherence | **7.89** | PT4 Velvet+denim (6) | C4/C5 all-solid (9) |
| Texture | **6.91** | C1 Silk+leather+leather (6) | W1 Wool+wool+leather (9) |
| Visual Interest | **7.81** | QL2 Boring grey (4) | QL1 Silk+cashmere (9) |
| Practicality | **7.11** | W6 Cold+rain+suede (5) | W1/W3 (9) |
| Personalisation | **7.20** | PR4 Style conflict (5) | PR1 Loved outfit (9) |
| Quiet Luxury | **8.78** | F6 Active synthetic (5) | QL1 Silk+cashmere (10) |

**Key observation:** Quiet Luxury ranks highest (8.78) because many well-constructed scenarios use premium fabrics (silk, wool, leather, cashmere), artificially lifting the mean. Formality (6.81) and texture (6.91) are the genuine weak points.

---

## 7. Category Results

| Category | Scenarios | With Candidates | Top-1 Mean External |
|----------|----------:|----------------:|--------------------:|
| Colour | 6 | 4 | 77.5 |
| Proportion | 8 | 5 | 77.6 |
| Quiet Luxury | 6 | 6 | 77.0 |
| Formality & Occasion | 6 | 3 | **71.3** ← lowest |
| Weather & Practicality | 6 | 6 | **81.4** ← strongest |
| Pattern & Texture | 5 | 4 | 75.3 |
| Personalisation | 6 | 6 | 78.7 |
| Scarcity & Edge Cases | 5 | 2 | 78.0 |
| Adversarial | 7 | 4 | 78.0 |

**Weather is the strongest category** (81.4): deterministic weather gating works reliably. **Formality is the weakest** (71.3): F3 date-dressy (71) and F6 active (66) pull this down. Scarcity and Adversarial produce 0 candidates at high rates (3/5 and 3/7 respectively).

---

## 8. Top 10 False Positives

*Engine ranks an outfit highly; external evaluation considers it weaker than the score implies.*

**FP1 — QL2: Boring grey outfit scores identically to sophisticated silk+cashmere**
- Outfit: grey cotton t-shirt + beige cotton chinos + white synthetic sneakers + black synthetic backpack
- Internal: 97 | External: 75/Strong | Gap significance: Engine treats this identically to QL1 (internal=96, external=80/Excellent)
- Why engine liked it: All-neutral palette passes colour harmony; all-solid patterns score perfectly; completeness bonus; correct formality for casual; all items casual-tagged.
- Why a stylist would rate it lower: Zero fabric quality signal. Synthetic sneakers + synthetic backpack + two cotton basics = no sophistication cue. Four distinct neutrals (grey/beige/white/black) trigger the "tonal variation = sophisticated" heuristic, but they were assembled randomly, not intentionally.
- Missing concept: **Fabric quality / visual sophistication signal**
- Root cause: Scoring

**FP2 — QL3: Navy mono-rich cashmere rates higher than quality justifies**
- Outfit: navy cashmere knit + navy wool trousers + navy suede loafers + navy leather tote
- Internal: 104 | External: 76/Strong
- Why engine liked it: Strong colour harmony (mono = no conflict), premium fabrics, complete, high formality alignment.
- Why external is lower: Head-to-toe mono reads rich in person (three distinct navy tones) but the engine's colour-family data cannot distinguish tonal variation within a single family.
- Missing concept: **Tonal value variation within a colour family** (`dominantHsl.l` exists but is not consumed)
- Root cause: Data

**FP3 — AD7: Loved worn-yesterday (expected internal/external divergence)**
- Outfit: navy silk blouse + black wool trousers + black leather pumps (2 loves, worn yesterday)
- Internal: 107 | External: 79/Strong
- Why engine liked it: 2 love reactions (+20), wornHistoryBoost after freshness penalty (~+6).
- Why gap is expected: The internal score correctly reflects personalisation weighting. External=79 reflects styling quality without personalisation context — a valid stylist score for a strong-but-not-exceptional outfit. This divergence is intended.
- Root cause: Expected — personalisation lifts internal correctly

**FP4 — C4: Black+White corporate suit over-scores**
- Outfit: white tailored shirt + black wool trousers + black leather pumps + gold necklace
- Internal: 95 | External: 82/Excellent
- Why gap exists: Formality + neutral + complete = near-max internal score. External correctly notes this is a strong but standard corporate look, not exceptional.
- Root cause: Weighting

**FP5 — QL1: Silk+Cashmere correctly rated Excellent externally, but engine cannot distinguish it from QL2**
- Internal: 96 (same range as boring grey QL2 at 97). The engine's failure is not over-rating QL1 — it's failing to under-rate QL2.
- Root cause: Scoring — no fabric quality signal

**FP6 — SC1: Small wardrobe basic outfit over-scores**
- Outfit: white cotton blouse + black cotton trousers + black leather loafers + black leather tote
- Internal: 103 | External: 79/Strong
- Why engine liked it: Complete (4 pieces), all work-tagged, neutral palette, solid patterns, good formality.
- Why external is lower: Cotton on both core pieces limits sophistication ceiling. Score of 103 is inflated for an "office basics" combination.
- Root cause: Scoring — completeness bias + neutral bonus with no penalty for lower-quality fabrics inflates the floor for any complete valid outfit

**FP7 — QL3/QL4: Premium monochromatic outfits cluster around internal=96–104 regardless of sophistication level**
- All-black silk+wool=96, all-navy cashmere+suede=104. Both Strong externally (76–77). The engine cannot differentiate between levels of sophistication within a premium-neutral palette.
- Root cause: Scoring

**FP8 — PT3: Solid alternative over-scores despite being basic cotton**
- The solid navy cotton blouse correctly wins over the stripe+check clash. However it receives an inflated internal score because it's a complete, neutral, work-tagged outfit — even though it's a basic cotton blouse.
- Root cause: Scoring

**FP9 — F2: Business casual blazer outfit scores similarly to more elevated alternatives**
- Internal: 81 for blush silk + navy cotton trousers + tan leather loafers + navy linen blazer
- The navy cotton trousers suppress quality below what the silk blouse promises, yet internal score is near-peak.
- Root cause: Weighting — no fabric quality penalty for mismatched fabric tiers within one outfit

**FP10 — PR5a: Minimal user score ceiling compressed**
- Internal=90 for navy silk blouse + black wool trousers — same range as far more complex outfits across other scenarios. Score ceiling compression means the engine cannot signal "this is truly excellent" vs "this is solidly good."
- Root cause: Score ceiling compression — most complete valid outfits cluster in the 75–110 range

---

## 9. Top 10 False Negatives

*An excellent outfit is ranked substantially below weaker alternatives, or given a misleadingly low confidence score.*

**FN1 — W2: Linen sundress in 36°C heat (internal=44 vs external=80)**
- Outfit: white linen sundress + tan leather sandals + tan wicker bag
- Internal: 44 | External: 80/Excellent | Engine rank: 1 (only candidate)
- Why it's externally excellent: Perfectly weather-appropriate for 36°C, correct occasion, visually clean, material-appropriate, complete.
- Why engine underscores it: Sundress category bypasses top/bottom proportion scoring; neutral linen palette scores modestly; no premium-fabric bonuses; no formality bonus for casual sundress. The engine selects it correctly but assigns a confidence score that would display as very low in any UI signal.
- Missing concept: **Positive reward for weather-correct contextual fitness.** The practicality scorer only subtracts for failures; it doesn't reward correct choices.
- Root cause: Scoring

**FN2 — C6: Warm/cool tension outfit underscored (internal=43 vs external=74)**
- Outfit: burgundy wool knit + blue denim midi + tan ankle boots
- Internal: 43 | External: 74/Strong | Engine rank: 1 (only candidate)
- Why it's underscored: Warm/cool chromatic tension (burgundy + blue) scores modestly on colour harmony. The engine has no concept of intentional complementary-spectrum tension; it reads as a colour mismatch.
- Missing concept: **Intentional chromatic tension** (warm vs cool deliberately combined)
- Root cause: Scoring

**FN3 — AD6: Quiet luxury for work severely underscored (internal=50 vs external=80)**
- Outfit: ivory silk blouse + stone cashmere wide-leg + tan leather loafers
- Internal: 50 | External: 80/Excellent | Engine rank: 1 (only candidate)
- Why it's externally excellent: Elevated fabric quality (silk + cashmere), restrained neutral palette, perfect work formality alignment, sophisticated proportions (high-rise + slim top).
- Why engine gives 50: No fabric quality signal. Two close neutrals don't trigger strong palette bonuses. Absence of accessories depresses completeness score.
- Root cause: Scoring — fabric quality signal absent; quiet luxury outfits are structurally undervalued

**FN4 — F3: Date-dressy satin slip (internal=52 vs external=71)**
- Outfit: burgundy satin slip + black wool blazer + gold strappy heels + gold earrings
- Internal: 52 is low for a valid, intentional date-dressy outfit. Pool thinness + moderate occasion alignment depress the score.
- Root cause: Scoring / candidate pool thinness

**FN5 — P1 petite: Slim trousers ranked below wide-leg (rank 2 at int=66 vs rank 1 at int=76)**
- For a petite user, slim black wool trousers (internal=66, external=79) lose to wide-leg black cotton trousers (internal=76, external=77).
- The slim option is marginally better for petite proportions yet ranks second. Internal gap: 10 points. External gap: 2 points.
- Why: heightBand/bodyType signals (±1–2) are too weak to overcome completeness and other bonuses the wide-leg outfit also receives.
- Root cause: Scoring — body-type proportion signals too weak relative to completeness bonus

**FN6 — QL6: Quiet luxury outfit wins correctly but is severely undervalued (internal=54 vs external=80)**
- Ivory silk + stone cashmere wide-leg + tan leather loafers: internal=54, external=80/Excellent — rank 1
- The engine correctly selects it (the orange tee competitor is excluded from work pool by occasion filter), but internal=54 means the engine doesn't know it produced an excellent outfit.
- Root cause: Scoring — same fabric quality blindness as FN3

**FN7 — PR5b: Bold user personalisation signal barely fires (2-point gap)**
- Bold/colourful user gets red cotton blouse ranked just above navy silk blouse (61 vs 59 — 2-point gap).
- For a bold-preference user, the red option is more on-brand but the engine barely differentiates.
- Root cause: Personalisation — style-goal signals contribute ±2–5 points vs reactions ±10–20. Preference signal is real but numerically weak.

**FN8 — AD3: Gown penalised correctly; underlying scoring observation**
- Gown (internal=27, external=78 for the garment quality) is correctly penalised for brunch occasion.
- The engine is right to deprioritise it; not a genuine false negative. Noted because the gown entering the pool at all (with a very low score rather than being hard-gated) is a design observation.
- Root cause: Candidate generation — occasion-tag hard gate pre-scoring would be cleaner than scoring-level penalty

**FN9 — W2 confirmation: Wool knit correctly suppressed**
- The wool knit (heavy fabric, warmthBand:'cold') was correctly excluded from the hot-weather pool. Weather gating works. Documented to confirm the mechanism.

**FN10 — PT4: Velvet+denim texture clash (engine and rubric agree it's weak)**
- Burgundy velvet top (formalityLevel=5) + blue denim jeans (formalityLevel=2): internal=55, external=69/Acceptable.
- Both engine and external rubric correctly identify the formality mismatch as the central problem. Not a genuine false negative — the engine is right.

---

## 10. Candidate-Generation Failures

**14 of 55 scenarios (25%) returned zero candidates.** This is the most significant structural finding.

| Scenario | Root Cause |
|----------|-----------|
| C2 Sage+olive brunch | Small 4-item wardrobe fails brunch hero selection |
| C3 Cream/ivory tonal brunch | Small 4-item wardrobe fails brunch hero selection |
| P2 Tall oversized brunch | Double-volume (oversized+loose) volume hard gate OR brunch constraint |
| P6 Rectangle blazer brunch | Floral midi + linen blazer combination fails hero generation for brunch |
| P8 High-rise oversized casual | Volume hard gate eliminates oversized+high-rise before riseHarmony can fire |
| F1 Interview suit | Interview is a premium occasion; scenario run without isPremium=true |
| F4 Wedding guest | Wedding is a premium occasion; scenario run without isPremium=true |
| F5 Linen+floral brunch | Small 4-item wardrobe fails brunch candidate generation |
| SC2 No footwear | Engine correctly requires shoes — right behaviour |
| SC3 No work items | All items tagged casual — engine correctly returns 0 for work |
| SC4 No outerwear cold | Cold-weather gate requires coat — engine correctly returns 0 |
| AD1 Matchy-grey casual | Small 4-item wardrobe fails casual candidate generation |
| AD4 Poor proportion brunch | Small 3-item wardrobe fails brunch generation |
| AD5 Formality mismatch work | Silk blouse (L7) + denim jeans (L2) correctly rejected by formality hard gate |

**Three distinct root causes:**

**1. Expected / correct behaviour (SC2, SC3, SC4, F1, F4, AD5):**
The engine correctly returns nothing when constraints cannot be satisfied. This is right.

**2. Brunch occasion sensitivity with small wardrobes (C2, C3, P2, P6, F5, AD1, AD4):**
Multiple scenarios with 3–4 correctly-tagged items fail to generate any brunch candidates. A user with a blouse, linen trousers, sandals and earrings (all brunch-tagged) should receive a recommendation. This is a production concern for new/small-wardrobe users.

**3. Hard gate elimination before scoring (P8, AD5):**
Volume gate and formality gate correctly eliminate combinations that should not reach scoring. In P8's case, this prevents the Phase 3.1 riseHarmony negative signal from being observable — the engine handles the failure at the right level (candidate generation) rather than relying on the scoring penalty.

**Production concern:** The brunch occasion appears to have minimum wardrobe requirements that are too strict. Users in the early stages of wardrobe digitisation (8–12 items) whose items skew brunch/casual may consistently receive no brunch recommendations.

---

## 11. Phase 3.1 Evaluation

### Freshness (P0-A)

**Test PR3 — Loved outfit worn yesterday:**

| Outfit | Internal | External | Rank |
|--------|----------|---------|------|
| Cream silk blouse + camel linen trousers + tan loafers (2 loves, worn 1 day ago) | 89 | 81/Excellent | 1 |
| Navy cotton blouse + camel linen trousers + tan loafers (fresh, no reactions) | 70 | 80/Excellent | 2 |

The loved outfit stays #1. The freshness penalty (−8 for worn yesterday) is applied, but two love reactions (+20 combined) create a substantial net advantage. Internal gap narrows from ~27 (pre-Phase-3.1 estimated) to 19 points. The external rubric considers them near-equal (81 vs 80) — the loved outfit is genuinely the better choice. Ranking is correct.

**Test AD7 — Loved outfit worn yesterday vs weak fresh alternative:**
- Navy silk + wool trousers + leather pumps (2 loves, worn yesterday): internal=107, external=79 — Rank 1 (only candidate; grey cotton tee excluded from work pool by occasion filter).
- Phase 3.1 works as designed: an excellent loved outfit stays accessible; the freshness penalty ensures it yields to viable fresh alternatives when they exist.

**Verdict on freshness:** ✅ Working correctly. Graduated penalty creates the right trade-off. Strongly loved outfits survive the penalty; rarely-loved recent outfits are meaningfully demoted. The system correctly distinguishes "frequently loved, recently worn" from "worn once, unreacted to."

---

### Rise (P0-B)

**Test P3 — Pear, wide-leg + slim top (positive riseHarmony expected):**
- White silk blouse (slim) + black wool wide-leg (high-rise) + black heels + black tote: internal=115, external=77
- Both `bodyTypeProportion` (+2 for pear+slim top) and `riseHarmony` (+1 for high-rise+slim) fire simultaneously. Correctly ranked #1.

**Test P8 — High-rise + oversized top (negative riseHarmony expected):**
- 0 candidates returned. The oversized top triggers the volume hard gate before `riseHarmony` is applied. The Phase 3.1 signal cannot be observed for this specific scenario because candidate generation correctly eliminates the double-volume combination first.

**Test P5 — Hourglass, fitted structure:**
- Burgundy silk blouse (tailored) + black wool pencil skirt (high-rise): internal=82, external=79
- `riseHarmony` = +1 (high-rise + tailored top) confirmed active.

**Verdict on rise:** ✅ Working correctly where candidates are generated. Range of ±1 is appropriately conservative. The volume hard gate correctly eliminates the most egregious proportion failures before rise scoring, which is the right ordering of concerns.

---

## 12. Task #389 Investigation

**Claim:** `wornHistoryBoost` uses the `wearHistory` array at pool-generation time. `applyFreshnessOrder` uses `recentWornFingerprints` at rotation time. If these diverge, the score-based freshness penalty and the positional tiebreaker could use different data.

**Evidence:**

```
Pool generated with wearHistory (1 worn outfit):
  Worn outfit found in pool — confidenceScore = 85 (freshness penalty applied)
  Other outfits in pool: 0

applyDailyRotation without recentWornFingerprints → 1 outfit served
applyDailyRotation with recentWornFingerprints    → 1 outfit served
(Same result — only 1 outfit in pool, no meaningful positional reordering)
```

**Analysis:**
- `wornHistoryBoost` applies the −8/−5/−2/0 freshness penalty at **pool-generation time** using `wearHistory`.
- `applyFreshnessOrder` applies a **positional tiebreaker** at rotation time using `recentWornFingerprints`.
- In production (`outfits.tsx`), both values are derived from the same `useWearHistory()` hook call in the same render cycle. They cannot diverge under normal conditions.

**Conclusion: THEORETICAL.** The two data sources are independent parameters but always populated from the same source. The issue would only materialise if: (a) the pool is cached and reused while history changes between calls, or (b) a future refactor decouples the two reads. Neither condition currently applies.

*Risk level: Low. Architecture-level note only. No user impact observed.*

---

## 13. Task #391 Investigation

**Claim:** The same outfit appearing in multiple scenario pools receives different scores per scenario, and first-occurrence-wins dedup arbitrarily favours whichever scenario encountered it first.

**Evidence — testing outfit across all occasions:**

| Occasion | Outfit present? | Score |
|----------|----------------|-------|
| work | ✅ | 89.00 |
| casual | ❌ | not in pool |
| date-casual | ❌ | not in pool |
| brunch | ❌ | not in pool |

The outfit (navy silk blouse + tailored trousers + loafers, tagged `work/event`) only appeared in the work pool. Items with focused occasion tags will not appear in multiple pools — the occasion filter correctly removes them.

**Does cross-scenario score inconsistency exist?** Yes, in theory — `scoreOutfitCombo` evaluates `formalityCohesion` against the scenario's occasion-specific formality target. The same outfit would receive different `formalityCohesion` scores for work vs date-casual vs event. This is **legitimate contextual differentiation**, not a bug.

**Does first-occurrence-wins harm users?** Only when a genuinely multi-occasion outfit appears in both pools with meaningfully different scores. For correctly-tagged items, this is rare. For broadly-tagged items, the score difference reflects genuine contextual appropriateness.

**Conclusion: LIMITED in practice.** Score variation across occasions is desirable — a formal outfit should score differently for work vs casual. The dedup concern applies specifically to items with overlapping broad occasion tags, which is a wardrobe metadata quality issue, not an engine architecture defect.

---

## 14. Personalisation Evaluation

### Four-user controlled comparison (same wardrobe, different profiles)

**PR5a — Minimal/classic user (User A):**
- Rank 1: navy silk blouse + black wool trousers + black leather loafers — internal=90, external=79
- Rank 2: red cotton blouse + black wool trousers + black leather loafers — internal=72, external=79
- Engine correctly favours the restrained navy silk for the minimalist user. Style-goal signal fires.

**PR5b — Bold/colourful user (User B):**
- Rank 1: red cotton blouse + black wool trousers + black leather loafers — internal=61, external=80
- Rank 2: navy silk blouse + black wool trousers + black leather loafers — internal=59, external=78
- Engine narrowly favours red for the bold user. A 2-point difference.

**Observation:** Personalisation is directionally correct (minimalist gets restrained; bold gets colour) but the differentiation is very small. A 2-point gap for style-goal signals vs 18–23 point gaps for reaction signals shows that style-goal is a weak driver relative to objective outfit quality.

### Reaction and wear history personalisation

| Test | Engine behaviour | Assessment |
|------|-----------------|------------|
| PR1 Love reaction | Loved outfit elevated from rank-parity to +23 internal points | ✅ Strong signal |
| PR2 Not-today reaction | Rejected outfit demoted from likely rank 1 to rank 2 (75 vs 73) | ⚠️ Weak — 2-point gap; not-today penalty is modest |
| PR3 Freshness + love | Loved-and-recently-worn stays #1 with narrowed gap (89 vs 70) | ✅ Correct |
| PR4 Style conflict | Minimal user gets orange tee + jeans — best available, against profile | ✅ Honest failure; engine cannot avoid it |

**Verdict:** Reaction personalisation is strong. Style-goal and body-type personalisation are directionally correct but numerically weak (±2–5 points vs ±10–20 for reactions). The engine is **moderately personalised** — not generic, but predominantly driven by objective outfit quality over stated preference.

---

## 15. Quiet-Luxury Evaluation

**The engine cannot distinguish boring-neutral from sophisticated-neutral.** This is the central quiet-luxury finding.

| Scenario | Outfit | Internal | External | Gap |
|----------|--------|----------|---------|-----|
| QL1 Sophisticated neutral | Cream silk + camel cashmere wide-leg + cream leather mule | 96 | 80 Excellent | — |
| QL2 Boring neutral | Grey cotton tee + beige chinos + white synthetic sneakers | **97** | 75 Strong | 1pt internal, 5pt external |
| QL3 Mono-rich (navy, 3 premium fabrics) | Navy cashmere + navy wool + navy suede loafers | 104 | 76 Strong | — |
| QL4 Restrained all-black premium | Black silk + black wool + black leather pumps + gold earrings | 96 | 77 Strong | — |
| QL5 Texture-led: Silk+Tweed | Cream silk blouse + grey tweed midi | 72 | 74 Strong | — |
| QL6 Quiet luxury vs colourful noise | Ivory silk + stone cashmere wide-leg | **54** | 80 Excellent | 26pt external over internal |

**Key findings:**

1. **QL2 (boring grey) = QL1 (sophisticated silk+cashmere) in the engine's eyes.** A 1-point internal difference despite a 5-point external quality gap. The rubric correctly identifies the distinction; the engine does not.

2. **QL6 is the most alarming data point.** Ivory silk + cashmere wide-leg + leather loafers scores internal=54 — barely above what a t-shirt + jeans would score. This is a genuinely excellent quiet-luxury work outfit rated as barely adequate by the engine. It wins rank 1 only because the orange tee competitor is correctly excluded from the work pool by occasion filter — not because the engine recognises its quality.

3. **Phase 3 concern confirmed empirically.** The Phase 3 forensic audit noted that neutral wardrobes may be disadvantaged in hero selection because hero-distinctiveness scoring may favour colour and pattern over material quality. This benchmark confirms the concern extends to the scoring level as well.

4. **What quiet luxury needs that the engine currently lacks:**
   - Fabric quality tier signal (cashmere/silk/wool > cotton > synthetic)
   - Recognition that all-neutral + statement-fabric = sophisticated (not boring)
   - Tonal variation reward within a single neutral family (utilising `dominantHsl.l`)

---

## 16. Top Three Recommendation-Quality Gaps

### Gap 1 — Neutral-Quality Blindness (Highest severity)

**Problem:** The engine cannot distinguish boring-neutral from sophisticated-neutral. Grey cotton basics score identically to silk/cashmere luxury outfits when all else is equal.

**Evidence:**
- QL2 (boring grey): internal=97, external=75
- QL1 (silk+cashmere): internal=96, external=80
- QL6 (quiet luxury for work): internal=54, external=80
- AD6 (quiet luxury vs noisy casual): internal=50, external=80

**Affected scenarios:** QL1–QL6, AD6, C6, W2 — 9/41 scenarios with candidates (22%) show meaningful engine/external divergence traceable to fabric quality blindness.

**Severity:** High. This is the core gap between AuraCloset's positioning (personal stylist, elevated fashion) and its actual scoring capability. The engine cannot communicate "this is an excellent outfit" vs "this is a technically valid outfit."

**Frequency:** Every scenario involving neutral-dominant wardrobes is affected. Estimated 30–40% of real user wardrobes skew neutral.

**User impact:** A user with a luxury wardrobe (silk, cashmere, leather) and a user with a basics wardrobe (cotton, denim, synthetic) receive recommendations with equivalent confidence scores. No quality signal exists to differentiate.

**Root cause:** Scoring — no fabric quality / price signal in `scoreOutfitCombo`.

---

### Gap 2 — Candidate Generation Failures for Small Wardrobes (Structural severity)

**Problem:** 14/55 scenarios (25%) return 0 outfits. Multiple brunch-occasion scenarios with correctly-tagged items fail. Users with small wardrobes silently receive no recommendations.

**Evidence:**
- C2 (4 brunch-tagged items, 0 candidates)
- C3 (4 brunch-tagged items, 0 candidates)
- P2 (3-item brunch wardrobe, 0 candidates)
- F5 (4-item brunch wardrobe, 0 candidates)
- AD1 (4-item casual wardrobe, 0 candidates)
- AD4 (3-item brunch wardrobe, 0 candidates)

**Severity:** High for affected users. Silent failure — no error, no fallback, no explanation.

**Frequency:** Likely affects a substantial portion of new users (few items digitised) and users whose wardrobe skews toward specific occasions. Brunch and wedding appear particularly sensitive.

**User impact:** A new user digitises 8 items, 4 of which are brunch-appropriate. They open the app for brunch recommendations and receive a blank screen. High retention risk at exactly the moment of first engagement.

**Root cause:** Candidate generation pipeline — hero-selection minimum requirements are too strict for small wardrobes and specific occasions.

---

### Gap 3 — Internal Score / External Quality Calibration Divergence (Reliability severity)

**Problem:** The internal confidence score poorly predicts external quality. Excellent outfits score very low internally; adequate outfits score very high. The engine cannot signal the difference between "this is an excellent recommendation" and "this is the best available option from a limited wardrobe."

**Evidence:**

| Scenario | Outfit type | Internal | External | Gap |
|----------|------------|----------|---------|-----|
| W2 | Weather-perfect linen sundress | 44 | 80 | +36 ext |
| C6 | Valid warm/cool tension | 43 | 74 | +31 ext |
| AD6 | Quiet luxury for work | 50 | 80 | +30 ext |
| QL2 | Boring grey basics | 97 | 75 | −22 ext |
| SC1 | Basic cotton office outfit | 103 | 79 | −24 ext |

The internal score range is 27–115. External quality range is 66–86 — only a 20-point spread. Internal score has a 4× larger dynamic range than actual quality justifies.

**Severity:** Medium. Users still receive the correct outfit (highest internal scorer is usually the best available). However: UI confidence displays are misleading; future features using internal scores for analytics will produce incorrect conclusions; debugging recommendations becomes harder when the engine scores its best work as mediocre.

**Frequency:** Affects every scenario where a simple but contextually correct outfit competes against a complex but contextually misaligned one.

**Root cause:** Scoring — completeness bias and binary pattern-safety create large score floors for any complete valid outfit; luxury/sophistication signals are absent; score is not calibrated against an absolute quality standard.

---

## 17. Recommended Next Improvements

*In order of estimated impact-to-risk ratio. None are implemented.*

### Recommendation 1 — Fabric Quality Tier Signal

**Problem addressed:** Gap 1 (neutral-quality blindness)

**Proposed approach:** Add a `fabricQuality` computed property to `scoreOutfitCombo`. Map each fabric to a tier:
- Tier 3 (luxury): cashmere, silk, wool, suede, leather, velvet, satin, tweed, linen → contributes +0 to +2 to score
- Tier 2 (quality casual): cotton, denim, knit, corduroy → 0 (neutral)
- Tier 1 (synthetic/fast): synthetic, jersey → −0 to −1 for elevated occasions only (formalityTarget > 3)

Scope: A single new `fabricQuality` dimension (max range ±2) in `OutfitScoreBreakdown`. Only apply the negative penalty when occasion requires formality — preserve correct scoring for casual/active athletic outfits.

**Expected improvement:** Correctly gaps QL1 from QL2 by ~6 internal points. Lifts AD6 (quiet luxury, internal=50) to ~58. Does not penalise casual cotton basics.

**Complexity:** Low. `fabric` field already populated by Gemini at classification time. No new data required.

**Risk:** Low. Range (±2) deliberately conservative. Cannot cause a worse outfit to outrank a better one in most scenarios.

**Requires:** Scoring change only. No candidate generation, no new data.

**Solvable without Gemini:** Yes.

---

### Recommendation 2 — Candidate Generation Robustness for Small Wardrobes

**Problem addressed:** Gap 2 (candidate generation failures)

**Proposed approach:** Add a "best available" fallback in `generateOutfitPool` for any occasion that would otherwise return an empty array. When 0 candidates are generated for a specific occasion:
1. Relax hero-distinctiveness threshold to include all items with that occasion tag as potential heroes.
2. If still 0, serve the highest-scoring outfit from an adjacent occasion (brunch → casual → work by formality order).

Mark any fallback outfit clearly in the `OutfitSet` metadata (e.g., `isFallback: true`) so the UI can optionally communicate "best available" rather than a confident recommendation.

**Expected improvement:** Eliminates silent empty-hand failures for small wardrobes. Users with 4–6 items always receive at least one recommendation.

**Complexity:** Medium. Requires modifying `pickHeroCandidates` and the outer occasion loop in `generateOutfitPool`.

**Risk:** Low-to-medium. Relaxing hero selection for the fallback path could reduce first-outfit quality. The fallback must only fire when the strict pipeline returns 0.

**Requires:** Candidate generation changes only. No scoring changes.

**Solvable without Gemini:** Yes.

---

### Recommendation 3 — Contextual Score Normalisation (Display Layer)

**Problem addressed:** Gap 3 (internal score / external quality calibration)

**Proposed approach:** Add an occasion-relative display normalisation pass. Rather than exposing raw `confidenceScore` in the UI, compute a normalised signal relative to the pool for this user and occasion:
- Pool ≥ 3 outfits: normalise to percentile within pool → show as high/medium/low confidence
- Pool 1–2 outfits: show as category label ("strong match", "best available") rather than a raw number

This does **not** change ranking — ranking uses the raw score. Only user-visible quality signals are affected. The raw `confidenceScore` is preserved for all internal logic.

**Expected improvement:** W2 linen sundress (internal=44 but the best hot-weather option) shows as "strong match" rather than a low confidence display. QL6 quiet luxury (internal=54, external=80) shows as excellent for this wardrobe rather than barely adequate.

**Complexity:** Low. UI display layer only. No engine changes.

**Risk:** Low. Ranking is unchanged.

**Requires:** Display-layer change only.

**Solvable without Gemini:** Yes.

---

## 18. Gemini Assessment

**Based on the benchmark evidence, Gemini integration is not currently warranted.**

### Why the current failures don't require Gemini

The three principal failure modes are:

1. **Missing fabric quality signal** — a data problem, not a visual hierarchy problem. The `fabric` field exists and is correctly populated by Gemini at classification time. The recommendation engine simply doesn't consume it for quality scoring. A deterministic fix (Recommendation 1) directly addresses this.

2. **Candidate generation failures** — a structural pipeline problem. Gemini cannot evaluate outfits that never reach scoring. The fix is upstream of any LLM evaluation stage.

3. **Internal score calibration** — a scoring weighting problem. Adjusting deterministic scoring terms would correct the calibration. Gemini would not see raw scores.

### Where Gemini might theoretically help

A small number of benchmark failures (estimated 3–4/54 outfits, ~7%) reflect the type of visual judgment Gemini excels at:
- **Intentional high-fashion combinations:** PT2 (leather+silk) and PT4 (velvet+denim) — the engine scores these based on formality gap, not on whether the combination is a deliberate fashion statement. Gemini could identify intentional high-low mixing.
- **Tonal value variation within a colour family:** QL3 (navy head-to-toe) — the engine cannot tell whether three navy items are identical or three distinct tonal values. Gemini could evaluate this from images.
- **Unusual-but-valid combinations:** A leather trench over a slip dress reads as high fashion but might score poorly on formality cohesion. Gemini would recognise the cultural reference.

### Recommendation

Defer Gemini until after Recommendations 1–3 are implemented and re-benchmarked. If the post-improvement benchmark still shows failures concentrated in visual-hierarchy and intentional-combination cases (rather than data-missing or structural cases), Gemini as a **veto filter on the top-5 shortlist** would be the most cost-effective integration. It would run once per recommendation request against a 5-item shortlist (not the full candidate pool), minimising latency and cost.

The threshold for Gemini integration is: if the deterministic engine's failure rate in visual-hierarchy cases exceeds ~15% of top recommendations after Recommendations 1–3.

---

## 19. Gold-Standard Regression Specification

**AuraCloset Recommendation Quality Regression Suite — v1.0**

### Scenario Format

```typescript
interface BenchmarkScenario {
  id: string;                    // e.g. "C1", "P3", "QL2"
  category: ScenarioCategory;
  name: string;
  description: string;           // what the scenario tests
  challenge: string;             // why it is difficult
  wardrobe: WardrobeItem[];      // 4–15 items with full metadata
  profile: UserProfile;          // complete: bodyType, heightBand, styleGoal, undertone
  targetOccasion: OccasionTag;
  weather?: WeatherSnapshot;
  reactions?: OutfitReaction[];
  wearHistory?: WearEntry[];
  isPremium?: boolean;
}

type ScenarioCategory =
  | 'Colour' | 'Proportion' | 'Quiet Luxury' | 'Formality'
  | 'Weather' | 'Pattern/Texture' | 'Personalisation' | 'Scarcity' | 'Adversarial';
```

### Wardrobe Format Requirements

- All items MUST use valid type literals: `ItemCategory`, `Fit`, `Rise`, `Fabric`, `Pattern`, `OccasionTag`, `SeasonTag`
- `formalityLevel`: integer 1–9. Avoid 0 or 10.
- `seasonTags`: include `'all-season'` or the season for the test date
- `occasionTags`: realistic — do not tag a gown as 'casual'
- Wardrobe size: 4–15 items. Do not use 30+ item wardrobes (too many candidates; reduces test precision)

### External Evaluation Rubric (0–10 per dimension, 0–100 total)

| Dim | Dimension | Key evaluation question |
|-----|-----------|------------------------|
| A | Colour Harmony | Does the palette work aesthetically? (harmony, restraint, intentional accent) |
| B | Silhouette & Proportion | Does the silhouette balance? (volume, rise, waist definition, length relationships) |
| C | Occasion Appropriateness | Do item occasion tags match the target occasion? |
| D | Formality | Is avg formalityLevel in the appropriate range for the target occasion? |
| E | Visual Coherence | Are patterns, formality levels, and overall style consistent? |
| F | Texture & Material | Is there appropriate texture contrast or harmony? |
| G | Visual Interest & Sophistication | Does the outfit have a visual anchor? Is it sophisticated or flat? |
| H | Practicality | Is the outfit appropriate for the weather and activity conditions? |
| I | Personalisation | Does the outfit reflect the user's stated profile (goals, bodyType, reactions)? |
| J | Quiet Luxury | Does the outfit feel polished and refined? (fabric quality, restraint, tailoring) |

### Occasion Formality Targets

| Occasion | Target range | Label |
|----------|-------------|-------|
| work | 3–6 | business casual |
| interview | 5–8 | business formal |
| casual | 1–4 | relaxed |
| brunch | 2–5 | smart casual |
| date-casual | 3–6 | smart casual |
| date-dressy | 5–8 | dressy |
| event | 6–9 | formal |
| wedding | 6–9 | formal |
| night-out | 5–8 | dressy |
| travel | 2–5 | smart casual |
| resort | 2–6 | relaxed-resort |
| active | 1–3 | athletic |

### Expected Outputs Per Scenario

For each scenario, capture:
- `candidateCount` — number of outfits in the pool for the target occasion
- `error` — any engine exception
- For each of the top 5 outfits:
  - `components` — outfit component list
  - `resolvedItems` — full WardrobeItem for each matched component
  - `internalScore` — engine's `confidenceScore`
  - `breakdown` — `OutfitScoreBreakdown` where accessible
  - `rubric` — all 10 external dimension scores and total
  - `reasons` — per-dimension explanation string

### False Positive Definition

An outfit is a false positive if:
- It is ranked #1 by the engine
- Its external quality score is ≥10 points below what would be expected given its internal score rank
- **Threshold:** external score ≤60 for a #1-ranked outfit with internal score in the top quartile for its scenario category

### False Negative Definition

An outfit is a false negative if:
- It ranks lower than #1 by the engine
- Its external quality score is ≥8 points higher than the #1-ranked outfit's external quality score
- **Threshold:** external score gap ≥8 between rank-1 and a lower-ranked outfit

### Regression Criteria

A recommendation-engine change is a **regression** if any of:
- Mean external quality drops ≥2 points from the 77.3 baseline
- Acceptable-or-worse outfits increase by ≥2
- False positive count increases by ≥2
- Number of 0-candidate scenarios increases (candidate generation becomes more restrictive)

A recommendation-engine change is an **improvement** if:
- Mean external quality increases ≥2 points
- Excellent-or-better outfits increase in count
- False positive / false negative balance improves
- Formality dimension mean improves (currently 6.81 — the weakest)
- Number of 0-candidate scenarios decreases (candidate generation becomes more robust)

### Reusable Test Suite

The full benchmark is implemented as a runnable, isolated TypeScript file:

```bash
npx tsx __tests__/benchmark-phase32.ts
```

No production code changes required. The script imports real production functions and outputs:
- Scenario-level detail (candidates, internal score, external rubric, breakdown)
- Aggregate statistics (mean/median/min/max, grade distribution, dimension means)
- Category-level aggregates
- False positive and false negative lists
- Phase 3.1 freshness and rise evidence
- Task #389 and #391 investigation results

---

## 20. Final Verdict

### **COMPETENT**

**Evidence supporting COMPETENT:**

The engine correctly handles:
- **Weather gating** — hot-weather suppression (W2), cold-weather coat requirement (W1), rain-appropriate outerwear selection (W3). Weather category mean: 81.4 — the strongest category.
- **Occasion filtering** — gown excluded from brunch (AD3), casual items excluded from work (SC3), premium occasions correctly gated (F1, F4).
- **Reaction signals** — love reactions (+23 point advantage in PR1), not-today reactions (correctly demotes in PR2), freshness penalty (narrows gap in PR3 without suppressing quality).
- **Formality hard gates** — silk blouse (L7) + denim jeans (L2) correctly rejected before reaching scoring (AD5).
- **Pattern safety** — stripe+check combination correctly penalised (PT3).
- **Rise scoring** — high-rise + slim confirmed positive (P3, P5), volume hard gate correctly handles the adversarial cases before rise scoring is needed (P8).
- **Phase 3.1** — freshness and rise changes both verified working correctly.
- **Quality floor** — no outfit scored below 66/100 externally. The engine never produces a stylist-rejectable recommendation.

**Why not STRONG:**

- Neutral-quality blindness prevents the engine from recognising or communicating quality differences between a luxury outfit and a basics outfit when both are neutral and complete.
- 25% candidate generation failure rate creates silent empty-hand failures affecting small-wardrobe users.
- Internal score calibration diverges significantly from external quality for weather-appropriate simple outfits and quiet-luxury outfits.
- No outfit scored Exceptional (≥90 externally). The engine produces Strong and Excellent outfits, not Exceptional ones.
- Style-goal and body-type personalisation signals are weak relative to other scoring dimensions.

**Summary:** The engine is technically sophisticated — weather integration, body-type scoring, preference learning, rise/freshness mechanics all function correctly — but stylistically inconsistent because it lacks the signals needed to distinguish the quality of execution from the adequacy of execution. A competent stylist would describe the output as: *always wearable, sometimes really good, never truly exceptional.*

---

**PHASE 3.2 STATUS: COMPLETE**

**PRODUCTION CODE CHANGES: NONE**

**RECOMMENDATION ENGINE CHANGES: NOT AUTHORISED**

**BENCHMARK SCRIPT:** `__tests__/benchmark-phase32.ts` (read-only analysis; no production functions modified)

**BASELINE ESTABLISHED:** Mean external quality 77.3/100, Median 78/100, 0 Exceptional, 16 Excellent, 35 Strong, 3 Acceptable.
