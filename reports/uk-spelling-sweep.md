# Amodka UK spelling sweep

## Scope and audit list

This is a display-copy-only sweep. The phase A changes corrected the following
user-facing strings:

| Screen | Location | Change |
|---|---|---|
| Home | `app/(tabs)/index.tsx:152` | “Minimal gold jewelry” → “Minimal gold jewellery” |
| Add Item | `app/add-item.tsx:1552,1555,1746,1931` | “Color”, “dominant color family”, “jewelry placement”, and “Accent color” → “Colour”, “dominant colour family”, “jewellery placement”, and “Accent colour” |
| Bulk Item Edit | `components/BulkItemEditPanel.tsx:357` | “Color” → “Colour” |
| Onboarding | `app/onboarding.tsx:383-384,624` | “Eye Color”, “jewelry”, and “Colors to avoid” → “Eye Colour”, “jewellery”, and “Colours to avoid” |
| Premium | `app/premium.tsx:36` | “Jewelry Intelligence” and “Smart jewelry pairing” → “Jewellery Intelligence” and “Smart jewellery pairing” |

The second phase added presentation-only labels for stored values. `gray` and
`grey` display as **Grey**; `jewelry` displays as **Jewellery**; and
`jewelry & accessories` displays as **Jewellery & accessories**. The lookup
lives in `constants/wardrobeLabels.ts:1-14`; category IDs, colour values,
classifier/API fields, and persisted data are unchanged. The special “Textile
accessory” label for a stole remains in place.

The map is used on Home, Wardrobe, Outfits, Add Item, Bulk Item Edit, Bulk
Review, Item Detail, Choose 30, Blueprint, Outfit Ideas, Diagnostics, Personal
Intelligence, Wear Log, Travel Planner, and the multi-item review/category
diagnostics output. It covers visible labels and relevant accessibility labels.
The existing category-label test was updated, and
`__tests__/wardrobeLabels.test.ts` tests the conversions, unknown-value
passthrough, and the stole exception.

| Display surface | Consumer locations |
|---|---|
| Home | `app/(tabs)/index.tsx:32,413,575,613` |
| Wardrobe | `app/(tabs)/wardrobe.tsx:25,111,119,159,169,238` |
| Outfits | `app/(tabs)/outfits.tsx:113,310,312,334,419` |
| Add Item | `app/add-item.tsx:84,1321,1504,1521,1572` |
| Bulk Item Edit | `components/BulkItemEditPanel.tsx:53,307,368` |
| Bulk Review | `app/bulk-review.tsx:198,249` |
| Item Detail | `app/item-detail.tsx:208,243,245,260` |
| Choose 30 | `app/choose-30.tsx:149,153` |
| Blueprint | `app/blueprint.tsx:20,150` |
| Outfit Ideas | `app/outfit-ideas.tsx:25,48` |
| Diagnostics and gap suggestions | `constants/wardrobeDiagnostics.ts:34,259,344`; displayed in `app/diagnostics.tsx:80,98` |
| Multi-item Review | `app/multi-item-review.tsx:194` |
| Personal Intelligence | `app/personal-intelligence.tsx:28` |
| Wear Log | `app/wear-log.tsx:75,97` |
| Travel Planner | `components/TravelPlannerView.tsx:54,537` |

One further visible sentence was found during phase B:
`constants/wardrobeDiagnostics.ts:346`, “one piece of jewelry transforms a
look”, is now “one piece of jewellery transforms a look”. Its category label
also uses the display map.

The spelling reference “Personalized wardrobe blueprint” was not found in the
current app source. The matching `personaliz` scan results are internal
`profile-personalization` import paths; existing visible “personalised” copy
is already UK spelling.

## Engine-generated text

The Recommendation Engine v3.7 source and generated rationale were not edited.
The current rationale phrases in `constants/rationale.ts` already use UK
spelling (for example, “closely related colours” and “a calm colour family”).
Rationale is rendered in multiple places rather than at one shared render
choke-point, so no normaliser was added. Existing subtype vocabulary in
generated hero names is covered by the vocabulary rule below.

## Garment vocabulary retained

Per the Nigeria-market instruction, category, subtype, and garment-name labels
were not localised:

| Existing display term | Source / display path | Disposition |
|---|---|---|
| Sweater | `constants/blueprintSlots.ts:34` (“Fine-Knit Cream Sweater”); subtype chips render values at `app/add-item.tsx:1536-1544` | Retained |
| Sneakers | `constants/blueprintSlots.ts:51,220` (“White Minimalist Sneakers”, “White Classic Sneakers”); subtype chips render values at `app/add-item.tsx:1536-1544` | Retained |
| Pants | `constants/blueprintSlots.ts:80` (“Black Tailored Wide-Leg Pants”) | Retained |
| Vest | `constants/wardrobeBlueprint.ts:267` (outerwear subtype); the Add Item note is at `app/add-item.tsx:72` | Retained |
| Trousers | `constants/blueprintSlots.ts:37,78,206,248` and canonical subtype values | Already UK form; retained |
| Pants alias | `constants/wardrobeBlueprint.ts:331` maps the input alias to `trousers` | Internal canonicalisation only, not a displayed label |

“Jewellery” is the one displayed category spelling changed, following the
user’s explicit choice. The stored category remains `jewelry`.

