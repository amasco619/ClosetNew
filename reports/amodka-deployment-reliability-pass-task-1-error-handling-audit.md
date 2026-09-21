# AMODKA — Deployment Reliability Pass
## Task 1: Error Handling, Recovery & Startup Reliability

# 1. Executive Summary

Amodka has three current error layers: a root React `ErrorBoundary` and production-safe fallback; screen-level alerts/inline errors for selected auth, upload, classification, export, and deletion flows; and console/stdout logging. The root boundary catches descendant render/lifecycle errors only—not async effects, event handlers, unhandled rejections, module-load failures, server failures, or native crashes—and no reporter is connected.

Startup degrades to cached/default state when `AppContext.loadData()` throws because `finally` sets readiness. It has no deadline, however. Font loading, AsyncStorage, session retrieval, signed-URL recovery, Supabase hydration, or entitlement calls that never settle can leave the native/animated splash indefinitely. There is no timeout, startup retry, recovery screen, or explicit offline/degraded state.

`AmodkaErrorState` exists but is not meaningfully wired. Verified risks include stuck bulk auto-save, authenticated upload falling back to a local URI while appearing saved, optimistic local state despite failed remote writes, swallowed OAuth/migration/splash failures, quota lookup treating DB failure as zero usage, and partial account deletion. HTTP requests lack shared deadlines/retry semantics. No production crash tracker is configured; recommendation telemetry is stdout-only, and server logs are neither uniformly structured nor redacted.

Minimum release scope: bounded startup/splash recovery; consistent error categories; a redacting vendor-neutral reporter; root-boundary reporting; structured correlated server logs; correction of stuck/falsely-successful UI states; and tests. Protected recommendation, classifier, Phase A, persistence, database, and benchmark behavior must remain unchanged.

# 2. Current Error Architecture

- `app/_layout.tsx`: prevents splash auto-hide, loads fonts, starts non-blocking migrations, handles OAuth/deep links, and mounts providers/router under `ErrorBoundary`. It returns `null` until fonts load.
- `components/ErrorBoundary.tsx`: catches descendant React render/lifecycle failures, stores the error, renders `ErrorFallback`, and optionally invokes `onError`; root supplies none. It does not catch async/event/native/module-load errors.
- `components/ErrorFallback.tsx`: generic production copy, wardrobe-safety statement, reload via `reloadAppAsync`, reset fallback, and development-only message/stack details.
- `components/AmodkaErrorState.tsx`: recommendation/classification/background-removal/network/generic copy plus caller retry; no timeout/backoff/loading policy and no meaningful screen usage.
- `contexts/AppContext.tsx`: local hydration, session/auth listener, DB hydration, signed URLs, entitlement, weather, orphan detection, readiness, and many optimistic writes. Top-level load errors log and still mark ready; non-settling calls do not.
- `lib/query-client.ts`: fetch without deadline; query/mutation retries disabled; no shared taxonomy.
- `lib/database.ts`: generally throws Supabase errors. Callers variously surface, swallow, default, or commit local state first.
- Auth: inline sign-in/password errors, generic enumeration-safe email responses, OAuth cancellation, swallowed callback/session failures, best-effort sign-out.
- Upload/add item: permission/validation alerts and local-copy fallback. Durable versus local-only status is unclear.
- Profile/deletion: profile failures can be silent; sign-out is console-only; deletion has a generic alert. Server deletion is sequential and partially tolerant.
- Existing presentation: `ErrorFallback`, alerts, inline errors, development modal, selected retry buttons, silent recovery/defaults, console-only reporting, and server stdout/stderr. No coherent toast mechanism was verified.

# 3. Verified Reliability Findings

