# Check my look client route integration

## Status

Implementation and mocked verification are complete. The judge flag, frozen
prompt, engine, migrations and environment are unchanged. No Gemini calls were
made for this work.

**Backend restart is pending approval.** Existing non-test startup in
`server/classifierReliability.ts` calls the Gemini model-metadata endpoints.
Restarting now would conflict with the instruction not to call Gemini. The
running backend has not yet loaded the new directive reasons; do not treat the
new route/client combination as verified live until it has been restarted.

## Request and contract

The client POSTs to `/api/check-my-look` using the existing authenticated helper.
Its body contains only selection, brief and optional chip-derived garmentFacts.
No tier, profile, garment text, photos, model name or provider request is sent.
The existing Bearer authentication header is retained.

The only server implementation change adds a non-sensitive directive reason:

- Flag off: `{ "useLocalCheck": true, "reason": "disabled" }`.
- Provider error, timeout or rejected output after existing retries:
  `{ "useLocalCheck": true, "reason": "unavailable" }`.

The request schema, provider retries, frozen prompt, quota, entitlement, consent,
authentication and flag evaluation are unchanged.

## Client behaviour

| Response or condition | Behaviour |
|---|---|
| disabled | Silent local check; cache only this capability in app-session memory for 15 foreground minutes. Background time does not count. The next check after expiry POSTs again. |
| unavailable | Silent local check once; POST again for the next check. |
| 401 | Silent local check, including guest/signed-out cases. |
| 403 with ai_processing_consent_required | Silent local check; no consent prompt or preference change. |
| Other 403, 400 or 404 | Calm retry message; no local check or local allowance consumption. |
| 429 | Message naming Free 5 / Premium 30 daily checks; no local fallback. |
| 503, including quota/entitlement/preference lookup failure | Retry message; no local fallback. |
| Client timeout | Six-second budget, including session lookup/request and response-body parsing; retry message and no local fallback. |
| Network/offline | Reconnect-and-retry message; no fabricated verdict. A previously cached disabled capability can still use local checking. |
| Malformed response | Retry message; no unverified local fallback. |
| Free verdict | Returned UI object contains only tier and verdict, never reason, question or swap. |
| Premium verdict | Reason plus optional swap, resolved to currently owned items. |
| Premium Ask | One friendly question, supported closed-choice chips and resubmission of the answer in the existing brief/garmentFacts contract. Multiple announced colours can be selected before confirmation. |
| Existing Traditional/set abstention | Preserve local Not judged and its existing copy; do not call the judge route. |

The hook starts loading before the request, suppresses duplicate submissions and
discards stale responses after close, selection edits or owner changes. Only an
intentional local-check path consumes the existing local allowance; network,
quota and entitlement failures cannot use that allowance to bypass the server.

## Brief and chip handling

Nothing is preselected, including the occasion. Required choice fields are:
Church denomination; Funeral announced colours and assigned group; Traditional
wedding/Owambe/Naming ceremony role and assigned set. Each provides Not sure;
sets also provide None assigned. Submission waits for an explicit choice, not
certainty.

Untouched optional fields are omitted. They are not sent as null, because the
unchanged route schema rejects null, and not implicitly sent as not-sure.
Explicit Not sure remains encoded as not-sure (or `{kind:"not-sure"}` for colours).
An empty selected-colours list is incomplete until at least one colour is chosen.

The existing transient encodings are preserved:

- role: guest, family, host, bridal-party, not-sure.
- timeOfDay: daytime, evening, not-sure, only for supported event/date contexts.
- hem: Above knee → above-knee; at/below/floor → at-or-below-knee.
- back/straps: covered, exposed-with-cover, exposed-no-cover.
- lining: lined, sheer, explicit not-sure.
- Not sure hem/back/strap answers remain absent, never fabricated booleans.

Known deterministic guard failures still stop normal submission. Missing facts
can reach the server so it may return Ask. The existing local guard still applies
when local checking is selected.

## Files changed

Product:

- `app/(tabs)/outfits.tsx`
- `components/CheckMyLookSheet.tsx`
- `hooks/useCheckLookReview.ts` (new)
- `lib/checkLookClient.ts` (new)
- `lib/query-client.ts` (optional request timeout; stable error-field parsing)
- `server/checkLookJudgeRoute.ts` (directive reasons only)

Documentation:

- `TECHNICAL.md`
- `docs/compliance/page-update-checklist.md`
- This report

Tests:

- `__tests__/checkLookClientUi.test.ts` (new mounted sheet + actual review hook)
- `__tests__/checkLookUi.test.ts`
- `__tests__/checkLookJudge.test.ts`
- `__tests__/queryClientClassificationRefresh.test.ts`
- `__tests__/conciergeUi.test.ts`
- `__tests__/traditionalStylingUi.test.ts`
- `__tests__/wardrobeRetryScreens.test.ts`

The last three add network-hook mocks to unrelated mounted-screen fixtures.
Their existing assertions are retained; the new client tests exercise the real
hook with a mocked transport and validate every body against the real route schema.

## Verification

- Full suite: 153 files passed initially; three mounted-screen fixtures needed
  mocks for the new native/network dependency path. Those three passed after
  fixture isolation. All 156 test files passed across the full run and focused
  reruns. The final sheet changes were covered by a further focused mounted run.
- Mounted checks cover every response/error branch above, all five Ask fields,
  multi-colour resubmission, unanswered versus explicit Not sure, payload privacy,
  loading, repeated taps, deadline, close/account-switch stale responses and the
  disabled-cache foreground/background timing.
- Typecheck, lint and diff whitespace checks passed.
- Golden set: 35 passed, 0 failed.
- Benchmark validator passed, including all 53 frozen-file checksums.
- Android export passed after the final UI changes.
- The unauthenticated web entry rendered without a fatal error; this is not
  evidence for the interactive sheet or a physical device.

## Deviations and limits

No changes to the flag, frozen prompt, engine, database, migrations, consent
enforcement or server contract beyond the two approved directive reasons.

Backend restart/live integration is pending the metadata-call decision above.
No physical-device, live enabled-judge, provider-latency or under-load verification
was performed. No deployment or provider generation probe was run.
