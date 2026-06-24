/**
 * Unit tests for the intelligent features in applyDailyRotation.
 *
 * Covers the four areas called out in the task:
 *   1. Tier-aware count  — isPremium=true → 4 outfits/scenario, false → 2
 *   2. Hero diversity    — yesterday's heroIds are deprioritised today
 *   3. Cross-scenario fingerprint dedup — identical outfit appears once per day
 *   4. Completeness bias — shoes + bag + jewelry earns +1 confidence and sorts first
 *
 * Run: `npx tsx __tests__/outfitRotation.test.ts`
 * Exits non-zero on any failed assertion.
 */

import {
  applyDailyRotation,
  applyCompletenessBias,
  applyFreshnessOrder,
  applyHeroDiversityOrder,
  tieredShuffle,
  generateOutfitPool,
  INITIAL_ROTATION_STATE,
  SCENARIOS,
} from '../constants/outfitRotation';
import type { OccasionTag, OutfitComponent, OutfitSet, WardrobeItem, UserProfile } from '../constants/types';

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

function makeComponent(
  category: OutfitComponent['category'],
  id: string,
): OutfitComponent {
  return { category, subType: 'generic', colorFamily: 'black', owned: true, matchedItemId: id };
}

function makeOutfit(
  id: string,
  scenario: OccasionTag,
  components: OutfitComponent[],
  overrides: Partial<OutfitSet> = {},
): OutfitSet {
  return { id, scenario, components, confidenceScore: 5, ...overrides };
}

/**
 * Returns the fingerprint of an outfit's components as the rotation engine
 * computes it: matched item IDs, filtered, sorted, joined by '|'.
 */
function fingerprint(components: OutfitComponent[]): string {
  return components
    .map(c => c.matchedItemId)
    .filter(Boolean)
    .sort()
    .join('|');
}

/**
 * Build a minimal pool with outfits in every scenario (1 each) plus optional
 * overrides for specific scenarios.
 */
function buildPool(
  overrides: Partial<Record<OccasionTag, OutfitSet[]>> = {},
): Record<OccasionTag, OutfitSet[]> {
  const pool = {} as Record<OccasionTag, OutfitSet[]>;
  for (const scenario of SCENARIOS) {
    if (overrides[scenario] !== undefined) {
      pool[scenario] = overrides[scenario]!;
    } else {
      pool[scenario] = [
        makeOutfit(`default-${scenario}-0`, scenario, [
          makeComponent('top', `${scenario}-top`),
          makeComponent('bottom', `${scenario}-bottom`),
          makeComponent('shoes', `${scenario}-shoes`),
        ]),
        makeOutfit(`default-${scenario}-1`, scenario, [
          makeComponent('top', `${scenario}-top-2`),
          makeComponent('bottom', `${scenario}-bottom-2`),
          makeComponent('shoes', `${scenario}-shoes-2`),
        ]),
        makeOutfit(`default-${scenario}-2`, scenario, [
          makeComponent('top', `${scenario}-top-3`),
          makeComponent('bottom', `${scenario}-bottom-3`),
          makeComponent('shoes', `${scenario}-shoes-3`),
        ]),
        makeOutfit(`default-${scenario}-3`, scenario, [
          makeComponent('top', `${scenario}-top-4`),
          makeComponent('bottom', `${scenario}-bottom-4`),
          makeComponent('shoes', `${scenario}-shoes-4`),
        ]),
        makeOutfit(`default-${scenario}-4`, scenario, [
          makeComponent('top', `${scenario}-top-5`),
          makeComponent('bottom', `${scenario}-bottom-5`),
          makeComponent('shoes', `${scenario}-shoes-5`),
        ]),
      ];
    }
  }
  return pool;
}

const TODAY = '2026-06-15';
const YESTERDAY = '2026-06-14';

// ── 1. Tier-aware count ───────────────────────────────────────────────────────

describe('1. Tier-aware count: Free → 2 outfits/scenario, Premium → 4', () => {
  const pool = buildPool();
  const state = { ...INITIAL_ROTATION_STATE, shuffleSeed: 1 };

  const { outfits: freeOutfits } = applyDailyRotation(pool, state, TODAY, undefined, false);
  const { outfits: premiumOutfits } = applyDailyRotation(pool, state, TODAY, undefined, true);

  // Count outfits per scenario in the flat output.
  // Cross-scenario dedup means some may be removed, but with all-unique fingerprints
  // and enough pool items each scenario should be represented at full quota.
  const countForScenario = (outfits: OutfitSet[], scenario: OccasionTag) =>
    outfits.filter(o => o.scenario === scenario).length;

  // Use 'work' as the reference scenario — it always runs first in SCENARIOS.
  assert(
    countForScenario(freeOutfits, 'work') <= 2,
    'Free tier: at most 2 outfits served for the work scenario',
  );

  assert(
    countForScenario(premiumOutfits, 'work') <= 4,
    'Premium tier: at most 4 outfits served for the work scenario',
  );

  assert(
    countForScenario(premiumOutfits, 'work') >= countForScenario(freeOutfits, 'work'),
    'Premium tier serves at least as many outfits as free for any scenario',
  );

  // Build a pool with 10 unique outfits per scenario to ensure quota is always filled.
  const bigPool = {} as Record<OccasionTag, OutfitSet[]>;
  for (const scenario of SCENARIOS) {
    bigPool[scenario] = Array.from({ length: 10 }, (_, k) =>
      makeOutfit(`big-${scenario}-${k}`, scenario, [
        makeComponent('top', `big-${scenario}-top-${k}`),
        makeComponent('bottom', `big-${scenario}-btm-${k}`),
        makeComponent('shoes', `big-${scenario}-sh-${k}`),
      ]),
    );
  }

  const { outfits: bigFree } = applyDailyRotation(bigPool, state, TODAY, undefined, false);
  const { outfits: bigPremium } = applyDailyRotation(bigPool, state, TODAY, undefined, true);

  assert(
    countForScenario(bigFree, 'work') === 2,
    'Free tier (big pool): exactly 2 work outfits served',
  );
  assert(
    countForScenario(bigPremium, 'work') === 4,
    'Premium tier (big pool): exactly 4 work outfits served',
  );

  // Validate for a premium-only scenario too ('night-out' is premium).
  assert(
    countForScenario(bigFree, 'night-out') === 2,
    'Free tier (big pool): exactly 2 night-out outfits served',
  );
  assert(
    countForScenario(bigPremium, 'night-out') === 4,
    'Premium tier (big pool): exactly 4 night-out outfits served',
  );

  const totalFree = bigFree.length;
  const totalPremium = bigPremium.length;
  assert(
    totalPremium > totalFree,
    `Premium total (${totalPremium}) exceeds free total (${totalFree})`,
  );
});

