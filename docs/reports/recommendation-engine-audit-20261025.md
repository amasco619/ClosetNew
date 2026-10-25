# Amodka Recommendation Engine v3.7 — Read-only audit

**Date:** 25 October 2026  
**Scope:** Static source/document review plus deterministic local synthetic runs. No application, engine, test, configuration, database or benchmark files were changed. No database or provider calls were made.

## Executive summary

Recommendation Engine v3.7 has substantial deterministic styling logic: palette and contrast scoring, pattern scale, formality, fit/proportion, fabric texture, weather gates, wear history, reactions, hero diversity and daily rotation. The app also has a separate Traditional-context adapter that can preserve a user-confirmed coordinated set.

The most consequential evidence gaps are not “no styling logic”; they are the limited benchmark generation support, missing or coarse Nigerian garment/occasion representation, no humidity signal, no general chosen-outfit checker, and scenario tags that influence ranking without being a universal hard eligibility gate. The synthetic runs demonstrate that distinction: a kaftan tagged for casual/resort/travel/brunch still appeared in the Active pool, and an outfit tagged outside Work appeared in a Work pool. These are deterministic synthetic examples, not measured real-user rates.

The frozen Track C baseline reinforces the generation concern: 17 of 60 context cases had an empty production pool, exact generated fingerprints covered 29 of 232 benchmark candidates, and weather top-1 agreement was 30%. Fixed-candidate ranking and full-pool generation are different metrics and must not be conflated.

## A. Architecture and status

### Version, files, signals and pipeline

The version constant is `3.7` (`constants/recommendationVersion.ts:1-12`). The main pipeline is:

1. `contexts/AppContext.tsx:2333-2365` selects the active wardrobe, computes affinity, calls the frozen `generateOutfitPool`, and applies daily rotation. `constants/outfitRotation.ts:203-244` applies hard profile constraints and season eligibility, groups items by category, and scores each item for each scenario.
2. `constants/outfitRotation.ts:286-433` enforces a hard average-formality band and optional hard mood requirements, selects up to six distinct hero candidates, builds a dress or top-plus-bottom core, and uses fallback cores if no hero core qualifies.
3. `constants/outfitRotation.ts:444-526` requires compatible shoes for a core, may add weather-required outerwear, then chooses optional bag and jewellery. `:528-605` scores the combination and applies hard rejection rules.
4. `constants/outfitRotation.ts:608-643` sorts and round-robins hero groups. `:646-749` applies freshness ordering, yesterday’s-hero diversity, cursor rotation, tier limits and cross-scenario exact-fingerprint deduplication.
5. The Home screen selects one “Today’s Pick” from ready recommendations (`app/(tabs)/index.tsx:128-139`). The Outfits screen presents occasion-specific carousel pages (`app/(tabs)/outfits.tsx:599-623, 925-987`).

The wardrobe schema supports category and subtype, colour family, optional description, occasion and season tags, formality, pattern and scale, fabric and weight, fit, metal tone, accent colour, mood, neckline, sleeve, rise, warmth, HSL/Lab colour, and classifier confidence (`constants/types.ts:87-133`). Profile inputs include style goal, body type, skin/eye/undertone, lifestyle, constraints, industry, height, contrast, hair, metal preference, life phase and weather preference (`constants/types.ts:1-73`). Wear history and reactions feed the score and freshness logic (`constants/outfitScoring.ts:1621-1681, 1684-1744`).

### Hard rules versus soft scoring

**Hard exclusions / requirements**

- Profile constraints and user season tags are applied before generation (`constants/outfitRotation.ts:218-225`).
- Core average formality must fall inside the scenario band; when a mood is supplied, the core must represent it and not contradict it (`:286-304`).
- Non-dress cores require footwear (`:444-467`).
- When weather requires outerwear, the coat must meet a warmth tolerance; rain-averse outerwear, shoes and bags are excluded (`:255-283, 315-334, 453-461, 477-514`; `constants/weatherPure.ts:18-59`).
- The completed outfit is dropped when item formality spread exceeds three, three or more large patterns appear, both top and bottom are loose/oversized, a crop top is paired with a short item, or conflicting metals violate a set preference (`constants/outfitRotation.ts:546-579`).

