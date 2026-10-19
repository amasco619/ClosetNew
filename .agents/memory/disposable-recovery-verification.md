---
name: Disposable recovery verification
description: Safety and evidence boundaries for missing-photo recovery verification.
---

Use an explicitly disposable account for missing-photo recovery checks. No real user account or photos may be deleted without approval. Keep fixture checks distinct from live browser/Supabase evidence and physical-device evidence.

**Why:** The user explicitly required these safety and evidence boundaries for wardrobe-photo recovery verification.

**How to apply:** Create synthetic photos and isolated account-owned rows, scope cleanup to resources created in that run, and state whether native camera/device behavior was actually exercised.
