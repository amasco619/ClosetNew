# Phase 5C.3 Track A — Nigeria/Africa Fashion Intelligence Audit

**Date:** 2026-08-19  
**Scope:** Discovery, capability audit, and benchmark protocol only  
**Engine:** v3.7 frozen — no recommendation, schema, migration, security, auth, payment, or deployment changes

## 1. Executive summary

The current engine can represent and style many contemporary Nigerian/African garments when they are accurately labelled with the existing generic taxonomy. In particular, `wax-print`, `lace`, `traditional-event`, pattern scale, fabric, formality, color, and weather fields are already available.

It is **not yet defensible to claim Nigeria/Africa-ready recommendation or classification**. The remaining evidence gap is not a new score weight: it is independently authored, Nigerian-fashion-expert gold labels and a labelled image set. This phase therefore creates the required 100-case benchmark protocol but deliberately does not run a self-authored “truth” set and present it as independent validation.

## 2. Pipeline trace

| Stage | Current behavior | Information retained | Evidence / limitation |
|---|---|---|---|
| Upload | User selects/captures image, pre-generates item ID, uploads original and cleaned image | Durable storage path and item ID | Photo persistence is separate from cultural interpretation. |
| Background removal | Server-side PhotoRoom call, entitlement/rate-limit guarded | Clean garment image | Does not add garment context. |
| Classification | Gemini returns category, subtype, color, fabric, pattern, scale, fit, neckline, sleeve, rise, warmth and confidence | `wax-print` is a supported pattern; `lace` is a supported fabric | No Nigerian-labelled image evaluation currently exists. |
| Taxonomy | Seven categories, bounded subtype lists, `traditional-event` occasion | Form, fabric, pattern, basic occasion/formality | Ceremonial construction, co-ord identity, embellishment, and cultural dress code are absent. |
| Storage | Wardrobe item persists category, subtype, occasion, pattern, fabric and related metadata | Core styling signals | DB hydration of older rows is intentionally conservative; legacy items can lack newer signals. |
| Candidate generation | Hero-seeded dress or top+bottom cores plus required shoes | Scenario, formality, weather, constraints | Only fixed app scenarios can be generated. |
| Hard constraints | Season, user constraints, weather, rain, formality, pattern overload and silhouette gates | Safety/appropriateness boundaries | No explicit Nigerian regional climate or ceremony code. |
| Scoring/ranking | Scenario affinity, formality, profile, palette, texture, pattern safety and completeness | General styling quality | Cultural relevance is represented only through tags/formality, not an independent ranking dimension. |

## 3. Taxonomy audit

| Garment/context | Existing representation | Adequate? | Finding / proposed future experiment |
|---|---|---:|---|
| Ankara / African wax print | Any garment category + `wax-print` + scale | Mostly | Large-scale print receives existing hero-pattern protection. Verify classifier accuracy with labelled images. |
| Lace / aso-ebi | Existing garment type + `lace` fabric + `traditional-event` | Mostly | Fabric and occasion are representable; embellishment and coordinated group identity are not. |
| Aso-oke / brocade | Existing garment type + cotton/synthetic/weight approximation | Partial | Woven structure and ceremonial significance are unavailable. Test whether generic fabric proxy harms ranking. |
| Kaftan | `dress` / `kaftan` | Yes | Direct representation, but formality ranges from casual to ceremonial and needs accurate metadata. |
| Boubou | `kaftan` or `gown` | Partial | Flowing ceremonial silhouette is approximated, not represented. |
| Iro / wrapper | `bottom` / `midi-skirt` or `maxi-skirt` | Mostly | Wrap construction is unavailable but not necessarily score-relevant. |
| Buba / senator/native wear | `top` / `blouse` or `shirt` | Partial | Generic subtype loses cultural construction and ceremony context. |
| Agbada | No faithful current representation | No | Voluminous, layered ceremonial menswear is a taxonomy/target-user decision, not a scoring defect. |
| Gele / ceremonial accessories | Jewelry/accessory approximation only | No | No headwear/ceremonial-accessory representation. |
| African-Western fusion | Existing categories plus pattern/color/formality | Yes, when accurately labelled | No rule forces African wear to be traditional-only. |

## 4. Ankara / wax-print findings

- A single large `wax-print` with solid supports follows the existing hero-pattern path and is rewarded.
- Two competing large patterns are penalised; this is desirable for the benchmark’s pattern-overload cases.
- `wax-print` itself is not a boldness criterion: boldness is currently driven by large scale, animal, or floral. A small/medium wax print can therefore lose visual-weight recognition.
- A matching Ankara two-piece has no explicit co-ord signal. It can be generated, but its shared set identity is not separately rewarded.

