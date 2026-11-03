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

Adapter commit: `3317cc377d09b77a52195cf7b1f29d9847e45c81`.

Adapter SHA-256, published in chat **before** the run:
`898ff9f53f01a0ecab1a14bc760e463f7543ccb58ffb9e1504fd637173af4e7d`.

Fixture-set SHA-256, unchanged:
`e1e72cc776bf107f5f9cf7385814daecef8b526b1b8e35f21baffb6dca882775`.

The dry-run runner verifies
all 100 frozen fixture hashes before evaluation, uses accuracy mode to exclude
fitted S06, and allowlists only coverage and missing-information output.

| Category | Judged | Not judged |
|---|---:|---:|
| Nigerian event | 1 | 59 |
| Work | 3 | 17 |
| Travel | 0 | 4 |
| Weather | 0 | 4 |
| Date | 0 | 4 |
| Other | 1 | 7 |
| **Total** | **5** | **95** |

These are coverage counts, not correctness or accuracy. No inference about
stylist agreement is possible or attempted.

### Per-fixture coverage, grouped by category

The companion [coverage JSON](nigerian-v2-step3c-coverage.json) contains **every**
Not judged fixture's missing structural/key facts, all unresolved questions,
gap notes and supplied-but-unassessed fields. Questions name their missing fact
paths. Advisory-only missing facts may also appear; their presence alone does
not prevent judging. No verdict bands, rule hits or failure groups are exported.

| Category | Scenario | A | B | C | D |
|---|---|---|---|---|---|
| Nigerian event | S01 | not judged | not judged | not judged | not judged |
| Nigerian event | S02 | not judged | not judged | not judged | not judged |
| Nigerian event | S03 | not judged | not judged | not judged | not judged |
| Nigerian event | S04 | not judged | not judged | not judged | not judged |
| Nigerian event | S05 | not judged | judged | not judged | not judged |
| Nigerian event | S06 | not judged | not judged | not judged | not judged |
| Nigerian event | S07 | not judged | not judged | not judged | not judged |
| Nigerian event | S08 | not judged | not judged | not judged | not judged |
| Nigerian event | S09 | not judged | not judged | not judged | not judged |
| Nigerian event | S10 | not judged | not judged | not judged | not judged |
| Nigerian event | S14 | not judged | not judged | not judged | not judged |
| Nigerian event | S17 | not judged | not judged | not judged | not judged |
| Nigerian event | S18 | not judged | not judged | not judged | not judged |
| Nigerian event | S24 | not judged | not judged | not judged | not judged |
| Nigerian event | S25 | not judged | not judged | not judged | not judged |
| Work | S11 | not judged | not judged | not judged | not judged |
| Work | S12 | not judged | not judged | not judged | not judged |
| Work | S19 | not judged | not judged | not judged | not judged |
| Work | S21 | not judged | not judged | not judged | not judged |
| Work | S23 | judged | judged | judged | not judged |
| Travel | S16 | not judged | not judged | not judged | not judged |
| Weather | S20 | not judged | not judged | not judged | not judged |
| Date | S22 | not judged | not judged | not judged | not judged |
| Other | S13 | not judged | not judged | not judged | not judged |
| Other | S15 | not judged | not judged | judged | not judged |

Twenty-eight Not judged fixtures have at least one unmappable V1 subtype.
Occurrences: head-tie 10; double-wrapper 5; skirt-suit 3; ipele 2; suit 2;
dashiki, co-ord, unknown kind, two-piece-set, wrap, set and trouser-suit one each.
These counts overlap per fixture. Other blockers include unstated event bands,
purchase/exemption facts, supported textile bands, venue coverage, and unknown
V2 key vocabulary. No rule or adapter was tuned after seeing these counts.

## Explicit set, group and personal-coverage source inventory

All quoted text below is in the frozen fixture's `source.passages`; references
identify the exact passage. Ranges mean each of A/B/C/D contains that context.
Every case still uses empty V1 relationships and an unset V1 covering preference.
No textual description is promoted to a confirmed group or transient aso-ebi ID.

