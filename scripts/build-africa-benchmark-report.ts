#!/usr/bin/env npx tsx
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const BASE = join(ROOT, 'docs/recommendation/africa/track-c/baseline-v3.7');
const EVAL = join(BASE, 'evaluation');
const RAW = join(BASE, 'raw-engine-output');
const GOLD_PATH = join(ROOT, 'docs/recommendation/africa/benchmark-v1/frozen-v1/gold-standard/gold-labels.json');
const metrics = JSON.parse(readFileSync(join(EVAL, 'metrics.json'), 'utf8'));
const gold = JSON.parse(readFileSync(GOLD_PATH, 'utf8'));
const goldById = new Map(gold.outfit_cases.map((c: any) => [c.case_id, c]));
const pct = (value: number | null, digits = 1) => value === null ? 'n/a' : `${(value * 100).toFixed(digits)}%`;

function parseCsv(text: string) {
  const records: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted && ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === ',') { row.push(cell); cell = ''; }
    else if (!quoted && ch === '\n') { row.push(cell); records.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  const [headers, ...rows] = records.filter((r) => r.some(Boolean));
  return rows.map((values) => Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ''])));
}

const rows = parseCsv(readFileSync(join(EVAL, 'case-results.csv'), 'utf8'));
const rankRows = rows.filter((row) => row.case_type !== 'garment_classification');
const guRows = rows.filter((row) => row.case_type === 'garment_classification');
const rawOutputs = new Map(
  [...Array(100)].flatMap((_, i) => {
    const candidates = [
      `GU-${String(i + 1).padStart(2, '0')}`,
      `OR-${String(i + 1).padStart(2, '0')}`,
      `OC-${String(i + 1).padStart(2, '0')}`,
      `WX-${String(i + 1).padStart(2, '0')}`,
    ];
    return candidates.flatMap((id) => {
      try { return [[id, JSON.parse(readFileSync(join(RAW, `${id}-result.json`), 'utf8'))] as const]; }
      catch { return []; }
    });
  }),
);

function candidateName(caseId: string, label: string) {
  return (goldById.get(caseId) as any)?.candidates.find((candidate: any) => candidate.candidate_id === label)?.label ?? label;
}

const guP1 = new Set(['GU-24', 'GU-32']);
const guP2 = new Set(['GU-09', 'GU-18', 'GU-22', 'GU-30', 'GU-33', 'GU-34', 'GU-37', 'GU-38']);
function severity(row: Record<string, string>) {
  if (row.case_type === 'garment_classification') {
    if (row.execution_status !== 'success') return 'P0';
    if (row.top1_match === 'true') return 'PASS';
    if (guP1.has(row.case_id)) return 'P1';
    if (guP2.has(row.case_id)) return 'P2';
    return 'P3';
  }
  if (row.top1_match === 'true') return 'PASS';
  const label = (goldById.get(row.case_id) as any)?.gold_label;
  if (label?.not_acceptable_candidates.includes(row.engine_top1)) return 'P1';
  return Number(row.regret) >= 7 ? 'P2' : 'P3';
}

const severityCounts = Object.fromEntries(['P0', 'P1', 'P2', 'P3', 'PASS'].map((s) => [s, rows.filter((row) => severity(row) === s).length]));
const misses = rankRows.filter((row) => row.top1_match !== 'true').sort((a, b) => Number(b.regret) - Number(a.regret));
const guFailures = guRows.filter((row) => row.execution_status !== 'success');
const highMissTable = misses.slice(0, 20).map((row) =>
  `| ${row.case_id} | ${severity(row)} | ${row.engine_top1}: ${candidateName(row.case_id, row.engine_top1)} | ${row.gold_preferred}: ${candidateName(row.case_id, row.gold_preferred)} | ${row.regret} |`,
).join('\n');
const guFailureTable = guFailures.map((row) => {
  const raw = rawOutputs.get(row.case_id) as any;
  const reason = raw?.engine_output?.reason ?? raw?.engine_output?.error ?? raw?.error ?? 'Unknown';
  return `| ${row.case_id} | P0 | ${String(reason).replace(/\|/g, '\\|')} |`;
}).join('\n');

