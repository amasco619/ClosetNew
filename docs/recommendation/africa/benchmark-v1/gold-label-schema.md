# Gold-Label Schema — African/Nigerian Fashion Benchmark v1

**Phase:** 5C.3 Track B  
**Version:** 1.0  
**Date:** 2026-08-19  

This schema defines the structure of a gold label. Gold labels contain **only
reviewer-owned fields**. Developer-authored analysis (how Amodka's current taxonomy
would map each garment, and where it cannot) lives in a **separate internal artifact**
keyed by `case_id` (`internal/gu-taxonomy-analysis.md`) that is never merged into,
appended to, or used to modify a signed label file. This keeps signed labels immutable
and schema-valid exactly as the reviewer submitted them.

---

## 1. Schema principles

1. **Never force the reviewer to use an Amodka taxonomy value** where that taxonomy
   cannot accurately represent the garment. The gold label records what the garment
   actually is, in the reviewer's own professional vocabulary.
2. **Cultural identity is independent of garment type.** Ankara is a fabric/print;
   it is not a garment type. "African" is not an occasion.
3. **Missing representation is itself a finding.** If a dimension cannot be represented
   by Amodka, the reviewer still records what the garment actually is; the gap is
   identified later by comparing the locked label against the internal mapping artifact.
4. **Labels are evaluation-only.** They must never be passed to the engine before
   its output is recorded.

---

## 2. Independent cultural dimensions

The following dimensions must be captured independently, not collapsed into each other:

| Dimension | Description |
|---|---|
| `garment_type` | What the garment actually is (buba, gele, kaftan, iro/wrapper, adire, etc.) |
| `fabric` | Primary fabric (aso-oke, lace, wax-print cotton, brocade, etc.) |
| `pattern` | Pattern type (wax-print, geometric, embroidered, solid, etc.) |
| `pattern_scale` | Visual weight of the pattern (small / medium / large / dominant) |
| `construction` | Construction method if relevant (handwoven, machine-sewn, beaded, etc.) |
| `cultural_context` | The cultural frame this garment belongs to (Yoruba traditional, Pan-African, Igbo ceremony, etc.) |
| `occasion` | Primary occasion suitability (traditional wedding, naming ceremony, Sunday church, etc.) |
| `formality` | 1 (casual) → 6 (high ceremony) — reviewer's own scale |
| `visual_weight` | How visually dominant the garment is (low / medium / high / dominant) |
| `coordination_identity` | Whether this garment is part of a coordinated set (standalone / part-of-set / full-set) |
| `gender` | Intended gender (women / men / unisex) |
| `weather_suitability` | Climate contexts where this garment is appropriate |

---

## 3. Garment-classification case schema (GU cases)

### 3.1 JSON schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["case_id", "case_type", "image_ref", "gold_label"],
  "properties": {
    "case_id":   { "type": "string", "pattern": "^GU-[0-9]{2}$" },
    "case_type": { "type": "string", "const": "garment_classification" },
    "image_ref": {
      "type": "object",
      "required": ["image_id", "provenance_record"],
      "properties": {
        "image_id":          { "type": "string" },
        "description":       { "type": "string" },
        "provenance_record": { "type": "string", "description": "ID in image-provenance.md" }
      }
    },
    "gold_label": {
      "type": "object",
      "required": ["garment_type", "fabric", "pattern", "pattern_scale", "colour",
                   "formality", "occasions", "cultural_context", "visual_weight",
                   "gender", "reviewer_confidence", "reviewer_rationale"],
      "properties": {
        "garment_type":        { "type": "string" },
        "fabric":              { "type": "string" },
        "pattern":             { "type": "string" },
        "pattern_scale":       { "enum": ["small", "medium", "large", "dominant"] },
        "colour":              { "type": "string" },
        "fit":                 { "type": "string" },
        "occasions":           { "type": "array", "items": { "type": "string" } },
        "formality":           { "type": "integer", "minimum": 1, "maximum": 6 },
        "cultural_context":    { "type": "string" },
        "visual_weight":       { "enum": ["low", "medium", "high", "dominant"] },
        "coordination_identity": { "enum": ["standalone", "part-of-set", "full-set"] },
        "construction":        { "type": "string" },
        "gender":              { "enum": ["women", "men", "unisex"] },
        "weather_suitability": { "type": "array", "items": { "type": "string" } },
        "culturally_relevant_attributes": {
          "type": "array",
          "items": { "type": "string" },
          "description": "e.g. ['aso-ebi-appropriate', 'head-tie-expected', 'ceremony-specific']"
        },
        "reviewer_confidence": { "enum": ["high", "medium", "low"] },
        "reviewer_rationale":  { "type": "string" }
      }
    },
    "reviewer_sign_off": {
      "type": "object",
      "properties": {
        "reviewer_id":  { "type": "string", "description": "Anonymous identifier only — no name in repo" },
        "date_signed":  { "type": "string", "format": "date" },
        "irr_covered":  { "type": "boolean", "description": "Was this case covered by a second reviewer?" }
      }
    }
  }
}
```

### 3.2 Human-readable label form (for reviewer use)

```
CASE ID: GU-__
IMAGE:   [image description / reference — see reviewer-instructions.md for image access]

