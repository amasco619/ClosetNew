# Nigerian Styling V2 — Step 3d

## A. Diagnosis, captured before code changes

Baseline: Step 3c evaluator and blind adapter; 95 abstentions out of 100.
No ratings, labels or design key accessed. No fixture changes.
The evaluator was instrumented **in memory only** to identify unresolved rule
IDs; repository code was not modified for this analysis. Existing Step 3c
[coverage JSON](nigerian-v2-step3c-coverage.json) supplies the exact missing
field paths, questions and V1 gap text for every row below. Its advisory
questions and informational gaps are not automatically blockers.

A reason is an unresolved rule (all its missing premises together), or one
structural predicate: `vocabulary`, `v1`, `covering`. Counts are distinct
fixtures, not missing fields. These include latent blockers masked by an earlier
structural veto, not a claim that every listed predicate independently caused
the abstention. “Only resolved” means removing that single
predicate's blocking effect, leaving every other predicate and every known
result unchanged, under the **old** decision ordering. It is not a fabricated
fact or a forecast of accuracy. Duplicate predicates can share one missing
fact; counts overlap and must not be added.

### Reason inventory and classification

Classes: **a** description supplies a fact missing from the encoded input;
**b** description does not supply the required fact; **c** an optional
question blocks; **d** vocabulary/rule-data or adapter coverage gap.
Mixed classes are explicit rather than assigning every occurrence to one cause.

| Reason | Fixtures blocked | Only resolved → judged | Class and explanation |
|---|---:|---:|---|
| S02 | 95 | 3 | b: no explicit quality assessment for all items; quality markers are vocabulary, not a poor-quality flag |
| S04 | 86 | 0 | b/d: missing textile, purchase/exemption facts or event band; supplied textile with no band is d |
| H03b | 74 | 0 | b: purchase status/exact supplied textile or item textile unknown |
| H03a | 73 | 0 | b: purchase status/exact supplied colour or item colour unknown |
| covering | 34 | 0 | d/b: V1 covering check not satisfied; includes the 28 unmappable V1 results, not 34 independently established wearer violations |
| v1 | 28 | 0 | d: described subtype cannot be mapped into the unchanged V1 input |
| vocabulary | 26 | 2 | d: a key role/kind is unknown or outside V2's key vocabulary |
| H06 | 21 | 0 | b: traditional-wear status or footwear subtype unknown |
| H05back | 16 | 0 | b: backless status and/or whether a cover is worn unknown |
| H05strap | 16 | 0 | b: strapless status and/or whether a cover is worn unknown |
| H05hemQ | 14 | 0 | b/d: hem or venue guidance not precise enough for the church rule |
| H05sleeve | 11 | 0 | b: denomination, sleeve type or worn cover unknown |
| H05hem | 10 | 0 | b: denomination or clearly-short hem unknown |
| H04 | 8 | 0 | b: colours missing, including accessory colours |
| H04l | 8 | 0 | b: colours or metallic/sequin finish missing |
| H04q | 8 | 0 | c: family/custom white question is optional |
| C04 | 7 | 0 | c: optional ichafu shape/community suggestion |
| H02a | 7 | 0 | b: supplied bride's palette or item's colour unknown |
| H02b | 7 | 0 | b: supplied family textiles unknown |
| H05modest | 7 | 0 | b: sleeveless/modesty/cover facts needed for church guidance |
| C01 | 6 | 0 | c: optional gele/community suggestion |
| H05hemP | 6 | 0 | b: denomination or clearly-short hem unknown |
| U01-arms | 4 | 0 | a/b/d: S05-A explicitly says fully lined, long sleeves but coverage is not propagated; S05-D explicitly sheer/unlined but no opacity-aware coverage model; S05-C and S23-D leave the relevant coverage details unstated |
| U01-knees | 4 | 0 | b/d: S05-A/D say “long” but do not give the required knee relation; abaya name alone is not evidence; no authorised long-hem-to-knee mapping |
| H05denom | 4 | 0 | b: denomination and/or sleeveless/worn-cover facts unknown |
| U01-head | 3 | 0 | b: item name does not say whether/how it covers the head |
| C06 | 2 | 0 | b: traditional-wear context unknown; title alone does not settle the scope |
| C05 | 2 | 0 | b: traditional-wear context or precise coral strand count unknown |
| H07 | 1 | 0 | b/d: an unknown item kind prevents ruling out an excluded combination |
| H01 | 1 | 0 | b: key garment colour not stated |

