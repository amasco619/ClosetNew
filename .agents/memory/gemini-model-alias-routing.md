---
name: Gemini model alias routing
description: Preserve the served model version and pricing assumptions in Gemini experiments.
---

Treat a requested Gemini model ID as a requested alias, not proof of the model version that served the response. Record `modelVersion` per response. Use the served version's published rate where known; if billing or alias pricing is not established, label the estimate as a proxy.

**Why:** live generation calls have returned a newer `modelVersion` than the requested alias.

**How to apply:** for Gemini probes and experiments, log the requested ID, served `modelVersion`, thinking level, and price basis together.
