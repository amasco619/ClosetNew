---
name: Per-garment metadata persistence
description: Why normalized recommendation attributes belong on individual wardrobe rows.
---

Keep normalized fabric, fit, pattern, and pattern scale on each garment's wardrobe row, including distinct members of a multi-item classification. Leave missing legacy values NULL rather than inventing values during migration.

**Why:** The recommendation engine already consumes these signals, but group shared attributes only describe values common to every member and cannot represent standalone garments or differences between members. Preserving pattern without its existing scale signal loses print-compatibility information. The owner requires durable garment-specific attributes for launch.

**How to apply:** Extend existing authenticated RPC and owned-row replacement boundaries when adding per-garment persistence; do not restore direct INSERT access or put individual member values into group shared attributes.