The three quality-only releases are S01-A, S01-C and S25-B; the two
vocabulary-only releases are S20-C and S21-D. The latter follow the old
known-result precedence even with other unresolved questions. This is why
“only resolved” does not simply mean “has only one row in the list”.

No fixture repair is included. In particular, long sleeves, a garment name,
sheen or a missing purchase statement must not be converted to a favourable
answer. “Thin, shiny polyester lace” remains markers, not an explicit poor flag.
The S05-A/S05-D coverage interpretation requires a separately reviewed adapter
change, not silent edits to these frozen fixtures.

### Every abstention, all blockers and one primary reason

Primary is a deterministic triage convention, **not** a severity judgement:
vocabulary first, unknown V1 second, covering third, then first unresolved
rule in rule-table order. The first reason in every row is primary.
Rule IDs refer to the complete reason descriptions above. See the linked
Step 3c JSON for each rule's exact missing field paths and explanatory text.

| Fixture | Primary; all remaining blockers |
|---|---|
| S01-A | S02 |
| S01-B | S02; S04 |
| S01-C | S02 |
| S01-D | v1; covering, H06, S02, C01 |
| S02-A | covering; S02, S04 |
| S02-B | H03a; H03b, S02, S04 |
| S02-C | covering; H03a, H03b, S02, S04, C01 |
| S02-D | vocabulary; covering, H03b, S02, S04, C01 |
| S03-A | vocabulary; v1, covering, H03a, H03b, S02, S04, C04 |
| S03-B | vocabulary; v1, covering, H03a, H03b, S02, S04, C04, C06 |
| S03-C | H03a; H03b, S02, S04 |
| S03-D | covering; H03a, H03b, S02, S04, C04 |
| S04-A | H02a; H02b, S02, C04 |
| S04-B | vocabulary; v1, covering, H02a, H02b, S02, S04, C05 |
| S04-C | H02a; H02b, S02 |
| S04-D | H02a; H02b, S02, S04 |
| S05-A | H02a; H02b, H03a, H03b, U01-arms, U01-knees, H06, S02, S04 |
| S05-C | H02a; H02b, H03a, H03b, U01-arms, U01-knees, U01-head, S02 |
| S05-D | H02a; H02b, H03a, H03b, U01-arms, U01-knees, U01-head, H06, S02, S04 |
| S06-A | v1; covering, H03a, H03b, S02 |
| S06-B | H03a; H03b, S02, S04 |
| S06-C | covering; H03a, H03b, S02, S04, C01 |
| S06-D | covering; H03a, H03b, S02, S04 |
| S07-A | S02; S04 |
| S07-B | S02; S04 |
| S07-C | S02; S04, C01 |
| S07-D | S02; S04 |
| S08-A | H03a; H03b, H06, S02, S04 |
| S08-B | vocabulary; v1, covering, H03a, H03b, S02, S04, C04 |
| S08-C | v1; covering, H03a, H03b, S02, S04 |
| S08-D | H03a; H03b, S02, S04 |
| S09-A | v1; covering, H04, H04l, H04q, H06, S02, S04 |
| S09-B | H04; H04l, H04q, S02, S04 |
| S09-C | vocabulary; v1, covering, H04, H04l, H04q, S02, S04 |
| S09-D | H04; H04l, H04q, S02, S04 |
| S10-A | v1; covering, H03a, H03b, H04, H04l, H04q, H06, S02, S04 |
| S10-B | v1; covering, H03a, H03b, H04, H04l, H04q, S02, S04 |
| S10-C | v1; covering, H03a, H03b, H04, H04l, H04q, S02, S04 |
| S10-D | v1; covering, H03a, H03b, H04, H04l, H04q, S02, S04 |
| S11-A | H03a; H03b, S02, S04 |
| S11-B | H03a; H03b, S02, S04 |
| S11-C | vocabulary; v1, covering, H03a, H03b, S02, S04 |
| S11-D | H03a; H03b, S02, S04 |
| S12-A | H03a; H03b, H06, S02, S04 |
| S12-B | vocabulary; v1, covering, H03a, H03b, S02, S04 |
| S12-C | vocabulary; H03a, H03b, S02, S04 |
| S12-D | vocabulary; v1, covering, H03a, H03b, H06, S02, S04 |
| S13-A | H03a; H03b, S02, S04 |
| S13-B | vocabulary; v1, covering, H03a, H03b, H06, H07, S02, S04, C01, C04, C05, C06 |
| S13-C | vocabulary; v1, covering, H03a, H03b, S02, S04 |
| S13-D | H03a; H03b, H06, S02, S04 |
| S14-A | vocabulary; v1, covering, H03a, H03b, H05back, H05strap, S02, S04 |
| S14-B | H03a; H03b, H05back, H05strap, H05sleeve, H05hemQ, S02, S04 |
| S14-C | vocabulary; H03a, H03b, H05back, H05strap, H05sleeve, H05hem, H05hemQ, S02, S04 |
| S14-D | H03a; H03b, H05back, H05strap, H05sleeve, H05hem, H05hemQ, S02, S04, C04 |
| S15-A | H03a; H03b, H06, S02, S04 |
| S15-B | H03a; H03b, S02, S04 |
| S15-D | H03a; H03b, S02, S04 |
| S16-A | vocabulary; v1, covering, H03a, H03b, H06, S02, S04 |
| S16-B | vocabulary; v1, covering, H03a, H03b, S02, S04 |
| S16-C | vocabulary; v1, covering, H03a, H03b, S02, S04 |
| S16-D | vocabulary; H03a, H03b, H06, S02, S04 |
| S17-A | v1; covering, H03a, H03b, H05back, H05strap, H05sleeve, H05modest, H05denom, H05hem, H05hemP, H05hemQ, S02, S04 |
| S17-B | v1; covering, H03a, H03b, H05back, H05strap, H05sleeve, H05modest, H05denom, H05hem, H05hemP, H05hemQ, S02, S04 |
| S17-C | H03a; H03b, H05back, H05strap, H05sleeve, H05modest, H05denom, H05hem, H05hemP, H05hemQ, H06, S02, S04 |
| S17-D | H03a; H03b, H05back, H05strap, H05sleeve, H05modest, H05denom, H05hem, H05hemP, H05hemQ, H06, S02, S04 |
| S18-A | H03a; H03b, H05back, H05strap, H05sleeve, H05hem, H05hemQ, S02, S04 |
| S18-B | H03a; H03b, H05back, H05strap, H05sleeve, H05hem, H05hemQ, S02, S04 |
| S18-C | vocabulary; H03a, H03b, H05back, H05strap, H05sleeve, H05hem, H05hemQ, S02, S04 |
| S18-D | H01; H03a, H03b, H05back, H05strap, H05sleeve, H05hem, H05hemQ, S02, S04 |
| S19-A | vocabulary; v1, covering, H03a, H03b, S02, S04 |
| S19-B | H03a; H03b, S02, S04 |
| S19-C | H03a; H03b, S02, S04 |
| S19-D | H03a; H03b, S02, S04 |
| S20-A | H03a; H03b, H06, S02, S04 |
| S20-B | H03a; H03b, S02, S04 |
| S20-C | vocabulary; H03a, H03b, H06, S02, S04 |
| S20-D | H03a; H03b, H06, S02, S04 |
| S21-A | H03a; H03b, H06, S02, S04 |
| S21-B | H03a; H03b, S02, S04 |
| S21-C | H03a; H03b, H06, S02, S04 |
| S21-D | vocabulary; H03a, H03b, S02, S04 |
| S22-A | H03a; H03b, S02, S04 |
| S22-B | H03a; H03b, S02, S04 |
| S22-C | vocabulary; H03a, H03b, S02, S04 |
| S22-D | H03a; H03b, H06, S02, S04 |
| S23-D | vocabulary; H03a, H03b, U01-arms, U01-knees, U01-head, S02, S04 |
| S24-A | H03a; H03b, H05back, H05strap, H05modest, S02, S04 |
| S24-B | H03a; H03b, H05back, H05strap, H05modest, H05hemP, H05hemQ, S02, S04 |
| S24-C | vocabulary; v1, covering, H03a, H03b, H05back, H05strap, H05modest, H05hemP, H05hemQ, S02, S04 |
| S24-D | H03a; H03b, H05back, H05strap, H05hemQ, S02, S04 |
| S25-A | S02; S04 |
| S25-B | S02 |
| S25-C | vocabulary; v1, covering, S02, S04 |
| S25-D | v1; covering, S02 |

