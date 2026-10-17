# Luxury dialogs, toasts, and save moment — implementation report

## Step 0 — existing behavior and decisions

The source review found 23 `Alert.alert` callsites across six screens. Git
history showed that the single-item “Add this item?” modal was added alongside
its own save-confirmation state; it was not enforcing a confidence threshold,
permission boundary, or other distinct safety rule. The screen already had
required type/colour checks and a final “Save to Wardrobe” action. Bulk review
already had a synchronous `savingRef` latch, and its “Save all reviewed items?”
dialog added a second confirmation after the user had selected the reviewed
items and pressed Save.

| Screen | Existing native alert purpose | Outcome |
| --- | --- | --- |
| Add Item (8) | Warn before changing garment category; camera permission denied; photo-library permission denied; missing item type; missing colour; wardrobe full with “Choose 30”; save failure; “Add this item?” confirmation | Keep category warning, capacity action, and validation/error explanations in the branded dialog. Keep OS permission sheets native and replace their follow-up errors. Remove the redundant save confirmation. |
| Bulk Review (5) | Confirm leaving a batch; upload pending; wardrobe full; batch save failure; “Save all reviewed items?” confirmation | Keep cancellation, pending, capacity, and failure handling. Remove the redundant save confirmation; retain the synchronous save latch. |
| Item Detail (1) | Confirm destructive item removal | Keep as a destructive confirmation and explain that saved looks and past wear records are retained. |
| Multi-item Review (3) | Confirm selected pieces and their detected relationship; save failure; upload pending | Keep all three; the selection/relationship confirmation remains distinct from saving the ordinary single or bulk review. |
| Outfits (1) | Explain a failed look export | Convert to a toast. |
| Profile (5) | Guest Premium sign-in choice; sign-out failure; destructive account deletion; deletion not confirmed; account deleted but device cleanup incomplete | Preserve the choices and failure states in branded dialogs. |

There was no `Alert.prompt` or app-owned `window.confirm`. Camera/photo
permission requests still use the operating system's permission UI.

## Behavior implemented

- Added a root `LuxuryFeedbackProvider`, lightweight `useDialog`/`useToast`
  contexts, a branded native `Modal` dialog, and a queued safe-area toast.
- Dialogs preserve cancel/destructive choices, prevent outside dismissal for
  destructive alerts, cancel on Android Back, announce content to screen
  readers, and respect Reduce Motion. Toasts announce politely, show an optional
  garment thumbnail, queue instead of overlapping, and show Undo for five
  seconds.
- Single-item Add Item now saves directly after existing required type/colour
  validation. A synchronous in-flight ref prevents rapid duplicate saves.
- Bulk and multi-piece saves remain protected by their existing synchronous
  latches. They show one success toast only after the wardrobe commit is
  acknowledged.
- Replacing/re-photographing an existing item shows “Changes saved” without
  Undo; deleting that row would not restore its prior version.
- Undo uses the normal wardrobe removal path with the committed row ID and
  photo URI. That path removes the authenticated row/photo or guest row/photo
  and updates relevant local wardrobe state; it does not refund quota or delete
  saved-look/wear-history records. Batch Undo attempts every item serially and
  reports an incomplete result if any removal cannot be confirmed. Undoing a
  manually added piece from Bulk Review also restores that transient review
  card.
- Account-owner checks bind a toast to the account that created it. A switch
  clears queued/visible Undo actions; stale actions cannot remove another
  account's item. If a guest photo is outside the managed document directory,
  cleanup is not reported as complete.
- Required type/colour feedback remains a dialog; the optional inline-field
  validation was not added because it would introduce new scroll/focus behavior
  on the swipe-dismiss sheet.

The save confirmations were removed because they repeated the explicit save
action without adding a safety check. Destructive removal/account deletion,
category-change, and multi-piece relationship confirmations remain.

## Files changed

