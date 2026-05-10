/**
 * Unit tests for the outfit rotation and scoring engine.
 *
 * Covers the four core areas called out in the task:
 *   1. Color harmony rules  (colorsHarmonize)
 *   2. Occasion tag / constraint filtering  (passesConstraints)
 *   3. Outerwear gating  (outerwearRule — representative cases; full suite in weather.test.ts)
 *   4. Affinity multiplier composition  (computeAffinity, itemAffinityMultiplier,
 *        pairAffinityMultiplier, comboPairAffinityMultiplier)
 *
 * Secondary scoring helpers also tested:
 *   • effectiveFormality / getScenarioFormality
 *   • itemFitsSeason / currentSeason
 *   • itemMatchesMood / itemContradictsMood
 *   • scoreItemForProfile (key scoring dimensions)
 *
 * Run: `npx tsx __tests__/outfitGenerator.test.ts`
 * Exits non-zero on any failed assertion.
 */

import { colorsHarmonize } from '../constants/colorTheory';
import {
  passesConstraints,
  effectiveFormality,
  getScenarioFormality,
  itemMatchesMood,
  itemContradictsMood,
  itemFitsSeason,
  currentSeason,
  scoreItemForProfile,
} from '../constants/outfitScoring';
import {
  computeAffinity,
  itemAffinityMultiplier,
  pairAffinityMultiplier,
  comboPairAffinityMultiplier,
  EMPTY_AFFINITY,
  MIN_SIGNALS_TO_APPLY,
} from '../constants/affinity';
import { outerwearRule } from '../constants/weatherPure';
import type {
  WardrobeItem,
  UserProfile,
  OccasionTag,
  WeatherSnapshot,
  OutfitReaction,
  WearEntry,
} from '../constants/types';

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

// ── Minimal factory helpers ───────────────────────────────────────────────────

function item(overrides: Partial<WardrobeItem> = {}): WardrobeItem {
  return {
    id: 'i1',
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

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
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
    constraints: {
      noSleeveless: false,
      noShortSkirts: false,
      maxHeelHeight: 'any',
    },
    onboardingComplete: true,
    ...overrides,
  };
}

