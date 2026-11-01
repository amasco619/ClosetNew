import assert from 'node:assert/strict';
import { evaluateNigerianStylingV2 as assess } from '../lib/nigerianStyling/v2/evaluate';
import { COVERING_ITEMS, RULES, STYLE_HEADWEAR, TEXTILE_BANDS } from '../lib/nigerianStyling/v2/rules';
import type { ItemFacts, LookFacts } from '../lib/nigerianStyling/v2/types';

// All fixtures are independently authored synthetic facts, not rating-set looks.
const piece = (kind: string, overrides: Partial<ItemFacts> = {}): ItemFacts => ({
  id: kind, kind, key: false, colour: 'navy', textileIdentity: 'premium-ankara',
  quality: 'notPoorPolyester', footwearType: 'other', shoulderCoverage: 'covered',
  hem: 'ankle', headwearHeight: 'notTall', headwearShape: 'lowerWider',
  coralStrands: 1, ...overrides,
});
function look(overrides: Partial<LookFacts> = {}): LookFacts {
  return {
    items: [piece('dress', { key: true })],
    brief: {
      occasion: 'work', role: 'guest', community: 'other', asoEbiBought: false,
      formalityBand: [4, 7], timeOfDay: 'day', titledWoman: false,
      brideColours: [], familyTextiles: [],
    },
    traditionalWear: false, printDominance: 'noPrint',
    v1: { decision: { status: 'eligible', headCoveringSatisfied: true }, gapNotes: [] },
    ...overrides,
  };
}
const dress = (overrides: Partial<ItemFacts> = {}) => piece('dress', { key: true, ...overrides });
const brief = (overrides: Partial<LookFacts['brief']>) => ({ ...look().brief, ...overrides });

const perRuleCases: Record<string, LookFacts> = {
  H01: look({ brief: brief({ occasion: 'whiteWedding' }), items: [dress({ colour: 'cream' })] }),
  H02a: look({
    brief: brief({ occasion: 'traditionalWedding', brideColours: ['navy'] }),
  }),
  H02b: look({
    brief: brief({ occasion: 'traditionalWedding', familyTextiles: ['premium-ankara'] }),
  }),
  H03a: look({ brief: brief({ asoEbiBought: true, asoEbiColour: 'blue', asoEbiTextile: 'premium-ankara' }) }),
  H03b: look({ brief: brief({ asoEbiBought: true, asoEbiColour: 'navy', asoEbiTextile: 'adire' }) }),
  H04: look({ brief: brief({ occasion: 'funeral' }), items: [dress({ colour: 'red' })] }),
  H04q: look({ brief: brief({ occasion: 'funeral' }) }),
  H05: look({ brief: brief({ occasion: 'church' }) }),
  H06: look({ traditionalWear: true, items: [dress(), piece('shoes', { footwearType: 'trainer' })] }),
  H07: look({ items: [dress(), piece('gele'), piece('blazer')] }),
  S01: look({ traditionalWear: true }),
  S02: look({ items: [dress({ quality: 'poorPolyester' })] }),
  S03: look({ printDominance: 'competing' }),
  S04: look({ brief: brief({ formalityBand: [9, 10] }) }),
  S05: look(),
  S06: look({ brief: brief({ occasion: 'owambe', timeOfDay: 'evening' }) }),
  C01: look({
    traditionalWear: true, brief: brief({ community: 'yoruba' }),
    items: [piece('iro', { key: true }), piece('buba', { key: true })],
  }),
  C02: look({
    traditionalWear: true, brief: brief({ community: 'hausa' }),
    items: [piece('abaya', { key: true })],
  }),
  C03: look({
    traditionalWear: true, brief: brief({ community: 'igbo' }),
    items: [dress({ textileIdentity: 'george' })],
  }),
  C04: look({
    traditionalWear: true, brief: brief({ community: 'igbo' }),
    items: [dress(), piece('ichafu', { headwearShape: 'other' })],
  }),
  C05: look({
    traditionalWear: true, brief: brief({ community: 'igbo' }),
    items: [dress(), piece('coral', { coralStrands: 2 })],
  }),
  C06: look({
    traditionalWear: true, brief: brief({ community: 'igbo' }),
    items: [dress(), piece('ivory-odu')],
  }),
  C07: look({ brief: brief({ occasion: 'naming', role: 'mother', formalityBand: [9, 10] }) }),
  C09: look({
    traditionalWear: true, brief: brief({ occasion: 'traditionalEvent' }),
    items: [dress(), piece('gele')],
  }),
};

