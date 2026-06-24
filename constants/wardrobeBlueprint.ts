import { ImageSourcePropType } from 'react-native';
import { ItemCategory, UserProfile, StyleGoal } from '@/constants/types';
import { LIFESTYLE_CATEGORY_WEIGHTS } from '@/constants/blueprintPriority';
import { STYLE_BLUEPRINT_SLOTS, STYLE_GOALS } from '@/constants/blueprintSlots';
import { buildProfileBlueprintSlots } from '@/constants/blueprintCore';
import {
  getLifestyleGatedSlots as _getLifestyleGatedSlots,
  LIFESTYLE_THRESHOLD,
} from '@/constants/lifestyleSlotGroups';
import {
  generateRecommendedOutfitGroups as _generateRecommendedOutfitGroups,
  computeNextSmartBuy as _computeNextSmartBuy,
  countRecommendedOutfits as _countRecommendedOutfits,
  inferStyleGoal,
  type RecommendedOutfitGroup,
  type NextSmartBuy,
} from '@/constants/outfitGroupsCore';
export type {
  RecommendedOutfitGroup,
  OutfitRecipe,
  NextSmartBuy,
} from '@/constants/outfitGroupsCore';
export { OUTFIT_RECIPES } from '@/constants/outfitGroupsCore';

export { LIFESTYLE_THRESHOLD };

export interface WardrobeSlot {
  id: string;
  category: ItemCategory;
  subType: string;
  colorFamily: string;
  priority: number;
  label: string;
  description: string;
  sampleImage: ImageSourcePropType;
  status: 'needed' | 'owned';
  matchedItemId?: string;
}

/**
 * UI-safe variant of RecommendedOutfitGroup — slots carry the full
 * WardrobeSlot type (sampleImage: ImageSourcePropType) instead of the
 * asset-free CoreWardrobeSlot (sampleImage: unknown). Use this type in
 * all app/screen code so no casts are needed at the render site.
 */
export type UIRecommendedOutfitGroup = Omit<RecommendedOutfitGroup, 'slots'> & {
  slots: WardrobeSlot[];
};

/**
 * UI-safe variant of NextSmartBuy — slot carries the full WardrobeSlot
 * type so sampleImage is correctly typed for <Image source={...} />.
 */
export type UINextSmartBuy = Omit<NextSmartBuy, 'slot'> & {
  slot: WardrobeSlot;
};

type BlueprintItem = Omit<WardrobeSlot, 'status' | 'matchedItemId'>;

/**
 * Resolves an imageKey to its ImageSourcePropType.
 * Falls back to white_tee when the key is absent and, in dev builds,
 * logs a warning naming the offending slot id and missing key so
 * authoring errors are caught before they reach production.
 */
function resolveSampleImage(imageKey: string, slotId: string): ImageSourcePropType {
  if (__DEV__ && !(imageKey in SAMPLE_IMAGES)) {
    console.warn(
      `[wardrobeBlueprint] Slot "${slotId}" has imageKey "${imageKey}" ` +
      `with no matching SAMPLE_IMAGES entry — falling back to white_tee. ` +
      `Add the key to SAMPLE_IMAGES in wardrobeBlueprint.ts or fix the ` +
      `imageKey in blueprintSlots.ts.`,
    );
  }
  return SAMPLE_IMAGES[imageKey] ?? SAMPLE_IMAGES.white_tee;
}

