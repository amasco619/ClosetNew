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
  pickHeroCandidates,
  SCENARIO_HERO_SUBTYPES,
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
import { generateOutfitsForItem } from '../constants/outfitGenerator';
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
  'brunch', 'active', 'resort', 'night-out',
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

// ── 10. Brunch and active scenario coverage ───────────────────────────────────
//
// Regression guard: brunch, active, resort, and night-out were previously
// absent from ALL_SCENARIOS, so items tagged for those occasions produced zero
// Just Added suggestions. This section verifies the full pipeline handles them.

console.log('\nBrunch and active scenario coverage:');

// ALL_SCENARIOS_REF must include the extended scenarios
assert(ALL_SCENARIOS_REF.includes('brunch'),    'ALL_SCENARIOS includes brunch');
assert(ALL_SCENARIOS_REF.includes('active'),    'ALL_SCENARIOS includes active');
assert(ALL_SCENARIOS_REF.includes('resort'),    'ALL_SCENARIOS includes resort');
assert(ALL_SCENARIOS_REF.includes('night-out'), 'ALL_SCENARIOS includes night-out');

// ── Step 1: brunch/active tags survive the ALL_SCENARIOS filter ──────────────
// An item tagged ['brunch'] should pass straight through to targetScenarios.
const brunchTaggedItem = item({ subType: 'jeans', colorFamily: 'navy', occasionTags: ['brunch'] });
const brunchStep1 = brunchTaggedItem.occasionTags.filter(t => ALL_SCENARIOS_REF.includes(t));
assert(brunchStep1.includes('brunch'), 'brunch-tagged item: brunch tag survives ALL_SCENARIOS filter');
assert(brunchStep1.length === 1,       'brunch-tagged item: only one scenario extracted');

const activeTaggedItem = item({ subType: 'leggings', colorFamily: 'black', formalityLevel: 1, occasionTags: ['active'] });
const activeStep1 = activeTaggedItem.occasionTags.filter(t => ALL_SCENARIOS_REF.includes(t));
assert(activeStep1.includes('active'), 'active-tagged item: active tag survives ALL_SCENARIOS filter');
assert(activeStep1.length === 1,       'active-tagged item: only one scenario extracted');

// ── Step 2: score-based fallback includes brunch / active for matching items ──
// jeans (formality 3) is in the brunch SCENARIO_AFFINITY list → score > 0
// leggings (formality 1) is in the active SCENARIO_AFFINITY list → score > 0
const jeansNoTag    = item({ subType: 'jeans',    colorFamily: 'navy',  formalityLevel: 3, occasionTags: [] });
const leggingsNoTag = item({ subType: 'leggings', colorFamily: 'black', formalityLevel: 1, occasionTags: [] });
const baseProf = profile();

const jeansBrunchScore   = scoreItemForProfile(jeansNoTag,    'brunch', baseProf);
const leggingsActiveScore = scoreItemForProfile(leggingsNoTag, 'active', baseProf);
assert(jeansBrunchScore   > 0, 'jeans/navy scores > 0 for brunch → included in score-based fallback');
assert(leggingsActiveScore > 0, 'leggings/black scores > 0 for active → included in score-based fallback');

// Scenario-affinity subtypes score higher in their home scenario than a mis-matched one.
// leggings (active-affinity) should score higher in active than in night-out
const leggingsActiveScore2 = scoreItemForProfile(leggingsNoTag, 'active',    baseProf);
const leggingsNightOut     = scoreItemForProfile(leggingsNoTag, 'night-out', baseProf);
assert(leggingsActiveScore2 > leggingsNightOut, 'leggings scores higher for active than for night-out (affinity match)');

// jeans (brunch-affinity) should score higher in brunch than in work
const jeansBrunchScore2 = scoreItemForProfile(jeansNoTag, 'brunch', baseProf);
const jeansWorkScore    = scoreItemForProfile(jeansNoTag, 'work',   baseProf);
assert(jeansBrunchScore2 >= jeansWorkScore, 'jeans scores at least as high for brunch as for work (affinity match)');

