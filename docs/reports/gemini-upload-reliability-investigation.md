# Gemini upload reliability investigation — 2026-10-22

## Status

**Unresolved provider capacity/availability blocker. No reliable upload fix is confirmed.**
The prior default-model and response-budget changes resolved reproduced issues,
but successful bundled-image samples did not establish reliable service for the
user's uploads. No further application/configuration/billing change was made
during this investigation.

## Evidence from the physical-device requests

After successful background removal, the shared `/api/classify-garment` handler
recorded:

- One bulk item: primary HTTP 200, `STOP`, valid classification, approximately 8.7s
  for the whole server request.
- Other bulk item: primary provider request exceeded its 20s timeout; HTTP 504.
- Retry: primary HTTP 429; rolling fallback HTTP 200/STOP after approximately
  16.8s at the provider and 18.5s for the whole request.
- Single item: primary HTTP 429; fallback exceeded its 20s timeout; HTTP 504.

These latest failures are not JSON truncation, background-removal failures, or
evidence that the phone lost connectivity. The existing UI groups these server
errors under the generic "Connection paused" label.

## Live connection and response checks

The same configured Google API key was used server-side, without printing it.
Model listing was read successfully; listing a model does **not** establish
that it can serve generateContent requests.

| Probe | Result |
|---|---|
| `gemini-2.5-flash`, tiny JSON-only request | HTTP 429 / RESOURCE_EXHAUSTED |
| `gemini-2.5-flash-lite`, actual prompt + green-top crop | HTTP 404 / NOT_FOUND, 0.245s |
| `gemini-3.1-flash-lite`, actual prompt + green-top crop | HTTP 503 / UNAVAILABLE, 1.543s |
| `gemini-3.5-flash-lite`, actual prompt + green-top crop, minimal thinking | No response within 35s; client aborted at 35.081s |
| `gemini-flash-lite-latest`, actual prompt + sneaker crop, minimal thinking | HTTP 200 / STOP, resolved to gemini-3.5-flash-lite, 10.359s; JSON parsed and normalized classification fields were present |

Google's structured quota failure explicitly identified:

- Metric: `generativelanguage.googleapis.com/generate_content_free_tier_requests`
- Quota: `GenerateRequestsPerDayPerProjectPerModel-FreeTier`
- Model: `gemini-2.5-flash`
- Observed quota value: **20 requests per project per model per day**
- Provider retry delay at observation: **49,827 seconds** (about 13h 50m)

This establishes daily exhaustion for the primary, not merely a burst/RPM
problem. A delay of a few seconds or another immediate retry will not restore
that model's daily allowance. The quota is Google's API-project allowance, not
the app's wardrobe, PhotoRoom, or subscription allowance.

## Test-input and verification boundaries

Only garment regions were cropped from the two supplied screenshots into
temporary files outside the repository. The screenshots had already-rendered
PhotoRoom results. The original picker image and original provider-request bytes
were unavailable, so these are representative crops, not byte-identical replays.
The prompt and the currently configured 2048-token response budget were used.

The sneaker probe checked the actual provider response through JSON parsing and
`processGeminiResult`. It was not a successful authenticated picker-to-save
device test, and it does not establish the green-top path works. No user wardrobe
records were created or modified; no additional PhotoRoom allowance was consumed.
No raw provider output, API key, account details, or customer photo was added to
this report or the repository.

## Required next step

An authorised Google-project operator must either wait for the primary model's
daily quota to reset, or review the project's Gemini billing/quota configuration
and arrange sufficient capacity. Increasing quotas or enabling paid billing was
**not** authorised or performed here. Another API key in the same project would
not, by itself, establish a new project quota.

Once capacity is available, repeat the single and concurrent multi-image checks
with the current shared handler. Confirm valid completed JSON, semantic/schema
validation, provider latency within the deadline, and authenticated app results.
Restored quota alone is not proof that latency or availability issues are fixed.

Do not silently relax validation, increase wardrobe quotas, change consent
enforcement, or keep rotating models based on one successful sample.

## Files changed / checks

Only this report, the related TECHNICAL.md status note, and the existing provider
diagnostics memory were updated. No application code, model defaults, environment
variables, dependencies, database data/schema, billing, consent, engine, or frozen
artifacts changed. No publication/deployment occurred.

Live checks above were performed; the app test suite was not rerun because no
executable code changed. The previous passing suite does not validate Google's
live capacity. Physical-device verification remains outstanding.
