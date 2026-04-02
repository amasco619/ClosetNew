import { WardrobeItem, OutfitComponent, OutfitSet, OccasionTag, UserProfile } from '@/constants/types';

const NEUTRAL_COLORS = new Set([
  'black', 'white', 'grey', 'beige', 'cream', 'navy', 'camel', 'brown', 'olive',
]);

function isNeutral(color: string): boolean {
  return NEUTRAL_COLORS.has(color);
}

function colorsHarmonize(c1: string, c2: string): boolean {
  if (c1 === c2) return true;
  if (isNeutral(c1) || isNeutral(c2)) return true;
  return false;
}

const SCENARIO_AFFINITY: Record<OccasionTag, string[]> = {
  casual:    ['t-shirt', 'long-sleeve', 'henley', 'sweater', 'jeans', 'chinos', 'shorts', 'leggings', 'sneakers', 'flats', 'crossbody', 'backpack', 'hoodie', 'cardigan', 'denim-jacket'],
  work:      ['blouse', 'shirt', 'polo-shirt', 'sweater', 'trousers', 'chinos', 'midi-skirt', 'blazer', 'coat', 'heels', 'flats', 'loafers', 'tote', 'shoulder-bag', 'earrings', 'watch'],
  date:      ['blouse', 'camisole', 'midi-dress', 'wrap-dress', 'mini-dress', 'midi-skirt', 'heels', 'mules', 'flats', 'clutch', 'mini-bag', 'crossbody', 'earrings', 'necklace'],
  event:     ['cocktail-dress', 'midi-dress', 'maxi-dress', 'blouse', 'wide-leg', 'blazer', 'heels', 'clutch', 'mini-bag', 'earrings', 'necklace', 'bracelet'],
  interview: ['blouse', 'shirt', 'blazer', 'trousers', 'midi-skirt', 'midi-dress', 'coat', 'heels', 'flats', 'loafers', 'tote', 'shoulder-bag', 'earrings', 'watch'],
  wedding:   ['midi-dress', 'maxi-dress', 'cocktail-dress', 'wrap-dress', 'midi-skirt', 'blouse', 'heels', 'clutch', 'mini-bag', 'earrings', 'necklace', 'bracelet'],
  travel:    ['t-shirt', 'long-sleeve', 'sweater', 'shirt', 'jeans', 'chinos', 'trousers', 'sneakers', 'flats', 'boots', 'crossbody', 'backpack', 'tote', 'blazer', 'cardigan', 'denim-jacket'],
};

const STYLE_PREFERRED_COLORS: Record<string, string[]> = {
  minimal:  ['black', 'white', 'grey', 'beige', 'cream'],
  elevated: ['black', 'navy', 'cream', 'camel', 'burgundy'],
  bold:     ['red', 'blue', 'green', 'pink', 'coral', 'burgundy'],
  romantic: ['pink', 'lavender', 'cream', 'beige', 'white'],
  classic:  ['navy', 'black', 'white', 'camel', 'grey'],
  youthful: ['pink', 'blue', 'green', 'red', 'coral', 'lavender'],
};

function passesConstraints(item: WardrobeItem, profile: UserProfile): boolean {
  if (profile.constraints.noSleeveless && item.subType === 'tank-top') return false;
  if (profile.constraints.noShortSkirts && (item.subType === 'mini-skirt' || item.subType === 'mini-dress')) return false;
  if (profile.constraints.maxHeelHeight === 'flat' && item.subType === 'heels') return false;
  if (profile.constraints.maxHeelHeight === 'low' && item.subType === 'heels') return false;
  return true;
}

function scoreForScenario(item: WardrobeItem, scenario: OccasionTag, profile: UserProfile): number {
  let score = 0;
  if (item.occasionTags.includes(scenario)) score += 4;
  if (SCENARIO_AFFINITY[scenario].includes(item.subType)) score += 2;
  const preferred = STYLE_PREFERRED_COLORS[profile.styleGoalPrimary || ''] || [];
  if (preferred.includes(item.colorFamily)) score += 1;
  return score;
}

function pickBest(
  items: WardrobeItem[],
  scenario: OccasionTag,
  profile: UserProfile,
  usedIds: Set<string>,
): WardrobeItem | null {
  return items
    .filter(i => !usedIds.has(i.id))
    .sort((a, b) => scoreForScenario(b, scenario, profile) - scoreForScenario(a, scenario, profile))[0] ?? null;
}

function pickHarmonious(
  items: WardrobeItem[],
  baseColor: string,
  scenario: OccasionTag,
  profile: UserProfile,
  usedIds: Set<string>,
): WardrobeItem | null {
  const harmonious = items.filter(i => !usedIds.has(i.id) && colorsHarmonize(baseColor, i.colorFamily));
  const pool = harmonious.length > 0 ? harmonious : items.filter(i => !usedIds.has(i.id));
  return pool.sort((a, b) => scoreForScenario(b, scenario, profile) - scoreForScenario(a, scenario, profile))[0] ?? null;
}

