# Amodka — Nigerian Styling Layer: Design Proposal

**Status:** Proposal only. No application code, database, migration, benchmark fixture, or
Recommendation Engine v3.7 file was changed.

## Purpose and boundaries

This proposal adds room for Nigerian garment vocabulary and explicit cultural context
without treating a garment name, print, or set relationship as proof of a wearer's
identity or an event's dress code. It is a design, not a claim that there is one
Nigerian styling rule.

The existing gold-label guidance already separates garment type, fabric, pattern,
cultural context, occasion, formality, construction, and coordination identity
(`docs/recommendation/africa/benchmark-v1/gold-label-schema.md:31-48`). Keep these
dimensions distinct in product data and recommendation logic.

**Do not infer** regional or ethnic identity, religion, gender, ceremony role, aso-ebi
participation, fabric authenticity, event dress code, or required headwear from an image,
garment name, pattern, or matching colour. Use explicit user-provided context or an
authoritative confirmed relationship. When that evidence is missing, return an honest
unknown or ask the stylist/user; do not silently substitute a Western garment label.

## 1. Vocabulary gaps and change surface

### What the current schema already represents

The classifier has a small set of Nigerian/African identifiers: `buba`, `iro`,
`wrapper`, `iro-and-buba`, `aso-ebi`, and `boubou`; it also accepts `gele`, `headwrap`,
`head-scarf`, `structured-headpiece`, and `stole`
(`server/classify-garment.ts:397-431`). Its prompt distinguishes Ankara/wax-print as a
pattern from silhouette and warns against guessing fabric from motif
(`server/classify-garment.ts:716-724`). These are real foundations, but they are
currently forced into generic slots: for example, `iro-and-buba` and `aso-ebi` sit under
`dress`, and headwear sits under `jewelry`.

`WardrobeItem.subType` is a string, but its broad `ItemCategory` is restricted to top,
bottom, dress, outerwear, shoes, bag, and jewelry. The typed `Fabric` and `Pattern`
unions are also limited (`constants/types.ts:6-7,19-21`; `WardrobeItem`:
`constants/types.ts:87-133`). The classifier's runtime allowlists are separate from
those TypeScript definitions (`server/classify-garment.ts:395-450`). Adding a value in
only one place would therefore be incomplete.

### Candidate coverage gaps

| Term or concept | Current coverage | Proposed representation to review |
|---|---|---|
| Agbada | No dedicated subtype or role | Preserve `agbada` as garment identity; model its robe/overlay role separately from base garments. Exact construction and whether a particular image is a complete outfit: **NEEDS STYLIST REVIEW**. |
| Senator wear | No dedicated subtype | Keep the term as garment identity. A tunic/shirt and trousers may be separate garments or a coordinated pair; do not assume either from the label. Classification and composition rules: **NEEDS STYLIST REVIEW**. |
| Dashiki | No dedicated subtype | Preserve the term and record cut/length separately. Whether a given piece occupies top, tunic, or one-piece roles depends on the actual garment: **NEEDS STYLIST REVIEW**. |
| Adire | Not a supported fabric or pattern value | Do not force it into `wax-print`. Capture the user's/reviewer-confirmed textile or dye identity separately from visual pattern and material. Exact field semantics: **NEEDS STYLIST REVIEW**. |
| Aso-oke | Not a supported fabric value | Add a textile-identity dimension rather than treating it as a garment type or assuming fibre content. Whether it is appropriate for a particular ceremony: **NEEDS STYLIST REVIEW**. |
| Caps, including fila | `sunhat` exists; no general cap or culturally specific cap identity | Add headwear identities and a headwear slot separate from jewelry. Cap names, regional naming and pairing expectations: **NEEDS STYLIST REVIEW**. |
| Belts | No belt subtype or accessory slot | Add a waist-accessory identity/role, not a jewelry subtype. Styling effects and compatibility rules: **NEEDS STYLIST REVIEW**. |
| Additional Nigerian and West African garments/textiles | Partial and uneven | Collect terms from qualified stylists and users before expanding the controlled vocabulary. Do not infer a region from the term alone. |

