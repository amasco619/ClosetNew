# Benchmark Execution Protocol — African/Nigerian Fashion Benchmark v1

**Phase:** 5C.3 Track B (protocol definition) / Track C (execution)  
**Version:** 1.0  
**Date:** 2026-08-19  

> This document defines **how** the frozen v3.7 engine will be evaluated against the
> gold-standard labels. It is written now (Track B) so the protocol is agreed before
> labels exist — preventing the protocol from being written to match convenient results.
>
> **No engine execution occurs in Track B.** This document describes Track C.

---

## 1. Pre-conditions — do not proceed without all of these

| Pre-condition | How to verify |
|---|---|
| Gold labels are independently signed and locked | `gold-standard/gold-labels-v1.0.json` exists and has reviewer sign-off metadata |
| Product Owner has approved execution | Written approval obtained |
| Engine v3.7 is unchanged | `git diff constants/outfitRotation.ts constants/outfitScoring.ts constants/outfitGenerator.ts constants/weatherPure.ts` — no changes |
| Existing golden regression suite passes | `npm test` — 51 tests pass, 0 fail |
| No production data has been modified | Supabase production DB untouched |
| No production secrets have changed | Secret manager unchanged |

---

## 2. Data stage verification

Before running the engine, confirm the four data stages are correctly separated:

```
benchmark-input/      ← exists (created from this benchmark package)
gold-standard/        ← exists and signed (reviewer output — Track C)
engine-output/        ← must NOT exist yet (engine output will be written here)
evaluation/           ← must NOT exist yet (metrics written after engine run)
```

The runner script must **refuse to run** if `engine-output/` already exists and is
non-empty — to prevent an accidental re-run that overwrites a prior result.

---

## 3. Runner script specification

The Track C runner is `scripts/run-africa-benchmark.ts`. It must be written as a
standalone script (no changes to production code) and must:

### 3.1 Inputs

For each of the 100 benchmark cases:

1. Load the case fixture from `benchmark-input/<case_id>.json`
2. Build a `WardrobeItem[]` from the case's item fixtures using the typed attributes in
   `internal/runner-fixtures.md` (occasion tags, formality, warmth). The reviewer-facing
   `fixtures.md` is descriptive-only and must not be the runner's attribute source.
   Before any run, `node scripts/validate-benchmark-fixtures.mjs` must pass — it verifies
   the two catalogs agree on descriptive columns and all case fingerprints are valid.
3. Build a `UserProfile` from the case's `profile_summary` (use a neutral profile
   unless the case explicitly overrides a profile field)
4. Build a `WeatherSnapshot | null` from the case's weather inputs
5. Set `today` to the case's specified date (must be pinned — never use `new Date()`)
6. Use `reactions: []`, `wearHistory: []`, `affinity: EMPTY_AFFINITY` unless the case
   explicitly specifies personalization inputs

### 3.2 Engine call

For outfit-ranking, occasion, and weather cases:

```typescript
const pool = generateOutfitPool(
  items,
  profile,
  mood,          // from case, default null
  reactions,     // from case, default []
  today,         // pinned from case
  wearHistory,   // from case, default []
  affinity,      // from case, default EMPTY_AFFINITY
  weather,       // from case, null for non-weather cases
  false,         // isPremium — use false unless case specifies
);
```

For garment-classification cases (GU), the runner calls `scoreOutfitCombo` for each
candidate outfit to collect diagnostic breakdowns — it does not rank them (ranking comes
from gold labels only).

### 3.3 Critical constraints

- **Never pass gold labels, gold rankings, or gold utility scores to the engine**
- **Never call `scoreOutfitCombo` on gold labels** — labels are evaluation-only
- **Never import from `__tests__/recommendation-golden-set.ts`** in the benchmark runner
- The runner must emit results to `engine-output/<case_id>-result.json` for each case
- The runner must emit a summary to `engine-output/summary.json`

### 3.4 Output structure (per case)