assert.deepEqual(Object.keys(perRuleCases).sort(), RULES.map(rule => rule.id).sort());
for (const rule of RULES) {
  const input = perRuleCases[rule.id];
  const result = assess(input);
  const hit = result.hits.find(hit => hit.ruleId === rule.id);
  assert.ok(hit, `${rule.id}: synthetic trigger must hit`);
  assert.equal(hit.effect, rule.effect);
  if (rule.failureGroup) assert.ok(result.failureGroups.includes(rule.failureGroup));
  // A known non-matching scope must never hit, including community rules.
  const neutral = assess(look({ items: [dress()], brief: brief({ occasion: 'other' }) }));
  if (!['S02', 'S03', 'S04'].includes(rule.id)) {
    assert.ok(!neutral.hits.some(hit => hit.ruleId === rule.id), `${rule.id}: non-match`);
  }
}

assert.equal(assess(look()).verdict, 'Works');
assert.equal(assess(look({ printDominance: undefined })).verdict, 'Works',
  'missing advisory-only facts do not change the verdict');
assert.equal(assess(perRuleCases.S02).verdict, 'Almost');
assert.ok(assess(look({
  items: [dress(), piece('layer', { quality: 'poorPolyester' })],
})).failureGroups.includes('quality'), 'an explicit poor-quality flag is not limited to base garments');
const qualityAndRegister = look({
  items: [dress({ quality: 'poorPolyester' })], brief: brief({ formalityBand: [9, 10] }),
});
assert.equal(assess(qualityAndRegister).verdict, 'Rethink');
assert.deepEqual(assess(qualityAndRegister).failureGroups, ['quality', 'register']);
assert.equal(assess(look({
  items: [dress({ quality: 'poorPolyester' }), piece('top', { key: true, quality: 'poorPolyester' })],
})).verdict, 'Almost', 'several hits in one group are one independent failure');

const matchingAsoEbi = brief({ asoEbiBought: true, asoEbiColour: 'navy', asoEbiTextile: 'premium-ankara' });
assert.ok(!assess(look({ brief: matchingAsoEbi })).failureGroups.includes('asoEbi'));
const twoAsoEbiMismatches = assess(look({
  brief: { ...matchingAsoEbi, asoEbiColour: 'cream', asoEbiTextile: 'adire' },
}));
assert.equal(twoAsoEbiMismatches.verdict, 'Almost');
assert.equal(twoAsoEbiMismatches.failureGroups.length, 1);
assert.ok(!assess(look({
  brief: brief({ occasion: 'traditionalWedding', role: 'bride', brideColours: ['navy'] }),
})).failureGroups.includes('weddingIdentity'));

for (const kind of STYLE_HEADWEAR) {
  for (const excluded of ['blazer', 'jeans', 'casual']) {
    const result = assess(look({
      brief: brief({ occasion: excluded === 'casual' ? 'casual' : 'work' }),
      items: [dress(), piece(kind), ...(excluded === 'casual' ? [] : [piece(excluded)])],
    }));
    assert.equal(result.verdict, 'Almost', `${kind}/${excluded}`);
    assert.deepEqual(result.failureGroups, ['styleHeadwear']);
    assert.equal(result.hits.filter(hit => hit.failureGroup === 'styleHeadwear').length, 1);
  }
}
for (const kind of COVERING_ITEMS) {
  const result = assess(look({
    brief: brief({ occasion: 'casual' }),
    items: [dress(), piece(kind), piece('blazer'), piece('jeans')],
  }));
  assert.equal(result.verdict, 'Works', `${kind}: coverings never hit style exclusions`);
}
for (const footwearType of ['trainer', 'flipFlop', 'sportsSandal'] as const) {
  const items = [dress(), piece('shoes', { footwearType })];
  assert.equal(assess(look({ items, traditionalWear: true })).verdict, 'Almost');
  assert.equal(assess(look({ items, traditionalWear: false })).verdict, 'Works');
}