// ── 2. Hero diversity: yesterday's heroes are deprioritised ──────────────────

describe('2. Hero diversity: yesterday\'s heroes are deprioritised today', () => {
  // We need 10+ unique outfits so the served set is large enough to observe ordering.
  const SCENARIO: OccasionTag = 'casual';

  // Yesterday's hero: item id 'old-hero'
  const OLD_HERO_ID = 'old-hero';
  const FRESH_HERO_ID = 'fresh-hero';

  // Build a pool of 8 outfits — first 4 feature the old hero, last 4 feature a fresh hero.
  const casualPool: OutfitSet[] = [
    // Old-hero outfits (should be pushed to lower segment)
    makeOutfit('old-0', SCENARIO, [
      makeComponent('top', `${OLD_HERO_ID}`),
      makeComponent('bottom', 'old-btm-0'),
      makeComponent('shoes', 'old-sh-0'),
    ], { confidenceScore: 10, heroId: OLD_HERO_ID }),
    makeOutfit('old-1', SCENARIO, [
      makeComponent('top', `${OLD_HERO_ID}`),
      makeComponent('bottom', 'old-btm-1'),
      makeComponent('shoes', 'old-sh-1'),
    ], { confidenceScore: 10, heroId: OLD_HERO_ID }),
    makeOutfit('old-2', SCENARIO, [
      makeComponent('top', `${OLD_HERO_ID}`),
      makeComponent('bottom', 'old-btm-2'),
      makeComponent('shoes', 'old-sh-2'),
    ], { confidenceScore: 10, heroId: OLD_HERO_ID }),
    makeOutfit('old-3', SCENARIO, [
      makeComponent('top', `${OLD_HERO_ID}`),
      makeComponent('bottom', 'old-btm-3'),
      makeComponent('shoes', 'old-sh-3'),
    ], { confidenceScore: 10, heroId: OLD_HERO_ID }),
    // Fresh-hero outfits — same base score; diversity pass elevates them
    makeOutfit('fresh-0', SCENARIO, [
      makeComponent('top', `${FRESH_HERO_ID}`),
      makeComponent('bottom', 'fresh-btm-0'),
      makeComponent('shoes', 'fresh-sh-0'),
    ], { confidenceScore: 10, heroId: FRESH_HERO_ID }),
    makeOutfit('fresh-1', SCENARIO, [
      makeComponent('top', `${FRESH_HERO_ID}`),
      makeComponent('bottom', 'fresh-btm-1'),
      makeComponent('shoes', 'fresh-sh-1'),
    ], { confidenceScore: 10, heroId: FRESH_HERO_ID }),
    makeOutfit('fresh-2', SCENARIO, [
      makeComponent('top', `${FRESH_HERO_ID}`),
      makeComponent('bottom', 'fresh-btm-2'),
      makeComponent('shoes', 'fresh-sh-2'),
    ], { confidenceScore: 10, heroId: FRESH_HERO_ID }),
    makeOutfit('fresh-3', SCENARIO, [
      makeComponent('top', `${FRESH_HERO_ID}`),
      makeComponent('bottom', 'fresh-btm-3'),
      makeComponent('shoes', 'fresh-sh-3'),
    ], { confidenceScore: 10, heroId: FRESH_HERO_ID }),
  ];

  const pool = buildPool({ [SCENARIO]: casualPool });

  // Yesterday's state: OLD_HERO_ID was a hero for the casual scenario.
  const stateWithPrevHeroes = {
    ...INITIAL_ROTATION_STATE,
    shuffleSeed: 1,
    lastDate: YESTERDAY,
    prevDayHeroIds: { [SCENARIO]: [OLD_HERO_ID] } as Partial<Record<OccasionTag, string[]>>,
  };

  // Premium gives 4 outfits — check that fresh heroes appear in today's batch
  // while old heroes (if present) come after.
  const { outfits, newState } = applyDailyRotation(
    pool,
    stateWithPrevHeroes,
    TODAY,
    undefined,
    true,
  );

  const casualOutfits = outfits.filter(o => o.scenario === SCENARIO);

  assert(
    casualOutfits.length > 0,
    'Hero diversity: casual outfits are returned',
  );

  // The fresh-hero outfits should appear before any old-hero outfits.
  // Find the first fresh and first old indices in the flat output.
  const firstFreshIdx = casualOutfits.findIndex(o => o.heroId === FRESH_HERO_ID);
  const firstOldIdx = casualOutfits.findIndex(o => o.heroId === OLD_HERO_ID);

  if (firstFreshIdx !== -1 && firstOldIdx !== -1) {
    assert(
      firstFreshIdx < firstOldIdx,
      `Fresh hero (idx ${firstFreshIdx}) surfaces before old hero (idx ${firstOldIdx}) in today's casual batch`,
    );
  } else if (firstOldIdx === -1) {
    assert(
      true,
      'Hero diversity: no old-hero outfits served today (all slots taken by fresh heroes)',
    );
  } else {
    assert(
      false,
      'Hero diversity: fresh hero not found in output — expected at least one fresh-hero outfit',
    );
  }

  // Verify that the new state records today's heroIds for tomorrow's pass.
  assert(
    Array.isArray(newState.prevDayHeroIds?.[SCENARIO]),
    'New state records prevDayHeroIds for the casual scenario',
  );

  // Verify that hero diversity is NOT applied when there are no prevDayHeroIds.
  const stateNoPrev = { ...INITIAL_ROTATION_STATE, shuffleSeed: 1, lastDate: YESTERDAY };
  const { outfits: outfitsNoPrev } = applyDailyRotation(pool, stateNoPrev, TODAY, undefined, true);
  assert(
    outfitsNoPrev.filter(o => o.scenario === SCENARIO).length > 0,
    'Hero diversity: outfits are still served when there is no prevDayHeroIds history',
  );
});

