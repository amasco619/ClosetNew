import assert from 'node:assert/strict';
import { adaptBlindLookFacts, EVENT_BANDS, keyGarment } from '../lib/nigerianStyling/v2/blindAdapter';
import type { BlindObservation } from '../lib/nigerianStyling/v2/blindAdapter';
import { evaluateNigerianStylingV2 as assess } from '../lib/nigerianStyling/v2/evaluate';
import { KEY_VOCABULARY, RULES } from '../lib/nigerianStyling/v2/rules';
import type { EventBrief, ItemFacts, LookFacts } from '../lib/nigerianStyling/v2/types';

// Synthetic facts only. Never evaluate or load the blind rating fixtures here.
function synthetic(): LookFacts {
  return {
    items: [{
      id: 'synthetic-dress', key: true, kind: 'dress', colour: 'navy',
      textileIdentity: 'premium-ankara', quality: 'notPoorPolyester',
    }],
    brief: {
      occasion: 'owambe', role: 'guest', community: 'other', timeOfDay: 'evening',
      formalityBand: [9, 10], asoEbiBought: true,
      asoEbiColour: 'navy', asoEbiTextile: 'premium-ankara',
    },
    traditionalWear: false, printDominance: 'noPrint',
    v1: { decision: { status: 'eligible', headCoveringSatisfied: true }, gapNotes: [] },
  };
}
for (const kind of ['dress', 'top', 'bottom', 'set-piece', 'outerwear', 'blazer', 'wrapper']) {
  assert.equal(keyGarment(kind), true);
}
for (const kind of ['shoes', 'bag', 'jewellery', 'belt', 'gele', 'scarf', 'hat']) {
  assert.equal(keyGarment(kind), false);
}
assert.equal(keyGarment(null), undefined);
assert.equal(keyGarment('unlisted'), undefined);
for (const kind of [
  'jacket', 'jumpsuit', 'shorts', 'double-wrapper',
  'suit', 'skirt-suit', 'trouser-suit', 'co-ord', 'two-piece-set', 'set',
]) {
  assert.equal(keyGarment(kind), true, `${kind} is one key garment`);
  assert.ok((KEY_VOCABULARY as readonly string[]).includes(kind), `${kind} is recognised`);
}
assert.equal(keyGarment('head-tie'), false);
assert.equal(keyGarment('ipele'), false);
assert.ok((KEY_VOCABULARY as readonly string[]).includes('ipele'));
for (const kind of ['dashiki', 'wrap', 'unknown']) {
  assert.ok(!(KEY_VOCABULARY as readonly string[]).includes(kind));
}

function observedKinds(kinds: string[], occasion = 'work'): BlindObservation {
  const value = observed({ occasion: occasion as EventBrief['occasion'] });
  value.items = kinds.map((kind, index) => ({
    id: `${kind}-${index}`, kind, key: null,
    colour: null, textileIdentity: null, quality: null, footwearType: null,
    shoulderCoverage: null, hem: null, headwearHeight: null, headwearShape: null,
    coralStrands: null,
  }));
  return value;
}

function observed(brief: Partial<EventBrief> = {}): BlindObservation {
  // The adapter accepts absent observations as null, not implicit false/empty.
  return {
    items: [{
      id: 'synthetic-dress', kind: 'dress', key: null, colour: null,
      textileIdentity: null, quality: null, footwearType: null, shoulderCoverage: null,
      hem: null, headwearHeight: null, headwearShape: null, coralStrands: null,
    }],
    brief: {
      occasion: null, role: null, whoseEvent: null, community: null, denomination: null,
      asoEbiBought: null, asoEbiColour: null, asoEbiTextile: null, brideColours: null,
      familyTextiles: null, timeOfDay: null, formalityBand: null, titledWoman: null,
      ...brief,
    },
    v1: null, traditionalWear: null, printDominance: null,
  };
}
assert.equal(Object.values(EVENT_BANDS).reduce((n, roles) => n + Object.keys(roles).length, 0), 9);
for (const [occasion, roles] of Object.entries(EVENT_BANDS)) {
  for (const [role, band] of Object.entries(roles)) {
    const output = adaptBlindLookFacts(observed({
      occasion: occasion as EventBrief['occasion'], role: role as EventBrief['role'],
    }));
    assert.deepEqual(output.brief.formalityBand, band);
  }
}
for (const brief of [
  { occasion: 'work', role: 'guest' }, { occasion: 'funeral', role: 'family' },
  { occasion: 'traditionalWedding', role: 'motherOfBride' },
  { occasion: 'owambe' }, { role: 'guest' }, {},
] as Partial<EventBrief>[]) {
  assert.equal(adaptBlindLookFacts(observed(brief)).brief.formalityBand, undefined);
}
const input = observed();
const before = JSON.stringify(input);
const output = adaptBlindLookFacts(input);
assert.equal(output.v1?.decision.status, 'eligible', 'actual V1 accepts one dress');
assert.equal(output.items[0].key, true);
assert.equal(output.items[0].colour, undefined);
assert.equal(output.traditionalWear, undefined, 'never infer cultural intent from garments');
assert.equal(assess(output).judged, true, 'known dress structure is judged despite unchecked rule facts');
assert.equal(assess(output).worksWithUnchecked, true);
assert.ok(assess(output).uncheckedRules.length > 0);
assert.equal(assess(output).missingFacts['v1.decision.status'], false);
assert.deepEqual(adaptBlindLookFacts(input), output);
assert.equal(JSON.stringify(input), before, 'adapter must not mutate observations');