const SAMPLE_IMAGES: Record<string, ImageSourcePropType> = {
  // ── Tops ────────────────────────────────────────────────────────────────
  white_tee:               require('@/assets/recommendations/white_tee.png'),
  white_shirt:             require('@/assets/recommendations/white_shirt.png'),
  cream_sweater:           require('@/assets/recommendations/cream_sweater.png'),
  black_blouse:            require('@/assets/recommendations/black_blouse.png'),
  pink_blouse:             require('@/assets/recommendations/pink_blouse.png'),
  red_blouse:              require('@/assets/recommendations/red_blouse.png'),
  white_linen_overshirt:   require('@/assets/recommendations/white_linen_overshirt.png'),
  ivory_silk_cami:         require('@/assets/recommendations/ivory_silk_cami.png'),
  cobalt_blue_top:         require('@/assets/recommendations/cobalt_blue_top.png'),
  lilac_lace_cami:         require('@/assets/recommendations/lilac_lace_cami.png'),
  navy_polo:               require('@/assets/recommendations/navy_polo.png'),
  graphic_tee:             require('@/assets/recommendations/graphic_tee.png'),
  beige_crop_top:          require('@/assets/recommendations/beige_crop_top.png'),
  black_cutout_crop_top:   require('@/assets/recommendations/black_cutout_crop_top.png'),
  // ── Bottoms ─────────────────────────────────────────────────────────────
  dark_trousers:           require('@/assets/recommendations/dark_trousers.png'),
  beige_trousers:          require('@/assets/recommendations/beige_trousers.png'),
  jeans:                   require('@/assets/recommendations/jeans.png'),
  camel_skirt:             require('@/assets/recommendations/camel_skirt.png'),
  white_wide_leg_trousers: require('@/assets/recommendations/white_wide_leg_trousers.png'),
  black_wide_leg_pants:    require('@/assets/recommendations/black_wide_leg_pants.png'),
  leopard_mini_skirt:      require('@/assets/recommendations/leopard_mini_skirt.png'),
  white_broderie_skirt:    require('@/assets/recommendations/white_broderie_skirt.png'),
  camel_midi_skirt:        require('@/assets/recommendations/camel_midi_skirt.png'),
  plaid_mini_skirt:        require('@/assets/recommendations/plaid_mini_skirt.png'),
  denim_mini_skirt:        require('@/assets/recommendations/denim_mini_skirt.png'),
  high_waist_jeans:        require('@/assets/recommendations/high_waist_jeans.png'),
  grey_trousers:           require('@/assets/recommendations/grey_trousers.png'),
  dark_slim_jeans:         require('@/assets/recommendations/dark_slim_jeans.png'),
  navy_wide_leg_trousers:  require('@/assets/recommendations/navy_wide_leg_trousers.png'),
  red_pencil_skirt:        require('@/assets/recommendations/red_pencil_skirt.png'),
  beige_satin_midi:        require('@/assets/recommendations/beige_satin_midi.png'),
  floral_blush_maxi_skirt: require('@/assets/recommendations/floral_blush_maxi_skirt.png'),
  // ── Dresses ─────────────────────────────────────────────────────────────
  black_dress:             require('@/assets/recommendations/black_dress.png'),
  beige_slip_dress:        require('@/assets/recommendations/beige_slip_dress.png'),
  white_linen_dress:       require('@/assets/recommendations/white_linen_dress.png'),
  grey_knit_dress:         require('@/assets/recommendations/grey_knit_dress.png'),
  navy_wrap_dress:         require('@/assets/recommendations/navy_wrap_dress.png'),
  champagne_slip_dress:    require('@/assets/recommendations/champagne_slip_dress.png'),
  red_wrap_dress:          require('@/assets/recommendations/red_wrap_dress.png'),
  emerald_dress:           require('@/assets/recommendations/emerald_dress.png'),
  blush_tulle_dress:       require('@/assets/recommendations/blush_tulle_dress.png'),
  ivory_lace_dress:        require('@/assets/recommendations/ivory_lace_dress.png'),
  navy_sheath_dress:       require('@/assets/recommendations/navy_sheath_dress.png'),
  camel_wrap_dress:        require('@/assets/recommendations/camel_wrap_dress.png'),
  denim_shirt_dress:       require('@/assets/recommendations/denim_shirt_dress.png'),
  floral_smocked_dress:    require('@/assets/recommendations/floral_smocked_dress.png'),
  casual_slip_dress:       require('@/assets/recommendations/casual_slip_dress.png'),
  black_silk_slip_dress:   require('@/assets/recommendations/black_silk_slip_dress.png'),
  black_bodycon_dress:     require('@/assets/recommendations/black_bodycon_dress.png'),
  floral_pink_wrap_dress:  require('@/assets/recommendations/floral_pink_wrap_dress.png'),
  // ── Outerwear ────────────────────────────────────────────────────────────
  navy_blazer:             require('@/assets/recommendations/navy_blazer.png'),
  red_blazer:              require('@/assets/recommendations/red_blazer.png'),
  camel_coat:              require('@/assets/recommendations/camel_coat.png'),
  cream_blazer:            require('@/assets/recommendations/cream_blazer.png'),
  grey_cardigan:           require('@/assets/recommendations/grey_cardigan.png'),
  animal_print_coat:       require('@/assets/recommendations/animal_print_coat.png'),
  pink_faux_fur:           require('@/assets/recommendations/pink_faux_fur.png'),
  black_pea_coat:          require('@/assets/recommendations/black_pea_coat.png'),
  varsity_jacket:          require('@/assets/recommendations/varsity_jacket.png'),
  grey_hoodie:             require('@/assets/recommendations/grey_hoodie.png'),
  satin_bomber:            require('@/assets/recommendations/satin_bomber.png'),
  oversized_blazer:        require('@/assets/recommendations/oversized_blazer.png'),
  denim_jacket:            require('@/assets/recommendations/denim_jacket.png'),
  black_leather_moto:      require('@/assets/recommendations/black_leather_moto.png'),
  blush_trench_coat:       require('@/assets/recommendations/blush_trench_coat.png'),
  cream_linen_blazer:      require('@/assets/recommendations/cream_linen_blazer.png'),
  // ── Shoes ────────────────────────────────────────────────────────────────
  white_sneakers:          require('@/assets/recommendations/white_sneakers.png'),
  white_flats:             require('@/assets/recommendations/white_flats.png'),
  beige_heels:             require('@/assets/recommendations/beige_heels.png'),
  black_heels:             require('@/assets/recommendations/black_heels.png'),
  loafers:                 require('@/assets/recommendations/loafers.png'),
  beige_mules:             require('@/assets/recommendations/beige_mules.png'),
  nude_heels:              require('@/assets/recommendations/nude_heels.png'),
  camel_slingbacks:        require('@/assets/recommendations/camel_slingbacks.png'),
  red_heels:               require('@/assets/recommendations/red_heels.png'),
  snake_boots:             require('@/assets/recommendations/snake_boots.png'),
  ballet_pink_flats:       require('@/assets/recommendations/ballet_pink_flats.png'),
  ivory_kitten_heels:      require('@/assets/recommendations/ivory_kitten_heels.png'),
  white_chunky_sandals:    require('@/assets/recommendations/white_chunky_sandals.png'),
  chunky_trainers:         require('@/assets/recommendations/chunky_trainers.png'),
  // ── Bags ─────────────────────────────────────────────────────────────────
  black_bag:               require('@/assets/recommendations/black_bag.png'),
  camel_bag:               require('@/assets/recommendations/camel_bag.png'),
  beige_bag:               require('@/assets/recommendations/beige_bag.png'),
  mini_bag:                require('@/assets/recommendations/mini_bag.png'),
  white_crossbody:         require('@/assets/recommendations/white_crossbody.png'),
  tan_clutch:              require('@/assets/recommendations/tan_clutch.png'),
  red_mini_bag:            require('@/assets/recommendations/red_mini_bag.png'),
  gold_clutch:             require('@/assets/recommendations/gold_clutch.png'),
  pink_mini_bag:           require('@/assets/recommendations/pink_mini_bag.png'),
  cream_clutch:            require('@/assets/recommendations/cream_clutch.png'),
  black_patent_clutch:     require('@/assets/recommendations/black_patent_clutch.png'),
  navy_chain_bag:          require('@/assets/recommendations/navy_chain_bag.png'),
  canvas_tote:             require('@/assets/recommendations/canvas_tote.png'),
  pastel_backpack:         require('@/assets/recommendations/pastel_backpack.png'),
  // ── Jewelry ──────────────────────────────────────────────────────────────
  gold_hoops:              require('@/assets/recommendations/gold_hoops.png'),
  gold_necklace:           require('@/assets/recommendations/gold_necklace.png'),
  gold_stud_earrings:      require('@/assets/recommendations/gold_stud_earrings.png'),
  gold_bracelet:           require('@/assets/recommendations/gold_bracelet.png'),
  pearl_studs:             require('@/assets/recommendations/pearl_studs.png'),
  geometric_earrings:      require('@/assets/recommendations/geometric_earrings.png'),
  gold_bangles:            require('@/assets/recommendations/gold_bangles.png'),
  rose_gold_bracelet:      require('@/assets/recommendations/rose_gold_bracelet.png'),
  pink_crystal_earrings:   require('@/assets/recommendations/pink_crystal_earrings.png'),
  pearl_drop_earrings:     require('@/assets/recommendations/pearl_drop_earrings.png'),
  gold_bangle:             require('@/assets/recommendations/gold_bangle.png'),
  layered_necklaces:       require('@/assets/recommendations/layered_necklaces.png'),
  colorful_bangles:        require('@/assets/recommendations/colorful_bangles.png'),
  gold_stacking_rings:     require('@/assets/recommendations/gold_stacking_rings.png'),
  gold_drop_earrings:      require('@/assets/recommendations/gold_drop_earrings.png'),
  chunky_gold_chain:       require('@/assets/recommendations/chunky_gold_chain.png'),
  pearl_gold_pendant:      require('@/assets/recommendations/pearl_gold_pendant.png'),
  gold_dress_watch:        require('@/assets/recommendations/gold_dress_watch.png'),
  // ── Active / Gym ─────────────────────────────────────────────────────────────
  activewear_leggings:     require('@/assets/recommendations/activewear_leggings.png'),
  sports_bra:              require('@/assets/recommendations/sports_bra.png'),
  training_shoes:          require('@/assets/recommendations/training_shoes.png'),
  gym_bag:                 require('@/assets/recommendations/gym_bag.png'),
  sports_hoodie:           require('@/assets/recommendations/sports_hoodie.png'),
  windbreaker:             require('@/assets/recommendations/windbreaker.png'),
  // ── Brunch ───────────────────────────────────────────────────────────────────
  linen_co_ord_set:        require('@/assets/recommendations/linen_co_ord_set.png'),
  wicker_bag:              require('@/assets/recommendations/wicker_bag.png'),
  brunch_sandals:          require('@/assets/recommendations/brunch_sandals.png'),
  // ── Resort ───────────────────────────────────────────────────────────────────
  beach_coverup:           require('@/assets/recommendations/beach_coverup.png'),
  espadrilles:             require('@/assets/recommendations/espadrilles.png'),
  resort_dress:            require('@/assets/recommendations/resort_dress.png'),
  // ── Night Out ────────────────────────────────────────────────────────────────
  mini_dress_black:        require('@/assets/recommendations/mini_dress_black.png'),
  sequin_top:              require('@/assets/recommendations/sequin_top.png'),
  strappy_heels:           require('@/assets/recommendations/strappy_heels.png'),
  evening_clutch_gold:     require('@/assets/recommendations/evening_clutch_gold.png'),
  statement_earrings:      require('@/assets/recommendations/statement_earrings.png'),
};

