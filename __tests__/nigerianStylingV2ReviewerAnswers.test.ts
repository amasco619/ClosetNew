import assert from 'node:assert/strict';
import type { EventBrief, ItemFacts, LookFacts } from '../lib/nigerianStyling/v2/types';
import { evaluateNigerianStylingV2 as assess } from '../lib/nigerianStyling/v2/evaluate';
import { QUALITY_VOCABULARY, RULES } from '../lib/nigerianStyling/v2/rules';
import { adaptBlindLookFacts, type BlindObservation } from '../lib/nigerianStyling/v2/blindAdapter';
import { applyNigerianStylingV1 } from '../lib/nigerianStyling/v1';

// Synthetic clauses only: do not import, open or evaluate the blind rating set.
function look(item: Partial<ItemFacts> = {}, brief: Partial<EventBrief> = {}): LookFacts {
  return {
    items: [{
      id: 'dress', kind: 'dress', key: true, colour: 'navy',
      textileIdentity: 'premium-ankara', quality: 'notPoorPolyester',
      backless: false, strapless: false, sleeveLength: 'long', hem: 'belowKnee',
      finish: 'other', modest: true, ...item,
    }],
    brief: {
      occasion: 'church', denomination: 'catholic', community: 'other',
      asoEbiBought: false, formalityBand: [4, 7], ...brief,
    },
    traditionalWear: false, printDominance: 'noPrint', wornCover: false,
    v1: { decision: { status: 'eligible', headCoveringSatisfied: true }, gapNotes: [] },
  };
}
const hit = (input: LookFacts, id: string) => assess(input).hits.some(h => h.ruleId === id);
const group = (input: LookFacts, id: 'churchCoverage' | 'statedCoverage' | 'funeralColour') =>
  assess(input).failureGroups.includes(id);
for (const [field, id] of [['backless', 'H05back'], ['strapless', 'H05strap']] as const) {
  const input = look({ [field]: true });
  assert.ok(hit(input, id));
  assert.equal(group(input, 'churchCoverage'), true);
  for (const cover of ['jacket', 'wrap', 'shawl']) {
    assert.ok(!hit({ ...input, wornCover: true }, id), `${cover} worn is an exemption`);
  }
  assert.ok(!hit({ ...input, wornCover: undefined }, id), 'unknown cover is not a proven violation');
  assert.ok(assess({ ...input, wornCover: undefined }).questions.some(q => q.includes('wornCover')));
}
for (const denomination of ['catholic', 'anglican', 'orthodox']) {
  const input = look({ sleeveLength: 'none' }, { denomination });
  assert.ok(hit(input, 'H05sleeve'));
  assert.ok(!hit({ ...input, wornCover: true }, 'H05sleeve'));
  assert.ok(hit(look({ hem: 'clearlyAboveKnee' }, { denomination }), 'H05hem'));
}
assert.ok(!group(look({ sleeveLength: 'none' }, { denomination: 'pentecostal' }), 'churchCoverage'));
assert.ok(!hit(look({ sleeveLength: 'none', modest: true }, { denomination: 'pentecostal' }), 'H05modest'));
assert.ok(hit(look({ sleeveLength: 'none', modest: false }, { denomination: 'pentecostal' }), 'H05modest'));
assert.ok(assess(look({ sleeveLength: 'none', modest: undefined }, { denomination: 'pentecostal' }))
  .questions.some(q => q.includes('modest')));
assert.ok(assess(look({ sleeveLength: 'none' }, { denomination: undefined }))
  .questions.some(q => q.includes('denomination')));
assert.ok(hit(look({ hem: 'clearlyAboveKnee' }, { denomination: 'pentecostal' }), 'H05hemP'));
for (const hem of ['slightlyAboveKnee', 'aboveKnee', undefined] as const) {
  const result = assess(look({ hem }));
  assert.ok(result.questions.some(q => /hem/i.test(q)));
  assert.ok(!result.failureGroups.includes('churchCoverage'));
}
for (const sleeveLength of ['short', 'elbow', 'long'] as const) {
  assert.ok(!group(look({ sleeveLength }), 'churchCoverage'), 'sleeve length alone does not fail');
}
// Church wedding venue applies without changing its wedding occasion.
assert.ok(hit(look({ strapless: true }, { occasion: 'whiteWedding' }), 'H05strap'));
assert.ok(!group(look({ backless: true }, { occasion: 'work', denomination: undefined }), 'churchCoverage'));

