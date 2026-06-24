/**
 * Unit tests for the data tables in constants/outfitScoring.ts that drive
 * the outfit scoring engine.
 *
 * Validates structural invariants so that a future domain-type change (adding
 * an OccasionTag or StyleGoal) surfaces as a named test failure rather than
 * a silent scoring gap.
 *
 * Covers:
 *   • SCENARIO_AFFINITY  — all OccasionTag keys present, each value is a
 *                          non-empty string array, no blank entries
 *   • STYLE_PREFERRED_COLORS — all StyleGoal keys present, non-empty arrays
 *   • STYLE_GOAL_SUBTYPES    — all StyleGoal keys present, non-empty Sets
 *
 * Run: `npx tsx __tests__/outfitScoringData.test.ts`
 * Exits non-zero on any failed assertion.
 */

import {
  SCENARIO_AFFINITY,
  STYLE_PREFERRED_COLORS,
  STYLE_GOAL_SUBTYPES,
} from '../constants/outfitScoring';

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

function section(name: string): void {
  console.log(`\n${name}:`);
}

// ── Canonical key sets (must stay in sync with types.ts) ──────────────────────

const OCCASION_TAGS: string[] = [
  'work', 'date-casual', 'date-dressy', 'casual', 'event',
  'interview', 'wedding', 'travel', 'brunch', 'active', 'resort', 'night-out',
];

const STYLE_GOALS: string[] = [
  'youthful', 'elevated', 'minimal', 'romantic', 'bold', 'classic',
];

// ── SCENARIO_AFFINITY ─────────────────────────────────────────────────────────

section('SCENARIO_AFFINITY — all OccasionTag keys present');
for (const tag of OCCASION_TAGS) {
  assert(
    tag in SCENARIO_AFFINITY,
    `SCENARIO_AFFINITY["${tag}"] exists`,
  );
}

section('SCENARIO_AFFINITY — no extra keys beyond OccasionTag');
{
  const knownTags = new Set(OCCASION_TAGS);
  for (const key of Object.keys(SCENARIO_AFFINITY)) {
    assert(
      knownTags.has(key),
      `SCENARIO_AFFINITY key "${key}" is a known OccasionTag`,
    );
  }
}

section('SCENARIO_AFFINITY — each value is a non-empty array with no blank entries');
for (const tag of OCCASION_TAGS) {
  const val = (SCENARIO_AFFINITY as Record<string, string[]>)[tag];
  assert(Array.isArray(val) && val.length > 0, `SCENARIO_AFFINITY["${tag}"] is non-empty`);
  assert(
    val.every(s => typeof s === 'string' && s.trim().length > 0),
    `SCENARIO_AFFINITY["${tag}"] has no blank sub-type entries`,
  );
}

section('SCENARIO_AFFINITY — no duplicate sub-types within a scenario');
for (const tag of OCCASION_TAGS) {
  const val = (SCENARIO_AFFINITY as Record<string, string[]>)[tag];
  const seen = new Set<string>();
  let dup = false;
  for (const s of val) {
    if (seen.has(s)) { dup = true; break; }
    seen.add(s);
  }
  assert(!dup, `SCENARIO_AFFINITY["${tag}"] has no duplicate sub-types`);
}

// ── STYLE_PREFERRED_COLORS ────────────────────────────────────────────────────

section('STYLE_PREFERRED_COLORS — all StyleGoal keys present');
for (const goal of STYLE_GOALS) {
  assert(
    goal in STYLE_PREFERRED_COLORS,
    `STYLE_PREFERRED_COLORS["${goal}"] exists`,
  );
}

section('STYLE_PREFERRED_COLORS — no extra keys beyond StyleGoal');
{
  const knownGoals = new Set(STYLE_GOALS);
  for (const key of Object.keys(STYLE_PREFERRED_COLORS)) {
    assert(
      knownGoals.has(key),
      `STYLE_PREFERRED_COLORS key "${key}" is a known StyleGoal`,
    );
  }
}

section('STYLE_PREFERRED_COLORS — each value is a non-empty colour array');
for (const goal of STYLE_GOALS) {
  const val = (STYLE_PREFERRED_COLORS as Record<string, string[]>)[goal];
  assert(Array.isArray(val) && val.length > 0, `STYLE_PREFERRED_COLORS["${goal}"] is non-empty`);
  assert(
    val.every(c => typeof c === 'string' && c.trim().length > 0),
    `STYLE_PREFERRED_COLORS["${goal}"] has no blank colour entries`,
  );
}

