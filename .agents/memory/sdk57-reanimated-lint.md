---
name: SDK 57 Reanimated lint exception
description: How to handle exhaustive-deps warnings for mutable Reanimated SharedValues under the SDK 57 React hooks lint rules.
---

Stable Reanimated SharedValues can be mutated from callbacks. Adding one to a callback dependency array may trigger the immutability rule, so only omit that dependency with an adjacent, line-specific `react-hooks/exhaustive-deps` suppression explaining the stable SharedValue. Keep all other dependencies complete and do not disable hook rules globally.

**Why:** The SDK 57 React hooks lint rules reject mutation of a value passed into a hook dependency list, even though Reanimated SharedValues are intentionally mutated.

**How to apply:** First verify the shared value is stable for the component lifetime and the callback only uses its `.value` as an animation command; then add the narrow documented suppression and keep `npm run lint` warning-free.