**Soft signals**

- Occasion tags contribute +5 and subtype affinity +3; they are not a universal hard occasion gate (`constants/outfitScoring.ts:899-907`). Colour/style-goal fit, undertone, body shape, mood, hair, metal, life phase and other profile signals add or subtract score (`:909-1014`).
- Combination scoring covers completeness, palette, formality cohesion, print pattern scale, contrast, undertone, proportion, body-type balance, silhouette, shoes/neckline and fabric/texture (`constants/outfitScoring.ts:1052-1183, 1185-1300, 1383-1616`).
- Reactions and wear history adjust rank; a recent wear is demoted, not categorically blocked (`constants/outfitScoring.ts:1621-1744`).

### Golden set and benchmark coverage

- The protected golden file is explicitly immutable and covers 17 feature sections: candidate generation, rain/cold gates, constraints, pear silhouette, cashmere versus synthetic, style-goal personalization, tonal dressing, pattern hero, leather-jacket hero/scenario, freshness, empty/single-item fallback, legitimate cold-rain empty, rotation and version (`__tests__/recommendation-golden-set.ts:1-16, 79-403`). It is a focused regression set, not a representative sample of Nigerian wardrobes, all 13 scenarios, classifier recognition, humidity, coordinated outfits, app UI or physical-device behaviour. I did not run it in this report-only audit.
- The frozen 100-case benchmark is split into 40 garment-understanding, 30 outfit-ranking, 20 occasion-distinction and 10 weather/context cases (`docs/recommendation/africa/benchmark-v1/README.md:38-44, 110-114`). It is synthetic and women’s-fashion scoped (`:70`); its frozen files and gold labels are not altered by this audit.
- Track C ran all 100 frozen cases against v3.7: 94 executed and six failed at classification/guardrail stage. In the 40 garment cases, broad category agreement was 28/32 supported (87.5%), garment type 15/40 (37.5%), fabric 26/40 (65%), pattern 19/40 (47.5%), pattern scale 11/40 (27.5%), and colour 19/40 (47.5%). For the fixed candidate comparisons, outfit-context top-1/top-3 were 50%/95%, pairwise agreement 66.3%, mean regret 7.4 and maximum regret 25. Full-generator exact-match support was 29/232 candidates; 21/60 context cases had any exact match, 17/60 had empty pools, and fallback was recorded for 0 cases (`docs/recommendation/africa/track-c/baseline-v3.7/evaluation/metrics.json:1-59`).
- Track C’s ranking results by set were OR 53.3%/96.7% top-1/top-3, OC 55%/95%, and WX 30%/90% (`evaluation/metrics.json:70-93`). The separate final report records Ankara-focused top-1/top-3 at 62.5%/100% and cultural-context top-1/top-3 at 56.3%/100% (`PHASE-5C.3-TRACK-C-FINAL-REPORT.md:43-65`; `ankara-analysis.md:5-16`; `cultural-context-analysis.md:13-35`). These are benchmark results, not estimates of all Nigerian users.
- The frozen failure analysis lists six P0 cases, including headwrap/gele/headpiece refusals, a blazer-and-trouser image refusal, a generic classification failure and a textile-strip refusal; it also identifies high-regret weather, occasion, coordinated-print and accessory-ranking misses (`failure-analysis.md:21-63`). This is evidence about the frozen execution snapshot; it does not establish how a current live provider would classify those images.
- Documentation drift: `TECHNICAL.md:2403` and the benchmark README’s status lines `:135-144` still say Track C was not run/pending, while `TECHNICAL.md:2407-2419`, the current project status and Track C final report record the completed run. No documentation was changed here.