“Adire” and “aso-oke” are intentionally not assigned a material, construction, or
occasion by this proposal. The benchmark schema calls for those to be independently
recorded rather than collapsed (`gold-label-schema.md:35-48`).

### What a production taxonomy addition would touch

1. **Canonical types and persistence mapping:** `constants/types.ts`,
   `lib/wardrobeSemantics.ts`, and `lib/database.ts`. The database currently stores
   `sub_type` as text, but `fabric` and `pattern` have database checks and save-RPC
   allowlists (`supabase/migrations/20260929000000_wardrobe_garment_metadata.sql`;
   `supabase/migrations/20261012000000_canonical_wardrobe_semantics.sql`). A new
   structured field or expanded checked value needs a reviewed forward migration and
   matching RPC allowlist; a text subtype alone may not need a column migration, but
   still needs validation and persistence tests.
2. **Classification boundary:** single- and multi-item prompt contracts, server
   allowlists, normalisation/aliases, output validation, refusal cases, and classifier
   tests (`server/classify-garment.ts`, `server/classify-multi-item.ts`). Preserve unknown
   terms and do not map a new word to a Western subtype merely to pass validation.
3. **User correction and display:** add-item/manual edit controls, bulk review,
   wardrobe labels, accessibility labels, and edit/save round-trip tests. A user's
   explicit correction must remain authoritative.
4. **Recommendation interpretation:** category-based candidate buckets, subtype rules,
   fabric inference, formality, pattern handling, layering, weather and explanation
   rendering currently live across `constants/outfitRotation.ts`,
   `constants/outfitScoring.ts`, and related helpers. New cultural rules belong in the
   isolated versioned layer described below, not in v3.7.
5. **Relationship semantics:** existing group types distinguish `coordinated_set`,
   `multi_item`, and `layered`, with `ai_inferred`, `user_confirmed`, and `user_rejected`
   confirmation states (`constants/types.ts:135-163`). Keep these relationship facts
   distinct from individual garment facts.
6. **Compatibility and tests:** legacy rows with no new fields remain unknown, not
   negatively scored. Test old-item hydration, user edits, RPC round trips, deterministic
   output, and benchmark coverage before enabling the new layer.

## 2. Garment roles and outfit slots

### Proposed model

Keep **identity**, **role**, **construction**, **textile identity**, and **relationship**
as separate concepts:

- `garmentIdentity`: canonical garment term, e.g. `buba`, `iro`, `agbada`, `dashiki`.
- `visualCut`: observable form/length/sleeve/silhouette, nullable when not clear.
- `stylingRoles`: one or more slot claims such as `base_top`, `base_bottom`,
  `one_piece`, `layer`, `headwear`, or `accessory`. Each role is evidence-backed and may
  be unknown.
- `wearPosition`: a precise placement such as `head`, `waist`, `shoulder`, or `neck`;
  do not overload the broad category for this.
- `textileIdentity`, `material`, `pattern`, and `construction`: separate fields with
  independent confidence/source. A textile name does not prove fibre content or
  hand-made construction.
- `relationship`: existing confirmed/inferred group membership. It does not change a
  member's garment identity or automatically make every set member mandatory.

This can be a versioned semantic projection first; it should not be written back to
canonical wardrobe facts unless the user or a qualified reviewer confirms the value.
Unknown is a valid result.

### Proposed role map

The entries below are role hypotheses for modelling, not universal outfit instructions.
Where the exact construction changes the role, **NEEDS STYLIST REVIEW**.

