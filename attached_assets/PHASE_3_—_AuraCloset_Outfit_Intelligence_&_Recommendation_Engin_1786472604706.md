# PHASE 3 — AuraCloset Outfit Intelligence & Recommendation Engine Forensic Audit

Act as an **elite fashion recommendation-system architect, professional personal stylist, behavioural personalisation expert, algorithm engineer, and luxury fashion product strategist**.

You have already completed the legacy GCV cleanup and Gemini/classification improvements.

Those phases are now considered closed.

Your task is now to conduct **Phase 3: a rigorous, read-only forensic audit of AuraCloset's actual outfit recommendation engine.**

## CRITICAL CONSTRAINT

**DO NOT MODIFY ANY CODE.**

Do not refactor, optimise, rewrite, tune weights, change scoring formulas, alter thresholds, add Gemini calls, change schemas, or otherwise modify the recommendation system.

This phase is strictly:

**INSPECT → UNDERSTAND → TEST → CHALLENGE → REPORT**

The purpose is to determine whether the existing recommendation engine is merely technically sophisticated or whether it actually produces **excellent fashion decisions**.

---

# 1. Establish the Actual Recommendation Architecture

Start by thoroughly inspecting the code responsible for outfit generation, scoring, filtering, ranking, rotation, personalisation, and rationale generation.

At minimum, inspect:

- `constants/outfitRotation.ts`
- `constants/outfitScoring.ts`

Then trace every relevant dependency they use.

Do not limit the investigation to those two files if important logic exists elsewhere.

Map the complete flow:

**Wardrobe → profile → context → candidate generation → filtering → outfit construction → scoring → affinity/reactions → wear history → ranking → rotation → displayed outfit**

Document the actual implementation.

Do not infer functionality that does not exist.

---

# 2. Identify Every Decision Variable

Create a complete inventory of every factor currently capable of influencing an outfit recommendation.

For each factor, identify:

| Factor | Used? | Where? | Hard constraint or score? | Relative influence | Notes |
|---|---|---|---|---|---|

Investigate factors including, but not limited to:

- style goals
- body type
- height/proportions
- occasion
- mood
- weather
- temperature
- season
- garment category
- garment subtype
- colour family
- perceptual colour
- undertone
- pattern
- pattern scale
- fabric
- texture
- fit
- silhouette
- neckline
- sleeve length
- rise
- warmth
- formality
- footwear
- outerwear
- bags
- jewellery
- layering
- colour harmony
- proportion
- completeness
- item affinity
- pair affinity
- reactions
- wear history
- freshness
- premium/free tier
- scenario affinity
- hero-item selection

Also identify important factors that **exist in the data model but are not actually used** by recommendation logic.

---

# 3. Reconstruct the Scoring Model

This is one of the most important parts of this audit.

Do not merely describe the scoring system.

Reconstruct how an outfit's final score is actually produced.

For every scoring component determine:

- its formula
- its inputs
- its weight
- whether it is additive or multiplicative
- whether it can dominate other factors
- whether it can be neutralised by another factor
- whether it is a hard gate
- whether it is applied before or after other adjustments
- whether it is applied per garment, per pair, or to the complete outfit

Create a conceptual representation of:

**Final Outfit Score = ...**

Use the actual implementation rather than inventing a simplified formula.

---

# 4. Identify the Most Influential Factors

Determine which factors have the greatest practical influence on the final ranking.

This is critical.

A recommendation engine can contain 20+ styling signals while only 3 or 4 actually dominate the outcome.

Identify:

### Top 10 strongest positive influences

and

### Top 10 strongest negative influences / penalties

Explain why.

Also identify:

### Hidden dominance

Look for situations where:

- one multiplier overwhelms multiple styling signals;
- a hard gate eliminates an otherwise excellent outfit;
- a small score difference creates a disproportionately large ranking change;
- a freshness/reaction multiplier overwhelms actual outfit quality;
- a colour score dominates silhouette/formality;
- scenario affinity dominates aesthetic coherence;
- premium-specific logic changes recommendation quality rather than simply quantity.

---

# 5. Conduct an Expert Stylist Audit

Now evaluate the engine as though you were a highly experienced personal stylist.

Do NOT judge whether the algorithm is elegant.

Judge whether its decisions make sense aesthetically.

Specifically evaluate:

### Colour

Can the engine distinguish between:

- harmonious combinations
- merely technically compatible colours
- sophisticated colour combinations
- boring combinations
- overly matchy combinations
- visually conflicting combinations?

Does it understand:

- tonal dressing
- complementary colours
- analogous colours
- neutrals
- accent colours
- warm/cool relationships
- saturation
- contrast
- visual weight?

### Proportion

Can it distinguish:

- balanced proportions
- intentionally oversized silhouettes
- accidental volume overload
- cropped + high-rise combinations
- long + long combinations
- wide + wide combinations
- fitted + oversized combinations?