| ID | Area/files | Current behavior and failure | User impact | Severity | Recovery |
|---|---|---|---|---|---|
| R-01 | Fonts, `app/_layout.tsx` | Returns `null` after preventing auto-hide; no deadline | Infinite native splash | Critical | None |
| R-02 | Bootstrap, `AppContext`, `app/index.tsx` | Local/session/DB/URL/entitlement awaits have no deadline | `appReady` may never occur | Critical | None |
| R-03 | Thrown startup failure | Logs then launches with defaults | Unannounced partial/stale state | Medium | Implicit degraded launch |
| R-04 | Splash hide, `app/index.tsx` | Rejection swallowed | Splash may obscure ready app | High | None |
| R-05 | Root crash reporting | Boundary has no reporter | No operational incident visibility | High | Manual restart |
| R-06 | Async failures | No global async reporter | Silent/console-only failures | High | Inconsistent |
| R-07 | OAuth callback | Exchange failures swallowed/console-only | Sign-in fails without guidance | High | Restart sign-in |
| R-08 | Startup migrations | Fire-and-forget; failures swallowed | Legacy/partial local state | Medium | Defaults |
| R-09 | Orphan scan | Delayed async callback lacks outer catch | Unhandled rejection/broken thumbnails | Medium | None |
| R-10 | Bulk auto-save, `app/bulk-review.tsx` | Rejection may leave `auto-saving` | Locked/ambiguous card | High | Remount/incidental rerun |
| R-11 | Bulk upload, `lib/bulkClassifyCore.ts` | Upload failure uses local URI and marks saved | Durability overstated | High | Current-device copy |
| R-12 | Single upload, `app/add-item.tsx` | Cloud failure can use local copy | Image may be device-only | High | Later recovery |
| R-13 | Optimistic context writes | Local state committed; remote failure console-only | Cross-device divergence | High wardrobe; Medium signals | Reload |
| R-14 | Profile sync | Fetch/upsert silent or console-only | Preferences disappear later | Medium-High | Cached state |
| R-15 | Sign-out | Errors suppressed/logged while routing continues | Session/cache ambiguity | High | Auth reconciliation |
| R-16 | Account deletion, `server/routes.ts` | Sequential Storage/tables/profile/auth; errors partly ignored | Partial deletion | Critical | Generic alert/manual retry |
| R-17 | Signup/reset delivery | Enumeration-safe success on provider failure | Email never arrives | Medium | User retry |
| R-18 | HTTP layer | No deadline; retry disabled | Hanging/inconsistent recovery | High | Caller-specific |
| R-19 | Wardrobe hydration | DB outage can become empty/default state | Outage resembles empty wardrobe | High | Partial local state |
| R-20 | Wear/affinity logging | Local/remote inserts non-idempotent | Duplicate/lost remote events | Medium | None |
| R-21 | Item insert/bookkeeping | Remote insert and local IDs separate | False failure/duplicate intent | High | Stable IDs only partly help |
| R-22 | Bulk classification | Malformed fields cast/defaulted | Bad classifications enter review | Medium | User correction/retry |
| R-23 | Background removal | Generic failures; narrow retry | Retryability unclear | Medium | Original retained |
| R-24 | Quota store, `server/bgRemovalStore.ts` | DB failure can become zero use | Quota fail-open/API cost | High | None |
| R-25 | UX consistency | Same failure uses alert/inline/console/silence | Unclear next steps | Medium | Flow-specific |
| R-26 | Server logging/errors | Raw messages/upstream text may be logged/returned | Leakage/inconsistent contract | High | Some generic routes |
| R-27 | Observability | Recommendation stdout plus ad hoc logs only | No correlation/alert/crash visibility | High | Platform logs when available |

# 4. Silent / Swallowed Error Audit

1. **Startup migrations — `app/_layout.tsx`:** rejection swallowed; may retain legacy state. Keep non-blocking, but report redacted failure and warn only if required data is affected.
2. **OAuth callback — layout/index:** URL/session exchange failure swallowed or console-only; user returns unsigned-in. Report category and route to existing sign-in recovery.
3. **Splash hide — `app/index.tsx`:** rejection ignored; splash may persist. Report and use bounded fallback.
4. **Orphan scan — `AppContext`:** delayed async task can reject unhandled. Wrap whole task, report, retain best-effort semantics.
5. **Startup defaults:** DB/session/entitlement failures become defaults and ready state. Preserve degraded launch but expose startup health/reload.
6. **Profile sync:** local state survives failed remote fetch/upsert. Mark sync failure and retry without schema change.
7. **Bulk auto-save:** rejection may not reset status. Transition explicitly to retryable state and report.
8. **Bulk upload fallback:** local URI presented as saved. Keep local protection but label local-only/pending.
9. **Wardrobe/activity writes:** local state plus console-only remote failure. Surface wardrobe sync failure; report noncritical signals without blocking.
10. **Sign-out cleanup:** suppression creates session/cache ambiguity. Separate remote sign-out from confirmed local termination.
11. **Enumeration-safe email routes:** public success hides provider failure. Preserve anti-enumeration response; add internal correlated reporting.
12. **Quota read:** DB error becomes zero. Distinguish no row from outage and fail safely.

Intentional bounded best-effort work—cache pruning, recommendation telemetry, guest cleanup, weather-cache writes, non-authoritative cache writes—may remain non-blocking but should be observable when repeated failure affects cost or durability.

# 5. Startup & Splash Audit

Sequence: prevent auto-hide → load fonts → mount providers/router → `AppProvider.loadData()` → parallel AsyncStorage → parse/migrate/cache URLs → `getSession()` → authenticated DB/saved-look/photo/entitlement hydration → `finally` sets ready → index hides splash → routes to tabs/onboarding/welcome.

Blocking: fonts; local reads/parsing; selected signed URLs; session; authenticated DB and saved looks; photo recovery; entitlement. Non-blocking: root migrations, auth listener, weather, orphan scan, foreground URL refresh, many cache writes.

No timeout exists for font, local storage, session, DB, URL, entitlement, weather, or most fetch work. Thrown load errors usually permit degraded launch; non-settling calls do not. Migration/OAuth/splash errors can be silent. Boundary cannot recover pre-mount or hanging operations.

Minimum requirement: one bounded coordinator preserving current architecture; distinguish essential local work from refreshable network hydration; always attempt splash dismissal after deadline; existing-style recovery UI; retry network hydration; continue with safe cache when available; report phase/category only.

# 6. Offline & Network Failure Audit