// ── Active subtype coverage ───────────────────────────────────────────────────
// Each active-scenario subtype explicitly listed in SCENARIO_AFFINITY must
// score > 0 for the active scenario so it surfaces in the score-based fallback.

const trainingShoes  = item({ category: 'shoes',    subType: 'training-shoes', colorFamily: 'white', formalityLevel: 1, occasionTags: [] });
const windbreaker    = item({ category: 'outerwear', subType: 'windbreaker',   colorFamily: 'black', formalityLevel: 2, occasionTags: [] });
const sportsHoodie   = item({ category: 'top',       subType: 'sports-hoodie', colorFamily: 'grey',  formalityLevel: 1, occasionTags: [] });

assert(scoreItemForProfile(trainingShoes, 'active', baseProf) > 0,  'training-shoes scores > 0 for active');
assert(scoreItemForProfile(windbreaker,   'active', baseProf) > 0,  'windbreaker scores > 0 for active');
assert(scoreItemForProfile(sportsHoodie,  'active', baseProf) > 0,  'sports-hoodie scores > 0 for active');

// Active items should score higher in active than in a clearly mismatched scenario (date-dressy).
assert(
  scoreItemForProfile(trainingShoes, 'active', baseProf) > scoreItemForProfile(trainingShoes, 'date-dressy', baseProf),
  'training-shoes scores higher in active than date-dressy',
);
assert(
  scoreItemForProfile(windbreaker, 'active', baseProf) > scoreItemForProfile(windbreaker, 'date-dressy', baseProf),
  'windbreaker scores higher in active than date-dressy',
);

// ── Active hero candidacy: windbreaker / training-shoes / sports-hoodie ────────
// These subtypes have low general distinctiveness (neutral colour, flat fabric)
// but must surface as hero candidates in the active scenario so the rotation
// engine can build looks *around* them rather than treating them as accessories.
console.log('\npickHeroCandidates — active hero candidacy:');

// Verify the SCENARIO_HERO_SUBTYPES map declares the expected subtypes.
assert(
  SCENARIO_HERO_SUBTYPES['active']?.has('windbreaker'),
  'SCENARIO_HERO_SUBTYPES.active includes windbreaker',
);
assert(
  SCENARIO_HERO_SUBTYPES['active']?.has('training-shoes'),
  'SCENARIO_HERO_SUBTYPES.active includes training-shoes',
);
assert(
  SCENARIO_HERO_SUBTYPES['active']?.has('sports-hoodie'),
  'SCENARIO_HERO_SUBTYPES.active includes sports-hoodie',
);

// Build a small wardrobe where the windbreaker / training-shoes are the most
// "active-appropriate" pieces but would otherwise fail the distinctiveness
// threshold (white/grey/black neutrals, synthetic fabric).
const activeHeroWardrobe: WardrobeItem[] = [
  item({ category: 'outerwear', subType: 'windbreaker',    colorFamily: 'white', formalityLevel: 2, occasionTags: [] }),
  item({ category: 'shoes',    subType: 'training-shoes',  colorFamily: 'white', formalityLevel: 1, occasionTags: [] }),
  item({ category: 'top',      subType: 'sports-hoodie',   colorFamily: 'grey',  formalityLevel: 1, occasionTags: [] }),
  item({ category: 'top',      subType: 'tank-top',        colorFamily: 'black', formalityLevel: 2, occasionTags: [] }),
  item({ category: 'bottom',   subType: 'leggings',        colorFamily: 'black', formalityLevel: 2, occasionTags: [] }),
];

const activeHeroes = pickHeroCandidates(activeHeroWardrobe, 'active', baseProf, 6);
const activeHeroSubtypes = activeHeroes.map(h => h.subType);

assert(
  activeHeroSubtypes.includes('windbreaker'),
  'pickHeroCandidates for active includes windbreaker as a hero candidate',
);
assert(
  activeHeroSubtypes.includes('training-shoes'),
  'pickHeroCandidates for active includes training-shoes as a hero candidate',
);
assert(
  activeHeroSubtypes.includes('sports-hoodie'),
  'pickHeroCandidates for active includes sports-hoodie as a hero candidate',
);

