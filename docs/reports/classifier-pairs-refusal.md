# Footwear pairs and calm classifier refusals

## Task 1 — pre-change findings (recorded before implementation)

### Exact prompt and processing

The live source `server/classify-garment.ts` contains:

```text
CONTENT GUARDRAILS — check these FIRST before classifying:
If the image is ANY of the following, do NOT classify — return a refusal:
- Blurry, too dark, or unreadable
- No clothing item visible (blank wall, furniture, food, scenery, etc.)
- A selfie or portrait where the person's face is the main subject
- Explicit, inappropriate, or sexually suggestive content
- Animals, pets, or non-fashion subjects

If a guardrail is triggered, return ONLY this JSON:
{ "refused": true, "reason": "A brief plain-English reason the user will see, e.g. 'This looks like a selfie rather than a clothing item. Please photograph the garment on its own or on a hanger.'" }
```

Later in African/Nigerian garment guidance:

```text
- When a photo presents multiple independent garments as a set rather than one supported garment, do not invent a set subtype; return a refusal asking for separate garment photos.
```

This conflicts with supported `linen-set`, `iro-and-buba` and `aso-ebi` entries and guidance allowing a coordinated outfit as one wardrobe item. There is no explicit matching-pair exception. The reason text reported by the user closely matches this rule.

The other prompt instructions that can produce a refusal are unchanged:

```text
- For a clearly identifiable shoulder/neck stole (including a Kente or Kente-pattern stole), use category "jewelry" and subType "stole" with wearPosition "shoulder-neck". A garment on a hanger can qualify if its intended shoulder/neck use is clear. Do not use stole for bare Kente cloth, loose/decorative textile, a waist sash, a neck scarf, a lower-body wrapper or a gele/headwrap. Refuse loose/non-wearable textiles rather than treating them as jewelry.
wearPosition (required only for jewelry/stole, omit otherwise): Exactly "shoulder-neck" when the image clearly identifies an accessory intended to be worn over the shoulders or around the neck as a stole. If this cannot be established, return a refusal, not a stole classification.
```

Git blame: the five general guardrails and refusal JSON were added in `6cadd2e` on **2026-06-10 16:44:19 UTC**. The quoted multiple-garment rule was added in `8793897` on **2026-09-29 15:43:30 UTC**, “Update garment classification logic and documentation.”

The existing truthy-refusal processing branch is attributed to `823b0f9f` on **2026-06-24 18:13:41 UTC**. Reason sanitization was added with the September 29 multiple-garment rule. The explicit stole wear-position prompt/post-processing safeguard is attributed to `c668538d` on **2026-09-29 17:08:33 UTC**.

`processGeminiResult` converts any truthy `parsed.refused` into a refusal and sanitizes the reason (control-character removal, whitespace normalization, 300-character limit). It also deterministically refuses `jewelry/stole` without `wearPosition: "shoulder-neck"`. The prompt independently refuses loose/non-wearable textiles and requires that stole wear position. No footwear count/pair detector exists in post-processing. The handler returns `{error:"content_guardrail",reason}` with HTTP 422 for a refused result. An unusable response is instead a separate 502 malformed-response result.

The exact refusal branches are:

```ts
if (parsed.refused) {
  return { refused: true, reason: sanitizeRefusalReason(parsed.reason) };
}
if (parsed.category === "jewelry" &&
    normalizeGarmentSubType(parsed.subType) === "stole" &&
    parsed.wearPosition !== "shoulder-neck") {
  return { refused: true, reason: "This does not clearly show a shoulder or neck stole. Please photograph the wearable item." };
}
```

### Available server evidence

All records below used requested `gemini-flash-lite-latest`, resolved `gemini-3.5-flash-lite`, attempt 1, provider HTTP 200, PNG MIME, and prompt SHA-256 `3a6c396fb0fe7c2c2e0ca39ce339add6e1403cd49be006c929dc5b108e93370d`. No inspected request used the `gemini-2.5-flash` fallback (which is attempted only on primary HTTP 429).

| Classification ID prefix | Image SHA-256 prefix | Bytes | Handler elapsed ms | HTTP result |
|---|---|---:|---:|---:|
| f8e9f82e | 62fb90d433b3f8db | 1,029,253 | 2,625 | 422 |
| d94a6f7b | 62fb90d433b3f8db | 1,029,253 | 1,570 | 422 |
| c48baac1 | 62fb90d433b3f8db | 1,029,253 | 1,131 | 422 |
| cc2d3a7b | 62fb90d433b3f8db | 1,029,253 | 1,559 | 422 |
| fbe01084 | 8e8c88890e823bbc | 632,277 | 1,393 | 200 |
| e3d21b7a (earlier) | 8e8c88890e823bbc | 632,277 | 2,050 | 200 |

