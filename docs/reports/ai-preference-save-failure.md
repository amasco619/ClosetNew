# AI preference save failure — evidence, correction and verification

## Scope and outcome

Diagnosed before editing. Corrected the preference limiter, Profile's
request lifecycle/error visibility, and misleading Bulk Review waiting
presentation. Existing opt-in default, approved provider disclosure text,
server fail-closed enforcement, manual paths and guest-origin rules remain.
No live account preference was changed for validation.

## 1. Pre-edit log evidence

Requested interval: **2026-10-18 22:15–23:15 UTC**.
The available local backend snapshot was
`/tmp/logs/Start_Backend_20261018_233315_889_1af119fa.log`.
Its snapshot header says 23:33:15.889 UTC; individual request records contain
**no timestamps, response bodies, limiter names, or account/device identities**.
Therefore the exact interval, exact response error codes, device attribution,
and per-request times cannot be recovered. These are local development-server
logs, not a production-service audit. No older timestamped server history was
available in the inspected log directory.

The snapshot contains **54** preference requests: 14 GET 200, 4 PUT 200,
and **36 PUT 429**. No POST preference request appears; no POST preference route
exists in the inspected implementation. No preference 401/503 appears here.
The later pre-edit snapshot contained an entitlement GET 200 and no additional
preference request.

Every observed request is listed below by source log line. **Time is unknown
for every row.** Codes/limiter attribution come from pre-patch route wiring,
not response-body evidence:

- **R** = GET, `requireAuth`, no route limiter; successful response, no error.
- **W** = PUT, `accountLimiter` before `requireAuth`; successful response, no error.
- **L** = PUT, `accountLimiter`; expected error `rate_limit` inferred from
  its handler. Actual body was not logged.

| Source line | Method | Status | Attribution |
|---:|---|---:|---|
|22|GET|200|R|
|23|PUT|200|W|
|24|PUT|429|L|
|25|PUT|429|L|
|26|PUT|429|L|
|27|PUT|429|L|
|28|PUT|429|L|
|29|GET|200|R|
|30|PUT|429|L|
|31|PUT|429|L|
|32|PUT|429|L|
|33|PUT|429|L|
|34|PUT|429|L|
|35|PUT|429|L|
|36|PUT|429|L|
|39|GET|200|R|
|40|PUT|429|L|
|41|GET|200|R|
|46|GET|200|R|
|47|PUT|429|L|
|48|PUT|429|L|
|49|PUT|429|L|
|50|PUT|429|L|
|51|PUT|429|L|
|52|PUT|429|L|
|53|PUT|429|L|
|54|PUT|429|L|
|55|PUT|429|L|
|56|GET|200|R|
|57|PUT|429|L|
|58|GET|200|R|
|59|GET|200|R|
|60|GET|200|R|
|61|PUT|429|L|
|62|PUT|429|L|
|63|PUT|429|L|
|64|PUT|429|L|
|65|PUT|200|W|
|67|GET|200|R|
|70|GET|200|R|
|71|PUT|200|W|
|72|PUT|200|W|
|73|GET|200|R|
|76|GET|200|R|
|77|PUT|429|L|
|78|PUT|429|L|
|79|PUT|429|L|
|80|PUT|429|L|
|81|PUT|429|L|
|82|PUT|429|L|
|83|PUT|429|L|
|84|PUT|429|L|
|85|GET|200|R|
|86|PUT|429|L|

### Limiters and sequence reconstruction

Before patch, `server/routes.ts:499` applied the **5/hour per-IP
accountLimiter** to PUT. The pre-edit `server/middleware/rateLimiter.ts:762`
configured that budget. It also protects destructive account operations.
GET had only `requireAuth`. Neither used `authLimiter` (5/15 minutes per IP,
shared by sign-in/sign-up/reset) or `aiLimiter` (10/minute for classification).
Sign-up/sign-in did **not** consume the preference bucket. Sign-out does not
reset it; persistent counters survive process restarts.

A sequence of decline, allow, off, allow, off consumes all five preference
writes in an hour; another toggle fails. Other account mutations or users
behind the same IP could consume that budget too. The observed 429s establish
a real limiter failure mode, not a presumed Supabase outage. They do not prove
that every reported device interaction had the same cause.

