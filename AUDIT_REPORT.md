# Amodka upload pipeline audit — bulk, single, and shared infrastructure

**Audit date:** 2026-10-17

**Mode:** Read-only audit. No upload-pipeline code, configuration, data, or dependencies were changed.
**Evidence labels:** `VERIFIED BY REPRODUCTION` means a workflow/request/test result was observed during this audit or is explicitly identified as a prior device reproduction recorded in the current project status. `VERIFIED BY CODE READING` means the behavior follows from the inspected implementation. `INFERRED` means a plausible explanation or impact that still needs a device/provider observation.

## 1. TL;DR — ranked candidates and findings

1. **The displayed “Could not prepare photo” state points to the native resize step, before PhotoRoom or Gemini. — VERIFIED BY CODE READING.** `runClassifyUri` initializes `failureStage` to `photo-preparation`, awaits `resize`, and only changes the stage to `classification` after the optional background-removal/cache step. A thrown resize or missing `resized.base64` therefore produces the card text “Could not prepare photo”; optional PhotoRoom/cache failures are caught and fall back to the resized JPEG. The exact user-visible card is “Could not prepare photo” / “Tap to retry” (`lib/bulkClassifyCore.ts:94-110, 114-134, 167-171`; `app/bulk-review.tsx:252-266`). **The underlying native error is not logged, so its cause is unconfirmed.**
2. **Likely device-side candidates are an unsupported/failed image decode or memory pressure during resize. — INFERRED.** The picker can pass through the original image format, including HEIC; bulk does not normalize the file before `ImageManipulator`. The resize result is JPEG, but the transform must first decode the source. Bulk also requests `{ width: 1024 }` rather than bounding the longest edge, unlike single add. This can leave tall portrait outputs above 1024 px and may increase memory use. Neither the selected files’ MIME/dimensions nor the native exception were captured, so neither is established as the root cause (`app/add-item.tsx:562-571`; `app/bulk-review.tsx:529-540`; SDK 57 picker source in `node_modules/expo-image-picker`).
3. **The recent transparent-PNG/trim/matte work does not explain this specific preparation-stage card. — VERIFIED BY CODE READING.** That path starts only after resize succeeds. PhotoRoom or PNG-cache errors are deliberately downgraded to the original resized JPEG; a classifier request failure instead has `failureStage === 'classification'` and displays “Analysis failed”. The user-provided Android screenshot is consistent with a failure before those later stages. The project status records that the prior device attempt had successful preference/entitlement requests and no background-removal or classifier POST; this audit did not independently reproduce that attempt (`AMODKA-PROJECT-STATUS.md:438-452`).
4. **A successful analysis can still become permanently local-only if the temporary cutout file disappears before Save All. — VERIFIED BY CODE READING.** When `cutoutUri` is present, `runSaveAll` reads only that cache file. A read failure enters the upload-failure fallback; it does not retry from the still-available original `uri`. The item remains `local-only`, and another Save All retry reads the same missing `cutoutUri` again (`lib/bulkClassifyCore.ts:313-354, 404-412`; `app/bulk-review.tsx:548-554, 632-639`). This is a separate save-stage risk, not the screenshot’s pre-classification failure.
5. **Single-item end-to-end success remains unverified. — VERIFIED BY CODE READING.** The path is implemented, but no real device/account upload was run. In single add, a resize exception is swallowed; if base64 is absent, classification is skipped and the form remains available for manual entry. A save-time upload failure shows “Could not save this item” / “Your photo is safe. Please try again.” (`app/add-item.tsx:640-692, 743-773, 850-975`).

**Reproduction status:** The screenshot symptom was previously reproduced by the user and recorded in project status, but was **not independently reproduced in this audit**. The current Start Frontend workflow is failed: React Native DevTools cannot load `libglib-2.0.so.0`, and Metro also reported port 8081 in use. The backend is running and its development API route is reachable, but no physical device is connected and no image was submitted. No PhotoRoom or Gemini calls were made.

## 2. Change forensics

`git status --short` showed only the uploaded audit spec as untracked before this report. Recent relevant commits and file timestamps:

