---
name: Benchmark gold-label independence
description: Rules for keeping the African fashion benchmark (and any future gold-label dataset) free of reviewer contamination
---

# Benchmark gold-label independence

**Rule:** Anything the independent reviewer sees must contain zero author-assigned
evaluative judgements on the dimensions being measured. This is stricter than just
"no engine output":

1. **Fixture catalogs are two-tier.** Reviewer-facing `fixtures.md` carries only
   descriptive facts (ID, category, sub-type, pattern, scale, fabric, colour). The
   typed runner catalog (occasion tags, numeric formality, warmth) lives in
   `internal/runner-fixtures.md`. `scripts/validate-benchmark-fixtures.mjs` enforces
   row-for-row consistency and rejects evaluative columns in the reviewer file.
2. **Gold labels contain only reviewer-owned fields.** Developer taxonomy mappings are
   a separate internal artifact keyed by case ID (`internal/gu-taxonomy-analysis.md`),
   never merged into or appended to signed label files — otherwise labels are either
   schema-invalid or mutated after lock.
3. **No steering guidance in rubric/instructions.** Prescriptive examples ("large
   wax-print + solid → 5", "co-ords are deliberate") on the exact dimensions being
   measured count as developer opinions. Ask reviewers to explain their approach
   instead.
4. **Case titles/section headers must not leak design intent** ("Adversarial",
   "coordination test", "Hero print") — keep intent in `internal/case-design-intent.md`.

**Why:** Two completion reviews rejected the Track B package for exactly these leaks;
they invalidate the benchmark's core anti-contamination control.

**How to apply:** Before distributing any reviewer package or claiming integrity, run
`node scripts/validate-benchmark-fixtures.mjs` and re-audit the boundary list in
`docs/recommendation/africa/benchmark-v1/internal/README.md`. Never claim
"machine-verified" without a committed validator.
