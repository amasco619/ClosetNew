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
  VALID_SUBTYPES_BY_CATEGORY,
  VALID_COLOR_FAMILIES,
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

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${failed === 0 ? 'All' : failed + ' of'} test${failed === 1 ? '' : 's'} ${failed === 0 ? 'passed' : 'failed'}.`);
if (failed > 0) process.exit(1);