// These items must NOT be hero candidates for a non-active scenario like date-dressy.
// (They fail the formality gate for [5,8] — date-dressy — so they won't qualify.)
const dateDressyHeroes = pickHeroCandidates(activeHeroWardrobe, 'date-dressy', baseProf, 6);
const dateDressySubtypes = dateDressyHeroes.map(h => h.subType);
assert(
  !dateDressySubtypes.includes('windbreaker'),
  'pickHeroCandidates for date-dressy does NOT include windbreaker (formality gate + no scenario bonus)',
);
assert(
  !dateDressySubtypes.includes('training-shoes'),
  'pickHeroCandidates for date-dressy does NOT include training-shoes (formality gate + no scenario bonus)',
);

// ── Brunch subtype coverage ───────────────────────────────────────────────────
// Each brunch-scenario subtype explicitly listed in SCENARIO_AFFINITY must
// score > 0 for the brunch scenario so it surfaces in the score-based fallback.

const midiDress   = item({ category: 'dress',   subType: 'midi-dress',  colorFamily: 'cream', formalityLevel: 5, occasionTags: [] });
const sandals     = item({ category: 'shoes',   subType: 'sandals',     colorFamily: 'tan',   formalityLevel: 3, occasionTags: [] });
const blockHeels  = item({ category: 'shoes',   subType: 'block-heels', colorFamily: 'tan',   formalityLevel: 4, occasionTags: [] });
const loafers     = item({ category: 'shoes',   subType: 'loafers',     colorFamily: 'black', formalityLevel: 5, occasionTags: [] });
const wickerBag   = item({ category: 'bag',     subType: 'wicker-bag',  colorFamily: 'beige', formalityLevel: 3, occasionTags: [] });

assert(scoreItemForProfile(midiDress,  'brunch', baseProf) > 0,  'midi-dress scores > 0 for brunch');
assert(scoreItemForProfile(sandals,    'brunch', baseProf) > 0,  'sandals score > 0 for brunch');
assert(scoreItemForProfile(blockHeels, 'brunch', baseProf) > 0,  'block-heels score > 0 for brunch');
assert(scoreItemForProfile(loafers,    'brunch', baseProf) > 0,  'loafers score > 0 for brunch');
assert(scoreItemForProfile(wickerBag,  'brunch', baseProf) > 0,  'wicker-bag scores > 0 for brunch');

// Brunch items should score higher in brunch than in a clearly mismatched scenario (active).
assert(
  scoreItemForProfile(midiDress, 'brunch', baseProf) > scoreItemForProfile(midiDress, 'active', baseProf),
  'midi-dress scores higher in brunch than active',
);
assert(
  scoreItemForProfile(blockHeels, 'brunch', baseProf) > scoreItemForProfile(blockHeels, 'active', baseProf),
  'block-heels score higher in brunch than active',
);
assert(
  scoreItemForProfile(loafers, 'brunch', baseProf) > scoreItemForProfile(loafers, 'active', baseProf),
  'loafers score higher in brunch than active',
);
assert(
  scoreItemForProfile(wickerBag, 'brunch', baseProf) > scoreItemForProfile(wickerBag, 'active', baseProf),
  'wicker-bag scores higher in brunch than active',
);

// ── Step 3: formality gate for brunch [3,5] and active [1,2] ──────────────────
// brunch band: [3, 5]
assert(passesFormality(item({ subType: 'jeans',    colorFamily: 'navy'  }), 'brunch', profile()), 'jeans passes brunch formality gate [3,5]');
assert(!passesFormality(item({ subType: 'blouse',  colorFamily: 'white' }), 'brunch', profile()), 'blouse (formality 6) blocked by brunch formality gate [3,5]');
assert(!passesFormality(item({ subType: 't-shirt', colorFamily: 'white' }), 'brunch', profile()), 't-shirt (formality 2) blocked by brunch formality gate [3,5]');

// active band: [1, 2]
assert(
  passesFormality(item({ subType: 'sneakers', colorFamily: 'white' }), 'active', profile()),
  'sneakers (formality 1) passes active formality gate [1,2]',
);
assert(
  !passesFormality(item({ subType: 'blouse', colorFamily: 'white' }), 'active', profile()),
  'blouse (formality 6) blocked by active formality gate [1,2]',
);

