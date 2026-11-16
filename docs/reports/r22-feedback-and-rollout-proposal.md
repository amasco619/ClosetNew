# R-22: approval checkpoint

Historical checkpoint: the SQL was subsequently approved and applied exactly
as written on 16 November 2026. See `r22-implementation-report.md` for the final
implementation, verification and retention position. No scheduled purge was built.

## Implemented before the database approval checkpoint

- N5 now applies only to `wedding`, not `traditional-wedding`.
- Regression tests cover the exclusion, the wedding assigned-set exemption and
  existing light-colour behaviour.
- Added tests documenting the unchanged N6 treatment of black, white, gold and
  silver: there is no implicit exemption when these colours are unannounced.
- Updated TECHNICAL.md.

## Floor findings (guard and N6 behaviour unchanged)

`lib/checkLookGuard.ts:270-290` checks `noShortSkirts` for selected dresses and
bottoms. A dress fails on an explicit `hemPosition: above-knee`; without a hem
fact it reports a missing fact. A recognised skirt follows the same hem-fact
test; recognised trousers are skipped; an unrecognised bottom produces a missing
applicability fact. Although `mini-skirt` is recognised as a skirt, neither
`mini-skirt` nor `mini-dress` alone causes a preference failure. This differs
from the requested definition (above-knee fact OR mini subtype). The guard has
not been changed.

`server/checkLookFloor.ts`, `isFuneralDressOrSetColourMismatch`: black, white,
gold and silver are treated like any other single known colour. A single dress
in one of those colours fires N6 if it does not match an announced colour.
For an assigned top/bottom set, both pieces must be single-coloured and both
outside the announced colours. A matching piece prevents this direct check
from firing. Metallic accessories are ignored, as are all footwear, bags,
jewellery and outerwear. Multi-colour/unknown items or ambiguous base-garment
dominance do not trigger the direct check. The existing guard remains
independent and unchanged.

## Exact SQL awaiting approval

See `docs/reports/r22-feedback-proposed.sql`. It has not been executed and is
outside the migrations directory to avoid automatic application.

One table records delivered model verdicts, including those with no feedback,
so a Works sample does not select only people who tapped a thumb. `thumbs` is
NULL until a tap, then only `up` or `down`; this nullable initial state is
explicitly proposed for approval. `reason_chip` is optional and legal only for
`down`. Ask receipts cannot carry thumbs.

All metadata is server-owned. The client submits only request ID, thumb and
optional enum chip to the feedback endpoint; the endpoint updates a receipt
owned by the authenticated account, never inserts client-supplied metadata.
No authenticated INSERT or UPDATE grants allow bypassing that check. Owners
may SELECT their own rows, and service-role writes serve the validated endpoint.
`auth.users` deletion cascades. Explicit account-cleanup integration, deletion
readiness checks and tests will also be added after approval.

Payload text is exactly the allowlisted exported model input, including
constraints and brief. It is not the system prompt and includes no photos,
URLs, personal name, email or account ID. No user-authored feedback free-text
field is proposed. Outfit text can still disclose sensitive preferences or
occasions; privacy wording must describe this clearly.

Retention proposal: 12 months from verdict creation, not refreshed by a second
tap. The SQL does not pretend to enforce retention: a daily server-side purge
must be implemented and operationally scheduled after approval. No database
scheduler, extension or additional migration is included in this proposal.

## Implementation held pending SQL approval

- Stable server hash bucket with a fixed versioned salt, shared by both tiers;
  strict integer rollout percentage 0–100, default 0.
- Eligibility is global flag OR bucket below percentage. With the global flag
  false, 0 disables all and 100 enables all; a true global flag overrides 0,
  matching the explicit global-on test. Eligibility is checked before serving
  a judge-cache hit. The client's existing disabled-directive cache may keep a
  client local for up to 15 minutes of foreground use.
- Mint a server request ID for each delivered model verdict, including cache
  responses. Preserve original model verdict and served-version metadata in
  cache, rather than reconstructing either from the floored answer.
- Persist the receipt before exposing a feedback-capable response. Never mint
  judge receipts for local-only directives. No new judge input fields.
- Authenticated feedback endpoint with a separate rate limit and strict enums;
  ownership validation through the existing receipt; no model or verdict-quota
  calls. A second tap updates the same row.
- Thumbs for model-judged Works/Almost/Rethink, no Ask or local Not judged;
  optional down-reason chips; quiet single retry on network failure.
- Deletion tests, readiness assertion, privacy facts/source and checklist.
- Date-filtered thumbs-down export and unbiased Works sample from all receipts,
  without user IDs. Grouping uses a stable, domain-separated HMAC, not a raw
  user-ID hash. Export access remains server/admin-only.
- Endpoint, rollout, deletion, export and mounted-client tests.

Neither rollout nor feedback is implemented at this checkpoint. No flag or
environment setting has changed.

## Checks for the implemented floor follow-up

- Full suite: 157 test files passed, zero failed.
- Typecheck and lint passed.
- Benchmark validator passed, including all 53 frozen-file checksums.
- Frozen judge prompt:
  `e1f1f2497b0227c93633747bc1c0273171bcae47631bc0a6927319c0bb412ebf`.
- `git diff --check` passed.
- Proposed SQL has not been executed, including against a disposable database.
  SQL execution/security tests remain pending approval.
- No generation calls, migrations, Supabase writes or device verification.

## Files changed

- `server/checkLookFloor.ts`
- `__tests__/checkLookFloor.test.ts`
- `TECHNICAL.md`
- `docs/reports/r22-feedback-proposed.sql`
- `docs/reports/r22-feedback-and-rollout-proposal.md`

## Deviations and surprises

- Approval is needed for NULL thumbs on untouched verdict receipts, required
  to support the requested Works sample without feedback-selection bias.
- The current noShortSkirts guard does not implement the mini-subtype shortcut;
  it is reported, not changed.
- The global-on override conflicts with a literal reading of “0 turns the judge
  off for everyone”; the implementation proposal follows the explicit OR rule
  and global-on test.
- Twelve-month retention is a proposal, not a currently enforced guarantee.