for (const [textileIdentity, band] of Object.entries(TEXTILE_BANDS)) {
  const items = [dress({ textileIdentity })];
  assert.ok(!assess(look({ items, brief: brief({ formalityBand: band }) })).failureGroups.includes('register'));
  assert.ok(assess(look({
    items, brief: brief({ formalityBand: [band[1] + 1, band[1] + 1] }),
  })).failureGroups.includes('register'));
}
assert.ok(!assess(look({
  items: [dress({ textileIdentity: 'adire' })], brief: brief({ formalityBand: [6, 7] }),
})).failureGroups.includes('register'), 'touching bands overlap');
assert.ok(!assess(look({
  items: [dress({ textileIdentity: 'aso-oke' })],
  brief: brief({ community: 'yoruba', formalityBand: [9, 10] }),
})).failureGroups.includes('register'));
const unknownAsoOke = assess(look({
  items: [dress({ textileIdentity: 'aso-oke' })], brief: brief({ community: undefined }),
}));
assert.equal(unknownAsoOke.verdict, 'Not judged');
assert.equal(unknownAsoOke.missingFacts['brief.community'], true);
assert.equal(assess(look({
  items: [dress({ textileIdentity: 'aso-oke' })], brief: brief({ community: 'igbo' }),
})).verdict, 'Not judged', 'never apply the Yoruba band to another community');

const unknownCommunity = assess({
  ...perRuleCases.C05, brief: brief({ community: undefined }),
});
assert.ok(!unknownCommunity.failureGroups.includes('roleAdornment'));
assert.ok(unknownCommunity.questions.length > 0);
assert.equal(unknownCommunity.verdict, 'Not judged');
const differentCommunity = assess({
  ...perRuleCases.C05, brief: brief({ community: 'hausa' }),
});
assert.ok(!differentCommunity.failureGroups.includes('roleAdornment'));
assert.ok(!assess({
  ...perRuleCases.C06, brief: brief({ community: 'igbo', titledWoman: true }),
}).failureGroups.includes('roleAdornment'));
assert.ok(!assess({
  ...perRuleCases.C07, brief: brief({ occasion: 'naming', role: 'mother', formalityBand: [8, 8] }),
}).hits.some(hit => hit.ruleId === 'C07'));

for (const colour of ['pink', 'orange', 'yellow', 'green', 'blue']) {
  const result = assess(look({ brief: brief({ occasion: 'funeral' }), items: [dress({ colour })] }));
  assert.ok(!result.failureGroups.includes('funeralColour'));
  assert.ok(result.questions.length > 0);
}
for (const hem of ['aboveKnee', 'knee', 'belowKnee', 'ankle', 'floor'] as const) {
  for (const shoulderCoverage of ['covered', 'uncovered'] as const) {
    const result = assess(look({
      brief: brief({ occasion: 'church' }), items: [dress({ hem, shoulderCoverage })],
    }));
    assert.equal(result.verdict, 'Not judged');
    assert.equal(result.failureGroups.length, 0, 'no invented church threshold');
  }
}
for (const kind of ['agbada', 'fila', 'okpu', 'zanna', 'senator', 'dashiki', 'unknown']) {
  const result = assess(look({ items: [piece(kind, { key: true, quality: 'poorPolyester' })] }));
  assert.equal(result.verdict, 'Not judged');
  assert.equal(result.judged, false, 'abstentions never count as correct judgements');
}
assert.equal(assess(look({ items: [] })).verdict, 'Not judged');
const absentTextile = assess(look({ items: [dress({ textileIdentity: undefined })] }));
assert.equal(absentTextile.missingFacts['items.dress.textileIdentity'], true);
assert.equal(absentTextile.missingFacts['items.dress.quality'], false);
assert.ok(!absentTextile.failureGroups.includes('register'));
const unmappedTextile = assess(look({ items: [dress({ textileIdentity: 'george' })] }));
assert.equal(unmappedTextile.missingFacts['items.dress.textileIdentity'], false);
assert.ok(unmappedTextile.unassessedFacts.includes('items.dress.textileIdentity'));
assert.equal(unmappedTextile.verdict, 'Not judged', 'George is not inferred to be Indian George');
const absentBand = assess(look({ brief: brief({ formalityBand: undefined }) }));
assert.equal(absentBand.missingFacts['brief.formalityBand'], true);
assert.ok(!absentBand.failureGroups.includes('register'), 'never infer a band from a role or occasion');
assert.equal(assess(look({
  brief: brief({ formalityBand: [10, 4] }),
})).verdict, 'Not judged');

