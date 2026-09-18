# Phase B Multi-Item/Co-ord Integration — Read-Only Implementation Specification

## Executive conclusion

**Observed in current code:** Amodka’s production upload/classification pipeline assumes one independently wearable garment per image. Gemini returns one scalar classification, the client constructs one WardrobeItem, and persistence writes one wardrobe row at a time. GU-29 confirms the limitation: the classifier rejected an Ankara blazer-and-trousers co-ord specifically because the image contained multiple clothing items.

**Required by Phase A:** Multi-item relationships must remain external to WardrobeItem, using the existing production garment_groups, garment_group_members, and create_garment_group(...) infrastructure. Recommendation Engine v3.7 must continue receiving an unchanged WardrobeItem[].

**Proposed for Phase B:** Add a separate, backward-compatible multi-item classification path that returns multiple validated item classifications plus relationship metadata. Each piece becomes an ordinary, independently addressable WardrobeItem; authenticated users then persist the relationship through Phase A.

A launch-blocking architecture decision remains:

- The existing Phase A RPC atomically creates a group and its memberships only after all wardrobe rows exist.
- Current wardrobe rows are inserted independently from the client.
- Therefore, current code cannot guarantee whole-operation atomicity or idempotent recovery across image uploads, multiple wardrobe rows, and the group.
- A narrowly scoped transactional orchestration RPC or equivalent server transaction requires explicit approval before implementation. It should extend Phase A rather than redesign it.
- Storage and PostgreSQL cannot share one transaction. Deterministic object paths plus cleanup/reconciliation are still required around the database transaction.

No Phase B implementation should begin until that atomicity/idempotency boundary and the required product decisions are approved.

## Current production pipeline

| Stage | File/function | Observed in current code | Proposed Phase B impact |
|---|---|---|---|
| Camera/gallery entry | app/add-item.tsx — pickImage(useCamera) | Requests permissions. Camera returns one image. Gallery allows up to ten selected image files; multiple files route to /bulk-review. | A multi-item image is not the same as the existing multi-photo flow. Detection must not be confused with selecting several separate photos. |
| Bulk-photo entry | app/bulk-review.tsx — classifyUri, handleRetry | Treats each selected URI as one garment. Classification is staggered. Retry reruns classification for that URI. | Must remain unchanged for ordinary multi-photo uploads unless PO explicitly decides it should support multi-item results per source image. |
| Classification resize | app/add-item.tsx — pickImage; lib/bulkClassifyCore.ts — runClassifyUri | Resizes the longest edge to at most 1024px and produces JPEG base64. | Multi-item detection needs enough resolution to distinguish pieces. The 1024px ceiling should be validated experimentally, not changed speculatively. |
| Background removal | lib/photoroom.ts — removeBackground; /api/remove-background | Authenticated users call PhotoRoom. Timeout receives one retry. PhotoRoom failures return a status instead of throwing. Guests skip it. | Current output removes the background from the complete image; it does not segment individual garments. Do not assume it creates per-item derivatives. |
| PNG/JPEG preparation | app/add-item.tsx; lib/bulkClassifyCore.ts | PhotoRoom PNG is retained for upload and re-encoded as JPEG for the classifier. Failed re-encoding falls back to the original JPEG. Data URIs are not retained as wardrobe display URIs. | Multi-item classification should continue receiving a JPEG. Individual crops, if required, need a separately approved derivative strategy. |
| Classifier request | app/add-item.tsx — classifyWithServer; app/bulk-review.tsx classifier dependency | Authenticated POST /api/classify-garment with one imageBase64. | Preserve this legacy endpoint and response for single-item uploads. Prefer a separate multi-item endpoint or explicitly versioned mode rather than changing every existing caller. |
| Server routing | server/routes.ts | /api/classify-garment is protected by aiLimiter, requireAuth, and withAiLimit. | A multi-item route must receive the same authentication, quota, and rate-limit protections. |
| Gemini classification | server/classify-garment.ts — classifyGarment, GEMINI_PROMPT | Uses gemini-flash-lite-latest, with 429-only fallback to gemini-2.5-flash; 20-second timeout; JSON MIME; temperature 0.1; 512-token maximum. | Multi-item output will require a dedicated prompt and a larger bounded output budget. Do not alter the proven single-item prompt. |
| Normalization | server/classify-garment.ts — processGeminiResult | Normalizes one item, aliases taxonomy values, validates enums, clamps confidence, derives description/occasion/season/weight, and validates perceptual color. | Reuse this scalar normalizer independently for every detected piece. One invalid required piece should invalidate the set before persistence. |
| Client validation | app/add-item.tsx; lib/bulkClassifyCore.ts | Applies fallbacks/defaults and clamps confidence. The form requires relevant attributes before manual save. | Multi-item results need envelope-level validation and per-item validation before constructing any wardrobe rows. |
| Item construction | app/add-item.tsx — auto-persist and handleSave; app/bulk-review.tsx save mapping | Generates a UUID and constructs one ordinary WardrobeItem. | Construct one unchanged WardrobeItem for each valid piece. Relationship metadata must remain separate. |
| Image persistence | lib/storage.ts — uploadWardrobeImage | Uploads to private wardrobe-images/{userId}/{itemId}.{ext} with upsert:true; returns a signed URL and durable path. | Reuse the same bucket. Deterministic per-operation and per-item paths are needed for safe retries. Do not introduce a source-image bucket. |
| Database persistence | lib/database.ts — insertWardrobeItem; contexts/AppContext.tsx — addWardrobeItem | Optimistically updates state/AsyncStorage, then starts a separate Supabase insert whose error is logged. | This path is not suitable for atomic multi-item persistence. An awaited transactional boundary is required for authenticated sets. |
| Guest persistence | contexts/AppContext.tsx; guest photo helpers | Saves wardrobe items and durable local file URIs in AsyncStorage/device storage. | Phase A deliberately deferred guest relationship persistence. Preserve the current single-item guest path until PO approves explicit guest behavior. |
| Hydration | contexts/AppContext.tsx — loadData, loadUserDataFromDB; lib/wardrobeMapper.ts | Loads local cache, then authenticated DB rows, maps them to WardrobeItem[], resolves Storage paths to signed URLs, and stores durable paths in AsyncStorage. | Load GarmentGroup[] separately for authenticated users. Never merge group fields into WardrobeItem. |
| Recommendation handoff | contexts/AppContext.tsx — activeWardrobeItems, generateOutfitPool, generateOutfitsForItem | Sends ordinary WardrobeItem[] into v3.7. | No change. Group metadata must not enter these calls during Phase B. |