// ── 3. Cross-scenario fingerprint dedup ──────────────────────────────────────

describe('3. Cross-scenario dedup: identical fingerprint appears only once per day', () => {
  // Create an outfit whose components produce a specific known fingerprint,
  // then place it in two different scenarios. The second occurrence should be dropped.
  const SHARED_COMPONENTS: OutfitComponent[] = [
    makeComponent('top', 'shared-top'),
    makeComponent('bottom', 'shared-btm'),
    makeComponent('shoes', 'shared-sh'),
  ];
  const SHARED_FP = fingerprint(SHARED_COMPONENTS);

  const workPool: OutfitSet[] = [
    makeOutfit('w-shared', 'work', SHARED_COMPONENTS, { confidenceScore: 10 }),
    makeOutfit('w-unique-1', 'work', [
      makeComponent('top', 'w-top-1'),
      makeComponent('bottom', 'w-btm-1'),
      makeComponent('shoes', 'w-sh-1'),
    ]),
    makeOutfit('w-unique-2', 'work', [
      makeComponent('top', 'w-top-2'),
      makeComponent('bottom', 'w-btm-2'),
      makeComponent('shoes', 'w-sh-2'),
    ]),
    makeOutfit('w-unique-3', 'work', [
      makeComponent('top', 'w-top-3'),
      makeComponent('bottom', 'w-btm-3'),
      makeComponent('shoes', 'w-sh-3'),
    ]),
  ];

  // The casual scenario also includes the shared outfit (same item IDs → same fingerprint).
  const casualPool: OutfitSet[] = [
    makeOutfit('c-shared', 'casual', SHARED_COMPONENTS, { confidenceScore: 10 }),
    makeOutfit('c-unique-1', 'casual', [
      makeComponent('top', 'c-top-1'),
      makeComponent('bottom', 'c-btm-1'),
      makeComponent('shoes', 'c-sh-1'),
    ]),
    makeOutfit('c-unique-2', 'casual', [
      makeComponent('top', 'c-top-2'),
      makeComponent('bottom', 'c-btm-2'),
      makeComponent('shoes', 'c-sh-2'),
    ]),
    makeOutfit('c-unique-3', 'casual', [
      makeComponent('top', 'c-top-3'),
      makeComponent('bottom', 'c-btm-3'),
      makeComponent('shoes', 'c-sh-3'),
    ]),
  ];

  const pool = buildPool({ work: workPool, casual: casualPool });
  const state = { ...INITIAL_ROTATION_STATE, shuffleSeed: 1 };

  // Use premium to maximise the number of outfits served (4/scenario) and
  // maximise the chance both scenarios try to emit the shared outfit.
  const { outfits } = applyDailyRotation(pool, state, TODAY, undefined, true);

  // Count how many times the shared fingerprint appears in the flat output.
  const sharedCount = outfits.filter(o => fingerprint(o.components) === SHARED_FP).length;

  assert(
    sharedCount <= 1,
    `Shared fingerprint appears at most once in the daily batch (found ${sharedCount})`,
  );

  // Each of the unique outfits can still appear.
  const uniqueFps = new Set(outfits.map(o => fingerprint(o.components)));
  assert(
    uniqueFps.size === outfits.length,
    'All outfits in the daily batch have distinct fingerprints',
  );

  // Robustness: three scenarios all sharing the same fingerprint — only one survives.
  const datePool: OutfitSet[] = [
    makeOutfit('d-shared', 'date-casual', SHARED_COMPONENTS, { confidenceScore: 10 }),
    makeOutfit('d-unique-1', 'date-casual', [
      makeComponent('top', 'd-top-1'),
      makeComponent('bottom', 'd-btm-1'),
      makeComponent('shoes', 'd-sh-1'),
    ]),
  ];
  const pool3 = buildPool({ work: workPool, casual: casualPool, 'date-casual': datePool });
  const { outfits: out3 } = applyDailyRotation(pool3, state, TODAY, undefined, true);
  const sharedCount3 = out3.filter(o => fingerprint(o.components) === SHARED_FP).length;
  assert(
    sharedCount3 <= 1,
    `Shared fingerprint still appears at most once when three scenarios include it (found ${sharedCount3})`,
  );
});

// ── 4. Completeness bias ──────────────────────────────────────────────────────

