/**
 * Unit tests for the garment classification parsing and validation logic.
 *
 * All tests run against exported helpers in server/classify-garment.ts —
 * no live Gemini API call is made; the handler path is exercised through
 * the exported `processGeminiResult` function which is what `classifyGarment`
 * delegates to after receiving the Gemini response.
 *
 * Covers:
 *   • processGeminiResult — the real handler parsing path:
 *       - valid subtype pass-through
 *       - invalid subtype → null
 *       - color family validation (valid / invalid → null)
 *       - accent color validation
 *       - warmthBand pass-through and rejection
 *       - rise, neckline, sleeveLength, fit, pattern, patternScale validation
 *       - fabric validation
 *       - modelConfidence clamping (>1 clamped, <0 clamped, default 0.7)
 *       - displayName fallback when missing
 *       - dominantRgb → dominantHsl/Lab computed correctly
 *       - dominantRgb out-of-range rejected (no HSL/Lab)
 *       - content_guardrail path (refused:true → GuardrailResult)
 *       - occasionTags and seasonTags derived via real inferOccasions/inferSeasonTags
 *   • inferOccasions  — subtype lookup, displayName override, fallback
 *   • inferSeasonTags — fabric lookup, subtype lookup, all-season fallback
 *   • inferWeight     — fabric → heavy / light / mid / undefined
 *   • buildDescription — color prefix logic, duplicate-color guard
 *   • rgbToHsl / rgbToLab — conversion sanity checks
 *
 * Run: `npx tsx __tests__/classifyGarment.test.ts`
 * Exits non-zero on any failed assertion.
 */

import {
  processGeminiResult,
  inferOccasions,
  inferSeasonTags,
  inferWeight,
  buildDescription,
  rgbToHsl,
  rgbToLab,
  validateDominantHsl,
  VALID_SUBTYPES_BY_CATEGORY,
  VALID_COLOR_FAMILIES,
  SERVER_FAMILY_CENTROID_HSL,
} from '../server/classify-garment';

// ── Assertion harness ─────────────────────────────────────────────────────────

let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (actual === expected) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
    failed++;
  }
}

function assertDeepEqual<T>(actual: T, expected: T, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    console.error(`    expected: ${e}`);
    console.error(`    actual:   ${a}`);
    failed++;
  }
}

// ── processGeminiResult — content_guardrail path ──────────────────────────────

console.log('\nprocessGeminiResult — guardrail:');

const guardrail = processGeminiResult({ refused: true, reason: 'Looks like a selfie.' });
assert('refused' in guardrail && (guardrail as any).refused === true, 'refused:true → GuardrailResult');
assertEq((guardrail as any).reason, 'Looks like a selfie.', 'GuardrailResult carries reason string');

const guardrailNoReason = processGeminiResult({ refused: true });
assertEq(
  (guardrailNoReason as any).reason,
  'This image could not be classified as a clothing item.',
  'guardrail with no reason → default message',
);

const notGuardrail = processGeminiResult({ category: 'top', subType: 't-shirt', colorFamily: 'black' });
assert(!('refused' in notGuardrail), 'refused:false (missing field) → ClassificationResult');

// ── processGeminiResult — valid subtype pass-through ─────────────────────────

console.log('\nprocessGeminiResult — valid subtype:');

{
  const r = processGeminiResult({ category: 'top', subType: 't-shirt', colorFamily: 'black' }) as any;
  assertEq(r.category, 'top', 'valid category "top" passes through');
  assertEq(r.subType, 't-shirt', 'valid subType "t-shirt" passes through');
  assertEq(r.source, 'gemini', 'source is always "gemini"');
}

{
  const r = processGeminiResult({ category: 'outerwear', subType: 'blazer', colorFamily: 'navy' }) as any;
  assertEq(r.subType, 'blazer', 'valid outerwear/blazer passes through');
  assertEq(r.colorFamily, 'navy', 'valid navy color passes through');
}

{
  const r = processGeminiResult({ category: 'shoes', subType: 'sneakers', colorFamily: 'white' }) as any;
  assertEq(r.subType, 'sneakers', 'valid shoes/sneakers passes through');
}

// ── processGeminiResult — invalid subtype → null ──────────────────────────────

console.log('\nprocessGeminiResult — invalid subtype → null:');

{
  const r = processGeminiResult({ category: 'top', subType: 'blazer', colorFamily: 'black' }) as any;
  assertEq(r.subType, null, 'top/blazer (wrong category) → subType null');
  assertEq(r.category, 'top', 'category still valid even when subType nulled');
}

{
  const r = processGeminiResult({ category: 'bottom', subType: 'trench', colorFamily: 'beige' }) as any;
  assertEq(r.subType, null, 'bottom/trench → null');
}

{
  const r = processGeminiResult({ category: 'top', subType: 'not-real', colorFamily: 'black' }) as any;
  assertEq(r.subType, null, 'completely unknown subType → null');
}

{
  const r = processGeminiResult({ category: 'not-a-category', subType: 't-shirt', colorFamily: 'black' }) as any;
  assertEq(r.category, null, 'unknown category → null');
  assertEq(r.subType, null, 'unknown category forces subType → null too');
}

