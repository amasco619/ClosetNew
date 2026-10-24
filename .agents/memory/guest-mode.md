---
name: Guest mode pattern
description: How AuraCloset handles unauthenticated guest users — caps, routing, and auth transition.
---

## Rule
- Guest manual wardrobe additions are local-only: photos are copied into app documents and wardrobe rows remain in the existing local store.
- Guest bulk upload follows the same manual local-save path; it does not classify photos or invoke PhotoRoom/Gemini.
- On account creation/sign-in, discard guest wardrobe/profile/photos when the authenticated account already has any wardrobe row or saved personalization; preserve that account's profile. Only a blank, unpersonalised account absorbs saved guest data.
- Persist the owner-bound disposition before writes; do not decide from provider or signup button. If authoritative reads fail, keep guest data and pending claims intact.
- New-account transfer remains durable, stable-ID/idempotent and non-AI. Pending absorbed garments stay visible as “Waiting to sync” until confirmation; they do not enter active wardrobe or recommendation state.

## Routing (app/index.tsx)
1. Session exists → tabs (if onboarding done) or /onboarding
2. No session + `profile.isGuest && profile.onboardingComplete` → tabs (guest flow)
3. Otherwise → /welcome

## Onboarding entry
`/onboarding?guest=true` — `handleNext` checks `params.guest === 'true'` and spreads `{ isGuest: true }` into the final `updateProfile` call.

**Why:** The user specified that established accounts must not be overwritten by guest data, while truly blank new accounts may absorb saved guest data.

**How to apply:** Decide from the signed-in server profile and exact wardrobe count before any guest claim/profile write. Keep guest photo selection and manual saves local; never infer AI consent from signup or transfer guest data into an existing account.

## Interrupted guest transfers

One surviving preparation marker permits one automatic retry; a second consecutive interruption pauses that photo for manual retry. Reconcile confirmed account rows first. Caught offline/HTTP failures are not crashes, and manual retry resets the interruption count. A guest photo retained after save-time preparation failure must start in the manual retry state rather than automatic preparation.

**Why:** The user specified this policy to prevent repeated Android process-kill loops while still allowing one interruption caused by simply closing the app.

**How to apply:** Preserve original local photos and the existing owner-bound absorb/discard rules; interruption protection must never turn a failed transfer into data loss.