describe('4. Completeness bias: shoes + bag + jewelry earns +1 confidence', () => {
  const SCENARIO: OccasionTag = 'brunch';
  const BASE_SCORE = 5;

  // Outfit A: COMPLETE — has shoes, bag, AND jewelry. Same base score.
  const completeComponents: OutfitComponent[] = [
    makeComponent('top', 'cb-top'),
    makeComponent('bottom', 'cb-btm'),
    makeComponent('shoes', 'cb-sh'),
    makeComponent('bag', 'cb-bag'),
    makeComponent('jewelry', 'cb-jwl'),
  ];
  const completeOutfit = makeOutfit('cb-complete', SCENARIO, completeComponents, {
    confidenceScore: BASE_SCORE,
  });

  // Outfit B: INCOMPLETE — missing jewelry. Same base score.
  const incompleteComponents: OutfitComponent[] = [
    makeComponent('top', 'ib-top'),
    makeComponent('bottom', 'ib-btm'),
    makeComponent('shoes', 'ib-sh'),
    makeComponent('bag', 'ib-bag'),
    // no jewelry
  ];
  const incompleteOutfit = makeOutfit('cb-incomplete', SCENARIO, incompleteComponents, {
    confidenceScore: BASE_SCORE,
  });

  // Only outfit B appears first in pool order — if bias is missing, B would stay first.
  // After bias, A gets BASE_SCORE + 1, sorts ahead, and should be in output.
  const brunchPool: OutfitSet[] = [
    incompleteOutfit,
    completeOutfit,
    // Extra padding so tieredShuffle divides into proper tiers (needs > 3 items).
    makeOutfit('cb-pad-1', SCENARIO, [
      makeComponent('top', 'pad1-top'),
      makeComponent('bottom', 'pad1-btm'),
      makeComponent('shoes', 'pad1-sh'),
    ], { confidenceScore: 1 }),
    makeOutfit('cb-pad-2', SCENARIO, [
      makeComponent('top', 'pad2-top'),
      makeComponent('bottom', 'pad2-btm'),
      makeComponent('shoes', 'pad2-sh'),
    ], { confidenceScore: 1 }),
    makeOutfit('cb-pad-3', SCENARIO, [
      makeComponent('top', 'pad3-top'),
      makeComponent('bottom', 'pad3-btm'),
      makeComponent('shoes', 'pad3-sh'),
    ], { confidenceScore: 1 }),
    makeOutfit('cb-pad-4', SCENARIO, [
      makeComponent('top', 'pad4-top'),
      makeComponent('bottom', 'pad4-btm'),
      makeComponent('shoes', 'pad4-sh'),
    ], { confidenceScore: 1 }),
  ];

  const pool = buildPool({ [SCENARIO]: brunchPool });
  const state = { ...INITIAL_ROTATION_STATE, shuffleSeed: 1 };
  const { outfits } = applyDailyRotation(pool, state, TODAY, undefined, true);

  const brunchOutfits = outfits.filter(o => o.scenario === SCENARIO);

  // The complete outfit should be present in the served batch (bumped score = 6,
  // highest in the pool after bias → survives into the top tier).
  const completeInOutput = brunchOutfits.find(o => fingerprint(o.components) === fingerprint(completeComponents));
  assert(
    completeInOutput !== undefined,
    'Complete outfit (shoes+bag+jewelry) is served in today\'s brunch batch',
  );

  // The confidenceScore in the output should reflect the +1 bias.
  assert(
    completeInOutput !== undefined && (completeInOutput.confidenceScore ?? 0) === BASE_SCORE + 1,
    `Complete outfit confidenceScore in output is ${BASE_SCORE + 1} (base ${BASE_SCORE} + 1 bias)`,
  );

  // The incomplete outfit should have its original score unchanged.
  const incompleteInOutput = brunchOutfits.find(o => fingerprint(o.components) === fingerprint(incompleteComponents));
  if (incompleteInOutput !== undefined) {
    assert(
      (incompleteInOutput.confidenceScore ?? 0) === BASE_SCORE,
      `Incomplete outfit confidenceScore in output remains ${BASE_SCORE} (no bias applied)`,
    );
  } else {
    assert(true, 'Incomplete outfit was displaced by higher-scoring outfits (acceptable)');
  }

  // For equal base scores, the complete outfit's bumped score (BASE_SCORE + 1) must
  // strictly exceed the incomplete outfit's score (BASE_SCORE). Verify via output scores.
  if (completeInOutput && incompleteInOutput) {
    assert(
      (completeInOutput.confidenceScore ?? 0) > (incompleteInOutput.confidenceScore ?? 0),
      'Complete outfit confidenceScore > incomplete outfit confidenceScore (equal base scores)',
    );

    // Complete outfit must surface BEFORE the incomplete outfit in the served batch.
    const completeIdx = brunchOutfits.indexOf(completeInOutput);
    const incompleteIdx = brunchOutfits.indexOf(incompleteInOutput);
    assert(
      completeIdx < incompleteIdx,
      `Complete outfit (idx ${completeIdx}) surfaces before incomplete outfit (idx ${incompleteIdx}) in brunch batch`,
    );
  }

  // Additional check: an outfit missing SHOES is also not "complete".
  const noShoes: OutfitComponent[] = [
    makeComponent('top', 'ns-top'),
    makeComponent('bottom', 'ns-btm'),
    makeComponent('bag', 'ns-bag'),
    makeComponent('jewelry', 'ns-jwl'),
  ];
  const noShoesPool: OutfitSet[] = [
    makeOutfit('ns-outfit', SCENARIO, noShoes, { confidenceScore: BASE_SCORE }),
    ...brunchPool.slice(2),
  ];
  const poolNs = buildPool({ [SCENARIO]: [completeOutfit, ...noShoesPool] });
  const { outfits: outNs } = applyDailyRotation(poolNs, state, TODAY, undefined, true);
  const noShoesInOutput = outNs.find(o => fingerprint(o.components) === fingerprint(noShoes));
  if (noShoesInOutput) {
    assert(
      (noShoesInOutput.confidenceScore ?? 0) === BASE_SCORE,
      'Outfit without shoes is not awarded the completeness bias (+1)',
    );
  } else {
    assert(true, 'No-shoes outfit not served (displaced by complete outfit — acceptable)');
  }
});

// ── 5. Integration: new-day state transition ──────────────────────────────────

describe('5. Integration: new-day state transition advances cursors correctly', () => {
  const pool = buildPool();
  const state = {
    ...INITIAL_ROTATION_STATE,
    shuffleSeed: 99,
    lastDate: YESTERDAY,
  };

  const { newState } = applyDailyRotation(pool, state, TODAY, undefined, false);

  assert(
    newState.lastDate === TODAY,
    'New state records today\'s date',
  );

  assert(
    typeof newState.todayCursors['work'] === 'number',
    'New state has a todayCursor for the work scenario',
  );

  assert(
    typeof newState.nextCursors['work'] === 'number',
    'New state has a nextCursor for the work scenario',
  );

  assert(
    newState.poolHash === state.poolHash,
    'New state preserves the poolHash',
  );

  assert(
    newState.shuffleSeed === state.shuffleSeed,
    'New state preserves the shuffleSeed',
  );

  // Calling again with the same date (same day) should not re-advance cursors
  // and should produce the same outfits.
  const { outfits: first } = applyDailyRotation(pool, state, TODAY, undefined, false);
  const { outfits: second } = applyDailyRotation(pool, newState, TODAY, undefined, false);

  const firstIds = first.map(o => fingerprint(o.components)).sort().join(',');
  const secondIds = second.map(o => fingerprint(o.components)).sort().join(',');

  assert(
    firstIds === secondIds,
    'Same-day calls with persisted state produce identical outfit sets',
  );
});

// ── 5. Wear-history freshness ordering ───────────────────────────────────────

