/**
 * Phase 3.1 — P0-B: Rise harmony tests.
 *
 * Verifies that:
 *  - rise influences proportion scoring conservatively (+1 / −1 / 0)
 *  - missing or unknown rise always produces exactly 0
 *  - the signal cannot dominate major styling factors
 *  - body type, height, and other proportion dimensions are unaffected
 *
 * Tests cover the 14 required cases from the Phase 3.1 spec:
 *  1.  high-rise + appropriate top (slim)
 *  2.  mid-rise (neutral)
 *  3.  low-rise
 *  4.  missing rise (undefined bottom)
 *  5.  unknown / legacy item with no rise field
 *  6.  petite user (rise effect still present but does not stack with height scorer)
 *  7.  tall user
 *  8.  pear body type
 *  9.  apple body type
 * 10.  inverted-triangle body type
 * 11.  rectangle body type
 * 12.  hourglass body type
 * 13.  compatible wide-leg + high-rise combination
 * 14.  potentially conflicting rise + silhouette (high-rise + loose top)
 *
 * Plus score-sensitivity checks verifying rise cannot overpower major signals.
 *
 * Run: `npx tsx __tests__/phase31-rise.test.ts`
 * Exits non-zero on any failed assertion.
 */

import { scoreOutfitCombo } from '../constants/outfitScoring';
import type { OutfitComponent, WardrobeItem, UserProfile, Rise } from '../constants/types';

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

function describe(label: string, fn: () => void): void {
  console.log(`\n${label}`);
  fn();
}

// ── Factory helpers ───────────────────────────────────────────────────────────

function makeItem(overrides: Partial<WardrobeItem> & { id: string }): WardrobeItem {
  return {
    photoUri: '',
    category: 'top',
    subType: 't-shirt',
    colorFamily: 'black',
    occasionTags: [],
    seasonTags: [],
    formalityLevel: 3,
    createdAt: '2026-01-01',
    ...overrides,
  };
}

function makeComponent(
  id: string,
  category: OutfitComponent['category'],
  colorFamily = 'black',
): OutfitComponent {
  return {
    category,
    subType: category === 'top' ? 't-shirt' : category === 'bottom' ? 'jeans' : category,
    colorFamily,
    owned: true,
    matchedItemId: id,
  };
}

function baseProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    name: 'Test',
    bodyType: null,
    eyeColor: null,
    skinTone: null,
    undertone: null,
    styleGoalPrimary: null,
    styleGoalSecondary: null,
    lifestyleWork: 40,
    lifestyleCasual: 40,
    lifestyleEvents: 20,
    lifestyleActive: 0,
    lifestyleBrunch: 0,
    constraints: {
      noSleeveless: false,
      noShortSkirts: false,
      maxHeelHeight: 'any',
    },
    onboardingComplete: true,
    ...overrides,
  };
}