const ankaraOrIds = new Set(Array.from({ length: 8 }, (_, i) => `OR-${String(i + 13).padStart(2, '0')}`));
const ankaraOr = rankRows.filter((row) => ankaraOrIds.has(row.case_id));
const ankaraGu = guRows.filter((row) => {
  const n = Number(row.case_id.slice(-2));
  return n >= 1 && n <= 11;
});
const culturalIds = new Set([
  'OR-01','OR-02','OR-05','OR-23','OR-27','OR-28','OR-30',
  'OC-01','OC-04','OC-08','OC-10','OC-19','OC-20','WX-02','WX-09','WX-10',
]);
const cultural = rankRows.filter((row) => culturalIds.has(row.case_id));
const subset = (records: Record<string, string>[]) => ({
  top1: records.filter((row) => row.top1_match === 'true').length / records.length,
  top3: records.filter((row) => row.top3_match === 'true').length / records.length,
  regret: records.reduce((sum, row) => sum + Number(row.regret), 0) / records.length,
});
const ankara = subset(ankaraOr);
const culture = subset(cultural);
const weather = metrics.by_type.weather_context;

const findingTemplate = (finding: string, evidence: string, cases: string, mechanism: string, confidence: string, hypothesis: string) =>
`### ${finding}

- **Evidence:** ${evidence}
- **Affected cases:** ${cases}
- **Likely mechanism:** ${mechanism}
- **Confidence:** ${confidence}
- **Potential hypothesis:** ${hypothesis}
`;

const ankaraAnalysis = `# Ankara / Wax-Print Analysis

## Summary

- GU-01–GU-11: 10/11 production calls succeeded; garment-type semantic agreement was ${ankaraGu.filter((r) => r.top1_match === 'true').length}/11 and mean supported-dimension agreement was ${pct(ankaraGu.reduce((n, r) => n + Number(r.dimension_agreement), 0) / 11)}.
- OR-13–OR-20: top-1 ${pct(ankara.top1)}, top-3 ${pct(ankara.top3)}, mean regret ${ankara.regret.toFixed(1)}.
- Strong cases: OR-14, OR-15, OR-16, OR-19, and OR-20 ranked the reviewer-preferred candidate first.
- Misses: OR-13 (B over A, regret 5), OR-17 (plain white blouse/trousers over matching Ankara co-ord, regret 14), and OR-18 (single Ankara + solid over matching co-ord, regret 5).

${findingTemplate(
  'Matching Ankara co-ords are not consistently valued',
  'The focused Ankara pairing slice performs well overall, but OR-17 ranks the plain Western office-like combination first and the matching co-ord last.',
  'OR-17; secondary signal in OR-18',
  'The scorer rewards conventional solid-piece cohesion but has no explicit representation of culturally meaningful matching-fabric identity.',
  'High for the observed cases; not generalisable beyond this benchmark.',
  'Test an explicit coordination-identity feature in a controlled post-v3.7 experiment while guarding the existing golden set.',
)}

${findingTemplate(
  'Ankara visual attributes are often recognized even when subtype language is generic',
  'The Ankara GU slice reached 71.5% mean dimension agreement, while type agreement was only 5/11. Pattern/fabric fields often retained wax-print information.',
  'GU-02, GU-04, GU-05, GU-08, GU-09',
  'The classifier can describe visual material attributes but production subtype enums remain generic.',
  'High.',
  'Evaluate richer culturally specific subtype display labels separately from the scoring engine.',
)}

No engine or taxonomy change was made.
`;

const culturalAnalysis = `# Cultural-Context Analysis

## Focused cultural slice

The 16-case traditional/cultural slice achieved ${pct(culture.top1)} top-1, ${pct(culture.top3)} top-3, and ${culture.regret.toFixed(1)} mean regret. Every reviewer-preferred candidate remained within the top three.

## Strengths

- Correct traditional/weather selections in WX-02 and WX-10 show that rain-safe accessory constraints can coexist with traditional-event suitability.
- OR-02, OR-05, OR-23, OR-27, OC-01, OC-08, and OC-20 were top-1 correct.
- Focused Ankara pairing performance was stronger than overall weather performance.

## Gaps

${findingTemplate(
  'Cultural identity can lose to generic formality or Western-default combinations',
  'OR-01 chose an ivory lace gown over the aso-ebi Ankara kaftan; OR-17 chose white blouse/black trousers over the matching Ankara set; WX-09 chose jeans for a Nigerian community event in London.',
  'OR-01, OR-17, WX-09',
  'Scenario tags and generic formality/cohesion features cannot fully express aso-ebi compliance, matching-fabric identity, or diaspora cultural intent.',
  'High for these cases.',
  'Add isolated cultural-context signals in an experimental branch and compare both Track C and the existing v3.7 regression baseline.',
)}

${findingTemplate(
  'Traditional garment terminology is underrepresented',
  'Production rejected gele/headwear and a wrapper, and mapped buba, iro, grand boubou, and Kente stole to generic Western-oriented subtypes.',
  'GU-11, GU-16, GU-17, GU-21–GU-24, GU-32–GU-40',
  'Taxonomy coverage and classifier guardrails are narrower than the benchmark’s Nigerian/African garment space.',
  'High.',
  'Run a taxonomy-only coverage study before changing ranking weights.',
)}

## Limitation

These findings reflect one qualified reviewer’s gold labels. IRR was not performed, and this benchmark does not represent all Nigerian women or all regional/religious traditions.
`;