describe('5. Wear-history freshness: recently worn outfits deprioritised when fresh alternatives exist', () => {
  // Build a scenario pool where the worn outfit is listed first (position 0) so
  // it would naturally surface if freshness ordering were not applied, then four
  // fresh alternatives follow.
  //
  // Pool size = 5 (> 3) is deliberate: tieredShuffle splits into thirds
  //   top  = [freshA, freshB]   (indices 0–1, shuffled within tier)
  //   mid  = [freshC, freshD]   (indices 2–3, shuffled within tier)
  //   low  = [wornOutfit]       (index 4)
  // Free-tier quota n=2 at cursor=0 slices indices 0–1, which are always
  // from the fresh top-tier — the worn outfit sits in the unreachable low tier.
  const SCENARIO: OccasionTag = 'casual';

  const wornOutfit = makeOutfit('worn-outfit', SCENARIO, [
    makeComponent('top', 'worn-top'),
    makeComponent('bottom', 'worn-bottom'),
    makeComponent('shoes', 'worn-shoes'),
  ]);

  const freshA = makeOutfit('fresh-a', SCENARIO, [
    makeComponent('top', 'fresh-top-a'),
    makeComponent('bottom', 'fresh-bottom-a'),
    makeComponent('shoes', 'fresh-shoes-a'),
  ]);

  const freshB = makeOutfit('fresh-b', SCENARIO, [
    makeComponent('top', 'fresh-top-b'),
    makeComponent('bottom', 'fresh-bottom-b'),
    makeComponent('shoes', 'fresh-shoes-b'),
  ]);

  const freshC = makeOutfit('fresh-c', SCENARIO, [
    makeComponent('top', 'fresh-top-c'),
    makeComponent('bottom', 'fresh-bottom-c'),
    makeComponent('shoes', 'fresh-shoes-c'),
  ]);

  const freshD = makeOutfit('fresh-d', SCENARIO, [
    makeComponent('top', 'fresh-top-d'),
    makeComponent('bottom', 'fresh-bottom-d'),
    makeComponent('shoes', 'fresh-shoes-d'),
  ]);

  const wornFp = fingerprint(wornOutfit.components);
  const recentWornFingerprints = new Set([wornFp]);

  // Worn outfit placed first so without freshness ordering it would win.
  // After freshness ordering: [freshA, freshB, freshC, freshD, wornOutfit].
  const pool = buildPool({
    [SCENARIO]: [wornOutfit, freshA, freshB, freshC, freshD],
  });

  // Use a fixed seed and a fresh state so the cursor starts at 0.
  const state = { ...INITIAL_ROTATION_STATE, shuffleSeed: 42 };

  const { outfits } = applyDailyRotation(pool, state, TODAY, recentWornFingerprints, false);

  const casualOutfits = outfits.filter(o => o.scenario === SCENARIO);
  const servedFingerprints = casualOutfits.map(o => fingerprint(o.components));

  assert(
    servedFingerprints.length > 0,
    'At least one outfit is still served after freshness filtering',
  );

  // Verify none of the served casual outfits carry the worn fingerprint.
  const wornAppears = servedFingerprints.some(fp => fp === wornFp);
  assert(
    !wornAppears,
    'Worn outfit is NOT served when 4 fresh alternatives fill the free-tier quota',
  );
});

describe('5b. Wear-history freshness: worn outfit IS served when it is the only option', () => {
  const SCENARIO: OccasionTag = 'casual';

  const wornOutfit = makeOutfit('only-outfit', SCENARIO, [
    makeComponent('top', 'only-top'),
    makeComponent('bottom', 'only-bottom'),
    makeComponent('shoes', 'only-shoes'),
  ]);

  const wornFp = fingerprint(wornOutfit.components);
  const recentWornFingerprints = new Set([wornFp]);

  const pool = buildPool({ [SCENARIO]: [wornOutfit] });
  const state = { ...INITIAL_ROTATION_STATE, shuffleSeed: 42 };

  const { outfits } = applyDailyRotation(pool, state, TODAY, recentWornFingerprints, false);

  const casualOutfits = outfits.filter(o => o.scenario === SCENARIO);
  const servedFingerprints = casualOutfits.map(o => fingerprint(o.components));

  assert(
    servedFingerprints.includes(wornFp),
    'Worn outfit IS served when it is the only available outfit in the scenario',
  );

  assert(
    casualOutfits.length === 1,
    'Exactly one outfit is served when the pool has a single (worn) outfit',
  );
});

describe('5c. Freshness ordering boundary: worn outfit lands at index len-1 regardless of pool size or quota', () => {
  // This test calls applyFreshnessOrder directly — no tieredShuffle, no quota —
  // so the ordering guarantee cannot silently pass for the wrong reason if either
  // of those two variables changes in the future.
  //
  // Pool layout (worn outfit first, so it would surface without ordering):
  //   [wornOutfit, freshA, freshB, freshC, freshD, freshE, freshF, freshG]
  // After applyFreshnessOrder:
  //   [freshA, freshB, freshC, freshD, freshE, freshF, freshG, wornOutfit]
  // Invariant: wornOutfit must be at position len-1 (last).

  const SCENARIO: OccasionTag = 'work';

  const wornOutfit = makeOutfit('boundary-worn', SCENARIO, [
    makeComponent('top', 'bw-top'),
    makeComponent('bottom', 'bw-bottom'),
    makeComponent('shoes', 'bw-shoes'),
  ]);

  const freshItems: OutfitSet[] = Array.from({ length: 7 }, (_, i) =>
    makeOutfit(`boundary-fresh-${i}`, SCENARIO, [
      makeComponent('top', `bf-top-${i}`),
      makeComponent('bottom', `bf-bottom-${i}`),
      makeComponent('shoes', `bf-shoes-${i}`),
    ]),
  );

  const wornFp = fingerprint(wornOutfit.components);
  const pool = [wornOutfit, ...freshItems];

  const ordered = applyFreshnessOrder(pool, new Set([wornFp]));

  assert(
    ordered.length === pool.length,
    'applyFreshnessOrder preserves pool length',
  );

  assert(
    fingerprint(ordered[ordered.length - 1].components) === wornFp,
    'Worn outfit is at index len-1 after freshness ordering (independent of tieredShuffle or quota)',
  );

  const nonWornPositions = ordered.slice(0, ordered.length - 1);
  const wornInFront = nonWornPositions.some(o => fingerprint(o.components) === wornFp);
  assert(
    !wornInFront,
    'Worn outfit does not appear anywhere before the last position',
  );
});

