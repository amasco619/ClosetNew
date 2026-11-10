# Set 3B v2 exporter rerun

- Input SHA-256: `4f161f226cef017ef728abf106f0452101481d0fa5478217419ce18ff1047b5b`.
- Arm B prompt SHA-256: `e1f1f2497b0227c93633747bc1c0273171bcae47631bc0a6927319c0bb412ebf`; requested model: `gemini-3.5-flash`.
- Calls use the production request text builder; no route, Supabase, feature flag, or database was touched.
- Generation settings: temperature 0, 1,024 output tokens, minimal thinking; serial generation calls were spaced at least five seconds apart. Prompt and route code were not changed.
- Token cap: 600000; reported-or-reserved total: 164388; exceeded: false.
- Token-counter requests: 67; failed: 0.
- Total calls: 67; input tokens: 162314; output/thinking tokens: 2074; estimated cost: $0.12951300.
- Cost basis: $0.75 per million input tokens and $3.75 per million output tokens, the recorded published Gemini 3.6 Flash Standard prices (pricing page checked 2026-11-07). All 67 generation calls served `gemini-3.6-flash`; token-counter calls are reported separately and excluded from generation cost.
- One ask-allowed row, `V03-A`, remained invalid after the production-style single parse retry. It is marked `REQUEST_FAILED` in the CSV; both provider responses were HTTP 200 but did not pass the response parser. There were no HTTP request failures.
- The first reservation attempt sent 60 `countTokens` requests that returned HTTP 400 because that endpoint rejects `systemInstruction`; it made no `generateContent` calls. The harness was corrected to count the same system and user text in a supported `contents` request. A probe then returned 2,456 prompt tokens, and the final run completed with 67/67 successful reservations.

| Condition | Valid rows | Calls | Parse failures | Request failures | Unsupported Ask | Converted Ask retries | Served versions | Median ms | P95 ms | Tokens | Cost |
|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|
| ask-allowed | 29/30 | 34 | 3 | 0 | 2 | 2 | {"gemini-3.6-flash":34} | 1262 | 1546 | 83595 | $0.06590925 |
| fabric-stripped | 30/30 | 33 | 0 | 0 | 3 | 3 | {"gemini-3.6-flash":33} | 1250 | 1416 | 80793 | $0.06360375 |

- Non-empty unmatched item colours: none in this 30-look input. Missing/empty colours remain `unknown` and are not logged.
- Colour export now recognises the requested canonical additions and explicit aliases, keeps `royal blue` distinct from `blue`, keeps `ash` distinct from `grey`, and preserves compound colours with `and`. An unmatched non-empty component becomes `unknown`; the production exporter logs only the sanitised token and its count, without item or account identifiers.
- The exporter allowlists now include the approved additional fabrics and subtypes; safe `fit`, `neckline`, and integer `formality` values are included when present. Existing sleeve-length export is preserved.
- Supported Ask means its `missing_fact` maps to a matching item in `guard.missing`; otherwise the harness retries with the production `buildJudgeBody(..., false)` no-Ask schema.
- `set3b-v2-before-after-payloads.json` contains exact pre-change and post-change request bodies for V01-D, V02-C, V04-E, V05-C and V05-A.
- No gold labels were supplied or scored; no verdict was scored against a gold label.
- `npm test`, `npm run typecheck`, and `npm run lint` passed. Backend restarted and reached its listening state. No physical-device verification was performed.

## Exporter fields still dropped

| Field or value | Reason |
|---|---|
| Item name, description, IDs, photo URI/path, local photo metadata | Privacy and prompt-injection minimisation; labels come from allowlists instead. |
| Persona and `brief_text` | Free text can contain personal data; the route accepts only structured brief fields. |
| Venue qualifiers such as “upscale restaurant” and “conservative interview” | No route/schema field carries them; adding one is outside this exporter-only change. |
| Per-item `occasionTags` and `seasonTags` | Not represented in the judge prompt contract. |
| `category` when a safe subtype is emitted | The current compact `Name` slot sends subtype or category fallback, not both. |
| Unsupported subtype, fabric, pattern, fit, neckline or formality values | They fail the corresponding closed allowlist; subtype falls back to allowed category; other values are omitted. |
| Formality outside integer 1–10 | The exporter only emits an integer from its bounded set. |
| Quality | The app item schema has no quality field; prompt remains `Quality: unknown`. |
| Pattern scale, fabric weight outside its enum, accent colour, metal tone, mood, rise, warmth band, dominant HSL/Lab, model confidence, purchase price, timestamps, confirmed fields | Not in this judge prompt contract; values are not sent. |
| Profile fields other than accepted constraints | Route exports only supported constraints; unset/default preferences are not inferred. |
| Announced colours for contexts whose brief schema has no announced-colours field | Route accepts this only for funeral briefs. |
