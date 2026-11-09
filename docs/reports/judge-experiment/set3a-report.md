# Set 3A confirmation — Arm B, plain

- Input: `looks3.txt`, 72 looks, SHA-256 `dc4c09fbd4e566ab41298cba7b70cb9a8260a6f04ed7b471296039b8593ed068`
- System prompt: recorded Arm B text, SHA-256 `e1f1f2497b0227c93633747bc1c0273171bcae47631bc0a6927319c0bb412ebf`
- Requested model: `gemini-3.5-flash`; all generation responses served `gemini-3.6-flash`
- Settings: JSON schema, 1,024 maximum output tokens, minimal thinking, temperature 0, serial generation requests at least five seconds apart, one retry after a parse failure
- Budget: 509,699 reported generation tokens of 600,000; no run stopped for the token cap. Each generation had a prior token-count reservation. The experiment made 220 `countTokens` preflights and 220 generation calls. Before the first generation, three additional count-only requests validated the count endpoint format (two HTTP 400 responses, then one HTTP 200); they generated no model output and are not included in experiment token totals. Total provider requests: 443 (220 generation, 223 count-only).
- Price estimate: $0.75 per million input tokens and $3.75 per million output tokens, using the recorded published Gemini 3.6 Flash rate. Total estimated cost: **$0.39985725**.

| Run | Calls | Valid rows | Parse-failure attempts | Rows still unparsed | Prompt / candidate / thinking / total tokens | Median / P95 latency | Estimated cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| Arm B, Ask allowed | 72 | 72 | 0 | 0 | 164,858 / 1,918 / 0 / 166,776 | 1,199 / 1,445 ms | $0.13083600 |
| Arm B, Ask removed from schema | 75 | 71 | 4 | 1 | 171,708 / 2,038 / 0 / 173,746 | 1,182 / 1,443 ms | $0.13642350 |
| Arm B, quality stripped | 73 | 71 | 2 | 1 | 167,272 / 1,905 / 0 / 169,177 | 1,171 / 1,392 ms | $0.13259775 |

The quality-stripped input replaced 102 exact `(quality premium)`, `(quality standard)` or `(quality poor)` occurrences with `(quality not stated)`. All generation responses were HTTP 200 with finish reason `STOP`; there were no token-count failures. The two runs with Ask removed or quality stripped each retained one blank/unparsed CSV row after the single allowed retry.

CSV outputs:
- `set3a-arm-b-ask-allowed.csv`
- `set3a-arm-b-ask-removed.csv`
- `set3a-arm-b-quality-stripped.csv`

Per-call model versions, usage, latency and rejected parse-response text, plus the exact prompt and run summaries, are appended to `persona-set1-run.jsonl`. No accuracy or verdict-distribution analysis was performed.

Verification: the focused judge-experiment suite passed (35/35), TypeScript typecheck passed, and all three CSVs have the expected header and 72 unique look IDs from `U01-A` through `U18-D`.