// ── Full pipeline for brunch: tagged item with formality-gate enforcement ──────
// Hero tagged ['brunch', 'wedding']: jeans formality 3 → brunch [3,5] ✓, wedding [6,9] ✗
const brunchHero = item({ subType: 'jeans', colorFamily: 'navy', occasionTags: ['brunch', 'wedding'] });
const brunchPipeline1 = brunchHero.occasionTags.filter(t => ALL_SCENARIOS_REF.includes(t));
const brunchPipeline3 = brunchPipeline1.filter(s => passesFormality(brunchHero, s, profile()));
assert(brunchPipeline3.includes('brunch'),   'brunch pipeline: brunch survives formality gate (jeans formality 3 in [3,5])');
assert(!brunchPipeline3.includes('wedding'), 'brunch pipeline: wedding dropped by formality gate (jeans formality 3 outside [6,9])');

// ── Full pipeline for active: tagged item with formality-gate enforcement ───────
// Hero tagged ['active', 'work']: sneakers formality 1 → active [1,2] ✓, work [4,7] ✗
const activeHero = item({ subType: 'sneakers', colorFamily: 'white', occasionTags: ['active', 'work'] });
const activePipeline1 = activeHero.occasionTags.filter(t => ALL_SCENARIOS_REF.includes(t));
const activePipeline3 = activePipeline1.filter(s => passesFormality(activeHero, s, profile()));
assert(activePipeline3.includes('active'), 'active pipeline: active survives formality gate (sneakers formality 1 in [1,2])');
assert(!activePipeline3.includes('work'),  'active pipeline: work dropped by formality gate (sneakers formality 1 outside [4,7])');

// ── Integration: real generateOutfitsForItem calls ────────────────────────────
// These tests call the actual function with deterministic fixtures and assert
// on the returned OutfitSet[] — if the production scenario list or formality
// gate wiring regresses, these tests will catch it.
//
// Wardrobe design: items have no seasonTags (→ fits all seasons) and no
// formalityLevel override beyond what effectiveFormality infers from subType,
// so the test behaves identically regardless of when it runs.

console.log('\ngenerateOutfitsForItem — integration:');

// Helper: make a deterministic WardrobeItem with a unique id
function wardrobeItem(
  id: string,
  category: WardrobeItem['category'],
  subType: string,
  colorFamily: string,
  occasionTags: OccasionTag[] = [],
  formalityLevel = 3,
): WardrobeItem {
  return {
    id,
    photoUri: '',
    category,
    subType,
    colorFamily,
    occasionTags,
    seasonTags: [],
    formalityLevel,
    createdAt: '2026-01-01',
  };
}

const integrationProfile = profile();

// ── Brunch integration ────────────────────────────────────────────────────────
// Hero: navy jeans tagged ['brunch'] (formality 3 — inside brunch band [3,5])
// Supporting wardrobe provides a top + shoes so the completeness gate is met.
const brunchJeans = wardrobeItem('hero-brunch', 'bottom', 'jeans', 'navy', ['brunch'], 3);
const brunchWardrobe: WardrobeItem[] = [
  brunchJeans,
  wardrobeItem('s-top-1',  'top',   'blouse',  'white', [],  6),
  wardrobeItem('s-shoe-1', 'shoes', 'sandals', 'tan',   [],  3),
];

const brunchSets = generateOutfitsForItem(brunchJeans, brunchWardrobe, integrationProfile, null);
assert(brunchSets.length > 0, 'brunch hero: generateOutfitsForItem returns at least one set');
assert(
  brunchSets.some(s => s.scenario === 'brunch'),
  'brunch hero: at least one returned OutfitSet has scenario === "brunch"',
);
assert(
  brunchSets.every(s => s.components.some(c => c.matchedItemId === brunchJeans.id)),
  'brunch hero: hero item appears in every returned set',
);