| Garment / item | Likely role slot(s) | Important distinction |
|---|---|---|
| Buba | `base_top` | Existing classifier supports `buba` as a top subtype. Do not infer matching iro or ceremony context. |
| Iro / wrapper | `base_bottom` | Existing classifier supports these under bottom. Keep wrapper identity separate from a scarf, sash, or stole. |
| Iro-and-buba | `base_top` + `base_bottom` as a composite relationship, or one stored composite item | Which representation is correct depends on how it is photographed/saved. **NEEDS STYLIST REVIEW** before treating it as an indivisible one-piece. |
| Gele | `headwear`, position `head` | Existing classifier calls it jewelry; the proposed role layer corrects the slot interpretation without changing identity. Whether to recommend it for an event: **NEEDS STYLIST REVIEW**. |
| Agbada | `layer`; possibly an outfit-anchor/one-piece presentation | Do not assume which inner garments are included or required. Construction and composition: **NEEDS STYLIST REVIEW**. |
| Senator wear | `base_top` and `base_bottom` if the photographed pieces are separate; confirmed set relationship only when supported | “Senator” does not itself prove a matching pair or a required shirt/trouser combination. **NEEDS STYLIST REVIEW**. |
| Dashiki | `base_top`, `one_piece`, or another role according to cut | Do not assign a role from the name alone. **NEEDS STYLIST REVIEW**. |
| Printed Western-cut garment | Role follows its cut: top, bottom, one-piece, or layer | “African print” describes textile/pattern context, not silhouette, formality, or cultural identity. |
| Cap / headwrap / gele | `headwear`, with specific wear position | Do not classify as jewelry merely to fit the current category enum. Pairing rules: **NEEDS STYLIST REVIEW**. |
| Belt | `accessory`, position `waist` | A belt may be functional or decorative; do not assume either from colour or outfit. |

The role layer must allow a look to contain one base top, one base bottom, or one
one-piece garment, with optional layers and accessories. These are structural slots, not
rules that every outfit must fill. Explicitly confirmed multi-piece outfits can represent
composite construction; absent that evidence, do not fabricate missing garments.

## 3. Occasion matrix

This matrix sets safe product boundaries, not Nigerian dress rules. **No universal
garment, colour, headwear, fabric, or set requirement is asserted below.** A specific
invitation, host/family instruction, workplace dress code, user preference, or confirmed
role is stronger evidence than a general label. Every culturally specific expectation
below is **NEEDS STYLIST REVIEW** before it becomes an automated rule.

| Occasion | Required | Allowed | Clear mistake | Review status |
|---|---|---|---|---|
| Owambe | Only an explicit invitation or user-selected requirement. Aso-ebi participation is required only when the user confirms it and authoritative set data identifies the required pieces. | Traditional, contemporary, or mixed looks when consistent with the user's stated brief. | A confirmed contradiction of the stated dress code or the user's explicit constraint. No garment is a universal mistake based on “Owambe” alone. | **NEEDS STYLIST REVIEW** for dress intensity, host/guest roles, aso-ebi conventions, headwear, colour and regional variations. |
| Church | Only the user's/congregation's stated dress code. | Any look the user says suits their community and comfort. | A direct conflict with the known dress code or user's own coverage/comfort constraint. No universal head-covering or modesty rule is assumed. | **NEEDS STYLIST REVIEW** for denomination, service, region, role, coverage and headwear norms. |
| Naming ceremony | Only family/host instructions or an explicitly stated role. | Traditional, Western, or mixed attire that fits the user's brief. | A direct conflict with explicit instructions; no garment is declared inappropriate from the event name alone. | **NEEDS STYLIST REVIEW** for family, regional, religious and role-specific expectations. |
| Funeral | Only explicit family/community instructions and the user's confirmed role. | Options consistent with those instructions and the wearer's comfort. | A known conflict with the stated mourning/dress instruction. Do not infer a forbidden colour or style from “funeral”. | **NEEDS STYLIST REVIEW** for mourning conventions, community, religion, family role and colour meaning. |
| Traditional wedding | Only the invitation, host instruction, or user's confirmed participant role. | Traditional, contemporary, or mixed choices consistent with that context. | A direct conflict with a known dress code or a confirmed required-set instruction. | **NEEDS STYLIST REVIEW** for region, ceremony stage, couple/family expectations, role, aso-ebi and headwear. |
| Wedding guest | Only the stated invitation/host requirements and user's role. | Any look consistent with those requirements and user preference. | A direct dress-code conflict; do not apply a universal colour ban or outfit formula. | **NEEDS STYLIST REVIEW** for host-specific colour rules, ceremony type, region and role. |
| Work with African print | The workplace's stated dress code and the user's practical constraints. | African-print and Western-cut pieces, alone or mixed, where the user considers them suitable. Print alone does not determine formality. | A direct dress-code or functional conflict, not the mere presence of print. | **NEEDS STYLIST REVIEW** for sector- and workplace-specific expectations. |

