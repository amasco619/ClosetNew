# Phase 5C.3 — Track B Final Validation Report

**Prepared:** 2026-09-10  
**Benchmark:** African/Nigerian Fashion Benchmark v1  
**Product:** Amodka v1  
**Engine under test:** Recommendation Engine v3.7 (frozen)  
**Track C executed:** **No**

## 1. Executive Summary

Track B's 100-case women-focused benchmark has been structurally validated and frozen.
The signed JSON, CSV summary, 40 synthetic garment images, provenance register, fixture
set, schema, and runner catalog are preserved in an immutable snapshot with SHA-256
checksums.

Deterministic validation passed with no label-integrity, candidate-reference,
image-mapping, provenance-row, checksum, or reviewer/runner separation errors. The
application test suite and TypeScript check also passed. Recommendation Engine v3.7 and
the existing golden regression set were not changed. Track C was not run.

At validation time, one blocking governance exception remained: the signed JSON's own `reviewer_note` calls
the package an “Assistant-produced expert gold-label draft,” while benchmark governance
requires an independent qualified reviewer. The final-validation instruction says to
treat the supplied labels as authoritative and not substantively alter them, so they
were frozen unchanged. The Product Owner must reconcile and attest the reviewer
provenance before authorising Track C. On 2026-09-10, the Product Owner resolved the
reviewer-provenance exception in a separate attestation and retained private evidence
externally. Track C approval was separately deferred, so Track C remains blocked and was
not run.

**Evidence classification:** “Expert-reviewed gold benchmark — single reviewer; IRR not performed.”

## 2. Benchmark Version

| Field | Frozen value |
|---|---|
| Benchmark version | `1.0.0-frozen` |
| Gold-label version | `1.0` |
| Image package version | `2026-08-27` |
| Provenance register version | `2026-08-27` |
| Freeze date | `2026-09-10` |
| Engine version under test | `3.7` |
| Machine-readable record | `frozen-v1/benchmark-manifest.json` |

## 3. Product Scope

- Amodka v1 is women-focused.
- Market scope is Nigeria/Africa, with explicit diaspora/UK transition cases.
- All 40 active GU cases are women-focused.
- The former men's GU-33–GU-40 material is excluded from v1 and quarantined for a
  possible v2 men's benchmark.
- The benchmark tests garment classification, outfit ranking, occasion distinction,
  and weather/context appropriateness.

## 4. Case Distribution

| Case family | IDs | Count |
|---|---|---:|
| Garment classification | GU-01…GU-40 | 40 |
| Outfit ranking | OR-01…OR-30 | 30 |
| Occasion distinction | OC-01…OC-20 | 20 |
| Weather/context | WX-01…WX-10 | 10 |
| **Total** | 100 unique IDs | **100** |

No missing, duplicate, extra, or out-of-order active case IDs were found.

## 5. Gold-Label Integrity

The signed JSON contains 40 garment labels and 60 outfit/context labels. The CSV contains
exactly 100 corresponding summary rows.

Validated properties:

- every required GU and outfit-label field is present;
- all GU labels specify `gender: women`;
- 232 candidate records have unique IDs within their cases;
- all 60 rankings are complete, duplicate-free permutations of their candidate sets;
- acceptable and not-acceptable lists partition each candidate set without overlap;
- every preferred candidate exists and is acceptable;
- all 338 pairwise judgments reference existing, distinct candidates and agree with the
  signed ranking direction;
- 232 reviewer-score vectors contain seven integer dimensions in the 0–5 range;
- all 232 utility values equal the sum of their reviewer-score vector;
- no case is marked disputed;
- every per-case reviewer sign-off matches the top-level sign-off;
- every JSON summary value agrees with the corresponding CSV row;
- no engine-score, engine-ranking, developer-prediction, expected-winner,
  case-design-intent, or internal-weight field appears in reviewer-owned gold data.

The supplied gold-label files were copied byte-for-byte and were not substantively edited.

## 6. Reviewer Independence

| Item | Result |
|---|---|
| Reviewer ID | `AFBM-EXPERT-01` |
| Date signed | `2026-08-29` |
| Reviewer count | 1 |
| IRR | Not performed |
| Engine/developer output leakage in reviewer-facing source | None found |
| Repository evidence of reviewer qualification | Intentionally absent/private |
| Independence status | **Resolved by separate Product Owner attestation dated 2026-09-10** |

The signed file states that no Amodka outputs, developer opinions, web images, or other
rankings were used. However, its `reviewer_note` also describes the work as
“Assistant-produced.” This conflicts with the repository governance rule that gold
labels come from an independent qualified Nigerian/African fashion reviewer. The audit
does not silently reinterpret or delete that statement.