/**
 * STYLE_BLUEPRINTS is derived from the canonical slot data in
 * constants/blueprintSlots.ts (which is asset-free and testable in Node)
 * by adding the `sampleImage` field from the SAMPLE_IMAGES map here.
 * Never add raw slot arrays directly here — edit blueprintSlots.ts instead.
 */
const STYLE_BLUEPRINTS: Record<StyleGoal, BlueprintItem[]> = Object.fromEntries(
  STYLE_GOALS.map(goal => [
    goal,
    STYLE_BLUEPRINT_SLOTS[goal].map(({ imageKey, ...rest }) => ({
      ...rest,
      sampleImage: resolveSampleImage(imageKey, rest.id),
    })),
  ])
) as Record<StyleGoal, BlueprintItem[]>;

// ── Legacy inline definitions removed ────────────────────────────────────────
// The six blueprint arrays that previously lived here (minimal, elevated, bold,
// romantic, classic, youthful) have been moved to constants/blueprintSlots.ts.
// wardrobeBlueprint.ts adds sampleImage from SAMPLE_IMAGES and constructs
// STYLE_BLUEPRINTS via the mapping above.


// BODY_TYPE_PRIORITY_BOOSTS has moved to constants/blueprintCore.ts so tests
// can import it directly without triggering PNG asset require() calls.
// LIFESTYLE_CATEGORY_WEIGHTS is exported from constants/blueprintPriority.ts.

