# Set 4B church-look rerun

## Payload correction

The harness now converts each fixture's `garmentFactsByItemIndex` into `garmentFacts` keyed by the same synthetic item UUIDs used in `selection.itemIds`. The production request schema, guard, exporter, body builder, parser and frozen prompt are unchanged.

Coverage tests exercise B10, B11, B12, B13, B14 and B25. Each supplied hem and back/strap fact is present under its item's UUID and appears in the exported Items text. For B10, B12, B14 and B25, the guard no longer lists those supplied facts as missing. A route-level test posts facts keyed by the selected UUID and confirms the route's exported Items text and guard result consume them.

## Rerun

| Condition | Calls / rows | Works | Almost | Rethink | Ask | Parse failures | Retries | Supported asks | P50 | P95 | Tokens | Estimated cost |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| ask-allowed-run1 | 6 / 6 | 1 | 2 | 2 | 1 | 0 | 0 | 1 / 1 | 877 ms | 1,105 ms | 14,711 | $0.01159725 |
| ask-allowed-run2 | 6 / 6 | 2 | 2 | 1 | 1 | 0 | 0 | 1 / 1 | 772 ms | 1,109 ms | 14,701 | $0.01155975 |
| fabric-stripped | 6 / 6 | 2 | 2 | 1 | 1 | 0 | 0 | 1 / 1 | 725 ms | 1,117 ms | 14,673 | $0.01157475 |
| **Total** | **18 / 18** | **5** | **6** | **4** | **3** | **0** | **0** | **3 / 3** | — | — | **44,085** | **$0.03473175** |

All three Ask responses were for B13 with `missing_fact: denomination`; the guard listed `church denomination` (and a church sleeve-rule question), so each Ask was supported. There were no unsupported Asks or request failures.

Requested model: `gemini-3.5-flash`. Served model on every call: `gemini-3.6-flash`. Frozen prompt SHA-256: `e1f1f2497b0227c93633747bc1c0273171bcae47631bc0a6927319c0bb412ebf`.

The cost is an estimate using the existing harness rate basis ($0.75 per million prompt tokens and $3.75 per million output tokens); prices were not independently re-verified for this rerun.

## Files

- `scripts/run-set4b-judge.ts`
- `__tests__/checkLookJudge.test.ts`
- `docs/reports/judge-experiment/set4b-church-ask-allowed-run1.csv`
- `docs/reports/judge-experiment/set4b-church-ask-allowed-run2.csv`
- `docs/reports/judge-experiment/set4b-church-fabric-stripped.csv`
- `docs/reports/judge-experiment/set4b-church-run.jsonl` — includes the exported Items block for every call.

## Verification

- `npm test -- checkLookJudge.test.ts` — passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npx tsx scripts/run-set4b-judge.ts --church-only --validate-only` — six looks in each of three conditions.
