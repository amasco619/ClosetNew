# Persona prompt and model ladder — Set 1 plain

## Scope and prompt

Only the 100 plain Set 1 looks were submitted. Set 2 and structured mode were
not run. Each look included its scenario title and paragraph. Temperature was
zero; calls were serial with five-second minimum spacing and capped exponential
back-off on 429/5xx. No gold labels were requested or used.

The exact assembled system prompt and its SHA-256, the input hashes, model
catalogue, and per-model call/token summaries are recorded in
`persona-set1-run.jsonl`. The system prompt is the trimmed persona attachment,
then the trimmed rules attachment, then this exact appended sentence:

> Descriptions that say thin or shiny mean poor quality; premium or heavy mean good quality.

## Model catalogue

The Gemini Models API returned 35 entries. After excluding image, speech,
transcription, computer-use and robotics models, and excluding the Nano Banana
image model, 20 general text-capable model IDs were listed with
`generateContent`. These catalogue entries are not proof that generation works:
`gemini-2.5-pro` returned 404 when called.

| Model ID | Input token limit | Output token limit |
| --- | ---: | ---: |
| `gemini-2.5-flash` | 1,048,576 | 65,536 |
| `gemini-2.5-flash-lite` | 1,048,576 | 65,536 |
| `gemini-2.5-pro` | 1,048,576 | 65,536 |
| `gemini-3-flash-preview` | 1,048,576 | 65,536 |
| `gemini-3.1-flash-lite` | 1,048,576 | 65,536 |
| `gemini-3.1-flash-lite-preview` | 1,048,576 | 65,536 |
| `gemini-3.1-pro-preview` | 1,048,576 | 65,536 |
| `gemini-3.1-pro-preview-customtools` | 1,048,576 | 65,536 |
| `gemini-3.5-flash` | 1,048,576 | 65,536 |
| `gemini-3.5-flash-lite` | 1,048,576 | 65,536 |
| `gemini-3.6-flash` | 1,048,576 | 65,536 |
| `gemini-3.7-flash` | 1,048,576 | 65,536 |
| `gemini-3.8-flash` | 1,048,576 | 65,536 |
| `gemini-4-argon` | 1,048,576 | 32,768 |
| `gemini-flash-latest` | 1,048,576 | 65,536 |
| `gemini-flash-lite-latest` | 1,048,576 | 65,536 |
| `gemini-omni-1.1-flash` | 131,072 | 65,536 |
| `gemini-omni-1.2-flash` | 131,072 | 65,536 |
| `gemini-omni-flash-preview` | 131,072 | 65,536 |
| `gemini-pro-latest` | 1,048,576 | 65,536 |

## Generation runs

| Model | Calls | Provider responses | Valid CSV rows | Parse failures | Prompt tokens | Output tokens | Total tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `gemini-3.5-flash-lite` (configured primary) | 100 | 100 | 99 | 1 | 128,991 | 2,428 | 131,419 |
| `gemini-3.5-flash` (configured fallback) | 100 | 100 | 100 | 0 | 128,991 | 2,488 | 131,479 |
| `gemini-2.5-pro` (first larger candidate) | 1 | 0 | 0 | 0 | 0 | 0 | 0 |

Totals: 201 generation calls; 200 successful provider responses; 262,898 reported
tokens. One output-validation failure occurred for the primary; the rejected
response text was not retained, so its exact parse defect is unknown. There
were no refusals, 429/5xx/network failures, or rate-limit headers. The 2.5 Pro
attempt returned HTTP 404 (`MODEL_NOT_FOUND`); its one failed request has no
provider token usage.

### Larger tiers not attempted

The 404 on the first larger candidate triggered the requested stop. These
catalog-listed candidates were therefore not generation-tested:

- `gemini-3.1-pro-preview`
- `gemini-3.1-pro-preview-customtools`
- `gemini-3.6-flash`
- `gemini-3.7-flash`
- `gemini-3.8-flash`
- `gemini-4-argon`
- `gemini-flash-latest`
- `gemini-omni-1.1-flash`
- `gemini-omni-1.2-flash`
- `gemini-omni-flash-preview`
- `gemini-pro-latest`

The 404 does not establish whether `gemini-2.5-pro` is disabled, retired or an
invalid/stale model ID. To resume the ladder, the provider must confirm a
currently supported larger text model ID and that this API project can generate
with it. No other larger model was probed.

## Input and prompt SHA-256

| Input | SHA-256 |
| --- | --- |
| `persona_prompt.md` | `838624bfa69c3530af58384170b84b2ab7cca387660bd5e387927b08990b79ef` |
| `looks.txt` | `939d3fd63f10e17fd33fa3dfae452a6141957a959c206ed2ceb949c679b670cc` |
| `rules_brief2.md` | `a0dc2a8d9661f23d5d685805f3c781073fe8ff7fbfc4f244c0f995bb65ac7c2c` |
| Assembled system prompt | `3024fe78a9d1157b9713eee92691713a18150328375f8eff10c065701f6b82d5` |

## Files and verification

Changed:
- `scripts/judge-experiment.ts` — added `--persona-set1-plain`; existing
  Set 1/Set 2 commands retain their prior inputs and prompt behaviour.
- `__tests__/judge-experiment.test.mjs` — added prompt, model-catalogue,
  output-schema, and access-stop checks.

Created:
- `persona-set1-gemini-3.5-flash-lite.csv`
- `persona-set1-gemini-3.5-flash.csv`
- `persona-set1-gemini-2.5-pro.csv` — partial status file: one 404 and 99 rows
  marked not attempted; it contains no judgements.
- `persona-set1-run.jsonl` — exact prompt, hashes, catalogue and run summaries.

Checks: full `npm test`, typecheck, benchmark validator and focused ESLint pass.
The benchmark validator confirmed the 53 frozen checksums are unchanged.
Focused ESLint reported zero errors and four existing array-style warnings.
`git diff --check` passed.

**Deviations:** the ladder stopped at `gemini-2.5-pro` HTTP 404 as requested.
The remaining larger tiers were not called. One primary-model response did not
pass output validation.

Not verified: judgement accuracy or stylist agreement (no labels were supplied),
unattempted larger-tier generation, app integration or device behaviour.