| Change | Evidence |
|---|---|
| The presentation/pipeline change added `server/garmentPng.ts`, switched the client from re-encoding PhotoRoom PNGs to JPEG to retaining PNG cutouts in cache, sent the actual MIME type to Gemini, and added the PNG trim/matte handling. | `f900c18` (2026-10-16 21:17 UTC); touched `app/add-item.tsx`, `app/bulk-review.tsx`, `lib/bulkClassifyCore.ts`, `server/remove-background.ts`, `server/classify-garment.ts`, new `server/garmentPng.ts`, `components/GarmentTile.tsx`, `constants/colors.ts`, and package manifests. |
| The bulk retry/error-state changes updated the PhotoRoom client and bulk classifier behavior. | `23c7f45` (2026-10-16 23:09 UTC); touched `app/bulk-review.tsx`, `lib/bulkClassifyCore.ts`, and `lib/photoroom.ts`. |
| The latest bulk change added the serial native resize queue and improved state/count presentation. | `ae68efb` (2026-10-17 00:18 UTC); touched `app/bulk-review.tsx` and `lib/bulkClassifyCore.ts`. Current file mtimes are Oct 17 00:15 for `app/bulk-review.tsx` and Oct 17 00:13 for `lib/bulkClassifyCore.ts`. |
| Other files in the spec’s list: `lib/classifyPath.ts` last relevant history is Sep 30; `server/index.ts` was changed Oct 16 22:45 for the no-cache API layer, not for image processing; the latest relevant `app/add-item.tsx` commit is Oct 16 21:58 (the Oct 16 image-pipeline change is `f900c18`). The server PNG/classifier files and `GarmentTile`/colors were last changed by `f900c18`. |
| `pngjs` was added as a direct runtime dependency at `^7.0.0`; the earlier lockfile version was 3.4.0. No `sharp` dependency is present or imported. | `package.json`, `package-lock.json`, and `git show f900c18`. |

**First changed bulk contract:** the source picker and first resize remain the front of the pipeline; the first material behavior change is after PhotoRoom succeeds. Previously the transparent PNG was re-encoded to JPEG for classification and display. Current code writes the PNG to a cache file, retains only its URI, and sends the PNG plus `image/png` to the classifier (`git diff f900c18^ f900c18 -- app/bulk-review.tsx lib/bulkClassifyCore.ts`).

**Dependencies/runtime:** `pngjs`, `expo-image-manipulator`, `expo-image-picker`, `expo-file-system`, Supabase JS, Axios, Express, and `express-rate-limit` are installed; `pngjs` and the app/server packages are listed in runtime dependencies, not only devDependencies. There is no `sharp` or associated native server requirement. `pngjs` loads in the test process and is imported by the PNG server code; the current backend starts successfully and reports its background-removal store ready. This verifies loading/startup, not processing a real PhotoRoom response on a production deployment.

The development frontend workflow command exports `EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN:5000`, and `lib/query-client.ts`/`lib/photoroom.ts` use that host for `/api` calls. The current backend’s unauthenticated `/api/user/billing/readiness` returned **401** (reachable route requiring auth); an OPTIONS request for `/api/classify-garment` returned **200** and an allowed development origin. Thus the development target is reachable and CORS preflight works. The current Metro workflow is not running, so this does not prove a device bundle is using it. No production deployment/restart or installed-app API base URL was verified.

## 3. Bulk pipeline, stage by stage