### Documented limitations

`AMODKA-PROJECT-STATUS.md:346-384` says Track C does not justify a broad v3.7 rewrite; it recommends targeted taxonomy/representation work, records cultural classification and multi-piece gaps, and warns against wiring new categories into scoring without benchmark evidence. `:386-390` also records a windbreaker category/subtype inconsistency. Track C itself cautions that fixed-candidate diagnostics are not the same as production full generation (`:363-371`).

## B. Styling knowledge coverage

| Area | Status | Source-grounded behaviour and example |
|---|---|---|
| Colour harmony and contrast | **Implemented, partial** | Palette family, undertone and available perceptual HSL/Lab values contribute to scoring (`constants/outfitScoring.ts:1132-1183, 1486-1535`; `constants/types.ts:118-123`). It cannot recover colour relationships that the classifier did not encode correctly; Track C colour agreement was 47.5%. |
| Neutrals | **Implemented** | Black, white, grey, cream, beige and navy are treated as true neutrals for off-brief handling, and palette scoring recognizes neutral/tonal groups (`outfitScoring.ts:932-944, 1132-1183`). Synthetic example: black top, black trousers and black shoes are accepted and described as a grounded neutral base. |
| Pattern mixing | **Implemented, partial** | A single bold print on solid garments is rewarded; two matching or two large prints are penalized; large/small contrast can pass; three or more patterned items are penalized (`outfitScoring.ts:1088-1129`; hard limit in `outfitRotation.ts:553-562`). It has pattern kind/scale, not print-motif or multiple-colour semantics. |
| Formality matching | **Implemented, partial** | Scenario bands and core-average formality are hard gates; full-item spread is hard-capped at 3; combination cohesion otherwise affects score (`outfitScoring.ts:107-144, 224-226`; `outfitRotation.ts:286-294, 546-552`). A supplied item’s subtype default can override its stored formality (`effectiveFormality`, `outfitScoring.ts:214-226`), so subtype coverage matters. |
| Silhouette and proportion | **Implemented, partial** | Fit-volume balance, crop/short conflicts, body-type and height rules are scored (`outfitScoring.ts:1189-1300, 1301-1381`). These rules only act when those item/profile fields are present; missing or inaccurate fit data leaves the scorer with less evidence. |
| Layering | **Partial** | The engine may add one outerwear item, particularly under cold-weather rules (`outfitRotation.ts:255-283, 477-514`). It does not model arbitrary layer order or full traditional layer construction. |
| Shoes to formality | **Partial** | Footwear is required for generated cores, and shoe subtype/colour contributes to the score and hemline pairing (`outfitRotation.ts:444-467`; `outfitScoring.ts:1383-1484`). A shoe-specific hard occasion-formality check is not evident. Synthetic 100-piece Wedding output included a wrap dress, sandals and casual crossbody. |
| Accessories | **Partial** | Bag and jewellery are optional choices; completeness gives them score bonuses (`outfitRotation.ts:495-526`; `outfitScoring.ts:1058-1064`). Track C documented accessory overload in OR-25 (`failure-analysis.md:42, 62`). Cultural accessory sets are not generally composed. |
| Weather and humidity | **Partial; humidity absent** | Temperature thresholds decide required/optional/suppressed outerwear; rain probability ≥0.6 gates rain-averse outerwear, shoes and bags (`weatherPure.ts:18-59`; `outfitRotation.ts:255-334, 453-461`). `WeatherSnapshot` has temperatures and precipitation but no humidity, heat index or wind field (`constants/types.ts:75-85`). Lagos humidity and local rainy-season garment comfort are not scored. |
| Occasion appropriateness | **Partial** | Thirteen broad occasion tags exist, with scoring bonuses and formality bands (`constants/types.ts:6-9`; `outfitScoring.ts:899-907`). Tags are not a general hard veto: the synthetic Active pool included a kaftan whose fixture tags were casual/resort/travel/brunch, and the Work pool included a camisole tagged for dates/resort/night-out. |
| Repeat avoidance and rotation | **Implemented, partial** | Wear/reaction memory and freshness penalties influence score; rotation advances cursors, de-emphasizes yesterday’s heroes and removes exact duplicate fingerprints across scenarios (`outfitScoring.ts:1621-1744`; `outfitRotation.ts:646-749`). It reduces exact repetition but cannot promise stylistically novel looks when the active wardrobe is narrow. |
| Minimum pieces and gap diagnosis | **Implemented, partial** | A dress or top-plus-bottom core and shoes are necessary to produce a look; Home also requires shoes before treating a recommendation as ready (`outfitRotation.ts:358-467`; `app/(tabs)/index.tsx:128-139`). `diagnoseWeatherGap` is gated off whenever the engine found an outfit and uses item metadata rather than category alone (`lib/wardrobeGapDiagnosis.ts:84-121`). |
| Diversity across offered looks | **Implemented, partial** | Hero candidates are capped at six, candidates are round-robin interleaved by hero, and daily rotation diversifies yesterday’s heroes (`outfitScoring.ts:523-565`; `outfitRotation.ts:608-643, 681-684`). This diversifies focal pieces, not necessarily full palette, cultural context or outfit silhouette. |