The Product Owner attested that `AFBM-EXPERT-01` was a qualified independent human
Nigerian/African fashion reviewer who assigned the labels without seeing engine outputs,
scores, or developer opinions. Qualification and independence evidence is retained
privately outside the repository. See `REVIEWER-INDEPENDENCE-ATTESTATION.md`.

## 7. Image Provenance

- 40 PNG files are present: IMG-GU-01 through IMG-GU-40.
- All 40 files have valid PNG signatures.
- Dimensions: 38 images at 1408×768, one at 1200×896, and one at 1376×768.
- The package README identifies Arena.ai generation on 2026-08-27.
- The provenance register contains exactly 40 rows in case order.
- All rows say synthetic; all say no personally identifiable content.
- All rows record internal testing, repository commit, and reviewer-sharing permission
  as permitted/verified by the Product Owner.
- The contact sheet and replacement images GU-33–GU-40 were visually inspected. They
  show product-only garments/accessories with no people, faces, hands, obvious logos,
  brands, or visible text.
- GU-06, GU-08, GU-13, GU-19, GU-33, and GU-35 are recorded as regenerated to reduce
  ambiguity.

The older `image-provenance.md` `PENDING` table is retained as historical evidence and
marked superseded by the frozen synthetic register. The repository audit did **not**
independently verify Arena.ai's legal licence terms; it records the supplied Product
Owner verification and does not make a stronger claim.

## 8. Image-to-Case Mapping

Every mapping follows the deterministic rule `GU-NN` → `IMG-GU-NN`.

| Cases 01–10 | Cases 11–20 | Cases 21–30 | Cases 31–40 |
|---|---|---|---|
| GU-01 → IMG-GU-01 | GU-11 → IMG-GU-11 | GU-21 → IMG-GU-21 | GU-31 → IMG-GU-31 |
| GU-02 → IMG-GU-02 | GU-12 → IMG-GU-12 | GU-22 → IMG-GU-22 | GU-32 → IMG-GU-32 |
| GU-03 → IMG-GU-03 | GU-13 → IMG-GU-13 | GU-23 → IMG-GU-23 | GU-33 → IMG-GU-33 |
| GU-04 → IMG-GU-04 | GU-14 → IMG-GU-14 | GU-24 → IMG-GU-24 | GU-34 → IMG-GU-34 |
| GU-05 → IMG-GU-05 | GU-15 → IMG-GU-15 | GU-25 → IMG-GU-25 | GU-35 → IMG-GU-35 |
| GU-06 → IMG-GU-06 | GU-16 → IMG-GU-16 | GU-26 → IMG-GU-26 | GU-36 → IMG-GU-36 |
| GU-07 → IMG-GU-07 | GU-17 → IMG-GU-17 | GU-27 → IMG-GU-27 | GU-37 → IMG-GU-37 |
| GU-08 → IMG-GU-08 | GU-18 → IMG-GU-18 | GU-28 → IMG-GU-28 | GU-38 → IMG-GU-38 |
| GU-09 → IMG-GU-09 | GU-19 → IMG-GU-19 | GU-29 → IMG-GU-29 | GU-39 → IMG-GU-39 |
| GU-10 → IMG-GU-10 | GU-20 → IMG-GU-20 | GU-30 → IMG-GU-30 | GU-40 → IMG-GU-40 |

The image file set, gold JSON image references, and provenance register all agree.

## 9. Nigerian/African Coverage Matrix

Counts are non-exclusive. A case is counted only when its text genuinely tests the
category, not merely because an unrelated candidate happens to contain an item.

| Capability | Count | Case IDs |
|---|---:|---|
| Ankara / wax print | 46 | GU-01…11, GU-23, GU-28…30; OR-01…05, OR-07, OR-10, OR-12…20, OR-23…24, OR-26…30; OC-01…06, OC-08…09, OC-11…13, OC-15…16, OC-18…20; WX-01…02, WX-04, WX-06…07, WX-09…10 |
| Lace | 16 | GU-12…15, GU-19, GU-35; OR-01…03, OR-05, OR-23, OR-29; OC-01, OC-03, OC-05…06, OC-08…10; WX-10 |
| Aso-ebi | 6 | GU-14, OR-01…02, OR-04, OC-01, OC-04 |
| Aso-oke | 6 | GU-16…17, GU-22, GU-33…34, GU-40 |
| Adire | 2 | GU-31, GU-38 |
| Buba | 3 | GU-21…22, GU-33 |
| Iro/wrapper | 4 | GU-23…24, GU-34, GU-38 |
| Kaftan | 7 | GU-25…27, GU-36, OR-04…05, OR-10 |
| Boubou | 2 | GU-26, GU-37 |
| Gele | 3 | GU-11, GU-16, GU-40 |
| Kente/strip-cloth accessories | 2 | GU-32, GU-39 |
| Contemporary African fashion | 7 | GU-10, GU-28…30, OR-06…07, OR-30 |
| African-Western fusion | 7 | GU-10, GU-28…30, OR-06…07, OR-30 |

