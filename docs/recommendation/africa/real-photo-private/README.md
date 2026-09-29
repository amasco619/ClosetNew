# Private real-image classifier evaluation

This isolated garment-classification path does not alter the protected synthetic 40-case benchmark, the application classifier, the outfit engine, or Supabase. This directory contains schemas and case shapes only: **no real photos, populated gold labels, or measured results**. Manifest and gold examples are intentionally incomplete.

## Governed photo and reviewer workflow

1. Select an access-controlled private local data root outside source control. Keep photos, consent records, manifest, reviewer gold, test authorization, runs, and reports there. Never commit private photos or records.
2. Collect actual photos for all nine distinctions in `kente-suite-case-shapes.json`; do not substitute generated/example images. Only verified `sourceType: "real-photo"` entries pass preflight (human verification remains essential; metadata alone cannot prove a photo is real). Record source, license, documentary rights reference, provenance verifier/date, identifiability, and explicit permission for internal evaluation and classifier processing. Obtain documented subject consent if anyone is identifiable. A license or consent that does not allow classifier processing is not sufficient.
3. Have the data owner verify rights and approve the dataset. Put only documentary references and role identifiers—not subject/reviewer names or consent records—in the private manifest. Keep consent evidence separately with restricted access.
4. Complete `manifest.schema.json` using `manifest.example.json`. Image paths are relative to the private root; record exact SHA256 (`sha256sum images/<file>`). Only JPEG and PNG are accepted. `captureConditions` is limited to non-label photo conditions (e.g. background, lighting, view). It is never sent to the classifier. The classifier receives the original image bytes without contextual text.
5. Record item descriptions, cultural context, per-item normalized boxes, and item relationships in the reviewer-only gold file (`reviewContext`). Do not copy those fields to the manifest; they may reveal the expected label.
6. Assign non-overlapping development, validation, and sealed test splits before model calls. An independent qualified reviewer, blind to output, completes a separate gold file. An adjudicator records an `accepted` or `resolved` decision and private role/document references for each case before gold is locked; no personal names or decision documents are stored in this file. It binds to the exact manifest digest, each image hash, and a provenance digest. For every target include an explicit output crosswalk: `supported` with a current persisted field, `unsupported` where its vocabulary cannot express the gold distinction, or `unrepresentable` where no such output exists.
7. Score only after runs exist. Keep run and report immutable in the private root. A run records exact image and provenance hashes, model requested and provider-resolved version, prompt SHA256, preprocessing mode, MIME, and manifest SHA256.

## Commands

Use repository `tsx`; no dependency is added. `DATA_ROOT` is an external private directory with the populated `manifest.json` and images.

```sh
npx tsx scripts/privateRealPhotoEvaluation.ts preflight \
  --manifest "$DATA_ROOT/manifest.json" --data-root "$DATA_ROOT"

# Calls the actual classifyGarment handler directly, with GEMINI_API_KEY from
# the environment. It does not call the authenticated/rate-limited HTTP route.
GEMINI_API_KEY="$GEMINI_API_KEY" \
  npx tsx scripts/privateRealPhotoEvaluation.ts run \
  --manifest "$DATA_ROOT/manifest.json" --data-root "$DATA_ROOT" --split validation

npx tsx scripts/privateRealPhotoEvaluation.ts evaluate \
  --run "$DATA_ROOT/results/<validation-run>.json" \
  --manifest "$DATA_ROOT/manifest.json" --data-root "$DATA_ROOT" \
  --gold "$DATA_ROOT/gold-validation.json" \
  --out "$DATA_ROOT/results/<new-validation-report>.json"
```

The direct adapter invokes the application handler, so it does not pretend the HTTP route's authentication, consent middleware, or rate limiter has been exercised. It uses the real `GEMINI_API_KEY`; every case still must pass manifest preflight with explicit classifier-processing rights/consent. Calls can send photos to Gemini and can incur cost. Do not run unless the recorded rights allow that processing. No reviewer context, cultural description, labels, or boxes enter the provider request.

### Sealed test authorization

Test is not unlocked by a boolean environment flag. A designated data custodian holds a separate HMAC secret of at least 32 characters as `REAL_PHOTO_TEST_SEAL_KEY`. After reviewer gold is locked, create a short-lived authorization bound to the exact manifest digest, gold-file digest, case membership, approver reference, and expiry:

```sh
REAL_PHOTO_TEST_SEAL_KEY="$TEST_SEAL_KEY" \
  npx tsx scripts/privateRealPhotoEvaluation.ts seal-test \
  --manifest "$DATA_ROOT/manifest.json" --data-root "$DATA_ROOT" \
  --gold "$DATA_ROOT/gold-test.json" --approved-by "private approver reference" \
  --expires-at "2030-01-01T00:00:00Z" --out "$DATA_ROOT/test-seal.json"

REAL_PHOTO_TEST_SEAL_KEY="$TEST_SEAL_KEY" GEMINI_API_KEY="$GEMINI_API_KEY" \
  npx tsx scripts/privateRealPhotoEvaluation.ts run \
  --manifest "$DATA_ROOT/manifest.json" --data-root "$DATA_ROOT" --split test \
  --gold "$DATA_ROOT/gold-test.json" --seal "$DATA_ROOT/test-seal.json"

REAL_PHOTO_TEST_SEAL_KEY="$TEST_SEAL_KEY" \
  npx tsx scripts/privateRealPhotoEvaluation.ts evaluate \
  --run "$DATA_ROOT/results/<test-run>.json" --manifest "$DATA_ROOT/manifest.json" \
  --data-root "$DATA_ROOT" --gold "$DATA_ROOT/gold-test.json" \
  --seal "$DATA_ROOT/test-seal.json" --out "$DATA_ROOT/results/<test-report>.json"
```

Seal generation validates full preflight, locked reviewer metadata, exact test membership, per-item image/provenance hashes, and the manifest digest before signing. The test runner validates the signature, expiry, exact files and membership before calling the classifier, then writes a keyed HMAC sidecar binding the immutable run bytes/hash to the authorization. Evaluation rechecks the signature, run HMAC and hash, current image bytes/hashes, manifest digest, exact split membership, gold hashes, provenance digests, model identity, prompt hash, MIME, and preprocessing. Altered inputs, gold, run bytes, or membership fail closed. Authorization expiry limits when a test run may start; an already-run, attested result can still be evaluated later.

## Scoring and crosswalk

The persisted classifier output includes fields such as `category`, `subType`, `fabric`, and `pattern`; it does not persist the provider's transient `wearPosition` assertion. That assertion is **not** a scored classifier field. A persisted guardrail refusal is a supported `outcome` and is scored against reviewer-expected refusal. Refusal cases score their outcome only, never missing category/subtype. Other gold dimensions must each explicitly crosswalk to a persisted field, `unsupported`, or `unrepresentable`; non-representable targets are excluded from accuracy, not marked wrong.

The adapter accepts only the recorded requested aliases with explicitly approved pinned versions (`gemini-2.5-flash-lite-001` or `gemini-2.5-flash-001`). A new or unversioned provider alias stops the run; update the allowlist only after verifying the provider's actual resolved model.

Reports identify the track as `real-image-classification` and contain classification field accuracy only—no ranking metrics. They do not update or combine with historical benchmark results.