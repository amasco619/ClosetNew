# Set 4A — frozen Arm B, production payload builder

## Scope and provenance

- Input: `attached_assets/looks4a_v2_1794442011359.json`, 24 looks.
- Input SHA-256: `43571913dd3068f1ee86a0ceebd7da01e74ff02d4554f0b0cf558d54bb9e985d`.
- Corrected W3-A contains a bottom (`midi-skirt`) and top (`blouse`), with pumps and trench.
- Frozen Arm B SHA-256: `e1f1f2497b0227c93633747bc1c0273171bcae47631bc0a6927319c0bb412ebf`.
- Requested model: `gemini-3.5-flash`. Temperature 0; JSON response schema; maximum 1,024 output tokens; thinking level `minimal`.
- Two conditions only: Ask-allowed and fabric-stripped. No standalone Ask-removed condition, other set, structured-mode sweep or gold-label comparison.

## Method

`scripts/run-set4a-judge.ts` imports the real `judgeRequestSchema`, `profileJudgeConstraints`, `judgeGuard`, `exportJudgeText`, `buildJudgeBody` and `parseJudgeResponse`. It adds deterministic synthetic owned UUIDs and maps the supplied item property names to app property names (`subtype` → `subType`, `colour` → `colorFamily`, `formality` → `formalityLevel`). Null stored attributes remain absent. No values are inferred from `rater_text`, which is not sent.

Both conditions passed request-schema and production selection validation for all 24 looks before generation. There are no assigned group UUIDs requiring synthetic group construction in this input. In the sensitivity condition, fabric is removed before the guard and exporter run. Guard consequences of removing fabric are therefore retained, not overwritten with the first condition's guard.

The existing Set 3B v2 experimental unsupported-Ask rule is retained: an Ask must correspond to `guard.missing`. Denomination, assigned set, announced funeral colours, hem position and sleeve lining are matched to their corresponding missing entries. The current sleeve-length Ask is accepted only for the guard's missing sleeve length required by the coverage preference. Unsupported Asks receive one retry using the real no-Ask body builder and its existing non-Ask instruction. This is a retry within the condition, not a third experimental condition. Invalid output also receives at most one parse retry.

Calls are serial, with at least five seconds between generation starts. Transport timeout is 30 seconds per call; the experiment does not exercise the live route's end-to-end deadline.

### Budget

The previous Set 3B v2 cap of **600,000 tokens** is retained. Before each generation call, `countTokens` counts the exact system and user text in its supported contents format. Reservation is that count plus 1,024 output tokens plus 256 tokens of overhead. The call is not made if the reservation would exceed the remaining cap. Reported actual usage replaces the reservation; an unreported usage amount retains its full reservation. Token-counter requests are not generation calls.

### Output format and rejection evidence

- `set4a-ask-allowed.csv`
- `set4a-fabric-stripped.csv`
- `set4a-run.jsonl`

Each CSV has `look_id, verdict, reason, missing_fact, served_model, latency_ms, guard, brief_json, items_block`. The guard column contains the complete JSON object, including `pass`, `failures`, `missing` and `flags`. `brief_json` and `items_block` preserve the exact exported strings.

The JSONL contains the manifest, every reservation, every provider attempt, every final row, condition summaries and the final budget summary. Every attempt records the complete generation request body, exact Brief and Items, guard, status, served version, latency and usage. `latency_ms` in a CSV is the last attempt's provider latency; `total_latency_ms` in JSONL also includes prior attempts' provider latency, excluding spacing and token counting.

For every rejected HTTP-200 output, `rejected_response_text` retains the raw non-thinking model text and `rejection_reasons` identifies invalid JSON/schema, enum, word/character limit, finish reason or another precise parser rejection. This includes first attempts, not just terminal failures.

## Results

Run window: **12 November 2026, 00:10:00–00:14:28 UTC**.

