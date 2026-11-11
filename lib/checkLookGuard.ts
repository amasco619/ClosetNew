import type {
  Constraints, GarmentGroup, OccasionTag, WardrobeItem,
} from '../constants/types';
import type { CheckLookSelection } from './checkLook';

export type CheckLookBriefContext =
  | 'work' | 'interview' | 'date' | 'casual' | 'travel' | 'event' | 'wedding'
  | 'church' | 'funeral' | 'traditional-wedding' | 'owambe' | 'naming-ceremony'
  | 'traditional-event';

export type CheckLookDenomination = 'catholic' | 'anglican' | 'pentecostal' | 'other' | 'not-sure';
export type CheckLookRole = 'guest' | 'family' | 'host' | 'bridal-party' | 'not-sure';
export type CheckLookTimeOfDay = 'daytime' | 'evening' | 'not-sure';
export type CheckLookSetChoice = string | 'none' | 'not-sure';
export type CheckLookVenue =
  | 'restaurant' | 'upscale-restaurant' | 'workplace' | 'place-of-worship'
  | 'outdoors' | 'home' | 'other' | 'not-sure';
export type CheckLookDressCode =
  | 'casual' | 'smart-casual' | 'business' | 'conservative' | 'formal'
  | 'black-tie' | 'traditional' | 'other' | 'not-sure';
export type CheckLookAnnouncedColours =
  | { kind: 'not-sure' }
  | { kind: 'none' }
  | { kind: 'colours'; values: string[] };

export type CheckLookBrief =
  | {
      context: 'church'; denomination: CheckLookDenomination;
      venue?: CheckLookVenue; dressCode?: CheckLookDressCode;
    }
  | {
      context: 'funeral'; announcedColours: CheckLookAnnouncedColours;
      assignedGroupId: CheckLookSetChoice; role?: CheckLookRole; denomination?: CheckLookDenomination;
      timeOfDay?: CheckLookTimeOfDay; venue?: CheckLookVenue; dressCode?: CheckLookDressCode;
    }
  | {
      context: 'traditional-wedding' | 'owambe' | 'naming-ceremony';
      role: CheckLookRole; asoEbiGroupId: CheckLookSetChoice; denomination?: CheckLookDenomination;
      timeOfDay?: CheckLookTimeOfDay;
      venue?: CheckLookVenue; dressCode?: CheckLookDressCode;
    }
  | {
      context: 'wedding' | 'event'; role?: CheckLookRole; denomination?: CheckLookDenomination;
      timeOfDay?: CheckLookTimeOfDay; venue?: CheckLookVenue; dressCode?: CheckLookDressCode;
    }
  | {
      context: 'date'; denomination?: CheckLookDenomination; timeOfDay?: CheckLookTimeOfDay;
      venue?: CheckLookVenue; dressCode?: CheckLookDressCode;
    }
  | {
      context: 'work' | 'interview' | 'casual' | 'travel' | 'traditional-event';
      denomination?: CheckLookDenomination; venue?: CheckLookVenue; dressCode?: CheckLookDressCode;
    };

export interface CheckLookRequest {
  selection: CheckLookSelection;
  brief: CheckLookBrief;
  /** Transient facts for this look; never persisted by Check My Look. */
  garmentFacts?: Readonly<Record<string, CheckLookGarmentFacts>>;
}

export interface CheckLookGarmentFacts {
  hemPosition?: 'above-knee' | 'at-or-below-knee';
  backless?: boolean;
  strapless?: boolean;
  backOrStrapCoverage?: 'covered' | 'exposed-with-cover' | 'exposed-no-cover';
  modestForChurch?: boolean;
  sleeveLining?: 'lined' | 'sheer' | 'not-sure';
}

export interface CheckLookGuardInput extends CheckLookRequest {
  items: readonly WardrobeItem[];
  groups: readonly GarmentGroup[];
  constraints?: Partial<Constraints>;
}

export interface CheckLookGuardResult {
  pass: boolean;
  failures: string[];
  missing: string[];
}

const COVERING_SUBTYPES = new Set([
  'gyale', 'kallabi', 'mayafi', 'hijab', 'scarf', 'head-scarf', 'headwrap', 'head-tie', 'turban',
]);
const BODY_COVER_SUBTYPES = new Set(['stole']);
const SKIRT_SUBTYPES = new Set([
  'mini-skirt', 'midi-skirt', 'maxi-skirt', 'pencil-skirt', 'wrapper', 'iro', 'double-wrapper',
]);
const SHORT_SUBTYPES = new Set(['shorts']);
const CHURCH_HEM_SUBTYPES = new Set([...SKIRT_SUBTYPES, ...SHORT_SUBTYPES]);
const TROUSER_SUBTYPES = new Set(['jeans', 'trousers', 'chinos', 'wide-leg', 'joggers', 'leggings']);