### Existing error and retry behavior

**Observed in current code:**

- Content refusal returns HTTP 422 and resets the selected photo.
- Rate limits, Gemini failures, malformed output, and other classifier failures become classification_unavailable; the user may complete details manually.
- If preprocessing fails before classification, a local category fallback supplies basic values.
- Single-item auto-persistence failures are swallowed so normal manual save remains available.
- Authenticated image-upload failure may fall back to a local file path.
- Bulk classification failures mark the individual image as error.
- Bulk retry reruns the full classification pipeline for that URI.
- Bulk save catches failures per item and proceeds to the next item.
- Component-unmount guards prevent later UI state changes but cannot undo writes already completed.

## Current classifier contract

### Request

**Observed in current code:**

    {
      imageBase64?: string;
      imageUrl?: string;
      userId?: unknown;
    }

Rules:

- Exactly one of imageBase64 or imageUrl is required.
- Inline images are declared to Gemini as image/jpeg.
- There is no multi-item mode, request ID, image-region list, or idempotency key.
- Ownership comes from route authentication; the body’s userId is not used for garment-group ownership.

### Successful response

    interface ClassificationResult {
      category: ItemCategory | null;
      subType: string | null;
      colorFamily: string | null;
      accentColor?: string;
      description: string;
      occasionTags: OccasionTag[];
      seasonTags: SeasonTag[];
      pattern?: string;
      patternScale?: string;
      fit?: string;
      neckline?: string;
      sleeveLength?: string;
      rise?: string;
      warmthBand?: string;
      fabric?: string;
      weight?: 'light' | 'mid' | 'heavy';
      dominantHsl?: { h: number; s: number; l: number };
      dominantLab?: { L: number; a: number; b: number };
      modelConfidence: number;
      source: 'gemini';
    }

### Current garment representation

Categories:

- top
- bottom
- dress
- outerwear
- shoes
- bag
- jewelry

Current African/Nigerian subtype support includes:

- buba
- iro
- wrapper
- iro-and-buba
- aso-ebi
- boubou
- gele
- headwrap
- head-scarf
- structured-headpiece

Ankara is normalized as pattern wax-print, not a silhouette.

### Normalization and validation

**Observed in current code:**

- Category must belong to the seven-category set or becomes null.
- Subtype must be valid for its category or becomes null.
- Taxonomy values are trimmed and lowercased.
- Known subtype, fabric, and pattern aliases are normalized.
- Invalid optional attributes are dropped.
- modelConfidence is clamped to [0,1]; missing/non-numeric confidence defaults to 0.7.
- Description, occasions, seasons, and fabric weight are derived server-side.
- Valid RGB is converted into HSL/Lab.
- Inconsistent RGB may be corrected to the chosen color-family centroid.
- There is no minimum-confidence rejection.
- Guardrail enforcement depends on Gemini returning refused:true.
- Malformed JSON returns classification_failed.
- Gemini 429 errors are surfaced as rate_limited.

### Exact missing capability

The response represents one scalar garment. It has no:

- items[];
- per-piece identity;
- per-piece region or crop;
- item count;
- relationship type;
- relationship confidence;
- group-level shared attributes;
- classifier-to-group linkage.

A co-ord must currently collapse into one classification or be rejected, so the pieces cannot become independently wearable wardrobe records.

## Phase B multi-item representation

The following is a proposed processing model, not a change to WardrobeItem.

### Single garment

    One source image
      → one validated ClassificationResult
      → one WardrobeItem
      → no garment group

The existing single-item endpoint and persistence flow remain the compatibility baseline.

