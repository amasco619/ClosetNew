/**
 * Asset-free module: outfit group completion logic.
 *
 * Extracted from wardrobeBlueprint.ts so that generateRecommendedOutfitGroups
 * and computeNextSmartBuy can be imported directly in Node/tsx test suites
 * without triggering the PNG asset require() calls that wardrobeBlueprint.ts
 * contains at module level.
 *
 * wardrobeBlueprint.ts imports and re-exports everything from here.
 */

import type { ItemCategory, StyleGoal } from '@/constants/types';

/**
 * A minimal WardrobeSlot shape used by the group-completion functions.
 * The full WardrobeSlot in wardrobeBlueprint.ts adds sampleImage
 * (ImageSourcePropType) which requires React Native and can't be loaded in
 * Node — these functions never touch sampleImage so we keep it as unknown.
 */
export interface CoreWardrobeSlot {
  id: string;
  category: ItemCategory;
  subType: string;
  colorFamily: string;
  priority: number;
  label: string;
  description: string;
  sampleImage: unknown;
  status: 'needed' | 'owned';
  matchedItemId?: string;
}

/**
 * A single curated outfit group assembled from recommendation slots.
 * Each group represents one complete ready-to-wear look from the blueprint.
 */
export interface RecommendedOutfitGroup {
  id: string;
  label: string;
  vibe?: string;
  rationale?: string;
  slots: CoreWardrobeSlot[];
  isComplete: boolean;
}

/**
 * A curated outfit recipe that references specific blueprint items by ID.
 * These are authored styled combinations — e.g. for youthful:
 * crop top + high-waist jeans + chunky trainers — not positional mash-ups.
 */
export interface OutfitRecipe {
  id: string;
  label: string;
  vibe: string;
  rationale: string;
  slotIds: string[];
}

const PREFIX_TO_GOAL: Record<string, StyleGoal> = {
  yth: 'youthful', min: 'minimal', elv: 'elevated',
  bld: 'bold',     rom: 'romantic', cls: 'classic',
};

