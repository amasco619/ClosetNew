# Amodka Profile Redesign — Read-Only Audit

**Scope:** pre-implementation audit for the quiet-luxury Profile redesign. No product code was changed while gathering these findings.

## Current Profile surface and controls

`app/(tabs)/profile.tsx` renders the Profile tab. It includes identity editing, Style DNA, inline refinement controls, weather and temperature preferences, Wear Log, an expandable Personal Intelligence panel, a subscription section, AI-processing privacy settings, sign-out, and account deletion.

| Current control | Existing behavior |
|---|---|
| Avatar edit badge and name pencil/name | Both enter the same inline name editor and save through `updateProfile`. They are duplicate visible edit affordances. |
| Redo Style Quiz | Pushes `/onboarding`. |
| Refinement chips and switches | Update the existing profile fields immediately; there is no separate Save button. |
| Weather switch | Calls `setWeatherEnabled`; saves the profile locally, clears weather cache when disabled, and refreshes weather when enabled. |
| Temperature unit | Calls `updateProfile` with the selected unit. |
| Wear Log | Pushes `/wear-log`. |
| Personal Intelligence heading | Expands/collapses an inline view; its status, signals, and item lists are not currently a separate route. |
| “Combination learning — Premium” | A non-tappable lock row for non-Premium users. |
| Premium plan | Premium users have a Manage action to `/premium`, plus Deep Diagnostics (`/diagnostics`) and Wardrobe Blueprint (`/blueprint`). Free/guest users see an upgrade card; guests receive the existing sign-in dialog before the Premium route. |
| AI Processing | Switch is disabled for guests/loading/unavailable states. Turning it on from no choice opens the existing consent sheet; turning it off saves `declined`. |
| Sign out | Signs out and replaces the route with `/sign-in`; errors use the existing luxury notification. |
| Delete account | Existing confirmation is retained; server deletion and local-cache cleanup run only after confirmation. |

The current Profile accessibility labels are `AI Processing`, `Sign out of Amodka`, and `Delete your Amodka account`; no `testID` attributes were found in the Profile screen. These labels must remain intact.

## Refinement state and routing

Refinement counts are derived from existing `UserProfile` values:

- Physical: hair color, height band, and face shape (3).
- Style: contrast, metal preference, color aversions, no sleeveless, no short skirts, and a non-default maximum heel height (6).
- Lifestyle: default mood, non-default industry, non-default life phase, and whether any lifestyle allocation differs from its established default (4).

The existing allocation defaults are work 40, casual 40, events 20, active 0, brunch 0. Missing allocation values use those defaults for the “changed allocation” count. UI work must preserve these semantics and keep the same fields, update timing, and persistence.

Profile routes are file-based Expo Router routes, with the root stack explicitly configuring commonly used screens in `app/_layout.tsx`. Existing pushed destinations include `/wear-log`, `/premium`, `/diagnostics`, `/blueprint`, and `/onboarding`. Fonts loaded globally are Inter 400, 500, 600, and 700 from `app/_layout.tsx`. The current app version is `1.0.0`.

`AppContext.updateProfile` immediately updates React state, writes the profile to AsyncStorage, and starts an upsert to `user_profiles` for signed-in users. `setWeatherEnabled` separately updates its current local profile cache and the weather cache/fetch behavior. No new persistence or schema is needed for presentation-only navigation.

## AI-processing choice, disclosure, and enforcement

The existing choice is `not_asked | allowed | declined`. The Profile fetches it from `/api/user/ai-processing`; the server stores it in Supabase Auth `app_metadata` under `amodka_ai_image_processing`. It is therefore account-scoped rather than a local-only setting. `not_asked` and `declined` both render the switch off, but are distinct saved states.

The Profile displays this exact description:

> Allow AI services to prepare and identify garment photos. Turning this off prevents future processing; it does not remove existing wardrobe items or images.

The existing consent sheet’s disclosure wording is:

> To automatically identify and prepare your garment, your selected photo will be processed by Amodka and third-party AI services, including PhotoRoom and Google Gemini.
>
> By selecting Allow AI processing, you give Amodka permission to send your selected photo to these services for this purpose.
>
> You can decline and continue without AI processing. You can withdraw this permission later in Settings.

The add-item and bulk-review flows request the same preference and open the consent sheet when the returned state is `not_asked`. `allowed` is saved before AI processing; `declined` is saved through the existing decline action. The server-side `requireAiProcessingConsent` middleware rejects non-`allowed` states and fails closed if the preference cannot be loaded. This redesign must preserve the existing sheet, wording, saved-state distinctions, and gating.

## Account deletion audit

The UI’s existing confirmation states:

> This will permanently delete your account and all wardrobe data. This cannot be undone. Deleting your Amodka account does not cancel your App Store or Google Play subscription. Cancel it separately through your app store.

The authenticated endpoint verifies that the requested user ID matches the authenticated user. When RevenueCat billing is enabled, it first calls the billing tombstone RPC. The server then removes objects from `wardrobe-images` and `tryon-photos`, deletes these rows by `user_id`: `affinity_signals`, `pair_affinity_signals`, `rotation_cursors`, `wear_logs`, `slot_statuses`, `tryon_profiles`, `saved_looks`, `garment_group_members`, `garment_groups`, and `wardrobe_items`; it deletes `user_profiles` by `id`, then deletes the Supabase Auth user. The client subsequently clears the listed Amodka and legacy AuraCloset AsyncStorage keys and signs out.

The `wardrobe_free_selections` rows are not in the explicit delete list, but their migration defines cascading foreign keys to both the profile and owned wardrobe item, so deleting those parents removes the associated rows. If billing is active, billing data is tombstoned rather than treated as a user subscription cancellation; the app explicitly tells users to cancel store subscriptions separately.

**Deletion gap noted, not changed:** the separate PostgreSQL `bg_removal_usage` table has a `user_id` primary key but is not explicitly deleted by `deleteAccountData`. `bg_removal_cache` is keyed by image hash rather than account and is pruned after 30 days, so this code cannot identify or immediately remove a particular user’s cache entries. This is outside the Profile redesign scope and is not modified here.

**Follow-up:** `bg_removal_usage` was subsequently added to the shared account-deletion inventory and is now removed with the other user-owned rows. The shared, hash-keyed `bg_removal_cache` remains untouched.

## Design and behavior constraints for implementation

- Use existing `constants/colors.ts` and globally loaded Inter fonts; do not add dependencies or fonts.
- Keep Profile-only presentation changes, add pushed Refinements and Personal Intelligence screens, and preserve all existing handlers and data semantics.
- Keep Style Quiz, AI consent/gating, account deletion, Premium behavior, wear tracking, and refinement persistence unchanged.
- Preserve the named accessibility labels, make touch targets at least 44 points, and verify text contrast for every distinct text/surface pairing on the three screens.
- Use the existing profile version value for the footer. No schema, provider, entitlement, or Recommendation Engine changes are required.
