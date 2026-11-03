# Nigerian Styling V2 — Step 3e

No gold labels, ratings or design key accessed or requested. No fixture edits.

## Policy

Unknown rule premises remain unknown and are reported as `{id, missingFact}` in
`uncheckedRules`; they do not generally block a judgement. Structural
uncertainty and applicable required church questions remain blockers. Known
independent groups retain the two/one/zero mapping requested by the user.
One known group with a remaining structural/question blocker is floor-only;
zero with a blocker abstains; two known groups are final despite blockers.
`worksWithUnchecked` identifies final zero-group results with unchecked rules.
Floor-only is never correct in any metric. Accuracy mode still excludes fitted S06.

No rule condition, rule provenance, adapter convention or vocabulary was changed.
The evaluator does not treat an unknown denomination as establishing applicability
of the Pentecostal-only question. The denomination question itself remains required
when the occasion is known to be church.

## B. Pre-rerun structural inventory

Reproduced from the saved Step 3c gaps and unchanged fixture subtypes, without
running the evaluator. The same inventory was reported in chat before the rerun.
Item numbers below are the suffix of the full fixture item ID; for example
S01-D item 04 is `S01-D-item-04`.
“Approved” refers strictly to the vocabulary list supplied in the Step 3e request,
not every Western garment supported elsewhere in the application.
These are mapping gaps, not permission to infer missing facts or change fixtures.

### V1 unknown — 28 fixtures

Each listed item lacks a mapping in the adapter's unchanged `V1_CATEGORIES`.
This does not claim that V1 itself lacks all of those garment concepts.

| Fixture | Item: encoded word/subtype | Approved? |
|---|---|---|
| S01-D | 04: ipele | Yes |
| S03-A | 01: double-wrapper | No |
| S03-B | 01: double-wrapper | No |
| S04-B | 01: double-wrapper | No |
| S06-A | 04: ipele | Yes |
| S08-B | 01: double-wrapper | No |
| S08-C | 03: head-tie | No |
| S09-A | 02: head-tie | No |
| S09-C | 01: skirt-suit | No |
| S10-A | 03: head-tie | No |
| S10-B | 03: head-tie | No |
| S10-C | 02: head-tie | No |
| S10-D | 03: head-tie | No |
| S11-C | 01: suit | No |
| S12-B | 01: dashiki | No |
| S12-D | 01: co-ord | No |
| S13-B | 01: unknown | No |
| S13-C | 01: two-piece-set | No |
| S14-A | 01: skirt-suit; 02: head-tie | No; No |
| S16-A | 03: wrap | No |
| S16-B | 01: double-wrapper | No |
| S16-C | 01: set | No |
| S17-A | 03: head-tie | No |
| S17-B | 03: head-tie | No |
| S19-A | 01: skirt-suit | No |
| S24-C | 01: trouser-suit | No |
| S25-C | 01: suit | No |
| S25-D | 02: head-tie | No |

### Vocabulary gap — 26 fixtures

All listed words are outside the specific approved list in this request.
`unknown` and `wrap` have an unresolved key role; the other listed kinds are
recognised as keys by the adapter but absent from V2's `KEY_VOCABULARY`.
`wrap` is not silently equated to the approved word `wrapper`.
Textile identities (George, Hollandais, Akwete and the listed textiles) are not
key garment subtypes, so their absence from these tables is not an omission.

| Fixture | Item: encoded word/subtype |
|---|---|
| S02-D | 03: jacket |
| S03-A | 01: double-wrapper |
| S03-B | 01: double-wrapper |
| S04-B | 01: double-wrapper |
| S08-B | 01: double-wrapper |
| S09-C | 01: skirt-suit |
| S11-C | 01: suit |
| S12-B | 01: dashiki |
| S12-C | 01: jumpsuit |
| S12-D | 01: co-ord |
| S13-B | 01: unknown |
| S13-C | 01: two-piece-set |
| S14-A | 01: skirt-suit |
| S14-C | 01: jumpsuit |
| S16-A | 03: wrap |
| S16-B | 01: double-wrapper |
| S16-C | 01: set |
| S16-D | 01: jumpsuit |
| S18-C | 01: jumpsuit |
| S19-A | 01: skirt-suit |
| S20-C | 01: jacket |
| S21-D | 01: shorts |
| S22-C | 01: jumpsuit |
| S23-D | 02: jacket |
| S24-C | 01: trouser-suit |
| S25-C | 01: suit |