```json
{
  "case_id": "OR-01",
  "engine_ranked_outfit_ids": ["OR-01-A", "OR-01-C", "OR-01-D", "OR-01-B"],
  "engine_top1_outfit_id": "OR-01-A",
  "engine_top1_component_ids": ["F01", "F07", "F11", "F14"],
  "engine_top1_fingerprint": "F01,F07,F11,F14",
  "engine_top1_confidence_score": 0.82,
  "engine_top1_hero_id": "F01",
  "engine_top1_generation_path": "standard",
  "engine_top1_score_breakdown": { "completeness": 10, "palette": 3, "..." : "..." },
  "pool_size": 4,
  "fallback_activated": false,
  "run_timestamp": "2026-XX-XXTXX:XX:XXZ"
}
```

### 3.5 What the runner must NOT do

- Modify any file in `gold-standard/`
- Modify any production constant, scoring weight, or routing logic
- Call any Supabase endpoint
- Call any external API
- Write to `evaluation/` — evaluation is a separate step

---

## 4. Evaluation step

After the engine run, a separate evaluation script computes metrics:

```
scripts/evaluate-africa-benchmark.ts
```

It reads:
- `benchmark-input/` — for case metadata
- `gold-standard/` — for gold labels and utility scores
- `engine-output/` — for engine results

It writes to `evaluation/`:
- `metrics-overall.json` — aggregate metrics
- `metrics-by-category.json` — by GU/OR/OC/WX and by capability tag
- `metrics-per-case.json` — top-1 match, pairwise, regret per case
- `findings-classified.md` — each finding classified A–H (see `results-template.md` §E)

### 4.1 Metric definitions

| Metric | Formula |
|---|---|
| **Top-1 accuracy** | `count(engine_top1 == gold_preferred) / n` |
| **Top-3 accuracy** | `count(gold_preferred in engine_top3) / n` |
| **Pairwise accuracy** | `count(engine agrees with gold pairwise ordering) / total_pairs` |
| **Regret per case** | `max(0, gold_utility[gold_preferred] − gold_utility[engine_top1])` |
| **Mean regret** | `mean(regret across all cases)` |
| **Max regret** | `max(regret across all cases)` |
| **Kendall's τ** | Rank correlation between gold ranking and engine ranking for cases with ≥3 candidates |
| **Hard-constraint violations** | Cases where engine output contains an item blocked by a declared constraint |
| **Fallback activation rate** | `count(engine_top1_generation_path == 'relaxed') / n` |
| **Representation-gap rate** | `count(GU cases where the internal mapping artifact records a gap vs the locked gold label) / 40` — computed from `internal/gu-taxonomy-analysis.md` (finalized post-lock), never from the signed label files |

### 4.2 Excluded cases

- Disputed cases (gold `disputed: true`) are excluded from aggregate metrics and reported separately.
- Cases with empty engine pools are counted as failures (no match, max regret = max utility across candidates).

---

## 5. Regression gate

Before **and** after the benchmark run, execute the existing v3.7 golden regression suite:

```bash
npm test
```

**Required outcome:** 51 tests pass, 0 fail — both before and after.

If the post-run regression fails, the benchmark result is invalidated and must not be
reported until the regression is diagnosed.

---

## 6. Reporting

The Track C report must include:

1. **Executive summary** — did the engine pass, partially pass, or fail?
2. **Overall metrics table** (§B of `results-template.md`)
3. **Category-level breakdown** (§C)
4. **Per-case notable failures** — cases where regret was high or top-1 missed badly
5. **Finding classification** (A–H distribution, §E)
6. **Hypotheses and proposed experiments** (§F) — no fixes implemented
7. **Regression attestation** — golden set passed before and after
8. **Production-safety attestation** — all six items in `results-template.md` §H confirmed

---

## 7. What Track C must NOT do

- Modify Recommendation Engine v3.7
- Modify `constants/outfitScoring.ts`, `constants/outfitRotation.ts`, `constants/outfitGenerator.ts`, `constants/weatherPure.ts`, `constants/types.ts`, or any production constant
- Modify `__tests__/recommendation-golden-set.ts`
- Modify production schema, Supabase RLS, Storage, or any production configuration
- Deploy
- Claim "Nigeria-ready" or publish results without Product Owner review

---

## 8. After Track C — Track D (future)

Track D, pending Product Owner approval, would:

1. Review the classified findings from Track C
2. Propose specific, scoped improvements (taxonomy additions, engine changes, classifier training)
3. Implement only changes approved by the Product Owner
4. Re-run the full benchmark (African + existing golden set) to verify improvements
5. Confirm no regression

Track D is out of scope until Track C results exist and have been reviewed.
