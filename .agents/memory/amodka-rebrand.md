---
name: Amodka rebrand
description: App was renamed from AuraCloset to Amodka in Phase 5A. All new work should use "Amodka", "amodka", "com.amodka".
---

# Amodka Rebrand (Phase 5A)

**Why:** Phase 5A premium experience rebranding. AuraCloset was the development name.

**New identifiers:**
- App display name: `Amodka`
- Slug: `amodka`
- URL scheme: `amodka://`
- iOS bundle ID: `com.amodka`
- Android package: `com.amodka`
- AsyncStorage key prefix: `@amodka_*`
- OAuth scheme: `amodka` (in `lib/auth.ts` and `lib/emailSignUp.ts`)

**How to apply:** Any new string, key, identifier, permission, or label should use "Amodka" / "amodka" / "com.amodka". Historical docs (docs/, attached_assets/) were intentionally left with old name — do not update them.

**OAuth note:** `_layout.tsx` URL scheme check is `amodka://` — must match `app.json` scheme exactly.