### Supabase update/error path (unchanged)

`server/aiProcessingConsent.ts:17–44`: Admin `getUserById` reads current
`app_metadata`; the setter copies its keys, replaces only
`amodka_ai_image_processing`, then calls Admin `updateUserById`. Read failures,
missing users and update failures throw; the preference routes return 503
`ai_processing_preference_unavailable`. Invalid write input returns 400
`invalid_ai_processing_preference`. Authentication can return 401 before
metadata access. Stale JWT metadata is not the enforcement source.

This is a read/modify/write, not compare-and-swap: concurrent clients may
overwrite the preference, and unrelated concurrent app-metadata writes can
race. A read-back confirms the value at that instant, not a permanent lock.
No observed preference 503 establishes an admin outage in this snapshot.

## 2. Client trace and root causes

### Profile

Before patch, `app/(tabs)/profile.tsx:138–144,177–244` held independent
`aiProcessingPreference`, `aiPreferenceLoading`, `aiPreferenceSaving`,
`aiPreferenceError`, `aiPreferenceUnavailable`, `aiPreferenceRetry`,
and `showAiConsent` state. It already refreshed on focus, but its effect did
not include the active account ID and write callbacks were not invalidated
on focus/account changes. Upload choices were not in a shared persistent
client cache: they were written server-side, while Profile held its own local
snapshot. No AsyncStorage consent cache exists in this path.

Save failures used generic copy; the error lived in the Profile row, behind
the native disclosure modal. Save errors had no retry control (only load
errors did). The no-change switch branch returned before clearing an existing
error. The switch wasn't deliberately optimistic, but a PUT acknowledgement
was accepted without authoritative re-read.

Before patch, `components/AiProcessingConsent.tsx:26–34,164–177` blocked dismiss
while busy and disabled both actions. Thus a stalled save could make "Not now"
unusable. A normally completed 429 alone did not prove an infinite busy state:
the handlers did have `finally` resets. Missing visible modal errors could
nevertheless make Allow look inert.

`lib/query-client.ts:21–48,114–145` already bounded session/fetch/header work
at 15 seconds, but returned the Response before JSON parsing.
`lib/aiProcessingPreference.ts:19–34` then awaited `.json()` outside that
deadline. A body that never settled could keep the caller saving/loading.
This is a code-confirmed risk, not a captured airplane-mode trace.

### Single Add Item and Bulk Review

- Single Add Item uses `aiPreference`, `showAiConsent`,
  `savingAiPreference`, `aiPreferenceError`, `pendingAiAsset` and `classifying`.
  `pickImage` checks the preference before classification, retains the photo
  for manual entry/retry, and handles failed reads without sending it.
  Allow writes before explicit processing of that retained photo. Decline
  closes immediately, conservatively blocks AI locally, saves OFF and exposes
  manual entry; passive dismissal writes nothing.
- Bulk Review uses `aiPreference` (`checking`, `unavailable` or the three saved
  states), `showAiConsent`, `savingAiPreference`, `aiPreferenceError`,
  per-item `status`, `statusPhase`, plus its existing save/retry latches.
  Its initial read has an active-effect guard. Explicit Allow gates the
  processing effect; explicit Decline conservatively blocks AI locally and
  routes to manual entry, even if saving the decline fails. A local block
  after a failed decline is not a claim that OFF was saved server-side.
- Both use the same preference service; no parallel persisted setting was
  created. Their existing `finally` saving resets now receive bounded
  operations, and modal errors are visible.
- Before patch, Bulk Review `:173,209,665–670` treated both `pending` and
  `classifying` as active and ran its copy timer even when permission blocked
  all processing. This produced contradictory tint/phrases over idle photos.

## 3. Fixes

- `server/routes.ts:500` and `server/middleware/rateLimiter.ts:763,801–817`:
  authenticated preference writes have their own durable `aipreference`
  bucket, **30/minute per authenticated user**, after `requireAuth`.
  Auth/account/provider budgets are untouched. 429 includes
  `ai_preference_rate_limit` and Retry-After. Users sharing an IP do not share
  this preference budget. GET protection is unchanged.
