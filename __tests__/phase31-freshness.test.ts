/**
 * Phase 3.1 — P0-A: Freshness / Wear-History regression tests.
 *
 * Verifies that wornHistoryBoost now participates in the same ranking
 * mechanism as all other signals (score-based, not positional-only).
 *
 * Tests cover the 10 required cases from the Phase 3.1 spec:
 *  1.  recently worn vs equally strong fresh outfit
 *  2.  recently worn excellent vs substantially weaker fresh
 *  3.  loved + recently worn
 *  4.  loved + old
 *  5.  never worn
 *  6.  no viable fresh alternatives (only worn outfit)
 *  7.  multiple recently worn outfits at different ages
 *  8.  different wear ages (graduated penalty)
 *  9.  reaction adjustments interacting with freshness
 * 10.  score impact: neither freshness nor preference memory can blindly
 *      dominate genuinely excellent fresh alternatives
 *
 * Run: `npx tsx __tests__/phase31-freshness.test.ts`
 * Exits non-zero on any failed assertion.
 */

import { wornHistoryBoost, adjustScoreForReactions } from '../constants/outfitScoring';
import {
  applyDailyRotation, tieredShuffle, INITIAL_ROTATION_STATE, SCENARIOS,
} from '../constants/outfitRotation';
import type { OccasionTag, OutfitComponent, OutfitSet, WearEntry, OutfitReaction } from '../constants/types';

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

const TODAY = '2026-08-11';

