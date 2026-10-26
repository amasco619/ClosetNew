---
name: Deterministic copy audits
description: Coverage and variety checks for fingerprint-seeded explanation copy.
---

Check both phrase presence and frequency in deterministic-copy variety tests;
a frequency cap alone passes for templates that never appear.

**Why:** Correlated synthetic item identifiers can restrict hash residues and
silently omit phrase variants even across hundreds of generated displays.

**How to apply:** Vary fingerprint inputs independently and require every
inventoried phrase to occur before claiming template variety or grammar coverage.