const headTie = adaptBlindLookFacts(observedKinds(['iro', 'buba', 'head-tie']), {
  itemPhrases: ['', '', 'head-tie'],
  look: '', context: '',
});
assert.equal(headTie.items[2].kind, 'headwrap', 'head-tie is a covering alias');
assert.equal(headTie.items[2].key, false, 'head-tie is never style headwear or a key');
assert.equal(headTie.items[2].headwearHeight, 'notTall');
assert.equal(headTie.items[2].headwearShape, 'lowCloseUnsculpted');
assert.equal(headTie.v1?.decision.status, 'eligible');
assert.ok(headTie.v1?.gapNotes.some(note => note.includes('removed/reselected described covering items')),
  'V1 recognises the alias as a covering item subject to its current preference');
assert.ok(!assess(headTie).hits.some(hit => hit.ruleId === 'H07'));

const ipele = adaptBlindLookFacts(observedKinds(['iro', 'buba', 'ipele']));
assert.equal(ipele.items.length, 3, 'ipele remains one described layer');
assert.equal(ipele.items[2].key, false);
assert.equal(ipele.v1?.decision.status, 'eligible',
  'ipele maps as a non-base layer alongside iro and buba');

const doubleWrapper = adaptBlindLookFacts(observedKinds(['buba', 'double-wrapper']));
assert.equal(doubleWrapper.items.length, 2, 'double-wrapper remains one described item');
assert.equal(doubleWrapper.items[1].key, true);
assert.equal(doubleWrapper.v1?.decision.status, 'eligible',
  'double-wrapper maps to one wrapper bottom');

for (const kind of ['jacket', 'jumpsuit', 'shorts']) {
  const kinds = kind === 'jumpsuit' ? [kind]
    : kind === 'jacket' ? ['top', 'trousers', kind] : ['top', kind];
  const accepted = adaptBlindLookFacts(observedKinds(kinds));
  assert.equal(accepted.v1?.decision.status, 'eligible', `${kind} maps by its described category`);
}
for (const kind of ['suit', 'skirt-suit', 'trouser-suit', 'co-ord', 'two-piece-set', 'set']) {
  const aggregate = adaptBlindLookFacts(observedKinds([kind]));
  assert.equal(aggregate.items.length, 1, `${kind} is not decomposed`);
  assert.equal(aggregate.items[0].key, true);
  assert.equal(aggregate.v1?.decision.status, 'unknown');
  assert.ok(aggregate.v1?.gapNotes.some(note => note.includes(`(${kind})`)));
}
for (const kind of ['dashiki', 'wrap', 'unknown']) {
  const unmapped = adaptBlindLookFacts(observedKinds([kind]));
  assert.equal(unmapped.v1?.decision.status, 'unknown');
}

input.items[0].kind = 'set';
assert.equal(adaptBlindLookFacts(input).v1?.decision.status, 'unknown', 'a set name does not prove its components');
input.items[0].kind = null;
assert.equal(adaptBlindLookFacts(input).items[0].key, undefined);
assert.equal(adaptBlindLookFacts(input).items[0].kind, undefined);
assert.equal(assess(adaptBlindLookFacts(input)).judged, false);
input.v1 = synthetic().v1;
assert.equal(adaptBlindLookFacts(input).v1?.decision.status, 'unknown', 'a supplied shortcut cannot bypass V1 mapping');
assert.deepEqual(adaptBlindLookFacts(observed({ formalityBand: [3, 4] })).brief.formalityBand, [3, 4]);

const matched = synthetic();
assert.ok(!assess(matched).hits.some(hit => ['S04', 'S06'].includes(hit.ruleId)));
for (const change of [
  { colour: 'blue' }, { textileIdentity: 'adire' },
] as Partial<ItemFacts>[]) {
  const mismatch = synthetic();
  mismatch.items = [{ ...mismatch.items[0], ...change }];
  assert.ok(assess(mismatch).hits.some(hit => hit.ruleId === 'S04'));
}
const notBought = synthetic();
notBought.brief.asoEbiBought = false;
assert.ok(assess(notBought).hits.some(hit => hit.ruleId === 'S06'));
const missingPurchase = synthetic();
missingPurchase.brief.asoEbiBought = undefined;
assert.ok(!assess(missingPurchase).hits.some(hit => ['S04', 'S06'].includes(hit.ruleId)),
  'uncertain exemption is not a proven failure');
const mixed = synthetic();
mixed.items = [...mixed.items, { ...mixed.items[0], id: 'unmatched', colour: 'blue' }];
assert.ok(assess(mixed).hits.some(hit => hit.ruleId === 'S04'),
  'exemption is per garment, not the whole outfit');
assert.ok(assess(mixed).hits.some(hit => hit.ruleId === 'S06'));

const fittedOnly = synthetic();
fittedOnly.brief = { ...fittedOnly.brief, asoEbiBought: false, formalityBand: [4, 7] };
assert.ok(assess(fittedOnly).hits.some(hit => hit.ruleId === 'S06'));
const accuracy = assess(fittedOnly, { mode: 'accuracy' });
assert.deepEqual(accuracy.excludedRuleIds, ['S06']);
assert.ok(!accuracy.hits.some(hit => hit.ruleId === 'S06'));
assert.ok(!accuracy.failureGroups.includes('register'), 'fitted rule cannot affect accuracy');
fittedOnly.brief.timeOfDay = undefined;
assert.ok(!assess(fittedOnly, { mode: 'accuracy' }).questions.some(question =>
  question.includes('evening owambe')), 'fitted missing facts cannot affect accuracy coverage');
const fitted = RULES.find(rule => rule.id === 'S06')!;
assert.equal(fitted.provenance, 'fitted');
assert.equal(fitted.source, 'review of rating results');
assert.equal(RULES.filter(rule => rule.provenance === 'fitted').length, 1);
console.log('Blind adapter and reviewer rule-revision synthetic tests passed.');
