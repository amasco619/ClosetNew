---
name: Classifier single-item boundary
description: Product meaning of one wardrobe item and evidence required before attributing refusals to model drift.
---

A matching pair (shoes, sandals, boots, earrings, gloves or socks) and a coordinated set worn as a unit count as ONE wardrobe item. Refuse multiple unrelated garments only when no single item clearly dominates; uncertainty about multiplicity should favor the dominant item, without weakening other content guardrails.

**Why:** The user explicitly defines pairs and coordinated sets this way. A broad multiple-garment refusal rule contradicted existing set support and repeatedly rejected sneakers.

**How to apply:** Preserve this item boundary in future prompt edits without inventing new taxonomy. Compare provider-resolved model versions, prompt hashes and actual submitted image hashes before blaming a rolling alias; different preprocessing can make the same original photo different provider payloads.