const westernBiasAnalysis = `# Western-Default Bias Analysis

## Evidence consistent with Western-default bias

1. **Generic subtype substitution:** buba was returned as \`t-shirt\` or \`shirt\`; iro/wrapper as \`midi-skirt\`; Kente stole as \`shirt\`; grand boubou as \`kaftan\`.
2. **Unsupported cultural accessories:** gele/headwrap and Kente/aso-oke headpieces were rejected by the production guardrail.
3. **Ranking displacement:** OR-17 preferred a white blouse and black trousers over a matching Ankara co-ord; WX-09 preferred jeans for a Nigerian community event in London.
4. **Set handling:** GU-29 rejected a valid Ankara blazer/trouser co-ord because multiple garments were present.

## Counter-evidence

- OR-13–OR-20 achieved ${pct(ankara.top1)} top-1 and 100% top-3.
- Several traditional-event and rain cases selected culturally aligned Ankara candidates.
- Broad garment category agreement was ${pct(metrics.garment_dimension_accuracy.broad_category.accuracy)} where inference was supported.

## Conclusion

The results support a **targeted**, not universal, Western-default bias finding. The strongest evidence concerns taxonomy names, guardrails, matching-set identity, and diaspora context. They do not show that v3.7 always disfavors African garments.
`;

const weatherCultureAnalysis = `# Weather / Culture Trade-Off Analysis

## Results

- WX top-1: ${pct(weather.top1_accuracy)}; top-3: ${pct(weather.top3_accuracy)}; mean regret: ${weather.mean_regret.toFixed(1)}.
- Exact production-pool candidate matching was sparse: only 4/10 WX cases had any exact candidate fingerprint.
- Correct top-1 cases: WX-02, WX-08, WX-10.

## Case findings

- **WX-01:** selected a navy wool coat for Lagos heat (P1, regret 25), indicating fixed-candidate scores do not encode weather.
- **WX-03:** selected grey wool trousers in 38°C Abuja heat (P1, regret 24), while the full production pool’s mapped candidate was the reviewer-preferred linen option.
- **WX-04:** selected an unnecessary camel blazer in warm rain (P1, regret 24).
- **WX-09:** selected jeans for a cold Nigerian community event rather than warm Ankara with a coat (P1, regret 19), missing both cultural and weather priorities.
- **WX-10:** correctly selected the rain-safe Ankara kaftan, showing the full system can combine both constraints in some traditional-event cases.

## Interpretation

The direct fixed-candidate ranking diagnostic combines unchanged profile-item and outfit-combination scores; those functions do not receive weather. Weather is applied only in the separately captured full generator. Therefore WX fixed-ranking failures are real limitations of applying those scores to benchmark candidates, while sparse exact generation means the production-pool metric is under-supported. Both facts are reported separately.
`;