**Diagnosis:** B (representation/classification) for absent scale or co-ord identity; E (ranking) only if expert labels show the existing generic pattern rules mis-rank a fully represented item.

## 5. Occasion, climate, and cultural-context findings

The app vocabulary can approximate Sunday church, naming ceremony, birthday, business meeting, brunch, date, and wedding via `work`, `casual`, `brunch`, `event`, `wedding`, and `traditional-event`. It cannot express distinctions such as traditional wedding guest vs. Western black-tie, aso-ebi participation, church formality, or creative-business dress code as first-class scenarios.

Weather correctly blocks rain-averse sandals, espadrilles, and wicker bags. Outerwear is required only below 12°C, suppressed when the low is above 18°C *and* the high is above 24°C, and optional between those bands. The season calendar is still Northern-hemisphere; humidity, harmattan, and regional climate are not modelled.

**Diagnosis:** B for missing occasion/context data; C/D only if the benchmark shows an adequately represented garment is not generated or is hard-eliminated; E for a generated but incorrectly ordered garment.

## 6. Benchmark dataset and integrity controls

`docs/recommendation/phase53-african-benchmark-v1.md` defines the 100 required cases before any Track A engine run:

- 40 garment-understanding cases
- 30 outfit-compatibility / competitive-set cases
- 20 occasion cases
- 10 weather/context cases

Every record carries a scenario ID, garment attributes, cultural context, mapped current app scenario, weather, pre-authored expected compatibility/ranking, and rationale. Labels are intentionally separated from production code and must be signed off by an independent Nigerian-fashion stylist before execution.

**Why execution is deferred:** assigning gold labels ourselves after inspecting engine logic would violate the phase’s independent-scoring rule. This is a Product Owner/stylist evidence blocker, not a defect to work around with synthetic “pass” metrics.

## 7. Systematic-bias assessment

| Question | Current evidence | Status |
|---|---|---|
| Western-default bias | No cultural-origin score exists; ranking uses metadata rather than origin. | Unproven; benchmark required. |
| Pattern bias | Large wax-print + solid ground is handled favorably; competing large patterns are penalised. | Partial pass; test scale edge cases. |
| Formality bias | `traditional-event` shares the wedding formality band. | Context-blindness risk. |
| Material bias | Generic texture rules can outweigh cultural ceremony context because no such signal exists. | Hypothesis; benchmark required. |
| Completeness bias | Accessories receive a completeness bonus independent of cultural appropriateness. | Hypothesis; benchmark required. |
| Silhouette bias | Generic fit/subtype logic does not model agbada/boubou/gele construction. | Confirmed representation limit. |

## 8. Hypotheses — not implemented

| Hypothesis | Evidence | Proposed experiment | Success / regression guard |
|---|---|---|---|
| Missing cultural occasion context causes ranking errors | Fixed scenario vocabulary and wedding-equivalent traditional-event band | Compare expert ranks for traditional wedding vs. Western formal cases with identical wardrobes | Higher African benchmark accuracy; zero existing golden-set regression |
| Scale-free wax print underweights visual hierarchy | Boldness does not check `wax-print` directly | Compare small/medium/large wax-print expert labels | Improve affected cases without suppressing ordinary small prints |
| Co-ord identity is lost | Top/bottom are independently scored | Test matching two-piece sets vs. visually competing combinations | Better pairwise accuracy without global completeness inflation |
| Generic seasonal rules misfit Nigerian evenings | Northern-hemisphere season table and outerwear thresholds | Test Lagos/Abuja/Kano conditions on device-realistic wardrobes | Fewer weather false negatives; no rain/true-cold regression |

## 9. Production-safety confirmation

- Recommendation Engine v3.7: **not modified**
- Existing golden set: **not modified**
- Scoring/ranking/candidate generation/constraints: **not modified**
- RLS, Storage, entitlements, authentication, payments, secrets: **not modified**
- Migrations: **none created or executed**
- Deployment, EAS build, store submission: **none**
- FASH API: documented architectural constraint only; **no code, credentials, or dependency added**

## 10. Next track

1. Product Owner appoints an independent Nigerian-fashion stylist/reviewer and approves the pre-authored labels.
2. Collect a consented/licensed labelled garment-image set for classification evaluation.
3. Run the frozen engine against the signed benchmark and existing golden set, report category metrics and failures.
4. Classify any confirmed failure as taxonomy, classification, candidate generation, constraints, ranking, external AI limitation, or no change — then seek explicit approval before modifying production behavior.