describe('5d. Hero-diversity ordering boundary: yesterday-hero outfit lands at index len-1 regardless of pool size or quota', () => {
  // This test calls applyHeroDiversityOrder directly — no tieredShuffle, no
  // quota — so the ordering guarantee cannot silently pass for the wrong reason
  // if either of those variables changes in the future.
  //
  // Pool layout (old-hero outfit first, so it would surface without ordering):
  //   [oldHeroOutfit, freshA, freshB, freshC, freshD, freshE, freshF, freshG]
  // After applyHeroDiversityOrder:
  //   [freshA, freshB, freshC, freshD, freshE, freshF, freshG, oldHeroOutfit]
  // Invariant: oldHeroOutfit must be at position len-1 (last).

  const SCENARIO: OccasionTag = 'work';
  const OLD_HERO_ID = 'boundary-old-hero';

  const oldHeroOutfit = makeOutfit('boundary-old-hero-outfit', SCENARIO, [
    makeComponent('top', OLD_HERO_ID),
    makeComponent('bottom', 'boh-bottom'),
    makeComponent('shoes', 'boh-shoes'),
  ], { heroId: OLD_HERO_ID });

  const freshItems: OutfitSet[] = Array.from({ length: 7 }, (_, i) =>
    makeOutfit(`boundary-fresh-hero-${i}`, SCENARIO, [
      makeComponent('top', `bfh-top-${i}`),
      makeComponent('bottom', `bfh-bottom-${i}`),
      makeComponent('shoes', `bfh-shoes-${i}`),
    ], { heroId: `fresh-hero-${i}` }),
  );

  // Old-hero outfit placed first so without ordering it would surface first.
  const pool = [oldHeroOutfit, ...freshItems];
  const prevDayHeroIds = { [SCENARIO]: [OLD_HERO_ID] };

  const ordered = applyHeroDiversityOrder(pool, prevDayHeroIds, SCENARIO);

  assert(
    ordered.length === pool.length,
    'applyHeroDiversityOrder preserves pool length',
  );

  assert(
    ordered[ordered.length - 1].heroId === OLD_HERO_ID,
    'Yesterday-hero outfit is at index len-1 after hero-diversity ordering (independent of tieredShuffle or quota)',
  );

  const nonOldPositions = ordered.slice(0, ordered.length - 1);
  const oldHeroInFront = nonOldPositions.some(o => o.heroId === OLD_HERO_ID);
  assert(
    !oldHeroInFront,
    'Yesterday-hero outfit does not appear anywhere before the last position',
  );

  // When no prevDayHeroIds exist the pool is returned unchanged.
  const orderedNoPrev = applyHeroDiversityOrder(pool, {}, SCENARIO);
  assert(
    orderedNoPrev === pool,
    'applyHeroDiversityOrder returns the original pool reference when no previous heroes exist',
  );

  // Only outfits matching the specific scenario's prevDayHeroIds are deprioritised;
  // a different scenario's heroes must not affect this scenario's ordering.
  const prevOtherScenario = { casual: [OLD_HERO_ID] };
  const orderedOtherScen = applyHeroDiversityOrder(pool, prevOtherScenario, SCENARIO);
  assert(
    orderedOtherScen[0].heroId === OLD_HERO_ID,
    'Hero from a different scenario\'s prevDayHeroIds does not affect the current scenario ordering',
  );
});

// ── 6. Weekend cursor nudge ───────────────────────────────────────────────────

describe('6. Weekend cursor nudge: work scenario advances by 1 extra on weekends only', () => {
  const SATURDAY = '2026-06-13';
  const MONDAY = '2026-06-15';

  const pool = buildPool();
  const state = { ...INITIAL_ROTATION_STATE, shuffleSeed: 42 };

  const { newState: weekendState } = applyDailyRotation(pool, state, SATURDAY, undefined, false);
  const { newState: weekdayState } = applyDailyRotation(pool, state, MONDAY, undefined, false);

  const weekendWorkCursor = weekendState.todayCursors['work'] ?? 0;
  const weekdayWorkCursor = weekdayState.todayCursors['work'] ?? 0;

  assert(
    weekendWorkCursor - weekdayWorkCursor === 1,
    'work cursor is exactly 1 ahead on Saturday vs a weekday (same seed/state)',
  );

  const NON_WORK_SCENARIOS: OccasionTag[] = ['casual', 'date-casual', 'event'];
  for (const scenario of NON_WORK_SCENARIOS) {
    const weekendCursor = weekendState.todayCursors[scenario] ?? 0;
    const weekdayCursor = weekdayState.todayCursors[scenario] ?? 0;
    assert(
      weekendCursor === weekdayCursor,
      `${scenario} cursor is unaffected by the weekend nudge`,
    );
  }
});

// ── Direct applyCompletenessBias tests ────────────────────────────────────────