## C. Nigerian and African outfit support

### Taxonomy and classifier vocabulary

The classifier accepts the seven broad categories top, bottom, dress, outerwear, shoes, bag and jewelry, with a finite subtype list (`server/classify-garment.ts:395-431`). Examples that are represented include:

- Ankara can normalize to generic `wax-print`; the pattern enum includes `wax-print`, and an Ankara top can use an ordinary top subtype (`classify-garment.ts:444-450, 452-474`).
- `buba` is a top; `iro` and `wrapper` are bottoms; `kaftan`, `aso-ebi`, `iro-and-buba` and `boubou` are dresses (`:397-413`).
- `aso ebi`, “iro & buba”, “grand boubou” and “caftan” have aliases (`:452-474`).
- `gele`, headwrap, head-scarf, structured-headpiece and stole are jewelry subtypes; a generic sunhat is also present (`:426-430`).

Not present as classifier subtypes are `agbada`, `senator`, `dashiki`, `aso-oke` as a textile/garment, `adire`, generic cap, or `ipele`. The “aso-oke gele” alias maps to `gele`; it does not model aso-oke as a fabric. The supported fabric vocabulary is generic and has no aso-oke/adire/Ankara material identity (`:439-450`). “Ankara” is therefore represented through a generic print/pattern pathway, not a culturally specific textile model.

### Matching sets and multi-piece composition

The single-image classifier prompt tells the classifier to treat a matching pair/coordinated worn set as one item (`server/classify-garment.ts:696-721`). A separate multi-item classifier can emit individual items and relationship records (`server/classify-multi-item.ts:18-74`); relationships include `coordinated_set`, `multi_item` and `layered` (`constants/types.ts:135-163`).

The generic v3.7 generator receives `v37Items` and does not consume those relationships (`contexts/AppContext.tsx:2344-2348`). The Traditional adapter is narrower: it loads supplied groups, and only complete, user-confirmed `coordinated_set` groups are pinned and required intact (`lib/stylingRelationships.ts:19-70, 85-105`; `lib/traditionalStyling.ts:35-48, 62-72, 94-105`). It does not infer a set from shared colour or name. The adapter does not implement an agbada recipe (robe + inner garments + cap) or a general iro/buba/gele construction rule; multi-item/layered relations are not the same as `coordinated_set`.

A local control used a user-confirmed buba + wrapper set with loafers. The Traditional adapter returned all three pieces together, demonstrating the confirmed-set path. This does not prove general v3.7 generation is relationship-aware. A raw v3.7 synthetic test with a formal core plus low-formality accessory subtypes also showed how the all-item spread hard gate can empty otherwise plausible combinations; that is a data/compatibility edge, not evidence that the Traditional adapter split the confirmed pair.

