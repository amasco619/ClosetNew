/**
 * Regression tests for computeDiagnostics in constants/wardrobeDiagnostics.ts.
 *
 * Covers three scenarios called out in the task:
 *   1. Overall health score for a well-balanced wardrobe
 *   2. Penalty for a category-missing wardrobe
 *   3. Category balance analysis output shape
 *
 * Run: `npx tsx __tests__/wardrobeDiagnostics.test.ts`
 * Exits non-zero on any failed assertion.
 */

import { computeDiagnostics } from '../constants/wardrobeDiagnostics';
import type { WardrobeItem, UserProfile } from '../constants/types';
import type { WardrobeSlot } from '../constants/wardrobeBlueprint';

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

// ── Factory helpers ───────────────────────────────────────────────────────────

function makeItem(overrides: Partial<WardrobeItem> & { id: string }): WardrobeItem {
  return {
    photoUri: '',
    category: 'top',
    subType: 'blouse',
    colorFamily: 'black',
    occasionTags: [],
    seasonTags: ['all-season'],
    formalityLevel: 3,
    createdAt: '2026-01-01',
    ...overrides,
  };
}

const BASE_PROFILE: UserProfile = {
  name: 'Test',
  bodyType: null,
  eyeColor: null,
  skinTone: null,
  undertone: null,
  styleGoalPrimary: 'classic',
  styleGoalSecondary: null,
  lifestyleWork: 40,
  lifestyleCasual: 40,
  lifestyleEvents: 10,
  lifestyleActive: 5,
  lifestyleBrunch: 5,
  constraints: { noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'any' },
  onboardingComplete: true,
};

function makeSlot(id: string, status: 'owned' | 'needed'): WardrobeSlot {
  return {
    id,
    category: 'top',
    subType: 'blouse',
    colorFamily: 'black',
    priority: 1,
    label: 'Classic Blouse',
    description: 'A versatile blouse',
    sampleImage: 0 as any,
    status,
  };
}

// ── Test suites ───────────────────────────────────────────────────────────────

console.log('\n=== wardrobeDiagnostics — well-balanced wardrobe ===\n');
{
  // Build a wardrobe with at least one item in every category plus enough
  // variety for a good score across all dimensions.
  const items: WardrobeItem[] = [
    // tops (3)
    makeItem({ id: 't1', category: 'top', subType: 'blouse',    colorFamily: 'black',  occasionTags: ['work', 'casual'], formalityLevel: 4 }),
    makeItem({ id: 't2', category: 'top', subType: 't-shirt',   colorFamily: 'white',  occasionTags: ['casual'],         formalityLevel: 2 }),
    makeItem({ id: 't3', category: 'top', subType: 'sweater',   colorFamily: 'beige',  occasionTags: ['casual', 'work'], formalityLevel: 3 }),
    // bottoms (2)
    makeItem({ id: 'b1', category: 'bottom', subType: 'trousers',   colorFamily: 'navy',   occasionTags: ['work'],   formalityLevel: 4 }),
    makeItem({ id: 'b2', category: 'bottom', subType: 'jeans',       colorFamily: 'blue',   occasionTags: ['casual'], formalityLevel: 2 }),
    // dress (1)
    makeItem({ id: 'd1', category: 'dress', subType: 'midi-dress',   colorFamily: 'black',  occasionTags: ['event', 'date-dressy'], formalityLevel: 5 }),
    // outerwear (1)
    makeItem({ id: 'o1', category: 'outerwear', subType: 'blazer',   colorFamily: 'black',  occasionTags: ['work', 'event'],        formalityLevel: 5 }),
    // shoes (1)
    makeItem({ id: 's1', category: 'shoes', subType: 'heels',        colorFamily: 'black',  occasionTags: ['work', 'event'],        formalityLevel: 5 }),
    // bag (1)
    makeItem({ id: 'g1', category: 'bag', subType: 'tote',           colorFamily: 'beige',  occasionTags: ['work', 'casual'],       formalityLevel: 3 }),
    // jewelry (1)
    makeItem({ id: 'j1', category: 'jewelry', subType: 'earrings',   colorFamily: 'gold',   occasionTags: ['work', 'event'],        formalityLevel: 4 }),
  ];

  const slots = [makeSlot('sl1', 'owned'), makeSlot('sl2', 'owned'), makeSlot('sl3', 'needed')];
  const result = computeDiagnostics(items, BASE_PROFILE, slots);

  assert(result.totalItems === 10, `totalItems === 10 (got ${result.totalItems})`);
  assert(result.overallScore > 0,  `overallScore > 0 (got ${result.overallScore})`);
  assert(result.overallScore <= 100, `overallScore <= 100 (got ${result.overallScore})`);
  assert(['A','B','C','D','F'].includes(result.grade), `grade is a valid letter (got ${result.grade})`);
  assert(result.interpretation.length > 0, 'interpretation is non-empty');

  // A fully-populated wardrobe (all 7 categories represented) should score at
  // least a C (≥55) — no missing-category penalty applies.
  assert(result.overallScore >= 55, `well-balanced wardrobe scores ≥ 55 (got ${result.overallScore})`);
  assert(['A','B','C'].includes(result.grade), `well-balanced wardrobe grades A/B/C (got ${result.grade})`);
}