Until a reviewer approves a rule for a precisely described context, the product should
show an option or ask a question rather than label a culturally uncertain choice a
mistake. A user-selected “traditional” context authorises African-first recommendations;
it does not establish ethnicity, a specific ceremony, or required pieces.

## 4. Mixed looks, headwear, print, and coordinated sets

### African-print and Western pieces

- Evaluate each garment's role from its cut and each textile/pattern attribute separately.
- Allow mixed looks; neither “all traditional” nor “one African-print statement plus
  Western basics” is a universal rule.
- Do not infer formality, occasion suitability, authenticity, or cultural identity from
  wax-print alone.
- Any learned preference for mixing should be user-specific or backed by independent
  stylist labels, not encoded as a default cultural norm.

### Headwear

- Model headwear as its own `headwear` role and preserve the specific identity where known.
- Never add a gele, cap, or headwrap automatically because the occasion is traditional.
- A recommendation may surface optional headwear only when it is owned or explicitly
  requested and the user has supplied relevant context. Whether it pairs with a given
  outfit/event is **NEEDS STYLIST REVIEW**.
- If the system cannot judge the cultural pairing with evidence, explain that limitation
  rather than declaring a mismatch.

### Print with print

- Keep motif, scale, visual weight, and textile identity distinct.
- Same-fabric pieces may be deliberately coordinated; different prints may also be
  intentional. Neither matching nor contrast is a universal success rule.
- Current v3.7 has generic print-safety scoring (`constants/outfitScoring.ts`, pattern
  interaction section around lines 1089-1128). Do not reinterpret its score as a
  culturally authoritative rule. The proposed layer must be separately versioned and
  evaluated against stylist labels before influencing ranking.
- Do not equate adire with Ankara/wax-print or Kente with wax-print. When the relevant
  visual or material distinction is unclear, keep it unknown.

### Aso-ebi and coordinated sets

- Aso-ebi is a coordination/context signal, not a garment shape or proof that an item is
  part of a particular event's set. Ask the user to confirm participation and which pieces
  are required.
- Use authoritative group membership and confirmation status, not shared names, colours,
  motifs, or classifier guesses. Existing code distinguishes `coordinated_set`,
  `multi_item`, and `layered`; `coordinatedCandidateScopes` pins only complete,
  user-confirmed coordinated sets
  (`lib/stylingRelationships.ts:19-70`).
- Do not make set members globally all-or-none. A confirmed set can be worn separately
  outside a context in which the user or event requires the complete set.
- Never infer set membership from cultural association. Existing project guidance makes
  this explicit (`.agents/memory/styling-boundary-authority.md:6-17,30-40`).

## 5. Versioned architecture beside v3.7

### Proposed boundary

Create an independently versioned styling layer, for example
`lib/nigerianStyling/v1/`, with pure TypeScript modules:

1. **`types.ts`** — versioned role, context, evidence, finding, and result types.
2. **`evidence.ts`** — maps canonical `StylingWardrobe`, explicit scenario/context and
   authoritative relationship records into evidence. No defaults, provider calls, or
   cultural inference.
3. **`rules.ts`** — deterministic, narrow rules whose source and review status are
   recorded. Unreviewed or unsupported context yields `needs_more_context`/`not_judged`,
   never an invented negative.