### Print, occasion and climate

- The engine can prefer one bold wax-print item against solids and reason about pattern scale; it does not reason about the Ankara print’s palette/motif as a multi-colour unit (`outfitScoring.ts:1088-1129, 1486-1535`). An optional `accentColor` exists in the item model, but there is no evidence of an occasion-specific aso-ebi colour coordination mechanism (`constants/types.ts:105-123`).
- The occasion vocabulary has broad `event`, `wedding`, `work`, `traditional-event`, etc.; it has no explicit owambe, church, traditional wedding, naming ceremony, funeral, office Friday or Eid mapping (`constants/types.ts:6-9`). “Traditional” is an app context, not a classifier category. It is explicitly premium-gated in `app/(tabs)/outfits.tsx:35-36, 613-623`; its adapter uses existing wedding/event bands (`lib/traditionalStyling.ts:74-91, 141-148`).
- Free Outfits scenarios are Work, Casual, Date · Day, Date Night, Event, Brunch and Active. Premium scenarios are Interview, Wedding, Traditional, Travel, Resort and Night Out (`app/(tabs)/outfits.tsx:35-36, 755-762`). Therefore free users may get generic Event looks, but not the Traditional or Wedding scenario pages.
- Lagos rain is partly handled through precipitation and rain-safe item filters. Hot-weather handling only suppresses outerwear at a broad temperature threshold; humidity, perceived heat, sweat/ventilation and regional climate are not modelled (`weatherPure.ts:18-59, 78-116`; `constants/types.ts:75-85`).

## D. Synthetic evidence

### Method and limits

I executed the pure local `generateOutfitPool` function against a deterministic 40-item fixture and a 100-item fixture, covering every one of its 12 scenarios for both wardrobes. No app session, live database, classifier, provider or user photo was involved. The fixtures are invented and do not represent Nigerian users or human-approved gold labels. To expose the taxonomy boundary, the 40-item fixture also supplied `senator` and `agbada` as raw synthetic subtype labels even though the current classifier does not accept those subtypes. They were not treated as canonical classifier results. A separate small relationship fixture tested a confirmed buba/wrapper set in the Traditional adapter.

All fixture items were synthetic and season-tagged `all-season`; weather was disabled for these two pool runs. The output counts below are candidate-pool sizes, not the number shown to a user after daily rotation. The rationale strings are exactly the engine-produced text. “Good / acceptable / poor” is a qualitative audit verdict, not a Nigerian stylist’s independent review. The engine’s `confidenceScore` is a ranking score, not a calibrated probability.

| Scenario | 40-item pool | 100-item pool |
|---|---:|---:|
| Work | 18 | 18 |
| Casual | 24 | 24 |
| Date · Day | 24 | 24 |
| Date Night | 10 | 12 |
| Event | 8 | 12 |
| Brunch | 27 | 18 |
| Active | 2 | 20 |
| Interview | 4 | 6 |
| Wedding | 4 | 6 |
| Travel | 17 | 21 |
| Resort | 15 | 18 |
| Night Out | 10 | 12 |

### Twenty sample outputs