### Coordinated set/co-ord

    One source image
      → item detection
          → blazer classification
          → trousers classification
      → two ordinary WardrobeItems
      → garment_group relationship_type = coordinated_set
      → two garment_group_members

Each piece receives:

- its own UUID;
- its own category/subtype and attributes;
- its own modelConfidence;
- an independently addressable wardrobe record.

### Three-or-more-piece set

The same model scales to N pieces:

    One image
      → N validated item classifications
      → N WardrobeItems
      → one coordinated_set or multi_item group
      → N memberships

Phase A requires at least two distinct members and already supports more than two.

### Layered outfit

Use relationship_type = layered.

A layered relationship means independently wearable garments are shown worn or arranged as layers, not necessarily manufactured or sold as a matching set.

Do not infer coordinated_set solely because colors work together.

### Generic multi-item image

Use relationship_type = multi_item only when multiple independently wearable items are confidently detected but the evidence does not establish a coordinated set or layering relationship.

### Ambiguous image

**Proposed for Phase B:**

- Do not persist during classification.
- Validate every detected item first.
- If the classifier cannot confidently determine item boundaries, retain the legacy single-item/manual-review path.
- Do not create a group when relationship inference is insufficient.
- Do not silently label an ambiguous relationship as coordinated_set.
- If individual items are valid but the relationship is uncertain, engineering can preserve the classifications temporarily, but the save behavior requires PO approval.
- Whether to ask the user to confirm, split, or reject the result is a product decision.

## Phase A integration

### Existing contract

**Required by Phase A:**

- garment_groups stores relationship metadata.
- garment_group_members links existing wardrobe IDs.
- Ownership is enforced through user_id, RLS, and composite foreign keys.
- create_garment_group(...) atomically inserts a group and its initial memberships.
- Minimum initial membership is two distinct garments.
- One garment may belong to multiple groups.
- source_image_path accepts a durable path, not a signed URL.
- AI-inferred groups require non-null relationship confidence.
- Phase A schema, policies, ACLs, RPC, and lifecycle rules remain unchanged.

### Creation rules

Create a group only when:

1. At least two independently wearable items have passed validation.
2. All corresponding wardrobe rows have persisted for the same authenticated user.
3. A relationship type is supported by evidence.
4. AI inference includes a relationship confidence.
5. The durable source path, if used, is known.

Do not create a group for:

- one detected garment;
- an indivisible garment merely containing visual panels;
- invalid or incomplete item classifications;
- an ambiguous relationship that has not met the agreed threshold;
- guest users under the currently approved architecture.

### Field mapping

| Phase B concept | Phase A field |
|---|---|
| Matching manufactured/styled set | relationship_type='coordinated_set' |
| Multiple unrelated/uncertainly related items | relationship_type='multi_item' |
| Layered garments | relationship_type='layered' |
| Relationship confidence | relationship_confidence |
| AI-created relationship | confirmation_status='ai_inferred' |
| Explicit later user approval | confirmation_status='user_confirmed' |
| Explicit later rejection | confirmation_status='user_rejected' |
| Shared evidence such as matching pattern/fabric | shared_attributes using a narrowly defined JSON object |
| Durable common source | source_image_path |
| Members | Existing wardrobe-item UUIDs |

Do not place per-item attributes in shared_attributes. They belong on their item classifications/wardrobe records.

### Failure and retry

- A rejected Phase A RPC leaves no group or memberships.
- Its composite ownership FKs reject cross-user members.
- A repeated successful call currently creates another group.
- The RPC alone does not make preceding wardrobe inserts atomic or idempotent.

## Atomicity and failure model

### Required invariant

For authenticated multi-item saves, the database-visible result should be either:

    All wardrobe rows + one group + all memberships

or:

    No new wardrobe rows + no group + no memberships

### Current limitation

**Observed in current code:**

- Storage upload, local state, AsyncStorage, each wardrobe insert, group creation, and the post-RPC read are separate operations.
- addWardrobeItem is optimistic and does not await database persistence.
- runSaveAll catches each item failure and continues.
- Therefore current APIs cannot guarantee the invariant.

### Intended outcomes

| Failure | Intended result |
|---|---|
| Classifier reports two pieces but one is invalid | Persist nothing from the multi-item operation; offer current manual/single-item recovery only if appropriate. |
| Classifier timeout | Persist nothing; allow safe retry of classification. |
| Malformed classifier response | Persist nothing; reject the envelope. |
| First item would persist but second fails | Transaction rolls back both item rows; no group or memberships. |
| Group creation fails | Roll back the wardrobe rows created by that operation. |
| Membership creation fails | Roll back item rows and group. |
| Storage upload fails before DB transaction | Do not start DB persistence; clean successfully uploaded operation objects where possible. |
| Database transaction fails after uploads | No database rows; delete deterministic uploaded objects or leave them for bounded reconciliation. |
| Client receives timeout before commit status is known | Query/reconcile by durable operation identity; do not blindly repeat random-ID inserts. |
| User leaves before persistence begins | No new rows. |
| User leaves during server transaction | The server transaction completes or rolls back independently; client reconciles on return. |
| Authentication expires before transaction | Reject before writes. |
| Authentication changes during operation | Server derives one user from the authenticated request and rejects mismatched ownership. |

