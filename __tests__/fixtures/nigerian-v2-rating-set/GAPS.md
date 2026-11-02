# Step 3 — missing and unrepresentable observations

These are encoding gaps and potential rule dependencies, **not rule results**.
Every individual null observation is also listed in its fixture's `gaps`.
No rule was executed to decide which dependencies would be active.

## Common gaps

| Gap | Extent | Potentially blocked rules or boundary |
| --- | --- | --- |
| Explicit key-garment boolean | All 345 described item records | H01, H02a/b, H03a/b, S04, S06 and key-vocabulary assessment |
| V1 decision, confirmed set records and covering evaluation | All 100 looks | Required V1 handoff and the verdict boundary |
| Supplied numerical event formality band | All 100 looks | S04 and C07; no grade inferred from role, dress code or reviewer bands |
| Explicit traditional-wear intent for the look | All 100 looks | H06, S01, C01–C06; a traditional event is not look-level intent |
| Explicit print-dominance state | All 100 looks | S03; repeated/bold/busy prints are retained as descriptions, not converted to competing |
| Bride's specified colours and family textile identities | No current event supplies these fields | H02a/b; S04 supplies family **colours**, not these two facts |
| Individual current-event aso-ebi purchase | Unknown in 80 looks; false in 20 | H03a/b; family purchase, assignment and historic purchases are not defaulted to true |
| Unambiguous single event community | Unknown in 68 looks | Community rules and Yoruba-specific aso-oke band; cities are not identity |
| Quality flag | One item explicitly cheap polyester; 344 unknown | S02; premium/luxury descriptions do not invent a negative polyester flag |
| Exact coral strand count | No integer supplied | C05; “several”/“full set” cannot be stored as an invented count |
| Lower-and-wider ichafu shape | Not explicitly supplied | C04; “wide” alone does not establish both requirements |
| Exact footwear class | Only explicit named types are encoded | H06; generic shoes, flats, sandals and slip-ons need no guessed subtype |
| Church shoulder and hem thresholds | Not supplied; not implemented as thresholds | H05 remains a question; bare shoulders/explicit lengths are observations only |

Nulls are recorded even for facts that may be inapplicable to a particular item.
For example, an earring's null hem is not a claim that a hem rule applies to it.
The per-fixture dependency lists must not be interpreted as failed rules.

## Scenario-specific limitations

