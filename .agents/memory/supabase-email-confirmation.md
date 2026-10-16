---
name: Supabase email confirmation
description: Current development Auth setting and its dependency on in-app confirmation guidance.
---

Supabase Auth's **Confirm Email** setting is off in the development project. The app no longer shows a confirmation screen. Before enabling the setting for launch, restore explicit in-app confirmation guidance. For sign-up, acknowledge only known duplicate-email provider codes to preserve enumeration resistance; unstructured provider errors must fail as retryable rather than look like successful creation and then `invalid_credentials`.

**Why:** the user confirmed the hosted setting is off. On 2026-10-16, a live canary exposed a provider error that the route acknowledged as success; the follow-up sign-in then misleadingly returned `invalid_credentials`.

**How to apply:** check the hosted Supabase setting and the app's signup UX together whenever changing email confirmation policy; keep confirmation disabled until the matching UX is available. When changing signup error handling, preserve the duplicate-email privacy response but never acknowledge an unstructured provider failure.
