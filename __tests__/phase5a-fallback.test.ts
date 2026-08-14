/**
 * Phase 5A — Track G: Explicit Fallback-Path Regression Test
 *
 * Verifies that when strict hero-seeded generation produces zero candidates,
 * the relaxed (fallback-cores) path activates and produces a valid outfit with
 * no fabricated garments and no hard constraint violations.
 *
 * The 'active' scenario is used because SCENARIO_HERO_SUBTYPES['active'] is
 * explicitly defined as { windbreaker, training-shoes, sports-hoodie }.
 * A wardrobe containing NONE of those subtypes guarantees that the strict
 * hero-seeded phase returns zero candidates, forcing the relaxed path.
 */

import { generateOutfitPool, SCENARIOS } from '../constants/outfitRotation';
import { EMPTY_AFFINITY } from '../constants/affinity';
import type { WardrobeItem, UserProfile } from '../constants/types';

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
};

// ─── Minimal test helpers ────────────────────────────────────────────────────

let _seq = 0;
function makeItem(overrides: Partial<WardrobeItem>): WardrobeItem {
  const id = `test-item-${++_seq}`;
  return {
    id,
    photoUri: `https://example.com/${id}.jpg`,
    category: 'top',
    subType: 'tank-top',
    colorFamily: 'black',
    occasionTags: ['active'],
    seasonTags: ['all-season'],
    formalityLevel: 1,
    pattern: 'solid',
    fabric: 'cotton',
    weight: 'light',
    accentColor: undefined,
    description: '',
    dominantHsl: undefined,
    dominantLab: undefined,
    modelConfidence: undefined,
    fit: undefined,
    neckline: undefined,
    sleeveLength: undefined,
    rise: undefined,
    warmthBand: undefined,
    patternScale: undefined,
    createdAt: '2025-01-15T00:00:00.000Z',
    ...overrides,
  };
}

// Minimal UserProfile — only fields actually read by generateOutfitPool are set.
const minProfile = {
  id: 'test-user',
  name: 'Test',
  bodyType: 'straight',
  eyeColor: 'brown',
  skinTone: 'medium',
  undertone: 'neutral',
  hairColor: 'brown',
  heightBand: 'average',
  contrastLevel: 'medium',
  metalPreference: 'gold',
  lifePhase: 'professional',
  industry: 'other',
  styleGoalPrimary: 'minimal',
  styleGoalSecondary: null,
  onboardingComplete: true,
  isGuest: false,
  weatherEnabled: false,   // disable weather so no outerwear gate fires
  tempUnit: 'C',
  constraints: {
    colorAversions: [],
    noSleeveless: false,
    noShortSkirts: false,
    maxHeelHeight: 'any',
  },
} as unknown as UserProfile;

// ─── G.1 — Strict failure → relaxed activation ──────────────────────────────

console.log('\n=== Phase 5A — G. Fallback-path regression ===');

