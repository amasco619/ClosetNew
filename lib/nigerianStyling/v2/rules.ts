import type { Band, Condition, FactPath, Rule } from './types';

const eq = (path: FactPath, value: string | boolean | number): Condition => ({ path, op: 'eq', value });
const inside = (path: FactPath, value: readonly string[]): Condition => ({ path, op: 'in', value });
const all = (...conditions: Condition[]): Condition => ({ all: conditions });
const any = (...conditions: Condition[]): Condition => ({ any: conditions });
const some = (condition: Condition): Condition => ({ some: condition });
const kind = (...values: string[]): Condition => some(inside('item.kind', values));
const occasion = (...values: string[]): Condition => inside('brief.occasion', values);
const key = eq('item.key', true);
const traditional = eq('traditionalWear', true);
const matchesBoughtAsoEbi = all(
  eq('brief.asoEbiBought', true),
  { path: 'item.colour', op: 'eqRef', ref: 'brief.asoEbiColour' },
  { path: 'item.textileIdentity', op: 'eqRef', ref: 'brief.asoEbiTextile' },
);
const notExempt = { not: matchesBoughtAsoEbi } satisfies Condition;

export const STYLE_HEADWEAR = ['gele', 'ichafu'] as const;
export const COVERING_ITEMS = [
  'hijab', 'scarf', 'turban', 'gyale', 'kallabi', 'mayafi', 'headwrap', 'head-scarf',
] as const;
/** Unknown/men's/held vocabulary is not silently mapped to a supported garment. */
export const KEY_VOCABULARY = [
  'iro', 'buba', 'wrapper', 'ankara-top', 'ankara-skirt', 'top', 'skirt', 'trousers',
  'dress', 'blazer', 'jeans', 'layer', 'abaya', 'kaftan', 'zani', 'bubu',
  'ipele', 'double-wrapper', 'jacket', 'jumpsuit', 'shorts',
  'suit', 'skirt-suit', 'trouser-suit', 'co-ord', 'two-piece-set', 'set',
  ...STYLE_HEADWEAR, ...COVERING_ITEMS,
] as const;

/** These are supplied reviewer bands, not scores or inferred quality grades. */
export const TEXTILE_BANDS: Readonly<Record<string, Band>> = {
  'indian-george': [9, 10], 'lace-beaded': [8, 10], 'lace-french': [8, 10],
  velvet: [8, 9], 'lace-cord': [7, 9], akwete: [7, 9], hollandais: [6, 8],
  brocade: [6, 8], 'lace-swiss-voile': [6, 7], 'premium-ankara': [4, 7], adire: [3, 6],
};
export const COMMUNITY_TEXTILE_BANDS: Readonly<Record<string, {
  community: Rule['communityTag']; band: Band;
}>> = { 'aso-oke': { community: 'yoruba', band: [9, 10] } };

function rule(
  id: string, description: string, strength: Rule['strength'], type: Rule['type'],
  appliesWhen: Condition, effect: Rule['effect'], reasonText: string,
  violation?: Condition, failureGroup?: Rule['failureGroup'], communityTag?: Rule['communityTag'],
): Rule {
  return {
    id, version: 2, description, strength, type, appliesWhen, effect, reasonText,
    violation, failureGroup, communityTag, sourceReviewers: ['R1', 'R2', 'R3'],
    provenance: 'matrix', source: 'reviewer matrix',
  };
}

const reviewers = ['R1', 'R2', 'R3'] as const;
function answer(value: Rule, sourceReviewers: Rule['sourceReviewers'] = reviewers): Rule {
  return {
    ...value, source: 'reviewer answer', sourceReviewers,
    // These questions settle church coverage, rather than an optional style choice.
    ...(['H05modest', 'H05denom', 'H05hemQ'].includes(value.id) ? { answerRequired: true } : {}),
  };
}
const church = any(occasion('church'), all(
  { path: 'brief.denomination', op: 'present' },
  inside('brief.denomination', ['catholic', 'anglican', 'orthodox', 'pentecostal'])));