// ── processGeminiResult — color family validation ─────────────────────────────

console.log('\nprocessGeminiResult — colorFamily validation:');

{
  const r = processGeminiResult({ category: 'top', subType: 't-shirt', colorFamily: 'purple' }) as any;
  assertEq(r.colorFamily, null, '"purple" not in set → colorFamily null');
}

{
  const r = processGeminiResult({ category: 'top', subType: 't-shirt', colorFamily: 'Navy' }) as any;
  assertEq(r.colorFamily, null, '"Navy" (title case) → colorFamily null (case-sensitive)');
}

{
  const r = processGeminiResult({ category: 'top', subType: 't-shirt', colorFamily: '' }) as any;
  assertEq(r.colorFamily, null, 'empty colorFamily → null');
}

// ── processGeminiResult — accentColor validation ──────────────────────────────

console.log('\nprocessGeminiResult — accentColor validation:');

{
  const r = processGeminiResult({
    category: 'top', subType: 'blouse', colorFamily: 'white', accentColor: 'navy',
  }) as any;
  assertEq(r.accentColor, 'navy', 'valid accentColor "navy" passes through');
}

{
  const r = processGeminiResult({
    category: 'top', subType: 'blouse', colorFamily: 'white', accentColor: 'turquoise',
  }) as any;
  assertEq(r.accentColor, undefined, '"turquoise" not in set → accentColor undefined');
}

{
  const r = processGeminiResult({
    category: 'top', subType: 'blouse', colorFamily: 'white',
  }) as any;
  assertEq(r.accentColor, undefined, 'absent accentColor → undefined');
}

// ── processGeminiResult — warmthBand validation ───────────────────────────────

console.log('\nprocessGeminiResult — warmthBand validation:');

for (const band of ['cold', 'cool', 'mild', 'warm', 'hot'] as const) {
  const r = processGeminiResult({
    category: 'outerwear', subType: 'coat', colorFamily: 'camel', warmthBand: band,
  }) as any;
  assertEq(r.warmthBand, band, `valid warmthBand "${band}" passes through`);
}

{
  const r = processGeminiResult({
    category: 'outerwear', subType: 'coat', colorFamily: 'camel', warmthBand: 'freezing',
  }) as any;
  assertEq(r.warmthBand, undefined, '"freezing" not in set → warmthBand undefined');
}

{
  const r = processGeminiResult({
    category: 'outerwear', subType: 'coat', colorFamily: 'camel', warmthBand: 'Cold',
  }) as any;
  assertEq(r.warmthBand, undefined, '"Cold" (title case) → warmthBand undefined (case-sensitive)');
}

{
  const r = processGeminiResult({
    category: 'outerwear', subType: 'coat', colorFamily: 'camel',
  }) as any;
  assertEq(r.warmthBand, undefined, 'absent warmthBand → undefined');
}

// ── processGeminiResult — sleeveLength, neckline, rise, fit, fabric ───────────

console.log('\nprocessGeminiResult — sleeveLength / neckline / rise / fit / fabric:');

{
  const r = processGeminiResult({
    category: 'top', subType: 'blouse', colorFamily: 'white',
    sleeveLength: 'long', neckline: 'v-neck', fit: 'tailored',
  }) as any;
  assertEq(r.sleeveLength, 'long', 'valid sleeveLength "long" passes through');
  assertEq(r.neckline, 'v-neck', 'valid neckline "v-neck" passes through');
  assertEq(r.fit, 'tailored', 'valid fit "tailored" passes through');
}

{
  const r = processGeminiResult({
    category: 'top', subType: 'blouse', colorFamily: 'white',
    sleeveLength: 'cap-sleeve', neckline: 'strapless',
  }) as any;
  assertEq(r.sleeveLength, undefined, '"cap-sleeve" not in set → sleeveLength undefined');
  assertEq(r.neckline, undefined, '"strapless" not in set → neckline undefined');
}

{
  const r = processGeminiResult({
    category: 'bottom', subType: 'trousers', colorFamily: 'black', rise: 'high',
  }) as any;
  assertEq(r.rise, 'high', 'valid rise "high" passes through');
}

{
  const r = processGeminiResult({
    category: 'bottom', subType: 'trousers', colorFamily: 'black', rise: 'ultra-high',
  }) as any;
  assertEq(r.rise, undefined, '"ultra-high" not in set → rise undefined');
}

{
  const r = processGeminiResult({
    category: 'top', subType: 't-shirt', colorFamily: 'black', fabric: 'cotton',
  }) as any;
  assertEq(r.fabric, 'cotton', 'valid fabric "cotton" passes through');
}

{
  const r = processGeminiResult({
    category: 'top', subType: 't-shirt', colorFamily: 'black', fabric: 'bamboo',
  }) as any;
  assertEq(r.fabric, undefined, '"bamboo" not in valid fabrics → fabric undefined');
}

// ── processGeminiResult — pattern and patternScale ────────────────────────────