4. **`evaluate.ts`** — shared evaluator for candidate looks. It returns findings and
   evidence IDs, not a hidden mutable score.
5. **`recommend.ts`** — candidate composition/ranking adapter, enabled only for contexts
   and rules that have passed review and benchmark gates.
6. **`version.ts`** — immutable version identifier (for example `nigerian-styling-v1`).

Do not edit `constants/outfitRotation.ts`, `constants/outfitScoring.ts`,
`constants/outfitGenerator.ts`, or the v3.7 golden set. The app already has a
canonical-to-styling boundary and a separate traditional adapter
(`lib/stylingWardrobe.ts:37-72`; `lib/traditionalStyling.ts`). The new layer should
consume that boundary and leave the `v37Items` compatibility snapshot untouched.

### Shared use by recommender and Check my look

- Both call the same `buildStylingEvidenceV1()` and `evaluateLookV1()` functions with the
  same normalized context. This avoids one screen treating a set or role differently.
- The recommender begins with existing v3.7 candidates. The adapter may add/recompose
  candidates only from owned items and authoritative relationships; it must not invent an
  item. Any cultural score adjustment remains disabled until reviewer labels justify it.
- Check my look applies the same evidence and reviewed rules. It can return
  `not_judged` when required facts are absent; it should not expose a confidence score
  that implies cultural authority.
- The versioned result should include `stylingLayerVersion`, `status`,
  `findings[]` with stable rule IDs and evidence IDs, plus deterministic output order.
  UI copy is rendered separately from the findings.

### Determinism and testability

- No LLM, network request, wall-clock time, randomness, or database read inside the
  evaluator. All external facts are explicit input.
- Sort by fixed rule priority, then stable item IDs; tie-break candidate rankings with a
  deterministic fingerprint.
- Preserve unknowns as unknown. A missing field must not add a penalty.
- Unit tests cover each rule's positive, negative, missing-evidence and contradictory
  evidence cases; property tests cover input-order invariance where order is not semantic.
- Golden tests pin the v3.7 output and confirm it is byte-for-byte unchanged. New-layer
  tests and benchmark results are versioned separately.
- Feature-flag/rollout is limited to explicit contexts; log the layer version and rule IDs,
  not sensitive cultural identity or raw personal details.

### Enablement gate

Keep culturally specific ranking changes off until: a qualified independent stylist has
reviewed the exact rule text; a benchmark is signed and locked before system output is
shown; the new layer has acceptable outcome and disagreement results; and the existing
v3.7 regression suite remains green. A product label such as “traditional” is intent, not
evidence for an unreviewed rule.

## 6. Template for a stylist-labelled benchmark of 100 looks

### Study shape

Use **25 scenarios × 4 candidate looks = 100 labelled looks**. Suggested scenario
coverage: Owambe (4), church (4), naming ceremony (3), funeral (3), traditional wedding
(4), wedding guest (4), and work with African print (3). This is a coverage plan, not a
claim about how common or representative any event is. Across the scenarios, include
mixed African-print/Western looks, headwear choices, print-with-print, confirmed
coordinated sets, incomplete sets, and contexts where the available evidence is
insufficient. Cases can overlap categories.

### Blank scenario and look record

```yaml
scenario_id: NG-SC-__
occasion_label:                         # one of the seven requested contexts
brief_source: user-provided | invitation-provided | benchmark-synthetic
explicit_dress_code: null
wearer_role: null                       # only if explicitly provided
region_or_tradition: null               # optional; never infer
weather_context: null
user_constraints: []
context_confidence: reviewer-recorded

looks:
  - look_id: NG-LOOK-___
    owned_item_ids: []
    items:
      - item_id: ITEM-__
        reviewer_garment_identity: ""
        observed_cut_and_roles: []
        textile_identity: null
        material: null
        pattern_and_scale: null
        construction: null
        source_or_confidence: ""
        relationship_id: null
        relationship_type: null
        relationship_confirmation: null
    stylist_assessment:
      acceptable: null                   # acceptable | not_acceptable | depends
      rank_within_scenario: null
      check_my_look_state: null          # works | needs_adjustment | not_judged
      required_changes: []
      rationale: ""
      uncertainty_notes: ""
      reviewer_confidence: low | medium | high
      needs_stylist_review: false
```

