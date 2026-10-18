---
name: Guest mode pattern
description: How AuraCloset handles unauthenticated guest users — caps, routing, and auth transition.
---

## Rule
- Guest manual wardrobe additions are local-only: photos are copied into app documents and wardrobe rows remain in the existing local store.
- Guest bulk upload follows the same manual local-save path; it does not classify photos or invoke PhotoRoom/Gemini.
- Signing in does not imply that guest wardrobe rows or photos are transferred to the account. Do not promise or implement transfer as part of a guest upload change.
- The `SIGNED_IN` event clears `isGuest: false`; guest profile/onboarding settings may be migrated, but that is separate from wardrobe-row/photo transfer.

## Routing (app/index.tsx)
1. Session exists → tabs (if onboarding done) or /onboarding
2. No session + `profile.isGuest && profile.onboardingComplete` → tabs (guest flow)
3. Otherwise → /welcome

## Onboarding entry
`/onboarding?guest=true` — `handleNext` checks `params.guest === 'true'` and spreads `{ isGuest: true }` into the final `updateProfile` call.

**Why:** The approved guest bulk scope requires local-only parity with single manual add and no new continuity or migration behavior.

**How to apply:** Keep guest photo selection, manual save, and cleanup on-device. Treat account transfer as a separate explicit product and security decision.