### Required architectural decision

**Proposed for Phase B, requiring explicit approval:**

Add one narrow authenticated transactional orchestration boundary that:

1. Derives the user from auth.uid().
2. Accepts a fully validated multi-item payload and stable client-generated IDs.
3. Inserts all wardrobe rows.
4. Reuses or faithfully preserves the approved Phase A group validation.
5. Inserts one group and every membership in the same PostgreSQL transaction.
6. Returns the committed IDs/state.
7. Reconciles retries using a stable operation identity.

A client sequence of several .insert() calls followed by create_garment_group(...) is not acceptable for production multi-item persistence.

The existing Phase A RPC should not be modified casually. If a new orchestrator cannot call it while preserving idempotency, that conflict must receive architecture approval rather than being hidden with compensating client deletes.

Storage remains outside the transaction. Upload first to deterministic paths; commit database state only after every required image upload succeeds.

## Idempotency/retry analysis

### Current state

**Observed in current code:**

- Crypto.randomUUID() is generated during each save attempt.
- Retrying classification reruns Gemini.
- Retrying save generates new item IDs.
- insertWardrobeItem is a plain insert.
- Storage upload is idempotent only when the same item ID/path is reused because it uses upsert:true.
- create_garment_group(...) generates a new group ID.
- There is no request ID, operation record, idempotency key, or unique group-source constraint.
- Duplicate memberships are prevented only within the same group.
- Nothing prevents duplicate equivalent groups.

### Phase B requirement

A stable client-generated operation identity is genuinely required.

Minimum behavior:

- Generate the operation identity and all item IDs once.
- Retain them across immediate retries.
- Use deterministic Storage paths derived from those IDs.
- Do not generate new IDs after an unknown commit outcome.
- The server/database must distinguish first execution, exact replay of a completed operation, and conflicting reuse of an operation ID.

### Remaining conflict

Stable item IDs alone are insufficient because the current Phase A RPC generates a fresh group ID and has no idempotency parameter.

One of these needs explicit approval:

1. A new transactional RPC with a durable operation identity and replay semantics.
2. An additive idempotency record/constraint.
3. A new group-creation entry point accepting a stable group ID and validating exact replay.

Do not misuse source_image_path as an idempotency key; it is provenance, not operation identity.

## Source-image provenance

### Current image forms

**Observed in current code:**

- Picker URI: temporary local source.
- Resized JPEG: classifier input and upload fallback.
- PhotoRoom PNG: whole-image background-removed derivative.
- Re-encoded JPEG: classifier-safe version of the PhotoRoom result.
- Wardrobe Storage object: private wardrobe-images/{userId}/{itemId}.{ext}.
- Signed URL: one-hour display credential, never durable provenance.
- Durable path: persisted Storage reference.

### Phase B approach

**Required by Phase A:**

- Reuse wardrobe-images.
- Do not add a bucket or source_images table.
- Persist only a durable path in source_image_path.
- Never persist signed URLs.

**Proposed for Phase B:**

- Give the group source a deterministic flat path in the existing user prefix.
- Keep it compatible with existing account-deletion listing behavior; do not introduce unverified nested folders.
- Point garment_groups.source_image_path to that path.
- If no individual derivatives are produced, product must decide whether several wardrobe cards may display the same source image.
- If independent cards require garment-only images, use detected regions to produce item crops and store them under their item IDs in the existing bucket.
- Do not require AI-generated derivatives unless visual validation proves shared source images are unusable.

### Deletion

- Deleting an item already removes {itemId}.jpg and {itemId}.png.
- Group deletion does not currently remove a separate source object.
- Account deletion lists/removes objects under the user prefix.
- If Phase B stores a distinct group source, its cleanup on explicit group deletion must be designed before implementation.
- Database triggers cannot delete Storage objects.
- Shared source paths must never be deleted merely because one member item is removed.

## WardrobeItem/v3.7 compatibility

WardrobeItem does not need to change.

Each detected garment already fits the existing item contract:

    category
    subType
    colorFamily
    description
    occasionTags
    seasonTags
    formalityLevel
    pattern/fabric/fit/etc.
    modelConfidence
    photoUri
    storagePath

The relationship is a separate domain concern:

    WardrobeItem[]
    +
    GarmentGroup[]

Resulting flow:

    Multi-item image
      → multiple scalar classifications
      → multiple ordinary WardrobeItems
      + separate garment-group record/memberships
      → existing wardrobeItems state
      → activeWardrobeItems
      → unchanged Recommendation Engine v3.7 WardrobeItem[]

### Leak-prevention points

Group metadata must not be added to or passed into:

- WardrobeItem;
- mapDbRowToWardrobeItem;
- activeWardrobeItems;
- generateOutfitsForItem;
- generateOutfitPool;
- outfit scoring;
- candidate generation;
- fingerprints;
- rotation;
- affinity;
- weather;
- blueprint logic.

If AppContext hydrates groups, it must keep them in a separate GarmentGroup[] state/value. Merely loading relationship metadata must not make v3.7 prefer matching pieces.