| Stage | Input → output / implementation | Failure handling and user-visible result |
|---|---|---|
| Picker/URI | `app/add-item.tsx:562-571` requests image-library permission, selects up to 10 images, and passes each `asset.uri` through route params to `/bulk-review`. Installed SDK 57 picker source copies Android selections to cache and returns a local file URI. The iOS path also produces a local file URL; its current-representation fast path can preserve the original file extension. The picker’s default quality is 1, so the input may remain HEIC/JPEG/PNG; the app does not inspect `asset.mimeType` or normalize before resize. No `content://` or `ph://` value was observed on a device in this audit. | Permission denial is surfaced by the add screen. URI parsing in `app/bulk-review.tsx` catches malformed JSON and yields an empty list, which navigates back. Actual selected URI/MIME/HEIC behavior on the user’s phone is not verified. |
| Start/concurrency | `STAGGER_MS = 150`; every selected URI schedules `classifyUri`. A `createSerialQueue()` now serializes only native resize calls. Once each resize completes, background-removal and classification network work can overlap. `runSaveAll` iterates through saves sequentially. | Two photos are below the server’s rate limits. For larger rapid batches, 9+ background-removal requests or 11+ classify requests within 60 seconds can be rate-limited. Classification 429 becomes “Analysis failed” and retry is manual; background-removal errors are optional and classification falls back to the original JPEG. No live burst test was run. |
| Resize | `app/bulk-review.tsx:531-540` calls `ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1024 } }], { compress: 0.8, format: JPEG, base64: true })`. This creates JPEG base64 when successful. | A rejected transform or absent base64 is the only normal path to `failureStage: 'photo-preparation'`; the card says “Could not prepare photo” / “Tap to retry”. `runClassifyUri` catches and discards the original error/stack (`lib/bulkClassifyCore.ts:106-110, 167-171`). Bulk bounds width, not longest edge. |
| PhotoRoom | `lib/photoroom.ts:86-122` obtains the current Supabase session and POSTs JSON `{ imageBase64 }` with `Authorization: Bearer …` to `/api/remove-background`. Server routes require auth and AI-processing consent; the server authenticates the JWT, checks server-side entitlement/quota, checks hash cache, then posts a JPEG Blob to PhotoRoom. The upstream timeout is 15 s. Free use is capped at 20 lifetime calls; premium bypasses the free quota; a cache hit avoids usage. | Guest/no-token is returned locally as `not-authenticated` (no PhotoRoom request). Transport/JSON errors are swallowed into `failed`; only the named PhotoRoom timeout is retried once by the client. Server non-2xx responses are parsed as JSON without checking `res.ok`. These statuses do not fail the card: the original resized JPEG continues. Bulk shows a sign-in banner on not-authenticated and a limit banner on quota exhaustion. UI copy says “for today” (`app/bulk-review.tsx:883`) while the server quota is lifetime (`server/remove-background.ts:25, 142-169`), a copy mismatch. |
| Cutout response/cache | On success, server validates PNG signature/dimensions, trims transparent margins using `pngjs`, and returns transparent PNG base64 (`server/remove-background.ts:254-308`, `server/garmentPng.ts:16-71`). Bulk writes it to `FileSystem.cacheDirectory/amodka-bulk-cutout-<uuid>.png`; only `cutoutUri` is retained in React state. | A cache write failure is swallowed and the original JPEG is classified. The cache is temporary and may be removed by the OS; the card preview falls back to the original URI if the cutout image fails to display. Save All does not make that same fallback, as noted in the TL;DR. Live response sizes after trimming were not measured. |
| Classification | `classificationImagePayload` validates base64 signatures and sends `{ imageBase64, imageMimeType }` to authenticated `POST /api/classify-garment`. Server body limit is 10 MB JSON. For PNG, the server composites alpha onto the neutral studio matte, then sends PNG to Gemini. Models are `gemini-flash-lite-latest`, then `gemini-2.5-flash` only if the first responds 429; each Axios attempt has a 20 s timeout. Client classification deadline is 45 s. | Server returns machine-readable errors for invalid input, malformed output, timeout, rate-limit, and provider/network failures. The client throws on non-2xx, and the core catches it as `classification`; the card shows “Analysis failed” / “Tap to retry”. No automatic classifier retry. Request bodies over the 10 MB JSON limit fail before the handler and likewise appear as analysis failure. |
| Settle/UI state | `runClassifyUri` checks `mountedRef` after resize, background removal, cache write, and classification. It sets a normalized classification on the matching URI only after success. | A late result after unmount is ignored. The outer catch stores only the coarse failure stage; it does not retain the actual exception. The retry button reruns the pipeline. The current bulk screen has no active auto-persist caller; persistence is through Save All. |
| Save/storage/wardrobe | Save All takes settled/local-only items, reads cached PNG when available or resizes the original URI to ≤1600 px JPEG, uploads through the signed-in user’s Supabase client to `wardrobe-images/{userId}/{itemId}.png|jpg`, obtains a one-hour signed URL, then commits one atomic batch through `insert_wardrobe_items`. The DB stores the durable `storagePath`, not the expiring signed URL (`lib/storage.ts:23-95`, `lib/database.ts:77-83`, `contexts/AppContext.tsx:1611-1645`). Guest saves copy into document storage, but normal bulk classification still requires a signed-in server session. | Upload or signed-URL failure is represented as local-only/pending and blocks navigation; it is not a cloud wardrobe save. Batch RPC errors restore review state and show “Could not save these items” / “Nothing from this batch was added. Check your connection and try again.” Uploaded image cleanup is best-effort and preserves uploads on ambiguous RPC outcomes. Storage owner-prefix policies exist in the migration, but the live bucket privacy/policies and actual 42501 behavior were not queried. |