Two source-matrix errors were corrected during validation: lace is 16, not 17, because
OR-25 contains no lace; gele is 3, not 5, because GU-32 and GU-39 are Kente stoles.

## 10. Ankara/Wax-Print Coverage

| Test dimension | Present | Strongest cases |
|---|---|---|
| Ankara + neutral ground | Yes | OR-13, OR-15, OR-16, OR-18, OR-20 |
| Ankara + competing print | Yes | OR-14, OR-18, OR-19, OR-20 |
| Large/medium/small pattern scales | Yes | OR-13, OR-14, OR-15, OR-16 |
| Coordinated set identity | Yes | GU-08, GU-09, GU-24, GU-29, OR-17, OR-18, OR-28 |
| Non-matching separates | Yes | OR-18, OR-28 |
| Formal use | Yes | OR-01, OR-02, OR-23, OR-29, OR-30 |
| Casual use | Yes | OR-10, OR-22, OR-24, OR-26 |
| Weather conditions | Yes | WX-01…04, WX-06…10, OR-09, OR-26, OR-27 |

## 11. Cultural-Context Coverage

Strict occasion/context counts:

| Context | Count | Cases |
|---|---:|---|
| Traditional wedding | 3 | OR-01, OR-02, OC-01 |
| White/Western wedding | 1 | OC-02 |
| Reception | 2 | OR-03, OC-03 |
| Aso-ebi participation | 5 | OR-01, OR-02, OR-04, OC-01, OC-04 |
| Church | 4 | OR-04, OC-05, OC-06, OC-07 |
| Naming ceremony | 2 | OR-05, OC-08 |
| Cultural ceremony | 1 | OC-19 |
| Funeral/burial | 1 | OC-10 |
| Corporate/business | 7 | OR-06…09, OC-12…14 |
| Casual/social | 8 | OR-10…12, OC-11, OC-15…18 |
| High-end event | 1 | OR-29 |
| Strict diaspora/UK transition | 3 | OR-30, OC-20, WX-09 |
| Broad diaspora tag | 4 | OR-30, OC-04, OC-20, WX-09 |

The package distinguishes traditional Nigerian events, Western formal settings, regular
church contexts, business settings, casual/social use, and diaspora/UK adaptation. These
categories overlap by design and are not intended to partition the 100 cases.

## 12. Weather/Climate Coverage

| Environment | Count | Cases |
|---|---:|---|
| Hot/humid | 3 | WX-01, WX-03, WX-05 |
| Extreme heat | 2 | WX-05, OR-26 |
| Rain | 6 | OR-09, OR-27, WX-02, WX-04, WX-09, WX-10 |
| Rainy season | 2 | WX-02, WX-04 |
| Harmattan | 2 | WX-03, WX-07 |
| Evening | 6 | OR-03, OR-23, OC-03, OC-09, OC-18, WX-06 |
| Air-conditioned indoor | 9 | OR-03, OR-06, OR-12, OC-02, OC-03, OC-05, OC-09, OC-18, WX-08 |
| Strict UK/diaspora climate transition | 3 | OR-30, OC-20, WX-09 |

## 13. Reviewer/Runner Separation Audit

Passed controls:

- reviewer-facing `fixtures.md` contains only descriptive fields;
- occasion tags, formality, and warmth remain in `internal/runner-fixtures.md`;
- shared descriptive fixture columns match row-for-row across both catalogs;
- no reviewer-facing case source contains the audited steering terms;
- `internal/case-design-intent.md`, `internal/gu-taxonomy-analysis.md`, developer mappings,
  old drafts, engine outputs, and evaluation logic are outside the reviewer package;
- gold labels, runner inputs, future engine outputs, and evaluation results use separate
  files/stages;
- the validator rejects engine/developer-owned keys in the frozen gold JSON.

## 14. Quarantined Historical Material

- Former men's GU-33–GU-40 descriptions are retained only in
  `internal/future-v2-mens-fashion/`.
- Pre-governance draft rankings remain under `internal/non-gold-drafts/`.
- Both locations contain explicit boundary documentation.
- Neither location appears in the v1 active ID set, gold labels, image mapping, metrics,
  manifest inputs, or Track C inputs.