| Fixtures / passage | Stated phrase | Adapter treatment |
|---|---|---|
| S01-A…D / S01.context | “She has not bought the aso-ebi.” | Preserves explicit purchase false; no group |
| S02-A…D / S02.context | “The family bought a royal blue Swiss voile lace aso-ebi with a matching gele fabric. She is expected to wear it.” | Family purchase is not silently made a personal purchase; original null preserved; no confirmed group |
| S02-A | “The aso-ebi iro and buba in royal blue” | Described iro and buba become separate V1 base pieces; no relationship invented |
| S02-B | “The aso-ebi blouse with a black pencil skirt.” | Uses the described top/skirt only; no invented missing set member |
| S02-C | “An iro and buba set in a lighter blue from a different vendor” | Explicitly described base pieces passed to V1; no confirmed relationship |
| S02-D | “The aso-ebi iro and buba plus a matching royal blue lace jacket over the top” | Described base pair and jacket; jacket also supports worn cover |
| S04-A…D / S04.context | “She has not bought aso-ebi.” | Preserves explicit false; no group |
| S04-B | “a full set of coral beads at the neck and wrists” | Jewellery wording does not prove a coordinated garment set; double-wrapper mapping stays unknown |
| S05-A…D / S05.context | “She always covers her hair and arms and wears long hems.” | Optional stated coverage becomes head/arms/knees for V2 only; no override of the requested default V1 preference |
| S05-A | “A matching gyale over her head.” | Supports actual head coverage; long sleeves alone do not assert opaque arms |
| S05-B | “The same gown cut with short sleeves and no head covering.” | Explicit sleeve override supersedes inherited long sleeves; arms/head coverage false |
| S05-C | “A brocade abaya set in jewel teal with a matching kallabi” | Uses the encoded abaya and kallabi only; no unstated second base or confirmed group; kallabi alone does not prove worn head coverage |
| S05-D | “the sleeves and upper bodice are sheer and unlined. A thin gyale.” | Does not invent opacity or worn head position; still unknown |
| S07-A…D / S07.context | “soft colours but no aso-ebi” | Preserves original explicit purchase false; no group |
| S09-A…D / S09.context | “The family has asked for black and white and is selling aso-ebi. She has not bought it.” | Exact announced black/white override; personal purchase false; no group |
| S10-A…D / S10.context | “The umuada group has been assigned a black and white George wrapper fabric for the burial.” | Exact black/white announcement; no invented purchase, relationship or aso-ebi set ID |
| S10-A | “The assigned black and white George wrapper” | Described wrapper/top passed as observed; generic head-tie unmappable |
| S10-B | “The assigned wrapper” | Uses inherited description facts only; generic head-tie unmappable |
| S10-C | “instead of the group's fabric” | No assignment acceptance or purchase invented; generic head-tie unmappable |
| S10-D | “The assigned wrapper” | No confirmed set created; generic head-tie unmappable |
| S11-D | “co-ord (a skirt and matching top in the same print)” | Both explicitly encoded base items passed to V1; no confirmed group |
| S12-D | “A premium Ankara co-ord” | Aggregate co-ord cannot be decomposed; V1 mapping unknown |
| S13-C | “A two-piece lace set” | Pieces unstated; V1 mapping unknown |
| S15-A | “co-ord (wide-leg trousers and a print top)” | Both explicitly described base items passed to V1; no confirmed group |
| S16-C | “A silk set” | Pieces unstated; V1 mapping unknown |
| S17-A…D / S17.context | “Two months ago she bought an aso-ebi for her cousin's wedding: a lace blouse and a George wrapper in wine.” | Historical purchase not a current-event purchase; original current-event null retained; no group |
| S17-A | “The wine lace blouse with a different George wrapper” | Uses described top/wrapper; head-tie unmappable |
| S17-B | “The complete wine set as it was worn” | Uses already encoded inherited blouse/wrapper, not a new guessed decomposition; head-tie unmappable |
| S17-C | “The wine lace blouse with a thin printed wrapper that does not match” | Uses described top/wrapper; no relationship restriction |
| S17-D | “The wine George wrapper with a plain white T-shirt” | Uses described top/wrapper; no relationship restriction |
| S23-A…D / S23.context | “She always covers her hair, arms and legs” | Optional V2 stated head/arms/knees coverage; default V1 covering preference unchanged |
| S23-A | “A long tailored navy blazer and trousers set, a black hijab” | Explicit blazer/trousers retained as layer/bottom, **not** an unstated base top; hijab supports head coverage |
| S23-B | “The same set with a tall sculpted gele in place of the hijab.” | Uses inherited explicit blazer/trousers only; no invented top or substituted covering item |
| S23-C | “A sleeveless sheath dress with no head covering.” | Explicit arms/head contradiction; no further coverage inferred |
| S23-D | “a tailored jacket over it and a plain matching scarf” | Jacket supports worn cover; scarf name alone does not prove worn head coverage |
| S25-A…D / S25.context | “She has not bought the aso-ebi” | Preserves purchase false; no group |

Related but **not** wearer rules: S14 “Most women cover their heads” is venue
practice; S21's university restrictions are an institutional dress code.
Neither is added to `statedCoverage`.

## Files and verification

Implementation: `lib/nigerianStyling/v2/{types,rules,evaluate,blindAdapter}.ts`;
coverage runner: `scripts/nigerian-v2-coverage.ts`.
Tests: updated `__tests__/nigerianStylingV2.test.ts` (40 per-rule trigger cases)
and `__tests__/nigerianStylingV2BlindAdapter.test.ts`; added
`__tests__/nigerianStylingV2ReviewerAnswers.test.ts` with clause boundaries,
reviewer attribution, optional/missing facts, family overrides, vocabulary-only
quality markers, actual-V1 equality, unmapped pieces and source-inheritance tests.
Documentation: this report, coverage JSON, TECHNICAL.md, and the existing
styling-boundary memory note.

- Full suite: **148 test files passed, 0 failed**, through the normal commit hook.
- Typecheck and lint passed.
- Golden regression set: **35 passed, 0 failed**.
- Benchmark validator passed, including all **53 frozen checksums**.
- Independent frozen checksum verification: **53 byte-identical files**.
- Blind encoder check: **100 fixtures, 893 originally encoded known facts**;
  manifest and fixture bytes unchanged. New adapter facts do not rewrite fixtures.
- Adapter committed and digest published before the single coverage run.
- No rule, fixture, test or adapter edits followed the coverage results.

## Scope and deviations

V1, v3.7, constants/types.ts, all 53 frozen checksum files and the blind fixture
directory are untouched. No app integration, migrations, SQL, billing, consent,
limiter or server changes. No live services or customer data are used.

Deviations: none. No device, hosted integration, stylist accuracy or gold-label
validation is claimed. Double wrapper remains a pending V1 decision.
