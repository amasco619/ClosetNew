# African/Nigerian Fashion Benchmark v1 — Frozen Snapshot

This directory is the immutable Track B snapshot prepared on 2026-09-10.

## Contents

- `benchmark-input/` — active women-focused v1 case and fixture files.
- `gold-standard/` — the supplied signed JSON labels and CSV summary, copied byte-for-byte.
- `images/` — the supplied 40 synthetic GU images, contact sheet, package README, and
  synthetic provenance register, copied without regeneration or editing.
- `benchmark-manifest.json` — benchmark identity, scope, versions, reviewer reference,
  Track C status, and key hashes.
- `SHA256SUMS` — SHA-256 checksums for all 53 files under `benchmark-input/`,
  `gold-standard/`, and `images/`.

## Integrity check

From the repository root:

```bash
sha256sum -c docs/recommendation/africa/benchmark-v1/frozen-v1/SHA256SUMS
node scripts/validate-benchmark-fixtures.mjs
```

## Track C guard

Track C has not been executed. Before Track C, the Product Owner must resolve the
reviewer-provenance exception recorded in `benchmark-manifest.json`. Any attestation
must be stored separately; the frozen gold-label files must not be edited.