# Nigerian Styling V2 — reviewer answers and second blind coverage run

No gold labels, ratings or design key were requested, read or used. No accuracy
metric or per-fixture verdict band or failure-group output is authorised here.
Fixtures remain immutable. No tuning is based on coverage results.

## Reviewer attribution and rules as built

Reviewer identities supplied by the user: R1 Yoruba, R2 Hausa, R3 Igbo.
Every new/revised reviewer-answer rule has `source: 'reviewer answer'`.

| Rule | Behaviour | Strength / reviewers |
|---|---|---|
| H05back | Backless at church without a worn jacket/wrap/shawl | Strong; R1/R2/R3 |
| H05strap | Strapless at church without that worn cover | Likely; R2/R3; R1 conditional |
| H05sleeve | Sleeveless at Catholic/Anglican/orthodox unless covered | Strong; R1/R2/R3 |
| H05modest | Uncovered Pentecostal sleeveless: ask unless explicitly modest | Question; R1/R2/R3 |
| H05denom | Sleeveless with unknown/unspecified denomination: ask | Question; R1/R2/R3 |
| H05hem | Clearly above-knee at Catholic/Anglican/orthodox | Strong; R1/R2/R3 |
| H05hemP | Clearly above-knee at Pentecostal | Likely; R2/R3; R1 conditional |
| H05hemQ | Slightly above, generic above-knee or missing hem: ask | Question; R1/R2/R3 |
| U01 arms/shoulders/knees/head | An explicitly stated personal requirement contradicted by the look | Strong; R1/R2 only |
| H04 | Red, orange, hot-pink, fuchsia, bright-yellow, lime, bright-green, electric-blue, cobalt-blue | Strong; R1/R2/R3 |
| H04l | Turquoise, metallic gold/silver, sequins, high-sheen gold | Likely; R1/R3 |
| H04a | Coral, multicolour wax print | Advisory; R3 |
| H04b | Bright-purple | Advisory; R1 |
| H04c | Wine/burgundy | Advisory; R2/R3, contested rather than consensus |
| H04q | White: ask the family/custom | Question; R1/R2/R3 |
| S04a | Textile above supplied band | Advisory only; R1/R2/R3 |
| C09 | Smaller wrap means low, close to head, unsculpted; no centimetres | Advisory only; R1/R2/R3 |
| S02 | Explicit poor-polyester flag only | Strong; R1/R2/R3 |

Announced matching family colour overrides all funeral lists, including white
questions and finish checks, per item. An unrelated announcement does not excuse
a listed colour. Navy, charcoal, black, chocolate and olive have no colour hit
when no colour is announced. No rule bans every non-announced colour.

Short sleeves never fail alone. R3-only short-sleeve/short-hem combinations and
age-based elbow-length guidance are **not encoded**. The original H07 remains
applicable to any gele/ichafu size and never to covering items. No group or
numeric delta is added for overdressing or smaller-wrap guidance.

Quality vocabulary records shine, stiff handle, thinness and poor drape
(R1/R2/R3); thin net, loose threads, glued beads and puckered embroidery
(R3 only); matte, lined polyester is not automatically poor (R1). None changes
the explicit flag or derives a failure from a material/finish word.

## Actual V1 adapter

`lib/nigerianStyling/v2/blindAdapter.ts` builds a minimal synthetic `OutfitSet`
and wardrobe from each described item's structural category and exact subtype,
then calls the unchanged `applyNigerianStylingV1`.

- Work maps to Work, Casual to Casual; traditional wedding, traditional event,
  owambe and naming map to Traditional; remaining briefs map to Event.
- Relationships are `[]` as expressly requested. Covering preference and style
  headwear request are unset: V1's actual defaults apply. This is not a claim
  that an app user's relationships were loaded or do not exist.
- Aggregated sets, double wrappers, ambiguous head-ties, generic wraps and
  other unmapped subtypes remain unknown with item-level reasons. Sets are
  never decomposed into unstated pieces.
- V1's decision is passed through, not inferred from a complete-looking list.
  Inconsistent decisions across covering variants would abstain.
- V1 may remove/reselect described headwear under its defaults. These changes
  are recorded as gap notes; they do **not** change the original items V2 reads.
- Neutral type-required photo/date/season fields are mechanical placeholders,
  never styling facts.

Additional facts come only from exact item-supporting phrases and explicit
brief statements. A single-key “same garment” clause overrides inherited sleeve
wording. Absence of a described cover does not prove no cover was worn; explicit
negative statements and explicit worn jacket/blazer presence are distinguished.
Long sleeves alone do not prove opaque coverage; a gyale name alone does not
prove it is worn over the head. Venue practice is not a personal preference.
An unspecified optional personal preference does not impose a new requirement.

## Commit, checksums and coverage

Adapter commit, SHA-256, coverage counts, source inventory and final verification
are recorded after the mandatory pre-run commit. The dry-run runner verifies
all 100 frozen fixture hashes before evaluation, uses accuracy mode to exclude
fitted S06, and allowlists only coverage and missing-information output.

## Scope and deviations

V1, v3.7, constants/types.ts, all 53 frozen checksum files and the blind fixture
directory are untouched. No app integration, migrations, SQL, billing, consent,
limiter or server changes. No live services or customer data are used.

Deviations: none. No device, hosted integration, stylist accuracy or gold-label
validation is claimed. Double wrapper remains a pending V1 decision.