console.log('\n=== wardrobeDiagnostics — category-missing penalty ===\n');
{
  // Wardrobe with only tops and bottoms — five categories completely absent.
  const items: WardrobeItem[] = [
    makeItem({ id: 't1', category: 'top',    subType: 't-shirt', colorFamily: 'black', occasionTags: ['casual'], formalityLevel: 2 }),
    makeItem({ id: 't2', category: 'top',    subType: 'blouse',  colorFamily: 'white', occasionTags: ['work'],   formalityLevel: 3 }),
    makeItem({ id: 'b1', category: 'bottom', subType: 'jeans',   colorFamily: 'blue',  occasionTags: ['casual'], formalityLevel: 2 }),
  ];

  const slots: WardrobeSlot[] = [];
  const result = computeDiagnostics(items, BASE_PROFILE, slots);

  // Five missing categories → balanceScore = max(0, 30 - 5*6) = 0
  assert(result.balanceScore === 0, `balanceScore === 0 when five categories missing (got ${result.balanceScore})`);

  const missingCategories = result.categoryStats.filter(s => s.status === 'missing');
  assert(missingCategories.length === 5, `5 categories marked missing (got ${missingCategories.length})`);

  const missingIds = missingCategories.map(s => s.category).sort();
  assert(
    JSON.stringify(missingIds) === JSON.stringify(['bag','dress','jewelry','outerwear','shoes']),
    `correct missing categories: ${missingIds.join(', ')}`,
  );

  // The overall score must be strictly lower than the well-balanced wardrobe.
  const wellBalancedScore = (() => {
    const balItems: WardrobeItem[] = [
      makeItem({ id: 't1', category: 'top',      subType: 'blouse',    colorFamily: 'black', occasionTags: ['work','casual'], formalityLevel: 4 }),
      makeItem({ id: 'b1', category: 'bottom',   subType: 'trousers',  colorFamily: 'navy',  occasionTags: ['work'],         formalityLevel: 4 }),
      makeItem({ id: 'd1', category: 'dress',    subType: 'midi-dress',colorFamily: 'black', occasionTags: ['event'],        formalityLevel: 5 }),
      makeItem({ id: 'o1', category: 'outerwear',subType: 'blazer',    colorFamily: 'black', occasionTags: ['work'],         formalityLevel: 5 }),
      makeItem({ id: 's1', category: 'shoes',    subType: 'heels',     colorFamily: 'black', occasionTags: ['work'],         formalityLevel: 5 }),
      makeItem({ id: 'g1', category: 'bag',      subType: 'tote',      colorFamily: 'beige', occasionTags: ['work'],         formalityLevel: 3 }),
      makeItem({ id: 'j1', category: 'jewelry',  subType: 'earrings',  colorFamily: 'gold',  occasionTags: ['work'],         formalityLevel: 4 }),
    ];
    return computeDiagnostics(balItems, BASE_PROFILE, []).overallScore;
  })();

  assert(result.overallScore < wellBalancedScore,
    `missing-category wardrobe scores lower than balanced (${result.overallScore} < ${wellBalancedScore})`);
}

console.log('\n=== wardrobeDiagnostics — categoryStats output shape ===\n');
{
  const items: WardrobeItem[] = [
    makeItem({ id: 't1', category: 'top',    subType: 't-shirt', colorFamily: 'black', occasionTags: [], formalityLevel: 2 }),
    makeItem({ id: 't2', category: 'top',    subType: 'blouse',  colorFamily: 'white', occasionTags: [], formalityLevel: 3 }),
    makeItem({ id: 'b1', category: 'bottom', subType: 'jeans',   colorFamily: 'blue',  occasionTags: [], formalityLevel: 2 }),
  ];

  const result = computeDiagnostics(items, BASE_PROFILE, []);
  const stats = result.categoryStats;

  assert(stats.length === 7, `categoryStats has exactly 7 entries (got ${stats.length})`);

  const allCategories = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'jewelry'];
  const returnedCategories = stats.map(s => s.category).sort();
  assert(
    JSON.stringify(returnedCategories) === JSON.stringify(allCategories.sort()),
    `all 7 ItemCategory values are represented`,
  );

  for (const stat of stats) {
    assert(typeof stat.label === 'string' && stat.label.length > 0,
      `stat.label is a non-empty string for category "${stat.category}"`);
    assert(typeof stat.count === 'number' && stat.count >= 0,
      `stat.count is a non-negative number for category "${stat.category}"`);
    assert(stat.percentage >= 0 && stat.percentage <= 1,
      `stat.percentage is in [0, 1] for category "${stat.category}"`);
    assert(['good','low','missing'].includes(stat.status),
      `stat.status is valid for category "${stat.category}" (got "${stat.status}")`);
  }

  const topStat = stats.find(s => s.category === 'top')!;
  assert(topStat.count === 2, `top count === 2 (got ${topStat.count})`);
  assert(topStat.status !== 'missing', `top is not missing`);

  const dressStat = stats.find(s => s.category === 'dress')!;
  assert(dressStat.count === 0, `dress count === 0 (got ${dressStat.count})`);
  assert(dressStat.status === 'missing', `dress is marked missing`);
}

console.log('\n=== wardrobeDiagnostics — empty wardrobe edge case ===\n');
{
  const result = computeDiagnostics([], BASE_PROFILE, []);

  assert(result.totalItems === 0, `totalItems === 0 for empty wardrobe`);
  assert(result.overallScore === 0, `overallScore === 0 for empty wardrobe (got ${result.overallScore})`);
  assert(result.grade === 'F', `grade is F for empty wardrobe (got ${result.grade})`);
  assert(result.balanceScore === 0, `balanceScore === 0 for empty wardrobe`);
  assert(result.paletteScore === 0, `paletteScore === 0 for empty wardrobe`);
  assert(result.coverageScore === 0, `coverageScore === 0 for empty wardrobe`);
  assert(result.categoryStats.every(s => s.status === 'missing'),
    `all categories are missing in an empty wardrobe`);
}

// ── Exit ──────────────────────────────────────────────────────────────────────

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.\n`);
  process.exit(1);
} else {
  console.log('\nAll tests passed.\n');
}