console.log('\nprocessGeminiResult — pattern / patternScale:');

{
  const r = processGeminiResult({
    category: 'top', subType: 'blouse', colorFamily: 'pink',
    pattern: 'floral', patternScale: 'small',
  }) as any;
  assertEq(r.pattern, 'floral', 'valid pattern "floral" passes through');
  assertEq(r.patternScale, 'small', 'valid patternScale "small" passes through');
}

{
  const r = processGeminiResult({
    category: 'top', subType: 't-shirt', colorFamily: 'black',
    pattern: 'tartan', patternScale: 'tiny',
  }) as any;
  assertEq(r.pattern, undefined, '"tartan" not in set → pattern undefined');
  assertEq(r.patternScale, undefined, '"tiny" not in set → patternScale undefined');
}

// ── processGeminiResult — modelConfidence clamping ───────────────────────────

console.log('\nprocessGeminiResult — modelConfidence clamping:');

{
  const r = processGeminiResult({
    category: 'top', subType: 't-shirt', colorFamily: 'black', modelConfidence: 0.92,
  }) as any;
  assertEq(r.modelConfidence, 0.92, 'confidence 0.92 passes through unchanged');
}

{
  const r = processGeminiResult({
    category: 'top', subType: 't-shirt', colorFamily: 'black', modelConfidence: 1.5,
  }) as any;
  assertEq(r.modelConfidence, 1.0, 'confidence 1.5 clamped to 1.0');
}

{
  const r = processGeminiResult({
    category: 'top', subType: 't-shirt', colorFamily: 'black', modelConfidence: -0.2,
  }) as any;
  assertEq(r.modelConfidence, 0.0, 'confidence -0.2 clamped to 0.0');
}

{
  const r = processGeminiResult({
    category: 'top', subType: 't-shirt', colorFamily: 'black',
  }) as any;
  assertEq(r.modelConfidence, 0.7, 'missing confidence defaults to 0.7');
}

{
  const r = processGeminiResult({
    category: 'top', subType: 't-shirt', colorFamily: 'black', modelConfidence: 'high' as any,
  }) as any;
  assertEq(r.modelConfidence, 0.7, 'non-numeric confidence defaults to 0.7');
}

// ── processGeminiResult — displayName fallback ────────────────────────────────

console.log('\nprocessGeminiResult — displayName fallback:');

{
  const r = processGeminiResult({
    category: 'top', subType: 't-shirt', colorFamily: 'black',
    displayName: 'Black t-shirt',
  }) as any;
  assertEq(r.description, 'Black t-shirt', 'displayName starting with color → no prefix added');
}

{
  const r = processGeminiResult({
    category: 'bag', subType: 'tote', colorFamily: 'beige',
  }) as any;
  assert(r.description.toLowerCase().includes('bag') || r.description.toLowerCase().includes('tote'),
    'missing displayName → category/fallback used in description');
}

// ── processGeminiResult — dominantRgb → HSL / Lab ────────────────────────────

console.log('\nprocessGeminiResult — dominantRgb computation:');

{
  const r = processGeminiResult({
    category: 'top', subType: 't-shirt', colorFamily: 'black',
    dominantRgb: [0, 0, 0],
  }) as any;
  assert(r.dominantHsl !== undefined, 'valid dominantRgb [0,0,0] → dominantHsl defined');
  assert(r.dominantLab !== undefined, 'valid dominantRgb [0,0,0] → dominantLab defined');
  assertEq(Math.round(r.dominantHsl.l * 100), 0, 'black rgb → lightness 0');
  assert(Math.abs(r.dominantLab.L) < 1, 'black rgb → Lab L near 0');
}

{
  const r = processGeminiResult({
    category: 'top', subType: 't-shirt', colorFamily: 'white',
    dominantRgb: [255, 255, 255],
  }) as any;
  assertEq(Math.round(r.dominantHsl.l * 100), 100, 'white rgb → lightness 100');
  assert(Math.abs(r.dominantLab.L - 100) < 1, 'white rgb → Lab L near 100');
}

{
  const r = processGeminiResult({
    category: 'top', subType: 'blouse', colorFamily: 'navy',
    dominantRgb: [26, 42, 74],
  }) as any;
  assert(r.dominantHsl.h > 200 && r.dominantHsl.h < 240, 'navy rgb → hue in blue range');
  assert(r.dominantHsl.l < 0.25, 'navy rgb → low lightness');
}

// Out-of-range dominantRgb — handler must reject and not compute HSL/Lab
{
  const r = processGeminiResult({
    category: 'top', subType: 't-shirt', colorFamily: 'red',
    dominantRgb: [300, 0, 0],
  }) as any;
  assertEq(r.dominantHsl, undefined, 'out-of-range rgb [300,0,0] → dominantHsl undefined');
  assertEq(r.dominantLab, undefined, 'out-of-range rgb [300,0,0] → dominantLab undefined');
}

{
  const r = processGeminiResult({
    category: 'top', subType: 't-shirt', colorFamily: 'red',
    dominantRgb: [255, 0] as any,
  }) as any;
  assertEq(r.dominantHsl, undefined, 'incomplete rgb array → dominantHsl undefined');
}