- Local startup: network-independent but can hang; needs deadline.
- Session/hydration: failures can look signed-out, stale, or empty; need unavailable/degraded classification and retry.
- Auth: inline handling exists; network/timeout/callback distinctions inconsistent.
- Signup/reset: preserve generic anti-enumeration response; add internal observability.
- Profile/wardrobe: silent/default behavior; retain input/cache and expose reload/sync failure.
- Single upload: local fallback protects input but status is unclear.
- Bulk classify: manual retry exists; reason discarded and malformed output weakly validated.
- Bulk auto-save: can stick; explicit failure transition required.
- Background removal: original generally retained; classify retryability.
- Weather: safe non-blocking degradation; stale/unavailable state should be consistent.
- Outfit generation: local; preserve behavior. Export alert is adequate.
- Wear/signals: divergence/duplicate risk; reporting now, idempotency later.
- Sign-out: verify local secure termination.
- Deletion: partial and unsafe for blind retry; needs step reporting/reconciliation design.
- Generic API: bounded timeout and caller-controlled retry.
- Supabase outage: must not masquerade as confirmed empty data.

Do not introduce full offline-first architecture. Add bounded requests, explicit degraded state, safe retry entry points, and honest persistence status.

# 7. User-Facing Error UX Audit

Strengths: actionable validation/permission alerts; inline auth errors; clear export/deletion alerts; production-safe root fallback; preserved original images; manual bulk-classification retry.

Inconsistency: identical network failures may become inline errors, alerts, console output, defaults, silence, indefinite loading, or local-only “success.” The UI does not consistently distinguish remote, local-only, pending, failed-before-write, timeout-unknown, or partial-deletion states.

Use `AmodkaErrorState` selectively for startup, profile/wardrobe loading, and retryable network/classification/background-removal failures. Keep validation and destructive confirmation as alerts. Every error should state what failed, data safety/durability, whether retry is safe, next action, and temporary versus restart-required status. No visual redesign is needed.

# 8. Production Observability Audit

No configured Sentry/Bugsnag/Crashlytics-equivalent was verified. Client failures are mostly console-based; root boundary has no reporter; no verified global rejection capture or correlation ID. `lib/telemetry.ts` emits limited recommendation events to stdout only. Server logging is ad hoc; some response/raw exception/upstream text can be logged; no uniform taxonomy, correlation, retention, dashboard, or alert policy exists.

Minimum vendor-neutral launch capability:

1. One redacting `reportError` adapter for client/server.
2. Structured category/code, operation, version, route, dependency, status, retryability, request ID, duration.
3. Root boundary connection and meaningful async/startup reporting.
4. Structured server request/error logs with IDs.
5. Remove body/raw-upstream logging; generic unexpected responses.
6. Document retention, access, alerts, and lookup.

Never capture passwords, tokens, authorization headers, sessions, signed URLs, base64/images, raw API payloads, email, precise location, profiles, secrets, or credentials. Stdout/stderr is sufficient initially; no vendor is selected.

# 9. Data-Safety / Partial-Failure Risks

- Account deletion can delete some Storage/data/auth resources but not others; shallow Storage listing may leave nested objects. Blind retry requires verified idempotency.
- Image upload and item persistence are separate; local fallback protects input but does not prove cloud durability.
- Remote item insert and local ID bookkeeping are separate; failure after insert can create ambiguous retry.
- Bulk save can mix success/failure, mark local images saved, stick auto-save, and lose causes.
- Optimistic wardrobe/wear/reaction/affinity/look state can diverge, lose signals, duplicate insert-only events, or leave remote data.
- Profile writes can look successful locally and vanish later.
- Sign-out can diverge remotely/locally.
- Malformed classifier data may become defaults. Background removal safely retains original, but quota DB failure can allow paid work.

Current pass may expose status, unstick UI, report failure, and add safe retry entry points. It must not implement operation records, transaction orchestration, or idempotency; timeout ambiguity remains an approved B0.3/B1/B5/B6 dependency.

# 10. Proposed Implementation Scope

### P0 — Must fix before release

1. Startup deadline, guaranteed splash attempt, cached continuation, recovery/retry state.
2. Redacting vendor-neutral reporter; boundary and meaningful async wiring.
3. Correlated structured server errors; no body/raw upstream logs; preserve machine codes.
4. Bulk auto-save rejection resets all flags/statuses.
5. Existing local upload fallback labeled local-only/pending, not durable.
6. Quota DB failure distinguished from no row and reported.
7. Secure local sign-out outcome explicit.
8. Account-deletion steps checked/reported with stable code/ID; no schema/security architecture change.

### P1 — Should fix before release

Wire `AmodkaErrorState` into selected load/network flows; shared client taxonomy; bounded API deadlines; profile/wardrobe reload; report migration/OAuth/orphan/entitlement failures; distinguish stale/default from empty; validate external response shape; preserve generic auth email response with internal reporting; sync-failed UI for important optimistic writes; observability policy documentation.

### P2 — Post-launch / optional

Vendor adapter after approval; dashboards/alerts/dependency timing; jittered retries only for idempotent reads; offline outbox after persistence approval; distributed tracing; durable event storage only with privacy/retention/access/deletion design; separately scoped deletion reconciliation; multi-item idempotency only through B0.3/B1/B5/B6.

# 11. Exact Files Expected to Change

Likely client: `app/_layout.tsx`, `app/index.tsx`, `contexts/AppContext.tsx`, `components/ErrorBoundary.tsx`, `components/ErrorFallback.tsx`, possibly `components/AmodkaErrorState.tsx`, `app/bulk-review.tsx`, `lib/bulkClassifyCore.ts`, `app/add-item.tsx`, `app/(tabs)/profile.tsx`, `app/sign-in.tsx`, `app/auth/callback.tsx`, `lib/auth.ts`, `lib/query-client.ts`, `lib/photoroom.ts`, and error-normalization-only changes in `lib/database.ts`.

