# Amodka — classification failure copy

## Result

Implemented the bounded classification-error contract across single add, bulk
review and multi-item review. Existing HTTP statuses, `error` strings, limiter
headers/values and classifier retry/fallback behaviour are unchanged. Provider
details are not displayed.

### Public code map

| Code / fallback | Presentation and action |
|---|---|
| Network / fetch failure | **Can't reach the stylist** — Check your connection. Your photo is still here. / **Try again** |
| `PROVIDER_QUOTA`, `PROVIDER_UNAVAILABLE`, `PROVIDER_TIMEOUT`, `MALFORMED_RESPONSE`; legacy 408/429/5xx, timeout/non-JSON | **The stylist is busy right now** — Your photo is still here. Try again in a moment. / **Try again** |
| `APP_RATE_LIMIT` | **Too many photos at once** — Try again in N seconds, or “Try again in a moment.” when no wait is supplied. / **Try again** |
| `AUTH_REQUIRED` / 401 | Refresh the token and retry once on the two classification routes. If still unauthorised: **Your session has ended** — Sign in again to continue. Your photo is still here. / **Sign in** |
| `UNREADABLE_PHOTO`, legacy refusal, local preparation failure | Existing **We couldn't read this photo** notice/dialog and its manual/remove/choose-another actions |
| `CONSENT_REQUIRED` / 403 | Existing disclosure/consent flow; no new preference or enforcement path |
| Other errors | **We couldn't analyse this photo** — Try again, or add the details yourself. / **Try again**, retaining manual alternatives |

`ApiRequestError.code` and `.retryAfter` are additive. Its existing message is
preserved exactly. JSON parsing is defensive; numeric `Retry-After` is a fallback
when the body does not supply a numeric wait.

The public single-classifier codes formerly distinguishing model-not-found and
other provider HTTP failures now use `PROVIDER_UNAVAILABLE`, as requested; the
more specific structured diagnostic outcome codes remain unchanged.

Multi-item review retains the caught error. Its old 2–6-garment explanation is
restricted to `B3ConstructionError('invalid_item_count')` after a successful
classification response; provider, session and network failures no longer use it.

## Bulk pacing — inspection only

References: `app/bulk-review.tsx` (`STAGGER_MS`, `classifyUri`,
`handleRetryAll`, initial classification effect), `lib/uploadRetry.ts`
(`classificationWaitMs`), `server/middleware/rateLimiter.ts` (`aiLimiter`).

- First-pass tasks are launched 150 ms apart. Native preparation remains serial;
  first-pass classification requests are not budget-paced.
- The server AI limiter remains **10 requests per 60 seconds**, using the
  express-rate-limit default **IP key** (including its default IPv6 grouping),
  shared by the single/multi endpoints, not a per-user key.
- It runs before auth/consent, so rejected attempts and the new single retry
  after a refreshed 401 also pass through the same existing request budget.
- The normal picker selects at most ten photos. If 12+ classification requests
  reach the server within one limiter window, requests beyond the available
  ten-request budget receive app 429s. Multiple batches, other classification
  requests from the same IP and variable preparation/provider duration affect
  exactly which requests are blocked.
- A failure does not abort the remaining batch. Individual retry targets one
  card. “Try all again” targets only transient failed cards, serially, using the
  existing local ten-start/60-second wait; settled/refused/removed cards are
  excluded. Successful cutouts are reused.
- Server `retryAfter` is displayed as a static wait hint, **not** used to schedule
  a retry or disable the button. Individual retries remain immediate.
  “Try all again” honours its existing local start-window wait, not the server's
  `retryAfter`. No pacing change or automatic retry loop was added.

## Tests and gates