for (const area of ['arms', 'shoulders', 'knees', 'head'] as const) {
  const input = { ...look({}, { occasion: 'work', denomination: undefined, statedCoverage: [area] }),
    [`${area}Covered`]: false };
  assert.ok(group(input, 'statedCoverage'));
  assert.ok(!group({ ...input, [`${area}Covered`]: true }, 'statedCoverage'));
  assert.ok(!group({ ...input, [`${area}Covered`]: undefined }, 'statedCoverage'));
  assert.ok(assess({ ...input, [`${area}Covered`]: undefined }).questions.some(q => q.includes(area)));
  assert.ok(!group({ ...input, brief: { ...input.brief, statedCoverage: undefined } }, 'statedCoverage'));
}
const independent = { ...look({ backless: true }, { statedCoverage: ['arms'] }), armsCovered: false };
assert.equal(assess(independent).failureGroups.length, 2);
assert.equal(assess(independent).verdict, 'Rethink');
const oneChurchGroup = look({ backless: true, strapless: true, hem: 'clearlyAboveKnee' });
assert.deepEqual(assess(oneChurchGroup).failureGroups, ['churchCoverage']);
assert.equal(assess(oneChurchGroup).verdict, 'Almost');

const strong = ['red', 'orange', 'hot-pink', 'fuchsia', 'bright-yellow', 'lime',
  'bright-green', 'electric-blue', 'cobalt-blue'];
for (const colour of strong) assert.ok(hit(look({ colour }, { occasion: 'funeral' }), 'H04'));
assert.ok(hit(look({ colour: 'turquoise' }, { occasion: 'funeral' }), 'H04l'));
for (const finish of ['metallicGold', 'metallicSilver', 'sequins', 'highSheenGold'] as const) {
  assert.ok(hit(look({ finish }, { occasion: 'funeral' }), 'H04l'));
  assert.ok(!group(look({ finish }, { occasion: 'funeral', familyColours: ['navy'] }), 'funeralColour'));
}
for (const colour of ['coral', 'multicolour-wax-print', 'bright-purple', 'wine', 'burgundy']) {
  const input = look({ colour }, { occasion: 'funeral' });
  assert.ok(!group(input, 'funeralColour'));
  assert.ok(assess(input).advisoryNotes.length > 0);
}
assert.ok(hit(look({ colour: 'white' }, { occasion: 'funeral' }), 'H04q'));
assert.ok(!hit(look({ colour: 'white' }, { occasion: 'funeral', familyColours: ['white'] }), 'H04q'));
for (const colour of [...strong, 'turquoise', 'coral', 'wine', 'bright-purple']) {
  const input = look({ colour }, { occasion: 'funeral', familyColours: [colour] });
  assert.ok(!assess(input).hits.some(h => /^H04/.test(h.ruleId)), 'exact family colour overrides all lists');
}
assert.ok(hit(look({ colour: 'red' }, { occasion: 'funeral', familyColours: ['black'] }), 'H04'),
  'a different announced colour does not excuse red');
for (const colour of ['navy', 'charcoal', 'black', 'chocolate', 'olive']) {
  const input = look({ colour }, { occasion: 'funeral' });
  assert.ok(!assess(input).hits.some(h => /^H04/.test(h.ruleId)));
}
for (const marker of QUALITY_VOCABULARY.flatMap(entry => [...entry.markers])) {
  assert.ok(!hit(look({ textileIdentity: marker, quality: undefined }), 'S02'));
}
assert.ok(!hit(look({ textileIdentity: 'polyester', quality: 'notPoorPolyester' }), 'S02'));
assert.ok(hit(look({ quality: 'poorPolyester' }), 'S02'));
const over = assess(look({ textileIdentity: 'lace-beaded' }, { formalityBand: [4, 7] }));
assert.ok(over.advisoryNotes.length > 0);
assert.ok(!over.failureGroups.includes('register'));

const wrap = { id: 'wrap', kind: 'ichafu', key: false,
  headwearHeight: 'notTall', headwearShape: 'lowCloseUnsculpted' } as const;
const smaller = { ...look({}, { occasion: 'traditionalEvent', denomination: undefined }),
  items: [...look().items, wrap] };
assert.ok(!hit(smaller, 'C09'));
assert.ok(hit({ ...smaller, items: [...look().items, { ...wrap, headwearShape: 'lowerWider' }] }, 'C09'),
  'lower and wider alone does not prove close and unsculpted');
for (const kind of ['gele', 'ichafu']) {
  assert.ok(hit({ ...smaller, brief: { ...smaller.brief, occasion: 'casual' },
    items: [...look().items, { ...wrap, kind }] }, 'H07'), 'small wraps are not exempt from H07');
}
const rule = (id: string) => RULES.find(r => r.id === id)!;
for (const id of ['H05back', 'H05sleeve', 'H05hem', 'H04', 'H04q', 'S04a', 'C09', 'S02']) {
  assert.equal(rule(id).source, 'reviewer answer');
  assert.deepEqual(rule(id).sourceReviewers, ['R1', 'R2', 'R3']);
}
for (const id of ['H05strap', 'H05hemP']) {
  assert.equal(rule(id).strength, 'likely');
  assert.deepEqual(rule(id).sourceReviewers, ['R2', 'R3']);
}
assert.deepEqual(rule('H04l').sourceReviewers, ['R1', 'R3']);
assert.deepEqual(rule('U01-arms').sourceReviewers, ['R1', 'R2']);
assert.deepEqual(rule('H04a').sourceReviewers, ['R3']);
assert.deepEqual(rule('H04b').sourceReviewers, ['R1']);
assert.deepEqual(rule('H04c').sourceReviewers, ['R2', 'R3']);
assert.ok(RULES.filter(r => r.source === 'reviewer answer').every(r => r.sourceReviewers.length > 0));