describe('applyCompletenessBias: complete outfit rises to index 0', () => {
  const BASE_SCORE = 5;

  // Incomplete outfit placed first in pool — no shoes.
  const incompleteFirst: OutfitSet = makeOutfit(
    'acb-incomplete',
    'casual',
    [
      makeComponent('top', 'acb-top-a'),
      makeComponent('bottom', 'acb-btm-a'),
      makeComponent('bag', 'acb-bag-a'),
      makeComponent('jewelry', 'acb-jwl-a'),
    ],
    { confidenceScore: BASE_SCORE },
  );

  // Complete outfit placed second in pool — shoes + bag + jewelry all present.
  const completeSecond: OutfitSet = makeOutfit(
    'acb-complete',
    'casual',
    [
      makeComponent('top', 'acb-top-b'),
      makeComponent('bottom', 'acb-btm-b'),
      makeComponent('shoes', 'acb-sh-b'),
      makeComponent('bag', 'acb-bag-b'),
      makeComponent('jewelry', 'acb-jwl-b'),
    ],
    { confidenceScore: BASE_SCORE },
  );

  const pool: OutfitSet[] = [incompleteFirst, completeSecond];
  const result = applyCompletenessBias(pool);

  assert(result.length === pool.length, 'applyCompletenessBias preserves pool length');

  assert(
    result[0].id === 'acb-complete',
    'Complete outfit (shoes+bag+jewelry) rises to index 0 after applyCompletenessBias',
  );

  assert(
    (result[0].confidenceScore ?? 0) === BASE_SCORE + 1,
    `Complete outfit confidenceScore is bumped to ${BASE_SCORE + 1}`,
  );

  assert(
    (result[1].confidenceScore ?? 0) === BASE_SCORE,
    `Incomplete outfit confidenceScore remains ${BASE_SCORE} (no bias applied)`,
  );

  // An outfit missing only bag is also incomplete.
  const noBag: OutfitSet = makeOutfit(
    'acb-no-bag',
    'casual',
    [
      makeComponent('top', 'acb-top-c'),
      makeComponent('bottom', 'acb-btm-c'),
      makeComponent('shoes', 'acb-sh-c'),
      makeComponent('jewelry', 'acb-jwl-c'),
    ],
    { confidenceScore: BASE_SCORE },
  );

  const resultNoBag = applyCompletenessBias([completeSecond, noBag]);
  assert(
    resultNoBag[0].id === 'acb-complete',
    'Outfit missing bag does not receive bias; complete outfit stays at index 0',
  );

  // An outfit missing only jewelry is also incomplete.
  const noJewelry: OutfitSet = makeOutfit(
    'acb-no-jwl',
    'casual',
    [
      makeComponent('top', 'acb-top-d'),
      makeComponent('bottom', 'acb-btm-d'),
      makeComponent('shoes', 'acb-sh-d'),
      makeComponent('bag', 'acb-bag-d'),
    ],
    { confidenceScore: BASE_SCORE },
  );

  const resultNoJwl = applyCompletenessBias([noJewelry, completeSecond]);
  assert(
    resultNoJwl[0].id === 'acb-complete',
    'Outfit missing jewelry does not receive bias; complete outfit rises to index 0',
  );

  // Empty pool is returned unchanged.
  const resultEmpty = applyCompletenessBias([]);
  assert(resultEmpty.length === 0, 'applyCompletenessBias handles empty pool');
});

describe('applyCompletenessBias: equal-score outfits retain original pool order', () => {
  const BASE_SCORE = 3;

  // Two complete outfits with the same starting score — after the +1 bump they
  // both land on BASE_SCORE + 1.  The one that appeared first in the pool must
  // still be first in the result.
  const completeA: OutfitSet = makeOutfit(
    'acb-stable-a',
    'casual',
    [
      makeComponent('top', 'acb-top-sa'),
      makeComponent('bottom', 'acb-btm-sa'),
      makeComponent('shoes', 'acb-sh-sa'),
      makeComponent('bag', 'acb-bag-sa'),
      makeComponent('jewelry', 'acb-jwl-sa'),
    ],
    { confidenceScore: BASE_SCORE },
  );

  const completeB: OutfitSet = makeOutfit(
    'acb-stable-b',
    'casual',
    [
      makeComponent('top', 'acb-top-sb'),
      makeComponent('bottom', 'acb-btm-sb'),
      makeComponent('shoes', 'acb-sh-sb'),
      makeComponent('bag', 'acb-bag-sb'),
      makeComponent('jewelry', 'acb-jwl-sb'),
    ],
    { confidenceScore: BASE_SCORE },
  );

  const resultAB = applyCompletenessBias([completeA, completeB]);
  assert(
    resultAB[0].id === 'acb-stable-a',
    'Equal-score complete outfits: first pool entry stays at index 0 (A before B)',
  );
  assert(
    resultAB[1].id === 'acb-stable-b',
    'Equal-score complete outfits: second pool entry stays at index 1 (B after A)',
  );

  // Reverse the input order — B must now be first.
  const resultBA = applyCompletenessBias([completeB, completeA]);
  assert(
    resultBA[0].id === 'acb-stable-b',
    'Equal-score complete outfits: first pool entry stays at index 0 (B before A)',
  );
  assert(
    resultBA[1].id === 'acb-stable-a',
    'Equal-score complete outfits: second pool entry stays at index 1 (A after B)',
  );
});

// ── 7. tieredShuffle: input-order tie-breaking ───────────────────────────────

describe('7. tieredShuffle: identically-scored pool preserves input order across tier boundaries', () => {
  // When all outfits share the same confidenceScore, the only key is the
  // original pool index.  The pool-index tie-breaker ensures earlier entries
  // always land in a higher-or-equal tier relative to later entries.
  //
  // Pool of 6 identically-scored outfits labelled by input position:
  //   [P0, P1, P2, P3, P4, P5]
  //
  // After stable sort by (score desc, index asc): same order as input.
  // Tier assignment (Math.ceil(6/3) = 2):
  //   top = [P0, P1]   mid = [P2, P3]   low = [P4, P5]
  //
  // seededShuffle may reorder within each tier, but the tier boundaries are
  // fixed — P0 and P1 can never appear after P2 or P3 in the output.

  const SCENARIO: OccasionTag = 'casual';
  const SCORE = 5;
  const SEED = 31337;

  const poolIds = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
  const pool: OutfitSet[] = poolIds.map(id =>
    makeOutfit(id, SCENARIO, [
      makeComponent('top', `${id}-top`),
      makeComponent('bottom', `${id}-btm`),
      makeComponent('shoes', `${id}-sh`),
    ], { confidenceScore: SCORE }),
  );

  const result = tieredShuffle(pool, SEED);

  assert(result.length === pool.length, 'tieredShuffle preserves pool length');

  // Verify tier boundaries: output positions 0-1 contain only top-tier ids,
  // positions 2-3 contain only mid-tier ids, positions 4-5 contain only low-tier ids.
  const topTierIds = new Set(['p0', 'p1']);
  const midTierIds = new Set(['p2', 'p3']);
  const lowTierIds = new Set(['p4', 'p5']);

  const outputIds = result.map(o => o.id ?? '');

  const topSlice = new Set(outputIds.slice(0, 2));
  const midSlice = new Set(outputIds.slice(2, 4));
  const lowSlice = new Set(outputIds.slice(4, 6));

  assert(
    [...topTierIds].every(id => topSlice.has(id)),
    'Input-order top tier (p0, p1) occupies output positions 0-1 after tieredShuffle',
  );
  assert(
    [...midTierIds].every(id => midSlice.has(id)),
    'Input-order mid tier (p2, p3) occupies output positions 2-3 after tieredShuffle',
  );
  assert(
    [...lowTierIds].every(id => lowSlice.has(id)),
    'Input-order low tier (p4, p5) occupies output positions 4-5 after tieredShuffle',
  );
});