| Check | Result |
|---|---|
| `npm test` | **135 test files passed, 0 failed** |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, no reported warnings/errors |
| `npx tsx __tests__/recommendation-golden-set.ts` | **35 passed, 0 failed** |
| `node scripts/validate-benchmark-fixtures.mjs` | Passed; 100 cases and **53 frozen-file checksums** |
| `node scripts/validate-africa-track-c.mjs` | Passed; **100 sealed raw cases** and expected CSV/report counts |
| `npx expo export --platform android --output-dir dist/classification-failure-copy-android` | Passed; one 8.7 MB Hermes bundle |

New tests:

- `__tests__/classificationFailureCopy.test.ts`: all eight public codes through
  each screen's real error branch; actual JSX fragments rendered with mocked
  native hosts, mapped title/hint/button and sign-in action; stable-code
  precedence and status/kind fallbacks; manual/refusal/consent handling; mixed
  batch where only the failed card is retried; obsolete classification copy
  absent from the three screens/shared mapper.
- `__tests__/queryClientClassificationRefresh.test.ts`: both endpoints'
  successful and exhausted one-refresh/one-retry paths; failed refresh; network
  failure on the retry; unrelated routes never refresh; JSON/header metadata and
  non-JSON/null bodies; original error-message compatibility.

Updated tests:

- `classifierRefusal.test.ts`: malformed JSON is transient; consent is handled
  through the prompt rather than an ordinary retry.
- `classifyGarmentIntegration.test.ts`: limiter/provider distinctions, wait
  metadata, timeout/network/refusal public codes; existing assertions retained,
  with expected public code/refusal-key values updated.
- `classifyMultiItem.test.ts`: malformed/unreadable/provider/quota/auth codes and
  declined-consent 403s on both registered classification routes.
- `uploadCleanup.test.ts`: new shared presentation expectations; existing
  retention, cutout reuse and serial-retry checks retained.

All HTTP tests use mocks/fake stores; no user photos or live purchases were used.

## Runtime verification

- Backend restarted successfully. Startup at **2026-10-24 16:28:32 UTC** reports
  the unchanged model order: `gemini-3.5-flash-lite`, `gemini-3.5-flash`.
  The pre-restart log reported the same order.
- Frontend was marked failed because a second Expo process could not bind
  **127.0.0.1:8081 (`EADDRINUSE`)**. The verified older project Expo process
  owning that listener was terminated, then the existing workflow was restarted.
  It is now **running on 8081**, with successful Android bundling in its log.
  No workflow command or application configuration was changed.
- The separate `test` workflow still displays its earlier failing run. The
  final full-suite result above is from the completed shell run, not that stale
  badge.
- A web screenshot reached the app bootstrap but remained blank at capture,
  without a captured JavaScript error. It does **not** constitute visual
  verification of these error states.

## Files changed

- Screens: `app/add-item.tsx`, `app/bulk-review.tsx`,
  `app/multi-item-review.tsx`.
- Client/shared logic: `lib/classificationRefusal.ts`, `lib/query-client.ts`,
  `lib/bulkClassifyCore.ts`.
- Additive server response metadata: `server/classify-garment.ts`,
  `server/classify-multi-item.ts`, `server/routes.ts`,
  `server/aiProcessingConsent.ts`, `server/middleware/rateLimiter.ts`.
- Tests: the six files listed above.
- Documentation: `TECHNICAL.md`, `AMODKA-PROJECT-STATUS.md`, this report.

## Deviations and limits

No protected engine/frozen files, prompts/vocabulary, model policy, limiter
values, consent enforcement, billing, guest sync, RLS or migrations were changed.
No publishing or deployment was performed.

The old-copy absence check is scoped to classification surfaces and their shared
mapper. Unrelated authentication fallbacks, generic server diagnostics and
historical reports were deliberately not rewritten.

Not verified on a physical device: actual error-card wrapping/touch targets,
Android screen-reader behaviour, real token expiry and sign-in round trips,
connectivity changes and consent-sheet presentation. Tests execute real screen
error branches and render extracted JSX with mocks, not complete native
navigation journeys. Live provider outages, quota exhaustion and concurrent
load were not induced or tested.