- `lib/aiProcessingPreference.ts:21–78`: ten-second deadline includes session,
  network and JSON; every completed write is followed by authoritative GET
  before success is reported. Read mismatch or invalid responses fail rather
  than silently granting consent. Distinguishes network/timeout, 429 and
  save/load errors. Existing `__DEV__` + `EXPO_PUBLIC_UPLOAD_DIAGNOSTICS=1`
  flag gates diagnostics containing only status and a bounded code.
- `lib/useAiProcessingPreference.ts:9–103` owns the existing Profile
  preference lifecycle, replacing its duplicated inline state handlers.
  Focus/mount/account refresh, request generation checks, identity masking,
  finite busy state, authoritative failure reconciliation, and error clearing
  on retry/next attempt prevent stale UI. Failed reconciliation is explicitly
  unavailable, not a confirmed decline. Allow remains retryable even when a
  previous reconciliation failed.
- `app/(tabs)/profile.tsx:132–140,527–548,612–619`: existing row and layout
  retained; quiet Try again handles save/load errors; modal receives error.
- `components/AiProcessingConsent.tsx:27–40,162–178`: Profile Not now closes
  immediately, writes nothing, and is never disabled by saving. Already-sent
  Allow writes cannot be recalled by closing the sheet. Upload Decline
  retains its separate persistence semantics. Errors are announced inside the
  sheet; approved disclosure/legal wording is unchanged.
- `app/add-item.tsx` and `app/bulk-review.tsx`: save failures use calm status-aware
  messages and are passed into the disclosure instead of being hidden behind it.
- `app/bulk-review.tsx:179–217,427,675–681,686–704,726,757,1231` and
  `lib/aiProcessingPreferenceState.ts`: blocked cards show normal studio
  photos, "Awaiting permission"/"Waiting for connection", and Add manually.
  Pending/queued work is neutral. Local prep is "Preparing photo"; only
  outstanding PhotoRoom/classification service calls enable the tint/copy.
  No provider invocation/payload/classifier logic was changed.

## 4. Tests and exact results

Added `__tests__/aiPreferenceLifecycle.test.ts`, using actual preference
service/hook/disclosure with mocked transport/native hosts:

- 3 initial states × ON/OFF × success/failure/timeout/429 (24 cases).
  Already-allowed ON and already-declined OFF are intentionally no-write.
- Not now without a write; Not now during a pending save; visible modal error.
- Authoritative read-back and mismatched/malformed response rejection.
- Error clearing, retry after an offline save plus failed reconciliation,
  initial-read timeout, and a response body that never resolves.
- Account-switch late read/write rejection and refresh after another flow's
  server-side preference change.
- Waiting/in-flight mapping across five preference states, six card states,
  and both in-flight flags (60 combinations).

Extended `__tests__/aiProcessingConsent.test.ts`: real mounted route limiter,
30 successful writes then 429/code/header, GET still works, auth/account/provider
budgets independent, and a second account behind the same IP still writes.
Existing server fail-closed/withdrawal assertions remain.
Updated one mock export in `__tests__/bulkReviewMountedGuard.test.ts`.

Commands actually run:

| Command | Result |
|---|---|
| `npm test -- aiPreferenceLifecycle.test.ts aiProcessingPreference.test.ts aiConsentFlow.test.ts aiProcessingConsent.test.ts bulkReviewMountedGuard.test.ts` | **5 passed, 0 failed**, 108 unselected files |
| `npm test` | **113 passed, 0 failed** test files |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npx tsx __tests__/recommendation-golden-set.ts` | **35 passed, 0 failed**, v3.7 |
| `node scripts/validate-africa-track-c.mjs` | Passed, **100 sealed cases** |
| `node scripts/validate-benchmark-fixtures.mjs` | Passed, **53 frozen-file checksums** |
| `git diff --check` | Passed, including documentation additions |

Initial focused runs failed on test-harness issues: a timeout rejection handler
was attached too late; a bulk fixture lacked the new error-message export; then
the new per-user limiter test reused an account already charged by earlier
assertions. Fixed the fixtures/assertion ordering and used a distinct account
for the limiter case. Final results above are after those corrections.
Existing `react-test-renderer` deprecation warnings and expected simulated
storage/dependency-error logs remain; they do not fail checks.
Both existing app workflows were restarted once after the code batch and
reported running; the backend served on port 5000 and Metro on 8081. A preview
screenshot reached the Expo QR launch page, not the signed-in UI; its browser
console reported one resource 404. The unrelated mockup-sandbox workflow
remained failed and was not changed.

## 5. Files changed

- `server/middleware/rateLimiter.ts`
- `server/routes.ts`
- `lib/aiProcessingPreference.ts`
- `lib/aiProcessingPreferenceState.ts`
- `lib/useAiProcessingPreference.ts` (new, Profile lifecycle only)
- `app/(tabs)/profile.tsx`
- `components/AiProcessingConsent.tsx`
- `app/add-item.tsx`
- `app/bulk-review.tsx`
- `__tests__/aiPreferenceLifecycle.test.ts` (new)
- `__tests__/aiProcessingConsent.test.ts`
- `__tests__/bulkReviewMountedGuard.test.ts`
- `TECHNICAL.md`
- `AMODKA-PROJECT-STATUS.md`
- `.agents/memory/ai-consent-storage.md` (durable limiter lesson)
- `docs/reports/ai-preference-save-failure.md` (this report)

## 6. Deviations and limitations

- Historical per-request timestamps/bodies/limiter annotations were unavailable;
  only observed statuses and code-inferred attribution are reported.
- GET remains authenticated without a route limiter, as before; only writes
  needed separation from the account budget.
- Ten seconds applies to **each** preference request. Write plus read-back can
  take up to roughly 20 seconds; failed-write reconciliation is separately
  bounded too. Profile Not now remains available during that period.
- The outer deadline settles the caller even if an underlying native request
  or its body ignores cancellation. It does not roll back/cancel an accepted
  server write; a timeout is an ambiguous outcome. A retry/focus refresh reads
  the eventual server value. No write replay/retry is automatic.
- A Not now tap does not issue a write, but does not undo an Allow request
  already submitted. This cannot be guaranteed by a client-side dismissal.
- "In flight" here means an outstanding provider-bound API operation including
  its response parsing; a cache hit or server refusal may complete without a
  provider call. Local preparation and quota-delay waits do not show analysis.
- Read-back is a snapshot, not cross-device concurrency serialization. The
  existing metadata read/modify/write semantics were not broadened.
- No Recommendation Engine v3.7, golden expectations, benchmark artifacts,
  consent enforcement module, disclosure wording, billing, auth flow,
  provider settings, database schema or dependencies were changed.
- No live account was created/modified, no provider photo was sent for
  validation, and no migrations/publish/deploy were performed.

## 7. Device verification still required

No physical Android/iOS, Expo Go airplane-mode, VoiceOver/TalkBack, or signed-in
interactive browser journey was performed. Tests above use fixture I/O, not
live Supabase service-outage evidence.

On the same device/account that reproduced the issue:

1. Open signed-in Bulk Review offline: normal-contrast photos, waiting copy,
   no analysis phrases, and Add manually. Reconnect and explicitly retry.
2. Decline in upload; return to Profile: focus refresh should show saved OFF.
3. Switch ON; Not now closes with no change. Reopen; Allow succeeds, closes,
   and shows ON. Switching OFF should show the authoritative saved OFF.
4. Enable airplane mode during an Allow/OFF request and while receiving its
   response: no infinite busy state; Not now works; error is visible and retry
   clears it. Reconnect/refresh to reconcile an ambiguous write.
5. Verify 429 copy/recovery in a controlled development fixture, not by
   repeatedly changing a production account.
6. Sign out/change accounts during a slow preference operation: no old choice,
   error or sheet should reappear on the new account.
7. Check TalkBack/VoiceOver reach both disclosure actions and announce its
   inline error; confirm waiting photos can be opened manually.

These checks should not require any real AI photo send unless the tester
explicitly opts in for the selected photo.