Likely server: `server/index.ts`, `server/routes.ts`, `server/remove-background.ts`, boundary-only `server/classify-garment.ts`, `server/bgRemovalStore.ts`, and compatibility-only `lib/telemetry.ts`.

Possible new files: `lib/observability.ts`, `shared/error-codes.ts`, `server/request-context.ts` or `server/middleware/request-context.ts`, `docs/observability.md`.

Likely tests: startup reliability, redaction, classification, boundary reporting, bulk recovery, upload state, auth recovery, profile sync, request logging, and server contract tests.

Core P0 requires no package/config change. A later vendor requires separate package, Expo/native config, secrets, privacy, retention, and region approval.

# 12. Files That MUST NOT Change

Do not change Recommendation Engine v3.7; scoring/ranking/rotation/selection; `constants/outfitScoring.ts`; `constants/outfitRotation.ts`; benchmarks/fixtures/labels/results; classifier prompts/taxonomy except strict boundary validation; Phase A migrations; group schema/RPC/RLS/ACL/constraints/lifecycle; successful single-item persistence semantics; B0.3/B1/B5/B6/B7 architecture/implementation; Supabase migrations/RLS/Storage policies/RPCs/grants/production data; payment, push, virtual try-on, or Luxury UI architecture; `WardrobeItem` shape; or existing telemetry event names/required fields. Protected-call wrappers must preserve successful behavior and payload compatibility.

# 13. Test Plan

Unit: taxonomy matrix; redaction of bearer/JWT/password/header/signed URL/base64/email/location/profile/circular/unknown values; startup success/failure/hang/deadline/cache/retry/splash; boundary render/lifecycle/reporter/reload failures; bulk success/rejection/flag clearing/retry/local-only status/all-fail completion; quota row/no-row/outage/malformed.

Components: startup recovery, retry disabled/loading, wardrobe/profile failure, local-only image, bulk failure, OAuth failure, sign-out failure, partial deletion, unexpected exception. Assert operation, data safety, safe retry, and next action.

Integration: auth offline/invalid/OAuth cancel/callback failure/expired/reset-provider failure/sign-out cleanup; upload drop/auth/local-copy success/failure/retry/no UI duplicate; profile/wardrobe partial/all failures with/without cache and reload; HTTP 400/401/403/404/409/429/dependency/500 stable code, safe message, request ID, correlated redacted log; disposable-environment deletion failures at each step.

Network: never-resolving fetch, mid-response drop, non-JSON/empty/slow Supabase/Gemini/PhotoRoom/503/restored connection/repeated retry.

Regression: run `npm test`, `npm run typecheck`, `npm run lint`; verify unchanged recommendation output, telemetry schema, Phase A, successful single-item persistence, classifier success payload, background-removal success/quota, and benchmarks without updating expectations.

# 14. Supabase / Pro Dependency Check

No Supabase dependency: startup/splash UI, reporter, taxonomy, request IDs/logging/redaction, fetch deadline, vendor-neutral stdout. Existing capability only: bulk rejection/local status, profile/wardrobe reload, OAuth/sign-out UX, quota failure classification, deletion reporting. Durable Supabase error tables or retention jobs would require schema/RLS changes and are not minimum scope. No core P0/P1 work requires Supabase Pro. A final production auth/Storage/RLS check is a pre-launch environment gate, not evidence that these code changes require Pro.

# 15. Protected-System Regression Risks

Recommendation: reporting must not affect timing, inputs, scoring, ranking, weather, candidate generation, or outputs. Classifier validation must preserve successful normalized output and avoid prompts/categories/heuristics changes. Phase A/grouping requires no change; wrappers must preserve arguments, transaction, and result. Single-item work may clarify errors/status but must not alter row shape, IDs, sequencing, replay, migration, or RLS. Bulk reliability must not create an alternate B0.3/B1/B5/B6 idempotency mechanism. Benchmarks stay unchanged. Auth changes require successful sign-in, guest, restored session, routing, signed-out cleanup, and deep-link regression tests. Server logs must allowlist metadata rather than serialize requests/responses.

# 16. Implementation Sequence

1. Define categories/codes/retry rules/prohibited fields.
2. Add classification/redaction tests.
3. Add vendor-neutral structured reporter.
4. Add server request correlation and safe errors.
5. Remove body/raw-upstream logging while preserving codes.
6. Wire boundary and protect reporter/reload failure.
7. Add bounded startup coordinator.
8. Add splash guarantee and startup recovery/degraded state.
9. Handle migration/OAuth/orphan/hydration failures.
10. Add API deadlines without automatic write retries.
11. Fix bulk auto-save termination.
12. Show local-only/pending upload state.
13. Add profile/wardrobe reload/sync failure.
14. Harden sign-out reporting/local cleanup.
15. Correct quota failure classification.
16. Correlate deletion steps without DB architecture changes.
17. Run new reliability tests.
18. Run existing tests/typecheck/lint/protected-system regressions/benchmarks unchanged.
19. Production-like smoke test startup timeout, offline, auth, upload interruption, dependency timeout, and log correlation.
20. Stop for review before vendor, Supabase, Expo/EAS, persistence, or protected-system changes.

# 17. STOP / Approval Gate

**IMPLEMENTATION STATUS: NOT AUTHORIZED**

