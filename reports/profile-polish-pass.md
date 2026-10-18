# Amodka Profile Polish Pass

## Changes

1. **AI Processing switch:** The state-to-action mapping is explicit and tested.
   Turning ON from `not_asked` or `declined` opens the existing disclosure;
   Cancel leaves the choice `declined` and OFF. Allow still records consent
   through the existing persistence path. Turning OFF from `allowed` records
   `declined`; repeated choices with no state change do nothing.
2. **Personal Intelligence upgrade:** Free users can tap the Premium
   combination-learning row to reach the same upgrade route as the Profile
   membership card. Guests see the same sign-in dialog first. Premium display
   remains unchanged. The row is exposed as a button with the requested label.
3. **Style DNA:** The existing quiz fields now render in a two-column,
   label/value grid: Body Shape, Eye Color, Skin Tone, Undertone, Primary Style,
   and Secondary Style. Labels are 11pt uppercase muted text; values are 16pt
   ink text. The existing value mappings are retained, and no value is shown
   without its matching field. No current Style DNA value lacks a clear field
   name. Hair and colour-season values are not part of the existing Style DNA
   source and were not added.
4. **Refinements placement:** Refinements now follows Redo Style Quiz in Style
   DNA, separated by a hairline divider. Its optional-count subtitle and route
   are unchanged. Activity now contains only Wear Log and Personal Intelligence.
5. **Footer clearance:** Profile scroll padding is platform tab-bar base height
   (49pt iOS, 56pt Android, 84pt web) + bottom safe-area inset + 24pt.

## Consent-flow check

The declined → ON path already opened the approved sheet before this pass:
`changeAiProcessingPreference` in `app/(tabs)/profile.tsx` opens
`AiProcessingConsent`; its Cancel action calls `declineProfileAiProcessing`,
which retains/saves `declined`. This behavior is now driven by the pure switch
mapping helper and covered for `not_asked`, `declined`, and `allowed`, for both
ON and OFF.

## Verification

- `npm test -- profilePresentation.test.ts` — passed, 4 tests.
- `npm test -- aiProcessingPreference.test.ts` — passed.
- `npm test` — passed, 109 test files, 0 failed.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npx tsx __tests__/recommendation-golden-set.ts` — passed, 35/35.
- `git diff --check` — passed.
- Style DNA label contrast on its white card: `#626A73` 5.49:1; value contrast
  for `#101826` 17.79:1.

## Deviations

None.

## Not verified on a device

No physical iOS or Android device was available for visual or interaction
verification. In particular, the footer clearance on small phones and Android
gesture-navigation devices, and VoiceOver/TalkBack behavior, remain unverified.