### Pattern

Does it understand:

- pattern scale
- pattern density
- pattern mixing
- focal-point hierarchy
- when a pattern should dominate
- when multiple patterns compete?

### Formality

Does it understand the difference between:

- technically matching formality
- genuinely appropriate dress code
- polished
- overdressed
- underdressed
- sophisticated smart-casual
- corporate formal
- date-night appropriate
- occasion-specific nuance?

### Texture & fabric

Can it recognise whether combinations create:

- texture harmony
- useful contrast
- excessive texture
- incoherent fabric combinations?

Be honest about what the current metadata allows the system to know.

---

# 6. Adversarial Recommendation Testing

Construct difficult hypothetical wardrobes and contexts specifically designed to expose weaknesses in the algorithm.

Do NOT change the code.

Create at least **15 adversarial scenarios**.

Each scenario should contain:

- user profile
- wardrobe
- weather
- occasion
- mood/style goal
- expected stylistically strong outfit(s)
- likely algorithmic result
- whether the algorithm would probably make the right decision
- why

Include scenarios such as:

### Scenario A — Colour trap

Several technically compatible colour combinations exist, but only one looks sophisticated.

### Scenario B — Matching-set trap

Navy blazer + navy trousers versus mixing the blazer with another trouser.

Determine whether the engine recognises when matching pieces should be treated as a coherent set.

### Scenario C — Proportion trap

Oversized top + oversized bottom versus oversized top + tailored bottom.

### Scenario D — Pattern trap

A patterned hero garment with several technically compatible but visually competing garments.

### Scenario E — Formality trap

Multiple outfits fall within the same formal range, but only one is genuinely appropriate.

### Scenario F — Weather versus style

A highly attractive outfit conflicts with weather practicality.

Determine whether the engine appropriately balances both.

### Scenario G — Body-proportion trap

Two outfits satisfy colour/formality rules, but one produces substantially better proportions for the user's body profile.

### Scenario H — Accessory overload

Multiple accessories are individually compatible but collectively excessive.

### Scenario I — Neutral monotony

An outfit is perfectly harmonious but visually dull.

Determine whether the engine can distinguish harmony from lack of interest.

### Scenario J — Excessive coordination

Everything matches too closely.

Determine whether the engine can recognise that an outfit needs contrast.

### Scenario K — Duplicate wardrobe items

The user owns several nearly identical garments.

Determine whether the engine unnecessarily favours duplicates.

### Scenario L — Wear-history trap

A recently worn excellent outfit versus a slightly weaker but fresh combination.

Determine whether freshness is appropriately weighted.

### Scenario M — Reaction-feedback trap

A user historically liked certain items but those items create a poor combination in the current context.

Determine whether affinity can override objective outfit quality.

### Scenario N — Occasion ambiguity

Several outfits fall within the same formal band, but one better matches the implied social context.

### Scenario O — Scarcity

The wardrobe does not contain the ideal item.

Determine whether the engine gracefully produces the best available outfit rather than forcing an awkward combination.

---

# 7. Look for "Mathematically Good, Stylistically Bad"

This is one of the most important questions in this entire audit.

Identify combinations where:

**The algorithm would score the outfit highly, but an expert stylist would reject it.**

For each example explain:

1. Why the algorithm likes it.
2. Why a stylist would dislike it.
3. Which missing concept causes the discrepancy.
4. Whether the problem is:
   - data limitation
   - scoring limitation
   - weighting problem
   - candidate-generation problem
   - missing relationship
   - hard constraint
   - missing contextual reasoning

---

# 8. Look for "Stylistically Excellent, Algorithmically Penalised"

Perform the reverse analysis.

Find examples where:

**A genuinely excellent outfit could receive a surprisingly poor score.**

Identify why.

This is particularly important because excessive hard gates can eliminate creative but valid styling combinations before the scoring system gets to evaluate them.

---

# 9. Candidate Generation Audit

Do not focus only on scoring.

Determine whether the correct outfit can even reach the scoring stage.

Inspect:

- hero candidate selection
- candidate limits
- filtering
- scenario filtering
- season filtering
- formality filtering
- mood filtering
- wardrobe scarcity
- category requirements

Ask:

> **Could an objectively excellent outfit be eliminated before scoring ever sees it?**

Identify concrete examples.

This may be more important than tweaking the scoring weights.

---

# 10. Ranking & Rotation Audit

Evaluate:

- tiered shuffle
- hero diversification
- daily rotation
- freshness
- wear history
- affinity
- pair affinity

Determine whether these mechanisms:

### Improve personalisation

or

### Sometimes sacrifice outfit quality for novelty.

Identify the point at which diversification becomes harmful.

The goal should not simply be:

> "Don't show the same outfit twice."