No code, configuration, database, migration, dependency, or environment changes were made during this audit.# AMODKA — Deployment Reliability Pass
## Task 1: Error Handling, Recovery & Startup Reliability

# 1. Executive Summary

Amodka has three current error layers: a root React `ErrorBoundary` and production-safe fallback; screen-level alerts/inline errors for selected auth, upload, classification, export, and deletion flows; and console/stdout logging. The root boundary catches descendant render/lifecycle errors only—not async effects, event handlers, unhandled rejections, module-load failures, server failures, or native crashes—and no reporter is connected.

Startup degrades to cached/default state when `AppContext.loadData()` throws because `finally` sets readiness. It has no deadline, however. Font loading, AsyncStorage, session retrieval, signed-URL recovery, Supabase hydration, or entitlement calls that never settle can leave the native/animated splash indefinitely. There is no timeout, startup retry, recovery screen, or explicit offline/degraded state.

`AmodkaErrorState` exists but is not meaningfully wired. Verified risks include stuck bulk auto-save, authenticated upload falling back to a local URI while appearing saved, optimistic local state despite failed remote writes, swallowed OAuth/migration/splash failures, quota lookup treating DB failure as zero usage, and partial account deletion. HTTP requests lack shared deadlines/retry semantics. No production crash tracker is configured; recommendation telemetry is stdout-only, and server logs are neither uniformly structured nor redacted.

Minimum release scope: bounded startup/splash recovery; consistent error categories; a redacting vendor-neutral reporter; root-boundary reporting; structured correlated server logs; correction of stuck/falsely-successful UI states; and tests. Protected recommendation, classifier, Phase A, persistence, database, and benchmark behavior must remain unchanged.

# 2. Current Error Architecture

- `app/_layout.tsx`: prevents splash auto-hide, loads fonts, starts non-blocking migrations, handles OAuth/deep links, and mounts providers/router under `ErrorBoundary`. It returns `null` until fonts load.
- `components/ErrorBoundary.tsx`: catches descendant React render/lifecycle failures, stores the error, renders `ErrorFallback`, and optionally invokes `onError`; root supplies none. It does not catch async/event/native/module-load errors.
- `components/ErrorFallback.tsx`: generic production copy, wardrobe-safety statement, reload via `reloadAppAsync`, reset fallback, and development-only message/stack details.
- `components/AmodkaErrorState.tsx`: recommendation/classification/background-removal/network/generic copy plus caller retry; no timeout/backoff/loading policy and no meaningful screen usage.
- `contexts/AppContext.tsx`: local hydration, session/auth listener, DB hydration, signed URLs, entitlement, weather, orphan detection, readiness, and many optimistic writes. Top-level load errors log and still mark ready; non-settling calls do not.
- `lib/query-client.ts`: fetch without deadline; query/mutation retries disabled; no shared taxonomy.
- `lib/database.ts`: generally throws Supabase errors. Callers variously surface, swallow, default, or commit local state first.
- Auth: inline sign-in/password errors, generic enumeration-safe email responses, OAuth cancellation, swallowed callback/session failures, best-effort sign-out.
- Upload/add item: permission/validation alerts and local-copy fallback. Durable versus local-only status is unclear.
- Profile/deletion: profile failures can be silent; sign-out is console-only; deletion has a generic alert. Server deletion is sequential and partially tolerant.
- Existing presentation: `ErrorFallback`, alerts, inline errors, development modal, selected retry buttons, silent recovery/defaults, console-only reporting, and server stdout/stderr. No coherent toast mechanism was verified.

# 3. Verified Reliability Findings