- `components/LuxuryDialog.tsx`
- `components/LuxuryFeedbackProvider.tsx`
- `components/LuxuryToast.tsx`
- `contexts/LuxuryFeedbackContext.tsx`
- `contexts/AppContext.tsx`
- `lib/alertDialogAdapter.ts`
- `lib/bulkClassifyCore.ts`
- `app/_layout.tsx`
- `app/add-item.tsx`
- `app/bulk-review.tsx`
- `app/item-detail.tsx`
- `app/multi-item-review.tsx`
- `app/(tabs)/outfits.tsx`
- `app/(tabs)/profile.tsx`
- `__tests__/alertDialogAdapter.test.ts`
- `__tests__/addItemReplacementContract.test.ts`
- `__tests__/b28RemediationContract.test.ts`
- `__tests__/bulkReviewMountedGuard.test.ts`
- `__tests__/canonicalWardrobeUi.test.ts`
- `__tests__/classifierRefusal.test.ts`
- `__tests__/conciergeUi.test.ts`
- `__tests__/multiItemUploadWiring.test.ts`
- `__tests__/traditionalStylingUi.test.ts`
- `__tests__/wardrobeDatabaseContract.test.ts`
- `.agents/memory/MEMORY.md`
- `.agents/memory/luxury-feedback-hook-boundary.md`
- `TECHNICAL.md`
- `reports/luxury-dialogs-and-save-moment.md`

The user-provided spec attachment remains unchanged. No dependencies or
database schema were added or changed.

## Automated checks

| Check | Result |
| --- | --- |
| Focused dialogs/save tests (`alertDialogAdapter`, bulk save/Undo, save contracts, and affected mounted screen tests) | 11 passed, 0 failed |
| Final Alert adapter check after preserving `AlertOptions.onDismiss` | 1 passed, 0 failed |
| `npm test` | 104 passed, 0 failed |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `git diff --check` | Passed |
| Search for `Alert.alert`, `Alert.prompt`, or `window.confirm` in app/components/contexts | No legacy app alert calls remain |
| Expo native export | Not completed: iOS export remained at “Starting Metro Bundler” for about six minutes, so it was stopped; Android export did not run |

The first full-suite run exposed source-contract tests that still expected the
old Alert API and mounted screen fixtures without the new feedback context.
Those contracts/fixtures were updated; the final full run passed. Test output
includes non-failing React Test Renderer deprecation notices and intentionally
simulated dependency-failure logs.

The configured frontend workflow was restarted and is marked running, but its
captured log only confirms Expo CLI login; it did not show a Metro-ready line.
No browser-rendered signed-in UI or live Supabase/Storage Undo operation was
verified.

## Manual device checks — not performed

No physical iOS/Android device or screen reader was used for this change.
Complete these checks before treating native interaction/accessibility as
verified:

| Check | iOS | Android |
| --- | --- | --- |
| For guest and authenticated accounts separately, save one item, confirm the thumbnail toast, and Undo within five seconds; verify row/photo removal | Not run | Not run |
| Save a reviewed batch; confirm one toast; Undo and verify every row/photo is removed | Not run | Not run |
| Remove an existing wardrobe item; verify destructive confirmation and retained-history/look explanation | Not run | Not run |
| Allow and deny camera/photo access; verify OS permission sheet and branded follow-up message | Not run | Not run |
| Submit a rejected photo; verify the calm refusal/retry handling is preserved | Not run | Not run |
| Press system Back while a dialog is open; confirm it cancels without running a destructive action | N/A | Not run |
| Enable Reduce Motion; confirm dialog/toast transitions use the reduced-motion path | Not run | Not run |
| VoiceOver/TalkBack: verify modal focus, button labels, announcement, Undo action, and dismissal | Not run | Not run |

Recommendation Engine v3.7, Phase A schema/security, P1.3 Concierge behavior,
classifier behavior, and database schema were not changed. The Outfits change
only replaces its export-failure alert with a toast.