// ── STYLE_GOAL_SUBTYPES ───────────────────────────────────────────────────────

section('STYLE_GOAL_SUBTYPES — all StyleGoal keys present');
for (const goal of STYLE_GOALS) {
  assert(
    goal in STYLE_GOAL_SUBTYPES,
    `STYLE_GOAL_SUBTYPES["${goal}"] exists`,
  );
}

section('STYLE_GOAL_SUBTYPES — no extra keys beyond StyleGoal');
{
  const knownGoals = new Set(STYLE_GOALS);
  for (const key of Object.keys(STYLE_GOAL_SUBTYPES)) {
    assert(
      knownGoals.has(key),
      `STYLE_GOAL_SUBTYPES key "${key}" is a known StyleGoal`,
    );
  }
}

section('STYLE_GOAL_SUBTYPES — each value is a non-empty Set');
for (const goal of STYLE_GOALS) {
  const val = (STYLE_GOAL_SUBTYPES as Record<string, Set<string>>)[goal];
  assert(val instanceof Set && val.size > 0, `STYLE_GOAL_SUBTYPES["${goal}"] is a non-empty Set`);
  assert(
    [...val].every(s => typeof s === 'string' && s.trim().length > 0),
    `STYLE_GOAL_SUBTYPES["${goal}"] has no blank sub-type entries`,
  );
}

section('STYLE_GOAL_SUBTYPES — sub-types are a subset of known sub-types (spot-check)');
{
  const KNOWN_SUBTYPES = new Set([
    't-shirt', 'long-sleeve', 'polo-shirt', 'henley', 'rugby-shirt', 'tank-top', 'crop-top',
    'shirt', 'button-down', 'blouse', 'sweater', 'cardigan', 'turtleneck', 'knit-top', 'camisole',
    'hoodie', 'sweatshirt', 'sports-bra', 'sports-hoodie', 'rashguard', 'sequin-top', 'linen-set',
    'jeans', 'trousers', 'chinos', 'wide-leg', 'joggers', 'shorts', 'leggings',
    'mini-skirt', 'midi-skirt', 'maxi-skirt', 'pencil-skirt',
    'midi-dress', 'maxi-dress', 'mini-dress', 'wrap-dress', 'shirt-dress', 'cocktail-dress',
    'knit-dress', 'bodycon-dress', 'slip-dress', 'gown', 'sundress', 'resort-dress', 'cover-up', 'kaftan',
    'blazer', 'coat', 'peacoat', 'trench', 'jacket', 'bomber-jacket', 'leather-jacket', 'puffer',
    'raincoat', 'vest', 'denim-jacket', 'windbreaker',
    'sneakers', 'training-shoes', 'heels', 'pumps', 'stilettos', 'strappy-heels', 'block-heels',
    'flats', 'boots', 'ankle-boots', 'sandals', 'espadrilles', 'loafers', 'mules',
    'tote', 'crossbody', 'clutch', 'backpack', 'shoulder-bag', 'mini-bag',
    'gym-bag', 'wicker-bag', 'evening-bag', 'beach-bag',
    'necklace', 'earrings', 'bracelet', 'ring', 'watch', 'brooch',
    'statement-earrings', 'sunglasses', 'sunhat',
  ]);

  for (const goal of STYLE_GOALS) {
    const val = (STYLE_GOAL_SUBTYPES as Record<string, Set<string>>)[goal];
    for (const subType of val) {
      assert(
        KNOWN_SUBTYPES.has(subType),
        `STYLE_GOAL_SUBTYPES["${goal}"] sub-type "${subType}" is a known garment sub-type`,
      );
    }
  }
}

// ── Cross-check: STYLE_PREFERRED_COLORS vs STYLE_GOAL_SUBTYPES key parity ────

section('Cross-check — STYLE_PREFERRED_COLORS and STYLE_GOAL_SUBTYPES have identical key sets');
{
  const colorKeys = new Set(Object.keys(STYLE_PREFERRED_COLORS));
  const subtypeKeys = new Set(Object.keys(STYLE_GOAL_SUBTYPES));
  assert(
    colorKeys.size === subtypeKeys.size && [...colorKeys].every(k => subtypeKeys.has(k)),
    'STYLE_PREFERRED_COLORS and STYLE_GOAL_SUBTYPES share the same StyleGoal key set',
  );
}

// ── Exit ──────────────────────────────────────────────────────────────────────

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll outfitScoringData tests passed.');
}