export const OUTFIT_RECIPES: Record<StyleGoal, OutfitRecipe[]> = {
  youthful: [
    {
      id: 'yth-look-1',
      label: 'Off-Duty City',
      vibe: 'Casual, confident, off-duty',
      rationale: 'The most reliable "youth formula" right now — clean, flattering and effortlessly current.',
      slotIds: ['yth-top-2', 'yth-bot-2', 'yth-sho-1'],
    },
    {
      id: 'yth-look-2',
      label: 'Smart & Playful',
      vibe: 'Smart but youthful, city-ready',
      rationale: 'Blends polish with playfulness — key for looking trendy without looking older.',
      slotIds: ['yth-top-1', 'yth-out-1', 'yth-bot-3', 'yth-sho-1'],
    },
    {
      id: 'yth-look-3',
      label: 'Soft & Effortless',
      vibe: 'Soft, effortless, slightly elevated',
      rationale: 'The easiest way to look feminine and relaxed at the same time.',
      slotIds: ['yth-drs-3', 'yth-out-2', 'yth-sho-1'],
    },
    {
      id: 'yth-look-4',
      label: 'Preppy Weekend',
      vibe: 'Retro preppy, fun',
      rationale: 'Plaid and platforms — the playful study-hall energy that still reads fresh.',
      slotIds: ['yth-top-3', 'yth-bot-4', 'yth-sho-2'],
    },
    {
      id: 'yth-look-5',
      label: 'Summer Smocked',
      vibe: 'Sweet, carefree',
      rationale: 'Puff sleeves, ballet flats — a romantic afternoon staple.',
      slotIds: ['yth-drs-4', 'yth-sho-3'],
    },
  ],

  minimal: [
    {
      id: 'min-look-1',
      label: 'Quiet Neutral',
      vibe: 'Soft, considered, calm',
      rationale: 'Cream over grey — the gentlest way to wear the clean-line minimalist uniform.',
      slotIds: ['min-top-2', 'min-bot-1', 'min-sho-2'],
    },
    {
      id: 'min-look-2',
      label: 'Linen Easy',
      vibe: 'Airy, summery, effortless',
      rationale: 'All-white linen with bare trainers — minimal dressing at its most forgiving.',
      slotIds: ['min-top-1', 'min-bot-3', 'min-sho-3'],
    },
    {
      id: 'min-look-3',
      label: 'Silk Slip',
      vibe: 'Fluid, pared-back, poised',
      rationale: 'One silk slip dress, one pointed mule — a complete look in two pieces.',
      slotIds: ['min-drs-1', 'min-sho-2'],
    },
    {
      id: 'min-look-4',
      label: 'Weekend Layer',
      vibe: 'Relaxed, composed',
      rationale: 'Linen overshirt + slim denim + flats + camel coat — layered minimalism for the commute.',
      slotIds: ['min-top-3', 'min-bot-2', 'min-sho-1', 'min-out-1'],
    },
  ],

  elevated: [
    {
      id: 'elv-look-1',
      label: 'Power Suit',
      vibe: 'Polished, commanding',
      rationale: 'Silk camisole under a navy blazer with wide-leg trousers — the executive cornerstone.',
      slotIds: ['elv-top-3', 'elv-out-1', 'elv-bot-1', 'elv-sho-1'],
    },
    {
      id: 'elv-look-2',
      label: 'Camel Polish',
      vibe: 'Refined, elegant',
      rationale: 'Black silk blouse + camel midi skirt + slingbacks — quiet European luxury.',
      slotIds: ['elv-top-1', 'elv-bot-2', 'elv-sho-3'],
    },
    {
      id: 'elv-look-3',
      label: 'Soft Luxe',
      vibe: 'Understated, cashmere-soft',
      rationale: 'Cashmere + wide-leg black + nude heels — powerful without shouting.',
      slotIds: ['elv-top-2', 'elv-bot-3', 'elv-sho-2', 'elv-out-3'],
    },
    {
      id: 'elv-look-4',
      label: 'Satin Evening',
      vibe: 'Luminous, occasion-ready',
      rationale: 'Champagne satin slip + pointed heels — one piece, maximum elevation.',
      slotIds: ['elv-drs-3', 'elv-sho-1'],
    },
  ],

  bold: [
    {
      id: 'bld-look-1',
      label: 'Red Power',
      vibe: 'Commanding, unapologetic',
      rationale: 'Red satin + black wide-leg + platform heels + red blazer — stops traffic.',
      slotIds: ['bld-top-1', 'bld-bot-1', 'bld-sho-1', 'bld-out-1'],
    },
    {
      id: 'bld-look-2',
      label: 'Print Edge',
      vibe: 'Rebellious, confident',
      rationale: 'Leopard mini, cutout crop and snake boots — fearless mix with leather backbone.',
      slotIds: ['bld-top-2', 'bld-bot-3', 'bld-sho-3', 'bld-out-2'],
    },
    {
      id: 'bld-look-3',
      label: 'Jewel Dress',
      vibe: 'Statement, electric',
      rationale: 'Emerald midi + red heels — colour-blocking that means business.',
      slotIds: ['bld-drs-3', 'bld-sho-2'],
    },
    {
      id: 'bld-look-4',
      label: 'Maxi Drama',
      vibe: 'Sweeping, cinematic',
      rationale: 'Red wrap maxi + black platforms + animal coat — entrance guaranteed.',
      slotIds: ['bld-drs-2', 'bld-sho-1', 'bld-out-3'],
    },
  ],

  romantic: [
    {
      id: 'rom-look-1',
      label: 'Blush Day',
      vibe: 'Soft, feminine, daytime',
      rationale: 'Pink ruffle blouse + satin midi skirt + ballet flats — pure daytime romance.',
      slotIds: ['rom-top-1', 'rom-bot-1', 'rom-sho-2', 'rom-out-2'],
    },
    {
      id: 'rom-look-2',
      label: 'Floral Dream',
      vibe: 'Pretty, sunlit',
      rationale: 'Floral wrap midi + strappy heels — the dress-and-go romantic default.',
      slotIds: ['rom-drs-1', 'rom-sho-1'],
    },
    {
      id: 'rom-look-3',
      label: 'Ivory Lace',
      vibe: 'Ethereal, delicate',
      rationale: 'Lace maxi + kitten heel mules — timeless feminine grace.',
      slotIds: ['rom-drs-3', 'rom-sho-3'],
    },
    {
      id: 'rom-look-4',
      label: 'Sweet Picnic',
      vibe: 'Fresh, carefree, summery',
      rationale: 'Off-shoulder cream knit + broderie mini + ballet flats — a romantic afternoon uniform.',
      slotIds: ['rom-top-2', 'rom-bot-3', 'rom-sho-2'],
    },
  ],

  classic: [
    {
      id: 'cls-look-1',
      label: 'Heritage Office',
      vibe: 'Polished, timeless',
      rationale: 'White button-down + dark trousers + loafers + navy blazer — the investment uniform.',
      slotIds: ['cls-top-1', 'cls-bot-1', 'cls-sho-1', 'cls-out-1'],
    },
    {
      id: 'cls-look-2',
      label: 'Wrap & Trench',
      vibe: 'Graceful, ageless',
      rationale: 'Camel wrap dress + loafers + trench — flattering and forever-wearable.',
      slotIds: ['cls-drs-3', 'cls-sho-1', 'cls-out-2'],
    },
    {
      id: 'cls-look-3',
      label: 'Little Black Dress',
      vibe: 'Iconic, simple',
      rationale: 'The LBD + pointed heels — the emergency look that never fails.',
      slotIds: ['cls-drs-1', 'cls-sho-2'],
    },
    {
      id: 'cls-look-4',
      label: 'Weekend Polished',
      vibe: 'Relaxed but pulled-together',
      rationale: 'Navy polo + mid-wash straight jeans + white sneakers — preppy weekend staple.',
      slotIds: ['cls-top-3', 'cls-bot-2', 'cls-sho-3'],
    },
  ],
} satisfies Record<StyleGoal, OutfitRecipe[]>;

