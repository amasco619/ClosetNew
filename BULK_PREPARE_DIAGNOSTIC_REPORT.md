# Bulk “Could not prepare photo” diagnostic capture

**Status:** Diagnostic build is running; the cause is not yet known. No upload/resize fix was made.

## Changes

- **Temporary:** `.replit` sets supported `EXPO_UNSTABLE_HEADLESS=1` (Expo maps it to `enableStandaloneFuseboxShell: false`) and prints a short build stamp. In-memory `__DEV__` diagnostics in core, bulk review, and single add capture stage/error/first five stack lines, URI scheme/extension, known dimensions, queue use, and elapsed time. Full paths, image bytes, and credentials are redacted; logs use `[bulk:prepare]` / `[single:prepare]`.
- **Regression tests:** added isolated queue tests plus diagnostic redaction/state coverage. Queue implementation and production behavior/copy are unchanged.

Stopped the stale port-8081 owner (PID 491). Restart now has **one** Expo/Metro listener; `GET /status` returns `packager-status:running`. Start Frontend is **RUNNING** without the DevTools/GLib or port-conflict error.

**Build stamp:** `0f1fa14-dirty-20261017T093228Z` (shown at the Batch Review footer in development; not physically verified).

## Queue tests

`npm test -- bulkSerialQueue.test.ts photoPrepareDiagnostic.test.ts bulkReviewMountedGuard.test.ts`: **3 passed, 0 failed** (96 skipped); typecheck and lint pass. The queue preserves strict order and recovers after async rejection and synchronous throw. A never-settling native task blocks later work indefinitely; this is expected without cancellation, since advancing could overlap memory-heavy decodes. No queue defect was found. Diagnostic state/redaction tests pass.

## Picker/resize timeline

| Point | URI path and resize behavior |
|---|---|
| Point | Diff |
|---|---|
| Before `f900c18` → `f900c18` | Picker still passes up to 10 asset URIs in `/bulk-review` route params. Resize call/arguments are unchanged: width 1024, JPEG, quality 0.8, base64. `f900c18` changes only post-PhotoRoom PNG handling, so cannot cause a resize-stage error. |
| `23c7f45` | Adds coarse preparation/classification failure labels and retry; no picker or resize change. |
| Current (`ae68efb`; HEAD `0f1fa14`) | Same URI/resize arguments with a shared serial queue. This is the first shared gate; rejection recovery works, while a never-settling task blocks later items. It does not explain cards failing with “Could not prepare photo”; no inspected change explains a native rejection for every image. |

## Phone steps and logs

1. Scan the current QR with SDK 57 Expo Go; verify Batch Review shows `0f1fa14-dirty-20261017T093228Z`.
2. Sign in. In single Add Item, select each of the same two photos separately; note resize/cutout/classification/save-prompt results, then cancel without saving.
3. Select those two photos together and wait in Batch Review.
4. If either fails, screenshot the card and stamp; copy `[bulk:prepare]` from **Start Frontend** logs. Do not send the photo or credentials. If both succeed, report that and the single-item results.

Metro diagnostics appear in **Start Frontend**; API request/status records in **Start Backend**. Healthy: both cards classify and `/api/classify-garment` returns 2xx; optional PhotoRoom failure can still fall back to the resized JPEG.

**Not verified:** no physical-device journey was available to this audit. Native error, actual file formats/dimensions, and on-device stamp visibility still need your capture.