const advisory = assess(look({ traditionalWear: true, printDominance: 'competing' }));
assert.equal(advisory.verdict, 'Works');
assert.equal(advisory.failureGroups.length, 0);
assert.ok(advisory.advisoryNotes.length >= 2);
assert.ok(!('score' in advisory));
assert.ok(!('delta' in advisory));
assert.ok(!assess(look({
  traditionalWear: true, items: [dress(), piece('clutch')],
})).hits.some(hit => hit.ruleId === 'S01'));
assert.ok(!assess(look({
  traditionalWear: true, items: [dress(), piece('box-bag')],
})).hits.some(hit => hit.ruleId === 'S01'));
assert.ok(!assess(look({
  brief: brief({ occasion: 'owambe', timeOfDay: 'day' }),
})).hits.some(hit => hit.ruleId === 'S06'));
assert.ok(!assess({
  ...perRuleCases.C01,
  items: [...perRuleCases.C01.items, piece('gele', { headwearHeight: 'tall' })],
}).hits.some(hit => hit.ruleId === 'C01'));
assert.ok(!assess({
  ...perRuleCases.C04, items: [dress(), piece('ichafu', { headwearShape: 'lowerWider' })],
}).hits.some(hit => hit.ruleId === 'C04'));
assert.ok(!assess({
  ...perRuleCases.C05, items: [dress(), piece('coral', { coralStrands: 1 })],
}).hits.some(hit => hit.ruleId === 'C05'));
assert.ok(!assess({
  ...perRuleCases.C09, items: [...perRuleCases.C09.items, piece('blazer')],
}).hits.some(hit => hit.ruleId === 'C09'));

assert.ok(assess(look({
  v1: { decision: { status: 'rejected', headCoveringSatisfied: true, reason: 'incomplete set' }, gapNotes: [] },
})).failureGroups.includes('structure'));
const unsatisfied = assess(look({
  v1: { decision: { status: 'eligible', headCoveringSatisfied: false }, gapNotes: ['V1 covering gap'] },
}));
assert.equal(unsatisfied.verdict, 'Not judged');
assert.ok(unsatisfied.gapNotes.includes('V1 covering gap'));
assert.equal(unsatisfied.failureGroups.length, 0);
assert.equal(assess(look({
  v1: { decision: { status: 'unknown', headCoveringSatisfied: true }, gapNotes: [] },
})).verdict, 'Not judged');

const immutable = look();
const before = JSON.stringify(immutable);
for (const item of immutable.items) Object.freeze(item);
Object.freeze(immutable.items);
Object.freeze(immutable.brief);
Object.freeze(immutable.v1);
Object.freeze(immutable);
assert.deepEqual(assess(immutable), assess(immutable), 'deterministic output');
assert.equal(JSON.stringify(immutable), before, 'facts must not be mutated');
assert.equal(new Set(RULES.map(rule => rule.id)).size, RULES.length);
assert.ok(RULES.every(rule => rule.effect !== 'failure' || rule.failureGroup));
console.log(`Nigerian Styling V2: ${RULES.length} per-rule synthetic cases and boundary tests passed.`);