| # | Fixture / scenario | Engine-selected pieces | Engine rationale | Stylist verdict |
|---:|---|---|---|---|
| 1 | 40 / Work | Black blouse; navy wide-leg trousers; black loafers; black crossbody; gold earrings | “A neutral-bridged palette, built around your navy wide-leg trouser.” | **Good** — a coherent polished neutral work look. |
| 2 | 40 / Casual | Black camisole; black leggings; black loafers; black crossbody; gold necklace | “Neutrals anchoring the colour, built around your black camisole.” | **Acceptable** — coordinated, but repetitive and less relaxed than other casual options. |
| 3 | 40 / Date · Day | Black blouse; navy wide-leg trousers; black loafers; black crossbody; gold earrings | “A neutral-bridged palette, built around your navy wide-leg trouser.” | **Good** — clean, balanced daytime outfit. |
| 4 | 40 / Date Night | Black cocktail dress; black heels; navy blazer; black clutch; gold necklace | “A grounded neutral base, built around your navy blazer.” | **Good** — cohesive evening formality; the blazer is an optional layer. |
| 5 | 40 / Event | Black cocktail dress; black heels; navy blazer; black clutch; gold necklace | “A grounded neutral base, built around your navy blazer.” | **Good** — occasion-ready, though the identical outfit also appears in other dressy scenarios. |
| 6 | 40 / Brunch | Black blouse; navy wide-leg trousers; black loafers; black crossbody; gold necklace | “A grounded neutral base, built around your navy wide-leg trouser.” | **Good** — polished brunch option, but another neutral repeat. |
| 7 | 40 / Active | Yellow kaftan; white trainers; black crossbody; gold necklace | “Neutrals anchoring the colour, built around your yellow kaftan.” | **Poor** — the kaftan is not tagged Active and is not athletic wear; the output shows occasion tags are not a hard eligibility gate. |
| 8 | 40 / Interview | Black cocktail dress; black heels; navy blazer; black clutch; gold earrings | “Neutrals anchoring the colour, built around your navy blazer.” | **Acceptable** — the pieces are formal enough, but a cocktail dress/clutch may not suit every interview. |
| 9 | 40 / Wedding | Black cocktail dress; black heels; navy blazer; black clutch; gold necklace | “A grounded neutral base, built around your navy blazer.” | **Acceptable** — formal and coherent, but no wedding dress-code or Nigerian ceremony context is modelled. |
| 10 | 40 / Resort | Black camisole; black leggings; tan sandals; tan wicker bag; gold necklace | “Neutrals anchoring the colour, built around your black camisole.” | **Poor** — leggings are not tagged Resort; no resort heat/comfort signal corrected this combination. |
| 11 | 100 / Work | Burgundy camisole; black trousers; black loafers; black crossbody; navy necklace | “A neutral-bridged palette, built around your burgundy camisole.” | **Poor** — the camisole is not tagged Work and the output lacks an office layer; colour coordination alone does not make it work-appropriate. |
| 12 | 100 / Casual | Cream blouse; black leggings; white trainers; black crossbody; navy necklace | “Quiet neutrals, built around your cream blouse.” | **Acceptable** — wearable, though it reads more like a basic errand outfit than a considered varied look. |
| 13 | 100 / Date · Day | Black camisole; indigo midi-skirt; black loafers; black crossbody; navy necklace | “Understated neutrals, built around your black camisole.” | **Good** — proportion and palette are plausible for a relaxed date. |
| 14 | 100 / Date Night | Burgundy camisole; black trousers; black loafers; white crossbody; navy necklace | “A neutral-bridged palette, built around your burgundy camisole.” | **Poor** — a casual shoe and daytime crossbody weaken the dressy brief. |
| 15 | 100 / Event | Burgundy camisole; black trousers; black sandals; white crossbody; navy necklace | “A neutral-bridged palette, built around your burgundy camisole.” | **Poor** — the camisole is not tagged Event, and the engine accepts casual sandals for this dressier scenario. |
| 16 | 100 / Brunch | Burgundy camisole; cream jeans; black loafers; black crossbody; navy necklace | “A neutral-bridged palette, built around your burgundy camisole.” | **Acceptable** — casual and coordinated, but more accessory detail than the look needs. |
| 17 | 100 / Active | White t-shirt; black leggings; white training shoes; black crossbody; navy necklace | “Quiet neutrals, built around your white training shoes.” | **Acceptable** — suitable core activewear; bag and necklace are unnecessary for exercise. |
| 18 | 100 / Wedding | Red wrap dress; black sandals; white crossbody; navy necklace | “A grounded neutral base, built around your red wrap dress.” | **Poor** — the shoe/bag read casual for a wedding; no ceremony-specific suitability check rejects them. |
| 19 | 100 / Travel | White t-shirt; navy wide-leg trousers; black loafers; black crossbody; navy necklace | “A soft neutral palette, built around your navy wide-leg trouser.” | **Good** — comfortable, versatile travel base. |
| 20 | 100 / Night Out | Burgundy camisole; black trousers; black sandals; white crossbody; navy necklace | “A neutral-bridged palette, built around your burgundy camisole.” | **Poor** — casual sandals and a white daytime bag weaken the night-out intent. |

