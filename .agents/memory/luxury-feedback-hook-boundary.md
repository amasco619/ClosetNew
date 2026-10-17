---
name: Luxury feedback hook boundary
description: Keep screen-level dialog/toast hooks separate from native feedback UI imports.
---

App screens should import `useDialog` and `useToast` from the lightweight feedback context. The root layout alone mounts the provider and its native modal/blur UI.

**Why:** Mounted screen tests bundle route modules with mocked native boundaries; importing the provider from a screen pulled Expo-native UI modules into those test bundles and broke resolution. The separation also prevents every route from loading root presentation code.

**How to apply:** Keep the hooks/context free of native UI imports, and add lightweight context mocks to screen tests that bundle those routes. Keep the presentation components under the root provider.
