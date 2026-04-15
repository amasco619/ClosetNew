/**
 * Outfit generator for the "Just Added" banner.
 *
 * When a user uploads a new item, this builds complete looks anchored on that
 * item using the same confidence scoring as the daily rotation engine. The
 * user immediately sees how their new piece slots into their wardrobe.
 */

import { WardrobeItem, OutfitComponent, OutfitSet, OccasionTag, UserProfile } from '@/constants/types';
import {
  passesConstraints, colorsHarmonize, toComponent,
  scoreItemForProfile,
} from '@/constants/outfitScoring';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupByCategory(items: WardrobeItem[]): Record<string, WardrobeItem[]> {
  const grouped: Record<string, WardrobeItem[]> = {};
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }
  return grouped;
}

function pickBest(
  items: WardrobeItem[],
  scenario: OccasionTag,
  profile: UserProfile,
  usedIds: Set<string>,
): WardrobeItem | null {
  return items
    .filter(i => !usedIds.has(i.id))
    .sort((a, b) =>
      scoreItemForProfile(b, scenario, profile) -
      scoreItemForProfile(a, scenario, profile),
    )[0] ?? null;
}

function pickHarmonious(
  items: WardrobeItem[],
  baseColor: string,
  scenario: OccasionTag,
  profile: UserProfile,
  usedIds: Set<string>,
): WardrobeItem | null {
  const harmonious = items.filter(
    i => !usedIds.has(i.id) && colorsHarmonize(baseColor, i.colorFamily),
  );
  const pool = harmonious.length > 0 ? harmonious : items.filter(i => !usedIds.has(i.id));
  return pool.sort((a, b) =>
    scoreItemForProfile(b, scenario, profile) -
    scoreItemForProfile(a, scenario, profile),
  )[0] ?? null;
}