### Poor-output ranking and user-type checks

1. **Wrong occasion/formality (highest severity):** Active kaftan (#7), Resort leggings (#10), Work camisole (#11), Date Night loafers (#14), Event sandals (#15), Wedding sandals/crossbody (#18), Night Out sandals/crossbody (#20). The underlying cause is visible in code: occasion tags are positive score signals, while the hard scenario gate is based on core formality, not a required occasion-tag match (`outfitScoring.ts:899-907`; `outfitRotation.ts:286-294, 355-433`).
2. **Cultural/set mismatch:** the standard generator does not consume group relationships. The Traditional adapter protects complete user-confirmed coordinated sets, but only on its separate Traditional path (`AppContext.tsx:2344-2348`; `lib/traditionalStyling.ts:35-48, 62-105`).
3. **Repetition / decision fatigue:** neutral combinations recur across Work, Date, Brunch and Travel in the synthetic pools. Daily rotation removes exact duplicates across the selected scenarios, but semantically similar combinations remain possible (`outfitRotation.ts:724-737`).
4. **Accessories:** some synthetic active and casual outputs add jewellery/bags because these are optional completeness bonuses; the benchmark also documents OR-25 accessory overload (`outfitScoring.ts:1058-1064`; Track C `failure-analysis.md:42`).
5. **Missing-piece failure:** if a core has no suitable shoes, the engine does not emit it; Track C found 17 empty pools across 60 context cases (`outfitRotation.ts:444-467`; `evaluation/metrics.json:50-59`). The app has a separate weather-gap diagnosis for some no-outfit cases, but it does not repair the candidate pool (`lib/wardrobeGapDiagnosis.ts:84-121`).

For user type (2), I found generation, feedback and wear-logging flows, but no dedicated feature that evaluates a combination the user assembled and warns “these chosen pieces clash” or “this is wrong for this event.” Existing reactions learn from previously generated looks; they do not constitute a pre-wear outfit checker (`constants/outfitScoring.ts:1621-1744`; `app/(tabs)/outfits.tsx` carousel/actions). This is a product gap, not an engine assertion.

### Decision fatigue

There is one clear Home recommendation: the first ready item in the rotated result is surfaced as “Today’s Pick”; the screen comment describes it as the highest-confidence ready look (`app/(tabs)/index.tsx:128-139, 401`). The Outfits screen provides scenario tabs and a carousel. Rotation returns one look per scenario/day for guests, two for free accounts and four for Premium (`outfitRotation.ts:646-656`); carousel locking mirrors two free versus four Premium looks (`lib/lookCarousel.ts:3-20`; `app/(tabs)/outfits.tsx:603-623, 960-987`). Exact repeated fingerprints are deduplicated across scenarios, and freshness/hero cursors seek variety (`outfitRotation.ts:676-737`). There is no guarantee of high semantic diversity; the synthetic runs surfaced several neutral combinations repeatedly.

## E. Ranked top 10 gaps and smallest safe rework

The “smallest rework” entries are recommendations only; nothing below was applied.

| Rank | Gap | Smallest evidence-led rework | Risk to golden / benchmark / frozen files |
|---:|---|---|---|
| 1 | Low full-pool support: 17/60 empty pools and 12.5% exact candidate generation on Track C | Create an isolated candidate-generation experiment and report pool coverage separately from fixed-candidate ranking before considering a new engine version. | **High** if production generation changes: it can alter frozen outputs. Keep v3.7 and its golden expectations untouched; do not edit frozen benchmark files. |
| 2 | Nigerian garment representation and six historical P0 classifier failures | Add separate classifier taxonomy fixtures for the missing garments/materials and have a qualified reviewer assess them before any schema/prompt work. | **High** to benchmark metrics if classification output changes; frozen inputs and labels must remain unchanged. |
| 3 | Occasion tags are not a hard eligibility gate | In a separate versioned experiment, compare a strict/tag-aware candidate filter against the current pool across all golden and Track B/C scenarios. | **High** because recommendation membership changes. No change to v3.7 or protected artifacts in this task. |
| 4 | Matching-set awareness is limited to confirmed sets in Traditional context | Prototype a relationship-aware path for explicit coordinated-set contexts; retain current generic v3.7 behaviour and compare both paths independently. | **High** if generalized into generic generation; **lower** if kept as a separate adapter, but still requires its own regression suite. |
| 5 | No humidity, heat-index or Lagos-season signal | Add synthetic weather cases first and evaluate a separate weather-policy version with locally reviewed comfort labels. | **High** to WX results if weights/gates change; existing benchmark/golden/frozen data must remain unchanged. |
| 6 | Print representation is one pattern family/scale rather than a print palette or motif | Collect optional print colour/identity signals as separate metadata; test print-plus-solid and multi-print cases without redefining frozen labels. | **Medium–high** if classifier or scoring interpretation changes; preserve the Track C baseline for comparison. |
| 7 | Formality spread can reject an otherwise useful core because accessory subtype defaults are low | Add a new targeted diagnostic test for formal core-plus-accessory combinations, then compare an accessory-aware rule in an isolated engine experiment. | **High**: changes candidate eligibility and could affect golden and benchmark rankings. |
| 8 | No user-selected outfit checker for people who assemble poor combinations | Add a separate “check my look” flow that evaluates selected owned items and explains conflicts without changing recommendation generation. | **Low for frozen engine** if strictly a new UI/adapter; do not silently change v3.7 scoring. |
| 9 | Occasion labels do not encode owambe, naming, funeral, Eid, church or office Friday | Add an explicit user-selected context mapping and test the copy/eligibility separately before connecting it to generator scoring. | **Medium** while mapping is presentation-only; **high** if it changes ranking or eligibility. |
| 10 | Variety is largely hero/cursor-based and can still feel semantically repetitive | Add a separate diversity evaluation for silhouette, palette, print, occasion and recent exposure; compare with the existing exact-fingerprint dedupe. | **Medium–high** if ranking changes. Preserve the current golden and frozen baseline; use a new versioned evaluation. |

**What can be changed without unfreezing v3.7:** independent UI/copy, explicit user feedback collection, a separate selected-look checker, new synthetic tests and a new side-by-side experiment can be developed without editing the frozen engine. Any change that changes the candidate pool, scores, ordering or canonical engine inputs must be treated as a new recommendation version and validated against—not by rewriting—the existing golden set and frozen benchmarks.

## Deviations

- The 40- and 100-item inputs were synthetic, not image-classified wardrobe records. The 40-item fixture used raw `senator` and `agbada` subtype labels as stress inputs even though the classifier does not support them; those outputs cannot be interpreted as a valid current-classifier end-to-end result.
- The confirmed-set control was a small buba + wrapper + loafers fixture, not a complete senator or agbada ensemble. I did not claim that v3.7 can construct those outfits.
- The verdicts in the sample table are qualitative audit judgements, not an independent Nigerian fashion reviewer’s labels.
- I did not run the golden set, full test suite, benchmark validator, app, device or any live provider. No live database was queried or changed.
- Only this requested report file was added. No engine, frozen artifact, test, configuration or data file was changed.
