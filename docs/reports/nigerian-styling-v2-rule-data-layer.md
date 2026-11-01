# Nigerian Styling V2 — rule-data implementation

## Scope

Implemented the approved rule-data evaluator and amendments beside V1.
It evaluates one supplied look, not a wardrobe, pool or rating set. It does not
generate, rank, tune or change any app display. No numeric scores or deltas.
No rating-set material, gold labels or design key was used to author rules or
tests. The existing benchmark validator was run as the required regression gate.

## Files

| File | Change |
| --- | --- |
| `lib/nigerianStyling/v2/types.ts` | Typed supplied facts, transient brief, declarative conditions and result contract |
| `lib/nigerianStyling/v2/rules.ts` | 24 declarative rule clauses, vocabulary and supplied textile bands |
| `lib/nigerianStyling/v2/evaluate.ts` | Generic three-valued condition interpreter, rule hits and group-based verdict |
| `__tests__/nigerianStylingV2.test.ts` | One synthetic trigger case per clause, plus boundary and verdict tests |
| `TECHNICAL.md` | Section 57 and current suite-count references |
| `.agents/memory/styling-boundary-authority.md` | Approved enduring V2 constraints |
| This report | Built rule table, verification and limitations |

## Rule table as built

All clauses have `version: 2` and source reviewers R1, R2 and R3.
`failure` means one deduplicated failure group, not an automatic Rethink.
Clauses split into a/b share a group and cannot be double-counted.

| ID | Strength | Type | Community | Effect |
| --- | --- | --- | --- | --- |
| H01 | strong | hardFilter | — | White-wedding guest key garment in white/ivory/cream: `weddingIdentity` |
| H02a | strong | hardFilter | — | Traditional-wedding guest key garment matches supplied bride colours: `weddingIdentity` |
| H02b | strong | hardFilter | — | Traditional-wedding guest key garment matches supplied family textiles: `weddingIdentity` |
| H03a | strong | hardFilter | — | Bought aso-ebi key garment has a different exact colour: `asoEbi` |
| H03b | strong | hardFilter | — | Bought aso-ebi key garment has a different exact textile: `asoEbi` |
| H04 | strong | hardFilter | — | Red at a funeral: `funeralColour` |
| H04q | likely | askFirst | — | Ask which funeral colours to avoid; no festive-bright classification |
| H05 | strong | askFirst | — | Ask church shoulder/hem requirements; no thresholds or failure group |
| H06 | strong | hardFilter | — | Supplied traditional wear with trainer/flipFlop/sportsSandal footwear: `footwear` |
| H07 | strong | hardFilter | — | Gele/ichafu, any size, with blazer, jeans or Casual: one `styleHeadwear` failure |
| S01 | likely | explainOnly | — | Suggest clutch/box bag for traditional wear when neither is present; advisory only |
| S02 | strong | hardFilter | — | Any explicitly poor-polyester-quality item: `quality` |
| S03 | likely | explainOnly | — | Competing prints: suggest one dominant print; advisory only |
| S04 | strong | hardFilter | Yoruba only for aso-oke band | Key textile band disjoint from supplied event band: `register` |
| S05 | likely | explainOnly | — | Work/Casual note about separate wear when V1 allows it; no new set logic |
| S06 | likely | hardFilter | — | Supplied evening owambe with key Ankara/premium Ankara: `register`, shared with S04 |
| C01 | community | askFirst | Yoruba | Iro and buba in traditional wear without confirmed tall gele: optional tall-gele question |
| C02 | community | explainOnly | Hausa | Abaya/kaftan/zani guidance mentions gyale/hijab/kallabi subject to V1 preference; no covering requirement |
| C03 | community | explainOnly | Igbo | George/Indian George in traditional wear: advisory acknowledgement |
| C04 | community | askFirst | Igbo | Ichafu not confirmed lower/wider: ask about shape, not a penalty |
| C05 | community | hardFilter | Igbo | Traditional guest coral above one strand: `roleAdornment` |
| C06 | community | hardFilter | Igbo | Traditional ivory odu with explicit non-titled status: `roleAdornment`; missing title asks |
| C07 | community | askFirst | — | Naming-ceremony mother: ask if supplied event band excludes the supplied point 8 |
| C09 | community | explainOnly | — | Smaller style wrap is an option with a dress at a traditional-leaning event, absent blazer/jeans |

**H07 merges the former H07/C08 exclusion.** There is no second size-based
headwear failure. C09 is only the separate positive smaller-wrap suggestion:
it never changes a verdict or overrides H07.

Headwear kind membership is explicit. Covering items are hijab, scarf, turban,
gyale, kallabi, mayafi, headwrap and head-scarf; none enter H07. Their preference
and availability remain V1's responsibility. No covering item is inferred,
substituted or added by V2.

### Supplied textile bands

Indian George 9–10; beaded/French lace 8–10; Yoruba aso-oke 9–10;
velvet 8–9; cord lace/Akwete 7–9; Hollandais/brocade 6–8;
Swiss voile 6–7; premium Ankara 4–7; adire 3–6.