// ── Active integration ────────────────────────────────────────────────────────
// Hero: black leggings tagged ['active'] (formality 1 — inside active band [1,2])
// Supporting wardrobe: tank-top + sneakers so completeness gate is met.
const activeLeggings = wardrobeItem('hero-active', 'bottom', 'leggings', 'black', ['active'], 1);
const activeWardrobe: WardrobeItem[] = [
  activeLeggings,
  wardrobeItem('a-top-1',  'top',   'tank-top', 'black', [], 2),
  wardrobeItem('a-shoe-1', 'shoes', 'sneakers', 'white', [], 1),
];

const activeSets = generateOutfitsForItem(activeLeggings, activeWardrobe, integrationProfile, null);
assert(activeSets.length > 0, 'active hero: generateOutfitsForItem returns at least one set');
assert(
  activeSets.some(s => s.scenario === 'active'),
  'active hero: at least one returned OutfitSet has scenario === "active"',
);
assert(
  activeSets.every(s => s.components.some(c => c.matchedItemId === activeLeggings.id)),
  'active hero: hero item appears in every returned set',
);

// ── Regression guard: un-tagged item falls back to brunch/active via scoring ──
// A leggings item with no occasion tags should still produce an active set when
// the score-based fallback selects active as a qualifying scenario.
const untaggedLeggings = wardrobeItem('hero-untagged', 'bottom', 'leggings', 'black', [], 1);
const fallbackWardrobe: WardrobeItem[] = [
  untaggedLeggings,
  wardrobeItem('f-top-1',  'top',   'tank-top', 'black', [], 2),
  wardrobeItem('f-shoe-1', 'shoes', 'sneakers', 'white', [], 1),
];

const fallbackSets = generateOutfitsForItem(untaggedLeggings, fallbackWardrobe, integrationProfile, null);
assert(
  fallbackSets.some(s => s.scenario === 'active'),
  'untagged leggings: score-based fallback includes active scenario',
);

// ── #107: Resort and night-out hero subtypes ──────────────────────────────────
// Verify SCENARIO_HERO_SUBTYPES declarations for the two new scenarios, then
// confirm those subtypes surface as hero candidates inside their matching
// scenario and are blocked by the formality gate in mismatched scenarios.

console.log('\nSCENARIO_HERO_SUBTYPES — resort declarations:');

assert(
  SCENARIO_HERO_SUBTYPES['resort']?.has('swimsuit'),
  'SCENARIO_HERO_SUBTYPES.resort declares swimsuit',
);
assert(
  SCENARIO_HERO_SUBTYPES['resort']?.has('resort-dress'),
  'SCENARIO_HERO_SUBTYPES.resort declares resort-dress',
);
assert(
  SCENARIO_HERO_SUBTYPES['resort']?.has('cover-up'),
  'SCENARIO_HERO_SUBTYPES.resort declares cover-up',
);
assert(
  SCENARIO_HERO_SUBTYPES['resort']?.has('kaftan'),
  'SCENARIO_HERO_SUBTYPES.resort declares kaftan',
);

console.log('\nSCENARIO_HERO_SUBTYPES — night-out declarations:');

assert(
  SCENARIO_HERO_SUBTYPES['night-out']?.has('mini-dress'),
  'SCENARIO_HERO_SUBTYPES[night-out] declares mini-dress',
);
assert(
  SCENARIO_HERO_SUBTYPES['night-out']?.has('bodycon-dress'),
  'SCENARIO_HERO_SUBTYPES[night-out] declares bodycon-dress',
);
assert(
  SCENARIO_HERO_SUBTYPES['night-out']?.has('sequin-top'),
  'SCENARIO_HERO_SUBTYPES[night-out] declares sequin-top',
);
assert(
  SCENARIO_HERO_SUBTYPES['night-out']?.has('strappy-heels'),
  'SCENARIO_HERO_SUBTYPES[night-out] declares strappy-heels',
);

// ── Resort hero candidacy ─────────────────────────────────────────────────────
// resort-dress (f=3) and kaftan (f=2) sit inside resort band [1,4].
// Their hero bonus (+8) overrides the low general distinctiveness score
// (neutral palette, no statement fabric) and pushes them above the ≥4 gate.
// espadrilles and beach-bag are in the wardrobe but are NOT in HERO_CATEGORIES
// (bag is excluded); espadrilles (shoes) may or may not pass — don't assert it.

