---
name: Classifier single-item boundary
description: Product meaning of one wardrobe item and evidence required before attributing refusals to model drift.
---

A matching pair (shoes, sandals, boots, earrings, gloves or socks) and a coordinated set worn as a unit count as ONE wardrobe item. Refuse multiple unrelated garments only when no single item clearly dominates; uncertainty about multiplicity should favor the dominant item, without weakening other content guardrails.

**Why:** The user explicitly defines pairs and coordinated sets this way. A broad multiple-garment refusal rule contradicted existing set support and repeatedly rejected sneakers.

**How to apply:** Preserve this item boundary in future prompt edits without inventing new taxonomy. Compare provider-resolved model versions, prompt hashes and actual submitted image hashes before blaming a rolling alias; different preprocessing can make the same original photo different provider payloads.

Single and bulk uploads are equivalent entry routes: the user expects the same garment photo to receive consistent classification, including its colour, regardless of entry route.

**Why:** The user reported joggers labelled lavender in bulk and grey in single entry and explicitly requested consistency.

**How to apply:** Evaluate classification changes against both entry paths; do not introduce flow-specific colour rules or treat bulk as a different garment interpretation context.

Use native decoded dimensions rather than picker/diagnostic metadata when making both preparation paths equivalent. Keep the established single-entry resolution/quality baseline until a controlled image benchmark justifies changing it; matching preprocessing is not a claim of deterministic model output.

**Why:** Picker/EXIF metadata and dev-only staging diagnostics are not reliable runtime geometry authorities. The user requested the accuracy-oriented option, but no controlled evidence established that extra pixels or forced grey labels would improve colour accuracy. This milestone deliberately removes an input mismatch without changing the model, prompt or colour policy.
