# Set 3B Arm B judge experiment

- Input: `attached_assets/looks3b_enriched_1794268431653.json` (SHA-256 `34198b778b56c8f382bf6daecc84a546ef9ee9afce03291ba674e849003eceb7`).
- Frozen prompt: Arm B, SHA-256 `e1f1f2497b0227c93633747bc1c0273171bcae47631bc0a6927319c0bb412ebf`.
- Requested model: `gemini-3.5-flash`; served versions are in the CSVs and JSONL log.
- Exact production projection is built with `judgeRequestSchema`, `profileJudgeConstraints`, `judgeGuard`, `exportJudgeText`, and `buildJudgeBody`.
- Provider calls were direct; no route call, Supabase read/write, feature-flag change, or application integration occurred.
- Conditions: ask-allowed 30/30 valid; fabric-stripped 30/30 valid; ask-removed 30/30 valid.
- Calls: 96 generation; 96 token reservations.
- Total tokens: 234962 reported-or-conservatively-reserved; prompt 232062, candidate/thinking 2900, unreported-usage calls 0.
- Estimated cumulative cost: $0.18492150 at input $0.75/1M, output $3.75/1M. Published Gemini 3.6 Flash Standard rates, as recorded in the prior Set 3A report; requested gemini-3.5-flash has previously served gemini-3.6-flash.
- Token cap: 600000; stopped for cap: false.
- All 96 calls returned HTTP 200 and served `gemini-3.6-flash`. Six first-attempt parse failures were retried once; all 90 looks finished with valid rows and there were no request failures.

| Condition | Calls | Valid rows | Parse failures | Request failures | Prompt tokens | Output tokens | Cost | Median ms | P95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| ask-allowed | 32 | 30/30 | 2 | 0 | 77,215 | 949 | $0.06147000 | 1127 | 1457 |
| fabric-stripped | 33 | 30/30 | 3 | 0 | 79,464 | 989 | $0.06330675 | 1054 | 1491 |
| ask-removed | 31 | 30/30 | 1 | 0 | 75,383 | 962 | $0.06014475 | 948 | 1331 |

The `ask-removed` condition applies the route's no-Ask retry schema and instruction to every look for comparison; it is not a claim that each look triggered that conditional retry in a live route call.

No gold labels were supplied or edited. The approved field normalisations change the model payload, not any gold label.