console.log('\npickHeroCandidates — resort hero candidacy:');

const resortWardrobe: WardrobeItem[] = [
  // Vivid resort-dress: saturation boost + hero bonus → well above gate.
  item({ id: 'r-dress',  category: 'dress',    subType: 'resort-dress', colorFamily: 'coral',  formalityLevel: 3, occasionTags: [] }),
  // Neutral kaftan: hero bonus alone (+8) is enough to pass the ≥4 gate.
  item({ id: 'r-kaftan', category: 'outerwear', subType: 'kaftan',      colorFamily: 'beige',  formalityLevel: 2, occasionTags: [] }),
  // Non-SCENARIO_HERO subtype in resort: sundress. May or may not qualify.
  item({ id: 'r-sdress', category: 'dress',    subType: 'sundress',     colorFamily: 'white',  formalityLevel: 3, occasionTags: [] }),
  item({ id: 'r-shoe',   category: 'shoes',    subType: 'espadrilles',  colorFamily: 'beige',  formalityLevel: 3, occasionTags: [] }),
];

const resortHeroes       = pickHeroCandidates(resortWardrobe, 'resort', baseProf, 6);
const resortHeroSubtypes = resortHeroes.map(h => h.subType);

assert(
  resortHeroSubtypes.includes('resort-dress'),
  'pickHeroCandidates for resort: resort-dress surfaces as hero candidate',
);
assert(
  resortHeroSubtypes.includes('kaftan'),
  'pickHeroCandidates for resort: kaftan surfaces as hero candidate (hero bonus overrides low distinctiveness)',
);

// Resort signature pieces are gated from work by formality.
// Work band [4,7], stretch [3,8].
// kaftan (f=2) is below the stretch floor → blocked.
// resort-dress (f=3) sits exactly on the stretch floor — eligible as a
// stretch candidate but without a work hero bonus it scores too low to pass
// the ≥4 distinctiveness gate. We do NOT assert it's absent from work heroes
// because, with enough saturation, it could legitimately stretch in.
// Instead verify that swimsuit (f=1) — clearly below the stretch floor — is
// never surfaced as a work hero regardless of its hero bonus.
const workResortWardrobe: WardrobeItem[] = [
  item({ id: 'wr-swim',  category: 'dress',    subType: 'swimsuit',    colorFamily: 'white', formalityLevel: 1, occasionTags: [] }),
  item({ id: 'wr-kaftn', category: 'outerwear', subType: 'kaftan',     colorFamily: 'beige', formalityLevel: 2, occasionTags: [] }),
  item({ id: 'wr-rdres', category: 'dress',    subType: 'resort-dress', colorFamily: 'coral', formalityLevel: 3, occasionTags: [] }),
];
const workHeroesFromResort = pickHeroCandidates(workResortWardrobe, 'work', baseProf, 6);
const workHeroSubtypesR    = workHeroesFromResort.map(h => h.subType);
assert(
  !workHeroSubtypesR.includes('kaftan'),
  'kaftan does NOT appear as work hero (f=2 < work stretch floor 3)',
);
assert(
  !workHeroSubtypesR.includes('swimsuit'),
  'swimsuit does NOT appear as work hero (f=1 clearly below work stretch floor 3)',
);

// ── Night-out hero candidacy ──────────────────────────────────────────────────
// Night-out band is [5,8], stretch [4,9].
// mini-dress (f=4): on the edge of the stretch — eligible.
// strappy-heels (f=6): inside band, hero bonus pushes it past the ≥4 gate
//   even with the neutral-colour dampener applied (−2 + 8 = +6 ≥ 4).
// sequin-top with vivid colorFamily: saturation boost + hero bonus, easily ≥4.

console.log('\npickHeroCandidates — night-out hero candidacy:');