The goal should be:

> **"Continue showing excellent outfits while intelligently avoiding unnecessary repetition."**

---

# 11. Personalisation Audit

Determine whether AuraCloset actually learns the user's taste or merely reacts to superficial signals.

Evaluate:

- likes
- dislikes
- reactions
- item affinity
- pair affinity
- wear history
- style goals
- profile information

Ask:

> Does the system learn that a user prefers a particular *style relationship*, or does it merely learn that the user likes individual garments?

This distinction is extremely important.

---

# 12. Explainability Audit

Evaluate the rationale generated for recommendations.

Determine whether the rationale:

- reflects the actual scoring decision;
- explains the important reason the outfit was selected;
- mentions irrelevant styling details;
- could contradict the actual algorithm;
- sounds generic;
- meaningfully helps the user understand the outfit.

Do not propose Gemini-generated rationale yet.

First determine whether the current rationale accurately represents the algorithm's reasoning.

---

# 13. Luxury / Premium Styling Standard

Evaluate the recommendation engine against AuraCloset's intended positioning:

> **"Your quiet-luxury stylist in your pocket."**

Ask whether the engine can consistently produce outfits that feel:

- polished
- intentional
- sophisticated
- restrained
- modern
- balanced
- expensive-looking
- effortless
- contextually appropriate

Do not confuse "luxury" with expensive brands.

Evaluate **styling quality**, not brand price.

Identify what prevents the current algorithm from achieving this consistently.

---

# 14. Quantitative Quality Framework

Create a proposed evaluation framework that could eventually score an outfit from 0–100 across dimensions such as:

- colour harmony
- silhouette/proportion
- occasion appropriateness
- formality
- coherence
- visual hierarchy
- texture
- practicality
- personalisation
- novelty/freshness
- luxury/polish

Do NOT change the application's current scoring system.

This is a **proposed external evaluation framework** for benchmarking it.

Explain why each dimension matters and propose sensible relative importance.

---

# 15. Produce a "Stylist vs Algorithm" Gap Analysis

Create a table:

| Capability | Current Engine | Expert Stylist | Gap | Severity |
|---|---|---|---|---|

Classify each gap:

**P0 — Fundamental recommendation-quality problem**

**P1 — Significant quality improvement opportunity**

**P2 — Enhancement**

**P3 — Cosmetic / low impact**

Do not label something P0 merely because it would be nice to have.

---

# 16. Determine Whether Gemini Is Actually Needed

Based on everything discovered, answer this question objectively:

> **Would adding Gemini as a second-stage evaluator of assembled outfits materially improve recommendation quality, or would it primarily add cost and latency to an already capable deterministic engine?**

Do not assume Gemini is the answer.

Evaluate at least three architectures:

### Architecture A
Deterministic engine only.

### Architecture B
Deterministic candidate generation → Gemini evaluates/ranks shortlisted outfits.

### Architecture C
Deterministic engine → Gemini acts as a final stylistic critic/veto layer only when necessary.

Compare:

- expected quality
- latency
- cost
- reliability
- explainability
- hallucination risk
- scalability
- user experience

Recommend one only if the evidence supports it.

---

# 17. Identify the Highest-Leverage Improvements

Do NOT give me a list of 30 improvements.

Identify the **5 highest-leverage changes** that would most improve actual outfit quality.

For each:

- current problem
- evidence
- proposed solution
- expected quality improvement
- implementation complexity
- risk
- priority

Then separately list lower-priority ideas.

---

# 18. FINAL VERDICT

Give the current recommendation engine one of these ratings:

### EXCEPTIONAL
Would frequently make decisions an expert stylist would agree with.

### STRONG
Generally produces good outfits but has identifiable quality gaps.

### COMPETENT
Technically sophisticated but stylistically inconsistent.

### WEAK
Frequently produces questionable recommendations.

### FUNDAMENTALLY FLAWED
The underlying architecture prevents good recommendations.

Explain the rating.

Then answer:

> **If AuraCloset launched tomorrow with this recommendation engine, what would be the three biggest reasons users might think "this app doesn't really understand fashion"?**

Be brutally honest.

---

# CRITICAL FINAL CONSTRAINT

**DO NOT MODIFY ANY CODE.**

Do not implement any recommendation from this audit.

Do not modify:

- `outfitRotation.ts`
- `outfitScoring.ts`
- wardrobe schemas
- Gemini prompts
- Gemini integration
- recommendation weights
- thresholds
- candidate generation
- ranking
- rotation
- UI

Your final output must be an **engineering + fashion intelligence audit and proposed roadmap only.**

At the end state:

**PHASE 3 STATUS: COMPLETE**

**CODE CHANGES: NONE**

**IMPLEMENTATION: NOT YET AUTHORISED**

The objective is to discover the truth about the recommendation engine before we touch it.