**Guest path:** `removeBackground()` does not call PhotoRoom without a session; it returns `not-authenticated`. The subsequent Gemini classify route independently requires a Bearer token (`server/routes.ts:346-350`, `247-269`), so a guest’s classify request is rejected with 401 and the card becomes an analysis failure. Guest local document copying is present in Save All, but that does not make unauthenticated server classification succeed. This behavior is verified by code reading; no guest device request was made.

## 4. Single-item path and differences

| Stage | Single add behavior | Difference from bulk |
|---|---|---|
| Picker/resize | `app/add-item.tsx:554-580` uses the same image picker; one selected image enters single add. It has asset width/height and scales the **longest edge** to ≤1024 before JPEG base64 (`640-653`). | Bulk passes URI through the route and resizes width to 1024 without source dimensions. Single resize is not queued because only one image is processed. |
| PhotoRoom/preview/classification | Same `removeBackground()` and server route. On success single add writes a PNG cache file and sends its base64 to the same classifier (`658-687`, `694-697`). | Same PNG/MIME contract as bulk; older reports of JPEG re-encoding describe the before-state. |
| Classifier error | `classifyWithServer` maps API errors to `classification_unavailable`; caller shows “Auto-fill unavailable” and says the photo is safe and fields can be entered manually (`app/add-item.tsx:475-516, 743-762`). | Bulk exposes retry cards and does not offer the single form’s manual classification flow. |
| Save | Signed-in save reads PNG cache unchanged if cutout, otherwise resizes/re-encodes JPEG; uploads to Supabase Storage and commits one wardrobe item. Guest save copies local file into document storage (`app/add-item.tsx:850-950`). | Bulk Save All uploads sequentially and commits an atomic batch. Single upload requires a valid session for cloud save; errors show a generic alert. |

**End-to-end status:** Single add has not been confirmed working on a physical device or through a real signed-in account in this audit. Automated tests exercise pure/server behavior, not the complete picker → native decode → real PhotoRoom/Gemini → Storage → wardrobe flow. Single add’s resize catch does not expose a native exception; when it leaves `classifyBase64` empty, classification is skipped and the form remains available to fill manually.

## 5. Swallowed/downgraded error inventory

The following are the upload-pipeline catches that hide, downgrade, or normalize the original failure. Unrelated JSON parsing and non-upload catches are omitted.

| File/lines | Hidden or downgraded error |
|---|---|
| `lib/bulkClassifyCore.ts:114-130` | Any PhotoRoom or cutout-cache write exception is swallowed; original resized JPEG is used instead. |
| `lib/bulkClassifyCore.ts:167-171` | Resize/classification exceptions are caught; only status and a coarse stage are retained, not message/stack. This prevents diagnosing the native prepare failure from app state. |
| `lib/bulkClassifyCore.ts:263-270` | Storage cleanup errors are swallowed to preserve the original save outcome. |
| `lib/bulkClassifyCore.ts:277-286` | Session retrieval errors are reduced to the save-error callback and generic UI alert. |
| `lib/bulkClassifyCore.ts:349-354` | Any signed-in upload/read/URL failure is converted to local-only/pending; the original exception is discarded. |
| `lib/bulkClassifyCore.ts:379-385` | Save preparation errors become `status: 'error'`; the underlying cause is not retained. |
| `lib/bulkClassifyCore.ts:417-431` | Batch RPC errors are shown through a generic callback; uploaded images are deleted only when the error code confirms rejection, not for ambiguous transport outcomes. |
| `lib/photoroom.ts:49-72, 86-127` | Network/response parsing and session errors become null/status values. The optional feature falls back to the original JPEG, but exact transport/HTTP error details are lost. |
| `lib/query-client.ts:119-139` | Failure to import/get the Supabase session is ignored and the request proceeds without a Bearer token; server then rejects it. No explicit 401 refresh-and-retry exists in this helper. |
| `app/add-item.tsx:673-687` | PNG cache write errors are swallowed; original JPEG remains the preview/classifier fallback. |
| `app/add-item.tsx:640-692` | Single-add resize errors are swallowed; no error/stack is retained, and absent base64 skips auto-classification. |
| `app/add-item.tsx:500-516, 743-762` | Classifier failures are reduced to `classification_unavailable` and a manual-entry alert. |
| `app/add-item.tsx:890-892, 951-975` | Save resize/upload/DB failures are presented as a generic save alert; cleanup errors are only warned. |
| `lib/storage.ts:89-92, 170-176` | Failed signed-URL creation triggers best-effort object cleanup; image recovery lookup suppresses signed-URL errors and returns null. |
| `server/remove-background.ts:137-140` | Entitlement lookup failure defaults to non-premium, not unlimited access. |
| `server/remove-background.ts:149-156, 218-224` | Quota-store failures are reported and return 503; error detail is not returned to the client. |
| `server/remove-background.ts:172-187` (cache-store implementation) | Code comments document cache lookup failures as internally handled and treated as cache misses. |
| `server/remove-background.ts:198-204, 284-289, 310-324` | Cache/PNG/provider errors are reported with safe metadata and converted to stable HTTP errors; raw provider response is not exposed. |
| `server/classify-garment.ts:855-860, 965-970, 986-1064` | Invalid PNG, malformed Gemini output, and provider/network failures are reduced to stable safe error codes. Provider exception bodies are not returned. |