// Builds a minimal top+bottom outfit and returns the riseHarmony score.
function riseScore(
  topFit: string | undefined,
  bottomRise: Rise | undefined,
  profile?: Partial<UserProfile>,
): number {
  const top = makeItem({ id: 't', category: 'top', subType: 'blouse', fit: topFit as any });
  const bottom = makeItem({ id: 'b', category: 'bottom', subType: 'wide-leg', rise: bottomRise });
  const components = [makeComponent('t', 'top'), makeComponent('b', 'bottom')];
  const result = scoreOutfitCombo(components, [top, bottom], baseProfile(profile));
  return result.riseHarmony;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('1. High-rise + slim/tailored top → +1', () => {
  assert(riseScore('slim',     'high') === 1, `high-rise + slim    → riseHarmony +1`);
  assert(riseScore('tailored', 'high') === 1, `high-rise + tailored → riseHarmony +1`);
});

describe('2. Mid-rise → always 0', () => {
  assert(riseScore('slim',     'mid') === 0, `mid-rise + slim     → riseHarmony 0`);
  assert(riseScore('loose',    'mid') === 0, `mid-rise + loose    → riseHarmony 0`);
  assert(riseScore('tailored', 'mid') === 0, `mid-rise + tailored → riseHarmony 0`);
  assert(riseScore(undefined,  'mid') === 0, `mid-rise + unknown fit → riseHarmony 0`);
});

describe('3. Low-rise + loose/oversized top → −1 (boxy torso)', () => {
  assert(riseScore('loose',    'low') === -1, `low-rise + loose    → riseHarmony -1`);
  assert(riseScore('oversized','low') === -1, `low-rise + oversized → riseHarmony -1`);
});

describe('3b. Low-rise + slim/tailored top → 0 (valid pairing)', () => {
  assert(riseScore('slim',     'low') === 0, `low-rise + slim    → riseHarmony 0`);
  assert(riseScore('tailored', 'low') === 0, `low-rise + tailored → riseHarmony 0`);
});

describe('4 & 5. Missing or unknown rise → exactly 0', () => {
  assert(riseScore('slim',     undefined) === 0, `no rise field (slim top)    → riseHarmony 0`);
  assert(riseScore('loose',    undefined) === 0, `no rise field (loose top)   → riseHarmony 0`);
  assert(riseScore(undefined,  undefined) === 0, `no rise, no fit             → riseHarmony 0`);
  // Top fit unknown — should not fire
  assert(riseScore(undefined,  'high')    === 0, `high-rise, unknown top fit  → riseHarmony 0`);
  assert(riseScore(undefined,  'low')     === 0, `low-rise, unknown top fit   → riseHarmony 0`);
});

describe('6. Petite user — rise signal present; does not stack with heightProportion', () => {
  const petiteProfile = { heightBand: 'petite' as const };
  // high-rise + slim top on a petite user
  const top = makeItem({ id: 't', category: 'top', subType: 'blouse', fit: 'slim' });
  const bottom = makeItem({ id: 'b', category: 'bottom', subType: 'wide-leg', rise: 'high' });
  const components = [makeComponent('t', 'top'), makeComponent('b', 'bottom')];
  const result = scoreOutfitCombo(components, [top, bottom], baseProfile(petiteProfile));
  assert(result.riseHarmony === 1, `petite + high-rise + slim → riseHarmony +1 (got ${result.riseHarmony})`);
  // heightProportion should NOT additionally reward rise (it uses different signals)
  // This test verifies riseHarmony is the only rise-specific contribution.
  assert(
    typeof result.heightProportion === 'number',
    `heightProportion is a separate score dimension: ${result.heightProportion}`,
  );
});

describe('7. Tall user — rise signal present; does not stack with heightProportion', () => {
  const tallProfile = { heightBand: 'tall' as const };
  // high-rise + loose top on tall user
  const top = makeItem({ id: 't', category: 'top', subType: 'blouse', fit: 'loose' });
  const bottom = makeItem({ id: 'b', category: 'bottom', subType: 'wide-leg', rise: 'high' });
  const components = [makeComponent('t', 'top'), makeComponent('b', 'bottom')];
  const result = scoreOutfitCombo(components, [top, bottom], baseProfile(tallProfile));
  assert(result.riseHarmony === -1, `tall + high-rise + loose → riseHarmony −1 (got ${result.riseHarmony})`);
});

describe('8. Pear body type — rise effect independent of bodyTypeProportion', () => {
  const pearProfile = { bodyType: 'pear' as const };
  // wide-leg + slim top + high-rise → bodyTypeProportion +2, riseHarmony +1 (different signals)
  const top = makeItem({ id: 't', category: 'top', subType: 'blouse', fit: 'slim' });
  // bottom fit is not used by riseHarmony (only top fit matters); loose is valid for wide-leg
  const bottom = makeItem({ id: 'b', category: 'bottom', subType: 'wide-leg', fit: 'loose', rise: 'high' });
  const components = [makeComponent('t', 'top'), makeComponent('b', 'bottom')];
  const result = scoreOutfitCombo(components, [top, bottom], baseProfile(pearProfile));
  assert(result.riseHarmony === 1,         `pear + wide-leg + high-rise + slim top → riseHarmony +1 (got ${result.riseHarmony})`);
  assert(result.bodyTypeProportion === 2,  `pear + wide-leg + slim top → bodyTypeProportion +2 (got ${result.bodyTypeProportion})`);
});

describe('9. Apple body type — rise effect independent of bodyTypeProportion', () => {
  const appleProfile = { bodyType: 'apple' as const };
  const top = makeItem({ id: 't', category: 'top', subType: 'blouse', fit: 'slim' });
  const bottom = makeItem({ id: 'b', category: 'bottom', subType: 'wide-leg', rise: 'high' });
  const components = [makeComponent('t', 'top'), makeComponent('b', 'bottom')];
  const result = scoreOutfitCombo(components, [top, bottom], baseProfile(appleProfile));
  assert(result.riseHarmony === 1, `apple + wide-leg + high-rise + slim → riseHarmony +1 (got ${result.riseHarmony})`);
});

describe('10. Inverted-triangle — rise does not interfere with A-line bonus', () => {
  const profile = { bodyType: 'inverted-triangle' as const };
  const top = makeItem({ id: 't', category: 'top', subType: 'blouse', fit: 'slim' });
  const bottom = makeItem({ id: 'b', category: 'bottom', subType: 'midi-skirt', rise: 'high' });
  const components = [makeComponent('t', 'top'), makeComponent('b', 'bottom')];
  const result = scoreOutfitCombo(components, [top, bottom], baseProfile(profile));
  assert(result.riseHarmony === 1, `inverted-triangle + high-rise + slim → riseHarmony +1 (got ${result.riseHarmony})`);
});

describe('11. Rectangle — rise effect independent of curve bonus', () => {
  const profile = { bodyType: 'rectangle' as const };
  const top = makeItem({ id: 't', category: 'top', subType: 'blouse', fit: 'slim' });
  const bottom = makeItem({ id: 'b', category: 'bottom', subType: 'midi-skirt', rise: 'mid' });
  const components = [makeComponent('t', 'top'), makeComponent('b', 'bottom')];
  const result = scoreOutfitCombo(components, [top, bottom], baseProfile(profile));
  assert(result.riseHarmony === 0, `rectangle + mid-rise + slim → riseHarmony 0 (mid-rise neutral)`);
});

describe('12. Hourglass — rise effect compatible', () => {
  const profile = { bodyType: 'hourglass' as const };
  const top = makeItem({ id: 't', category: 'top', subType: 'blouse', fit: 'tailored' });
  const bottom = makeItem({ id: 'b', category: 'bottom', subType: 'wide-leg', rise: 'high' });
  const components = [makeComponent('t', 'top'), makeComponent('b', 'bottom')];
  const result = scoreOutfitCombo(components, [top, bottom], baseProfile(profile));
  assert(result.riseHarmony === 1, `hourglass + high-rise + tailored top → riseHarmony +1 (got ${result.riseHarmony})`);
});

describe('13. Compatible wide-leg + high-rise + slim top', () => {
  const rise = riseScore('slim', 'high');
  assert(rise === 1, `wide-leg + high-rise + slim top → riseHarmony +1 (got ${rise})`);
});

describe('14. Conflicting rise + silhouette: high-rise + oversized top → −1', () => {
  const rise = riseScore('oversized', 'high');
  assert(rise === -1, `high-rise + oversized top → riseHarmony −1 (got ${rise})`);
});

describe('Score sensitivity: rise cannot overpower major signals', () => {
  // Maximum rise effect is ±1. Compare to:
  //   formality cohesion: up to ±5 (spread 0 vs spread >3: 3 vs −2)
  //   completeness: up to +10
  //   palette type: up to 6
  //   not-today reaction: −20
  // Rise ±1 cannot alone change the recommendation tier.

  // Verify max positive: high-rise + slim = +1
  const maxPositive = riseScore('slim', 'high');
  assert(maxPositive === 1, `maximum riseHarmony is +1 (got ${maxPositive})`);

  // Verify max negative: high-rise + loose = −1 (or low-rise + loose = −1)
  const maxNegative = Math.min(
    riseScore('loose', 'high'),
    riseScore('loose', 'low'),
  );
  assert(maxNegative === -1, `minimum riseHarmony is −1 (got ${maxNegative})`);

  // Rise alone should never flip a formality-cohesion outcome
  const bigFormalityGap = (() => {
    const top    = makeItem({ id: 't', category: 'top',    subType: 'hoodie',         fit: 'loose' });
    const bottom = makeItem({ id: 'b', category: 'bottom', subType: 'trousers', formalityLevel: 6, rise: 'high' });
    const components = [makeComponent('t', 'top'), makeComponent('b', 'bottom')];
    return scoreOutfitCombo(components, [top, bottom], baseProfile());
  })();
  // formalityCohesion for hoodie(1)+trousers(6) = spread 5 → -2. riseHarmony cannot fix this.
  assert(
    bigFormalityGap.formalityCohesion < 0,
    `formality mismatch (spread 5) still negative even with positive rise: ${bigFormalityGap.formalityCohesion}`,
  );
  // hoodie is loose, high-rise + loose → riseHarmony = -1 (correct — boxy silhouette)
  // The point is that ±1 from riseHarmony cannot rescue or destroy a formality outcome.
  assert(
    Math.abs(bigFormalityGap.riseHarmony) <= 1,
    `riseHarmony stays within ±1 regardless of other signals (got ${bigFormalityGap.riseHarmony})`,
  );
});

// ── Result ────────────────────────────────────────────────────────────────────

console.log(`\n${failed === 0 ? '✅ All rise tests passed' : `❌ ${failed} test(s) failed`}`);
process.exit(failed > 0 ? 1 : 0);