const failureAnalysis = `# Failure Analysis

## Taxonomy

- **Engine failure:** runtime refusal, malformed response, or a clearly unsuitable top recommendation.
- **Taxonomy/representation gap:** culturally specific garment identity cannot be expressed by current categories/subtypes or guardrails.
- **Benchmark ambiguity:** reviewer judgement may be subjective or cannot map exactly to generated fingerprints. No case was removed or relabelled on this basis.

## Severity distribution

| Severity | Cases | Interpretation |
|---|---:|---|
| P0 | ${severityCounts.P0} | Classification unusable: no successful label |
| P1 | ${severityCounts.P1} | Clearly inappropriate ranking or materially wrong garment category |
| P2 | ${severityCounts.P2} | Material inferiority or culturally important identity loss |
| P3 | ${severityCounts.P3} | Lower-impact subtype/style disagreement |
| Pass | ${severityCounts.PASS} | Semantic garment-type or top-1 ranking agreement |

Severity is case-reviewed using execution status, reviewer acceptability, utility regret, category correctness, and cultural meaning—not a score threshold alone.

## P0 classification failures

| Case | Severity | Recorded production response |
|---|---|---|
${guFailureTable}

## Highest-impact ranking misses

| Case | Severity | Engine top-1 | Gold preferred | Regret |
|---|---|---|---|---:|
${highMissTable}

## Main clusters

1. Weather-insensitive fixed ranking: WX-01, WX-03, WX-04, WX-06, WX-09.
2. Occasion mismatch: OC-06, OC-10, OC-18 and OR-12.
3. Cultural coordination underweighting: OR-01, OR-17, OR-28.
4. Accessory-count bias: OR-25.
5. Guardrail/taxonomy exclusions: gele, wrapper, co-ord, stole, headpiece.
`;

const regressionComparison = `# Existing v3.7 Regression Comparison

## Separate baselines

The existing v3.7 golden regression suite remained unchanged and passed in the full project test run. It is a deterministic regression guard for established recommendation behavior; it is not the same population or labelling protocol as Track C.

Track C independently measured Nigerian/African performance:

- 60 context cases: ${pct(metrics.outfit_context_top1_accuracy)} top-1, ${pct(metrics.outfit_context_top3_accuracy)} top-3.
- 40 garment cases: ${pct(metrics.garment_type_semantic_accuracy)} semantic garment-type agreement and ${pct(metrics.garment_mean_dimension_agreement)} mean supported-dimension agreement.
- Weather was the weakest context family at ${pct(weather.top1_accuracy)} top-1.

## Interpretation

The unchanged regression suite passing alongside material Track C gaps establishes the intended baseline: future Nigeria-specific experiments must improve Track C without breaking existing v3.7 expectations. No direct accuracy delta is claimed because the two sets measure different things.
`;

const reproducibility = `# Reproducibility

- Benchmark: \`1.0.0-frozen\`
- Engine: \`3.7\`
- Commit: \`8fd970d6a0267096bac89ebb5d38673b2d340bc2\`
- Execution date: 2026-09-10 (Africa/Lagos)
- Runtime: Node v22.22.0; npm 10.9.4
- Raw outputs: 100 case files plus \`summary.json\`, sealed by \`RAW-SHA256SUMS\`
- Full hashes/configuration: \`execution-manifest.json\`
- Runner: \`scripts/run-africa-benchmark.ts\`
- Evaluator: \`scripts/evaluate-africa-benchmark.ts\`

GU classification used the unchanged production handler with \`gemini-flash-lite-latest\`, fallback \`gemini-2.5-flash\` on 429, and temperature 0.1. The mutable \`latest\` alias means future GU reruns may not be byte-identical even with identical images.
`;

const safety = `# Production-Safety Confirmation

Confirmed for Track C:

- no production recommendation logic changed;
- no recommendation weights changed;
- no taxonomy changed;
- no production database changed;
- no Supabase migration, RLS, or Storage change;
- no authentication, entitlement, or payment change;
- no FASH integration;
- no production deployment;
- no production user data modified;
- frozen benchmark snapshot unchanged;
- existing v3.7 golden set unchanged.

The only external operation was the authorized production classifier call against synthetic frozen benchmark images. No user image or production record was used.
`;

const tests = `# Test Results

## Pre-execution

- \`npm test\`: passed
- \`npm run typecheck\`: passed
- \`npm run lint\`: passed with 0 errors and 31 pre-existing warnings
- frozen benchmark validator: passed (100 cases, 84 fixtures, 53 checksums)
- frozen engine and existing golden-set diff gate: clean

## Post-evaluation

- \`npm test\`: passed; all suites reported pass
- \`npm run typecheck\`: passed
- \`npm run lint\`: passed with 0 errors and 31 pre-existing warnings
- frozen benchmark validator: passed
- dedicated Track C validator: passed
- frozen 53-file SHA-256 verification: passed
- sealed 101-file raw-output verification: passed
- frozen engine, existing golden set, and frozen benchmark diff gate: clean
- benchmark status: 100 attempted, 94 successful, 6 failed classifications, 0 skipped

No production file was modified to make a check pass.
`;