| ID | Area/files | Current behavior and failure | User impact | Severity | Recovery |
|---|---|---|---|---|---|
| R-01 | Fonts, `app/_layout.tsx` | Returns `null` after preventing auto-hide; no deadline | Infinite native splash | Critical | None |
| R-02 | Bootstrap, `AppContext`, `app/index.tsx` | Local/session/DB/URL/entitlement awaits have no deadline | `appReady` may never occur | Critical | None |
| R-03 | Thrown startup failure | Logs then launches with defaults | Unannounced partial/stale state | Medium | Implicit degraded launch |
| R-04 | Splash hide, `app/index.tsx` | Rejection swallowed | Splash may obscure ready app | High | None |
| R-05 | Root crash reporting | Boundary has no reporter | No operational incident visibility | High | Manual restart |
| R-06 | Async failures | No global async reporter | Silent/console-only failures | High | Inconsistent |
| R-07 | OAuth callback | Exchange failures swallowed/console-only | Sign-in fails without guidance | High | Restart sign-in |
| R-08 | Startup migrations | Fire-and-forget; failures swallowed | Legacy/partial local state | Medium | Defaults |
| R-09 | Orphan scan | Delayed async callback lacks outer catch | Unhandled rejection/broken thumbnails | Medium | None |
| R-10 | Bulk auto-save, `app/bulk-review.tsx` | Rejection may leave `auto-saving` | Locked/ambiguous card | High | Remount/incidental rerun |
| R-11 | Bulk upload, `lib/bulkClassifyCore.ts` | Upload failure uses local URI and marks saved | Durability overstated | High | Current-device copy |
| R-12 | Single upload, `app/add-item.tsx` | Cloud failure can use local copy | Image may be device-only | High | Later recovery |
| R-13 | Optimistic context writes | Local state committed; remote failure console-only | Cross-device divergence | High wardrobe; Medium signals | Reload |
| R-14 | Profile sync | Fetch/upsert silent or console-only | Preferences disappear later | Medium-High | Cached state |
| R-15 | Sign-out | Errors suppressed/logged while routing continues | Session/cache ambiguity | High | Auth reconciliation |
| R-16 | Account deletion, `server/routes.ts` | Sequential Storage/tables/profile/auth; errors partly ignored | Partial deletion | Critical | Generic alert/manual retry |
| R-17 | Signup/reset delivery | Enumeration-safe success on provider failure | Email never arrives | Medium | User retry |
| R-18 | HTTP layer | No deadline; retry disabled | Hanging/inconsistent recovery | High | Caller-specific |
| R-19 | Wardrobe hydration | DB outage can become empty/default state | Outage resembles empty wardrobe | High | Partial local state |
| R-20 | Wear/affinity logging | Local/remote inserts non-idempotent | Duplicate/lost remote events | Medium | None |
| R-21 | Item insert/bookkeeping | Remote insert and local IDs separate | False failure/duplicate intent | High | Stable IDs only partly help |
| R-22 | Bulk classification | Malformed fields cast/defaulted | Bad classifications enter review | Medium | User correction/retry |
| R-23 | Background removal | Generic failures; narrow retry | Retryability unclear | Medium | Original retained |
| R-24 | Quota store, `server/bgRemovalStore.ts` | DB failure can become zero use | Quota fail-open/API cost | High | None |
| R-25 | UX consistency | Same failure uses alert/inline/console/silence | Unclear next steps | Medium | Flow-specific |
| R-26 | Server logging/errors | Raw messages/upstream text may be logged/returned | Leakage/inconsistent contract | High | Some generic routes |
| R-27 | Observability | Recommendation stdout plus ad hoc logs only | No correlation/alert/crash visibility | High | Platform logs when available |

# 4. Silent / Swallowed Error Audit

1. **Startup migrations — `app/_layout.tsx`:** rejection swallowed; may retain legacy state. Keep non-blocking, but report redacted failure and warn only if required data is affected.
2. **OAuth callback — layout/index:** URL/session exchange failure swallowed or console-only; user returns unsigned-in. Report category and route to existing sign-in recovery.
3. **Splash hide — `app/index.tsx`:** rejection ignored; splash may persist. Report and use bounded fallback.
4. **Orphan scan — `AppContext`:** delayed async task can reject unhandled. Wrap whole task, report, retain best-effort semantics.
5. **Startup defaults:** DB/session/entitlement failures become defaults and ready state. Preserve degraded launch but expose startup health/reload.
6. **Profile sync:** local state survives failed remote fetch/upsert. Mark sync failure and retry without schema change.
7. **Bulk auto-save:** rejection may not reset status. Transition explicitly to retryable state and report.
8. **Bulk upload fallback:** local URI presented as saved. Keep local protection but label local-only/pending.
9. **Wardrobe/activity writes:** local state plus console-only remote failure. Surface wardrobe sync failure; report noncritical signals without blocking.
10. **Sign-out cleanup:** suppression creates session/cache ambiguity. Separate remote sign-out from confirmed local termination.
11. **Enumeration-safe email routes:** public success hides provider failure. Preserve anti-enumeration response; add internal correlated reporting.
12. **Quota read:** DB error becomes zero. Distinguish no row from outage and fail safely.

Intentional bounded best-effort work—cache pruning, recommendation telemetry, guest cleanup, weather-cache writes, non-authoritative cache writes—may remain non-blocking but should be observable when repeated failure affects cost or durability.

# 5. Startup & Splash Audit

Sequence: prevent auto-hide → load fonts → mount providers/router → `AppProvider.loadData()` → parallel AsyncStorage → parse/migrate/cache URLs → `getSession()` → authenticated DB/saved-look/photo/entitlement hydration → `finally` sets ready → index hides splash → routes to tabs/onboarding/welcome.

Blocking: fonts; local reads/parsing; selected signed URLs; session; authenticated DB and saved looks; photo recovery; entitlement. Non-blocking: root migrations, auth listener, weather, orphan scan, foreground URL refresh, many cache writes.

No timeout exists for font, local storage, session, DB, URL, entitlement, weather, or most fetch work. Thrown load errors usually permit degraded launch; non-settling calls do not. Migration/OAuth/splash errors can be silent. Boundary cannot recover pre-mount or hanging operations.

Minimum requirement: one bounded coordinator preserving current architecture; distinguish essential local work from refreshable network hydration; always attempt splash dismissal after deadline; existing-style recovery UI; retry network hydration; continue with safe cache when available; report phase/category only.

# 6. Offline & Network Failure Audit

- Local startup: network-independent but can hang; needs deadline.
- Session/hydration: failures can look signed-out, stale, or empty; need unavailable/degraded classification and retry.
- Auth: inline handling exists; network/timeout/callback distinctions inconsistent.
- Signup/reset: preserve generic anti-enumeration response; add internal observability.
- Profile/wardrobe: silent/default behavior; retain input/cache and expose reload/sync failure.
- Single upload: local fallback protects input but status is unclear.
- Bulk classify: manual retry exists; reason discarded and malformed output weakly validated.
- Bulk auto-save: can stick; explicit failure transition required.
- Background removal: original generally retained; classify retryability.
- Weather: safe non-blocking degradation; stale/unavailable state should be consistent.
- Outfit generation: local; preserve behavior. Export alert is adequate.
- Wear/signals: divergence/duplicate risk; reporting now, idempotency later.
- Sign-out: verify local secure termination.
- Deletion: partial and unsafe for blind retry; needs step reporting/reconciliation design.
- Generic API: bounded timeout and caller-controlled retry.
- Supabase outage: must not masquerade as confirmed empty data.