## African/Nigerian representation

| Case | Current state | Phase B relationship effect |
|---|---|---|
| Ankara blazer + trousers | Both pieces have existing categories/subtypes; GU-29 currently fails because multiplicity is rejected. | Independently classify blazer and trousers; group as coordinated_set; shared pattern may be wax-print. |
| Ankara top + skirt | Top and skirt are representable; shared set identity is absent. | Two items plus coordinated_set. |
| Buba + iro | Individual buba and iro subtypes already exist; current complete-image guidance may collapse to iro-and-buba. | Prefer independent buba and iro items when boundaries are clear, grouped as coordinated_set. |
| Blouse + wrapper | Both are representable individually. | Two items plus coordinated_set when matching evidence exists. |
| Blazer + ordinary trousers | Both are representable. | coordinated_set only with matching-set evidence; otherwise multi_item. |
| Aso-ebi ensemble | Current aso-ebi subtype collapses a complete outfit into one dress-like item. Piece boundaries and cultural construction may be ambiguous. | Relationship model can preserve multiple validated pieces, but semantic item types may remain classifier-limited. |
| Gele/headwrap with outfit | Gele/headwrap is currently represented under jewelry; clothing pieces may also be recognized. | Can be an independent item and optionally a group member, subject to PO policy. |
| Textile/stole/sash | No robust dedicated representation in the current taxonomy. | Relationship storage cannot solve missing item semantics. Still classifier/taxonomy-blocked. |
| Layered African garments | Pieces may be individually representable depending on type. | Use layered when layering—not manufacturing coordination—is the detected relationship. |
| Three-piece ceremonial ensemble | Group supports three or more members. | Persistence is representable; accurate piece semantics may remain ambiguous. |

### GU-29

Observed output:

    HTTP 422
    content_guardrail
    “This image contains multiple clothing items (a blazer and pants set).
    Please photograph each garment individually.”

GU-29 is a confirmed classification/representation failure, not a v3.7 ranking failure. Phase B should target this case without modifying its frozen benchmark record.

## Confidence model

Three concepts must remain separate.

### Item confidence

**Observed in current code:**

modelConfidence is the classifier’s aggregate confidence in one item classification. It is stored on WardrobeItem and used to signal low-confidence review.

For Phase B, each detected piece receives its own existing modelConfidence.

### Attribute confidence

Current production does not provide separate confidence values for color, fabric, pattern, scale, fit, or other attributes.

**Proposed for Phase B:**

- Do not invent persistence fields.
- Continue validating attributes with existing enum and normalization rules.
- If per-attribute confidence is needed for diagnostics, it requires a separate classifier-contract decision and should remain non-persistent until explicitly approved.

### Relationship confidence

Phase A already provides relationship_confidence.

This measures whether the pieces belong together as coordinated_set, multi_item, or layered. It is not the average of item confidences.

### AI inference versus user truth

- AI-created relationship: confirmation_status='ai_inferred' and non-null relationship confidence.
- Explicit user approval: user_confirmed.
- Explicit user rejection: user_rejected.

The engineering layer must not promote an AI inference to user-confirmed truth.

## Guest vs authenticated behaviour

### Authenticated users

**Proposed for Phase B:**

- Use Supabase wardrobe rows.
- Use the approved Phase A garment-group infrastructure.
- Use an awaited transactional persistence boundary.
- Hydrate groups separately from wardrobe items.
- Store durable Storage paths, not signed URLs.

### Guest users

**Observed in current code:**

- Wardrobe items persist in AsyncStorage.
- Images persist in device document storage.
- PhotoRoom is skipped without authentication.
- Phase A intentionally did not add local guest relationship persistence.

**Required compatibility behavior:**

Phase B group persistence should initially be authenticated-only.

For guests:

- Preserve the current single-item upload flow.
- Do not create a parallel guest group database.
- Do not claim that set relationships will survive sign-in or device changes.
- Do not silently save multiple pieces while discarding a relationship unless PO approves that behavior.

A future guest relationship model and guest-to-account reconciliation are separate product/architecture decisions.

## Lifecycle analysis

Phase B must preserve the already-tested Phase A behavior.

| User action | Existing Phase A result |
|---|---|
| Deletes one garment from a group | Wardrobe row is deleted; its membership cascades away; other garments remain. |
| Deletes all but one garment | The group remains with one membership. Phase A deletes only empty groups. |
| Removes a non-final membership | Membership disappears; group remains. |
| Removes the final membership | Empty-group trigger deletes the group. |
| Deletes the group | Memberships cascade away; wardrobe items remain. |
| Deletes the account/profile | Wardrobe rows, groups, and memberships cascade/delete through the established account lifecycle. |

Important correction: Phase A does not enforce a permanent two-member minimum after creation. A one-member group may remain after deletion. Phase B must not silently change this lifecycle rule.

Application state must reconcile separately hydrated group metadata after item deletion. It must not duplicate database cascade logic or attempt to delete unrelated wardrobe items.

## Exact implementation boundary

Implementation must not begin until the atomicity/idempotency and product decisions are approved.

