---
name: Gemini extended clothing fields
description: The 5 extra fields Gemini now returns for clothing classification beyond the base schema.
---

## Rule
Gemini's classify-garment endpoint returns 5 new optional fields:
- `fit`: "slim" | "regular" | "loose" | "oversized" | "tailored" — for tops/bottoms/dresses/outerwear
- `neckline`: "crew" | "v-neck" | "scoop" | "turtleneck" | "boat" | "square" | "halter" | "off-shoulder" | "collared" — tops/dresses only
- `sleeveLength`: "sleeveless" | "short" | "three-quarter" | "long" — tops/dresses only
- `rise`: "low" | "mid" | "high" — bottoms only
- `warmthBand`: "cold" | "cool" | "mild" | "warm" | "hot" — outerwear only

## Integration in add-item.tsx
1. Gemini values are applied first (if truthy, set state directly)
2. Sub-type inference (SUBTYPE_NECKLINE / SUBTYPE_RISE / SUBTYPE_WARMTH) only fires when Gemini did NOT return that field (`!classified.neckline` guard)
3. `fit` and `sleeveLength` have no inference fallback — Gemini is the sole source

**Why:** Reduces user friction — fewer fields to fill in manually. Gemini's visual context is more reliable than subtype lookup tables for these fine-grained attributes.

**How to apply:** Any new detail field added to classify-garment.ts must also be (a) added to the GEMINI_PROMPT, (b) validated against a VALID_* Set, (c) included in the res.json return, and (d) added to the classifyWithServer return type in add-item.tsx.