const strictChurch = inside('brief.denomination', ['catholic', 'anglican', 'orthodox']);
const notFamilyColour: Condition = {
  not: { path: 'item.colour', op: 'familyOverride', ref: 'brief.familyColours' },
};
/** Vocabulary only: these markers never manufacture the explicit poor-quality flag. */
export const QUALITY_VOCABULARY = [
  { source: 'reviewer answer', markers: ['shine', 'stiff handle', 'thinness', 'poor drape'], sourceReviewers: reviewers },
  { source: 'reviewer answer', markers: ['thin net', 'loose threads', 'glued beads', 'puckered embroidery'], sourceReviewers: ['R3'] },
  { source: 'reviewer answer', markers: ['matte, lined polyester is not automatically poor'], sourceReviewers: ['R1'] },
] as const;

export const RULES: readonly Rule[] = [
  rule('H01', 'White-wedding guest colours', 'strong', 'hardFilter',
    all(occasion('whiteWedding'), eq('brief.role', 'guest')), 'failure',
    'Keep white, ivory and cream for the bride.',
    some(all(key, inside('item.colour', ['white', 'ivory', 'cream']))), 'weddingIdentity'),
  rule('H02a', 'Traditional-wedding bride colours', 'strong', 'hardFilter',
    all(occasion('traditionalWedding'), eq('brief.role', 'guest')), 'failure',
    'Choose a colour outside the bride’s supplied colours.',
    some(all(key, { path: 'item.colour', op: 'inRef', ref: 'brief.brideColours' })), 'weddingIdentity'),
  rule('H02b', 'Traditional-wedding family fabrics', 'strong', 'hardFilter',
    all(occasion('traditionalWedding'), eq('brief.role', 'guest')), 'failure',
    'Choose a textile outside the families’ supplied fabrics.',
    some(all(key, { path: 'item.textileIdentity', op: 'inRef', ref: 'brief.familyTextiles' })), 'weddingIdentity'),
  rule('H03a', 'Bought aso-ebi colour', 'strong', 'hardFilter',
    eq('brief.asoEbiBought', true), 'failure', 'Use the exact supplied aso-ebi colour.',
    some(all(key, { not: { path: 'item.colour', op: 'eqRef', ref: 'brief.asoEbiColour' } })), 'asoEbi'),
  rule('H03b', 'Bought aso-ebi textile', 'strong', 'hardFilter',
    eq('brief.asoEbiBought', true), 'failure', 'Use the exact supplied aso-ebi textile.',
    some(all(key, { not: { path: 'item.textileIdentity', op: 'eqRef', ref: 'brief.asoEbiTextile' } })), 'asoEbi'),
  answer(rule('H04', 'Strong funeral colours', 'strong', 'hardFilter',
    occasion('funeral'), 'failure', 'Choose outside the supplied funeral colour list, unless the family announced it.',
    some(all(notFamilyColour, inside('item.colour', [
      'red', 'orange', 'hot-pink', 'fuchsia', 'bright-yellow', 'lime',
      'bright-green', 'electric-blue', 'cobalt-blue',
    ]))), 'funeralColour')),
  answer(rule('H04l', 'Likely funeral colours and finishes', 'likely', 'hardFilter',
    occasion('funeral'), 'failure', 'Check this bright or metallic choice against the family’s guidance.',
    some(all(notFamilyColour, any(eq('item.colour', 'turquoise'),
      inside('item.finish', ['metallicGold', 'metallicSilver', 'sequins', 'highSheenGold'])))),
    'funeralColour'), ['R1', 'R3']),
  ...[
    ['H04a', ['coral', 'multicolour-wax-print'], ['R3']],
    ['H04b', ['bright-purple'], ['R1']],
    ['H04c', ['wine', 'burgundy'], ['R2', 'R3']],
  ].map(([id, colours, sources]) => answer(rule(id as string, 'Funeral colour advisory',
    'likely', 'explainOnly', occasion('funeral'), 'advisory',
    'Check this colour with the family; it is not a colour failure.',
    some(all(notFamilyColour, inside('item.colour', colours as string[])))),
  sources as Rule['sourceReviewers'])),
  answer(rule('H04q', 'White depends on family or custom', 'likely', 'askFirst',
    occasion('funeral'), 'question', 'Does the family or custom welcome white?',
    some(all(notFamilyColour, eq('item.colour', 'white'))))),
  answer(rule('H05back', 'Backless church look without a worn cover', 'strong', 'hardFilter',
    church, 'failure', 'Wear a jacket, wrap or shawl over the backless piece.',
    all(some(all(key, eq('item.backless', true))), eq('wornCover', false)), 'churchCoverage')),
  answer(rule('H05strap', 'Strapless church look without a worn cover', 'likely', 'hardFilter',
    church, 'failure', 'Wear a jacket, wrap or shawl over the strapless piece.',
    all(some(all(key, eq('item.strapless', true))), eq('wornCover', false)), 'churchCoverage'),
  ['R2', 'R3']),
  answer(rule('H05sleeve', 'Sleeveless at a stricter denomination', 'strong', 'hardFilter',
    all(church, strictChurch), 'failure', 'Cover the sleeveless piece for this church.',
    all(some(all(key, eq('item.sleeveLength', 'none'))), eq('wornCover', false)), 'churchCoverage')),
  answer(rule('H05modest', 'Pentecostal sleeveless modesty check', 'likely', 'askFirst',
    all(church, eq('brief.denomination', 'pentecostal')), 'question',
    'Is the sleeveless piece modest for this service?',
    all(eq('wornCover', false),
      some(all(key, eq('item.sleeveLength', 'none'), { not: eq('item.modest', true) }))))),
  answer(rule('H05denom', 'Sleeveless denomination check', 'likely', 'askFirst',
    all(church, { not: inside('brief.denomination', ['catholic', 'anglican', 'orthodox', 'pentecostal']) }),
    'question', 'Which denomination and coverage guidance apply?',
    all(some(all(key, eq('item.sleeveLength', 'none'))), eq('wornCover', false)))),
  answer(rule('H05hem', 'Clearly short hem at a stricter denomination', 'strong', 'hardFilter',
    all(church, strictChurch), 'failure', 'Choose a hem that covers the knee for this church.',
    some(all(key, eq('item.hem', 'clearlyAboveKnee'))), 'churchCoverage')),
  answer(rule('H05hemP', 'Clearly short hem at Pentecostal church', 'likely', 'hardFilter',
    all(church, eq('brief.denomination', 'pentecostal')), 'failure',
    'Choose a hem that covers the knee for this service.',
    some(all(key, eq('item.hem', 'clearlyAboveKnee'))), 'churchCoverage'), ['R2', 'R3']),
  answer(rule('H05hemQ', 'Unclear or slightly short church hem', 'likely', 'askFirst',
    church, 'question', 'Can you confirm the hem and this church’s guidance?',
    some(all(key, inside('item.hem', ['aboveKnee', 'slightlyAboveKnee']))))),
  ...(['arms', 'shoulders', 'knees', 'head'] as const).map(area => answer(rule(
    `U01-${area}`, 'Wearer’s stated coverage', 'strong', 'hardFilter',
    { path: 'brief.statedCoverage', op: 'includes', value: area },
    'failure', `This look does not meet your stated ${area} coverage.`,
    eq(`${area}Covered`, false), 'statedCoverage'), ['R1', 'R2'])),
  rule('H06', 'Traditional footwear', 'strong', 'hardFilter',
    traditional, 'failure', 'Choose footwear other than trainers, flip-flops or sports sandals.',
    some(all(eq('item.kind', 'shoes'), inside('item.footwearType', ['trainer', 'flipFlop', 'sportsSandal']))), 'footwear'),
  rule('H07', 'Style headwear exclusions, merged with C08', 'strong', 'hardFilter',
    kind(...STYLE_HEADWEAR), 'failure', 'Keep gele and ichafu apart from blazers, jeans and Casual looks.',
    any(kind('blazer', 'jeans'), occasion('casual')), 'styleHeadwear'),
  rule('S01', 'Traditional bag suggestion', 'likely', 'explainOnly',
    all(traditional, { not: kind('clutch', 'box-bag') }), 'advisory',
    'A clutch or box bag is an option for this traditional look.'),
  answer(rule('S02', 'Explicit poor-quality polyester', 'strong', 'hardFilter',
    some(eq('item.quality', 'poorPolyester')), 'failure',
    'Consider an alternative to the explicitly poor-quality polyester piece.',
    undefined, 'quality')),
  rule('S03', 'Print dominance', 'likely', 'explainOnly',
    eq('printDominance', 'competing'), 'advisory', 'Let one print lead the look.'),
  rule('S04', 'Textile below supplied event band', 'strong', 'hardFilter',
    some(key), 'failure', 'Choose a textile whose band reaches the supplied event band.',
    some(all(key, notExempt,
      { path: 'item.textileIdentity', op: 'belowBand', ref: 'brief.formalityBand' })), 'register'),
  answer(rule('S04a', 'Textile above supplied event band', 'likely', 'explainOnly',
    some(key), 'advisory', 'This textile is above the supplied event band; it is not a register failure.',
    some(all(key, notExempt,
      { path: 'item.textileIdentity', op: 'aboveBand', ref: 'brief.formalityBand' })))),
  rule('S05', 'Set re-pairing away from the original event', 'likely', 'explainOnly',
    occasion('work', 'casual'), 'advisory',
    'Set pieces may be worn separately when V1 confirms this context allows it.'),
  { ...rule('S06', 'Ankara at an evening owambe', 'likely', 'hardFilter',
    all(occasion('owambe'), eq('brief.timeOfDay', 'evening')), 'failure',
    'The supplied guidance places Ankara below an evening owambe.',
    some(all(key, notExempt, inside('item.textileIdentity', ['ankara', 'premium-ankara']))), 'register'),
  provenance: 'fitted', source: 'review of rating results' },
  rule('C01', 'Yoruba iro and buba gele', 'community', 'askFirst',
    all(traditional, kind('iro'), kind('buba')), 'question',
    'Would you like a tall gele with the iro and buba?',
    { not: some(all(eq('item.kind', 'gele'), eq('item.headwearHeight', 'tall'))) }, undefined, 'yoruba'),
  rule('C02', 'Hausa covering guidance', 'community', 'explainOnly',
    all(traditional, kind('abaya', 'kaftan', 'zani')), 'advisory',
    'Gyale, hijab or kallabi are options, subject to your V1 covering preference.',
    undefined, undefined, 'hausa'),
  rule('C03', 'Igbo George textile', 'community', 'explainOnly',
    all(traditional, some(inside('item.textileIdentity', ['george', 'indian-george']))), 'advisory',
    'George is included in the supplied Igbo guidance.', undefined, undefined, 'igbo'),
  rule('C04', 'Igbo ichafu shape', 'community', 'askFirst',
    all(traditional, kind('ichafu')), 'question', 'Would you like the ichafu lower and wider?',
    some(all(eq('item.kind', 'ichafu'), { not: eq('item.headwearShape', 'lowerWider') })), undefined, 'igbo'),
  rule('C05', 'Igbo guest coral', 'community', 'hardFilter',
    all(traditional, eq('brief.role', 'guest')), 'failure', 'Keep guest coral to one strand.',
    some(all(eq('item.kind', 'coral'), { path: 'item.coralStrands', op: 'gt', value: 1 })),
    'roleAdornment', 'igbo'),
  rule('C06', 'Igbo ivory odu title', 'community', 'hardFilter',
    all(traditional, kind('ivory-odu')), 'failure', 'Ivory odu requires a confirmed title.',
    eq('brief.titledWoman', false), 'roleAdornment', 'igbo'),
  rule('C07', 'Naming-ceremony mother band', 'community', 'askFirst',
    all(occasion('naming'), eq('brief.role', 'mother')), 'question',
    'The supplied naming-ceremony mother band is 8; can you confirm the event band?',
    { path: 'brief.formalityBand', op: 'excludesPoint', value: 8 }),
  answer(rule('C09', 'Smaller style wrap with a dress', 'community', 'explainOnly',
    all(occasion('traditionalEvent', 'traditionalWedding', 'owambe'), kind('dress'),
      kind(...STYLE_HEADWEAR), { not: kind('blazer', 'jeans') }), 'advisory',
    'A low, close, unsculpted wrap is an option; no height in centimetres is prescribed.',
    { not: some(all(inside('item.kind', [...STYLE_HEADWEAR, ...COVERING_ITEMS]),
      eq('item.headwearHeight', 'notTall'), eq('item.headwearShape', 'lowCloseUnsculpted'))) })),
];