### askFirst audit

| Rule | Blocked fixtures | Is an answer required? |
|---|---:|---|
| H04q | 8 | No: optional family/custom white advice; not a failure rule |
| C01 | 6 | No: optional tall-gele preference |
| C04 | 7 | No: optional ichafu shape preference |
| C07 | 0 | No: advisory confirmation; S04 separately checks supplied bands |
| H05modest | 7 | Yes: modesty is a condition of the stated Pentecostal sleeveless exception |
| H05denom | 4 | Yes: denomination determines applicable church coverage requirements |
| H05hemQ | 14 | Yes: unclear/slightly short hem and church guidance cannot settle the coverage requirement |

Unanswered `explainOnly` rules S01/S03/S04a/C02/C03/C09 already did not
block; their questions remain informational. Optional prompts can coexist
with independently required missing facts (for example C07 versus S04).

## B and C

### Implemented contract

- Known independent groups establish a monotonic floor: two or more make a
  final judgement even with unresolved facts; one with unresolved requirements
  is floor-only; one without unresolved requirements is final; zero without
  unresolved requirements is final; otherwise abstain.
- `status` is exactly `final`, `floor-only` or `abstained`.
  `judged` is true only for final. A floor-only result retains `verdict:
  'Not judged'` for compatibility, with a separate `floor: 'Almost'`.
  It cannot be counted as a correct judgement using `judged`.