export const WARDROBE_BLUEPRINT: BlueprintItem[] = STYLE_BLUEPRINTS.classic;

/**
 * Single source of truth for sub-type chips shown in Add Item / Item
 * Detail pickers. Derived from every sub-type used across all curated
 * blueprints, then merged with hand-curated extras so common everyday
 * garments stay selectable. Guarantees that every blueprint slot is
 * fillable from the UI under the strict matcher.
 */
const EXTRA_SUBTYPES: Record<ItemCategory, string[]> = {
  top: [
    't-shirt', 'long-sleeve', 'polo-shirt', 'henley', 'rugby-shirt', 'turtleneck',
    'button-down', 'knit-top', 'sweatshirt', 'rashguard', 'linen-set',
  ],
  bottom: ['chinos', 'joggers', 'shorts', 'leggings', 'pencil-skirt'],
  dress: ['cocktail-dress', 'kaftan', 'sundress', 'bodycon-dress', 'slip-dress', 'gown'],
  outerwear: ['raincoat', 'puffer', 'vest', 'windbreaker'],
  shoes: ['ankle-boots', 'pumps', 'stilettos', 'block-heels', 'espadrilles', 'training-shoes'],
  bag: ['gym-bag', 'wicker-bag', 'evening-bag', 'beach-bag'],
  jewelry: ['brooch', 'statement-earrings', 'sunglasses', 'sunhat'],
};