function buildOutfit(
  byCategory: Record<string, WardrobeItem[]>,
  scenario: OccasionTag,
  profile: UserProfile,
  excludeIds: Set<string>,
): OutfitComponent[] | null {
  const usedIds = new Set(excludeIds);
  const outfit: OutfitComponent[] = [];

  const tops      = byCategory['top']       ?? [];
  const bottoms   = byCategory['bottom']    ?? [];
  const dresses   = byCategory['dress']     ?? [];
  const outerwear = byCategory['outerwear'] ?? [];
  const shoes     = byCategory['shoes']     ?? [];
  const bags      = byCategory['bag']       ?? [];
  const jewelry   = byCategory['jewelry']   ?? [];

  let baseColor = '';

  const bestDress  = pickBest(dresses, scenario, profile, usedIds);
  const bestTop    = pickBest(tops, scenario, profile, usedIds);
  const bestBottom = bestTop
    ? pickHarmonious(
        bottoms,
        bestTop.colorFamily,
        scenario,
        profile,
        new Set([...usedIds, bestTop.id]),
      )
    : null;

  const dressScore = bestDress ? scoreItemForProfile(bestDress, scenario, profile) : -1;
  const topScore   = bestTop   ? scoreItemForProfile(bestTop, scenario, profile)   : -1;
  const useDress   = bestDress && dressScore >= topScore;

  if (useDress && bestDress) {
    outfit.push(toComponent(bestDress));
    usedIds.add(bestDress.id);
    baseColor = bestDress.colorFamily;
  } else if (bestTop && bestBottom) {
    outfit.push(toComponent(bestTop), toComponent(bestBottom));
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

  const shoe = pickHarmonious(shoes, baseColor, scenario, profile, usedIds);
  if (shoe) { outfit.push(toComponent(shoe)); usedIds.add(shoe.id); }

  const coat = pickHarmonious(outerwear, baseColor, scenario, profile, usedIds);
  if (coat) { outfit.push(toComponent(coat)); usedIds.add(coat.id); }

  const bag = pickHarmonious(bags, baseColor, scenario, profile, usedIds);
  if (bag) { outfit.push(toComponent(bag)); usedIds.add(bag.id); }

  const jewel = pickBest(jewelry, scenario, profile, usedIds);
  if (jewel) { outfit.push(toComponent(jewel)); }

  return outfit.length >= 1 ? outfit : null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates up to 3 complete outfit suggestions anchored on a newly added item.
 * Uses the same confidence scoring as the daily rotation so suggestions feel
 * as curated as the main outfit feed.
 */
export function generateOutfitsForItem(
  newItem: WardrobeItem,
  allItems: WardrobeItem[],
  profile: UserProfile,
): OutfitSet[] {
  const otherItems = allItems.filter(
    i => i.id !== newItem.id && passesConstraints(i, profile),
  );
  if (otherItems.length === 0) return [];

  const byCategory = groupByCategory(otherItems);

  const ALL_SCENARIOS: OccasionTag[] = [
    'casual', 'work', 'date', 'event', 'interview', 'wedding', 'travel',
  ];

  // Prefer scenarios the new item is tagged for; fall back to best-scoring ones
  let targetScenarios: OccasionTag[];
  if (newItem.occasionTags.length > 0) {
    targetScenarios = newItem.occasionTags.filter(t => ALL_SCENARIOS.includes(t));
  } else {
    targetScenarios = ALL_SCENARIOS.filter(
      s => scoreItemForProfile(newItem, s, profile) > 0,
    );
  }
  if (targetScenarios.length === 0) targetScenarios = ['casual', 'work'];

  const sets: OutfitSet[] = [];
  const usedScenarios = new Set<string>();

  for (const scenario of targetScenarios) {
    if (sets.length >= 3) break;
    if (usedScenarios.has(scenario)) continue;
    usedScenarios.add(scenario);

    const usedIds = new Set<string>([newItem.id]);
    const outfit: OutfitComponent[] = [toComponent(newItem)];
    let baseColor = newItem.colorFamily;

    if (newItem.category === 'top') {
      const bottom = pickHarmonious(byCategory['bottom'] ?? [], baseColor, scenario, profile, usedIds);
      if (bottom) { outfit.push(toComponent(bottom)); usedIds.add(bottom.id); }
      const shoe = pickHarmonious(byCategory['shoes'] ?? [], baseColor, scenario, profile, usedIds);
      if (shoe) { outfit.push(toComponent(shoe)); usedIds.add(shoe.id); }
      const coat = pickHarmonious(byCategory['outerwear'] ?? [], baseColor, scenario, profile, usedIds);
      if (coat) { outfit.push(toComponent(coat)); usedIds.add(coat.id); }
      const bag = pickHarmonious(byCategory['bag'] ?? [], baseColor, scenario, profile, usedIds);
      if (bag) { outfit.push(toComponent(bag)); usedIds.add(bag.id); }
      const jewel = pickBest(byCategory['jewelry'] ?? [], scenario, profile, usedIds);
      if (jewel) { outfit.push(toComponent(jewel)); }

    } else if (newItem.category === 'bottom') {
      const top = pickHarmonious(byCategory['top'] ?? [], baseColor, scenario, profile, usedIds);
      if (top) { outfit.push(toComponent(top)); usedIds.add(top.id); baseColor = top.colorFamily; }
      const shoe = pickHarmonious(byCategory['shoes'] ?? [], baseColor, scenario, profile, usedIds);
      if (shoe) { outfit.push(toComponent(shoe)); usedIds.add(shoe.id); }
      const coat = pickHarmonious(byCategory['outerwear'] ?? [], baseColor, scenario, profile, usedIds);
      if (coat) { outfit.push(toComponent(coat)); usedIds.add(coat.id); }
      const bag = pickHarmonious(byCategory['bag'] ?? [], baseColor, scenario, profile, usedIds);
      if (bag) { outfit.push(toComponent(bag)); usedIds.add(bag.id); }
      const jewel = pickBest(byCategory['jewelry'] ?? [], scenario, profile, usedIds);
      if (jewel) { outfit.push(toComponent(jewel)); }

    } else if (newItem.category === 'dress') {
      const shoe = pickHarmonious(byCategory['shoes'] ?? [], baseColor, scenario, profile, usedIds);
      if (shoe) { outfit.push(toComponent(shoe)); usedIds.add(shoe.id); }
      const coat = pickHarmonious(byCategory['outerwear'] ?? [], baseColor, scenario, profile, usedIds);
      if (coat) { outfit.push(toComponent(coat)); usedIds.add(coat.id); }
      const bag = pickHarmonious(byCategory['bag'] ?? [], baseColor, scenario, profile, usedIds);
      if (bag) { outfit.push(toComponent(bag)); usedIds.add(bag.id); }
      const jewel = pickBest(byCategory['jewelry'] ?? [], scenario, profile, usedIds);
      if (jewel) { outfit.push(toComponent(jewel)); }

    } else if (newItem.category === 'outerwear') {
      const top = pickBest(byCategory['top'] ?? [], scenario, profile, usedIds);
      if (top) { outfit.push(toComponent(top)); usedIds.add(top.id); }
      const bottom = pickHarmonious(byCategory['bottom'] ?? [], baseColor, scenario, profile, usedIds);
      if (bottom) { outfit.push(toComponent(bottom)); usedIds.add(bottom.id); }
      const shoe = pickHarmonious(byCategory['shoes'] ?? [], baseColor, scenario, profile, usedIds);
      if (shoe) { outfit.push(toComponent(shoe)); usedIds.add(shoe.id); }
      const bag = pickHarmonious(byCategory['bag'] ?? [], baseColor, scenario, profile, usedIds);
      if (bag) { outfit.push(toComponent(bag)); usedIds.add(bag.id); }

    } else if (newItem.category === 'shoes') {
      const dress = pickBest(byCategory['dress'] ?? [], scenario, profile, usedIds);
      const top   = pickBest(byCategory['top'] ?? [], scenario, profile, usedIds);
      const bottom = top
        ? pickHarmonious(
            byCategory['bottom'] ?? [],
            top.colorFamily,
            scenario,
            profile,
            new Set([...usedIds, top.id]),
          )
        : null;
      const dressScore = dress ? scoreItemForProfile(dress, scenario, profile) : -1;
      const topScore   = top   ? scoreItemForProfile(top, scenario, profile)   : -1;
      if (dress && dressScore >= topScore) {
        outfit.push(toComponent(dress)); usedIds.add(dress.id);
      } else if (top) {
        outfit.push(toComponent(top)); usedIds.add(top.id);
        if (bottom) { outfit.push(toComponent(bottom)); usedIds.add(bottom.id); }
      }
      const coat = pickHarmonious(byCategory['outerwear'] ?? [], baseColor, scenario, profile, usedIds);
      if (coat) { outfit.push(toComponent(coat)); usedIds.add(coat.id); }
      const bag = pickHarmonious(byCategory['bag'] ?? [], baseColor, scenario, profile, usedIds);
      if (bag) { outfit.push(toComponent(bag)); usedIds.add(bag.id); }
      const jewel = pickBest(byCategory['jewelry'] ?? [], scenario, profile, usedIds);
      if (jewel) { outfit.push(toComponent(jewel)); }

    } else {
      const coreCategories = groupByCategory(
        otherItems.filter(i => i.category !== newItem.category),
      );
      const components = buildOutfit(coreCategories, scenario, profile, usedIds);
      if (components) outfit.push(...components);
    }

    if (outfit.length >= 2) {
      sets.push({
        id: `newitem-${newItem.id}-${scenario}`,
        scenario,
        components: outfit,
      });
    }
  }

  return sets;
}