{
  const r = processGeminiResult({
    category: 'top', subType: 't-shirt', colorFamily: 'red',
    dominantRgb: ['FF', '00', '00'] as any,
  }) as any;
  assertEq(r.dominantHsl, undefined, 'string rgb values → dominantHsl undefined');
}

// ── processGeminiResult — occasionTags and seasonTags via real inference ───────

console.log('\nprocessGeminiResult — occasionTags / seasonTags integration:');

{
  const r = processGeminiResult({
    category: 'outerwear', subType: 'blazer', colorFamily: 'navy', fabric: 'wool',
  }) as any;
  assert(Array.isArray(r.occasionTags), 'occasionTags is an array');
  assert(r.occasionTags.includes('work'), 'blazer → occasionTags includes "work"');
  assert(r.occasionTags.includes('interview'), 'blazer → occasionTags includes "interview"');
  // fabric=wool → fall/winter
  assertDeepEqual(r.seasonTags, ['fall', 'winter'], 'wool fabric → fall/winter seasonTags');
}

{
  const r = processGeminiResult({
    category: 'bottom', subType: 'shorts', colorFamily: 'beige', fabric: 'linen',
  }) as any;
  assert(r.occasionTags.includes('casual'), 'shorts → occasionTags includes casual');
  // fabric=linen beats subtype
  assertDeepEqual(r.seasonTags, ['spring', 'summer'], 'linen fabric beats shorts subtype for season');
}

{
  const r = processGeminiResult({
    category: 'shoes', subType: 'sneakers', colorFamily: 'white',
  }) as any;
  assertDeepEqual(r.seasonTags, ['all-season'], 'sneakers + no fabric → all-season');
}

// ── processGeminiResult — weight via real inferWeight ─────────────────────────

console.log('\nprocessGeminiResult — weight inference:');

{
  const r = processGeminiResult({
    category: 'outerwear', subType: 'coat', colorFamily: 'camel', fabric: 'wool',
  }) as any;
  assertEq(r.weight, 'heavy', 'wool → weight heavy');
}

{
  const r = processGeminiResult({
    category: 'top', subType: 'blouse', colorFamily: 'pink', fabric: 'chiffon',
  }) as any;
  assertEq(r.weight, 'light', 'chiffon → weight light');
}

{
  const r = processGeminiResult({
    category: 'top', subType: 't-shirt', colorFamily: 'black', fabric: 'cotton',
  }) as any;
  assertEq(r.weight, 'mid', 'cotton → weight mid');
}

{
  const r = processGeminiResult({
    category: 'top', subType: 't-shirt', colorFamily: 'black',
  }) as any;
  assertEq(r.weight, undefined, 'no fabric → weight undefined');
}

// ── inferOccasions (pure helper) ──────────────────────────────────────────────

console.log('\ninferOccasions:');

assertDeepEqual(
  inferOccasions('blazer', 'Blazer'),
  ['work', 'event', 'date-dressy', 'interview'],
  'blazer subtype → work/event/date-dressy/interview',
);

assertDeepEqual(
  inferOccasions('t-shirt', 'T-Shirt'),
  ['casual'],
  't-shirt subtype → casual',
);

assertDeepEqual(
  inferOccasions('sneakers', 'Sneakers'),
  ['casual', 'active'],
  'sneakers subtype → casual/active',
);

assertDeepEqual(
  inferOccasions('shirt', 'Dress shirt'),
  ['work', 'date-dressy', 'event', 'interview'],
  'displayName "Dress shirt" overrides generic shirt subtype',
);

assertDeepEqual(
  inferOccasions(null, 'Unknown Item'),
  ['casual'],
  'null subtype + no override → fallback casual',
);

// ── inferSeasonTags (pure helper) ─────────────────────────────────────────────

console.log('\ninferSeasonTags:');

assertDeepEqual(inferSeasonTags(null, 'linen'), ['spring', 'summer'], 'linen → spring/summer');
assertDeepEqual(inferSeasonTags(null, 'wool'), ['fall', 'winter'], 'wool → fall/winter');
assertDeepEqual(inferSeasonTags('tank-top', 'wool'), ['fall', 'winter'], 'wool beats tank-top subtype');
assertDeepEqual(inferSeasonTags('tank-top', null), ['spring', 'summer'], 'tank-top → spring/summer');
assertDeepEqual(inferSeasonTags(null, null), ['all-season'], 'no subtype, no fabric → all-season');
assertDeepEqual(inferSeasonTags(null, 'denim'), ['all-season'], 'denim → all-season');

// ── inferWeight (pure helper) ─────────────────────────────────────────────────

console.log('\ninferWeight:');