const finalReport = `# Phase 5C.3 — Track C Baseline Report

## 1. Executive Summary

Track C executed all 100 frozen Nigerian/African benchmark cases against unchanged Recommendation Engine v3.7. Ninety-four cases completed successfully; six culturally salient GU inputs returned production classifier failures/guardrails. Across 60 outfit/context cases, top-1 was ${pct(metrics.outfit_context_top1_accuracy)}, top-3 ${pct(metrics.outfit_context_top3_accuracy)}, pairwise agreement ${pct(metrics.pairwise_accuracy)}, mean regret ${metrics.mean_regret.toFixed(1)}, and mean Kendall's tau ${metrics.mean_kendall_tau.toFixed(3)}.

**Final recommendation: C — Material recommendation gaps require remediation before Nigerian/African launch.** The evidence is not one arbitrary threshold: six unusable classifications, nine clearly inappropriate top-ranked outfits, weak weather top-1 (${pct(weather.top1_accuracy)}), sparse production generation coverage, and systematic cultural taxonomy gaps coexist with meaningful Ankara and top-3 strengths.

## 2. Execution Environment

Node v22.22.0, npm 10.9.4, commit \`8fd970d6a0267096bac89ebb5d38673b2d340bc2\`, execution date 2026-09-10, Africa/Lagos. GU used the real production classifier; OR/OC/WX used unchanged production scoring and the unchanged full generator.

## 3. Benchmark Integrity Confirmation

Only \`frozen-v1/\` benchmark inputs were used. All 53 frozen checksums passed. Gold was inaccessible during execution. One hundred case outputs and \`summary.json\` were written, hashed, sealed, verified, and made read-only before the evaluator opened gold. Reviewer materials contained no predictions or developer steering metadata. The independent-reviewer attestation was verified without modifying frozen labels.

## 4. Case Execution Summary

| Family | Attempted | Successful | Failed | Skipped |
|---|---:|---:|---:|---:|
| GU | 40 | 34 | 6 | 0 |
| OR | 30 | 30 | 0 | 0 |
| OC | 20 | 20 | 0 | 0 |
| WX | 10 | 10 | 0 | 0 |
| **Total** | **100** | **94** | **6** | **0** |

## 5. Overall Results

| Metric | Result |
|---|---:|
| Context top-1 | ${pct(metrics.outfit_context_top1_accuracy)} |
| Context top-3 | ${pct(metrics.outfit_context_top3_accuracy)} |
| Supported pairwise agreement | ${pct(metrics.pairwise_accuracy)} |
| Mean regret / max regret | ${metrics.mean_regret.toFixed(1)} / ${metrics.max_regret} |
| Mean Kendall's tau | ${metrics.mean_kendall_tau.toFixed(3)} |
| Mean acceptable-candidate generation recall | ${pct(metrics.mean_acceptable_candidate_generation_recall)} |
| Mean not-acceptable exclusion | ${pct(metrics.mean_not_acceptable_candidate_exclusion)} |
| Exact candidate generation | ${metrics.candidate_generation.exact_candidates_generated}/${metrics.candidate_generation.benchmark_candidates} (${pct(metrics.candidate_generation.exact_candidate_generation_rate)}) |
| Cases with any exact generated candidate | ${metrics.candidate_generation.cases_with_any_exact_candidate}/60 |
| Empty production pools | ${metrics.candidate_generation.cases_with_empty_production_pool}/60 |
| Fallback activated | ${metrics.candidate_generation.fallback_activated_cases}/60 |

## 6. Garment Classification Results

Thirty-four of 40 calls succeeded. Broad category was ${pct(metrics.garment_dimension_accuracy.broad_category.accuracy)} on 32 inferable cases; garment-type semantic agreement ${pct(metrics.garment_type_semantic_accuracy)}; fabric ${pct(metrics.garment_dimension_accuracy.fabric.accuracy)}; pattern ${pct(metrics.garment_dimension_accuracy.pattern.accuracy)}; scale ${pct(metrics.garment_dimension_accuracy.pattern_scale.accuracy)}; colour ${pct(metrics.garment_dimension_accuracy.colour.accuracy)}. Generic subtype labels preserved useful visual fields in many cases but did not preserve cultural identity.

## 7. Outfit Ranking Results

OR top-1 ${pct(metrics.by_type.outfit_ranking.top1_accuracy)}, top-3 ${pct(metrics.by_type.outfit_ranking.top3_accuracy)}, mean regret ${metrics.by_type.outfit_ranking.mean_regret.toFixed(1)}. OR-13–20 Ankara pairing was stronger than the OR aggregate, but OR-17 was a material matching-set miss.

## 8. Occasion Results

OC top-1 ${pct(metrics.by_type.occasion_distinction.top1_accuracy)}, top-3 ${pct(metrics.by_type.occasion_distinction.top3_accuracy)}, mean regret ${metrics.by_type.occasion_distinction.mean_regret.toFixed(1)}. High-impact misses included church thanksgiving, Yoruba funeral dress code, and fine-dining date.

## 9. Weather Results

WX top-1 ${pct(weather.top1_accuracy)}, top-3 ${pct(weather.top3_accuracy)}, mean regret ${weather.mean_regret.toFixed(1)}. WX-01, WX-03, WX-04, and WX-09 were P1. Weather applies in full generation, not the fixed candidate scoring functions, and exact generated-candidate coverage was sparse; both limitations are explicit.

## 10. Ankara/Wax-Print Results

The focused OR-13–20 slice achieved ${pct(ankara.top1)} top-1 and ${pct(ankara.top3)} top-3. GU-01–11 had 10/11 successful calls and 71.5% mean dimension agreement. See \`ankara-analysis.md\`.

## 11. Cultural-Context Results

The defined 16-case cultural slice achieved ${pct(culture.top1)} top-1, ${pct(culture.top3)} top-3, mean regret ${culture.regret.toFixed(1)}. Strong top-3 coverage contrasts with serious top-1 misses. See \`cultural-context-analysis.md\`.

## 12. Western-Default Bias Analysis

Evidence is targeted: generic Western subtype substitutions, unsupported gele/headwear/stole guardrails, OR-17's conventional office combination, and WX-09's jeans selection. Counter-evidence includes strong Ankara pairings and correct traditional rain cases. See \`western-default-bias-analysis.md\`.

## 13. Weather/Culture Trade-Off Analysis

WX-09 missed both warmth and cultural identity, whereas WX-10 correctly preserved traditional-event identity with rain-safe accessories. See \`weather-culture-tradeoff-analysis.md\`.

## 14. Failure Taxonomy

Engine failures, representation gaps, and benchmark ambiguity are separate. Runtime refusals and unsuitable selections are engine outcomes; inability to name/accept cultural forms is a representation gap; subjective close ordering is benchmark ambiguity and receives P3 treatment rather than being presented as fact.

## 15. Case-Level Failures

Six P0 GU failures: ${guFailures.map((row) => row.case_id).join(', ')}. The 20 highest-regret ranking misses are documented in \`failure-analysis.md\`; all 100 rows are in \`case-results.csv\`.

## 16. Severity Distribution

P0 ${severityCounts.P0}; P1 ${severityCounts.P1}; P2 ${severityCounts.P2}; P3 ${severityCounts.P3}; pass ${severityCounts.PASS}. Severity uses qualitative case review plus acceptability/utility evidence, not a single numerical cutoff.

## 17. Representation Gaps

Gele/headwrap, aso-oke wrapper/iro, buba, grand boubou, Kente stole, coordinated multi-piece Ankara, and culturally meaningful matching-fabric identity are underrepresented or unsupported. These gaps should not be conflated with generic visual classification: fabric/category fields were often partially correct.

## 18. Nigerian/African Strengths

Top-3 context accuracy was ${pct(metrics.outfit_context_top3_accuracy)}. Ankara pairing top-3 was 100%. The system handled several traditional events and rain-safe Ankara combinations correctly. Broad category and fabric recognition were materially stronger than cultural subtype naming.

## 19. Nigerian/African Weaknesses

Weather top-1, cultural terminology/guardrails, coordinated-set identity, diaspora context, and exact candidate generation coverage are the main evidence-based weaknesses.

## 20. Existing v3.7 Regression Comparison

The unchanged existing golden regression suite passed while Track C exposed separate Nigerian/African gaps. No direct accuracy delta is claimed because the datasets and purposes differ. See \`regression-comparison.md\`.

## 21. Candidate Hypotheses for Future Work

1. Cultural coordination identity may be missing from the scoring representation.
2. Classifier guardrails and subtypes may exclude common cultural accessories and multi-piece sets.
3. Candidate scoring without weather context may produce severe heat/rain errors.
4. Scenario tags may be too coarse for funeral dress codes, thanksgiving, diaspora, and aso-ebi.

These are hypotheses only.

## 22. Recommended Experiments

Run controlled, isolated experiments for: taxonomy coverage; matching-set identity; weather-aware fixed-candidate ranking; richer cultural-context signals; and exact generator coverage. Every experiment must compare Track C and the unchanged existing v3.7 regression suite. None was implemented here.

## 23. Reproducibility Information

Hashes, versions, defaults, scenario mapping, model aliases, input/output fingerprints, and access boundaries are in \`execution-manifest.json\`, \`RAW-SHA256SUMS\`, and \`reproducibility.md\`.

## 24. Tests

Pre-run tests, typecheck, lint, benchmark validator, frozen checksums, and frozen-diff gate passed. Post-evaluation checks are recorded in \`TEST-RESULTS.md\`. Lint has 0 errors and 31 pre-existing warnings.

## 25. Production-Safety Confirmation

Every required no-change condition is confirmed in \`PRODUCTION-SAFETY-CONFIRMATION.md\`. No production data, Supabase, auth, payment, entitlement, FASH, deployment, or user-data operation occurred.

## 26. Final Recommendation

**C — Material recommendation gaps require remediation before Nigerian/African launch.**

The benchmark is conclusive enough to identify material launch risks despite its single-reviewer limitation: critical classification exclusions, clearly inappropriate weather/occasion top choices, cultural identity loss, and low exact candidate-generation coverage. v3.7 also has real strengths, especially top-3 coverage and focused Ankara pairings. The next action should be a separate Product Owner-approved hypothesis → controlled experiment → regression → approval cycle. Track C stops here; v3.7 remains frozen.
`;

