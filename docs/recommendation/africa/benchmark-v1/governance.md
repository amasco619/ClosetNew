# Benchmark Governance — African/Nigerian Fashion Gold-Standard v1

**Phase:** 5C.3 Track B  
**Status:** ACTIVE  
**Version:** 1.0  
**Date:** 2026-08-19  

---

## 1. Purpose

This document defines who may author gold labels, the independence requirements that
protect benchmark validity, and the process for locking and preserving those labels.

A gold label is the authoritative answer to:

> *"What would a competent Nigerian/African fashion stylist consider the correct or
> strongest recommendation in this scenario?"*

Without this governance, there is no clear authority for what counts as a correct answer,
and the benchmark cannot produce defensible accuracy claims.

---

## 2. Gold-standard authority

### 2.1 Who MAY assign gold labels

Gold labels must be assigned by an **independent Nigerian/African fashion reviewer** who:

- Has demonstrable familiarity with Nigerian and West African fashion — including
  traditional garments (Ankara/wax-print, lace, aso-ebi, aso-oke, agbada, senator/native
  wear, kaftan, boubou, buba, iro/wrapper, gele), contemporary African fashion, and
  African-Western fusion styling.
- Does **not** require access to Amodka's source code, engine output, or internal scoring.
- Is recruited and engaged by the Product Owner, not the development team.

Reviewer identity and qualification evidence must be stored in a **private, external
document** and must not be committed to this repository.

### 2.2 Who may NOT assign gold labels

| Person / role | Reason |
|---|---|
| Coding agent (AI) | Cannot possess independent Nigerian fashion expertise; contaminates the benchmark |
| Amodka Recommendation Engine v3.7 | Its output is exactly what is being evaluated |
| Amodka development team members | Conflict of interest; familiarity with engine biases labels |
| Anyone who has already seen engine outputs for these cases | Independence contaminated |

### 2.3 Minimum reviewer qualification

The Product Owner should verify at minimum that the reviewer can:

- Explain the practical difference between aso-ebi, aso-oke, and Ankara
- Name at least three distinct formality tiers in Nigerian dress culture
- Articulate why an agbada or senator would or would not suit a given occasion
- Distinguish a naming-ceremony outfit from a traditional-wedding outfit

---

## 3. Independence requirement

The benchmark process must follow this exact sequence — never the reverse:

```
Step 1 ── Scenario prepared (cases in this package)
       ↓
Step 2 ── Candidate garments / outfits prepared (fixtures in classification-cases.md,
          outfit-ranking-cases.md, occasion-cases.md, weather-cases.md)
       ↓
Step 3 ── Reviewer receives scenario + candidates ONLY
          Reviewer does NOT see: engine output, engine scores, developer opinions
       ↓
Step 4 ── Reviewer assigns:
            • acceptable / not acceptable for each candidate
            • ranking of acceptable candidates
            • preferred / gold outfit
            • rationale (reviewer's own words)
       ↓
Step 5 ── Gold labels locked and signed (date + reviewer identifier stored externally)
       ↓
Step 6 ── Locked labels stored in gold-standard/ (separate from benchmark-input/)
       ↓
Step 7 ── Engine v3.7 runs against benchmark-input/ only
       ↓
Step 8 ── Engine output stored in engine-output/ (separate from gold-standard/)
       ↓
Step 9 ── Evaluation compares engine-output/ against gold-standard/
```

**Prohibited flow:**

```
PROHIBITED: Engine output → stylist adjusts answer to match engine
```

This prohibition covers soft contamination too: showing the reviewer engine scores,
developer commentary, or prior benchmark results before they assign labels.

---

## 4. Data-stage separation

| Stage | Contents | Who writes | Who reads |
|---|---|---|---|
| `benchmark-input/` | Scenario fixtures, candidate garments, weather, profile | Benchmark author | Reviewer; engine |
| `gold-standard/` | Reviewer labels, rankings, rationale | Independent reviewer only | Evaluation only |
| `engine-output/` | Engine results per case | Engine runner | Evaluation only |
| `evaluation/` | Comparison, metrics, findings | Evaluation author | Report |

**The engine must never read `gold-standard/` before its output is recorded.**  
**The reviewer must never read `engine-output/` before signing labels.**

---

## 5. Label locking and immutability

Once a reviewer has signed a label set:

- The label file must not be modified without a new explicit sign-off.
- Any correction requires a new version (e.g. `gold-labels-v1.1.json`) with a documented
  reason and a new sign-off date.
- Corrections must not be made retroactively to justify engine results.
- Disputed cases must be flagged (see §7), not silently corrected.

---

## 6. Inter-rater reliability

Where practical, a **second independent reviewer** should independently cover at least
**20% of cases (≥ 20 cases)** sampled across all four scenario categories.

- The second reviewer completes labels without seeing the first reviewer's answers.
- Agreement is measured after both sets are locked.
- Cases with material disagreement on top-1 ranking must be **flagged** in the evaluation
  report rather than resolved by majority vote.
- Fashion has legitimate stylistic disagreement — acknowledging it is more defensible
  than asserting a single objective answer.

---

## 7. Disputed cases

Flag a case as disputed when:

- Two independent reviewers assign materially different top-1 rankings
- The reviewer notes genuine uncertainty in their rationale
- Cultural context is highly region-specific, era-specific, or diaspora-specific

Disputed cases should be excluded from aggregate accuracy calculations or reported
separately with explicit uncertainty labelling.

---

## 8. Privacy

- No real user wardrobe photographs may be used without explicit consent for benchmark use.
- No reviewer personal information may be committed to this repository.
- Images must comply with `image-provenance.md`.
- Gold labels must not be uploaded to third-party AI services for processing.
- The gold-label process must remain independent of any AI system.

---

## 9. Governance change log

| Version | Date | Change | Approved by |
|---|---|---|---|
| 1.0 | 2026-08-19 | Initial governance document | Product Owner — sign-off pending |