### Files Phase B WILL need to change

| File | Exact responsibility |
|---|---|
| server/classify-garment.ts | Export/reuse the existing scalar normalization contract without changing legacy single-item behavior. No broad prompt rewrite. |
| server/routes.ts | Register a separately protected multi-item classification/persistence endpoint using existing auth, AI quota, and rate limiting. |
| lib/database.ts | Add an awaited wrapper for the approved transactional multi-item persistence boundary and keep Phase A helpers intact. |
| contexts/AppContext.tsx | Hydrate and expose GarmentGroup[] separately for authenticated users and reconcile lifecycle changes without passing groups to v3.7. |
| New focused multi-item classifier module under server/ | Own the dedicated multi-item prompt, response envelope, envelope validation, and per-item reuse of scalar normalization. |
| New focused client/domain module under lib/ | Normalize the multi-item envelope and construct ordinary WardrobeItem inputs separately from group metadata. |
| New Phase B migration, only after architecture approval | Add the minimum transactional/idempotency orchestration function. It must not redesign Phase A tables, policies, ACLs, or existing RPC. |
| New targeted Phase B tests under __tests__/ | Cover multi-item normalization, atomic persistence, idempotency, ownership, failure cases, guest containment, and v3.7 isolation. |

### Files Phase B MAY need to change

| File | Condition |
|---|---|
| app/add-item.tsx | Only after PO decides how detected pieces are reviewed and saved. |
| app/bulk-review.tsx | Only if PO decides to reuse this screen for pieces detected inside one image. Existing multi-photo semantics must remain clear. |
| lib/bulkClassifyCore.ts | Only if the approved UX extends the existing bulk pipeline rather than creating a focused multi-item review flow. |
| lib/storage.ts | Only if a distinct group-source or crop upload helper is needed; reuse current bucket/signing behavior. |
| lib/garmentGroupMapper.ts | Only if the production API response differs from the already supported nested-member shape. |
| A new focused review screen | Only after one-card/multiple-card and confirmation decisions are approved. |

### Files Phase B MUST NOT change

- constants/outfitGenerator.ts
- constants/outfitScoring.ts
- Recommendation Engine v3.7 ranking/candidate-generation modules
- affinity, fingerprint, rotation, weather, or blueprint logic
- the WardrobeItem contract
- lib/wardrobeMapper.ts relationship behavior
- existing Phase A migrations
- garment_groups/garment_group_members ownership model
- existing Phase A RLS, ACLs, functions, triggers, or lifecycle semantics
- frozen Track B/C fixtures, labels, CSVs, and methodology
- taxonomy definitions unless separately approved
- new source-image tables or buckets

## Proposed Phase B implementation sequence

### B0 — Approve unresolved architecture/product boundaries

- **Objective:** Decide transactional orchestration, idempotency, review presentation, ambiguous-result handling, guest behavior, and derivative requirements.
- **Files:** None.
- **Dependency:** PO and architecture approval.
- **Validation:** Written decisions and acceptance criteria.
- **Containment:** No implementation begins without approval.

### B1 — Add a backward-compatible multi-item classifier path

- **Objective:** Return an envelope containing N raw item classifications and relationship metadata while preserving /api/classify-garment.
- **Files:** New server classifier module, server/routes.ts, minimal exports from server/classify-garment.ts.
- **Dependency:** B0.
- **Validation:** Existing single-item tests unchanged; envelope fixture tests.
- **Containment:** Separate endpoint/feature path can be disabled without touching legacy classification.

### B2 — Reuse scalar normalization per detected item

- **Objective:** Run every piece through current category/subtype/color/attribute validation.
- **Files:** Classifier modules and focused tests.
- **Dependency:** B1.
- **Validation:** Invalid item, malformed array, duplicate detection identity, unsupported relationship, and confidence bounds.
- **Containment:** Reject the envelope before any persistence.

### B3 — Define client construction without changing WardrobeItem

- **Objective:** Convert valid item results into N ordinary wardrobe inputs plus separate group metadata.
- **Files:** New focused lib/ module and tests.
- **Dependency:** B2.
- **Validation:** Single, two-item, and three-item fixtures; no group fields on items.
- **Containment:** Pure transformation with no I/O.

### B4 — Establish deterministic storage provenance

- **Objective:** Assign stable operation/item IDs and upload all required images to existing Storage paths.
- **Files:** Existing storage helper only if a narrow helper is proven necessary.
- **Dependency:** B0 and B3.
- **Validation:** Repeat upload uses identical paths; signed URLs are never persisted; partial uploads are cleaned/reconciled.
- **Containment:** No database transaction starts until required uploads succeed.

### B5 — Implement atomic authenticated persistence

- **Objective:** Insert all wardrobe rows, one group, and all memberships in one PostgreSQL transaction.
- **Files:** New approved migration/RPC, lib/database.ts, integration tests.
- **Dependency:** Approved B0 design and B4.
- **Validation:** Inject failure at each write; assert zero partial rows.
- **Containment:** Transaction rollback; no compensating client deletes as the primary guarantee.

### B6 — Implement idempotent retry/reconciliation