assert(inferWeight('wool') === 'heavy', 'wool → heavy');
assert(inferWeight('cashmere') === 'heavy', 'cashmere → heavy');
assert(inferWeight('leather') === 'heavy', 'leather → heavy');
assert(inferWeight('velvet') === 'heavy', 'velvet → heavy');
assert(inferWeight('tweed') === 'heavy', 'tweed → heavy');
assert(inferWeight('suede') === 'heavy', 'suede → heavy');
assert(inferWeight('silk') === 'light', 'silk → light');
assert(inferWeight('satin') === 'light', 'satin → light');
assert(inferWeight('linen') === 'light', 'linen → light');
assert(inferWeight('chiffon') === 'light', 'chiffon → light');
assert(inferWeight('cotton') === 'mid', 'cotton → mid');
assert(inferWeight('denim') === 'mid', 'denim → mid');
assert(inferWeight(null) === undefined, 'null → undefined');
assert(inferWeight(undefined) === undefined, 'undefined → undefined');

// ── buildDescription (pure helper) ───────────────────────────────────────────

console.log('\nbuildDescription:');

assertEq(buildDescription('Blazer', 'navy'), 'Navy blazer', '"Blazer" + navy → "Navy blazer"');
assertEq(buildDescription('Trench coat', 'beige'), 'Beige trench coat', '"Trench coat" + beige → prefix added');
assertEq(buildDescription('Green midi dress', 'green'), 'Green midi dress', 'displayName starts with color → no doubling');
assertEq(buildDescription('Blouse', null), 'Blouse', 'null colorFamily → unchanged');

// ── VALID_SUBTYPES_BY_CATEGORY — structural integrity ─────────────────────────

console.log('\nVALID_SUBTYPES_BY_CATEGORY structural integrity:');

for (const cat of ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'jewelry']) {
  assert(
    Array.isArray(VALID_SUBTYPES_BY_CATEGORY[cat]) && VALID_SUBTYPES_BY_CATEGORY[cat].length > 0,
    `VALID_SUBTYPES_BY_CATEGORY["${cat}"] is a non-empty array`,
  );
}

// ── VALID_COLOR_FAMILIES — membership checks ───────────────────────────────────

console.log('\nVALID_COLOR_FAMILIES membership:');

for (const c of ['black', 'white', 'navy', 'beige', 'burgundy', 'lavender']) {
  assert(VALID_COLOR_FAMILIES.has(c), `"${c}" is in VALID_COLOR_FAMILIES`);
}

for (const c of ['Purple', 'turquoise', 'hot-pink', '', 'magenta']) {
  assert(!VALID_COLOR_FAMILIES.has(c), `"${c}" is NOT in VALID_COLOR_FAMILIES`);
}

// ── rgbToHsl (pure helper) ─────────────────────────────────────────────────────

console.log('\nrgbToHsl:');

{
  const r = rgbToHsl(0, 0, 0);
  assertEq(Math.round(r.l * 100), 0, 'black → lightness 0');
  assertEq(Math.round(r.s * 100), 0, 'black → saturation 0');
}
{
  const r = rgbToHsl(255, 255, 255);
  assertEq(Math.round(r.l * 100), 100, 'white → lightness 100');
}
{
  const r = rgbToHsl(255, 0, 0);
  assertEq(Math.round(r.h), 0, 'red → hue 0');
  assert(r.s > 0.9, 'red → high saturation');
}

// ── rgbToLab (pure helper) ────────────────────────────────────────────────────

console.log('\nrgbToLab:');

{
  const r = rgbToLab(0, 0, 0);
  assert(Math.abs(r.L) < 1, 'black → L near 0');
}
{
  const r = rgbToLab(255, 255, 255);
  assert(Math.abs(r.L - 100) < 1, 'white → L near 100');
}
{
  const r = rgbToLab(255, 0, 0);
  assert(r.L > 30 && r.L < 60, 'red → L in mid range');
  assert(r.a > 50, 'red → positive a (redness)');
}

// ── processGeminiResult — edge cases ─────────────────────────────────────────

console.log('\nprocessGeminiResult — edge cases:');

// Empty result {} — must not crash and must return a non-null object
{
  let threw = false;
  let result: any;
  try {
    result = processGeminiResult({} as any);
  } catch {
    threw = true;
  }
  assert(!threw, 'empty {} → no crash');
  assert(typeof result === 'object' && result !== null, 'empty {} → non-null object returned');
  assert(
    !('refused' in result && result.refused === true),
    'empty {} → not treated as a guardrail refusal',
  );
  assert(
    result.modelConfidence === undefined ||
    (typeof result.modelConfidence === 'number' && result.modelConfidence >= 0 && result.modelConfidence <= 1),
    'empty {} → modelConfidence is undefined or in [0,1]',
  );
}

// null subType — must not crash, subType should be null
{
  let threw = false;
  let result: any;
  try {
    result = processGeminiResult({ subType: null } as any);
  } catch {
    threw = true;
  }
  assert(!threw, 'null subType → no crash');
  assert(
    result.subType === null || result.subType === undefined,
    `null subType input → subType is null/undefined (got ${JSON.stringify(result?.subType)})`,
  );
}

// refused:true with empty reason — must return guardrail result
{
  const result = processGeminiResult({ refused: true, reason: '' } as any);
  assert(
    'refused' in result && (result as any).refused === true,
    'refused:true → guardrail result',
  );
}