The four rejected payloads have the exact full hash `62fb90d433b3f8db019cf6870c14c2e038000f4fd4e2eec7711bfd45437f5458`. The successful payload’s full hash is `8e8c88890e823bbcc56b05c17f655528e6fa753d8c1d32315f180c530125e49f`. The logs do not tag caller flow or original image identity: the later isolated successful request is compatible with the reported single-add test, but **cannot be conclusively assigned to that photo/flow**. Its provider bytes are not identical to the rejected payload. Handler timing excludes earlier background-removal and some middleware work; it is not the user's total tap-to-result time.

The primary is a moving `latest` alias, not a pinned version. The available records resolve it to 3.5 Flash-Lite. The last provider behavior/version-change date is unknown. There is no evidence here that bulk uses a different model, or that alias drift caused this specific failure. The conflicting prompt rule is the strongest actionable cause; payload differences can affect its interpretation.

### Every classification request field and image-path difference

| Field/step | Bulk Review | Single Add Item |
|---|---|---|
| Method/path | POST `/api/classify-garment` | same |
| Authentication | existing bearer session via `authenticatedApiRequest` | same |
| `imageBase64` | required image bytes from `classificationImagePayload` | same |
| `imageMimeType` | sniffed `image/png` or `image/jpeg`; checked against core MIME | same sniffing helper |
| `imageUrl` | omitted | omitted |
| `userId` | omitted; identity is authenticated server-side | omitted |
| Other request fields | none | none |
| Picker source | app-owned staged byte copy; navigation passes only selection ID | direct picker URI (except existing bulk handoff) |
| First resize | width exactly 1024, proportional height, JPEG quality 0.8; may upscale and can exceed 1024 high | longest edge capped at 1024; no upscaling; JPEG quality 0.8 |
| Dimension formula | input W×H → 1024×round(H×1024/W) | scale=min(1,1024/max(W,H)); round(W×scale)×round(H×scale) |
| Background removal | optional PhotoRoom; successful transparent PNG sent unchanged; original JPEG on failure | same provider and unchanged PNG/fallback intent |
| Cutout | returned trimmed PNG can have different dimensions/bytes; cache URI is for preview | same; different pre-resize can produce different cutout dimensions |
| Exact actual dimensions | not logged by server; unknown | not logged by server; unknown |
| Server prompt/schema/config | identical endpoint and prompt, JSON output, temperature 0.1, max 512 tokens | identical |

No five-repeat live image probe was performed. The exact original sneakers photo was not attached to this request. No labeled footwear-pair/multi-item image corpus was located in the test-fixture area (it contains a synthetic wardrobe fixture); stock recommendation footwear illustrations exist but were not treated as a model-accuracy benchmark. Existing stored telemetry is evidence, not a new model-accuracy experiment.

## Implementation, verification, and device script

The Task 1 findings above were recorded before production code changes.

### What changed

- **Server:** only guardrail wording changed. Explicitly accepts matching shoes/sandals/boots/earrings/gloves/socks and coordinated sets as ONE item. Refuses unrelated multi-garment images only without a dominant item, with a dominant-item fallback when uncertain. The conflicting later sentence was removed. All five other general guardrails and stole/textile safeguards are preserved. JSON schema, field names, model list, temperature, token cap, fallback conditions and post-processing are unchanged. No new taxonomy is introduced.
- **Bulk:** `422 content_guardrail` becomes `refused`, with fixed Amodka title/body and Add manually/Remove; it has neither retry nor provider-reason diagnostics. The header counts refusals as “needs attention,” separately from failures, while progress recognizes them as finished attempts. Retry is limited to transient classification errors (network/timeout, HTTP 408/429/5xx); permanent/preparation errors retain manual/removal alternatives.
- **Manual route:** uses the existing one-photo redirect helper with an opaque selection ID, current photo index and manual-entry flag, pushed over the existing batch. No URI goes into route params and no classification is triggered on entry. The editor borrows the batch photo, so dismissal cannot clean other batch sources. Cancel returns to the refusal card; only an acknowledged wardrobe save returns its index, after which that card leaves review without deleting its saved wardrobe row. Remaining batch items stay available.
- **Single Add Item:** replaces “Photo not accepted” and raw provider reasons with a calm app-styled Modal. Add manually keeps the photo and opens details; Choose another photo returns to selection. No generic dialog component existed in the native app, so the new shared refusal component follows the existing AI disclosure’s light native-Modal pattern rather than repurposing an auth-only notice.
- **Untouched processing:** app-owned staging helper, cache copies, startup sweep, resize arguments/queue, PhotoRoom/cutout handling, classifier schema/post-processing, Recommendation Engine v3.7, Phase A/P1.3, benchmark artifacts, database schema, dependencies and billing.