- **Objective:** Safely recover when the client cannot tell whether B5 committed.
- **Files:** Transactional API wrapper and focused tests.
- **Dependency:** B5.
- **Validation:** Exact replay returns the original committed result; conflicting replay is rejected; no duplicate groups/items.
- **Containment:** Stable operation and item identities retained until confirmed.

### B7 — Add authenticated group hydration and lifecycle reconciliation

- **Objective:** Load separate GarmentGroup[] state and keep it synchronized after item/group changes.
- **Files:** contexts/AppContext.tsx, Phase A DB helpers if needed.
- **Dependency:** B5.
- **Validation:** Cold start, sign-in, item deletion, final-member removal, and account deletion.
- **Containment:** Group state never enters v3.7 inputs.

### B8 — Add approved review experience

- **Objective:** Let users review detected pieces and relationship according to PO decisions.
- **Files:** app/add-item.tsx, possibly a focused review screen or carefully bounded bulk-review integration.
- **Dependency:** B0–B7.
- **Validation:** Mobile visual validation for two, three+, ambiguous, loading, retry, and failure states.
- **Containment:** Feature gate or route isolation; legacy single-item flow remains available.

### B9 — Targeted regression and experiment

- **Objective:** Validate representation without changing frozen benchmark methodology.
- **Files:** New Phase B test/experiment package only.
- **Dependency:** B1–B8.
- **Validation:** Matrix below.
- **Containment:** No Track C edits and no v3.7 behavior changes.

## Targeted test matrix

| Area | Cases | Required assertions |
|---|---|---|
| Single item | Ordinary garment; Ankara single garment; buba; iro | Legacy endpoint/shape unchanged; one item; no group. |
| Two items | Blazer + trousers; Ankara co-ord; buba + iro; blouse + wrapper; matching top + skirt | Two validated items; correct relationship type/confidence; independent IDs; one group. |
| Three+ items | Coordinated ceremonial ensemble; layered outfit | All pieces independent; one N-member group; no truncation or duplicate members. |
| Accessories | Outfit + gele; outfit + headwrap | Accessory remains independent; grouping follows approved product rule. |
| Ambiguity | Indivisible garment; uncertain set; uncertain layer; overlapping pieces | No invented relationship; no partial persistence; approved review/fallback behavior. |
| Classifier failures | Timeout; malformed JSON; malformed envelope; empty items; one invalid item; guardrail | No database or Storage-visible completed set. |
| Storage failures | First upload fails; later upload fails; cleanup fails | No database rows; deterministic orphan reconciliation. |
| Database failures | First/second item failure; group failure; membership failure | Whole database transaction rolls back. |
| Retry | Retry before commit; timeout after commit; app closes; exact duplicate request | One logical operation; no duplicate wardrobe rows/groups. |
| Membership | Duplicate member; same garment in another group | Duplicate in one group rejected; membership across distinct groups allowed. |
| Ownership | Cross-user garment; forged user ID; expired session | Database rejection; no partial rows. |
| Lifecycle | Delete one item; leave one member; remove final member; delete group; delete account | Exact Phase A behavior preserved; no wardrobe deletion from group cascade. |
| Guest | Guest classification; guest save; later sign-in | Current guest behavior preserved; no false claim of durable relationship persistence. |
| Regression | Existing single upload, PhotoRoom fallback, mapper, hydration, v3.7, Track C integrity | Existing contracts and frozen files unchanged. |
| Visual | Two/three-item cards, long names, low confidence, retry, partial preprocessing, small screen | Only after PO approves review UX. |

Database integration tests should run against a disposable Supabase/PostgreSQL environment before any production migration.

## Benchmark strategy

Do not modify Track B, Track C, or the v3.7 benchmark.

Create a separate Phase B experiment package with new multi-item images and independent human labels.

Measure separately:

1. **Item detection:** Correct count; false-positive and missed-item rates.
2. **Item semantic type:** Category and subtype per detected piece.
3. **Relationship detection:** Whether a relationship should exist.
4. **Relationship type:** coordinated_set, multi_item, or layered.
5. **Attribute accuracy:** Color, fabric, pattern, scale, fit, and relevant structural fields per piece.
6. **Confidence calibration:** Item confidence versus actual item correctness; relationship confidence versus actual relationship correctness.
7. **Persistence correctness:** All-or-nothing database state.
8. **Retry correctness:** One logical result under repeated requests and unknown commit outcomes.
9. **Provenance:** Correct durable paths and no persisted signed URLs.
10. **Security:** Two-user isolation and forged ownership attempts.

Include GU-29-like cases in the new experiment, but do not alter GU-29’s frozen input, result, or gold metadata.

Do not merge Phase B metrics into v3.7 scoring metrics until a separate benchmark-methodology decision is approved.

## Product decisions requiring PO approval

### Engineering decisions

These can be made from system invariants:

- Keep WardrobeItem unchanged.
- Keep relationship metadata separate.
- Preserve the legacy single-item endpoint.
- Use the existing private Storage bucket.
- Require atomic database persistence.
- Require idempotent retry handling.
- Preserve Phase A lifecycle behavior.
- Keep v3.7 unaware of groups.