## Mechanical search and dispositions

The scan traversed string literals, template literal segments (including
interpolated templates), and JSX text in `app/`, `components/`, and `server/`.
Counts below are regex match counts, not unique source files. Matches were
reviewed as visible copy, internal values/identifiers, or styling/API tokens.
Identifiers and comments are excluded from these counts by design; they are
not rendered copy and must not be renamed.
The Premium screen was included. `lib/revenuecat.ts` was additionally checked
for the same denylist; it contained no matching display strings.

| Denylist term | Matches | Disposition of every match |
|---|---:|---|
| `color` | 42 | 36 `@/constants/colors` import paths, 3 icon identifiers (`color-palette-outline` twice and `color-wand-outline` once), 1 stored `color-block` pattern value, and 2 classifier prompt/schema text segments. None is rendered spelling; unchanged. |
| `gray` | 0 | No source match. The display map still handles legacy stored `gray` values as “Grey”. |
| `personaliz` | 2 | Both are the `../shared/profile-personalization` import path in `app/index.tsx:20` and `app/onboarding.tsx:15`; internal path, unchanged. No “Personalized wardrobe blueprint” UI string exists in the scanned source. |
| `organiz` | 0 | No match. |
| `customiz` | 0 | No match. |
| `optimiz` | 0 | No American spelling match. The Travel Planner says “packing optimisation” (UK spelling). |
| `analyz` | 0 | No match. Visible “analyse/analysis” wording is already UK spelling. |
| `digitiz` | 0 | No match. |
| `favorit` | 0 | No match. Visible “favourites” wording is already UK spelling. |
| `jewelry` | 27 | 15 app/component references are stored category IDs, map lookup keys, or internal accessory-category values. The remaining 12 are classifier category/schema/prompt references in `server/classify-garment.ts` and `server/classify-multi-item.ts`. All remain unchanged; visible category output uses the presentation map. |
| `catalog` | 1 | The one match is “catalogue” in `components/TravelPlannerView.tsx:252`, already UK spelling. |
| `center` | 574 | 336 `alignItems`, 165 `justifyContent`, 62 `textAlign`, 9 `alignSelf` values, and 2 `'center' as const` style values. All are layout tokens, not prose; unchanged. |
| `fiber` | 0 | No match. |
| `neighbor` | 0 | No match. |
| `behavior` | 0 | No match. |
| `-ize` / `-ization` word endings | 51 | 33 `capitalize` text-transform values; 5 `resize-outline` icon names; 3 `image-resize` tokens; 3 `resize` operation tokens; 2 “Photo resize returned no image data” messages (`resize` is also UK spelling); 2 `profile-personalization` import paths; 1 `Content-Type, Authorization` header value; and 2 `size=` template attributes (a regex false positive). No US-only user-facing spelling remains in these matches. |

A supplementary search found no `license/licence`, `meter/metre`,
`liter/litre`, or `theater/theatre` strings in the scanned UI and server
sources.

## Files changed

Phase A (committed as `2a58de7`):

- `app/(tabs)/index.tsx`
- `app/add-item.tsx`
- `app/onboarding.tsx`
- `app/premium.tsx`
- `components/BulkItemEditPanel.tsx`

Phase B:

- `constants/wardrobeLabels.ts`
- `constants/wardrobeDiagnostics.ts`
- `app/(tabs)/index.tsx`
- `app/(tabs)/outfits.tsx`
- `app/(tabs)/wardrobe.tsx`
- `app/add-item.tsx`
- `app/blueprint.tsx`
- `app/bulk-review.tsx`
- `app/choose-30.tsx`
- `app/diagnostics.tsx`
- `app/item-detail.tsx`
- `app/outfit-ideas.tsx`
- `app/personal-intelligence.tsx`
- `app/wear-log.tsx`
- `components/BulkItemEditPanel.tsx`
- `components/TravelPlannerView.tsx`
- `__tests__/kenteStole.test.ts`
- `__tests__/wardrobeLabels.test.ts` (new)
- `reports/uk-spelling-sweep.md` (this report)

## Validation

- `npm test` — passed, 112 tests, 0 failures.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npx tsx __tests__/recommendation-golden-set.ts` — passed, 35/35.
- `node scripts/validate-africa-track-c.mjs` — passed, 100 sealed raw cases.
- `node scripts/validate-benchmark-fixtures.mjs` — passed, including all 53 frozen-file checksums.
- `git diff --check` — passed.

The suite logs expected simulated dependency/storage failures and existing
`react-test-renderer` deprecation warnings; these did not fail tests. The
preview reached the Expo QR launch page, but its browser console reported one
404 resource. This spelling sweep was not verified on a physical iOS or
Android device or with VoiceOver/TalkBack, and the signed-in screens were not
visually checked on-device.

## Deviations

- The Wardrobe Diagnostics jewellery sentence was found during phase B and
  corrected there alongside the presentation mapping.
- The spec’s example “Personalized wardrobe blueprint” was absent from the
  current source, so no corresponding copy change was made.
- No classifier/schema values, category IDs, subtype labels, Recommendation
  Engine v3.7 code, golden-set expectations, benchmark fixtures, frozen files,
  database/RLS, billing, or auth files were changed.