function snap(overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot {
  return {
    fetchedAt: Date.now(),
    lat: 51.5,
    lon: -0.1,
    currentTempC: 15,
    highC: 20,
    lowC: 15,
    precipProbability: 0,
    source: 'ip',
    ...overrides,
  };
}

// ── 1. Color harmony (colorsHarmonize) ────────────────────────────────────────

console.log('\ncolorsHarmonize:');

// Identical colors always harmonize
assert(colorsHarmonize('black', 'black'), 'same color → harmonizes');
assert(colorsHarmonize('navy', 'navy'),   'same color (navy) → harmonizes');

// Neutral + any chromatic → neutral-bridge (harmonizes)
assert(colorsHarmonize('black', 'red'),       'black + red → harmonizes (neutral bridge)');
assert(colorsHarmonize('white', 'blue'),      'white + blue → harmonizes (neutral bridge)');
assert(colorsHarmonize('beige', 'emerald'),   'beige + emerald → harmonizes (neutral bridge)');
assert(colorsHarmonize('camel', 'burgundy'),  'camel + burgundy → harmonizes (neutral bridge)');
assert(colorsHarmonize('navy', 'pink'),       'navy + pink → harmonizes (neutral bridge)');

// Two neutrals always harmonize
assert(colorsHarmonize('black', 'white'),  'black + white → harmonizes (neutrals)');
assert(colorsHarmonize('grey', 'cream'),   'grey + cream → harmonizes (neutrals)');
assert(colorsHarmonize('brown', 'beige'),  'brown + beige → harmonizes (neutrals)');

// Explicit clash pairs (CLASH_PAIRS keys are pre-sorted alphabetically to match pairKey)
assert(!colorsHarmonize('burgundy', 'coral'),'burgundy + coral → clash');
assert(!colorsHarmonize('mustard', 'pink'),  'mustard + pink → clash');
assert(!colorsHarmonize('orange', 'pink'),   'orange + pink → clash');
assert(!colorsHarmonize('coral', 'pink'),    'coral + pink → clash');

// ── 2. Constraint filtering (passesConstraints) ───────────────────────────────

console.log('\npassesConstraints:');

// noSleeveless
assert(
  !passesConstraints(item({ subType: 'tank-top' }), profile({ constraints: { noSleeveless: true, noShortSkirts: false, maxHeelHeight: 'any' } })),
  'noSleeveless: tank-top fails',
);
assert(
  passesConstraints(item({ subType: 't-shirt' }), profile({ constraints: { noSleeveless: true, noShortSkirts: false, maxHeelHeight: 'any' } })),
  'noSleeveless: t-shirt passes',
);

// noShortSkirts
assert(
  !passesConstraints(item({ category: 'bottom', subType: 'mini-skirt' }), profile({ constraints: { noSleeveless: false, noShortSkirts: true, maxHeelHeight: 'any' } })),
  'noShortSkirts: mini-skirt fails',
);
assert(
  !passesConstraints(item({ category: 'dress', subType: 'mini-dress' }), profile({ constraints: { noSleeveless: false, noShortSkirts: true, maxHeelHeight: 'any' } })),
  'noShortSkirts: mini-dress fails',
);
assert(
  passesConstraints(item({ category: 'bottom', subType: 'midi-skirt' }), profile({ constraints: { noSleeveless: false, noShortSkirts: true, maxHeelHeight: 'any' } })),
  'noShortSkirts: midi-skirt passes',
);

// maxHeelHeight
assert(
  !passesConstraints(item({ category: 'shoes', subType: 'heels' }), profile({ constraints: { noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'flat' } })),
  'maxHeelHeight flat: heels fail',
);
assert(
  !passesConstraints(item({ category: 'shoes', subType: 'heels' }), profile({ constraints: { noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'low' } })),
  'maxHeelHeight low: heels fail',
);
assert(
  passesConstraints(item({ category: 'shoes', subType: 'flats' }), profile({ constraints: { noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'flat' } })),
  'maxHeelHeight flat: flats pass',
);
assert(
  passesConstraints(item({ category: 'shoes', subType: 'heels' }), profile({ constraints: { noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'any' } })),
  'maxHeelHeight any: heels pass',
);

// colorAversions
assert(
  !passesConstraints(
    item({ colorFamily: 'yellow' }),
    profile({ constraints: { noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'any', colorAversions: ['yellow'] } }),
  ),
  'colorAversion: item in aversion color fails',
);
assert(
  !passesConstraints(
    item({ colorFamily: 'black', accentColor: 'orange' }),
    profile({ constraints: { noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'any', colorAversions: ['orange'] } }),
  ),
  'colorAversion: item with averse accent color fails',
);
assert(
  passesConstraints(
    item({ colorFamily: 'black' }),
    profile({ constraints: { noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'any', colorAversions: ['yellow'] } }),
  ),
  'colorAversion: item not in aversion list passes',
);

// No constraints: everything passes
assert(
  passesConstraints(item({ subType: 'tank-top' }), profile()),
  'no constraints: any item passes',
);

// ── 3. Formality logic ────────────────────────────────────────────────────────

console.log('\neffectiveFormality:');

// Known sub-type values from SUBTYPE_FORMALITY
assert(effectiveFormality(item({ subType: 't-shirt' })) === 2,      't-shirt → formality 2');
assert(effectiveFormality(item({ subType: 'blouse' })) === 6,       'blouse → formality 6');
assert(effectiveFormality(item({ subType: 'hoodie' })) === 1,       'hoodie → formality 1');
assert(effectiveFormality(item({ subType: 'cocktail-dress' })) === 7,'cocktail-dress → formality 7');
assert(effectiveFormality(item({ subType: 'heels' })) === 6,        'heels → formality 6');
assert(effectiveFormality(item({ subType: 'sneakers' })) === 1,     'sneakers → formality 1');
assert(effectiveFormality(item({ subType: 'blazer' })) === 6,       'blazer → formality 6');
assert(effectiveFormality(item({ subType: 'jeans' })) === 3,        'jeans → formality 3');

// Unknown sub-type falls back to item.formalityLevel
assert(effectiveFormality(item({ subType: 'unknown-thing', formalityLevel: 7 })) === 7, 'unknown subType → falls back to formalityLevel 7');
assert(effectiveFormality(item({ subType: 'unknown-thing', formalityLevel: 3 })) === 3, 'unknown subType → falls back to formalityLevel 3');

console.log('\ngetScenarioFormality:');

// Interview: industry-aware
const [iMin, iMax] = getScenarioFormality('interview', profile({ industry: 'creative' }));
assert(iMin === 4 && iMax === 7, 'interview + creative industry → [4, 7]');

const [tMin, tMax] = getScenarioFormality('interview', profile({ industry: 'tech' }));
assert(tMin === 5 && tMax === 8, 'interview + tech industry → [5, 8]');

const [cMin, cMax] = getScenarioFormality('interview', profile({ industry: 'corporate' }));
assert(cMin === 6 && cMax === 9, 'interview + corporate → [6, 9]');

const [nMin, nMax] = getScenarioFormality('interview', profile({ industry: undefined }));
assert(nMin === 6 && nMax === 9, 'interview + no industry → [6, 9]');

// Static scenarios
const [casMin, casMax] = getScenarioFormality('casual', profile());
assert(casMin === 1 && casMax === 5, 'casual → [1, 5]');

const [wedMin, wedMax] = getScenarioFormality('wedding', profile());
assert(wedMin === 6 && wedMax === 9, 'wedding → [6, 9]');

const [wrkMin, wrkMax] = getScenarioFormality('work', profile());
assert(wrkMin === 4 && wrkMax === 7, 'work → [4, 7]');

// ── 4. Season filtering (itemFitsSeason) ──────────────────────────────────────

console.log('\nitemFitsSeason:');

// No tags → always fits any season
assert(itemFitsSeason(item({ seasonTags: [] }), 'winter'),  'no tags → fits winter');
assert(itemFitsSeason(item({ seasonTags: [] }), 'summer'),  'no tags → fits summer');

// all-season → always fits
assert(itemFitsSeason(item({ seasonTags: ['all-season'] }), 'winter'), 'all-season → fits winter');
assert(itemFitsSeason(item({ seasonTags: ['all-season'] }), 'summer'), 'all-season → fits summer');

// Specific season match
assert(itemFitsSeason(item({ seasonTags: ['summer'] }), 'summer'),   'summer tag → fits summer');
assert(!itemFitsSeason(item({ seasonTags: ['summer'] }), 'winter'),  'summer tag → not fit winter');
assert(!itemFitsSeason(item({ seasonTags: ['summer'] }), 'fall'),    'summer tag → not fit fall');
assert(itemFitsSeason(item({ seasonTags: ['fall', 'winter'] }), 'fall'), 'fall+winter tag → fits fall');
assert(itemFitsSeason(item({ seasonTags: ['fall', 'winter'] }), 'winter'), 'fall+winter tag → fits winter');
assert(!itemFitsSeason(item({ seasonTags: ['fall', 'winter'] }), 'spring'), 'fall+winter tag → not fit spring');

console.log('\ncurrentSeason:');

// currentSeason derives from the month
assert(currentSeason(new Date('2026-01-15')) === 'winter', 'January → winter');
assert(currentSeason(new Date('2026-03-15')) === 'spring', 'March → spring');
assert(currentSeason(new Date('2026-07-15')) === 'summer', 'July → summer');
assert(currentSeason(new Date('2026-10-15')) === 'fall',   'October → fall');
assert(currentSeason(new Date('2026-12-15')) === 'winter', 'December → winter');

// ── 5. Mood logic ─────────────────────────────────────────────────────────────

console.log('\nitemMatchesMood:');

// Color match
assert(itemMatchesMood(item({ colorFamily: 'red' }), 'confident'),    'confident: red color matches');
assert(itemMatchesMood(item({ colorFamily: 'burgundy' }), 'confident'),'confident: burgundy matches');
assert(itemMatchesMood(item({ colorFamily: 'cream' }), 'soft'),       'soft: cream color matches');
assert(itemMatchesMood(item({ colorFamily: 'pink' }), 'joyful'),      'joyful: pink color matches');

// Subtype match
assert(itemMatchesMood(item({ subType: 'blazer' }), 'confident'),     'confident: blazer subtype matches');
assert(itemMatchesMood(item({ subType: 'wrap-dress' }), 'soft'),      'soft: wrap-dress subtype matches');
assert(itemMatchesMood(item({ subType: 'coat' }), 'grounded'),        'grounded: coat subtype matches');

// Fabric match
assert(itemMatchesMood(item({ fabric: 'leather' }), 'confident'),     'confident: leather fabric matches');
assert(itemMatchesMood(item({ fabric: 'cashmere' }), 'soft'),         'soft: cashmere fabric matches');
assert(itemMatchesMood(item({ fabric: 'wool' }), 'grounded'),         'grounded: wool fabric matches');

// Explicit mood tag match
assert(
  itemMatchesMood(item({ mood: ['powerful', 'grounded'] }), 'powerful'),
  'explicit mood tag: powerful matches',
);

// Nothing matching → false
assert(!itemMatchesMood(item({ colorFamily: 'olive', subType: 'sneakers' }), 'powerful'), 'no match → false for powerful');

console.log('\nitemContradictsMood:');

// Color contradictions
assert(itemContradictsMood(item({ colorFamily: 'black' }), 'soft'),       'soft: black contradicts');
assert(itemContradictsMood(item({ colorFamily: 'red' }), 'soft'),         'soft: red contradicts');
assert(itemContradictsMood(item({ colorFamily: 'black' }), 'joyful'),     'joyful: black contradicts');
assert(itemContradictsMood(item({ colorFamily: 'pink' }), 'grounded'),    'grounded: pink contradicts');
assert(itemContradictsMood(item({ colorFamily: 'blush' }), 'powerful'),   'powerful: blush contradicts');

// Subtype contradictions
assert(itemContradictsMood(item({ subType: 'hoodie' }), 'confident'),     'confident: hoodie contradicts');
assert(itemContradictsMood(item({ subType: 'leather-jacket' }), 'soft'),  'soft: leather-jacket contradicts');
assert(itemContradictsMood(item({ subType: 'blazer' }), 'joyful'),        'joyful: blazer contradicts');
assert(itemContradictsMood(item({ subType: 'hoodie' }), 'powerful'),      'powerful: hoodie contradicts');

// Neutral items do not contradict
assert(!itemContradictsMood(item({ colorFamily: 'camel', subType: 'trousers' }), 'confident'), 'no contradiction for neutral item');

// ── 6. scoreItemForProfile ────────────────────────────────────────────────────

console.log('\nscoreItemForProfile:');

// Occasion tag match gives +5
const tagged = item({ subType: 'blouse', colorFamily: 'black', occasionTags: ['work'] });
const noTag  = item({ subType: 'blouse', colorFamily: 'black', occasionTags: [] });
const baseProfile = profile();
assert(
  scoreItemForProfile(tagged, 'work', baseProfile) > scoreItemForProfile(noTag, 'work', baseProfile),
  'occasion tag match → higher score than no tag',
);

// Scenario affinity subtype match (+3 from SCENARIO_AFFINITY)
const casual_shoe = item({ category: 'shoes', subType: 'sneakers', colorFamily: 'white' });
const formal_shoe = item({ category: 'shoes', subType: 'stilettos', colorFamily: 'black' });
assert(
  scoreItemForProfile(casual_shoe, 'casual', baseProfile) > scoreItemForProfile(formal_shoe, 'casual', baseProfile),
  'casual scenario: sneakers score higher than stilettos',
);

// Style-goal color preference (+5 for primary)
const minimalProfile = profile({ styleGoalPrimary: 'minimal' });
const blackItem  = item({ colorFamily: 'black' }); // in minimal preferred colors
const redItem    = item({ colorFamily: 'red' });   // not in minimal preferred colors, non-neutral → off-brief penalty
assert(
  scoreItemForProfile(blackItem, 'casual', minimalProfile) > scoreItemForProfile(redItem, 'casual', minimalProfile),
  'minimal profile: black scores higher than red (preferred color + off-brief penalty)',
);

// Off-brief penalty does NOT apply to jewelry.
// Use a subtype/color that is off-brief for minimal so only the category guard differs.
// mini-dress / red: not in minimal preferred colors or subtypes, not a true neutral →
//   non-jewelry gets -3; jewelry earrings skip the check entirely.
const redJewel  = item({ category: 'jewelry', subType: 'earrings',  colorFamily: 'red' });
const redDress  = item({ category: 'dress',   subType: 'mini-dress', colorFamily: 'red' });
assert(
  scoreItemForProfile(redJewel, 'casual', minimalProfile) > scoreItemForProfile(redDress, 'casual', minimalProfile),
  'off-brief penalty (-3) skipped for jewelry; dress gets penalised',
);

// True neutrals (black/white/grey/cream/beige/navy) are exempt from the off-brief penalty.
// camisole/navy: subtype not in minimal set, navy is a true neutral → exempt.
// camisole/pink: subtype not in minimal set, pink is non-neutral → -3 penalty.
const navyCami = item({ category: 'top', subType: 'camisole', colorFamily: 'navy' });
const pinkCami = item({ category: 'top', subType: 'camisole', colorFamily: 'pink' });
assert(
  scoreItemForProfile(navyCami, 'casual', minimalProfile) > scoreItemForProfile(pinkCami, 'casual', minimalProfile),
  'neutral color exempt from off-brief penalty; non-neutral gets -3',
);

// Undertone harmony (+4 for matching undertone)
const coolProfile = profile({ undertone: 'cool' });
const navyItem  = item({ colorFamily: 'navy' });   // in cool flattering set
const camelItem = item({ colorFamily: 'camel' });  // not in cool flattering set
assert(
  scoreItemForProfile(navyItem, 'casual', coolProfile) > scoreItemForProfile(camelItem, 'casual', coolProfile),
  'cool undertone: navy scores higher than camel',
);

// ── 7. Outerwear gating (outerwearRule) ───────────────────────────────────────

console.log('\nouterwearRule (gating):');

assert(outerwearRule(null)      === 'optional', 'null weather → optional');
assert(outerwearRule(undefined) === 'optional', 'undefined weather → optional');
assert(outerwearRule(snap({ lowC: 8,  highC: 15 })) === 'required',   'lowC 8 → required');
assert(outerwearRule(snap({ lowC: 20, highC: 26 })) === 'suppressed', 'lowC 20, highC 26 → suppressed');
assert(outerwearRule(snap({ lowC: 14, highC: 20 })) === 'optional',   'mid-range → optional');

// Both conditions must hold for suppressed
assert(outerwearRule(snap({ lowC: 20, highC: 24 })) !== 'suppressed', 'lowC 20, highC 24 (not > 24) → not suppressed');
assert(outerwearRule(snap({ lowC: 18, highC: 26 })) !== 'suppressed', 'lowC 18 (not > 18), highC 26 → not suppressed');

// ── 8. Affinity multipliers ───────────────────────────────────────────────────

console.log('\nAffinity — cold start:');

// EMPTY_AFFINITY (signalCount = 0) → all multipliers are exactly 1.0
assert(itemAffinityMultiplier(EMPTY_AFFINITY, 'item1') === 1.0, 'empty affinity: item multiplier is 1.0');
assert(pairAffinityMultiplier(EMPTY_AFFINITY, 'item1', 'item2') === 1.0, 'empty affinity: pair multiplier is 1.0');
assert(comboPairAffinityMultiplier(EMPTY_AFFINITY, ['item1', 'item2', 'item3']) === 1.0, 'empty affinity: combo multiplier is 1.0');

// Fewer than MIN_SIGNALS_TO_APPLY signals → still 1.0
const fewReactions: OutfitReaction[] = [
  { id: 'r1', outfitFingerprint: 'item1|item2', type: 'love', date: '2026-01-01', scenario: 'casual' },
];
const fewState = computeAffinity(fewReactions, [], '2026-01-01');
assert(fewState.signalCount < MIN_SIGNALS_TO_APPLY, `< ${MIN_SIGNALS_TO_APPLY} signals recorded after 1 reaction`);
assert(itemAffinityMultiplier(fewState, 'item1') === 1.0, 'cold start: 1 signal → multiplier still 1.0');

console.log('\nAffinity — computeAffinity signal accumulation:');

const TODAY = '2026-01-01';

// 5 love reactions on the same outfit (same day → full recency weight = 1.0 each)
const loveReactions: OutfitReaction[] = Array.from({ length: 5 }, (_, i) => ({
  id: `r${i}`,
  outfitFingerprint: 'item1|item2',
  type: 'love' as const,
  date: TODAY,
  scenario: 'casual' as const,
}));
const loveState = computeAffinity(loveReactions, [], TODAY);

// signalCount should be 5 (5 × decay 1.0)
assert(Math.abs(loveState.signalCount - 5) < 0.01, 'love reactions: signalCount accumulates to 5');

// itemSignals for item1 should be positive
assert((loveState.itemSignals['item1'] ?? 0) > 0, 'love reactions → positive item signal');

// pairSignals for item1|item2 should be positive
const pairKeyResult = ['item1', 'item2'].sort().join('|');
assert((loveState.pairSignals[pairKeyResult] ?? 0) > 0, 'love reactions → positive pair signal');

// 5 not-today reactions → negative item signals
const notTodayReactions: OutfitReaction[] = Array.from({ length: 5 }, (_, i) => ({
  id: `n${i}`,
  outfitFingerprint: 'item3|item4',
  type: 'not-today' as const,
  date: TODAY,
  scenario: 'casual' as const,
}));
const notTodayState = computeAffinity(notTodayReactions, [], TODAY);
assert((notTodayState.itemSignals['item3'] ?? 0) < 0, 'not-today reactions → negative item signal');

// Wear history adds a +1.4 weight signal per entry
const wearHistory: WearEntry[] = Array.from({ length: 5 }, (_, i) => ({
  id: `w${i}`,
  date: TODAY,
  occasion: 'casual' as const,
  outfitFingerprint: 'item5|item6',
  itemIds: ['item5', 'item6'],
  loggedAt: TODAY,
}));
const wearState = computeAffinity([], wearHistory, TODAY);
// 5 entries × 1.4 weight × 1.0 decay = 7.0 for item5
assert(Math.abs((wearState.itemSignals['item5'] ?? 0) - 7.0) < 0.01, 'wear history: item signal = 5 × 1.4 = 7.0');
assert(wearState.signalCount >= 5, 'wear history contributes to signalCount');

console.log('\nAffinity — itemAffinityMultiplier clamping:');

// 5 love reactions → raw multiplier 1 + 0.08 × 5 = 1.4 → clamped to 1.3
const itemMult = itemAffinityMultiplier(loveState, 'item1');
assert(Math.abs(itemMult - 1.3) < 0.001, `love ×5 → item multiplier clamped to 1.3 (got ${itemMult.toFixed(4)})`);

// 5 not-today → raw 1 + 0.08 × (-5) = 0.6 → clamped to 0.7
const notMult = itemAffinityMultiplier(notTodayState, 'item3');
assert(Math.abs(notMult - 0.7) < 0.001, `not-today ×5 → item multiplier clamped to 0.7 (got ${notMult.toFixed(4)})`);

// Wear ×5 → raw 1 + 0.08 × 7 = 1.56 → clamped to 1.3
const wearMult = itemAffinityMultiplier(wearState, 'item5');
assert(Math.abs(wearMult - 1.3) < 0.001, `wear ×5 → item multiplier clamped to 1.3 (got ${wearMult.toFixed(4)})`);

// Unknown item (no signals) → exactly 1.0 once past cold start
const neutralMult = itemAffinityMultiplier(loveState, 'unseen-item');
assert(neutralMult === 1.0, 'item with no signals → 1.0 (even after cold start lifted)');

console.log('\nAffinity — pairAffinityMultiplier clamping:');

// 5 love reactions on item1+item2 → pairSignal = 5.0 → raw 1 + 0.06 × 5 = 1.3 → clamped to 1.2
const pairMult = pairAffinityMultiplier(loveState, 'item1', 'item2');
assert(Math.abs(pairMult - 1.2) < 0.001, `love ×5 → pair multiplier clamped to 1.2 (got ${pairMult.toFixed(4)})`);

// 5 not-today on item3+item4 → pairSignal = -5 → raw 1 + 0.06 × (-5) = 0.7 → clamped to 0.8
const pairDislike = pairAffinityMultiplier(notTodayState, 'item3', 'item4');
assert(Math.abs(pairDislike - 0.8) < 0.001, `not-today ×5 → pair multiplier clamped to 0.8 (got ${pairDislike.toFixed(4)})`);

// Order should not matter — pairKey is sorted
assert(
  pairAffinityMultiplier(loveState, 'item1', 'item2') ===
  pairAffinityMultiplier(loveState, 'item2', 'item1'),
  'pair multiplier is symmetric (order independent)',
);

// Unknown pair → 1.0
assert(pairAffinityMultiplier(loveState, 'item1', 'unseen') === 1.0, 'unknown pair → 1.0');

console.log('\nAffinity — comboPairAffinityMultiplier:');

// Single item → 1.0 always
assert(comboPairAffinityMultiplier(loveState, ['item1']) === 1.0, 'single-item combo → 1.0');

// Both items with positive pair signal → combo > 1.0
const comboMult = comboPairAffinityMultiplier(loveState, ['item1', 'item2']);
assert(comboMult > 1.0, `2-item combo with positive pair signal → > 1.0 (got ${comboMult.toFixed(4)})`);

// Mixing a liked pair with unknown items — combo should be between 1.0 and max pair value
const mixed = comboPairAffinityMultiplier(loveState, ['item1', 'item2', 'unseen-a', 'unseen-b']);
assert(mixed > 1.0 && mixed <= 1.2, `mixed combo: between 1.0 and 1.2 (got ${mixed.toFixed(4)})`);

// Recency decay: a reaction from 60 days ago should have weight ≈ 0.5 vs today = 1.0
const oldReactions: OutfitReaction[] = Array.from({ length: 5 }, (_, i) => ({
  id: `old${i}`,
  outfitFingerprint: 'itemA|itemB',
  type: 'love' as const,
  date: '2025-11-01',  // ~60 days before 2026-01-01
  scenario: 'casual' as const,
}));
const oldState = computeAffinity(oldReactions, [], TODAY);
// signalCount will be ~2.5 (5 × 0.5 decay), below MIN_SIGNALS_TO_APPLY of 5 → still cold start
assert(oldState.signalCount < MIN_SIGNALS_TO_APPLY, '60-day-old reactions produce half-weighted signalCount');
assert(itemAffinityMultiplier(oldState, 'itemA') === 1.0, '60-day-old reactions insufficient to lift cold start → 1.0');

// ── 9. Occasion-tag scenario selection logic ──────────────────────────────────
//
// generateOutfitsForItem (constants/outfitGenerator.ts) cannot be imported
// directly in this pure-tsx test environment because it transitively imports
// constants/weather.ts, which pulls in expo-location and React Native — the
// same reason weather.test.ts imports from constants/weatherPure.ts instead.
//
// The scenario-selection pipeline inside generateOutfitsForItem is composed
// entirely of pure exported functions. We verify each decision step directly:
//
//   Step 1: newItem.occasionTags.filter(t => ALL_SCENARIOS.includes(t))
//   Step 2: fallback → ALL_SCENARIOS.filter(s => scoreItemForProfile > 0)
//   Step 3: formality gate → fitsScenarioFormality([newItem], scenario, profile)

console.log('\nOccasion-tag scenario selection (pure-function pipeline):');

// The canonical scenario list used inside generateOutfitsForItem
const ALL_SCENARIOS_REF: OccasionTag[] = [
  'casual', 'work', 'date-casual', 'date-dressy', 'event', 'interview', 'wedding', 'travel',
];

// ── Step 1: tag filtering ────────────────────────────────────────────────────
// Valid tags are preserved; unknown tags are dropped; empty list signals fallback

const twoValidTags: OccasionTag[] = ['casual', 'work'];
const filteredTwo = twoValidTags.filter(t => ALL_SCENARIOS_REF.includes(t));
assert(filteredTwo.length === 2, 'two valid occasion tags survive the ALL_SCENARIOS filter');
assert(filteredTwo.includes('casual') && filteredTwo.includes('work'), 'casual and work both preserved');

// OccasionTag is a closed union so invalid values can only enter via unsafe cast at runtime.
// The filter guard drops any such value and the generator falls back gracefully.
const mixedWithBogus = (['casual', 'not-a-real-scenario'] as OccasionTag[]).filter(t => ALL_SCENARIOS_REF.includes(t));
assert(mixedWithBogus.length === 1 && mixedWithBogus[0] === 'casual', 'bogus tag stripped; only casual survives');

const emptyResult = ([] as OccasionTag[]).filter(t => ALL_SCENARIOS_REF.includes(t));
assert(emptyResult.length === 0, 'empty occasionTags → empty filter result → triggers score-based fallback');

// ── Step 2: score-based fallback ─────────────────────────────────────────────
// When occasionTags are absent the engine scores every scenario and keeps those > 0.
//
// We use 'coral' as the item color — it is not in any undertone flattering set
// for the default profile (undertone=null → 'neutral'), and not in any other
// bonus set that might inadvertently inflate the wedding score. This ensures
// the test isolates scenario-affinity and formality-band signals cleanly.
//
// t-shirt / coral:
//   casual  → +3 (scenario affinity: 't-shirt' in casual list) +2 (formality in [1,5]) = 5  > 0 ✓
//   wedding → +0 (no occasion tag, no affinity, formality 2 outside [6,9])            = 0 ≤ 0 ✓

const tshirtNoTag = item({ subType: 't-shirt', colorFamily: 'coral', occasionTags: [] });
const fallbackProfile = profile();

const scoredCasual  = scoreItemForProfile(tshirtNoTag, 'casual',  fallbackProfile);
const scoredWedding = scoreItemForProfile(tshirtNoTag, 'wedding', fallbackProfile);
assert(scoredCasual > 0,   't-shirt/coral scores > 0 for casual → included in score-based fallback');
assert(scoredWedding <= 0, 't-shirt/coral scores ≤ 0 for wedding → excluded from score-based fallback');

const fallbackScenarios = ALL_SCENARIOS_REF.filter(s => scoreItemForProfile(tshirtNoTag, s, fallbackProfile) > 0);
assert(fallbackScenarios.includes('casual'), 'casual in fallback scenario set for t-shirt/coral');
assert(!fallbackScenarios.includes('wedding'), 'wedding not in fallback scenario set for t-shirt/coral');

// blouse / coral: formality 6 → work [4,7] ✓, interview [6,9] ✓, casual [1,5] ✗
const blouseNoTag = item({ subType: 'blouse', colorFamily: 'coral', occasionTags: [] });
const blouseFallback = ALL_SCENARIOS_REF.filter(s => scoreItemForProfile(blouseNoTag, s, fallbackProfile) > 0);
assert(blouseFallback.includes('work'),      'work in fallback scenarios for blouse/coral');
assert(blouseFallback.includes('interview'), 'interview in fallback scenarios for blouse/coral');

// ── Step 3: formality gate (fitsScenarioFormality equivalent) ─────────────────
// The generator calls fitsScenarioFormality([newItem], scenario, profile) and
// skips any scenario where the hero item's formality sits clearly outside the band.
// We replicate the gate using the exported helpers.

function passesFormality(i: WardrobeItem, scenario: OccasionTag, p: UserProfile): boolean {
  const [minF, maxF] = getScenarioFormality(scenario, p);
  const avg = effectiveFormality(i);
  return avg >= minF && avg <= maxF;
}

const tshirtItem = item({ subType: 't-shirt', colorFamily: 'black' });

// t-shirt (formality 2) — casual [1,5] ✓, wedding [6,9] ✗
assert(passesFormality(tshirtItem, 'casual',  profile()), 't-shirt passes casual formality gate [1,5]');
assert(!passesFormality(tshirtItem, 'wedding', profile()), 't-shirt blocked by wedding formality gate [6,9]');
assert(!passesFormality(tshirtItem, 'interview', profile()), 't-shirt blocked by interview formality gate [6,9]');

// blouse (formality 6) — work [4,7] ✓, casual [1,5] ✗
const blouseItem = item({ subType: 'blouse', colorFamily: 'white' });
assert(passesFormality(blouseItem, 'work',   profile()), 'blouse passes work formality gate [4,7]');
assert(!passesFormality(blouseItem, 'casual', profile()), 'blouse blocked by casual formality gate (formality 6 > 5)');

// ── Full pipeline: tagged scenarios filtered by formality gate ─────────────────
// Simulate the complete path for a hero tagged with ['casual', 'wedding']:
//   Step 1: both are valid OccasionTags → ['casual', 'wedding']
//   Step 3: formality gate drops 'wedding' for a t-shirt (2 outside [6,9])

const heroItem = item({ subType: 't-shirt', colorFamily: 'black', occasionTags: ['casual', 'wedding'] });
const step1 = heroItem.occasionTags.filter(t => ALL_SCENARIOS_REF.includes(t));
const step3 = step1.filter(s => passesFormality(heroItem, s, profile()));
assert(step3.includes('casual'),   'full pipeline: casual survives (formality in band)');
assert(!step3.includes('wedding'), 'full pipeline: wedding dropped (t-shirt formality too low)');

// ── Summary ───────────────────────────────────────────────────────────────────

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nall outfit generator assertions passed');
