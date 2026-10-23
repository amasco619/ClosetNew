# Guest-sync large-photo fix

## Changes and scope

- `lib/guestWardrobeSync.ts`: removes the redundant full-original Base64 read. The managed URI goes directly to the existing bounded native preparation helper, then only its bounded output goes to Storage. Guest save-time copying is unchanged.
- `lib/storage.ts`: splits the existing wardrobe uploader into preparation and network halves, retaining the same path/MIME/upsert/signed-URL behaviour for existing callers. The new network half reports upload/signed-URL stages and preserves error status through causes. The existing unsigned-upload cleanup warning now logs a fixed code and optional status instead of a raw error.
- `lib/storageUploadBounds.ts`: adds stage/status preservation and bounded-depth inspection of nested errors for permanent, connectivity and timeout classification.
- `lib/guestWardrobeMigration.ts`: runs preparation outside the per-photo 20-second deadline; stores sanitised diagnostics in the existing journal; stops automatic retries after three consecutive unrecognised failures; resets the counters on explicit manual retry.
- `__tests__/guestPhotoSyncFailures.test.ts`: new focused regression suite.
- `__tests__/guestWardrobeMigration.test.ts`: production-adapter fixture prohibits full-original Base64 reads and proves the managed URI reaches bounded preparation.
- `__tests__/storageUploadBounds.test.ts`: verifies shared-path wiring and real uploader stage/status propagation through a synthetic signed-URL failure, alongside its existing byte/edge/MIME and original-retention checks.
- `TECHNICAL.md`: documents the behaviour and current suite inventory.
- This report: implementation evidence, deferred design and verification limits.

No server, database, bucket, consent, limiter, classifier prompt/vocabulary, recommendation-engine, frozen-artifact, billing or migration changes were made. No live provider/storage/database operations were used for verification. No deployment or publication occurred.

## Failure behaviour

The previous adapter allocated Base64 for the original before passing a URI into a helper that already decodes/resizes that URI. The previous 20-second upload race also included that local preparation. Removing both problems avoids that redundant original-size allocation and stops slow local preparation from consuming the upload deadline. It does not prove the exact failure on the physical phone.

The network deadline now starts after local preparation and covers upload plus signed-URL resolution. Existing separate metadata/insert deadlines remain unchanged.

Each failed photo-transfer attempt stores `lastUploadFailure` and logs one line with the identical JSON fields:

| Field | Meaning |
|---|---|
| `stage` | `prepare`, `upload` or `signed-url` |
| `code` | Allowlisted category, generated `HTTP_<status>`, or `UNRECOGNISED` |
| `status` | Optional HTTP status, if available |
| `elapsedMs` | Total failed photo-transfer attempt duration, including preparation |
| `attemptCount` | Attempts in the current cycle; reset by manual retry or successful upload |

No raw error message, local URI, token, owner ID or garment ID is added to those diagnostic fields. The journal already contains the item/local URI as before; that existing item data is not copied into diagnostics.

Only consecutive **unrecognised** errors advance `unrecognizedFailureCount`. Known HTTP failures (including 408/429/5xx), known timeouts and network/DNS failures do not advance it and reset the unknown sequence. Known permanent rejections retain their existing immediate manual-only failure behaviour. After the third unknown error, the existing `uploadError` marker drives **Upload failed** and **Retry failed uploads**. Foreground/restart sync skips that entry until manual retry clears the marker and counters. Offline never becomes permanent or manual-only merely because of repeated attempts.

Manual retry retains the last diagnostic for inspection until a later failure or success replaces/clears it. A successful upload clears its failure counters/diagnostic. Local originals are not resized, overwritten or deleted by these failure paths. Existing source reclamation only after confirmed garment-row persistence is unchanged.

Diagnostics here cover attempted photo preparation/upload/signed-URL work. Existing migration preflight/snapshot and row-insert error handling is unchanged; these are not represented as photo-transfer stages.