function toComponent(item: WardrobeItem): OutfitComponent {
  return {
    category: item.category,
    subType: item.subType,
    colorFamily: item.colorFamily,
    owned: true,
    matchedItemId: item.id,
    photoUri: item.photoUri,
  };
}

function buildOutfit(
  byCategory: Record<string, WardrobeItem[]>,
  scenario: OccasionTag,
  profile: UserProfile,
  excludeIds: Set<string>,
): OutfitComponent[] | null {
  const usedIds = new Set(excludeIds);
  const outfit: OutfitComponent[] = [];

  const tops      = byCategory['top']      || [];
  const bottoms   = byCategory['bottom']   || [];
  const dresses   = byCategory['dress']    || [];
  const outerwear = byCategory['outerwear']|| [];
  const shoes     = byCategory['shoes']    || [];
  const bags      = byCategory['bag']      || [];
  const jewelry   = byCategory['jewelry']  || [];

  let baseColor = '';

  // Core: dress OR (top + bottom)
  const bestDress = pickBest(dresses, scenario, profile, usedIds);
  const bestTop   = pickBest(tops, scenario, profile, usedIds);
  const bestBottom = bestTop
    ? pickHarmonious(bottoms, bestTop.colorFamily, scenario, profile, new Set([...usedIds, bestTop.id]))
    : null;

  const useDress = bestDress &&
    scoreForScenario(bestDress, scenario, profile) >=
    (bestTop ? scoreForScenario(bestTop, scenario, profile) : -1);

  if (useDress && bestDress) {
    outfit.push(toComponent(bestDress));
    usedIds.add(bestDress.id);
    baseColor = bestDress.colorFamily;
  } else if (bestTop && bestBottom) {
    outfit.push(toComponent(bestTop));
    outfit.push(toComponent(bestBottom));
    usedIds.add(bestTop.id);
    usedIds.add(bestBottom.id);
    baseColor = bestTop.colorFamily;
  } else if (bestTop) {
    outfit.push(toComponent(bestTop));
    usedIds.add(bestTop.id);
    baseColor = bestTop.colorFamily;
  } else if (bestDress) {
    outfit.push(toComponent(bestDress));
    usedIds.add(bestDress.id);
    baseColor = bestDress.colorFamily;
  } else {
    return null;
  }

  // Shoes
  const shoe = pickHarmonious(shoes, baseColor, scenario, profile, usedIds);
  if (shoe) { outfit.push(toComponent(shoe)); usedIds.add(shoe.id); }

  // Outerwear (optional)
  const coat = pickHarmonious(outerwear, baseColor, scenario, profile, usedIds);
  if (coat) { outfit.push(toComponent(coat)); usedIds.add(coat.id); }

  // Bag (optional)
  const bag = pickHarmonious(bags, baseColor, scenario, profile, usedIds);
  if (bag) { outfit.push(toComponent(bag)); usedIds.add(bag.id); }

  // Jewelry (optional)
  const jewel = pickBest(jewelry, scenario, profile, usedIds);
  if (jewel) { outfit.push(toComponent(jewel)); usedIds.add(jewel.id); }

  return outfit.length >= 1 ? outfit : null;
}

function groupByCategory(items: WardrobeItem[]): Record<string, WardrobeItem[]> {
  const grouped: Record<string, WardrobeItem[]> = {};
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }
  return grouped;
}

export function generatePersonalizedOutfits(
  items: WardrobeItem[],
  profile: UserProfile,
): OutfitSet[] {
  if (items.length === 0) return [];

  const scenarios: OccasionTag[] = ['work', 'casual', 'date', 'event', 'interview', 'wedding', 'travel'];
  const sets: OutfitSet[] = [];
  const eligible = items.filter(i => passesConstraints(i, profile));

  for (const scenario of scenarios) {
    // Prefer items that score > 0 for this scenario; fall back to all eligible items
    const scored = eligible.filter(i => scoreForScenario(i, scenario, profile) > 0);
    const pool = scored.length >= 2 ? scored : eligible;
    const byCategory = groupByCategory(pool);

    const usedAcrossOutfits = new Set<string>();
    const outfitsForScenario: OutfitSet[] = [];

    // Generate up to 2 outfits per scenario
    for (let attempt = 0; attempt < 2; attempt++) {
      const components = buildOutfit(byCategory, scenario, profile, usedAcrossOutfits);
      if (components) {
        components.forEach(c => { if (c.matchedItemId) usedAcrossOutfits.add(c.matchedItemId); });
        outfitsForScenario.push({
          id: `personalized-${scenario}-${attempt}`,
          scenario,
          components,
        });
      }
    }

    sets.push(...outfitsForScenario);
  }

  return sets;
}
