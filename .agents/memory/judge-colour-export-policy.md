---
name: Judge colour export policy
description: User-approved colour normalisation and unmatched-colour telemetry for Check my look payloads.
---

Preserve every recognised colour in a compound value, joined with “and”. Keep distinct canonical values distinct (for example, royal blue vs blue and ash vs grey). Map only explicit aliases. An unmatched non-empty colour stays `unknown`; never substitute a nearby colour. Log only the sanitised unmatched token and its count, with no item or account identifiers.

**Why:** The user wants accurate judge inputs and visibility into real-world colour vocabulary without silently changing a garment's colour or logging personal data.

**How to apply:** When changing the judge input exporter or its colour allowlist, add explicit aliases and tests for compounds, unmatched tokens, and token/count-only logging. Do not expand this to classifier or persisted colour values without separate approval.
