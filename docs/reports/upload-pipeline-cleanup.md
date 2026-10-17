# Amodka upload pipeline cleanup

## Scope and files

Bounded A1–D and E1–E6 cleanup. No deployment, migration, dependency installation, provider purchase or live user-data operation.

Runtime: `app/add-item.tsx`, `app/bulk-review.tsx`, `lib/bulkClassifyCore.ts`, `lib/classificationRefusal.ts`, `lib/photoroom.ts` (reporting only), new `lib/uploadErrors.ts`, `lib/uploadPhotoSource.ts`, `lib/uploadRetry.ts`, `server/classify-garment.ts` (primary model configuration only), `.replit` (headless comments only).

Tests: new `__tests__/uploadCleanup.test.ts`; updated `__tests__/classifierRefusal.test.ts` for the explicitly requested unexpected-error retry policy.

Documentation: `TECHNICAL.md`, `AMODKA-PROJECT-STATUS.md`, this report and the upload-flow memory note. Existing audit, bulk diagnostic and classifier-refusal reports moved unchanged into `docs/reports/`.

## A1 — Missing cutout cache

Readable transparent PNGs are still uploaded unchanged. Save All reads the cached PNG at save time; absent/empty/unreadable cache falls back to storage preparation of the immutable staged original. Authenticated single save uses the same cache-read helper and falls back to its retained original source. Guest bulk saves use the same selection; single guest copy retries from the original when its cutout copy fails.

No PhotoRoom request is needed to recover a missing cache. A real cloud-upload failure remains a failed save: no successful batch commit/navigation is reported and affected items remain pending/local-only. Existing ambiguous-database-response cleanup safeguards remain intact.

Tests exercise cached/missing/empty PNGs for authenticated and guest Save All, and separately prove a cloud failure does not trigger a second upload or database write. Single integration is covered by the shared cache helper and source-contract checks, not a native filesystem test.

## A2 — Initial preparation parity

The preceding shared-helper implementation is retained unchanged: decoded orientation/dimensions, longest edge ≤1024, no upscaling, aspect-preserving resize and JPEG quality 0.8. No additional encoding of a successful cutout.

| Decoded original | Previous single | Previous bulk, width 1024 | Current single and bulk |
|---|---|---|---|
| 3000×4000 portrait | 768×1024 | 1024×1365 | 768×1024 |
| 4000×3000 landscape | 1024×768 | 1024×768 | 1024×768 |
| 2048×2048 square | 1024×1024 | 1024×1024 | 1024×1024 |
| 768×1024 portrait | 768×1024 | 1024×1365 | 768×1024 |
| 240×320 small | 240×320 | 1024×1365 | 240×320 |

Before values are calculated from the former resize policies; current values are validated by mocked native-transform tests, not fresh physical-device pixel captures. Gemini can still vary between calls; parity does not guarantee identical classifications or prove higher measured accuracy.

## A3 — Allowance copy

Free remaining/limit banners now explicitly describe the 20 lifetime background removals; the misleading “for today” wording and premature “saved as-is” claim are removed. No quota counters, limits or entitlement rules changed.

## B1–B3 — Diagnostic boundary

- Default OFF. Preparation logs, staging cleanup logs, card diagnostics and the batch build stamp require both `__DEV__` and `EXPO_PUBLIC_UPLOAD_DIAGNOSTICS=1`. Restart Metro after changing that flag.
- Temporary diagnostic logs use `console.log`, not warnings.
- The existing formatter is retained for opt-in development use but returns immediately in release; production minification eliminates its formatting body and strings.
- `reportUploadError({stage,code})` accepts only allowlisted stage/code values. It cannot emit supplied paths, user data, raw errors, names or stacks. It is an opt-in dev log and a release no-op. Calls cover preparation, background removal, cutout writes/cache misses, classification, upload and save catches. PhotoRoom request/retry logic is unchanged.

## C1–C3 — Runtime and repository

Headless Expo CLI stays permanently enabled and is now explained beside the workflow: avoid container desktop DevTools/GLib failures while retaining Metro/Expo Go.

`GEMINI_PRIMARY_MODEL` optionally pins the primary model. Unset/blank still means `gemini-flash-lite-latest`; fallback remains `gemini-2.5-flash` after 429 only. Resolved-model logging stays unchanged. No environment setting was actually changed.

Reports moved without content changes:

- `AUDIT_REPORT.md` → `docs/reports/AUDIT_REPORT.md`
- `BULK_PREPARE_DIAGNOSTIC_REPORT.md` → `docs/reports/BULK_PREPARE_DIAGNOSTIC_REPORT.md`
- `reports/classifier-pairs-refusal.md` → `docs/reports/classifier-pairs-refusal.md`

Logical commit groups: runtime configuration/comments; upload recovery/diagnostics/retry UX and tests; documentation/report organization. The supplied attachment is intentionally not committed:
`attached_assets/Pasted-AMODKA-UPLOAD-PIPELINE-CLEANUP-small-safe-changes-only-_1792266537835.txt`.

## D — Source of truth

Technical/status documentation now describes shared preparation, unchanged transparent PNG classification/save, save-time original fallback, ID-only bulk navigation, the new failure/retry policy, lifetime copy and opt-in diagnostics. Obsolete current-pipeline descriptions of JPEG-flattened cutouts were replaced. Historical reports retain their original contents.

## E1–E6 — Calm failures and explicit retry

- Network/timeout/408/429/5xx: “Connection paused” / “Tap to try again,” normal-contrast photo and neutral surface/icon.
- Confirmed content refusal: unchanged “We couldn’t read this photo” with manual entry/removal and no classifier retry.
- Unexpected failure: “Something went wrong” / “Tap to try again,” subtle accent rather than a full red tile.
- Single-item non-refusal failures now use inline retry/manual actions, not the previous auto-fill alert.
- Two or more transient bulk errors expose “Try all again.” One attempt per eligible photo, serial execution using the existing serial-queue utility; the existing resize queue is retained. The screen waits when its own rolling classification-start window reaches 10/min. The server remains authoritative for other requests/devices.
- Successful cutouts are reused; PhotoRoom is not repeated even if its cache was evicted. Removed cards are skipped/kept removed, Save All stays disabled during batch retry, and unmounted queues do not start further cards.
- The counter separates successful analyses from transient “need another try” and unexpected failures.
- Optional proactive offline detection was skipped because NetInfo is not installed; no dependency was added.

## Verification actually run

| Check | Result |
|---|---|
| `npm test -- uploadCleanup.test.ts classifierRefusal.test.ts classificationPreparation.test.ts bulkSaveAtomic.test.ts` | 4 suites passed, 0 failed, 99 skipped |
| `npm test` | 103 suites passed, 0 failed |
| `npm run typecheck` | Passed |
| `npm run lint` | Final run passed, 0 warnings/errors |
| `npx tsx __tests__/recommendation-golden-set.ts` | 35 passed, 0 failed |
| `EXPO_PUBLIC_UPLOAD_DIAGNOSTICS=1 npx expo export --platform android --no-bytecode --output-dir /tmp/amodka-upload-cleanup-release --max-workers 2` | Passed; one ~6 MB Android JS bundle |
| `git diff --check` | Passed |
| `git diff --exit-code HEAD -- constants docs/recommendation supabase shared lib/prepareClassificationImage.ts lib/bulkPhotoSelection.ts lib/query-client.ts lib/revenuecatClient.ts server/remove-background.ts server/bgRemovalStore.ts` (before commits) | No protected-path changes |

Initial checks exposed the old non-transient retry expectation and a new fixture's widened category type; both were corrected. Intermediate lint warnings from unused bindings/imports were removed. No remaining test failure or final lint warning.

Release-bundle searches: `pickerHash` **0**, `stagedAtPick` **0**, `sincePick` **0**, `withDeadline` **0**. `ApiRequestError` **3**, all network-library export/constructor/typed-error references, not visible text. Release-transformed Add Item and Batch Review sources contain no diagnostic formatter calls, `ApiRequestError`, `withDeadline` or stack-rendering paths. The reporter is additionally tested as a release no-op even with the flag ON. This is not a claim that every internal error class was removed from the application.

## Protected areas and limitations

Recommendation scoring/ranking/generation/rotation/weather, frozen benchmark artifacts, schema/RLS, auth, billing/RevenueCat, classifier prompt/schema/post-processing, quota enforcement and staging-helper behavior were not changed. Model configurability is the only classifier-server change; PhotoRoom client change is sanitized reporting only.

No new live-provider, native upload, account or physical Android/iOS journey was performed in this cleanup. Native cache eviction/guest fallback, EXIF decoding, accessibility and real offline/reconnect interaction still need device confirmation. Original-photo loss cannot be repaired if both cached cutout and selected original are gone. Release export/source checks and mocked tests do not substitute for physical-device validation. Nothing was published or deployed.