- `unresolvedReasons` lists required rule IDs and structural predicates.
  Global missing-fact flags remain comprehensive; they are not all blockers.
- All `askFirst` rules are optional unless explicitly `answerRequired`.
  The three required church questions are H05modest/H05denom/H05hemQ.
  H04q/C01/C04/C07 retain their questions but never block. The unresolved
  hard rules still block; no missing fact is filled in to improve coverage.
- Fitted S06 remains excluded, including unresolved premises, in accuracy mode.
- The runner now serialises **category counts only**. No per-look band,
  floor value, failure group, hits, questions or accuracy is serialised.

### Files

`lib/nigerianStyling/v2/{types,rules,evaluate}.ts`,
`scripts/nigerian-v2-coverage.ts`,
`__tests__/nigerianStylingV2VerdictFloor.test.ts`, this report,
`TECHNICAL.md`, and the existing styling-boundary memory topic.
The count-only result file will be added after the committed checksum is printed.

### Tests

The new independent synthetic tests cover all six combinations of zero/one/two
groups and resolved/unresolved inputs; known-result precedence over missing V1,
vocabulary and covering; duplicate hits in one group; unknown V1; all four
optional prompts (known and unknown premises); required church questions;
advisory unknowns; fitted-rule exclusion. The actual runner is executed with
100 synthetic in-memory files, a stub evaluator and deliberately forbidden
extra result fields: only category counts survive, with final/floor-only/
abstained counted separately. It does not open or evaluate the rating fixtures.

Verification and pre-run commit/checksum will be recorded before the real run;
count-only results will be appended afterwards.