### Label process and evaluation

- Recruit an independent Nigerian fashion stylist with relevant experience for the
  represented contexts. Recruit additional reviewers for traditions or regions outside
  that expertise. Store qualifications privately, not in source control.
- Reviewers see the scenario and candidate looks only. They must not see v3.7 output,
  scores, developer opinions, or another reviewer's labels before signing.
- Keep reviewer-authored identity, role, occasion suitability, acceptance, ranking,
  rationale, confidence, and uncertainty separate from developer mapping and system output.
- Have a second independent stylist review at least 20% (20 looks), deliberately covering
  all seven contexts. Report disagreements; do not silently resolve them by majority.
- Include provenance/licensing for every image and use synthetic or expressly consented
  images only. No customer wardrobe photos without explicit benchmark consent.
- Lock signed labels and record hashes before running either the v3.7 baseline or the
  new layer. Keep input, gold labels, engine output, and evaluation in separate locations,
  following the existing benchmark governance (`benchmark-v1/governance.md`).
- Report top-choice agreement, acceptable-look precision/recall, pairwise ranking
  agreement, `not_judged`/abstention rate, and disagreement by context and capability.
  Do not claim broad cultural accuracy from 100 looks; document sample limits and reviewer
  scope.

## Risks and open questions

1. **Reviewer coverage:** Which Nigerian regions, communities, diaspora contexts, and
   garment traditions are in scope for the first release? One stylist cannot stand for
   all.
2. **Gender scope:** Current benchmark v1 is women's-fashion evidence. Is this layer
   initially limited to that scope, or should a separately reviewed scope be prepared?
3. **Terminology authority:** Which qualified stylists and users validate the preferred
   spelling, aliases, cut distinctions, and regional names for agbada, senator wear,
   dashiki, adire, aso-oke, fila, and other terms?
4. **Privacy and sensitivity:** Should a user ever store cultural/community context, or
   should it remain a transient occasion preference? Avoid collecting identity when a
   one-time styling brief is enough.
5. **Source of certainty:** Which facts can the user confirm, which may be classifier
   suggestions, and which must remain stylist-only? Never promote a model guess to
   canonical truth.
6. **Persistence:** Can the initial role layer be derived transiently? If a durable
   textile identity or role field is needed, agree on migration, save-RPC allowlists,
   RLS-compatible access, legacy defaults, and explicit user correction semantics first.
7. **Evaluation power:** Four candidates per scenario and 100 looks support a bounded
   first comparison, not broad demographic claims. A larger or multi-reviewer study may
   be needed before high-impact occasion rules.
8. **Product behaviour when uncertain:** Should the app ask a short context question,
   offer neutral owned-wardrobe alternatives, or return `not_judged`? This should be
   tested with users and reviewed before copy is final.
9. **Relationship intent:** Who confirms that an item is required for a particular
   event? Confirmed set membership alone must not encode event attendance or a dress
   code.
10. **Fallback:** What should happen when the new layer has no applicable reviewed rules?
    Proposed default: preserve existing v3.7 behaviour and clearly separate it from
    culturally reviewed guidance.

## Deviations

- No code, configuration, migration, database, benchmark fixture, frozen file, or
  Recommendation Engine v3.7 file was changed.
- All role assignments and occasion-specific cultural expectations in this proposal are
  hypotheses; ceremony-specific rules are marked **NEEDS STYLIST REVIEW**.
- Repository contents and cited source files were inspected; live Supabase state,
  external cultural authorities, and physical-device behaviour were not verified.