Do not introduce full offline-first architecture. Add bounded requests, explicit degraded state, safe retry entry points, and honest persistence status.

# 7. User-Facing Error UX Audit

Strengths: actionable validation/permission alerts; inline auth errors; clear export/deletion alerts; production-safe root fallback; preserved original images; manual bulk-classification retry.

Inconsistency: identical network failures may become inline errors, alerts, console output, defaults, silence, indefinite loading, or local-only “success.” The UI does not consistently distinguish remote, local-only, pending, failed-before-write, timeout-unknown, or partial-deletion states.

Use `AmodkaErrorState` selectively for startup, profile/wardrobe loading, and retryable network/classification/background-removal failures. Keep validation and destructive confirmation as alerts. Every error should state what failed, data safety/durability, whether retry is safe, next action, and temporary versus restart-required status. No visual redesign is needed.

# 8. Production Observability Audit

No configured Sentry/Bugsnag/Crashlytics-equivalent was verified. Client failures are mostly console-based; root boundary has no reporter; no verified global rejection capture or correlation ID. `lib/telemetry.ts` emits limited recommendation events to stdout only. Server logging is ad hoc; some response/raw exception/upstream text can be logged; no uniform taxonomy, correlation, retention, dashboard, or alert policy exists.

Minimum vendor-neutral launch capability:

1. One redacting `reportError` adapter for client/server.
2. Structured category/code, operation, version, route, dependency, status, retryability, request ID, duration.
3. Root boundary connection and meaningful async/startup reporting.
4. Structured server request/error logs with IDs.
5. Remove body/raw-upstream logging; generic unexpected responses.
6. Document retention, access, alerts, and lookup.

Never capture passwords, tokens, authorization headers, sessions, signed URLs, base64/images, raw API payloads, email, precise location, profiles, secrets, or credentials. Stdout/stderr is sufficient initially; no vendor is selected.

# 9. Data-Safety / Partial-Failure Risks

- Account deletion can delete some Storage/data/auth resources but not others; shallow Storage listing may leave nested objects. Blind retry requires verified idempotency.
- Image upload and item persistence are separate; local fallback protects input but does not prove cloud durability.
- Remote item insert and local ID bookkeeping are separate; failure after insert can create ambiguous retry.
- Bulk save can mix success/failure, mark local images saved, stick auto-save, and lose causes.
- Optimistic wardrobe/wear/reaction/affinity/look state can diverge, lose signals, duplicate insert-only events, or leave remote data.
- Profile writes can look successful locally and vanish later.
- Sign-out can diverge remotely/locally.
- Malformed classifier data may become defaults. Background removal safely retains original, but quota DB failure can allow paid work.

Current pass may expose status, unstick UI, report failure, and add safe retry entry points. It must not implement operation records, transaction orchestration, or idempotency; timeout ambiguity remains an approved B0.3/B1/B5/B6 dependency.

# 10. Proposed Implementation Scope

### P0 — Must fix before release

1. Startup deadline, guaranteed splash attempt, cached continuation, recovery/retry state.
2. Redacting vendor-neutral reporter; boundary and meaningful async wiring.
3. Correlated structured server errors; no body/raw upstream logs; preserve machine codes.
4. Bulk auto-save rejection resets all flags/statuses.
5. Existing local upload fallback labeled local-only/pending, not durable.
6. Quota DB failure distinguished from no row and reported.
7. Secure local sign-out outcome explicit.
8. Account-deletion steps checked/reported with stable code/ID; no schema/security architecture change.

### P1 — Should fix before release

Wire `AmodkaErrorState` into selected load/network flows; shared client taxonomy; bounded API deadlines; profile/wardrobe reload; report migration/OAuth/orphan/entitlement failures; distinguish stale/default from empty; validate external response shape; preserve generic auth email response with internal reporting; sync-failed UI for important optimistic writes; observability policy documentation.

### P2 — Post-launch / optional

Vendor adapter after approval; dashboards/alerts/dependency timing; jittered retries only for idempotent reads; offline outbox after persistence approval; distributed tracing; durable event storage only with privacy/retention/access/deletion design; separately scoped deletion reconciliation; multi-item idempotency only through B0.3/B1/B5/B6.

# 11. Exact Files Expected to Change

Likely client: `app/_layout.tsx`, `app/index.tsx`, `contexts/AppContext.tsx`, `components/ErrorBoundary.tsx`, `components/ErrorFallback.tsx`, possibly `components/AmodkaErrorState.tsx`, `app/bulk-review.tsx`, `lib/bulkClassifyCore.ts`, `app/add-item.tsx`, `app/(tabs)/profile.tsx`, `app/sign-in.tsx`, `app/auth/callback.tsx`, `lib/auth.ts`, `lib/query-client.ts`, `lib/photoroom.ts`, and error-normalization-only changes in `lib/database.ts`.