{
  /**
   * Wardrobe: NO active heroes (windbreaker / training-shoes / sports-hoodie).
   * Items are valid for 'active' but not in SCENARIO_HERO_SUBTYPES['active'],
   * so the strict hero-seeded phase returns zero candidates.
   */
  const wardrobe: WardrobeItem[] = [
    makeItem({ category: 'top',    subType: 'tank-top',  colorFamily: 'black', formalityLevel: 1, occasionTags: ['active'] }),
    makeItem({ category: 'bottom', subType: 'leggings',  colorFamily: 'black', formalityLevel: 1, occasionTags: ['active'] }),
    makeItem({ category: 'shoes',  subType: 'sneakers',  colorFamily: 'white', formalityLevel: 1, occasionTags: ['active'] }),
  ];

  const knownItemIds = new Set(wardrobe.map(i => i.id));

  const pool = generateOutfitPool(
    wardrobe,
    minProfile,
    null,
    [],
    '2025-01-15',
    [],
    EMPTY_AFFINITY,
    null,
  );

  const activeOutfits = pool['active'] ?? [];

  // G.1a — At least one outfit must be produced via the relaxed path.
  //         No active heroes → strict phase produces 0 → relaxed must activate.
  const relaxedOutfits = activeOutfits.filter(o => o.generationPath === 'relaxed');
  assert(
    relaxedOutfits.length >= 1,
    `G.1a: relaxed path must activate when no 'active' hero subtypes present (got ${relaxedOutfits.length} relaxed, ${activeOutfits.length} total)`,
  );
  console.log(`  ✓ G.1a: relaxed path activated — ${relaxedOutfits.length} relaxed outfit(s)`);

  // G.1b — Strict path produced zero hero-seeded outfits (confirmed strict failure).
  const strictOutfits = activeOutfits.filter(
    o => o.generationPath === undefined || o.generationPath === 'strict',
  );
  assert(
    strictOutfits.length === 0,
    `G.1b: strict path must produce 0 outfits when no active heroes present (got ${strictOutfits.length})`,
  );
  console.log(`  ✓ G.1b: strict path produced ${strictOutfits.length} outfits (confirmed failure)`);

  // G.1c — Every relaxed outfit is valid: components are non-empty and contain
  //         only items from our wardrobe (no fabricated garments).
  for (const outfit of relaxedOutfits) {
    assert(
      outfit.components.length >= 2,
      `G.1c: relaxed outfit must have ≥2 components (got ${outfit.components.length})`,
    );
    for (const comp of outfit.components) {
      if (comp.matchedItemId) {
        assert(
          knownItemIds.has(comp.matchedItemId),
          `G.1c: outfit references unknown item id ${comp.matchedItemId} — garment fabrication detected`,
        );
      }
    }
  }
  console.log(`  ✓ G.1c: all relaxed outfits valid, no fabricated garments`);

  // G.1d — No hard constraint violations: every matched component must be
  //         a real WardrobeItem with a valid category.
  const validCategories = new Set(['top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'jewelry']);
  for (const outfit of relaxedOutfits) {
    for (const comp of outfit.components) {
      assert(
        validCategories.has(comp.category),
        `G.1d: component has invalid category '${comp.category}'`,
      );
    }
  }
  console.log(`  ✓ G.1d: no hard constraint violations`);

  // G.1e — generationPath field is always a valid value.
  const VALID_PATHS = new Set(['strict', 'relaxed', undefined]);
  for (const outfit of activeOutfits) {
    assert(
      VALID_PATHS.has(outfit.generationPath),
      `G.1e: generationPath must be 'strict' | 'relaxed' | undefined (got ${JSON.stringify(outfit.generationPath)})`,
    );
  }
  console.log(`  ✓ G.1e: generationPath values are all valid`);
}

// ─── G.2 — Sanity: wardrobe WITH active hero → no relaxed outfits ───────────

{
  /**
   * Control case: adding a windbreaker (active hero) should suppress the
   * relaxed path, confirming G.1 is testing a genuine edge condition.
   */
  const wardrobeWithHero: WardrobeItem[] = [
    makeItem({ category: 'top',      subType: 'windbreaker',   colorFamily: 'navy', formalityLevel: 1, occasionTags: ['active'], fabric: 'synthetic', weight: 'light' }),
    makeItem({ category: 'bottom',   subType: 'leggings',      colorFamily: 'black', formalityLevel: 1, occasionTags: ['active'] }),
    makeItem({ category: 'shoes',    subType: 'training-shoes', colorFamily: 'white', formalityLevel: 1, occasionTags: ['active'] }),
    makeItem({ category: 'bag',      subType: 'gym-bag',       colorFamily: 'black', formalityLevel: 1, occasionTags: ['active'] }),
  ];

  const pool = generateOutfitPool(
    wardrobeWithHero,
    minProfile,
    null,
    [],
    '2025-01-15',
    [],
    EMPTY_AFFINITY,
    null,
  );

  const activeOutfits = pool['active'] ?? [];
  const relaxedOutfits = activeOutfits.filter(o => o.generationPath === 'relaxed');

  assert(
    relaxedOutfits.length === 0,
    `G.2: when active hero (windbreaker) is present, expect 0 relaxed outfits (got ${relaxedOutfits.length})`,
  );
  console.log(`  ✓ G.2: control — hero present → ${relaxedOutfits.length} relaxed outfits (strict path used)`);
}

console.log('\n✅ Phase 5A — G. Fallback-path regression: all assertions passed\n');