describe('7b. tieredShuffle: freshness/hero-diversity ordering is not undone for tied scores', () => {
  // Regression guard: the freshness and hero-diversity passes push certain
  // outfits to the end of the pool *before* tieredShuffle runs.  With the
  // pool-index tie-breaker those outfits must stay in the low tier even when
  // all confidenceScores are equal.
  //
  // Scenario: 5 identically-scored outfits.  The worn outfit starts at
  // input position 0 but applyFreshnessOrder moves it to the last position
  // before the pool reaches tieredShuffle.  It must end up in the low tier.
  //
  // Pool after freshness ordering: [fresh1, fresh2, fresh3, fresh4, worn]
  // third = Math.ceil(5/3) = 2
  //   top = [fresh1, fresh2]   mid = [fresh3, fresh4]   low = [worn]

  const SCENARIO: OccasionTag = 'casual';
  const SCORE = 5;
  const SEED = 7;

  const worn = makeOutfit('worn-tie', SCENARIO, [
    makeComponent('top', 'wt-top'),
    makeComponent('bottom', 'wt-btm'),
    makeComponent('shoes', 'wt-sh'),
  ], { confidenceScore: SCORE });

  const freshItems = Array.from({ length: 4 }, (_, i) =>
    makeOutfit(`fresh-tie-${i}`, SCENARIO, [
      makeComponent('top', `ft-top-${i}`),
      makeComponent('bottom', `ft-btm-${i}`),
      makeComponent('shoes', `ft-sh-${i}`),
    ], { confidenceScore: SCORE }),
  );

  // Simulate what applyFreshnessOrder does: worn outfit pushed to end.
  const poolAfterFreshness: OutfitSet[] = [...freshItems, worn];

  const result = tieredShuffle(poolAfterFreshness, SEED);

  assert(result.length === poolAfterFreshness.length, 'tieredShuffle preserves pool length (freshness guard)');

  // The worn outfit was at index 4 (last) so it lands in the low tier.
  // With Math.ceil(5/3)=2: top=[0,1], mid=[2,3], low=[4].
  // Output positions 4 must be the worn outfit.
  const wornInOutput = result[result.length - 1];
  assert(
    wornInOutput.id === 'worn-tie',
    'Worn outfit (last after freshness ordering) stays in low tier after tieredShuffle — upstream ordering signal preserved',
  );

  // Verify none of the low-tier outfits appear in the top half of the output.
  const freshIds = new Set(freshItems.map(o => o.id!));
  const topHalf = result.slice(0, 4);
  const onlyFreshInTopHalf = topHalf.every(o => freshIds.has(o.id ?? ''));
  assert(
    onlyFreshInTopHalf,
    'All 4 output positions 0-3 are fresh outfits — worn outfit not promoted by tieredShuffle',
  );
});

// ── 8. generateOutfitPool tie-breaker stability ───────────────────────────────

describe('8. generateOutfitPool: identical wardrobe produces identical pool ordering on every call', () => {
  // Minimal wardrobe with enough variety to produce multiple outfits per
  // scenario and create natural score ties (same category, same occasion tags,
  // same formality level).
  const makeItem = (
    id: string,
    category: WardrobeItem['category'],
    subType: string,
    colorFamily: string,
    occasionTags: OccasionTag[],
  ): WardrobeItem => ({
    id,
    photoUri: '',
    category,
    subType,
    colorFamily,
    occasionTags,
    seasonTags: ['all-season'],
    formalityLevel: 3,
    createdAt: '2026-01-01',
  });

  const ALL_OCCASIONS: OccasionTag[] = ['work', 'casual', 'date-casual'];

  const wardrobe: WardrobeItem[] = [
    makeItem('top-a', 'top', 'blouse', 'white', ALL_OCCASIONS),
    makeItem('top-b', 'top', 'blouse', 'navy', ALL_OCCASIONS),
    makeItem('top-c', 'top', 'blouse', 'black', ALL_OCCASIONS),
    makeItem('btm-a', 'bottom', 'trousers', 'black', ALL_OCCASIONS),
    makeItem('btm-b', 'bottom', 'trousers', 'navy', ALL_OCCASIONS),
    makeItem('btm-c', 'bottom', 'trousers', 'beige', ALL_OCCASIONS),
    makeItem('sh-a',  'shoes', 'pumps', 'black', ALL_OCCASIONS),
    makeItem('sh-b',  'shoes', 'pumps', 'nude', ALL_OCCASIONS),
    makeItem('sh-c',  'shoes', 'loafers', 'tan', ALL_OCCASIONS),
  ];

  const profile: UserProfile = {
    name: 'Test',
    styleGoalPrimary: 'minimal',
    styleGoalSecondary: null,
    bodyType: 'rectangle',
    skinTone: 'medium',
    eyeColor: 'dark-brown',
    undertone: null,
    lifestyleWork: 40,
    lifestyleCasual: 40,
    lifestyleEvents: 20,
    lifestyleActive: 0,
    lifestyleBrunch: 0,
    constraints: { noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'any' },
    onboardingComplete: true,
    weatherEnabled: false,
  };

  const pool1 = generateOutfitPool(wardrobe, profile);
  const pool2 = generateOutfitPool(wardrobe, profile);

  for (const scenario of SCENARIOS) {
    const ids1 = (pool1[scenario] ?? []).map(o => o.id).join(',');
    const ids2 = (pool2[scenario] ?? []).map(o => o.id).join(',');
    assert(
      ids1 === ids2,
      `generateOutfitPool: '${scenario}' pool order is identical across two calls with the same wardrobe`,
    );
  }

  // Also verify that the hero-group ordering is stable (heroOrder tie-breaker).
  // Collect all heroIds in order for one scenario and check consistency.
  const heroIds1 = (pool1['casual'] ?? []).map(o => o.heroId ?? '').join(',');
  const heroIds2 = (pool2['casual'] ?? []).map(o => o.heroId ?? '').join(',');
  assert(
    heroIds1 === heroIds2,
    'generateOutfitPool: hero interleave order for \'casual\' is identical across two calls',
  );
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n─────────────────────────────────────────────');
if (failed === 0) {
  console.log('All outfit-rotation tests passed.');
} else {
  console.error(`${failed} test(s) failed.`);
  process.exit(1);
}
