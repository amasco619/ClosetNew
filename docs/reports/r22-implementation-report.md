# R-22 implementation and post-apply report

Date: 16 November 2026. No generation calls. Judge disabled by default.

## Outcome

Implemented stable percentage rollout, non-blocking verdict receipts, optional
thumbs/reason chips, an authenticated owner-checked feedback endpoint, restricted
deduplicated review exports and account-deletion/privacy coverage. Added the
requested mini-subtype check only to N4, never to the guard or model input.

## Approved SQL and live verification

Applied the exact contents of `docs/reports/r22-feedback-proposed.sql` to the
existing Amodka Supabase project. The matching migration is
`supabase/migrations/20261116233111_check_look_feedback_receipts.sql`.
The two files compare byte-identical, including the original proposal preamble.
No other live SQL/schema change was made.

| Post-apply check | Result and evidence |
|---|---|
| RLS enabled | PASS: `relrowsecurity=true` |
| anon INSERT / UPDATE / DELETE | PASS: all three effective privileges false |
| authenticated INSERT / UPDATE / DELETE | PASS: all three effective privileges false |
| Owner can read own receipt | PASS: authenticated synthetic owner read exactly one row |
| Another user cannot read it | PASS: authenticated second owner saw no row |
| service_role can write | PASS: INSERT succeeded; INSERT/UPDATE/DELETE privileges true |
| Deleting test auth user removes receipts | PASS: deleting the synthetic auth user left no owned receipts |

`docs/reports/r22-post-apply-checks.sql` contains the executed, reproducible
assertions. Synthetic users, receipts and deletions ran inside a transaction
that was rolled back; no test account or test receipt remains.

## Rollout

- Fixed versioned salt and account hash bucket, identical for Free and Premium.
- `JUDGE_ROLLOUT_PERCENT`: server-only integer 0–100; default 0, invalid values off.
- Global flag ON overrides the percentage. Operating kill switch: global flag
  OFF **and** percentage 0. During the closed test, use only the percentage;
  leave the global flag OFF.
- Eligibility is checked before judge-cache access. Outside rollout receives
  the existing disabled local directive, preserving Traditional Not judged.
- Existing disabled-directive capability cache can delay a change for up to
  15 minutes of foreground use. No environment values or rollout flags changed.
  Both settings were absent when inspected, so defaults remain off/0.

## Receipts, feedback and client

- Each delivered model response, including cache hits, attempts a new server
  request ID and receipt. The original model verdict is retained separately
  from the final floored verdict. The 60-second cache now keeps the original
  answer; the current floor is applied on every delivery.
- Receipt insertion errors, timeout or missing app version never alter or
  block the verdict. They log only `{event:"check_look_receipt_failed",count:1}`.
  A 750 ms storage deadline bounds the attempt. The verdict is delivered
  without `request_id`, so no unavailable feedback controls appear.
- App version comes from the server release's app manifest, not a new judge
  input field. Ask receipts have no thumbs capability.
- `POST /api/check-my-look/feedback` accepts only request ID, up/down and an
  optional fixed reason chip. Auth is required; an owner/non-Ask filter updates
  an existing receipt. No client-supplied verdict, payload or owner is accepted.
  A second tap replaces its feedback. Separate persistent 30/minute account
  limiting never consumes verdict quota and never calls Gemini.
- Fixed reasons: `too_strict`, `too_lenient`, `wrong_piece_read`,
  `culture_or_occasion_wrong`, `unclear_reason`, `other`. Reasons require down.
- Both tiers get thumbs on receipt-backed Works/Almost/Rethink. Premium places
  them below the reason/swap. No Ask or local-result thumbs. Down opens optional,
  skippable chips with “This helps us improve Check my look.”
- Writes are serialised, retry once quietly and never block the verdict.
  No persistent offline feedback queue was added.

## Exports and retention

Run:

```sh
npx tsx scripts/export-judge-beta.ts --since=2026-11-16T00:00:00Z --n=20
```

Outputs:
- `docs/reports/judge-beta/thumbs-down.csv`
- `docs/reports/judge-beta/works-sample.csv`

Both deduplicate identical owner/payload/final-verdict receipts within a rolling
60-second cache window. Tests cover repeated thumbs-down receipts as well as
untouched Works. Works sampling includes no-thumb receipts, not only feedback
respondents. Grouping uses a stable, domain-separated HMAC of the account ID,
with existing SESSION_SECRET; no account ID is exported. CSV fields are quoted
and spreadsheet-formula protected. Outputs are git- and deployment-ignored.

Executed once successfully: **0 thumbs-down rows; 0 Works sample rows**, as
expected with the judge off and only rolled-back synthetic test receipts.
These empty exports are operational evidence, not beta findings.

Privacy facts, inventory and draft page state: **kept while the account exists
and deleted with it; a scheduled purge is not yet built**. No time-based
retention enforcement is claimed. “Build the daily 12-month purge job” is on the
pre-public-launch checklist. The approved SQL's original comment describes only
a proposal and explicitly says the job is not installed.

Receipts store the exact exported text, including brief and profile constraints,
plus operational metadata and fixed-choice feedback. No photos, image URLs,
personal name, email or account ID occur in payload_text. Sensitive preferences
or occasions can still occur in that text. Account deletion explicitly removes
the rows and auth-user deletion also cascades.

## Floor-only change and payload proof

N4 uses existing `CHECK_LOOK_FLOOR_N4_ENABLED`, HARD classification and fixed
wording: “This look conflicts with one of your preferences.”

It also fires for a selected dress/bottom labelled `mini-dress` or `mini-skirt`
when `noShortSkirts=true`, without requiring a hem chip. Only Works is capped;
Ask, Almost and Rethink are unchanged. Existing N9 church-question precedence
is unchanged.