export function inferStyleGoal(slots: CoreWardrobeSlot[]): StyleGoal | null {
  const counts: Record<string, number> = {};
  for (const s of slots) {
    const prefix = s.id.split('-')[0];
    if (PREFIX_TO_GOAL[prefix]) {
      counts[prefix] = (counts[prefix] ?? 0) + 1;
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [p, c] of Object.entries(counts)) {
    if (c > bestCount) { best = p; bestCount = c; }
  }
  return best ? PREFIX_TO_GOAL[best] : null;
}

/**
 * Pairs recommendation slots into curated outfit groups using style-goal
 * recipes (authored combinations, not positional pairing). Falls back to
 * positional pairing only if no recipes match the current slot set.
 * An outfit group is "complete" when every slot in it is owned.
 */
export function generateRecommendedOutfitGroups(slots: CoreWardrobeSlot[]): RecommendedOutfitGroup[] {
  if (slots.length === 0) return [];

  const goal = inferStyleGoal(slots);
  const slotsById = new Map(slots.map(s => [s.id, s]));
  const groups: RecommendedOutfitGroup[] = [];

  if (goal) {
    const recipes = OUTFIT_RECIPES[goal] ?? [];
    for (const recipe of recipes) {
      const resolved = recipe.slotIds
        .map(id => slotsById.get(id))
        .filter((s): s is CoreWardrobeSlot => !!s);
      if (resolved.length !== recipe.slotIds.length) continue;

      groups.push({
        id: recipe.id,
        label: recipe.label,
        vibe: recipe.vibe,
        rationale: recipe.rationale,
        slots: resolved,
        isComplete: resolved.every(s => s.status === 'owned'),
      });
    }
    if (groups.length > 0) return groups;
  }

  // Fallback: positional pairing (preserves behaviour for custom blueprints).
  const tops    = slots.filter(s => s.category === 'top').sort((a, b) => a.priority - b.priority);
  const bottoms = slots.filter(s => s.category === 'bottom').sort((a, b) => a.priority - b.priority);
  const dresses = slots.filter(s => s.category === 'dress').sort((a, b) => a.priority - b.priority);
  const shoes   = slots.filter(s => s.category === 'shoes').sort((a, b) => a.priority - b.priority);
  if (shoes.length === 0) return [];

  let lookIndex = 1;
  const topBottomCount = Math.min(tops.length, bottoms.length);
  for (let i = 0; i < topBottomCount; i++) {
    const shoe = shoes[i % shoes.length];
    const groupSlots = [tops[i], bottoms[i], shoe];
    groups.push({
      id: `look-tb-${i}`,
      label: `Look ${lookIndex}`,
      slots: groupSlots,
      isComplete: groupSlots.every(s => s.status === 'owned'),
    });
    lookIndex++;
  }
  for (let i = 0; i < dresses.length; i++) {
    const shoe = shoes[i % shoes.length];
    const groupSlots = [dresses[i], shoe];
    groups.push({
      id: `look-dr-${i}`,
      label: `Look ${lookIndex}`,
      slots: groupSlots,
      isComplete: groupSlots.every(s => s.status === 'owned'),
    });
    lookIndex++;
  }

  return groups;
}

/**
 * Counts outfit ideas remaining — i.e., complete outfit groups from the
 * blueprint that the user does NOT yet fully own.
 */
export function countRecommendedOutfits(slots: CoreWardrobeSlot[]): number {
  return generateRecommendedOutfitGroups(slots).filter(g => !g.isComplete).length;
}

/**
 * A suggestion for the single highest-leverage missing item — the one slot
 * whose acquisition would immediately complete (unlock) the greatest number
 * of currently-incomplete curated looks. Falls back to the most-frequently
 * needed slot across incomplete looks when no single item would finish any.
 */
export interface NextSmartBuy {
  slot: CoreWardrobeSlot;
  unlocks: number;
  appearsIn: number;
  isDirectUnlock: boolean;
}

export function computeNextSmartBuy(slots: CoreWardrobeSlot[]): NextSmartBuy | null {
  const groups = generateRecommendedOutfitGroups(slots);
  const incomplete = groups.filter(g => !g.isComplete);
  if (incomplete.length === 0) return null;

  const unlockCount = new Map<string, number>();
  const appearCount = new Map<string, number>();
  const slotById = new Map<string, CoreWardrobeSlot>();

  for (const group of incomplete) {
    const needed = group.slots.filter(s => s.status === 'needed');
    for (const s of needed) {
      slotById.set(s.id, s);
      appearCount.set(s.id, (appearCount.get(s.id) ?? 0) + 1);
    }
    if (needed.length === 1) {
      const only = needed[0];
      unlockCount.set(only.id, (unlockCount.get(only.id) ?? 0) + 1);
    }
  }

  const pick = (map: Map<string, number>): NextSmartBuy | null => {
    let bestId: string | null = null;
    let bestScore = 0;
    for (const [id, score] of map.entries()) {
      if (score <= 0) continue;
      const slot = slotById.get(id);
      if (!slot) continue;
      if (
        score > bestScore ||
        (score === bestScore && bestId && slot.priority < (slotById.get(bestId)?.priority ?? 99)) ||
        (score === bestScore && bestId && slot.priority === (slotById.get(bestId)?.priority ?? 99) && id < bestId)
      ) {
        bestId = id;
        bestScore = score;
      }
    }
    if (!bestId) return null;
    const slot = slotById.get(bestId)!;
    return {
      slot,
      unlocks: unlockCount.get(bestId) ?? 0,
      appearsIn: appearCount.get(bestId) ?? 0,
      isDirectUnlock: (unlockCount.get(bestId) ?? 0) > 0,
    };
  };

  return pick(unlockCount) ?? pick(appearCount);
}