const nightOutWardrobe: WardrobeItem[] = [
  // Vivid sequin-top: saturation boost (colorFamily 'red' → high sat) + hero bonus.
  item({ id: 'n-seq',    category: 'top',    subType: 'sequin-top',    colorFamily: 'red',    formalityLevel: 6, occasionTags: [] }),
  // Neutral strappy-heels: hero bonus (8) outweighs neutral dampener (−2) → +6.
  item({ id: 'n-heels',  category: 'shoes',  subType: 'strappy-heels', colorFamily: 'black',  formalityLevel: 6, occasionTags: [] }),
  // mini-dress on the stretch boundary.
  item({ id: 'n-mini',   category: 'dress',  subType: 'mini-dress',    colorFamily: 'black',  formalityLevel: 4, occasionTags: [] }),
  // bodycon-dress inside band.
  item({ id: 'n-body',   category: 'dress',  subType: 'bodycon-dress', colorFamily: 'navy',   formalityLevel: 5, occasionTags: [] }),
  item({ id: 'n-skirt',  category: 'bottom', subType: 'midi-skirt',    colorFamily: 'black',  formalityLevel: 5, occasionTags: [] }),
  item({ id: 'n-clutch', category: 'bag',    subType: 'clutch',        colorFamily: 'black',  formalityLevel: 6, occasionTags: [] }),
];

const nightOutHeroes       = pickHeroCandidates(nightOutWardrobe, 'night-out', baseProf, 6);
const nightOutHeroSubtypes = nightOutHeroes.map(h => h.subType);

assert(
  nightOutHeroSubtypes.includes('sequin-top'),
  'pickHeroCandidates for night-out: sequin-top surfaces as hero (saturation + hero bonus)',
);
assert(
  nightOutHeroSubtypes.includes('strappy-heels'),
  'pickHeroCandidates for night-out: strappy-heels surfaces as hero (hero bonus overrides neutral dampener)',
);
assert(
  nightOutHeroSubtypes.includes('bodycon-dress'),
  'pickHeroCandidates for night-out: bodycon-dress surfaces as hero',
);

// strappy-heels (f=6) is blocked in casual (band [1,5], stretch [0,6] — f=6 is
// within stretch). Without the night-out hero bonus, its distinctiveness is too
// low (neutral black, no statement fabric → approx −2 < 4) to pass the gate.
const casualHeroesFromNightOut = pickHeroCandidates(nightOutWardrobe, 'casual', baseProf, 6);
const casualSubtypes           = casualHeroesFromNightOut.map(h => h.subType);
assert(
  !casualSubtypes.includes('strappy-heels'),
  'strappy-heels does NOT appear as casual hero (low distinctiveness without night-out bonus)',
);

// ── #108: Active hero companion bag preference ────────────────────────────────
// When the outfit is anchored by windbreaker, training-shoes, or sports-hoodie,
// the outfit generator must prefer gym-bag / backpack over other bag types so
// the active kit reads sport-complete.

console.log('\ngenerateOutfitsForItem — active hero companion bag preference:');

// Test 1: windbreaker hero (outerwear branch) + gym-bag + crossbody
// Expected: gym-bag is chosen over crossbody in the active scenario outfit.
const windbreaker108 = wardrobeItem('h108-wb',    'outerwear', 'windbreaker', 'black', ['active'], 2);
const wbWardrobe: WardrobeItem[] = [
  windbreaker108,
  wardrobeItem('wb-top',   'top',    'sports-bra', 'black', [], 1),
  wardrobeItem('wb-bot',   'bottom', 'leggings',   'black', [], 2),
  wardrobeItem('wb-shoe',  'shoes',  'sneakers',   'white', [], 1),
  wardrobeItem('wb-gym',   'bag',    'gym-bag',    'black', [], 1),
  wardrobeItem('wb-cross', 'bag',    'crossbody',  'beige', [], 3),
];

const wbSets      = generateOutfitsForItem(windbreaker108, wbWardrobe, integrationProfile, null);
const wbActiveSet = wbSets.find(s => s.scenario === 'active');

assert(
  !!wbActiveSet,
  'windbreaker hero: generateOutfitsForItem produces at least one active set',
);
if (wbActiveSet) {
  const bagComponent = wbActiveSet.components.find(c => c.category === 'bag');
  assert(
    bagComponent?.matchedItemId === 'wb-gym',
    'windbreaker hero in active: gym-bag preferred over crossbody',
  );
}