The guard was not edited. It still asks for the hem on a mini-labelled garment
when a hem fact is absent; fixing that is deferred to Judge v2 in TECHNICAL.md.
No model text or judge input contract was changed.

`scripts/check-r22-payloads.ts --verify` reproduces the full production request
bodies for every fixture used by existing Set 4A/4B runs:

| Input fixture | Looks | Full / fabric-stripped bodies |
|---|---:|---:|
| `attached_assets/looks4a_v2_1794442011359.json` | 24 | 48 |
| `attached_assets/looks4b_1794695292968.json` | 30 | 60 |
| Total | 54 | 108 |

All 108 entire bodies were byte-identical before/after, including Items, Brief,
constraints, guard facts, Ask instruction, response schema and system prompt.
The per-body hash manifest SHA-256 was identical:

`24794c7e9d65e9563ad0acefae4dccd40efc35d87808f368d83164ca2c246486`

Frozen judge prompt remains:

`e1f1f2497b0227c93633747bc1c0273171bcae47631bc0a6927319c0bb412ebf`

### Offline verdict changes

Ran `npx tsx scripts/score-floor-offline.ts`: **204 stored rows**.
Output: `docs/reports/judge-experiment/floor-offline.csv`.

**Every changed verdict: none.** The new N4 mini branch does not change any
stored verdict in these runs. Compared with the previously checked-in CSV,
B21's three original Set 4B conditions lose the N5 rule annotation because of
the already-approved wedding-only restriction; all three remain Rethink.
No accuracy was calculated and no stored model output was edited.

## Tests and runtime verification

- `npm test`: **158 test files passed; 0 failed**.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `node scripts/validate-benchmark-fixtures.mjs`: passed, all **53 frozen-file
  checksums** intact.
- `scripts/check-r22-payloads.ts --verify`: passed, all 108 bodies unchanged.
- Exact applied/proposed SQL comparison: passed.
- `git diff --check`: passed.
- Guard, frozen judge prompt and classifier source diffs: empty.
- Restarted backend once after the batch. Workflow is running cleanly on port
  5000. Existing classifier startup metadata check ran; no generation occurred.
- Signed-out web sign-in route rendered; receipt/feedback behaviour verified
  with mounted native-host mocks, mocked routes and live transactional SQL.

Tests cover stable/monotonic rollout, 0/100/global override, strict feedback
enums, ownership, Ask rejection, second-tap updates, separate rate-limit keys,
quota isolation, receipt failures including missing version/hung storage,
Free/Premium shapes, cache floor behaviour, mini preference on/off and Ask
preservation, mounted thumbs/chips/skip, offline retry, deletion inventory and
stage failures, anonymous exports and both export deduplication cases.
The legal-page metadata test's expected version was updated from 0.2 to 0.3;
no existing assertion was removed.

## Files changed

Server and deletion:
- `server/checkLookRollout.ts`
- `server/checkLookFeedback.ts`
- `server/checkLookJudgeRoute.ts`
- `server/checkLookFloor.ts`
- `server/routes.ts`
- `server/accountDeletionInventory.ts`

Client:
- `lib/checkLookClient.ts`
- `components/CheckLookFeedback.tsx`
- `components/CheckMyLookSheet.tsx`

Scripts, SQL and generated offline evidence:
- `scripts/export-judge-beta.ts`
- `scripts/check-r22-payloads.ts`
- `scripts/score-floor-offline.ts`
- `scripts/check-deletion-readiness.mjs`
- `supabase/migrations/20261116233111_check_look_feedback_receipts.sql`
- `docs/reports/r22-post-apply-checks.sql`
- `docs/reports/judge-experiment/floor-offline.csv`

Tests:
- `__tests__/checkLookFeedback.test.ts`
- `__tests__/checkLookFloor.test.ts`
- `__tests__/checkLookJudge.test.ts`
- `__tests__/checkLookClientUi.test.ts`
- `__tests__/checkLookUi.test.ts`
- `__tests__/accountDeletion.test.ts`
- `__tests__/legalPages.test.ts`

Documentation and output protection:
- `TECHNICAL.md`
- `constants/complianceDocumentMeta.ts`
- `docs/compliance/privacy-policy-source.md`
- `docs/compliance/privacy-policy-page.md`
- `docs/compliance/data-inventory.md`
- `docs/compliance/page-update-checklist.md`
- `docs/reports/r22-feedback-and-rollout-proposal.md` (historical status notice)
- `docs/reports/r22-implementation-report.md`
- `.gitignore`
- `.replitignore`

## Deviations, limits and unverified behaviour

- No generation, flag/environment change, new judge input, guard change,
  frozen-prompt/classifier change or v3.7 change.
- No SQL beyond the exact approved migration and transactional synthetic
  post-apply checks. No scheduler or purge was implemented.
- Nullable untouched thumbs, global-on override and stored verdict receipts
  follow the approved design.
- Feedback receipts are best-effort and may be absent. No feedback capability
  is returned in that case; delivery of the verdict takes priority.
- No physical-device, live-provider, load, multi-process contention or
  interrupted-mobile-network verification. Optional offline feedback may be lost
  after its single quiet retry.
- Export `--since` uses receipt creation time, not a later feedback-tap time;
  the approved table has no feedback-updated timestamp.
- App version records the server release manifest, not independently measured
  device installation metadata; no new input was added for that purpose.
- No non-empty live beta dataset exists to review yet. Export files may contain
  sensitive outfit/constraint text once populated and require restricted handling.
- Kill-switch propagation remains bounded by the existing 15-foreground-minute
  disabled-directive cache, not instantaneous on already-open clients.