function normaliseSubtype(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

export function isSheerFabric(value?: string): boolean {
  const fabric = value?.trim().toLowerCase().replace(/[_-]+/g, ' ');
  return !!fabric && (fabric === 'chiffon' || fabric.includes('lace') || fabric.includes('voile') ||
    fabric === 'organza' || fabric === 'tulle' || fabric === 'mesh');
}

function isCoveringItem(item: WardrobeItem): boolean {
  return COVERING_SUBTYPES.has(normaliseSubtype(item.subType));
}

function hasWornBodyCover(items: readonly WardrobeItem[]): boolean {
  return items.some(item => item.category === 'outerwear' ||
    BODY_COVER_SUBTYPES.has(normaliseSubtype(item.subType)));
}

function isEventContext(context: CheckLookBriefContext): boolean {
  return context === 'event' || context === 'wedding' || context === 'church' ||
    context === 'funeral' || context === 'traditional-wedding' ||
    context === 'owambe' || context === 'naming-ceremony' ||
    context === 'traditional-event';
}

function selectedItems(input: CheckLookGuardInput): WardrobeItem[] {
  return input.selection.itemIds
    .map(id => input.items.find(item => item.id === id))
    .filter((item): item is WardrobeItem => Boolean(item));
}

function confirmedSets(groups: readonly GarmentGroup[]): GarmentGroup[] {
  return groups.filter(group =>
    group.relationshipType === 'coordinated_set' &&
    group.confirmationStatus === 'user_confirmed',
  );
}

function checkAssignedSet(
  groupId: CheckLookSetChoice,
  label: string,
  input: CheckLookGuardInput,
  items: readonly WardrobeItem[],
  failures: Set<string>,
  missing: Set<string>,
): void {
  if (groupId === 'not-sure') {
    missing.add(label);
    return;
  }
  if (groupId === 'none') return;

  const group = confirmedSets(input.groups).find(value => value.id === groupId);
  if (!group || group.members.length === 0) {
    missing.add(`${label} membership`);
    return;
  }

  const selected = new Set(input.selection.itemIds);
  const members = new Set(group.members.map(member => member.garmentId));
  if (group.members.some(member => !input.items.some(item => item.id === member.garmentId))) {
    missing.add(`${label} garment details`);
  }
  if (group.members.some(member => !selected.has(member.garmentId))) {
    failures.add(`The full assigned set must be included.`);
  }

  const selectedBaseItems = items.filter(item =>
    item.category === 'top' || item.category === 'bottom' || item.category === 'dress',
  );
  if (selectedBaseItems.some(item => !members.has(item.id))) {
    failures.add(`The assigned set cannot be paired with another base garment.`);
  }
}

function checkChurch(
  input: CheckLookGuardInput,
  items: readonly WardrobeItem[],
  failures: Set<string>,
  missing: Set<string>,
): void {
  if (input.brief.context !== 'church' && input.brief.venue !== 'place-of-worship') return;
  const denomination = 'denomination' in input.brief ? input.brief.denomination : undefined;
  const denominationKnown = denomination === 'catholic' || denomination === 'anglican' ||
    denomination === 'pentecostal';
  if (!denomination || denomination === 'not-sure') missing.add('church denomination');
  if (denomination === 'other') missing.add('church coverage rules for this denomination');

  const bodyCovered = hasWornBodyCover(items);
  const core = items.filter(item => item.category === 'top' || item.category === 'dress');
  for (const item of core) {
    const facts = input.garmentFacts?.[item.id];
    const label = item.category === 'dress' ? 'the selected dress' : 'the selected top';
    if (!item.sleeveLength) {
      missing.add(`sleeve length for ${label}`);
    } else if (item.sleeveLength === 'sleeveless' && denominationKnown) {
      if (denomination === 'catholic' || denomination === 'anglican') {
        failures.add(`A sleeveless piece does not meet the church coverage rule.`);
      } else if (facts?.modestForChurch === undefined) {
        missing.add(`modesty of the sleeveless piece for Pentecostal church`);
      } else if (!facts.modestForChurch) {
        failures.add(`The sleeveless piece is not marked modest for Pentecostal church.`);
      }
    } else if (item.sleeveLength === 'sleeveless' && !denominationKnown) {
      missing.add(`church sleeve rule for ${label}`);
    }

    if (facts?.backOrStrapCoverage) {
      if (facts.backOrStrapCoverage === 'exposed-no-cover') {
        failures.add('An exposed back or strap needs a worn cover.');
      }
    } else {
      if (facts?.backless === undefined) {
        missing.add(`back coverage for ${label}`);
      } else if (facts.backless && !bodyCovered) {
        failures.add(`A backless piece needs a worn cover.`);
      }
      if (facts?.strapless === undefined) {
        missing.add(`strap coverage for ${label}`);
      } else if (facts.strapless && !bodyCovered) {
        failures.add(`A strapless piece needs a worn cover.`);
      }
    }
    if (item.sleeveLength !== 'sleeveless' && isSheerFabric(item.fabric) &&
        (!facts?.sleeveLining || facts.sleeveLining === 'not-sure')) {
      missing.add(`sleeve lining for ${label}`);
    }
  }

  const hemRelevant = items.filter(item =>
    item.category === 'dress' ||
    (item.category === 'bottom' && CHURCH_HEM_SUBTYPES.has(normaliseSubtype(item.subType))),
  );
  for (const item of hemRelevant) {
    const hemPosition = input.garmentFacts?.[item.id]?.hemPosition;
    if (!hemPosition) {
      missing.add(`hem position for the selected ${item.category === 'dress' ? 'dress' : 'skirt or shorts'}`);
      if (!denominationKnown) missing.add('church hem rule for this denomination');
    } else if (hemPosition === 'above-knee' && denominationKnown) {
      failures.add(`A hem clearly above the knee does not meet the church coverage rule.`);
    }
  }
  if (items.some(item =>
    item.category === 'bottom' &&
    !CHURCH_HEM_SUBTYPES.has(normaliseSubtype(item.subType)) &&
    !TROUSER_SUBTYPES.has(normaliseSubtype(item.subType)),
  )) {
    missing.add('hem applicability for an unrecognised bottom type');
  }
}

export function guardCheckLook(input: CheckLookGuardInput): CheckLookGuardResult {
  const failures = new Set<string>();
  const missing = new Set<string>();
  const items = selectedItems(input);
  const constraints = input.constraints;

  if (items.length !== input.selection.itemIds.length) {
    missing.add('selected garment details');
  }

  if (constraints?.noSleeveless) {
    for (const item of items.filter(value => value.category === 'top' || value.category === 'dress')) {
      if (!item.sleeveLength) missing.add('sleeve length required by your coverage preference');
      else if (item.sleeveLength === 'sleeveless') failures.add('A selected piece conflicts with your no-sleeveless preference.');
    }
  }

  if (constraints?.noShortSkirts) {
    for (const item of items.filter(value => value.category === 'bottom' || value.category === 'dress')) {
      if (item.category === 'dress') {
        const hemPosition = input.garmentFacts?.[item.id]?.hemPosition;
        if (!hemPosition) missing.add('hem position required by your short-skirt preference');
        else if (hemPosition === 'above-knee') {
          failures.add('A selected dress conflicts with your short-skirt preference.');
        }
        continue;
      }
      const subtype = normaliseSubtype(item.subType);
      if (TROUSER_SUBTYPES.has(subtype)) continue;
      if (!SKIRT_SUBTYPES.has(subtype)) {
        missing.add('whether a selected bottom is a skirt for your short-skirt preference');
        continue;
      }
      const hemPosition = input.garmentFacts?.[item.id]?.hemPosition;
      if (!hemPosition) missing.add('hem position required by your short-skirt preference');
      else if (hemPosition === 'above-knee') failures.add('A selected skirt conflicts with your short-skirt preference.');
    }
  }

  const coveringPreference = constraints?.headCoveringPreference;
  const hasCoveringItem = items.some(isCoveringItem);
  if (coveringPreference === 'never' && hasCoveringItem) {
    failures.add('A covering item conflicts with your head-covering preference.');
  } else if (
    (coveringPreference === 'always' ||
      (coveringPreference === 'events' && isEventContext(input.brief.context))) &&
    !hasCoveringItem
  ) {
    failures.add('Your head-covering preference is not met by the selected look.');
  }

  checkChurch(input, items, failures, missing);

  if (input.brief.context === 'funeral') {
    const { announcedColours } = input.brief;
    if (announcedColours.kind === 'not-sure') {
      missing.add('announced funeral colours');
    } else if (announcedColours.kind === 'colours') {
      if (!announcedColours.values.length) {
        missing.add('announced funeral colours');
      } else {
        const allowed = new Set(announcedColours.values.map(value => value.toLowerCase()));
        const hasUnknownSelectedColour = items.length === 0 || items.some(item => !item.colorFamily);
        if (hasUnknownSelectedColour) {
          missing.add('colour of every selected piece');
        } else if (!items.some(item =>
          allowed.has(item.colorFamily.toLowerCase()) ||
          (item.accentColor ? allowed.has(item.accentColor.toLowerCase()) : false),
        )) {
          failures.add('The look does not include an announced funeral colour.');
        }
      }
    }
    checkAssignedSet(input.brief.assignedGroupId, 'assigned funeral set', input, items, failures, missing);
  }

  if (
    input.brief.context === 'traditional-wedding' ||
    input.brief.context === 'owambe' ||
    input.brief.context === 'naming-ceremony'
  ) {
    if (input.brief.role === 'not-sure') missing.add('your role at this occasion');
    checkAssignedSet(input.brief.asoEbiGroupId, 'assigned aso-ebi', input, items, failures, missing);
  }

  return {
    pass: failures.size === 0 && missing.size === 0,
    failures: [...failures],
    missing: [...missing],
  };
}
