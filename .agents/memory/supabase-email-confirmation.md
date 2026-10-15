---
name: Supabase email confirmation
description: Current development Auth setting and its dependency on in-app confirmation guidance.
---

Supabase Auth's **Confirm Email** setting is off in the development project. The app no longer shows a confirmation screen. Before enabling the setting for launch, restore explicit in-app confirmation guidance and make sure signup failures are not misrepresented as email confirmation.

**Why:** the user confirmed the hosted setting is off, and a generic signup acknowledgement followed by rejected sign-in cannot prove that a confirmation email was sent.

**How to apply:** check the hosted Supabase setting and the app's signup UX together whenever changing email confirmation policy; keep confirmation disabled until the matching UX is available.