const observation = (kinds: (string | null)[], brief: Partial<EventBrief> = {}): BlindObservation => ({
  items: kinds.map((kind, index) => ({ id: `synthetic-${index}`, kind })),
  brief: { occasion: 'work', ...brief }, v1: null,
});
// Confirm exact equality with the existing function, not a copied structural verdict.
const actual = adaptBlindLookFacts(observation(['top', 'trousers']));
const wardrobe = [
  { id: 'synthetic-0', category: 'top' as const, subType: 'top' },
  { id: 'synthetic-1', category: 'bottom' as const, subType: 'trousers' },
].map(i => ({ ...i, colorFamily: 'unknown', photoUri: '', occasionTags: [], seasonTags: [],
  createdAt: '1970-01-01T00:00:00.000Z' }));
const direct = applyNigerianStylingV1([{
  id: 'blind-described-look', scenario: 'work',
  components: wardrobe.map(i => ({ category: i.category, subType: i.subType,
    colorFamily: i.colorFamily, owned: true, matchedItemId: i.id })),
}], { wardrobe, relationships: [], context: 'work' });
assert.deepEqual(actual.v1?.decision, direct.decisions[0]);
assert.equal(adaptBlindLookFacts(observation(['top', 'top', 'trousers'])).v1?.decision.status, 'rejected');
assert.equal(adaptBlindLookFacts(observation(['top'])).v1?.decision.status, 'rejected');
for (const kind of ['double-wrapper', 'head-tie']) {
  const result = adaptBlindLookFacts(observation(['dress', kind]));
  assert.ok(!result.v1?.gapNotes.some(note => note.startsWith('V1 mapping unknown:')),
    `${kind} uses its approved V1 alias`);
}
for (const kind of ['co-ord', 'set', 'wrap', null]) {
  const result = adaptBlindLookFacts(observation(['dress', kind]));
  assert.equal(result.v1?.decision.status, 'unknown');
  assert.ok(result.v1?.gapNotes.some(note => note.includes(kind ?? 'unknown kind')));
}
const journal = observation(['buba', 'wrapper'], { occasion: 'traditionalWedding' });
assert.equal(adaptBlindLookFacts(journal).v1?.decision.headCoveringSatisfied, false, 'real V1 default gap');
const phrases = {
  context: 'She always covers her hair, arms and legs.',
  look: 'A sleeveless gown with no head covering.',
  itemPhrases: ['A sleeveless gown'],
};
const sourceAdapted = adaptBlindLookFacts(observation(['dress']), phrases);
assert.deepEqual(sourceAdapted.brief.statedCoverage, ['arms', 'knees', 'head']);
assert.equal(sourceAdapted.armsCovered, false);
assert.equal(sourceAdapted.headCovered, false);
assert.equal(sourceAdapted.wornCover, undefined, 'no head covering is not no jacket');
assert.equal(sourceAdapted.items[0].backless, undefined, 'unstated is not false');
assert.equal(adaptBlindLookFacts(observation(['dress']), {
  ...phrases, context: 'Most women cover their heads. The university bans sleeveless tops.',
}).brief.statedCoverage, undefined, 'venue practice is not a wearer preference');
assert.equal(adaptBlindLookFacts(observation(['dress']), {
  ...phrases, context: 'The family has asked for black and white and is selling fabric.',
}).brief.familyColours?.join(','), 'black,white');
assert.equal(adaptBlindLookFacts(observation(['dress']), {
  ...phrases, context: 'The group has been assigned a black and white George wrapper fabric.',
}).brief.familyColours?.join(','), 'black,white');
const withJacket = adaptBlindLookFacts(observation(['dress', 'jacket']), {
  ...phrases, itemPhrases: ['A sleeveless gown', 'a jacket worn over it'],
});
assert.equal(withJacket.wornCover, true);
assert.equal(withJacket.armsCovered, undefined, 'unknown jacket coverage cannot prove full arms');
const inherited = adaptBlindLookFacts(observation(['dress']), {
  ...phrases, look: 'The same gown cut with short sleeves and no head covering.',
  itemPhrases: ['A gown with long sleeves; The same gown'],
});
assert.equal(inherited.items[0].sleeveLength, 'short', 'explicit same-garment override wins over inheritance');
assert.equal(inherited.armsCovered, false);
console.log('Reviewer-answer clauses, attribution and actual-V1 adapter tests passed.');
