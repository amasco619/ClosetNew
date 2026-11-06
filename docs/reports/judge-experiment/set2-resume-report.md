# Judge experiment: Set 1 resume and Set 2

## Outcome

Completed the 76 missing Set 1 plain-fallback rows and all four Set 2 batches.
Each requested CSV now has 100 valid rows and zero remaining failures.
No ratings or gold labels were requested, received or used.

| Batch | Requested model | Calls this task | Input tokens | Output tokens | Total tokens | Output-validation failures |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Set 1 plain-fallback resume | gemini-3.5-flash | 76 | 60,702 | 2,093 | 62,795 | 0 |
| Set 2 plain-primary | gemini-3.5-flash-lite | 102 | 108,409 | 3,224 | 111,633 | 2 |
| Set 2 plain-fallback | gemini-3.5-flash | 100 | 106,268 | 2,727 | 108,995 | 0 |
| Set 2 structured-primary | gemini-3.5-flash-lite | 103 | 115,899 | 3,018 | 118,917 | 3 |
| Set 2 structured-fallback | gemini-3.5-flash | 100 | 112,515 | 2,573 | 115,088 | 0 |
| **Total** | | **481** | **503,793** | **13,635** | **517,428** | **5** |

Totals include all five successful failed-row retries and the original responses
that failed validation. Set 2 alone used 405 calls and 454,633 tokens.
No HTTP/request failures, refusals, 429s or 5xx responses occurred.
The 11-consecutive-failure stop was not triggered.

The five initial validation failures were T09-A and T22-B in plain-primary,
and T01-B, T09-A and T25-C in structured-primary. Each passed on its first retry.
The decoder groups malformed JSON, unexpected keys/verdicts and reasons over
15 words as PARSE_FAILURE; the run did not retain the rejected response text,
so the precise validation cause is not established.

## Outputs

All paths are under `docs/reports/judge-experiment/`:

- `plain-fallback.csv` — Set 1, completed.
- `set2-plain-primary.csv`
- `set2-plain-fallback.csv`
- `set2-structured-primary.csv`
- `set2-structured-fallback.csv`
- `set2-resume-run.jsonl` — input/prompt hashes and per-invocation usage summaries.

Each CSV has `look_id,verdict,reason`. All 400 final Set 2 rows have a valid
Works/Almost/Rethink/Ask verdict and a reason of at most 15 whitespace-separated
words. Ask is an allowed answer, not a request failure.

## Script and preservation

Changed `scripts/judge-experiment.ts`; added six isolated tests in
`__tests__/judge-experiment.test.mjs`.

New command:

```sh
node_modules/.bin/tsx scripts/judge-experiment.ts --set2-and-resume
```

The no-argument Set 1 command retains its original inputs, prompt, three-verdict
schema and batch order. The new command resumes only Set 1 plain-fallback, then
the four Set 2 batches. Set 2 sends either the original scenario/look text or the
matching JSON entry, with supplied nulls retained. Temperature is zero.

Calls remain serial with five-second minimum call-start spacing within each
batch. HTTP 429/5xx retries use exponential back-off capped at 60 seconds.
Eleven consecutive request failures stop the run. Incomplete batches gate later
batches. Two resumptions retried only the five output-validation failures.
No successful look was resubmitted.

Byte comparisons verified:

- All 24 pre-existing successful Set 1 plain-fallback records are unchanged.
- Set 1 plain-primary and both Set 1 structured CSVs are entirely unchanged.
- All 98 successful Set 2 plain-primary records survived its retry unchanged.
- All 97 successful Set 2 structured-primary records survived its retry unchanged.

## SHA-256 provenance

| Input | SHA-256 |
| --- | --- |
| looks2.txt | `1c6de4151e25808171378cd5ba9785202fbc9778bd364a228d27d8e193d35880` |
| looks2.json | `2c46631792418adc027c778c60e8e15193ca5298c00d26cec6a3ecb6cfd5962a` |
| rules_brief2.md | `a0dc2a8d9661f23d5d685805f3c781073fe8ff7fbfc4f244c0f995bb65ac7c2c` |
| Set 2 common system prompt | `fcbca4fa6949f832cbf935127472822856f32655b0cbfd1f07814ddd1f3cee68` |
| Unchanged Set 1 common system prompt | `981ed9ee3e3254ed328fe72e5275fbb1cfd1371cb424357305472b4748bdf60f` |

Prompt hashes cover the rules brief plus output instructions, not each varying
look payload. Original attachment files were not edited.

## Rate limits and billing evidence

Safe rate-limit header capture covers successful and failed responses. No
allowlisted rate-limit headers or quota violations were observed in this task.
Therefore this run does not establish the project's current RPM/RPD limits or
provider billing tier. Billing was reported enabled by the user; no billing or
secret configuration was inspected or changed.

## Verification and boundaries

- Six focused tests pass: unchanged Set 1 prompt/decoding; Set 2 input/null
  fidelity and Ask/length validation; retries and header capture; raw-record
  preservation; 11-failure stop; new-command Set 1-only resume and gating.
- Typecheck passes.
- Targeted ESLint: zero errors; four pre-existing array-style warnings.
- Benchmark validator passes, including all 53 frozen checksums.
- Final CSV ID counts, allowed verdicts, reason lengths and preservation checks pass.
- `git diff --check` passes.

**Deviations:** none. No app integration, server route, migration, new secret,
V1/v3.7 change or frozen-file change. Set 1's unrequested structured batches were
not run.

Not verified: judgement accuracy or semantic correctness against reviewers,
because no gold labels were available; full application test suite or device
behaviour, because this was a script-only experiment; actual monetary charges,
provider tier or current quota ceilings.