## Item 5 — late-completion design only

### Current behaviour and risk

`uploadPreparedWardrobeImage` chooses `${userId}/${migrationId}.jpg` or `.png`, based on MIME. The owner and migration ID are retained in the local journal. Retries for the same entry/format therefore reuse the same logical path with `upsert: true`; they do not intentionally create another object key. Row reconciliation also uses the stable migration ID.

The 20-second deadline remains `Promise.race`, not cancellation. If it wins, the underlying Storage request can still finish. If upload/signed-URL work eventually succeeds after the controller has moved on, the path is not recorded from that late result and no garment row is inserted for that attempt. A logical object can therefore remain orphaned if the entry never successfully finalises. A later retry overwrites/reuses that same key; that prevents a second path, but is not an atomic upload-and-row commit.

A signed-URL failure still attempts the existing immediate object cleanup; cleanup can fail, also leaving an orphan. Concurrent old/new attempts on the same path can race: an older cleanup must not be allowed to delete a newer retry's valid object.

### Proposed idempotent fix — not implemented

1. Give each owner/migration-ID operation a durable, owner-checked upload intent containing its canonical immutable object path, content fingerprint and generation/status.
2. Reuse the same idempotency key across retries. On timeout, treat the result as ambiguous and reconcile the existing garment row and matching object/intent before re-uploading or inserting. A matching completed operation returns its existing row/path.
3. Finalisation must be idempotent and conditional on the intent's owner, generation and content identity. Late completion can finalise that operation but cannot overwrite a newer generation.
4. Use durable reconciliation/cleanup receipts for abandoned, uncommitted intents. Cleanup needs a grace period plus row/generation checks; never delete solely because a client timer expired or a response was lost.

This stronger design needs separate approval for server/database/storage permission and lifecycle work. It is deliberately absent from this patch. Risks include content-hash and existing-path migration compatibility, check/upload/finalise races, extra requests, retaining abandoned images too long, deleting a referenced newer image, account deletion/switch races, and preserving current wardrobe capacity/consent boundaries. Required future tests include concurrent retries, late success, lost upload/insert acknowledgements, signed-URL failure with cleanup failure, and account deletion during finalisation.

## Verification results

All final gates passed:

| Check | Result |
|---|---|
| `npm test` | **130 passed, 0 failed** |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| Golden regression set | **35 passed, 0 failed**; Engine v3.7 unchanged |
| Benchmark validator | **100 cases**, 84 fixtures, 100 signed labels; **53 frozen checksums passed** |
| Android export | Passed; bundle exported to `/tmp/amodka-guest-sync-android` |
| Frontend refresh | `Start Frontend` restarted, fresh Metro serving port 8081; public landing page rendered |

Focused tests prove no original Base64 read in the adapter; preparation longer than a shortened test deadline still succeeds; signed-URL work remains inside that deadline; stage/status metadata reaches diagnostics; raw fixture errors/URIs do not reach the logged diagnostic; only unknown failures reach the ceiling; restart skips paused entries; manual retry resets the cycle; offline/DNS and known HTTP/timeout errors never count; original references remain unchanged and real native-adapter tests never delete local source paths.

## Not verified on a device

- No physical Android/iOS test was performed, and no real 27 MB phone photo was decoded in native ImageManipulator during this turn.
- No real airplane-mode/foreground/reopen/manual-retry journey was performed on a phone. Offline behaviour is verified with isolated transport-error fixtures.
- No live Storage upload, induced live 20-second timeout, late-completion race, weak-network/load test or remote orphan reconciliation was performed.
- The refreshed browser landing page verifies that the frontend loads, not that the native guest-to-account journey works on a device. Existing web shadow-style deprecation remains outside this task.
- Native preparation has no newly introduced watchdog; it intentionally no longer consumes the network deadline.

## Deviations

None. Item 5 is design only. Protected code/configuration/data was not changed, and all requested gates and the frontend refresh were completed.
