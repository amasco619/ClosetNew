# Nigerian Styling V2 — blind adapter and coverage-only dry run

No gold labels, ratings or design key were requested, opened or used. No
accuracy calculation or fixture-level verdict labels are authorised in this run.

## Reviewer-led rule revisions

- S04: only `textile maximum < event minimum` is a register failure.
  Touching/overlapping intervals do not fail. Above-band textile is S04a
  advisory only, with no failure group.
- A key garment exactly matching both colour and textile of **bought**
  aso-ebi is exempt from S04/S06, per garment rather than per outfit.
  Missing purchase/colour/textile stays unknown; it is not a guessed exemption
  or a proven failure.
- S06 remains active for styling but is labelled `fitted`, source
  `review of rating results`. `mode: 'accuracy'` excludes it entirely,
  including unanswered questions. The coverage runner uses this mode.
  No reported accuracy may use normal styling-mode results.

## Adapter contract

`lib/nigerianStyling/v2/blindAdapter.ts` is deterministic. It has no scenario
IDs, description parsing or look-specific branches. It reads observations,
not app data, and does not broaden V2's supported judgement vocabulary.

The approved key convention maps dresses/one-pieces, tops, bottoms, set pieces
and outerwear to key; footwear, bags, jewellery, belts and headwear to non-key.
Unresolved kinds remain unknown, rather than false. A generic wrap has no
unambiguous role. Key designation does not add an unsupported kind to V2.

Only the supplied event/role pairs gain a band:

| Event | Role | Band |
|---|---|---|
| Owambe | Guest / family / host | 7–8 / 8–9 / 9–10 |
| Traditional wedding | Guest / family / bride | 8 / 9 / 10 |
| Funeral | Guest / close family | 7 / 8 |
| Naming ceremony | Mother | 8 |

No nearest-role substitution: `family` is not silently `closeFamily` at a
funeral; mother of bride is not silently the general family role. Existing
explicit numerical bands are preserved.

The frozen descriptions contain no encoded confirmed set membership,
relationships or aso-ebi set marking, and no supplied V1 decision. Naming a
set or matching garments does not supply these. The adapter therefore retains
null V1 for those observations, rather than defaulting to eligible or satisfied
head covering. A supplied fact-backed V1 decision is preserved. V2 accepts null
and explicitly reports structural uncertainty. No V1 code was changed.

## Pre-run freeze and output

Commit the adapter, then print SHA-256 of its exact file bytes before running:

```sh
sha256sum lib/nigerianStyling/v2/blindAdapter.ts
node_modules/.bin/tsx scripts/nigerian-v2-coverage.ts \
  > docs/reports/nigerian-v2-step3b-coverage.json
```

The runner verifies all 100 frozen hashes **before** the first evaluation,
projects only judged/not judged and missing-fact/question/gap information,
and refuses output containing any prohibited verdict label. It neither
persists nor logs scores, hits, failure groups or verdict bands.

Category precedence is travel, explicitly titled weather/heat, date, work
(office/interview/campus presentation), then named Nigerian/religious event,
then other. Categories summarise coverage, not correctness or inferred intent.
The raw per-fixture causes and category counts are in
`nigerian-v2-step3b-coverage.json` after the committed-adapter run.

## Verification and boundaries

Synthetic tests cover the table, key convention, unknown structure, immutable
inputs, exact/per-garment exemptions, non-bought/missing/mismatched aso-ebi,
under/over/touching bands, and fitted-rule exclusion.

V1, v3.7, frozen fixtures/checksums, application integration and migrations are
outside this change. Double wrapper remains a pending V1 decision. No device
or live integration verification is involved.

Deviations: none. Unknown required inputs are reported, not repaired from
labels or presumed cultural/structural relationships.
