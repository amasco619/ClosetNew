---
name: Stole taxonomy boundary
description: Why shoulder/neck stoles use the existing accessory category and how to keep Kente identity separate from textile metadata
---

Use the existing accessory backing category for shoulder/neck stoles, but label a stole as a textile accessory in user-facing UI. Require an explicit shoulder/neck wear assessment from image classification before accepting that subtype; a bare textile name is insufficient. Treat Kente as textile identity or appearance, never automatic evidence of wax-print pattern or a particular fiber.

**Why:** Adding a new persisted category would ripple into the frozen recommendation and persistence contracts for a narrow classification correction. Image-derived wear position can gate a subtype without storing a new field. A pattern alone cannot prove fiber or that a loose cloth is a wearable stole.

**How to apply:** Keep future single-item and multi-item classifier prompts, validation and manual category labels aligned. Tests with mocked classifier output validate contract handling, not actual visual recognition; photo-based accuracy requires separate evaluation.