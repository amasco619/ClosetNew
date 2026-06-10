---
name: Guest mode pattern
description: How AuraCloset handles unauthenticated guest users — caps, routing, and auth transition.
---

## Rule
- `UserProfile.isGuest?: boolean` — set to `true` when user chooses "Get Started" on the welcome screen
- `GUEST_ITEM_CAP = 5` (contexts/AppContext.tsx), `FREE_ITEM_CAP = 10` (authenticated free)
- `canAddItem` and `activeWardrobeItems` check guest cap first; premium overrides both
- The `SIGNED_IN` event handler in AppContext always clears `isGuest: false` on any successful auth (email, Google, Apple, magic-link)

## Routing (app/index.tsx)
1. Session exists → tabs (if onboarding done) or /onboarding
2. No session + `profile.isGuest && profile.onboardingComplete` → tabs (guest flow)
3. Otherwise → /welcome

## Onboarding entry
`/onboarding?guest=true` — `handleNext` checks `params.guest === 'true'` and spreads `{ isGuest: true }` into the final `updateProfile` call.

**Why:** Lets users explore the full app before committing to sign-up. On auth, all local wardrobe data is preserved (profile merges, isGuest cleared).

**How to apply:** Whenever adding a new cap or feature gate, check `profile.isGuest` before `isPremium` — guests are a subset of free users.