export const BLUEPRINT_SUBTYPES_BY_CATEGORY: Record<ItemCategory, string[]> = (() => {
  const acc: Record<ItemCategory, Set<string>> = {
    top: new Set(), bottom: new Set(), dress: new Set(), outerwear: new Set(),
    shoes: new Set(), bag: new Set(), jewelry: new Set(),
  };
  for (const items of Object.values(STYLE_BLUEPRINTS)) {
    for (const it of items) acc[it.category]?.add(it.subType);
  }
  for (const [cat, extras] of Object.entries(EXTRA_SUBTYPES) as Array<[ItemCategory, string[]]>) {
    extras.forEach(s => acc[cat].add(s));
  }
  const out = {} as Record<ItemCategory, string[]>;
  (Object.keys(acc) as ItemCategory[]).forEach(c => { out[c] = [...acc[c]].sort(); });
  return out;
})();

/**
 * Returns the personalised wardrobe blueprint for a given user profile.
 *
 * Delegates the pure algorithm to buildProfileBlueprintSlots (blueprintCore.ts)
 * which is asset-free and directly testable, then attaches sampleImage from
 * SAMPLE_IMAGES before returning the full BlueprintItem array.
 */
export function getProfileBlueprint(profile: UserProfile): BlueprintItem[] {
  if (!profile.styleGoalPrimary) return WARDROBE_BLUEPRINT;

  return buildProfileBlueprintSlots(profile).map(({ imageKey, ...rest }) => ({
    ...rest,
    sampleImage: resolveSampleImage(imageKey, rest.id),
  }));
}

export function matchWardrobeItemToSlot(
  wardrobeItem: { category: ItemCategory; subType?: string; colorFamily?: string },
  slot: BlueprintItem,
): boolean {
  if (wardrobeItem.category !== slot.category) return false;
  return normalizeSubType(wardrobeItem.subType) === normalizeSubType(slot.subType)
    && normalizeColor(wardrobeItem.colorFamily) === normalizeColor(slot.colorFamily);
}