// refused:false should NOT be treated as guardrail
{
  const result = processGeminiResult({ refused: false, category: 'top', subType: 't-shirt' } as any);
  assert(
    !('refused' in result && (result as any).refused === true),
    'refused:false → not a guardrail result',
  );
}

// subType from wrong category — should treat as invalid for the given category
{
  let threw = false;
  let result: any;
  try {
    result = processGeminiResult({ category: 'shoes', subType: 't-shirt' } as any);
  } catch {
    threw = true;
  }
  assert(!threw, 'subType from wrong category → no crash');
  // t-shirt is a top subType, not a shoes subType — should be rejected
  assert(
    result.subType === null || result.subType !== 't-shirt',
    `mismatched subType/category → subType is null or sanitised (got ${JSON.stringify(result?.subType)})`,
  );
}

// modelConfidence exactly at boundary values 0 and 1
{
  const r0 = processGeminiResult({ category: 'top', subType: 't-shirt', modelConfidence: 0 } as any) as any;
  assert(typeof r0 === 'object', 'modelConfidence=0 → no crash');

  const r1 = processGeminiResult({ category: 'top', subType: 't-shirt', modelConfidence: 1 } as any) as any;
  assert(typeof r1 === 'object', 'modelConfidence=1 → no crash');
  if (!('refused' in r1)) {
    assert(
      typeof r1.modelConfidence === 'number' && r1.modelConfidence >= 0 && r1.modelConfidence <= 1,
      `modelConfidence=1 stays in [0,1] (got ${r1.modelConfidence})`,
    );
  }
}

// ── SERVER_FAMILY_CENTROID_HSL ↔ VALID_COLOR_FAMILIES sync ───────────────────
// These two sets must always contain exactly the same keys.  If a new colour
// family is added to VALID_COLOR_FAMILIES but not to SERVER_FAMILY_CENTROID_HSL
// (or vice-versa), the RGB-validation path silently falls back and outfit
// colour scoring becomes unreliable.
{
  const centroidKeys = Object.keys(SERVER_FAMILY_CENTROID_HSL).sort();
  const validKeys    = [...VALID_COLOR_FAMILIES].sort();

  const missingFromCentroid = validKeys.filter(k => !SERVER_FAMILY_CENTROID_HSL[k]);
  const extraInCentroid     = centroidKeys.filter(k => !VALID_COLOR_FAMILIES.has(k));

  assert(
    missingFromCentroid.length === 0,
    `SERVER_FAMILY_CENTROID_HSL covers every VALID_COLOR_FAMILIES key (missing: ${missingFromCentroid.join(', ') || 'none'})`,
  );
  assert(
    extraInCentroid.length === 0,
    `SERVER_FAMILY_CENTROID_HSL has no extra keys not in VALID_COLOR_FAMILIES (extra: ${extraInCentroid.join(', ') || 'none'})`,
  );
}

// ── validateDominantHsl — unit tests ─────────────────────────────────────────
// Tests for the RGB/colorFamily consistency guard that prevents background-
// contaminated pixels from corrupting outfit colour scoring.

console.log('\nvalidateDominantHsl — unit tests:');

// 1. Valid chromatic RGB matching its colorFamily → returned as-is, not corrected
{
  // Blue centroid is h:215. An HSL of h:210 is only 5° away → well within the 40° threshold.
  const blueHsl = { h: 210, s: 0.65, l: 0.50 };
  const { hsl, corrected } = validateDominantHsl(blueHsl, 'blue');
  assert(!corrected, 'blue hsl h=210 (5° from centroid 215) → not corrected');
  assert(hsl.h === blueHsl.h && hsl.s === blueHsl.s && hsl.l === blueHsl.l,
    'blue hsl h=210 → original hsl returned unchanged');
}

// 2. Chromatic RGB whose hue is > 40° from stated colorFamily → corrected to centroid
{
  // Stated "red" (centroid h:0). An HSL of h:120 (green) is 120° away → must correct.
  const greenHsl = { h: 120, s: 0.70, l: 0.45 };
  const { hsl, corrected } = validateDominantHsl(greenHsl, 'red');
  assert(corrected, 'green hsl (h=120) with colorFamily "red" → corrected');
  const redCentroid = SERVER_FAMILY_CENTROID_HSL['red'];
  assert(hsl.h === redCentroid.h && hsl.s === redCentroid.s && hsl.l === redCentroid.l,
    'corrected hsl equals red centroid');
}

{
  // Stated "navy" (centroid h:220). An HSL of h:60 (yellow) is 160° away → must correct.
  const yellowHsl = { h: 60, s: 0.90, l: 0.60 };
  const { hsl, corrected } = validateDominantHsl(yellowHsl, 'navy');
  assert(corrected, 'yellow hsl (h=60) with colorFamily "navy" → corrected');
  const navyCentroid = SERVER_FAMILY_CENTROID_HSL['navy'];
  assert(hsl.h === navyCentroid.h, 'corrected hsl.h equals navy centroid h');
}

