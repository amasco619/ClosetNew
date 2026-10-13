---
name: Temperature-unit policy
description: Global default and explicit-choice policy for temperature display.
---

Celsius is Amodka's global default, regardless of country or location. Fahrenheit
is available only as an explicit user preference. Preserve saved Fahrenheit
choices; do not reset them when applying a new default.

**Why:** The user explicitly requested this global policy, including the UK;
locale-based Fahrenheit defaults do not match the product requirement.

**How to apply:** Never reintroduce a regional default or automatically save a
location-inferred preference. Keep default resolution separate from saved choices.