// Sub-type aliases — multiple labels that refer to the same garment shape.
// Anything matching maps to the canonical key. Unknown values pass through
// (lower-cased) so the strict equality check still works for new sub-types.
const SUBTYPE_ALIASES: Record<string, string> = {
  'tee': 't-shirt',
  'tshirt': 't-shirt',
  't shirt': 't-shirt',
  'longsleeve': 'long-sleeve',
  'long sleeve': 'long-sleeve',
  'polo': 'polo-shirt',
  'tank': 'tank-top',
  'crop': 'crop-top',
  'jean': 'jeans',
  'denim': 'jeans',
  'pants': 'trousers',
  'trouser': 'trousers',
  'wide leg': 'wide-leg',
  'wideleg': 'wide-leg',
  'short': 'shorts',
  'mini skirt': 'mini-skirt',
  'midi skirt': 'midi-skirt',
  'maxi skirt': 'maxi-skirt',
  'mini dress': 'mini-dress',
  'midi dress': 'midi-dress',
  'maxi dress': 'maxi-dress',
  'wrap dress': 'wrap-dress',
  'shirt dress': 'shirt-dress',
  'cocktail dress': 'cocktail-dress',
  'denim jacket': 'denim-jacket',
  'bomber': 'bomber-jacket',
  'bomber jacket': 'bomber-jacket',
  'leather jacket': 'leather-jacket',
  'sneaker': 'sneakers',
  'trainer': 'sneakers',
  'trainers': 'sneakers',
  'heel': 'heels',
  'flat': 'flats',
  'boot': 'boots',
  'sandal': 'sandals',
  'loafer': 'loafers',
  'mule': 'mules',
  'training shoes': 'training-shoes',
  'training shoe': 'training-shoes',
  'running shoes': 'training-shoes',
  'running shoe': 'training-shoes',
  'gym shoes': 'training-shoes',
  'sports shoes': 'training-shoes',
  'wicker bag': 'wicker-bag',
  'raffia bag': 'wicker-bag',
  'basket bag': 'wicker-bag',
  'sports hoodie': 'sports-hoodie',
  'sport hoodie': 'sports-hoodie',
  'gym hoodie': 'sports-hoodie',
  'gym bag': 'gym-bag',
};

function normalizeSubType(value: string | undefined): string {
  if (!value) return '';
  const cleaned = value.trim().toLowerCase();
  return SUBTYPE_ALIASES[cleaned] ?? cleaned;
}

// Colour aliases — equivalents that should be treated as the same family for
// blueprint matching. Blueprint authors freely use evocative names like
// "ivory" or "champagne"; user-visible chips stay limited.
const COLOR_ALIASES: Record<string, string> = {
  'ivory': 'cream',
  'off-white': 'cream',
  'off white': 'cream',
  'champagne': 'cream',
  'pearl': 'cream',
  'nude': 'beige',
  'tan': 'camel',
  'taupe': 'beige',
  'sand': 'beige',
  'stone': 'beige',
  'charcoal': 'grey',
  'gray': 'grey',
  'silver': 'grey',
  'gold': 'beige',
  'blush': 'pink',
  'rose': 'pink',
  'wine': 'burgundy',
  'maroon': 'burgundy',
  'forest': 'green',
  'emerald': 'green',
  'sage': 'green',
  'khaki': 'olive',
  'mustard': 'olive',
  'denim': 'blue',
  'midnight': 'navy',
  'cobalt': 'blue',
  'chocolate': 'brown',
  'lilac': 'lavender',
  'rose-gold': 'pink',
  'rosegold': 'pink',
  'canvas': 'beige',
  'animal': 'brown',
  'leopard': 'brown',
  'snake': 'brown',
  'plaid': 'brown',
  'floral': 'pink',
  'pastel': 'pink',
  'multi': 'multi',
};

function normalizeColor(value: string | undefined): string {
  if (!value) return '';
  const cleaned = value.trim().toLowerCase();
  return COLOR_ALIASES[cleaned] ?? cleaned;
}

/**
 * A close-but-not-exact match: same category + same colour family but a
 * different sub-type. Used for the "you have something similar" hint on
 * slots that are still classed as "needed" by the strict matcher — e.g.
 * the slot wants a beige midi-dress and the user owns a beige maxi-dress.
 */