const readme = `# Track C — Baseline v3.7

Independent Nigerian/African production baseline for Amodka Recommendation Engine v3.7.

## Primary outputs

- [Final 26-section report](PHASE-5C.3-TRACK-C-FINAL-REPORT.md)
- [Execution manifest](execution-manifest.json)
- [Metrics](metrics.json)
- [All case results](case-results.csv)
- [Raw-output seal](RAW-SHA256SUMS)

## Analyses

- [Ankara / wax-print](ankara-analysis.md)
- [Cultural context](cultural-context-analysis.md)
- [Western-default bias](western-default-bias-analysis.md)
- [Weather / culture trade-off](weather-culture-tradeoff-analysis.md)
- [Failure analysis](failure-analysis.md)
- [Existing v3.7 comparison](regression-comparison.md)

Raw engine outputs are read-only and were sealed before evaluation.
`;

for (const file of ['metrics.json', 'case-results.csv', 'garment-results.csv', 'outfit-results.csv', 'occasion-results.csv', 'weather-results.csv']) {
  copyFileSync(join(EVAL, file), join(BASE, file));
}
const files: Record<string, string> = {
  'README.md': readme,
  'ankara-analysis.md': ankaraAnalysis,
  'cultural-context-analysis.md': culturalAnalysis,
  'western-default-bias-analysis.md': westernBiasAnalysis,
  'weather-culture-tradeoff-analysis.md': weatherCultureAnalysis,
  'failure-analysis.md': failureAnalysis,
  'regression-comparison.md': regressionComparison,
  'reproducibility.md': reproducibility,
  'PRODUCTION-SAFETY-CONFIRMATION.md': safety,
  'TEST-RESULTS.md': tests,
  'PHASE-5C.3-TRACK-C-FINAL-REPORT.md': finalReport,
};
for (const [file, content] of Object.entries(files)) writeFileSync(join(BASE, file), content.trim() + '\n');

const manifestPath = join(BASE, 'execution-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.evaluator_sha256 = createHash('sha256').update(readFileSync(join(ROOT, 'scripts/evaluate-africa-benchmark.ts'))).digest('hex');
manifest.report_builder_sha256 = createHash('sha256').update(
  readFileSync(join(ROOT, 'scripts/build-africa-benchmark-report.ts')),
).digest('hex');
manifest.report_artifact_sha256 = Object.fromEntries(Object.keys(files).sort().map((file) => [
  file, createHash('sha256').update(readFileSync(join(BASE, file))).digest('hex'),
]));
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`Generated ${Object.keys(files).length} reports and 6 root evaluation files.`);