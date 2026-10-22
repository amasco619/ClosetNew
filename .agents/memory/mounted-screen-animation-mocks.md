---
name: Mounted screen animation mocks
description: Mock requirements for mounting routes that navigate from Reanimated completion callbacks.
---

# Mounted screen animation mocks

When mounting a real animated route, provide its animated text/view elements, easing functions, `runOnJS`, and a `withTiming` mock that invokes completion callbacks.

**Why:** route changes can happen only after the animation completion callback, while incomplete animation mocks either crash during render or make navigation tests pass without exercising the destination.

**How to apply:** add the smallest animation mock surface required by the route under test; invoke completion callbacks as finished so navigation effects are observable.