GOLD CLASSIFICATION
─────────────────────────────────────────────
Garment type (what it actually is):
  _______________________________________________

Fabric:
  _______________________________________________

Pattern:
  _______________________________________________

Pattern scale:  [ ] small  [ ] medium  [ ] large  [ ] dominant

Colour / colour family:
  _______________________________________________

Fit / silhouette:
  _______________________________________________

Occasions this garment suits:
  _______________________________________________

Formality  (1=very casual  …  6=high ceremony):   [ ] 1  [ ] 2  [ ] 3  [ ] 4  [ ] 5  [ ] 6

Cultural context / community this garment belongs to:
  _______________________________________________

Visual weight:  [ ] low  [ ] medium  [ ] high  [ ] dominant

Part of a co-ordinated set?  [ ] standalone  [ ] part-of-set  [ ] full-set

Construction notes (handwoven, machine, beaded, etc.):
  _______________________________________________

Gender:  [ ] women  [ ] men  [ ] unisex

Weather / climate where this garment is appropriate:
  _______________________________________________

Culturally relevant attributes (e.g. aso-ebi-appropriate, ceremony-specific):
  _______________________________________________

Your confidence in this classification:  [ ] high  [ ] medium  [ ] low

Your rationale (please write in your own words):
  _______________________________________________
  _______________________________________________

DATE SIGNED: _______________   REVIEWER ID: _______________
```

---

## 4. Outfit-ranking case schema (OR / OC / WX cases)

### 4.1 JSON schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["case_id", "case_type", "scenario", "candidates", "gold_label"],
  "properties": {
    "case_id":   { "type": "string", "pattern": "^(OR|OC|WX)-[0-9]{2}$" },
    "case_type": { "enum": ["outfit_ranking", "occasion_distinction", "weather_context"] },
    "scenario": {
      "type": "object",
      "required": ["occasion", "context_description", "profile_summary"],
      "properties": {
        "occasion":             { "type": "string" },
        "context_description":  { "type": "string" },
        "location":             { "type": "string" },
        "weather":              {
          "type": "object",
          "properties": {
            "tempC_high":         { "type": "number" },
            "tempC_low":          { "type": "number" },
            "precipitation_pct":  { "type": "number" },
            "description":        { "type": "string" }
          }
        },
        "profile_summary":      { "type": "string" },
        "cultural_occasion_term": { "type": "string", "description": "Nigerian/African term for this occasion" }
      }
    },
    "candidates": {
      "type": "array",
      "minItems": 2,
      "items": {
        "type": "object",
        "required": ["candidate_id", "label", "components"],
        "properties": {
          "candidate_id": { "type": "string" },
          "label":        { "type": "string" },
          "components": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["item_id", "category", "description"],
              "properties": {
                "item_id":      { "type": "string" },
                "category":     { "type": "string" },
                "sub_type":     { "type": "string" },
                "description":  { "type": "string" },
                "pattern":      { "type": "string" },
                "pattern_scale":{ "type": "string" },
                "fabric":       { "type": "string" },
                "colour":       { "type": "string" },
                "formality":    { "type": "integer" },
                "occasion_tags":{ "type": "array", "items": { "type": "string" } },
                "warmth_band":  { "type": "string" }
              }
            }
          },
          "outfit_fingerprint": {
            "type": "string",
            "description": "Sorted comma-separated item_ids — stable outfit identity"
          }
        }
      }
    },
    "gold_label": {
      "type": "object",
      "required": ["ranking", "preferred_candidate_id", "rationale"],
      "properties": {
        "ranking": {
          "type": "array",
          "description": "Ordered candidate_ids from best to worst",
          "items": { "type": "string" }
        },
        "acceptable_candidates": {
          "type": "array",
          "items": { "type": "string" }
        },
        "not_acceptable_candidates": {
          "type": "array",
          "items": { "type": "string" }
        },
        "preferred_candidate_id": { "type": "string" },
        "pairwise": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "better":   { "type": "string" },
              "worse":    { "type": "string" },
              "rationale":{ "type": "string" }
            }
          }
        },
        "reviewer_scores": {
          "type": "object",
          "description": "Per-candidate scores across the 7 rubric dimensions (0–5 each)",
          "additionalProperties": {
            "type": "object",
            "properties": {
              "context_suitability":    { "type": "integer", "minimum": 0, "maximum": 5 },
              "cultural_appropriateness": { "type": "integer", "minimum": 0, "maximum": 5 },
              "visual_harmony":         { "type": "integer", "minimum": 0, "maximum": 5 },
              "proportion_silhouette":  { "type": "integer", "minimum": 0, "maximum": 5 },
              "pattern_visual_weight":  { "type": "integer", "minimum": 0, "maximum": 5 },
              "weather_suitability":    { "type": "integer", "minimum": 0, "maximum": 5 },
              "overall_styling_quality":{ "type": "integer", "minimum": 0, "maximum": 5 }
            }
          }
        },
        "utility": {
          "type": "object",
          "description": "Aggregate reviewer quality score per candidate (sum of rubric dimensions, 0–35). Used only for regret calculation — never passed to engine.",
          "additionalProperties": { "type": "number" }
        },
        "rationale":  { "type": "string" },
        "disputed":   { "type": "boolean", "default": false },
        "dispute_note": { "type": "string" }
      }
    },
    "reviewer_sign_off": {
      "type": "object",
      "properties": {
        "reviewer_id":      { "type": "string" },
        "date_signed":      { "type": "string", "format": "date" },
        "irr_covered":      { "type": "boolean" },
        "irr_reviewer_id":  { "type": "string" },
        "irr_agreement":    { "enum": ["full", "partial", "disputed"] }
      }
    }
  }
}
```

