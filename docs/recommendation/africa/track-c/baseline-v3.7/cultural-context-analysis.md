# Cultural-Context Analysis

## Focused cultural slice

The 16-case traditional/cultural slice achieved 56.3% top-1, 100.0% top-3, and 6.0 mean regret. Every reviewer-preferred candidate remained within the top three.

## Strengths

- Correct traditional/weather selections in WX-02 and WX-10 show that rain-safe accessory constraints can coexist with traditional-event suitability.
- OR-02, OR-05, OR-23, OR-27, OC-01, OC-08, and OC-20 were top-1 correct.
- Focused Ankara pairing performance was stronger than overall weather performance.

## Gaps

### Cultural identity can lose to generic formality or Western-default combinations

- **Evidence:** OR-01 chose an ivory lace gown over the aso-ebi Ankara kaftan; OR-17 chose white blouse/black trousers over the matching Ankara set; WX-09 chose jeans for a Nigerian community event in London.
- **Affected cases:** OR-01, OR-17, WX-09
- **Likely mechanism:** Scenario tags and generic formality/cohesion features cannot fully express aso-ebi compliance, matching-fabric identity, or diaspora cultural intent.
- **Confidence:** High for these cases.
- **Potential hypothesis:** Add isolated cultural-context signals in an experimental branch and compare both Track C and the existing v3.7 regression baseline.


### Traditional garment terminology is underrepresented

- **Evidence:** Production rejected gele/headwear and a wrapper, and mapped buba, iro, grand boubou, and Kente stole to generic Western-oriented subtypes.
- **Affected cases:** GU-11, GU-16, GU-17, GU-21–GU-24, GU-32–GU-40
- **Likely mechanism:** Taxonomy coverage and classifier guardrails are narrower than the benchmark’s Nigerian/African garment space.
- **Confidence:** High.
- **Potential hypothesis:** Run a taxonomy-only coverage study before changing ranking weights.


## Limitation

These findings reflect one qualified reviewer’s gold labels. IRR was not performed, and this benchmark does not represent all Nigerian women or all regional/religious traditions.