### Product decisions

PO approval is required for:

1. One source image appearing as one visual wardrobe card or several item cards.
2. Whether users must confirm an AI-inferred relationship before saving.
3. Whether users may break apart an AI-created group.
4. Whether users may manually create or edit groups.
5. What happens when items are clear but relationship type is ambiguous.
6. Whether guest users may save pieces without relationship persistence.
7. Whether a gele/headwrap is grouped by default or treated independently.
8. Whether item-only image crops are required.
9. Whether a one-member group should remain visible after other pieces are deleted.
10. Whether groups will eventually influence recommendations.

The last decision is outside Phase B’s engine-safe scope and cannot change v3.7 without a later controlled experiment.

### Future experiments

- Compare shared source images versus individual crops for item recognition and wardrobe usability.
- Test confidence thresholds for automatic group creation versus review.
- Compare one-card and multi-card review completion rates.
- Measure whether users preserve, reject, or edit AI-inferred relationships.
- Test whether grouped recommendations add value before any engine integration is proposed.

## Risk classification

| Risk | Classification | Reason |
|---|---|---|
| Partial wardrobe/group persistence | Launch blocker | Produces inconsistent user data and broken lifecycle behavior. |
| Duplicate rows/groups after timeout retry | Launch blocker | Current random-ID retry path cannot identify prior success. |
| Cross-user membership | Trust/safety-critical | Phase A prevents it; new orchestration must preserve that boundary. |
| Multi-item endpoint regresses single-item uploads | Revenue-critical | Upload is a core conversion and wardrobe-value path. |
| Authenticated save silently falls back to non-durable local state | Retention-critical | Items or relationships may disappear across devices/reinstalls. |
| Incorrect item boundaries | Trust/safety-critical | Users may receive fabricated or missing wardrobe pieces. |
| Incorrect co-ord versus layered relationship | Differentiation | Relationship quality is the feature’s primary value. |
| Poor Ankara/buba/iro/gele handling | Differentiation | African/Nigerian fashion is first-class launch scope. |
| Guest relationship loss without disclosure | Retention-critical | Guest users may reasonably expect a detected set to survive sign-in. |
| Distinct group source not cleaned after group deletion | Trust/safety-critical | Creates retention/deletion inconsistency. |
| Individual image crops | Product-dependent polish | Needed only if shared source images fail usability validation. |
| Group-aware recommendation changes during Phase B | Distraction and regression risk | v3.7 is frozen; relationship persistence does not require engine changes. |
| Broad taxonomy rewrite | Distraction | It would expand beyond the confirmed multiplicity problem. |
| Modifying Track C to score Phase B | Distraction | A separate experiment is safer and methodologically clearer. |

## Files inspected

Directly or through focused read-only exploration:

- AMODKA-PROJECT-STATUS.md
- attached_assets/Pasted-D-2-Phase-B-Multi-Item-Co-ord-Integration-Specification_1789772202083.txt
- app/add-item.tsx
- app/bulk-review.tsx
- app/(tabs)/outfits.tsx
- contexts/AppContext.tsx
- server/routes.ts
- server/classify-garment.ts
- lib/bulkClassifyCore.ts
- lib/photoroom.ts
- lib/storage.ts
- lib/database.ts
- lib/wardrobeMapper.ts
- lib/garmentGroupMapper.ts
- lib/classifyPath.ts
- constants/types.ts
- constants/recommendationVersion.ts
- constants/outfitGenerator.ts
- supabase/migrations/20260918000000_garment_groups.sql
- supabase/migrations/20260918223816_reconcile_garment_group_table_acls.sql
- __tests__/classifyGarment.test.ts
- __tests__/classifyGarmentIntegration.test.ts
- __tests__/phase37-tracks-cde.test.ts
- scripts/benchmark-pipeline.ts
- docs/recommendation/africa/benchmark-v1/frozen-v1/benchmark-input/classification-cases.md
- docs/recommendation/africa/benchmark-v1/gold-standard/gold-labels.json
- docs/recommendation/africa/benchmark-v1/internal/gu-taxonomy-analysis.md
- docs/recommendation/africa/track-c/baseline-v3.7/raw-engine-output/GU-29-result.json
- docs/recommendation/africa/track-c/baseline-v3.7/raw-engine-output/summary.json
- docs/PHASE-5C.3-TRACK-A-AUDIT.md

## Confirmation of zero changes

The specification investigation was read-only.

Confirmed:

- Zero application code changes.
- Zero classifier or Gemini prompt changes.
- Zero upload-pipeline changes.
- Zero UI or AppContext changes.
- Zero Recommendation Engine v3.7 changes.
- Zero taxonomy changes.
- Zero schema, migration, RLS, ACL, RPC, function, trigger, Storage, or production-data changes.
- Zero test changes.
- Zero benchmark changes.
- No full benchmark run.
- Phase B was not implemented or started.

At the time of the final status check, the only untracked working-tree entry was the user-provided specification file:

    attached_assets/Pasted-D-2-Phase-B-Multi-Item-Co-ord-Integration-Specification_1789772202083.txt