// 3. Achromatic family + high-saturation RGB → corrected (background contamination)
{
  // "black" but sampled pixel is saturated teal (s=0.7 > threshold 0.25) → correct.
  const tealHsl = { h: 175, s: 0.70, l: 0.08 };
  const { hsl, corrected } = validateDominantHsl(tealHsl, 'black');
  assert(corrected, 'achromatic "black" + high-sat hsl (s=0.7) → corrected');
  const blackCentroid = SERVER_FAMILY_CENTROID_HSL['black'];
  assert(hsl.l === blackCentroid.l, 'corrected to black centroid lightness');
}

{
  // "white" with a vivid red contamination (s=0.8 > 0.25) → correct.
  const redHsl = { h: 0, s: 0.80, l: 0.96 };
  const { hsl, corrected } = validateDominantHsl(redHsl, 'white');
  assert(corrected, 'achromatic "white" + high-sat red hsl → corrected');
  const whiteCentroid = SERVER_FAMILY_CENTROID_HSL['white'];
  assert(hsl.s === whiteCentroid.s, 'corrected to white centroid saturation (0)');
}

{
  // "grey" with vivid blue contamination (s=0.6 > 0.25) → correct.
  const blueHsl2 = { h: 210, s: 0.60, l: 0.55 };
  const { corrected } = validateDominantHsl(blueHsl2, 'grey');
  assert(corrected, 'achromatic "grey" + high-sat hsl → corrected');
}

// 4. Achromatic family + low-saturation RGB → returned as-is (lightness preserved)
{
  // "black" with a near-neutral dark grey (s=0.10 < 0.25) → keep original.
  const darkGrey = { h: 200, s: 0.10, l: 0.07 };
  const { hsl, corrected } = validateDominantHsl(darkGrey, 'black');
  assert(!corrected, 'achromatic "black" + low-sat hsl (s=0.10) → not corrected');
  assert(hsl.l === darkGrey.l, 'original lightness preserved (not snapped to centroid)');
}

{
  // "white" with very low saturation (s=0.05 < 0.25) → keep original lightness.
  const nearWhite = { h: 30, s: 0.05, l: 0.94 };
  const { hsl, corrected } = validateDominantHsl(nearWhite, 'white');
  assert(!corrected, 'achromatic "white" + low-sat (s=0.05) → not corrected');
  assert(hsl.l === nearWhite.l, 'original lightness 0.94 preserved');
}

{
  // "grey" with saturation exactly at the threshold (0.25) — boundary is exclusive (>), so 0.25 is NOT corrected.
  const atThreshold = { h: 0, s: 0.25, l: 0.55 };
  const { corrected } = validateDominantHsl(atThreshold, 'grey');
  assert(!corrected, 'achromatic "grey" + s=0.25 (at threshold, not over) → not corrected');
}

// 5. Colours near the 40° boundary — just inside and just outside
{
  // "green" centroid h:140. hue 179 is 39° away → must NOT be corrected (< 40°).
  const nearBoundaryInside = { h: 179, s: 0.50, l: 0.40 };
  const { corrected: c1 } = validateDominantHsl(nearBoundaryInside, 'green');
  assert(!c1, 'hue 39° from green centroid (140) → NOT corrected (within 40° threshold)');
}

{
  // "green" centroid h:140. hue 181 is 41° away → must be corrected (> 40°).
  const nearBoundaryOutside = { h: 181, s: 0.50, l: 0.40 };
  const { corrected: c2 } = validateDominantHsl(nearBoundaryOutside, 'green');
  assert(c2, 'hue 41° from green centroid (140) → corrected (over 40° threshold)');
}

{
  // Test the wraparound: "red" centroid h:0 / 360. hue 330 is 30° away (wraps) → NOT corrected.
  const nearRedWrap = { h: 330, s: 0.80, l: 0.45 };
  const { corrected: c3 } = validateDominantHsl(nearRedWrap, 'red');
  assert(!c3, 'hue 330° is 30° from red centroid (wrap-around) → NOT corrected');
}

{
  // "red" centroid h:0. hue 45 is 45° away → corrected.
  const farFromRed = { h: 45, s: 0.80, l: 0.50 };
  const { corrected: c4 } = validateDominantHsl(farFromRed, 'red');
  assert(c4, 'hue 45° from red centroid → corrected');
}

// 6. null colorFamily → no correction, original hsl returned
{
  const anyHsl = { h: 90, s: 0.80, l: 0.50 };
  const { hsl, corrected } = validateDominantHsl(anyHsl, null);
  assert(!corrected, 'null colorFamily → no correction applied');
  assert(hsl.h === anyHsl.h, 'null colorFamily → original hsl.h returned');
}

// 6b. Unknown colorFamily (not in SERVER_FAMILY_CENTROID_HSL) → no correction
{
  const anyHsl = { h: 90, s: 0.80, l: 0.50 };
  const { hsl, corrected } = validateDominantHsl(anyHsl, 'purple');
  assert(!corrected, 'unknown colorFamily "purple" → no correction');
  assert(hsl.h === anyHsl.h, 'unknown colorFamily → original hsl returned');
}

