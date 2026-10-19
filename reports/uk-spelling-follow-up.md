# UK spelling follow-up: source scan gap

## Scope and method

Re-ran the denylist from `reports/uk-spelling-sweep.md` across runtime
TypeScript/JavaScript source in `app/`, `components/`, `server/`, `constants/`,
`contexts/`, `lib/`, and `shared/`. The scan reads string literals, template
literal segments, and JSX text; comments and bare identifiers are not counted.
Counts are regex occurrences, not unique files. A literal can contribute more
than one occurrence, and `personalization` is counted under both `personaliz`
and the `-ize/-ization` suffix rule.

The supplementary `server/templates/*.html` check examined rendered text and
accessibility/title/placeholder attributes (not CSS properties); it found no
denylist matches. Tests, dependencies, migrations, frozen golden/benchmark
fixtures, and developer-only scripts were excluded. Recommendation Engine v3.7
source was scanned read-only and not edited.

## Per-directory counts

| Source directory | `color` | `gray` | `personaliz` | `jewelry` | `catalog` | `center` | `-ize/-ization` | All other denylist terms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `app/` | 30 | 0 | 2 | 12 | 0 | 443 | 46 | 0 |
| `components/` | 16 | 0 | 0 | 3 | 1 | 133 | 4 | 0 |
| `server/` | 12 | 0 | 0 | 12 | 0 | 0 | 1 | 0 |
| `constants/` | 8 | 1 | 0 | 43 | 0 | 0 | 1 | 0 |
| `contexts/` | 7 | 0 | 3 | 0 | 0 | 0 | 5 | 0 |
| `lib/` | 3 | 0 | 0 | 0 | 0 | 0 | 8 | 0 |
| `shared/` | 1 | 0 | 0 | 0 | 0 | 0 | 2 | 0 |
| `server/templates/*.html` (rendered text/attributes) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| **Total occurrences** | **77** | **1** | **5** | **70** | **1** | **576** | **67** | **0** |

All other primary terms (`organiz`, `customiz`, `optimiz`, `analyz`,
`digitiz`, `favorit`, `fiber`, `neighbor`, `behavior`) and supplementary
variants (`license/licence`, `meter/metre`, `liter/litre`, `theater/theatre`)
had zero runtime-source matches.

## Disposition of matches

- **`color` — 77:** 44 module/asset path strings (36 `@/constants/colors`;
  7 color-perception/theory imports; 1 recommendation-image path), 3 icon
  identifiers, 13 field names (`colorFamily`, `accentColor`, `eyeColor`,
  `hairColor`), 7 stored styling/schema keys (`color-block`, `color-harmony`,
  `hair-color-interaction`), 9 classifier prompt/schema occurrences, and
  1 `colorful_bangles` image key. These are paths, identifiers, schema or
  stored values, not displayed spelling; retained unchanged. The two visible
  strings found in this pass—`constants/blueprintSlots.ts:275`
  “Colorful Resin Bangles” and `lib/profilePresentation.ts:29` “Eye Color”—
  were changed to “Colourful Resin Bangles” and “Eye Colour”. The first
  scan’s `colorful` display match is therefore absent from the final count;
  its asset key remains unchanged.
- **`gray` — 1:** `constants/wardrobeBlueprint.ts:415`, an input alias mapped
  to canonical `grey`; not UI copy and retained.
- **`personaliz` — 5:** three `profile-personalization` module paths
  (`app/index.tsx:20`, `app/onboarding.tsx:15`, `contexts/AppContext.tsx:174`)
  and two internal profile-dimension keys
  (`contexts/AppContext.tsx:226,2311`); retained.
- **`jewelry` — 70:** 58 category/subtype or lookup values across
  `app/(tabs)/index.tsx:32`, `app/(tabs)/outfits.tsx:113,206`,
  `app/(tabs)/wardrobe.tsx:22`, `app/add-item.tsx:87,485,1885`,
  `app/blueprint.tsx:20,33`, `app/outfit-ideas.tsx:25`,
  `components/BulkItemEditPanel.tsx:53` (two occurrences),
  `components/OOTDStoryCard.tsx:23`, `server/classify-garment.ts:6,388,549`,
  `constants/blueprintSlots.ts:57-59,98-100,142-144,154,184-186,196,
  226-228,273-275,286,295`, `constants/outfitGenerator.ts:134,302,317,330,376`,
  `constants/outfitRotation.ts:137,252`, `constants/outfitScoring.ts:515,938,
  974,1063,1457,1592`, `constants/types.ts:6`, `constants/wardrobeDiagnostics.ts:
  34,178,339,343,344`, and `constants/wardrobeLabels.ts:13`. Three
  `jewelry & accessories` matches are stored/display-map lookup keys in
  `app/(tabs)/wardrobe.tsx:25`, `app/add-item.tsx:87`, and
  `constants/wardrobeLabels.ts:5`. The remaining nine are classifier
  prompt/schema terms (`server/classify-garment.ts:678` and
  `server/classify-multi-item.ts:70`). Stored categories continue to render
  through the existing UK label map (`Jewellery` / `Jewellery & accessories`);
  no stored value or classifier schema was changed.
