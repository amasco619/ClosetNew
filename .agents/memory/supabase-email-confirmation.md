---
name: Supabase email confirmation
description: Current development Auth setting and its dependency on in-app confirmation guidance.
---

Supabase Auth's **Confirm Email** setting is off in the development project. The app no longer shows a confirmation screen. Before enabling the setting for launch, restore explicit in-app confirmation guidance. Signup intentionally discloses an existing account only when Supabase returns a known duplicate code (`email_exists` or `user_already_exists`); this is the approved exception to signup enumeration resistance and remains behind `authLimiter`. The selected Production project returned `user_already_exists` (422) in a disposable duplicate probe. If a future confirmation configuration obfuscates duplicate results, do not infer account existence from a successful response. Unstructured provider errors must fail as retryable rather than look like successful creation and then `invalid_credentials`. Sign-in must remain non-enumerating.

**Why:** the user confirmed the hosted setting is off and explicitly approved the narrow duplicate-account disclosure for the auth UX. A prior live canary exposed a provider error that was acknowledged as success; the follow-up sign-in then misleadingly returned `invalid_credentials`.

**How to apply:** check the hosted Supabase setting and the app's signup UX together whenever changing email confirmation policy; keep confirmation disabled until the matching UX is available. Only disclose duplicates from explicit provider codes, preserve the shared signup rate limit, keep wrong-password and unknown-email sign-in responses identical, and never acknowledge an unstructured provider failure.