// ── processGeminiResult — colour contamination integration tests ───────────────
// These verify that dominantHsl/dominantLab in the output are consistent with
// colorFamily even when dominantRgb is clearly contaminated.

console.log('\nprocessGeminiResult — background-contamination integration:');

{
  // Contamination scenario: navy garment, but sampled RGB is green (background).
  // Pixel: [0, 200, 80] → hue ~150 (green), 70° from navy centroid 220 → must correct.
  const r = processGeminiResult({
    category: 'top', subType: 'blouse', colorFamily: 'navy',
    dominantRgb: [0, 200, 80],
  }) as any;
  assert(r.dominantHsl !== undefined, 'contaminated navy: dominantHsl still defined after correction');
  assert(r.dominantLab !== undefined, 'contaminated navy: dominantLab still defined after correction');
  const navyCentroid = SERVER_FAMILY_CENTROID_HSL['navy'];
  // After correction the hsl must equal the navy centroid
  assert(
    Math.abs(r.dominantHsl.h - navyCentroid.h) < 1,
    `contaminated navy: dominantHsl.h corrected to navy centroid (~${navyCentroid.h}°), got ${r.dominantHsl.h.toFixed(1)}°`,
  );
  assert(r.dominantHsl.l < 0.30, 'contaminated navy: corrected dominantHsl.l is dark (< 0.30)');
  // colorFamily label must not be changed
  assert(r.colorFamily === 'navy', 'contaminated navy: colorFamily label unchanged');
}

{
  // Contamination scenario: "black" garment, but sampled pixel is bright cyan (background).
  // Pixel: [0, 220, 200] → very high saturation → must correct to black centroid.
  const r = processGeminiResult({
    category: 'bottom', subType: 'trousers', colorFamily: 'black',
    dominantRgb: [0, 220, 200],
  }) as any;
  assert(r.dominantHsl !== undefined, 'contaminated black: dominantHsl defined');
  const blackCentroid = SERVER_FAMILY_CENTROID_HSL['black'];
  assert(
    Math.abs(r.dominantHsl.l - blackCentroid.l) < 0.05,
    `contaminated black: dominantHsl.l corrected to black centroid (~${blackCentroid.l}), got ${r.dominantHsl.l.toFixed(3)}`,
  );
  assert(r.colorFamily === 'black', 'contaminated black: colorFamily label unchanged');
}

{
  // Contamination scenario: "white" garment, near-neutral light grey pixel (s=0.08 < 0.25).
  // Low saturation → NOT corrected; original lightness must be preserved.
  const r = processGeminiResult({
    category: 'top', subType: 'blouse', colorFamily: 'white',
    dominantRgb: [248, 245, 240],  // warm near-white: s is low
  }) as any;
  assert(r.dominantHsl !== undefined, 'near-neutral white: dominantHsl defined');
  // The original lightness should be preserved (close to the raw conversion)
  const rawHsl = rgbToHsl(248, 245, 240);
  assert(
    Math.abs(r.dominantHsl.l - rawHsl.l) < 0.02,
    `near-neutral white: lightness preserved (raw ${rawHsl.l.toFixed(3)}, got ${r.dominantHsl.l.toFixed(3)})`,
  );
}

{
  // Contamination scenario: "red" garment, but dominantRgb is clearly blue (background).
  // Pixel: [30, 80, 200] → hue ~220 (blue), 140°+ from red centroid 0 → must correct.
  const r = processGeminiResult({
    category: 'dress', subType: 'mini-dress', colorFamily: 'red',
    dominantRgb: [30, 80, 200],
  }) as any;
  const redCentroid = SERVER_FAMILY_CENTROID_HSL['red'];
  assert(r.dominantHsl !== undefined, 'contaminated red: dominantHsl defined');
  assert(
    Math.abs(r.dominantHsl.h - redCentroid.h) < 1,
    `contaminated red: dominantHsl.h corrected to red centroid (${redCentroid.h}°), got ${r.dominantHsl.h.toFixed(1)}°`,
  );
}

{
  // Clean scenario: "green" garment with a genuinely green pixel (h~140, 5° from centroid).
  // dominantRgb should NOT be corrected; Lab is derived from the original RGB.
  const r = processGeminiResult({
    category: 'top', subType: 't-shirt', colorFamily: 'green',
    dominantRgb: [50, 160, 80],   // hue ~135, close to green centroid 140
  }) as any;
  assert(r.dominantHsl !== undefined, 'clean green: dominantHsl defined');
  const greenCentroid = SERVER_FAMILY_CENTROID_HSL['green'];
  assert(
    Math.abs(r.dominantHsl.h - 135) < 10,
    `clean green: dominantHsl.h near original (~135°), not snapped to centroid (${greenCentroid.h}°), got ${r.dominantHsl.h.toFixed(1)}°`,
  );
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${failed === 0 ? 'All' : failed + ' of'} test${failed === 1 ? '' : 's'} ${failed === 0 ? 'passed' : 'failed'}.`);
if (failed > 0) process.exit(1);