### 4.2 Human-readable ranking form (for reviewer use)

```
CASE ID: ___   OCCASION: _______________   CONTEXT: _______________

CANDIDATES
──────────────────────────────────────────────────────────
For each candidate below, please mark acceptable and score each dimension 0–5.

  CANDIDATE A: [label]
    Components: [listed in reviewer-instructions.md]
    Acceptable?  [ ] Yes  [ ] No
    Context suitability       0─1─2─3─4─5
    Cultural appropriateness  0─1─2─3─4─5
    Visual harmony            0─1─2─3─4─5
    Proportion / silhouette   0─1─2─3─4─5
    Pattern / visual weight   0─1─2─3─4─5
    Weather suitability       0─1─2─3─4─5
    Overall styling quality   0─1─2─3─4─5

  [repeat for B, C, D …]

RANKING (best → worst):  ___ > ___ > ___ > ___

PREFERRED / GOLD outfit:  ___

RATIONALE (your professional judgement, in your own words):
  _______________________________________________
  _______________________________________________

Any candidates you would NOT wear to this occasion?  ___ because _______________

DATE SIGNED: _______________   REVIEWER ID: _______________
```

---

## 5. Benchmark metrics computed from gold labels

These metrics are computed by the Track C evaluation runner — **not** by reviewers, and **not** before gold labels are locked.

| Metric | Definition |
|---|---|
| **Top-1 accuracy** | Fraction of cases where engine's first-ranked outfit matches `preferred_candidate_id` |
| **Top-3 accuracy** | Fraction of cases where `preferred_candidate_id` appears in engine's top 3 |
| **Pairwise accuracy** | Fraction of `pairwise` pairs where engine ordering agrees with gold ordering |
| **Mean regret** | Mean of `max(0, utility[gold_top1] − utility[engine_top1])` across all cases |
| **Max regret** | Worst single-case regret |
| **Category-level metrics** | Above metrics broken down by GU / OR / OC / WX and by capability tag |
| **Hard-constraint violations** | Cases where engine surfaced a garment that violates a declared constraint |
| **Fallback-activation rate** | Fraction of cases where engine used relaxed candidate generation |
| **Kendall's τ** | Rank correlation between gold ranking and engine ranking per case (where ≥ 3 candidates) |
| **Representation-gap rate** | Fraction of GU cases where the internal mapping artifact records a gap between the locked gold label and Amodka's taxonomy |