- **`catalog` — 1:** `components/TravelPlannerView.tsx:252` uses “wardrobe
  catalogue”, already UK spelling.
- **`center` — 576:** layout values only: `alignItems` 339,
  `justifyContent` 165, `textAlign` 62, and `alignSelf` 10. Not prose.
- **`-ize/-ization` — 67:** 33 `capitalize` text-transform values; 5
  `resize-outline` icon identifiers; 7 `image-resize` tokens; 5 `resize`
  operation names; 2 “Photo resize returned no image data” messages (`resize`
  is the same in UK English); 2 `size=` template attributes; 3
  `profile-personalization` paths; 1 `Content-Type, Authorization` API header;
  1 visible “mini size” use (`size` is not US-specific); 2
  `personalization` dimension keys; 1 internal “startup initialization
  timeout” error; 1 `startup_initialization` telemetry value; 2
  `Authorization` API/header values; and 2 `authorization` error-code
  identifiers. No other displayed US spelling remains in these matches.

## “Pants” / “Trousers” overlap

Before correction, `constants/blueprintSlots.ts:80` displayed
“Black Tailored Wide-Leg Pants” for `category: bottom`, `subType: wide-leg`.
These are all the `bottom` blueprint labels using “Pants” or “Trousers”:

| File and line | Display string | Category / subtype |
|---|---|---|
| `constants/blueprintSlots.ts:37` | “Straight-Leg Grey Trousers” | bottom / trousers |
| `constants/blueprintSlots.ts:39` | “White Wide-Leg Linen Trousers” | bottom / wide-leg |
| `constants/blueprintSlots.ts:78` | “Wide-Leg Navy Trousers” | bottom / trousers |
| `constants/blueprintSlots.ts:80` | “Black Tailored Wide-Leg Pants” → **“Black Tailored Wide-Leg Trousers”** | bottom / wide-leg |
| `constants/blueprintSlots.ts:122` | “High-Waist Wide-Leg Trousers” | bottom / wide-leg |
| `constants/blueprintSlots.ts:206` | “Dark Tailored Trousers” | bottom / trousers |
| `constants/blueprintSlots.ts:248` | “High-Waist Wide-Leg Camel Trousers” | bottom / wide-leg |

The four `wide-leg` entries above are the exact subtype matches. Lines 37, 78,
and 206 use the distinct `subType: trousers` despite one label also saying
“Wide-Leg”; they are included to expose the full same-category naming context.
The `imageKey: black_wide_leg_pants` and the `pants` → `trousers` canonical
alias in `constants/wardrobeBlueprint.ts:331` remain unchanged.

## Files changed

- `constants/blueprintSlots.ts` — corrected the black wide-leg hero and resin
  bangles labels; category, subtype, IDs, and image keys are unchanged.
- `lib/profilePresentation.ts` — “Eye Colour”.
- `__tests__/blueprint-slots.test.ts` and
  `__tests__/profilePresentation.test.ts` — assert the corrected labels.
- `TECHNICAL.md` — records this bounded display-only follow-up.
- `reports/uk-spelling-follow-up.md` — this scan and disposition report.

## Deviations and verification limits

The earlier report counted 42 `color` matches in `app/`, `components/`, and
`server/`; this occurrence-level rerun counts 58 there. The earlier summary
grouped classifier prompt/schema segments and omitted string-valued field names
such as `colorFamily`/`accentColor`; this report includes and dispositions
those occurrences individually. The previous 574 `center` count is now 576
because the current source has 339 `alignItems` and 10 `alignSelf` values; all
remain layout tokens. The `-ize` count remains 51 in those original three
directories, and `jewelry` remains 27. No device verification was performed;
the changes are display text only.

## Validation

- `npx tsx __tests__/profilePresentation.test.ts` — passed, 4/4.
- `npx tsx __tests__/blueprint-slots.test.ts` — passed, including the two new
  display-label assertions.
- `npm test` — passed, 114 tests, 0 failures.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npx tsx __tests__/recommendation-golden-set.ts` — passed, 35/35.
- `node scripts/validate-benchmark-fixtures.mjs` — passed; 53 frozen-file
  checksums and validation coverage passed.
- `git diff --check` — passed.

The full suite emitted non-failing `react-test-renderer` deprecation warnings
and expected fault-injection error logs from account-deletion tests. No
physical iOS/Android device verification was performed.
