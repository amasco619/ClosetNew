# Single/bulk classification preparation parity

## Finding and accuracy choice

The supplied joggers appear grey with a subtle purple cast. The previous bulk
path always resized to width 1024; single entry capped the longest edge and did
not upscale. These are different image inputs before PhotoRoom and Gemini.
Both use the same server classifier and colour-label processing. Current traces
do not tie those exact jogger results to their submitted images, so the resize
difference is a confirmed inconsistency, not a proven cause of those two labels.

Selected the established, successful single-entry baseline: longest edge 1024,
JPEG quality 0.8, no upscaling. Both now preserve actual decoded aspect ratio and
encode once, without colour adjustment, cropping or invented detail. This is a
conservative accuracy-oriented choice: avoid distortion and unnecessary encoding,
not an unmeasured claim that 1024 universally outperforms larger images. Raising
resolution or changing neutral-colour thresholds would require a separate
controlled benchmark, not an assumption based on one result.

## Implementation

- New `lib/prepareClassificationImage.ts`, used directly by both
  `app/add-item.tsx` and `app/bulk-review.tsx`.
- Uses the contextual API in the already installed Expo image-manipulator.
  Reads dimensions from its decoded image (not guessed picker/EXIF metadata),
  resizes by a single axis only when needed, then saves JPEG once.
- Releases source/resized references and context on success/failure. Invalid
  dimensions or missing base64 fail explicitly through existing preparation-error
  handling; there is no silent skipped single classification.
- Bulk keeps its serial native queue. Existing app-owned staged copies,
  routing, PhotoRoom settings, cutout caching, successful PNG/original JPEG
  fallback selection, byte-derived MIME, consent and save paths are unchanged.
- Model, temperature, prompt, colour-family post-processing, taxonomy,
  Recommendation Engine v3.7, schema, benchmarks, quota, billing and dependencies
  are unchanged. No result cache or forced grey/lavender rule was introduced.
- Updated `TECHNICAL.md`, `AMODKA-PROJECT-STATUS.md` and relevant project memory.

## Verification actually performed

| Check | Result |
|---|---|
| Focused preparation, staging, bulk guard, refusal and classification-path suites | 5 passed, 0 failed |
| `npm test` | 102 passed, 0 failed |
| `npm run typecheck` | passed |
| `npm run lint` | passed, no warnings |
| `npx tsx __tests__/recommendation-golden-set.ts` | 35 passed, 0 failed |
| `npx expo export --platform android --no-bytecode --output-dir /tmp/amodka-preparation-release --max-workers 2` | passed, production Android JS bundle outside Git; not published |
| `git diff --check` | passed |

New `__tests__/classificationPreparation.test.ts` exercises the shared helper
with a mocked Expo decoder: portrait/landscape/square/already-small geometry,
single-axis resize/no upscaling, identical encoding settings and mock request
payloads from single/bulk source URIs, actual bulk-core PNG/JPEG fallback and MIME
selection, decode/resize/save/invalid-data failures and reference cleanup. Source
contracts assert that both screens call the helper and bulk preserves the queue.
These tests **do not prove native encoder byte identity or live model accuracy**.
Existing full-suite React Test Renderer deprecation messages remain.

An unrelated existing failed frontend launch was diagnosed as an old project
Metro process holding port 8081. Its listener ownership was verified before
terminating only that process. The existing frontend workflow restarted and
reports ready on 8081, stamp **`9b17bb7-dirty-20261017T192904Z`**. No workflow
configuration or dependencies were changed.

## Limits and phone check

No new photo was sent to PhotoRoom/Gemini during this work, and the uploaded
photo was not copied into a committed test fixture. There was no physical
Android/iOS test or controlled live-provider accuracy comparison.

An unauthenticated browser screenshot at Metro's root was blank, with the
existing web shadow-style deprecation and RevenueCat preview messages. It is
not evidence of an interactive upload journey; no browser or device visual
verification is claimed.

Using the fresh build, select the exact same original joggers photo once in
single entry and once in a bulk batch. Compare the actual colour selection,
not just the photo preview. Both routes now use the same preparation policy;
there is no intended bulk-specific interpretation. Repeat with a clearly
neutral grey and a genuinely lavender item to check that neither is forced
into the other's family. Existing manual colour correction remains available.

Gemini requests remain probabilistic at temperature 0.1; near-neutral garments
can still produce different labels. PhotoRoom service results and original
picker exports can also differ. Consistent preparation removes the identified
route-dependent resize difference, **not** all possible sources of variability.
Exact repeatable results would require an explicitly scoped result-reuse policy.
No publish or deployment was performed.