## 15. Benchmark Validator

Command:

```bash
node scripts/validate-benchmark-fixtures.mjs
```

Result: **PASS**.

The validator checks 84 shared fixture records, all active case references and
fingerprints, women-only GU scope, 100 signed labels, 232 candidates, ranking and
pairwise consistency, score/utility arithmetic, CSV/JSON agreement, 40 image files,
40 provenance rows, reviewer/runner separation, quarantine boundaries, manifest fields,
and 53 immutable snapshot checksums.

## 16. Benchmark Freeze / Hash

Snapshot: `docs/recommendation/africa/benchmark-v1/frozen-v1/`

| Artifact | SHA-256 |
|---|---|
| `SHA256SUMS` (root checksum list) | `eaf2db4bb36b77268943618e1099bddb29a81d629e24163c10c990f3ef4f6cf1` |
| Source `generated-images` ZIP | `00c28612614d8afdeaee5b72f9fdd92d41b7876834a0faaa8f763bd95614334b` |
| Frozen gold JSON | `f91127901cb717afdfffdc5cff8721fe08252e8dc710904faf0879aa1ba07373` |
| Frozen gold CSV | `4b95d00833496d04e98142aeabd1d04e15dc40f3a14a787bbfba9dcef333e855` |
| Frozen provenance CSV | `0915a3ebc43d3785ad17a42a48dad27b0110e59e7a43f911abda0cbacb6bd430` |
| Frozen contact sheet | `03fd087b9c3712020aaabc7ad31a3154d6aa007346e70a2aa9d05048081334d9` |

`sha256sum -c frozen-v1/SHA256SUMS` verifies all 53 hashed snapshot inputs.

## 17. Track C Runner Readiness

Track C configuration inputs are present:

- frozen active cases and fixtures;
- internal typed runner catalog;
- signed locked gold data in a separate gold-standard directory;
- execution protocol and results template;
- deterministic validator and checksums;
- explicit engine version `3.7`;
- explicit `track_c_executed: false` manifest guard.

The runner must record engine outputs before loading gold labels for evaluation and must
never write back to the frozen snapshot. The reviewer-provenance exception is resolved,
but **operational readiness remains blocked because the Product Owner separately deferred
Track C approval.** Track C was not executed during this work.

## 18. Tests

| Check | Result |
|---|---|
| Dedicated benchmark validator | PASS |
| Frozen checksum verification | 53/53 PASS |
| `npm test` | 9 test files passed, 0 failed; reported summary 51 passed, 0 failed |
| `npm run typecheck` | PASS, 0 TypeScript errors |
| `npm run lint` | PASS, 0 errors; 31 existing warnings |
| `git diff --check` | PASS |

The lint warnings are in existing application files and are unrelated to this
documentation/validation freeze.

## 19. Production-Safety Confirmation

- No production application behavior was changed.
- No database, migration, schema, secret, environment, workflow, deployment, payment,
  authentication, or external-service operation was performed.
- Recommendation scoring, ranking, candidate generation, constraints, taxonomy,
  weather behavior, versioning, and the golden regression set were not modified.
- Confirmed unchanged:
  - `constants/outfitScoring.ts`
  - `constants/outfitRotation.ts`
  - `constants/outfitGenerator.ts`
  - `constants/weatherPure.ts`
  - `constants/types.ts`
  - `__tests__/recommendation-golden-set.ts`
- Track C was not executed.

## 20. Issues / Exceptions

1. **Resolved — reviewer provenance:** the frozen signed JSON describes the gold package
   as “Assistant-produced,” but the Product Owner separately attested that
   `AFBM-EXPERT-01` was a qualified independent human reviewer and retained private
   evidence externally. The frozen labels remain unchanged.
2. **Qualified claim — external platform licence:** the supplied provenance records
   Product Owner authorization. This audit did not independently verify Arena.ai's
   current legal licence terms.
3. **Non-blocking documentation corrections:** lace coverage was corrected from 17 to
   16; gele coverage was corrected from 5 to 3, with Kente stoles reported separately.
4. **IRR limitation:** only one reviewer is represented; inter-rater reliability was not
   performed.

## 21. Recommended Next Action

Before Track C, the Product Owner must give explicit approval as a separate operation.
Approval was deferred on 2026-09-10. Once approved, run the frozen v3.7 engine against
the frozen inputs, recording engine outputs before the evaluator loads gold labels.

**TRACK B VALIDATED AND FROZEN — REVIEWER EXCEPTION RESOLVED; TRACK C APPROVAL DEFERRED**

Track C was not executed.