| Scenario | Stated facts not converted into stronger claims; relevant dependencies |
| --- | --- |
| S01 | Thin/shiny polyester lace is not explicit poor quality (S02). Premium Ankara is stated, but no numerical event band (S04). Matching/small/auto-gele does not supply exact fabric, height or V1 permission. |
| S02 | Family bought Swiss voile and expects participation; individual purchase remains unknown (H03). Matching gele fabric is not explicitly Swiss voile. Different vendor/lighter blue does not establish a different textile. “No gele” is retained, not converted to a covering-preference failure. |
| S03 | Mother-of-bride and non-titled status are explicit. Double wrapper stays outside V1 scope. Several coral strands do not supply an exact count; wide ichafu does not state lower-and-wider (C04/C05). Ivory odu is an accessory, not a white/ivory garment-colour claim. |
| S04 | Coral red/wine are family colours, not the bride's colours or family fabrics (H02). “Full set” coral does not specify strand count (C05). Generic George is not Indian George (S04). |
| S05 | Always covering hair/arms/legs, lining and sheer fabric are stated but cannot supply a V1 outcome. Short sleeves do not quantify shoulder coverage. Hair covering is not inferred to satisfy an unavailable V1 preference evaluation. |
| S06 | Bride and current traditional ceremony are explicit; next week's white wedding is not the current occasion (H01). No regality grade or numerical band is supplied (S04). A small gele is not an invented low-height fact. |
| S07 | The family's soft-colour request has no field/rule here. No event aso-ebi is explicit. Garden/daylight is not a formality grade; small/soft gele is not tall/notTall (C01). |
| S08 | Nursing, five-hour activity and comfort requirements have no LookFacts fields. Naming-mother is explicit, but point 8 is a rule reference, not a supplied event band (C07). Double wrapper remains pending V1. |
| S09 | Black/white request has no allowed-colours field. Deep red is preserved verbatim, not collapsed to exact `red` (H04 lexical limitation). Festive brightness remains undefined (H04q). |
| S10 | Assigned umuada George fabric is not a stated individual purchase (H03). Dusty ground and party head-tie styling lack fields. Generic George is not Indian George (S04). |
| S11 | Native-Friday dress code/smartness does not provide a numerical band. Ankara trim is not the whole suit's textile. Unspecified suit components are not fabricated as blazer/trousers; no print-dominance judgement (H07/S03/S04). |
| S12 | Creative/casual clientele does not make the office occasion Casual. Dashiki stays held; a co-ord without named component shapes is not split. Jumpsuits/caps are not relabelled to pass key vocabulary. |
| S13 | Upscale dinner/“not dressed up” has no exact occasion/band. Head-to-toe print does not state a garment shape or a print-dominance judgement. Two-piece set shapes are unspecified (S03/S04/V1). |
| S14 | Catholic denomination is explicit; majority local head-covering practice is not the user's covering preference. Generic head tie and jumpsuit remain their stated kinds. No church coverage thresholds supplied (H05/V1). |
| S15 | Day party/hot weather is not an inferred Casual occasion or numerical temperature. Cheap polyester is explicitly encoded. Same-print accessories are not declared competing prints; no stylist judgement is added (H07/S02/S03). |
| S16 | Six-hour flight, cold/hot locations and creasing/comfort lack fields. Light wrap is not assumed headwear or covering. No weather numbers or event time. Double wrapper remains pending V1. |
| S17 | The old wedding purchase is not copied into the current church brief. The complete set's named blouse/wrapper are resolved using the explicit source reference, but no authoritative confirmed relationship/V1 result is fabricated. Equal quality is not a poor/non-poor polyester flag. |
| S18 | White wedding plus church is a compound occasion; the single occasion field uses the explicit white-wedding heading, with church context retained verbatim. Champagne that reads close to ivory is not asserted to be ivory. Bare shoulders are explicit; church thresholds are not (H01/H05). |
| S19 | Interview/conservative dress code is retained as `other` plus exact source, not a numerical band or an invented office event. Suits are not expanded into unstated blazer components (H07/S04). |
| S20 | Casual is explicit. Heat/humidity/32 degrees have no LookFacts temperature field. Wool/denim and generic footwear do not create weather or quality judgements. |
| S21 | University prohibition of short skirts/sleeveless tops has no policy/threshold field. Mini/midi and sleeves remain descriptive observations, not institutional compliance verdicts. |
| S22 | Date night uses `other`; no exact evening/day band or formality is invented. Tall gele is explicit, but no traditional intent or V1 decision is supplied. |
| S23 | Always covering hair/arms/legs is stated, not an evaluated V1 result. Only the explicitly referenced set is inherited for B; A's hijab/flats are not inherited as part of that set. No clothing transparency or coverage satisfaction is invented. |
| S24 | Pentecostal denomination is explicit. Smart/fashionable is not a formality band. Backless does not automatically mean uncovered shoulders; short sleeves do not set an unsupplied church threshold (H05). |
| S25 | Mixed Igbo and Yoruba cannot occupy the single-community enum without choosing/inventing one. London residence does not change community or event standards. Owambe is explicit; ceremony type, time and numerical band are not (community rules/S04/S06). |

## Step 4 boundary

No fixture is silently converted to a complete runtime LookFacts:
the required key flags and V1 results are missing. The later harness must
report this limitation and preserve abstention rather than inventing eligible
structure or satisfied coverage. Null V1 cannot be passed directly to the
current evaluator. No scoring bridge, scores, hit counts or proposed
result-driven rule changes were produced in Step 3.

No missing fact, rule or test may be “repaired” from gold labels or observed
mismatches. This fixture set is frozen before any labels are received.