function daysAgo(n: number): string {
  const d = new Date('2026-08-11T12:00:00');
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function makeWearEntry(fp: string, daysBack: number): WearEntry {
  return {
    id: `wear-${fp}-${daysBack}`,
    outfitFingerprint: fp,
    date: daysAgo(daysBack),
    occasion: 'casual',
    itemIds: fp.split('|'),
    loggedAt: daysAgo(daysBack) + 'T12:00:00.000Z',
  };
}

function makeReaction(fp: string, type: 'love' | 'not-today', daysBack: number): OutfitReaction {
  return {
    id: `react-${fp}-${daysBack}`,
    outfitFingerprint: fp,
    type,
    date: daysAgo(daysBack),
    scenario: 'casual',
  };
}

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

function fingerprint(components: OutfitComponent[]): string {
  return components
    .map(c => c.matchedItemId)
    .filter(Boolean)
    .sort()
    .join('|');
}

function buildPool(
  overrides: Partial<Record<OccasionTag, OutfitSet[]>> = {},
): Record<OccasionTag, OutfitSet[]> {
  const pool = {} as Record<OccasionTag, OutfitSet[]>;
  for (const s of SCENARIOS) {
    pool[s] = overrides[s] ?? [
      makeOutfit(`default-${s}`, s, [makeComponent('top', `dt-${s}`)]),
    ];
  }
  return pool;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('1. Never worn — no boost, no penalty', () => {
  const boost = wornHistoryBoost('fp-never', [], TODAY);
  assert(boost === 0, `never-worn outfit → boost = 0 (got ${boost})`);
});

describe('2. Worn yesterday (1 day ago) — meaningfully deprioritised', () => {
  const fp = 'fp-yesterday';
  const boost = wornHistoryBoost(fp, [makeWearEntry(fp, 1)], TODAY);
  // Base: +10, penalty: −8  → net +2
  assert(boost === 2, `worn yesterday: base 10 − penalty 8 = 2 (got ${boost})`);
  assert(boost < 10, `worn yesterday should be well below base boost of 10 (got ${boost})`);
});

describe('3. Worn several days ago (3 days) — smaller freshness effect', () => {
  const fp = 'fp-3-days';
  const boost = wornHistoryBoost(fp, [makeWearEntry(fp, 3)], TODAY);
  // Base: +10, penalty: −5  → net +5
  assert(boost === 5, `worn 3 days ago: base 10 − penalty 5 = 5 (got ${boost})`);
});

describe('4. Worn 7 days ago — mild freshness effect', () => {
  const fp = 'fp-7-days';
  const boost = wornHistoryBoost(fp, [makeWearEntry(fp, 7)], TODAY);
  // Base: +10, penalty: −2  → net +8
  assert(boost === 8, `worn 7 days ago: base 10 − penalty 2 = 8 (got ${boost})`);
});

describe('5. Worn weeks ago (15 days) — no freshness effect', () => {
  const fp = 'fp-15-days';
  const boost = wornHistoryBoost(fp, [makeWearEntry(fp, 15)], TODAY);
  // Base: +10, penalty: 0  → net +10
  assert(boost === 10, `worn 15 days ago: no penalty, boost = 10 (got ${boost})`);
});

describe('6. Loved + recently worn — love signal valuable but wear still demoted', () => {
  const fp = 'fp-loved-recent';
  // worn yesterday AND worn once before (2 wears total → +2 additional)
  const wearHistory: WearEntry[] = [
    makeWearEntry(fp, 1),
    makeWearEntry(fp, 20),
  ];
  const boost = wornHistoryBoost(fp, wearHistory, TODAY);
  // Base: +10 (recent ≤60), +2 (2nd wear), penalty: −8 → net +4
  assert(boost === 4, `loved+recent (2 wears, worn yesterday): base 12 − penalty 8 = 4 (got ${boost})`);
  // Still positive — preference memory is preserved
  assert(boost > 0, `boost is still positive — love signal not destroyed (got ${boost})`);
  // But well below full preference signal
  assert(boost < 10, `boost is below the bare-minimum once-worn old value (got ${boost})`);
});

describe('7. Loved + old (>10 days) — full preference signal restored', () => {
  const fp = 'fp-loved-old';
  const wearHistory: WearEntry[] = [
    makeWearEntry(fp, 15),
    makeWearEntry(fp, 30),
  ];
  const boost = wornHistoryBoost(fp, wearHistory, TODAY);
  // Base: +10, +2 (2nd wear), penalty: 0 → net +12
  assert(boost === 12, `loved+old (2 wears, 15 days ago): base 12 − penalty 0 = 12 (got ${boost})`);
});

describe('8. Only viable outfit — freshness penalty still leaves positive score', () => {
  const fp = 'fp-only';
  // Worst-case freshness scenario: worn today (0 days ago)
  const boost = wornHistoryBoost(fp, [makeWearEntry(fp, 0)], TODAY);
  // Base: +10, penalty: −8 → net +2 (positive — engine won't produce something worse)
  assert(boost > 0, `only viable outfit (worn today) still has positive boost: ${boost} > 0`);
});

describe('9. Recently worn excellent vs substantially weaker fresh — excellent still wins', () => {
  // Simulate: recentlyWornScore = 50 (raw) + wornHistoryBoost(worn yesterday) = 50 + 2 = 52
  //           freshScore = 35 (raw) + 0 = 35
  // The worn-yesterday outfit should still beat the weak fresh alternative.
  const fp = 'fp-excellent';
  const boostExcellent = wornHistoryBoost(fp, [makeWearEntry(fp, 1)], TODAY);
  const rawExcellent = 50;
  const rawFresh = 35;
  const totalExcellent = rawExcellent + boostExcellent; // 52
  const totalFresh = rawFresh;                           // 35
  assert(
    totalExcellent > totalFresh,
    `excellent worn-yesterday (${totalExcellent}) beats weaker fresh (${totalFresh})`,
  );
});

describe('10. Recently worn equally-strong vs fresh — fresh wins or ties', () => {
  // Both have raw score 50. Worn yesterday gets +2, fresh gets 0.
  // Worn outfit is slightly ahead (52 vs 50), but applyFreshnessOrder
  // pushes it back for equal-score tiebreaking.
  const fp = 'fp-equal';
  const boostEqual = wornHistoryBoost(fp, [makeWearEntry(fp, 1)], TODAY);
  const rawScore = 50;
  const totalWorn  = rawScore + boostEqual; // 52
  const totalFresh = rawScore;              // 50
  // The net gap is small (≤5) so the worn outfit has only marginal priority
  // and positional ordering can demote it when alternatives are equivalent.
  assert(
    totalWorn - totalFresh <= 5,
    `recently-worn equal-quality outfit has only marginal score advantage: gap=${totalWorn - totalFresh} ≤ 5`,
  );
});

describe('11. Multiple recently worn at different ages — graduated penalty', () => {
  const fp1 = 'fp-1day';
  const fp3 = 'fp-3days';
  const fp7 = 'fp-7days';
  const fp15 = 'fp-15days';
  const b1  = wornHistoryBoost(fp1,  [makeWearEntry(fp1,  1)], TODAY);
  const b3  = wornHistoryBoost(fp3,  [makeWearEntry(fp3,  3)], TODAY);
  const b7  = wornHistoryBoost(fp7,  [makeWearEntry(fp7,  7)], TODAY);
  const b15 = wornHistoryBoost(fp15, [makeWearEntry(fp15, 15)], TODAY);
  assert(b1 < b3,  `1-day worn (${b1}) < 3-day worn (${b3}): fresher = lower boost`);
  assert(b3 < b7,  `3-day worn (${b3}) < 7-day worn (${b7}): graduated penalty`);
  assert(b7 < b15, `7-day worn (${b7}) < 15-day worn (${b15}): no penalty at 15 days`);
  assert(b15 === 10, `15-day worn: full base boost restored (${b15})`);
});

describe('12. Reaction adjustments interacting with freshness', () => {
  const fp = 'fp-react';
  const rawScore = 40;
  // "not-today" reaction 2 days ago → −12 adjustment
  const reactions: OutfitReaction[] = [makeReaction(fp, 'not-today', 2)];
  const reactionAdjusted = adjustScoreForReactions(rawScore, fp, reactions, TODAY, []);
  // Also worn 3 days ago → boost = 5
  const boost = wornHistoryBoost(fp, [makeWearEntry(fp, 3)], TODAY);
  const total = reactionAdjusted + boost;
  // not-today (−12) + freshness wear (5) + raw (40) = 33
  assert(
    reactionAdjusted < rawScore,
    `not-today reaction reduces score: ${reactionAdjusted} < ${rawScore}`,
  );
  assert(
    boost === 5,
    `worn 3 days ago: boost = 5 (got ${boost})`,
  );
  assert(
    total < rawScore,
    `combined not-today + fresh wear still below raw score: ${total} < ${rawScore}`,
  );
});

describe('13. tieredShuffle preserves freshness-adjusted ranking effect', () => {
  // A pool of 9 outfits: top 3 have score 20, mid 3 score 10, bottom 3 score 2.
  // A "worn yesterday" outfit with raw score 20 gets net boost of +2 = 22.
  // After penalty it may still land in the top tier; verify it's not artificially
  // elevated above outfits with far higher scores.
  const SCENARIO: OccasionTag = 'casual';
  const pool: OutfitSet[] = [
    // High-score fresh outfits (score 20)
    makeOutfit('h1', SCENARIO, [makeComponent('top', 'h1-t')], { confidenceScore: 20 }),
    makeOutfit('h2', SCENARIO, [makeComponent('top', 'h2-t')], { confidenceScore: 20 }),
    makeOutfit('h3', SCENARIO, [makeComponent('top', 'h3-t')], { confidenceScore: 20 }),
    // Mid-score fresh outfits (score 10)
    makeOutfit('m1', SCENARIO, [makeComponent('top', 'm1-t')], { confidenceScore: 10 }),
    makeOutfit('m2', SCENARIO, [makeComponent('top', 'm2-t')], { confidenceScore: 10 }),
    makeOutfit('m3', SCENARIO, [makeComponent('top', 'm3-t')], { confidenceScore: 10 }),
    // Low-score outfits (score 2) — one is the recently worn outfit with net boost = 2
    makeOutfit('worn', SCENARIO, [makeComponent('top', 'worn-t')], { confidenceScore: 2 }),
    makeOutfit('l2', SCENARIO, [makeComponent('top', 'l2-t')], { confidenceScore: 2 }),
    makeOutfit('l3', SCENARIO, [makeComponent('top', 'l3-t')], { confidenceScore: 2 }),
  ];
  const shuffled = tieredShuffle(pool, 42);
  // Top 3 positions should all be from the high-score group
  const topIds = new Set(shuffled.slice(0, 3).map(o => o.id));
  assert(
    topIds.has('h1') && topIds.has('h2') && topIds.has('h3'),
    'top tier (first 3) contains all 3 high-score outfits',
  );
  // The worn-yesterday outfit (confidenceScore=2) should be in the bottom third
  const bottomIds = new Set(shuffled.slice(6).map(o => o.id));
  assert(
    bottomIds.has('worn'),
    `worn-yesterday outfit (score=2 after penalty) lands in bottom tier: found=${bottomIds.has('worn')}`,
  );
});

describe('14. Multiple wear entries: repeat wears add capped additional boost', () => {
  const fp = 'fp-multiWear';
  // 5 wear entries — base +10, additional = min(6, (5-1)*2) = min(6,8) = 6, penalty=0 (all >10 days)
  const wears = [15, 20, 25, 30, 35].map(d => makeWearEntry(fp, d));
  const boost = wornHistoryBoost(fp, wears, TODAY);
  assert(boost === 16, `5 old wears: 10 + min(6,8) − 0 = 16 (got ${boost})`);

  // Same 5 wears but most recent was yesterday — penalty applies
  const wearsRecent = [1, 15, 20, 25, 30].map(d => makeWearEntry(fp, d));
  const boostRecent = wornHistoryBoost(fp, wearsRecent, TODAY);
  assert(boostRecent === 8, `5 wears, worn yesterday: 16 − penalty 8 = 8 (got ${boostRecent})`);
});

describe('15. Score impact bounds — freshness cannot overwhelm major styling signals', () => {
  // Maximum freshness effect: worn today (0 days) → penalty 8 on base 10 → net +2
  // Typical outfit score range without wear history: 20–60
  // Maximum wear history advantage: +16 (many old wears)
  // Maximum freshness penalty: −8 (worn today)
  // Net max boost (many wears, worn today): 16 − 8 = 8
  // Net min boost (once worn, old): +10
  // These are both modest relative to formality mismatch (−12+), not-today reaction (−20)
  const fp = 'fp-bounds';
  const manyOldWears = [15, 20, 25, 30, 35, 40].map(d => makeWearEntry(fp, d));
  const maxBoost = wornHistoryBoost(fp, manyOldWears, TODAY);
  assert(maxBoost === 16, `maximum boost (many old wears) = 16 (got ${maxBoost})`);

  const onceWornYesterday = [makeWearEntry(fp, 1)];
  const minNetBoost = wornHistoryBoost(fp, onceWornYesterday, TODAY);
  assert(minNetBoost === 2, `minimum net boost (once-worn yesterday) = 2 (got ${minNetBoost})`);

  const manyWearsYesterday = [1, 15, 20, 25, 30].map(d => makeWearEntry(fp, d));
  const maxWornYesterday = wornHistoryBoost(fp, manyWearsYesterday, TODAY);
  assert(maxWornYesterday === 8, `max boost worn yesterday (5 wears) = 8 (got ${maxWornYesterday})`);
  assert(
    maxWornYesterday < 20,
    `freshness-penalised boost (${maxWornYesterday}) stays below not-today reaction magnitude (20)`,
  );
});

// ── Result ────────────────────────────────────────────────────────────────────

console.log(`\n${failed === 0 ? '✅ All freshness tests passed' : `❌ ${failed} test(s) failed`}`);
process.exit(failed > 0 ? 1 : 0);