export function findCloseMatch(
  wardrobeItems: Array<{ id: string; name?: string; category: ItemCategory; subType: string; colorFamily: string }>,
  slot: WardrobeSlot,
): { id: string; name?: string; subType: string } | null {
  if (slot.status === 'owned') return null;
  const slotSub = normalizeSubType(slot.subType);
  const slotCol = normalizeColor(slot.colorFamily);
  const hit = wardrobeItems.find(wi =>
    wi.category === slot.category
    && normalizeColor(wi.colorFamily) === slotCol
    && normalizeSubType(wi.subType) !== slotSub
  );
  return hit ? { id: hit.id, name: hit.name, subType: hit.subType } : null;
}

export function initializeSlots(
  wardrobeItems: Array<{ id: string; category: ItemCategory; subType: string; colorFamily: string }>,
  blueprint: BlueprintItem[],
): WardrobeSlot[] {
  return blueprint.map(item => {
    const match = wardrobeItems.find(wi => matchWardrobeItemToSlot(wi, item));
    if (match) {
      return { ...item, status: 'owned', matchedItemId: match.id };
    }
    return { ...item, status: 'needed' };
  });
}

export function updateSlotsAfterAdd(
  slots: WardrobeSlot[],
  newItem: { id: string; category: ItemCategory; subType: string; colorFamily: string },
): WardrobeSlot[] {
  return slots.map(slot => {
    if (slot.status === 'needed' && matchWardrobeItemToSlot(newItem, slot)) {
      return { ...slot, status: 'owned', matchedItemId: newItem.id };
    }
    return slot;
  });
}

/**
 * Pairs recommendation slots into curated outfit groups using style-goal
 * recipes (authored combinations, not positional pairing). Falls back to
 * positional pairing only if no recipes match the current slot set.
 * An outfit group is "complete" when every slot in it is owned.
 *
 * Implementation lives in constants/outfitGroupsCore.ts (asset-free).
 */
export function generateRecommendedOutfitGroups(slots: WardrobeSlot[]): UIRecommendedOutfitGroup[] {
  return _generateRecommendedOutfitGroups(slots) as UIRecommendedOutfitGroup[];
}

/**
 * Counts outfit ideas remaining — i.e., complete outfit groups from the
 * blueprint that the user does NOT yet fully own.
 * When all items in a group are acquired the count drops by 1.
 */
export function countRecommendedOutfits(slots: WardrobeSlot[]): number {
  return _countRecommendedOutfits(slots);
}

/**
 * Returns the single highest-leverage missing item — the one slot whose
 * acquisition would immediately complete the greatest number of incomplete
 * curated looks. Falls back to the most-frequently needed slot when no single
 * item would finish any group.
 *
 * Implementation lives in constants/outfitGroupsCore.ts (asset-free).
 */
export function computeNextSmartBuy(slots: WardrobeSlot[]): UINextSmartBuy | null {
  return _computeNextSmartBuy(slots) as UINextSmartBuy | null;
}

export function getFirstNeededByCategory(slots: WardrobeSlot[]): Record<string, WardrobeSlot | undefined> {
  const result: Record<string, WardrobeSlot | undefined> = {};
  for (const slot of slots) {
    if (slot.status === 'needed' && !result[slot.category]) {
      result[slot.category] = slot;
    }
  }
  return result;
}

export interface LifestyleSlotGroup {
  lifestyle: 'active' | 'brunch' | 'resort' | 'night-out';
  label: string;
  completionText: string;
  slots: WardrobeSlot[];
  isComplete: boolean;
}

/**
 * Returns the lifestyle slot groups that should be surfaced in the UI based on
 * the user's lifestyle proportions.  A group is included when the relevant
 * lifestyle proportion meets or exceeds LIFESTYLE_THRESHOLD (30 %).
 *
 * Implementation lives in constants/lifestyleSlotGroups.ts (asset-free) so
 * it can be tested directly in Node/tsx without triggering PNG require() calls.
 * This wrapper re-applies the full WardrobeSlot type for use in the app.
 */
export function getLifestyleGatedSlots(
  slots: WardrobeSlot[],
  lifestyleActive: number,
  lifestyleBrunch: number,
  lifestyleEvents: number,
): LifestyleSlotGroup[] {
  return _getLifestyleGatedSlots(slots, lifestyleActive, lifestyleBrunch, lifestyleEvents) as LifestyleSlotGroup[];
}
