# Nigerian Styling V2 — blind encoding, Step 3

100 description-only fixtures: S01–S25, A–D. No ratings, expected verdicts,
reviewer votes, design key or author-assigned correctness fields.
Step 4 has **not** been run.

## Source and provenance

Source: `attached_assets/Amodka_Look_Scenario_1793628651200.docx`.
Source SHA-256:

```text
ab1ca44752c0559ceee3f97955a5e2e53e5060eafda5d8674154ec1b0485cb5f
```

The document contains 25 scenarios, 100 look descriptions, and no filled
rating/reason/certainty cells. Only the scenario headings, scenario context and
look descriptions are encoded. No other look source was opened or requested.

Each `Snn-X.json` contains:

- `source.passages`: verbatim scenario title, context and look description.
  An explicitly referenced earlier description is also included when needed.
- `lookFacts`: the current LookFacts fields and the current event brief,
  with unknowns represented by `null`.
- `evidence`: JSON-pointer paths to **every non-null domain fact**, with exact
  supporting source phrases. Explicit cross-look references carry both the
  original evidence and the local “same look/gown/set” bridge.
- `gaps`: every null fact, its reason, and the rules that depend on that fact.
  These are potential data dependencies, not evaluated rule hits.

Fixture IDs and item IDs are structural identifiers, not claims about garments.
An empty evidence map entry is never used to justify a known domain fact.
No missing boolean becomes false, no missing list becomes an empty list, and
no missing V1 result becomes eligible.

## The required-input limitation

`fixture-types.ts` defines a null-aware observation envelope derived from
`LookFacts`, `ItemFacts` and `EventBrief`. This is deliberately **not** a claim
that all fixtures are complete, directly executable runtime LookFacts.

The descriptions do not supply `ItemFacts.key` booleans or V1 decisions.
All such observations remain null. In particular, V1's
`headCoveringSatisfied` must not be fabricated merely because a covering is
mentioned. No event supplies a numerical formality band either.

Before Step 4, the scoring harness must preserve these missing inputs and
abstain where necessary. The existing evaluator cannot directly accept a null
V1 result. No runtime bridge or evaluator change was made in Step 3, and no
default-key/default-eligible workaround is authorised by these fixtures.
Any inability to run a look without inventing facts must be reported, not
hidden as a correct judgement or repaired using gold labels.

## Encoding conventions

- Normalise lexical garment names only: gown → dress, blouse/shell → top,
  explicit trainers → trainer footwear. Generic jacket is **not** blazer.
- Named heel, pump, wedge, loafer, boot and mule footwear is `other` under the
  existing footwear enum. Unspecified shoes and generic sandals remain unknown
  in that enum; no flip-flop/sports-sandal subtype is guessed.
- Preserve specific colour wording: `deep red`, `bright red`, `royal blue`,
  multi-colour descriptions and `champagne` are not collapsed to inferred
  colour families. Ivory jewellery is not an ivory-coloured garment.
- Canonical textile aliases preserve stated identity: French lace →
  `lace-french`, Swiss voile → `lace-swiss-voile`, explicit premium Ankara →
  `premium-ankara`. George is not Indian George; imitated George is not George.
  Ankara trim alone does not establish the suit's textile identity.
- `poorPolyester` requires explicit cheap polyester, not shine, thinness,
  stiffness alone, a generic print or an imitation textile. No other item is
  labelled `notPoorPolyester` without an explicit supporting fact.
- “Tall” supplies height. “Small”, “wide”, “full” and “sculpted” are not
  converted to tall/notTall or lowerWider. “Several strands” is not an invented
  integer. Generic head tie is not silently gele, ichafu or a covering subtype.
- Floor-length, knee-length, above/below-knee and midi/mini use their literal
  length meanings. “Long” alone does not establish ankle/floor length.
  Sleeves, lining or a backless cut are not invented shoulder-coverage facts.
- Communities come from explicit event-community wording, never cities,
  ancestry, names or garments. Mixed Igbo/Yoruba remains unknown in the
  single-community field rather than arbitrarily choosing one.
- Work contexts map to `work`, an explicit Casual weekend to `casual`.
  Dinner, date, travel, interview, campus and daytime-party contexts use
  `other` where the current enum has no exact occasion; their original wording
  remains in the source. Night is not assigned an invented clock time.
- A past wedding purchase is not a purchase for the current church event.
  Family purchase/group assignment is not an asserted individual purchase.
- No traditional-wear intent, print-dominance judgement, garment-key flag,
  formality grade, V1 result, confirmed set membership or coverage evaluation
  is inferred from what a description might be intended to test.

## Reproduction and checksums

From the repository root:

```sh
python __tests__/fixtures/nigerian-v2-rating-set/encode.py --check
```

This validates the source digest, 25×4 completeness, exact evidence coverage,
phrase provenance, null-gap coverage and byte-for-byte reproducibility.
It does not import/run V2, read labels or write files.
Running without `--check` is the deterministic encoder; do **not** regenerate
or edit the frozen fixtures in response to scoring results.

To verify the frozen data independently:

```sh
cd __tests__/fixtures/nigerian-v2-rating-set
sha256sum -c SHA256SUMS
sha256sum SHA256SUMS
cat FIXTURE_SET_SHA256
```

`SHA256SUMS` contains exactly 100 sorted records:
`<SHA-256 of exact JSON bytes><two spaces><fixture basename><LF>`.
The fixture-set digest is SHA-256 of those manifest bytes. It binds all 100
fixtures, including their facts, evidence, original passages and gap lists.
It excludes this README, the encoder, type file and gap summary; Git commits
those supporting files separately.

See `GAPS.md` for the aggregate and scenario-specific gap inventory.