Likely server: `server/index.ts`, `server/routes.ts`, `server/remove-background.ts`, boundary-only `server/classify-garment.ts`, `server/bgRemovalStore.ts`, and compatibility-only `lib/telemetry.ts`.

Possible new files: `lib/observability.ts`, `shared/error-codes.ts`, `server/request-context.ts` or `server/middleware/request-context.ts`, `docs/observability.md`.

Likely tests: startup reliability, redaction, classification, boundary reporting, bulk recovery, upload state, auth recovery, profile sync, request logging, and server contract tests.

Core P0 requires no package/config change. A later vendor requires separate package, Expo/native config, secrets, privacy, retention, and region approval.

# 12. Files That MUST NOT Change

Do not change Recommendation Engine v3.7; scoring/ranking/rotation/selection; `constants/outfitScoring.ts`; `constants/outfitRotation.ts`; benchmarks/fixtures/labels/results; classifier prompts/taxonomy except strict boundary validation; Phase A migrations; group schema/RPC/RLS/ACL/constraints/lifecycle; successful single-item persistence semantics; B0.3/B1/B5/B6/B7 architecture/implementation; Supabase migrations/RLS/Storage policies/RPCs/grants/production data; payment, push, virtual try-on, or Luxury UI architecture; `WardrobeItem` shape; or existing telemetry event names/required fields. Protected-call wrappers must preserve successful behavior and payload compatibility.

# 13. Test Plan

Unit: taxonomy matrix; redaction of bearer/JWT/password/header/signed URL/base64/email/location/profile/circular/unknown values; startup success/failure/hang/deadline/cache/retry/splash; boundary render/lifecycle/reporter/reload failures; bulk success/rejection/flag clearing/retry/local-only status/all-fail completion; quota row/no-row/outage/malformed.

Components: startup recovery, retry disabled/loading, wardrobe/profile failure, local-only image, bulk failure, OAuth failure, sign-out failure, partial deletion, unexpected exception. Assert operation, data safety, safe retry, and next action.

Integration: auth offline/invalid/OAuth cancel/callback failure/expired/reset-provider failure/sign-out cleanup; upload drop/auth/local-copy success/failure/retry/no UI duplicate; profile/wardrobe partial/all failures with/without cache and reload; HTTP 400/401/403/404/409/429/dependency/500 stable code, safe message, request ID, correlated redacted log; disposable-environment deletion failures at each step.

Network: never-resolving fetch, mid-response drop, non-JSON/empty/slow Supabase/Gemini/PhotoRoom/503/restored connection/repeated retry.

Regression: run `npm test`, `npm run typecheck`, `npm run lint`; verify unchanged recommendation output, telemetry schema, Phase A, successful single-item persistence, classifier success payload, background-removal success/quota, and benchmarks without updating expectations.

# 14. Supabase / Pro Dependency Check

No Supabase dependency: startup/splash UI, reporter, taxonomy, request IDs/logging/redaction, fetch deadline, vendor-neutral stdout. Existing capability only: bulk rejection/local status, profile/wardrobe reload, OAuth/sign-out UX, quota failure classification, deletion reporting. Durable Supabase error tables or retention jobs would require schema/RLS changes and are not minimum scope. No core P0/P1 work requires Supabase Pro. A final production auth/Storage/RLS check is a pre-launch environment gate, not evidence that these code changes require Pro.

# 15. Protected-System Regression Risks

Recommendation: reporting must not affect timing, inputs, scoring, ranking, weather, candidate generation, or outputs. Classifier validation must preserve successful normalized output and avoid prompts/categories/heuristics changes. Phase A/grouping requires no change; wrappers must preserve arguments, transaction, and result. Single-item work may clarify errors/status but must not alter row shape, IDs, sequencing, replay, migration, or RLS. Bulk reliability must not create an alternate B0.3/B1/B5/B6 idempotency mechanism. Benchmarks stay unchanged. Auth changes require successful sign-in, guest, restored session, routing, signed-out cleanup, and deep-link regression tests. Server logs must allowlist metadata rather than serialize requests/responses.

# 16. Implementation Sequence

1. Define categories/codes/retry rules/prohibited fields.
2. Add classification/redaction tests.
3. Add vendor-neutral structured reporter.
4. Add server request correlation and safe errors.
5. Remove body/raw-upstream logging while preserving codes.
6. Wire boundary and protect reporter/reload failure.
7. Add bounded startup coordinator.
8. Add splash guarantee and startup recovery/degraded state.
9. Handle migration/OAuth/orphan/hydration failures.
10. Add API deadlines without automatic write retries.
11. Fix bulk auto-save termination.
12. Show local-only/pending upload state.
13. Add profile/wardrobe reload/sync failure.
14. Harden sign-out reporting/local cleanup.
15. Correct quota failure classification.
16. Correlate deletion steps without DB architecture changes.
17. Run new reliability tests.
18. Run existing tests/typecheck/lint/protected-system regressions/benchmarks unchanged.
19. Production-like smoke test startup timeout, offline, auth, upload interruption, dependency timeout, and log correlation.
20. Stop for review before vendor, Supabase, Expo/EAS, persistence, or protected-system changes.

# 17. STOP / Approval Gate

**IMPLEMENTATION STATUS: NOT AUTHORIZED**

No code, configuration, database, migration, dependency, or environment changes were made during this audit.