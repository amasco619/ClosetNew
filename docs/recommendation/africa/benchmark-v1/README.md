# Amodka — African/Nigerian Fashion Gold-Standard Benchmark v1

**Phase:** 5C.3 Track B  
**Status:** AWAITING INDEPENDENT REVIEWER SIGN-OFF  
**Engine version:** v3.7 (FROZEN — no changes made or permitted)  
**Created:** 2026-08-19  

---

## Purpose

This benchmark package tests whether Amodka's frozen Recommendation Engine v3.7 can
correctly understand and rank Nigerian/African fashion within a mixed-wardrobe context.

Track A (Nigeria/Africa Fashion Intelligence Capability Audit) confirmed that the engine
has a meaningful foundation for Nigerian/African fashion but that **no independent gold
labels currently exist**. Without independently authored labels the benchmark cannot
produce defensible accuracy claims.

This package provides:

1. **100 fully specified scenarios** across four categories
2. **Reviewer materials** a Nigerian/African fashion stylist can use without seeing engine output
3. **Gold-label schema** (machine-readable + human-readable)
4. **Scoring rubric** with explicit reviewer dimensions
5. **Image provenance register** with licensing requirements
6. **Benchmark execution protocol** (`results-template.md`) for running frozen v3.7 after labels are locked
7. **Coverage matrix** mapping capabilities to case IDs

---

## Directory structure

```
docs/recommendation/africa/benchmark-v1/
├── README.md                      ← this file
├── governance.md                  ← who can author gold labels and how
├── scenarios.md                   ← master 100-case index with coverage matrix (internal)
├── gold-label-schema.md           ← schema definition (machine + human readable)
├── fixtures.md                    ← neutral item catalog: descriptive facts only (reviewer-safe)
├── classification-cases.md        ← 40 garment-understanding cases  GU-01…GU-40 (neutral)
├── outfit-ranking-cases.md        ← 30 competitive outfit cases      OR-01…OR-30 (neutral)
├── occasion-cases.md              ← 20 occasion-distinction cases    OC-01…OC-20 (neutral)
├── weather-cases.md               ← 10 weather/context cases         WX-01…WX-10 (neutral)
├── reviewer-instructions.md       ← reviewer package instructions (no engine output)
├── scoring-rubric.md              ← explicit 0–5 rubric per dimension
├── results-template.md            ← blank template for Track C execution (internal)
├── benchmark-execution-protocol.md ← Track C runner/evaluation spec (internal)
├── image-provenance.md            ← source / licence / permission register
├── frozen-v1/                     ← immutable inputs, gold labels, images, manifest + hashes
└── internal/                      ← post-lock package — NEVER given to the reviewer
    ├── README.md                  ← reviewer-package boundary definition
    ├── runner-fixtures.md         ← typed runner catalog (occasion tags/formality/warmth)
    ├── gu-taxonomy-analysis.md    ← provisional Amodka mappings + suspected gaps
    ├── case-design-intent.md      ← expected engine behaviour per case
    ├── non-gold-drafts/           ← quarantined pre-governance drafts (never gold)
    └── future-v2-mens-fashion/    ← original men's cases, excluded from v1
```

**Integrity validator:** `node scripts/validate-benchmark-fixtures.mjs` deterministically
checks that the reviewer and runner catalogs agree on descriptive columns, that the
reviewer catalog carries no evaluative columns, that every case references only defined
fixture IDs, and that every outfit fingerprint is sorted and matches its component list.

**Reviewer package boundary:** the reviewer receives only the neutral files listed in
`internal/README.md`. The four case files and `fixtures.md` contain no engine rules,
predictions, mappings, or developer opinions. All case-design intent and expected engine
behaviour live in `internal/` and may be consulted only after gold labels are locked.

**v1 gender scope:** All 40 GU cases and all 60 OR/OC/WX scenarios are women's fashion
evidence. The former GU-33–GU-40 men's descriptions are quarantined under
`internal/future-v2-mens-fashion/` and are excluded from every v1 count and claim.

---

## Critical rules

- **Engine v3.7 is frozen.** No scoring weights, ranking logic, candidate generation,
  constraints, taxonomy, production configuration, or golden regression set may be modified.
- **Gold labels must be assigned by an independent Nigerian/African fashion reviewer BEFORE
  the engine is run.** Flow: scenario → candidates → independent stylist assigns labels →
  labels locked → engine runs → compare. Never the reverse.
- **Do not invent gold scores.** If no reviewer has signed labels for a case, that case
  must not be used to claim measured accuracy.
- **Benchmark data stages are kept separate:**  
  `benchmark-input/` · `gold-standard/` · `engine-output/` · `evaluation/`  
  The engine never receives gold ranking before its output is recorded.
- **No private reviewer information** is committed to this repository.

---

## Production-safety confirmation

| Check | Status |
|---|---|
| Recommendation Engine v3.7 unchanged | ✅ Confirmed |
| `__tests__/recommendation-golden-set.ts` unchanged | ✅ Confirmed |
| No production migrations | ✅ Confirmed |
| No production data modified | ✅ Confirmed |
| No production secrets changed | ✅ Confirmed |
| No FASH API integration added | ✅ Confirmed |
| No deployment | ✅ Confirmed |

---

## Case count

| Category | File | Cases |
|---|---|---|
| Garment classification | `classification-cases.md` | GU-01…GU-40 (40) |
| Competitive outfit ranking | `outfit-ranking-cases.md` | OR-01…OR-30 (30) |
| Occasion distinction | `occasion-cases.md` | OC-01…OC-20 (20) |
| Weather / context | `weather-cases.md` | WX-01…WX-10 (10) |
| **Total** | | **100** |

---

## Benchmark readiness status

| Stage | Status |
|---|---|
| Benchmark cases specified (100) | ✅ Complete |
| Governance document written | ✅ Complete |
| Reviewer instructions prepared | ✅ Complete |
| Gold-label schema defined | ✅ Complete |
| Scoring rubric defined | ✅ Complete |
| Results template (Track C) prepared | ✅ Complete |
| Image provenance register created | ✅ Complete — authoritative synthetic register frozen under `frozen-v1/images/` |
| Frozen synthetic image package | ✅ Complete — 40/40 images; licence terms not independently verified by repository audit |
| Signed single-reviewer gold-label package | ✅ Structurally valid — reviewer-provenance exception recorded in frozen manifest |
| Coverage matrix created | ✅ Complete (in `scenarios.md`) |
| Images sourced for GU cases | ✅ Complete — 40 purpose-created synthetic images |
| Independent reviewer reference | ⚠️ Supplied as `AFBM-EXPERT-01`; provenance exception requires Product Owner reconciliation |
| Gold labels signed and locked | ✅ Frozen unchanged from supplied files; single reviewer, IRR not performed |
| Engine v3.7 run against benchmark | ⏳ NOT RUN — Track C only |
| Track C evaluation report | ⏳ PENDING — requires engine run |

---

## Remaining human actions

1. **Resolve reviewer provenance exception** — reconcile the supplied label note
   (“Assistant-produced expert gold-label draft”) with `governance.md` and retain
   authorised qualification/independence evidence privately. Do not edit the frozen labels.
2. **Optionally recruit a second reviewer** for at least 20 cases (see `governance.md` §6).
3. **Approve Track C execution separately** — only after the provenance exception is resolved.