| Condition | Valid rows | Generation calls | Parse failures | Request failures | Unsupported Asks converted | Input tokens | Output tokens | Reported total tokens | Estimated cost | Median latency | P95 latency |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Ask-allowed | 24/24 | 26 | 0 | 0 | 2 | 63,464 | 828 | 64,292 | $0.050703 | 1,213 ms | 4,145 ms |
| Fabric-stripped | 24/24 | 28 | 1 | 0 | 3 | 68,141 | 891 | 69,032 | $0.054447 | 1,172 ms | 1,296 ms |
| Total | 48/48 | 54 | 1 | 0 | 5 | 131,605 | 1,719 | 133,324 | **$0.105150** | — | — |

All **54/54 generation calls returned HTTP 200** and served **`gemini-3.6-flash`**. All reported thinking token counts were zero. There were 54 successful token-count requests, one reservation before each generation call. The 600,000-token cap was not hit; final reported-or-reserved usage was **133,324**.

| Condition | Works | Almost | Rethink | Ask | Terminal failures |
|---|---:|---:|---:|---:|---:|
| Ask-allowed | 13 | 3 | 7 | 1 | 0 |
| Fabric-stripped | 11 | 5 | 6 | 2 | 0 |

These are output counts, not accuracy or correctness measurements.

### First-attempt parse failure: exact cause and retained text

The only parse failure was **W2-C, fabric-stripped, attempt 1**. HTTP status was 200, finish reason `STOP`. The JSON structure and enum values were valid, but the reason contained **16 whitespace-separated words**, exceeding the production parser's 15-word limit. The single retry succeeded. No output was truncated or repaired in code.

Raw rejected response, also retained verbatim in `set4a-run.jsonl`:

```json
{"verdict":"Works","reason":"Lilac kaftan with matching hijab and flats is complete and suitable for a home naming ceremony.","missing_fact":null}
```

Logged rejection: `word limit: 16 words exceeds 15`. There were no first-attempt schema or enum failures, and no second-attempt parse failures.

### Unsupported-Ask conversions

| Condition | Look | Initial missing_fact | Result |
|---|---|---|---|
| Ask-allowed | W4-A | denomination | Converted by no-Ask retry |
| Ask-allowed | W5-C | denomination | Converted by no-Ask retry |
| Fabric-stripped | W3-B | announced_colours | Converted by no-Ask retry |
| Fabric-stripped | W3-C | hem_position | Converted by no-Ask retry |
| Fabric-stripped | W5-C | denomination | Converted by no-Ask retry |

Each initial question lacked a matching guard missing entry. Supported Asks were retained: W6-C (`assigned_set`) in both conditions, and W3-D (`announced_colours`) in fabric-stripped.

## Cost basis

Estimates use the same recorded Gemini 3.6 Flash Standard prices as Set 3B v2: **$0.75 per million input tokens; $3.75 per million output tokens**, including reported thinking output. That earlier report recorded a pricing-page check on 7 November 2026. Prices were not re-verified during this run; these are estimates, not a billing statement.

## Verification and limitations

- TypeScript typecheck and lint of the experiment script passed.
- All tracked application, server, engine and fixture files were hashed before generation and matched byte-for-byte after the completed run. No existing tracked file was modified, including the 53 frozen files.
- A completed-output audit verified 24 unique rows per CSV, all 48 initial look/condition attempts, CSV/JSONL agreement, exact Brief/Items/guard correspondence to each sent body, the frozen system-prompt hash on all calls, reservation bounds and rejection-text retention.
- No product code, feature flag, environment variable, database, migration, frozen prompt or fixture was changed. No Supabase access, app integration, workflow restart or deployment was performed.
- Generation was real, but the authenticated HTTP route, consent, entitlements, quota, cache and client UI were not exercised. This is a payload-builder experiment, not a production feature enablement.
- No gold labels were requested, received or used. No accuracy is reported.

## Deviations

None in experimental scope. Current production schema/exporter/guard are reused without modifying their behaviour; the explicitly requested Set 3B v2 unsupported-Ask matching is applied in the harness.

## Files added

- `scripts/run-set4a-judge.ts` — standalone experiment harness only.
- `docs/reports/judge-experiment/set4a-ask-allowed.csv`
- `docs/reports/judge-experiment/set4a-fabric-stripped.csv`
- `docs/reports/judge-experiment/set4a-run.jsonl`
- `docs/reports/judge-experiment/set4a-report.md`