// Test 2: training-shoes hero (shoes branch) + backpack + tote
// Expected: backpack is chosen over tote in the active scenario outfit.
const trainingShoes108 = wardrobeItem('h108-ts', 'shoes', 'training-shoes', 'white', ['active'], 1);
const tsWardrobe: WardrobeItem[] = [
  trainingShoes108,
  wardrobeItem('ts-top',      'top',    'sports-bra', 'black', [], 1),
  wardrobeItem('ts-bot',      'bottom', 'leggings',   'black', [], 2),
  wardrobeItem('ts-backpack', 'bag',    'backpack',   'black', [], 1),
  wardrobeItem('ts-tote',     'bag',    'tote',       'beige', [], 4),
];

const tsSets      = generateOutfitsForItem(trainingShoes108, tsWardrobe, integrationProfile, null);
const tsActiveSet = tsSets.find(s => s.scenario === 'active');

assert(
  !!tsActiveSet,
  'training-shoes hero: generateOutfitsForItem produces at least one active set',
);
if (tsActiveSet) {
  const bagComponent = tsActiveSet.components.find(c => c.category === 'bag');
  assert(
    bagComponent?.matchedItemId === 'ts-backpack',
    'training-shoes hero in active: backpack preferred over tote',
  );
}

// Test 3: sports-hoodie hero (top branch) + gym-bag + shoulder-bag
// Expected: gym-bag is chosen over shoulder-bag (higher formality, lower active fit).
const sportsHoodie108 = wardrobeItem('h108-sh', 'top', 'sports-hoodie', 'grey', ['active'], 1);
const shWardrobe: WardrobeItem[] = [
  sportsHoodie108,
  wardrobeItem('sh-bot',      'bottom', 'leggings',      'black', [], 2),
  wardrobeItem('sh-shoe',     'shoes',  'sneakers',      'white', [], 1),
  wardrobeItem('sh-gym',      'bag',    'gym-bag',       'black', [], 1),
  wardrobeItem('sh-shoulder', 'bag',    'shoulder-bag',  'beige', [], 5),
];

const shSets      = generateOutfitsForItem(sportsHoodie108, shWardrobe, integrationProfile, null);
const shActiveSet = shSets.find(s => s.scenario === 'active');

assert(
  !!shActiveSet,
  'sports-hoodie hero: generateOutfitsForItem produces at least one active set',
);
if (shActiveSet) {
  const bagComponent = shActiveSet.components.find(c => c.category === 'bag');
  assert(
    bagComponent?.matchedItemId === 'sh-gym',
    'sports-hoodie hero in active: gym-bag preferred over shoulder-bag',
  );
}

// Test 4: regression — non-active hero (blouse) should NOT apply active bag
// preference even when both active and non-active bags are available.
const blouse108 = wardrobeItem('h108-bl', 'top', 'blouse', 'white', ['work'], 6);
const blouseWardrobe: WardrobeItem[] = [
  blouse108,
  wardrobeItem('bl-bot',   'bottom', 'trousers',  'black', [], 6),
  wardrobeItem('bl-shoe',  'shoes',  'heels',     'black', [], 6),
  wardrobeItem('bl-gym',   'bag',    'gym-bag',   'black', [], 1),
  wardrobeItem('bl-tote',  'bag',    'tote',      'black', [], 4),
];

const blouseSets     = generateOutfitsForItem(blouse108, blouseWardrobe, integrationProfile, null);
const blouseWorkSet  = blouseSets.find(s => s.scenario === 'work');
if (blouseWorkSet) {
  const bagComponent = blouseWorkSet.components.find(c => c.category === 'bag');
  // In work scenario, tote scores higher than gym-bag — the companion pool
  // preference must NOT be applied for a non-active hero.
  assert(
    bagComponent?.matchedItemId !== 'bl-gym',
    'blouse work hero: gym-bag companion preference NOT applied (non-active hero)',
  );
}

// ── Summary ───────────────────────────────────────────────────────────────────

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nall outfit generator assertions passed');