S04 compares interval overlap. An endpoint in common counts as overlap.
No nearest-band calculation, midpoint, weighting or role-derived threshold.
Unqualified `george` is not assumed to mean `indian-george`.
Unknown or inapplicable bands are unassessed, not failures.
S06 encodes the separately supplied evening-Ankara statement without inventing
a numerical evening threshold.

## Input and verdict contract

`LookFacts` contains explicit item facts, a transient brief, traditional-wear
intent, print dominance and a caller-supplied V1 decision/gap notes.
No app records, mappers, editors or database are read. The V1 import is type-only.
The caller must provide V1's decision for the corresponding look; V2 does not
run V1 on an invented wardrobe or reinterpret its covering/set rules.

Key garments are explicitly flagged by the caller. Colour and kind tokens are
canonical lower-case; aso-ebi comparisons are exact, not fuzzy or inferred.
Item facts include textile identity, quality, footwear type, shoulder coverage,
hem, headwear shape/height and coral strands. The brief contains role,
whose event, community, denomination, aso-ebi details, bride colours, family
textiles, time, supplied formality band and title confirmation.
These are input facts only, not new stored fields or collection UI.

Independent failure means a distinct requirement group, not a distinct item,
rule hit or sentence. Examples:

- Two wrong aso-ebi attributes still count as one `asoEbi` group.
- Gele with both jeans and blazer still counts as one `styleHeadwear` group.
- S04 and S06 together still count as one `register` group.
- Explicit poor quality plus a disjoint textile/event band are two groups:
  `quality` and `register`.
- Multiple coral/title hits share `roleAdornment`.

One group gives **Almost**; two or more give **Rethink**. V1 rejection contributes
one `structure` group. Unknown key vocabulary, no key garments or unknown V1
structure gives **Not judged**, even if known failures are also reported.
With no known failure, unresolved required facts/questions or an unsatisfied
V1 covering constraint also give **Not judged**, not an unsupported Works.
Missing advisory-only facts do not change a verdict. Known non-matching
communities bypass community rules; unknown communities ask rather than infer.

The result includes verdict, `judged`, failure groups, rule hits, questions,
gap notes, advisory notes and a missing flag for every declared fact.
`unassessedFacts` distinguishes supplied values lacking an applicable band from
absent values. Missing/unassessed facts never create a failure group.
Every Not judged result has `judged: false`; it cannot be included as correct
in any downstream metric. No rating metric or aggregate scoring was added here.

## Tests and verification

`__tests__/nigerianStylingV2.test.ts` covers:

- All 24 rule clauses with independently authored synthetic inputs.
- Works, one-group Almost, two-group Rethink, and unknown-vocabulary Not judged.
- Same-group deduplication, including both aso-ebi mismatches.
- Both style-headwear kinds with each exclusion, plus all eight covering kinds.
- All three disallowed footwear types, and traditional/non-traditional scope.
- Every supplied general textile band, boundary overlap, Yoruba-only aso-oke,
  unknown/inapplicable bands, invalid/missing event bands and no inferred band.
- Unknown/mismatched communities, title confirmation, guest coral, tall gele,
  ichafu shape and naming-band questions.
- No invented festive-bright colours or church hem/shoulder thresholds.
- Advisory-only bag/print guidance and absence of score/delta output.
- V1 rejected/unknown decisions and unsatisfied covering gaps.
- Missing versus unassessed facts, determinism and no input mutation.
- Out-of-scope/held key vocabulary and `judged: false` for abstentions.

| Gate | Result |
| --- | --- |
| `npm test` | 146 test files passed; 0 failed |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `tsx __tests__/recommendation-golden-set.ts` | 35/35 |
| `node scripts/validate-benchmark-fixtures.mjs` | Passed, including 53/53 frozen checksums |
| `npx expo export --platform android --output-dir /tmp/amodka-v2-android` | Passed |
| `git diff --check` | Passed |

No existing source or test assertions were removed. V1, v3.7 and its types,
the golden set and all 53 frozen files are untouched. No tuning was performed.

## Pending and not verified

- **Double wrapper is out of scope and remains a pending V1 decision.**
- Festive-bright colour definitions and church modesty thresholds need reviewer
  definitions; current questions deliberately do not produce invented failures.
- Generic George, generic lace and other textiles without a supplied applicable
  band remain unassessed; no subtype, quality or textile inference fills gaps.
- C09 offers a smaller-wrap option but does not infer the size of an owned wrap.
- No physical-device, UI, mapper, live-database, provider or production
  integration verification. This module has no app caller in this task.
- No assertion of stylist accuracy or rating-set performance: only synthetic
  logical behaviour and existing regressions were verified.
- No workflows were restarted and nothing was published.

## Deviations

No functional scope deviations. Documentation outside V2 and its tests was
updated: `TECHNICAL.md`, this report and the existing project-memory topic.
The Android export was also run as a conservative additional regression gate.
No V1/v3.7, application path, server, billing, consent, limiter, RLS, migration,
database, editor or mapper changes.