**Files:** `server/classify-garment.ts`, `lib/bulkClassifyCore.ts`, new `lib/classificationRefusal.ts`, `app/add-item.tsx`, `app/bulk-review.tsx`, new `components/PhotoRefusalNotice.tsx`; new `__tests__/classifierRefusal.test.ts`, updated `__tests__/classifyGarment.test.ts` and `__tests__/b28RemediationContract.test.ts`; `TECHNICAL.md`, `AMODKA-PROJECT-STATUS.md`, this report and project-memory notes.

### Checks actually run

| Command/check | Result |
|---|---|
| Focused classifier/core/diagnostic tests | Initial 4 passed/1 failed: a new test's overly broad regex also matched the helper name `isContentGuardrailError`. Narrowed the assertion; refusal test rerun passed. |
| `npm test` after that correction | **101 passed, 0 failed**, including staging, save guards, classifier HTTP regressions, P1.3/P1.4 and engine suites |
| `npm run typecheck` | passed |
| `npm run lint` | passed, no warnings |
| `npx tsx __tests__/recommendation-golden-set.ts` | **35 passed, 0 failed**, Engine v3.7 |
| `git diff --check` | passed |
| Server diff/protected-area inspection | server changes limited to guardrail text; no staging helper, resize pipeline, engine, schema, dependency or benchmark changes |
| Backend/frontend restart | both running; current frontend stamp **`df9f09a-dirty-20261017T113825Z`** |

Tests cover prompt pair/set inclusion and preservation of other guardrails, refusal versus transient/permanent outcomes, absence of raw refusal diagnostics, zero/partial counters, ID-only manual navigation, borrowed-photo cleanup contract, and mounted shared notice/dialog button callbacks. The navigation/save reconciliation checks are core/source contracts, **not** a live signed-in phone journey. React Test Renderer emits its existing deprecation notice. No new live-provider image probe was run.

### Task 4 — release-only rendering check

Ran:

```sh
EXPO_PUBLIC_AMODKA_BUILD_STAMP=AMODKA_RELEASE_TEST_SENTINEL \
  npx expo export --platform android --no-bytecode \
  --output-dir /tmp/amodka-pairs-release --max-workers 2
```

Export succeeded (one production Android JavaScript bundle, approximately 6 MB, outside Git). Both screens guard diagnostic JSX with `__DEV__`; stamp JSX is also guarded. The focused test transforms both actual screen sources with `__DEV__ = false` and a sentinel stamp and confirms **no diagnostic formatter render call or stamp UI survives**.

The actual release bundle contains neither the sentinel nor “DEV build stamp unavailable.” An initial stricter search for formatter strings did find `sincePick=`, `pickerHash=` and `stagedAtPick=`. Inspection found `formatPhotoPrepareDiagnostic` exactly once: its exported definition, with **no UI caller**. Those retained utility strings do not mean diagnostic text can render. Diagnostic collection is disabled at application call sites in release. This is a source/bundle verification, not an installed release-binary/device test.

An unauthenticated browser capture of `/add-item` at Metro’s port was blank, so it provides **no interactive UI verification**. Logs showed the existing web `shadow*` deprecation and RevenueCat web-preview messages. Native Android/iOS and screen-reader behavior are not claimed as tested.

### Four-step phone script

Use SDK 57 Expo Go, the current QR code, a signed-in account, and the existing approved AI-processing preference.

1. **Sneakers + loafers + boots + shirt in one bulk batch.** Expect all four photos to classify as four wardrobe items. A matching shoe pair must not be refused simply for having two components. Check header counts and save-ready cards; do not save until details are correct.
2. **The same sneakers in single Add Item three times.** Expect all three to classify. Record the build stamp and each result; there is no claim of a measured post-patch refusal rate until these runs happen.
3. **An unsuitable bulk photo (a pile of unrelated clothes or a wall).** Expect a calm “We couldn't read this photo” card, “needs attention” counter, Add manually and Remove, **no Tap to retry or raw JSON/reason**. Try Add manually: the selected photo should open in details without another classifier call. Cancel should leave the remaining batch unchanged. Reopen, enter valid details and save: the item should appear once in the wardrobe and leave the batch; other cards must remain. Also exercise Remove on another refusal.
4. **Airplane mode during bulk classification.** Start from already-selected local photos, turn on airplane mode before the classifier request, and expect a retry card rather than a refusal card. Restore connectivity and Retry; the card should settle if the request succeeds.

If any expectation fails, send the card/dialog screenshot plus build stamp and the matching safe server classification record. Do not send credentials or full device URIs. Real-photo acceptance, actual model behavior after the prompt change, physical navigation/save/cancel and VoiceOver/TalkBack remain unverified. No publishing or deployment was performed.