## 6. Shared infrastructure and environment

- **Secrets/config names:** Development and production secret-status views show `SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `GEMINI_API_KEY`, and `PHOTOROOM_API_KEY` present. `SUPABASE_SERVICE_ROLE_KEY` and `EXPO_PUBLIC_DOMAIN` are not stored as secrets. The app’s development workflow sets `EXPO_PUBLIC_DOMAIN` from the Replit development domain; current backend logs confirm the PhotoRoom key is configured without exposing it. The code uses `SUPABASE_SECRET_KEY`; a separate service-role variable is not required by this code. **The PhotoRoom key’s `sandbox_` prefix could not be verified:** Replit’s secret-status view intentionally does not reveal the value, and no provider request was made.
- **Development server/domain:** Start Backend is running on port 5000; it reports the background-removal store ready. Development-target API reachability and CORS preflight were checked as described above. This does not establish production deployment state or the base URL embedded in an installed production app.
- **Frontend workflow / Expo Go:** Start Frontend is failed. Current logs show missing `libglib-2.0.so.0` while installing React Native DevTools and `EADDRINUSE` on port 8081. This is the Replit frontend/DevTools environment and port, not proof of an app `ImageManipulator` native-module failure. It prevented a fresh preview/device reproduction. No new Expo Go/native-module exception was observed in this audit.
- **CORS/body/deadlines:** Development Replit origin preflight succeeds. Express JSON parsing caps request bodies at 10 MB (`server/index.ts:110-117`). Client classification timeout is 45 s; classifier provider attempts are 20 s each and tries the fallback model only after a 429. PhotoRoom server timeout is 15 s and the client retries once only for its named timeout response. The client has no separate deadline around the background-removal request itself.
- **Rate limits:** `/api/classify-garment` uses `aiLimiter` (10 per 60 s); `/api/remove-background` uses `bgRemovalLimiter` (8 per 60 s), both persistent-store limiters (`server/middleware/rateLimiter.ts:758-780`). A rapid batch larger than either threshold can trip it. A classify 429 makes that card fail until manually retried; background-removal rate-limit failures are downgraded and classification continues on the original resized JPEG. No live burst simulation was run.
- **Photoroom:** Free-tier quota is 20 lifetime uses; premium entitlement bypasses that quota. Cache hits are checked before quota reservation and avoid the upstream call. Server reports `PHOTOROOM_API_KEY` set. No sandbox restrictions or real response sizes can be stated because the key prefix and provider response were not inspected.
- **Gemini:** Models and fallback behavior are listed above. The current backend log contains no classifier request for the device failure; no live Gemini quota/provider result was observed. Tests mock Axios and validate success, 429 fallback, timeout, malformed output, and safe error responses.
- **Storage/RLS:** `lib/storage.ts` uploads via the signed-in client to `wardrobe-images`, stores owner-scoped paths, requests signed URLs, and deletes both `.jpg`/`.png` variants. The migration defines authenticated own-prefix SELECT/INSERT/UPDATE/DELETE policies. No Supabase data/dashboard was queried; therefore actual bucket privacy, applied migration state, signed URL generation, and live 42501 errors remain unverified. Current backend startup logs contain no upload/42501 evidence; Storage uploads are initiated by the app client, so backend logs alone would not prove their success.
- **Log hygiene:** API request logs record request ID, method, route, status, duration; classifier logs include stage, MIME, byte count, image hash, model identifiers, and status, but not raw image/prompt contents. `removeBackground` and `runClassifyUri` suppress most causes before they can be correlated. No temporary diagnostic logs were added.

## 7. Tests and checks

Commands run during this audit:

| Command | Result |
|---|---|
| `npm test` | Passed: runner summary **97 passed, 0 failed**. Includes bulk core, remove-background, PNG handling, and classifier server/integration tests. Tests use fixtures/mocks; they do not prove a real device, PhotoRoom, Gemini, or Storage journey. |
| `npm run typecheck` | Passed (`npx tsc --noEmit`). |
| `npm run lint` | Passed (`npx expo lint`). |

The test run emitted existing `react-test-renderer` deprecation warnings. No lint or TypeScript failure was observed. The separate `reports/garment-image-presentation.md` reports an earlier 95-passed run and explicitly says physical-device and signed-in visual validation were not performed; the current 97-pass result is newer, not contradictory.

## 8. Reproduction record and next device action

**Raw current-workspace observations (redacted):**

```text
Start Backend: PHOTOROOM_API_KEY is set; background-removal store ready; server listening on port 5000.
Development GET /api/user/billing/readiness without auth: HTTP 401 (route reachable; authentication required).
Development OPTIONS /api/classify-garment: HTTP 200; development origin allowed.
Start Frontend: React Native DevTools could not load libglib-2.0.so.0; Metro also reported EADDRINUSE on 127.0.0.1:8081.
Device upload reproduction / native ImageManipulator stack: not captured in this audit.
PhotoRoom / Gemini calls during this audit: none.
```

The current code does **not** emit the requested `[bulk:resize]` / `[bulk:bgremoval]` / `[bulk:classify]` stage logs. No such temporary instrumentation was added, because the frontend was unavailable and no physical device was connected; adding logs without being able to capture the requested reproduction would not identify the native exception. Existing device action, once Metro is available: sign in, open Add Item, select exactly two gallery photos, let Batch Review run, and tap Retry only if a card fails. Client-side native logs would appear in Expo Go/Metro console; server request and provider-stage logs appear under Start Backend. If resize fails, expect no background-removal/classification POST and no PhotoRoom quota use. Current code will not print the native resize error/stack, so capturing that exact exception requires a later, narrowly scoped temporary diagnostic build/session.

## 9. Open questions not answered by this audit

1. What exact exception (or missing base64 result) did `ImageManipulator` produce for the two photos, and what were their dimensions, MIME types, and formats (especially HEIC)?
2. Does the signed-in physical Android device use the current SDK 57 dev bundle and the current development backend, or a stale QR/session/installed build?
3. Does a real single-item add complete through Storage and wardrobe persistence on that device?
4. Is the PhotoRoom key sandbox or production, what are its current account-specific limits, and what size does a real trimmed PNG response have?
5. Is `wardrobe-images` currently private in the live Supabase project, are the reviewed policies applied, and does an actual upload/createSignedUrl succeed without 42501?
6. Does an OS cache eviction reproduce the local-only Save All issue described above?

## 10. Proposed fixes — not implemented

| Proposal | Risk / validation needed |
|---|---|
| Capture a sanitized, temporary start/success/failure log around the native resize (dimensions, format/MIME, URI scheme, error name/message/stack; never URI query secrets, user data, or image bytes), then repeat one two-photo device run. Remove the instrumentation immediately after collecting logs. | Diagnostic-only, but logs must be reviewed for local paths or user-derived text before sharing. This is the shortest way to identify the actual exception. |
| Resize bulk images by the longest edge, matching single add, and test portrait/landscape inputs. | Could change output dimensions and memory/latency; verify orientation and image quality on Android/iOS. |
| Normalize or explicitly handle supported source formats before manipulator decode, especially HEIC on older Android devices. | Avoid blanket conversion that adds unnecessary work or degrades supported JPEG/PNG; test actual target Android OS versions and iOS. |
| If a cached cutout cannot be read at save time, fall back to the original selected photo for upload, or reset/rebuild the cutout state so retry can recover. Apply the analogous behavior to single add. | Must preserve transparency when the cache is available and accurately mark cloud/local-only outcomes; test cache eviction and upload failure separately. |
| Change “Background removal limit reached for today” to match the server’s 20-lifetime-use policy, or change quota semantics only through a separate explicit product decision. | Copy-only correction is low risk; changing quota accounting would affect product policy and is not recommended as part of this audit. |
| Keep the actual resize exception (sanitized) observable in retry state or diagnostic logs rather than mapping every failure to the same preparation label. | Error text must be safe for users/logs; tests should ensure no file contents, tokens, or personal data are logged. |

## 11. Temporary changes

**None.** No code logs were added or removed, and no pipeline/configuration/data changes were made. This report is the only file created by this audit.
