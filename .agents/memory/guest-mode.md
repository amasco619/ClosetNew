---
name: Guest mode pattern
description: How AuraCloset handles unauthenticated guest users — caps, routing, and auth transition.
---

## Rule
- Guest manual wardrobe additions are local-only: photos are copied into app documents and wardrobe rows remain in the existing local store.
- Guest bulk upload follows the same manual local-save path; it does not classify photos or invoke PhotoRoom/Gemini.
- The user explicitly approved automatic transfer of already-saved guest garments after signup OR signin. This supersedes the earlier no-transfer scope; guest photo selection/review itself remains local and manual.
- Account transfer must be owner-bound, durable, stable-ID/idempotent and non-AI. Preserve pending originals through failure/capacity limits; never copy a prior account's wardrobe or infer consent to AI processing from signup.

## Routing (app/index.tsx)
1. Session exists → tabs (if onboarding done) or /onboarding
2. No session + `profile.isGuest && profile.onboardingComplete` → tabs (guest flow)
3. Otherwise → /welcome

## Onboarding entry
`/onboarding?guest=true` — `handleNext` checks `params.guest === 'true'` and spreads `{ isGuest: true }` into the final `updateProfile` call.

**Why:** The user reported losing three guest garments when creating an account and explicitly requested account continuity without AI calls or changes to schema, quota rules, billing or consent.

**How to apply:** Keep guest photo selection and manual save on-device; migrate only saved rows from the explicitly guest cache through the separately account-bound transfer. Do not apply AI to previous selections or turn account-owned data into guest data.