No mappings were fixed. Double wrapper remains outside this change.
S13-B's source says “Head-to-toe bold wax print with a print bag, print shoes,
and busy jewellery.” It does not name a key garment: `unknown` is missing
information, not a rejected Nigerian garment word.

## Verification before coverage

- Full suite: 149 test files passed, zero failed.
- Typecheck, lint, golden set (35 assertions), benchmark validator passed.
- Validator confirms all 53 frozen checksums.
- Rules, adapter, V1, constants, application, server, migrations and blind fixtures
  are byte-identical to the pre-task repository state.
- Tests cover known group counts with unchecked facts; all structural blocker
  cases; required versus optional questions; covering gaps; fitted-rule exclusion;
  deterministic unchecked entries; and the count-only output boundary.
- Existing evaluator and adapter assertions were updated for the new policy.
  No test was removed, and no fixture was opened by the synthetic evaluator tests.

## Committed evaluator and single coverage rerun

Implementation commit: `cb28d60`.
Completed tests and pre-rerun inventory commit:
`abc4aed527d02e35c485eb99221243712f7cd0d8`.
Both preceded the single real coverage rerun.

Evaluator SHA-256, published in chat before running:
`169d53a0e539804191cdc1b35d47393532ddbae418c54b9a30c55fee1005e4b9`.

Unchanged fixture-set manifest SHA-256:
`e1e72cc776bf107f5f9cf7385814daecef8b526b1b8e35f21baffb6dca882775`.
The runner verifies every fixture against that manifest before any evaluation.

| Category | Final total | Of which worksWithUnchecked | Floor-only | Abstained |
|---|---:|---:|---:|---:|
| Nigerian event | 28 | 27 | 0 | 32 |
| Work | 11 | 10 | 1 | 8 |
| Travel | 0 | 0 | 0 | 4 |
| Weather | 3 | 3 | 0 | 1 |
| Date | 3 | 3 | 0 | 1 |
| Other | 6 | 5 | 0 | 2 |
| **Total** | **51** | **48** | **1** | **48** |

The flag column is a subset of the final total, not an additional population.
The raw [coverage JSON](nigerian-v2-step3e-coverage.json) instead uses exclusive
buckets: `final` means other final results, and `worksWithUnchecked` means
flagged final results. Those four raw buckets sum to 100.
No per-fixture verdict bands, failure groups or accuracy were printed.

## Files changed

- `lib/nigerianStyling/v2/evaluate.ts`: unchecked tracking and narrower blockers.
- `lib/nigerianStyling/v2/types.ts`: result fields and their contract.
- `scripts/nigerian-v2-coverage.ts`: count-only split of flagged final results.
- `__tests__/nigerianStylingV2VerdictFloor.test.ts`: policy and output-boundary tests.
- `__tests__/nigerianStylingV2.test.ts`: existing assertions aligned with the
  expressly changed abstention policy, preserving checks against inferred facts.
- `__tests__/nigerianStylingV2BlindAdapter.test.ts`: existing result expectation
  aligned with unchecked facts; adapter implementation unchanged.
- `TECHNICAL.md`, this report and its coverage JSON.
- `.agents/memory/styling-boundary-authority.md`: durable blind-evaluation boundary.

## Deviations and limits

Deviations: none. No app integration, migrations, live queries, rule tuning or
gold-label evaluation. No device or hosted verification was needed or performed.
Coverage is not accuracy evidence.
