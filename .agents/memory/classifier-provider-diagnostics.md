---
name: Classifier provider diagnostics
description: Why provider identity and timing must be checked when both upload entry paths suddenly stop classifying.
---

Treat rolling provider aliases as externally changing dependencies. Keep an explicitly selected, verified model family as the default rather than assuming a latest alias preserves identity or latency.

**Why:** The rolling lite alias resolved to a newer model outside the application's response budget while the already-supported alternative completed the same probes promptly. Successful background removal and a generic connection message did not identify the failing stage.

**How to apply:** First correlate provider status, resolved model identity and elapsed time. Probe with non-customer sample inputs and the actual garment prompt. Preserve consent gates, image-preparation parity and bounded timeouts; do not respond by silently expanding retries or changing wardrobe semantics. Provider liveness evidence is not a classification-accuracy benchmark or physical-device verification.

For thinking-capable models, verify that the response budget covers both internal reasoning and the full JSON answer. Validate more than one garment before claiming upload recovery.

**Why:** A successful shoe probe missed a second failure: other garments exhausted the shared output budget on reasoning and returned truncated JSON despite HTTP 200.

**How to apply:** Inspect the provider finish reason and safe token counts, compare identical inputs under controlled budgets, reserve output space by bounding reasoning only where the model supports it, preserve strict JSON/schema validation, and reject truncated output rather than repairing or saving it.

Do not infer readiness from a model catalog or a single successful sample. Distinguish daily quota exhaustion from RPM throttling and from fallback availability.

**Why:** Subsequent device tests still failed: the primary exhausted its Google project/model daily allowance, while listed alternatives returned not-found/unavailable responses or timed out. The fallback occasionally succeeded but was not reliable.

**How to apply:** Inspect structured QuotaFailure identifiers and RetryInfo without logging credentials or customer/provider text. Treat observed quota values as time-specific facts, not permanent configuration. Stop cycling models when live evidence stays mixed; report the provider blocker and do not claim a fix from offline tests. Enabling paid billing requires separate authorisation.
