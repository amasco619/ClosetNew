import { ImageSourcePropType } from 'react-native';
import { ItemCategory, StyleGoal, BodyType, UserProfile } from '@/constants/types';

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

type BlueprintItem = Omit<WardrobeSlot, 'status' | 'matchedItemId'>;

const SAMPLE_IMAGES: Record<string, ImageSourcePropType> = {
  // ── Tops ────────────────────────────────────────────────────────────────
  white_tee:          require('@/assets/recommendations/white_tee.png'),
  white_shirt:        require('@/assets/recommendations/white_shirt.png'),
  blue_shirt:         require('@/assets/recommendations/blue_shirt.png'),
  cream_sweater:      require('@/assets/recommendations/cream_sweater.png'),
  black_blouse:       require('@/assets/recommendations/black_blouse.png'),
  pink_blouse:        require('@/assets/recommendations/pink_blouse.png'),
  red_blouse:         require('@/assets/recommendations/red_blouse.png'),
  crop_top:           require('@/assets/recommendations/white_tee.png'),
  // ── Bottoms ─────────────────────────────────────────────────────────────
  dark_trousers:      require('@/assets/recommendations/dark_trousers.png'),
  beige_trousers:     require('@/assets/recommendations/beige_trousers.png'),
  jeans:              require('@/assets/recommendations/jeans.png'),
  camel_skirt:        require('@/assets/recommendations/camel_skirt.png'),
  mini_skirt:         require('@/assets/recommendations/dark_trousers.png'),
  wide_leg_trousers:  require('@/assets/recommendations/beige_trousers.png'),
  // ── Dresses ─────────────────────────────────────────────────────────────
  black_dress:        require('@/assets/recommendations/black_dress.png'),
  pink_dress:         require('@/assets/recommendations/pink_dress.png'),
  // ── Outerwear ────────────────────────────────────────────────────────────
  navy_blazer:        require('@/assets/recommendations/navy_blazer.png'),
  red_blazer:         require('@/assets/recommendations/red_blazer.png'),
  camel_coat:         require('@/assets/recommendations/camel_coat.png'),
  leather_jacket:     require('@/assets/recommendations/navy_blazer.png'),
  bomber_jacket:      require('@/assets/recommendations/navy_blazer.png'),
  grey_hoodie:        require('@/assets/recommendations/cream_sweater.png'),
  // ── Shoes ────────────────────────────────────────────────────────────────
  white_sneakers:     require('@/assets/recommendations/white_sneakers.png'),
  white_flats:        require('@/assets/recommendations/white_flats.png'),
  beige_heels:        require('@/assets/recommendations/beige_heels.png'),
  black_heels:        require('@/assets/recommendations/black_heels.png'),
  loafers:            require('@/assets/recommendations/loafers.png'),
  brown_boots:        require('@/assets/recommendations/brown_boots.png'),
  // ── Bags ─────────────────────────────────────────────────────────────────
  black_bag:          require('@/assets/recommendations/black_bag.png'),
  camel_bag:          require('@/assets/recommendations/camel_bag.png'),
  beige_bag:          require('@/assets/recommendations/beige_bag.png'),
  mini_bag:           require('@/assets/recommendations/mini_bag.png'),
  // ── Jewelry ──────────────────────────────────────────────────────────────
  gold_hoops:         require('@/assets/recommendations/gold_hoops.png'),
  gold_necklace:      require('@/assets/recommendations/gold_necklace.png'),
  silver_watch:       require('@/assets/recommendations/silver_watch.png'),
  gold_watch:         require('@/assets/recommendations/silver_watch.png'),
};

const STYLE_BLUEPRINTS: Record<StyleGoal, BlueprintItem[]> = {

  // ────────────────────────────────────────────────────────────────────────
  // MINIMAL  —  quiet neutrals, clean lines, nothing extra
  // ────────────────────────────────────────────────────────────────────────
  minimal: [
    // Tops
    { id: 'min-top-1', category: 'top',      subType: 'tank-top',    colorFamily: 'white',  priority: 1, label: 'Fitted White Ribbed Tank',       description: 'The cleanest starting point — effortless and pure',          sampleImage: SAMPLE_IMAGES.white_tee },
    { id: 'min-top-2', category: 'top',      subType: 'sweater',     colorFamily: 'cream',  priority: 2, label: 'Fine-Knit Cream Sweater',         description: 'Soft texture in a quiet, warm neutral',                      sampleImage: SAMPLE_IMAGES.cream_sweater },
    // Bottoms
    { id: 'min-bot-1', category: 'bottom',   subType: 'trousers',    colorFamily: 'grey',   priority: 1, label: 'Straight-Leg Grey Trousers',      description: 'Precise tailoring with no unnecessary detail',               sampleImage: SAMPLE_IMAGES.dark_trousers },
    { id: 'min-bot-2', category: 'bottom',   subType: 'jeans',       colorFamily: 'navy',   priority: 2, label: 'Dark Slim Straight Jeans',        description: 'Clean denim in a sleek, pared-back cut',                     sampleImage: SAMPLE_IMAGES.jeans },
    // Dress
    { id: 'min-drs-1', category: 'dress',    subType: 'midi-dress',  colorFamily: 'beige',  priority: 1, label: 'Beige Silk Slip Midi Dress',      description: 'Fluid, understated, and beautifully minimal',                sampleImage: SAMPLE_IMAGES.black_dress },
    // Outerwear
    { id: 'min-out-1', category: 'outerwear',subType: 'coat',        colorFamily: 'camel',  priority: 1, label: 'Camel Tailored Wool Coat',        description: 'A clean silhouette in the definitive neutral',               sampleImage: SAMPLE_IMAGES.camel_coat },
    { id: 'min-out-2', category: 'outerwear',subType: 'blazer',      colorFamily: 'beige',  priority: 2, label: 'Cream Oversized Blazer',          description: 'Relaxed tailoring, soft and effortless',                     sampleImage: SAMPLE_IMAGES.navy_blazer },
    // Shoes
    { id: 'min-sho-1', category: 'shoes',    subType: 'flats',       colorFamily: 'white',  priority: 1, label: 'White Leather Ballet Flats',      description: 'Minimal footwear — clean, flat, and timeless',               sampleImage: SAMPLE_IMAGES.white_flats },
    // Bag
    { id: 'min-bag-1', category: 'bag',      subType: 'tote',        colorFamily: 'black',  priority: 1, label: 'Black Structured Tote',           description: 'One clean bag that carries everything — nothing more',        sampleImage: SAMPLE_IMAGES.black_bag },
    // Jewelry
    { id: 'min-jew-1', category: 'jewelry',  subType: 'ring',        colorFamily: 'gold',   priority: 1, label: 'Thin Gold Stacking Rings',        description: 'A quiet glimmer — barely there but perfectly placed',        sampleImage: SAMPLE_IMAGES.gold_necklace },
  ],

  // ────────────────────────────────────────────────────────────────────────
  // ELEVATED  —  luxe fabrics, polished silhouettes, quiet confidence
  // ────────────────────────────────────────────────────────────────────────
  elevated: [
    // Tops
    { id: 'elv-top-1', category: 'top',      subType: 'blouse',      colorFamily: 'black',  priority: 1, label: 'Black Satin Blouse',              description: 'Luxe fabric that commands a room without effort',            sampleImage: SAMPLE_IMAGES.black_blouse },
    { id: 'elv-top-2', category: 'top',      subType: 'sweater',     colorFamily: 'cream',  priority: 2, label: 'Cashmere Ribbed Crewneck',        description: 'Premium softness — the definition of quiet luxury',          sampleImage: SAMPLE_IMAGES.cream_sweater },
    // Bottoms
    { id: 'elv-bot-1', category: 'bottom',   subType: 'trousers',    colorFamily: 'navy',   priority: 1, label: 'Wide-Leg Navy Trousers',          description: 'Fluid lines and sharp tailoring — effortlessly refined',     sampleImage: SAMPLE_IMAGES.dark_trousers },
    { id: 'elv-bot-2', category: 'bottom',   subType: 'midi-skirt',  colorFamily: 'camel',  priority: 2, label: 'Camel Midi A-Line Skirt',         description: 'A sophisticated silhouette in a warm statement neutral',     sampleImage: SAMPLE_IMAGES.camel_skirt },
    // Dress
    { id: 'elv-drs-1', category: 'dress',    subType: 'midi-dress',  colorFamily: 'black',  priority: 1, label: 'Black Silk Slip Midi Dress',      description: 'Understated glamour for elevated evenings',                  sampleImage: SAMPLE_IMAGES.black_dress },
    // Outerwear
    { id: 'elv-out-1', category: 'outerwear',subType: 'blazer',      colorFamily: 'navy',   priority: 1, label: 'Structured Navy Blazer',          description: 'Sharp shoulders and clean tailoring — the power piece',      sampleImage: SAMPLE_IMAGES.navy_blazer },
    { id: 'elv-out-2', category: 'outerwear',subType: 'coat',        colorFamily: 'camel',  priority: 2, label: 'Camel Longline Overcoat',         description: 'Investment outerwear with enduring, polished appeal',        sampleImage: SAMPLE_IMAGES.camel_coat },
    // Shoes
    { id: 'elv-sho-1', category: 'shoes',    subType: 'heels',       colorFamily: 'black',  priority: 1, label: 'Black Pointed-Toe Heels',         description: 'Sleek lines that signal sophistication at every step',       sampleImage: SAMPLE_IMAGES.black_heels },
    // Bag
    { id: 'elv-bag-1', category: 'bag',      subType: 'shoulder-bag',colorFamily: 'camel',  priority: 1, label: 'Camel Leather Shoulder Bag',      description: 'Structured craftsmanship in the season\'s warmest neutral',  sampleImage: SAMPLE_IMAGES.camel_bag },
    // Jewelry
    { id: 'elv-jew-1', category: 'jewelry',  subType: 'earrings',    colorFamily: 'gold',   priority: 1, label: 'Gold Statement Drop Earrings',    description: 'A refined finishing touch that elevates every look',         sampleImage: SAMPLE_IMAGES.gold_hoops },
  ],

  // ────────────────────────────────────────────────────────────────────────
  // BOLD  —  strong colours, statement pieces, unapologetic confidence
  // ────────────────────────────────────────────────────────────────────────
  bold: [
    // Tops
    { id: 'bld-top-1', category: 'top',      subType: 'blouse',      colorFamily: 'red',    priority: 1, label: 'Red Satin Statement Blouse',      description: 'Rich red that stops the room before you say a word',        sampleImage: SAMPLE_IMAGES.red_blouse },
    { id: 'bld-top-2', category: 'top',      subType: 'crop-top',    colorFamily: 'black',  priority: 2, label: 'Black Cutout Crop Top',           description: 'Bold proportions with an edge — confidence in every cut',   sampleImage: SAMPLE_IMAGES.white_tee },
    // Bottoms
    { id: 'bld-bot-1', category: 'bottom',   subType: 'wide-leg',    colorFamily: 'black',  priority: 1, label: 'High-Waist Wide-Leg Trousers',    description: 'Powerful silhouette with strong, graphic lines',            sampleImage: SAMPLE_IMAGES.dark_trousers },
    { id: 'bld-bot-2', category: 'bottom',   subType: 'midi-skirt',  colorFamily: 'red',    priority: 2, label: 'Red Midi Pencil Skirt',           description: 'A bold, body-skimming statement from waist to knee',        sampleImage: SAMPLE_IMAGES.camel_skirt },
    // Dress
    { id: 'bld-drs-1', category: 'dress',    subType: 'mini-dress',  colorFamily: 'black',  priority: 1, label: 'Black Bodycon Mini Dress',        description: 'Confident curves and unapologetic style in one piece',      sampleImage: SAMPLE_IMAGES.black_dress },
    // Outerwear
    { id: 'bld-out-1', category: 'outerwear',subType: 'blazer',      colorFamily: 'red',    priority: 1, label: 'Oversized Red Power Blazer',      description: 'Own the room — structured shoulders and pure red energy',   sampleImage: SAMPLE_IMAGES.red_blazer },
    { id: 'bld-out-2', category: 'outerwear',subType: 'leather-jacket',colorFamily:'black', priority: 2, label: 'Black Leather Moto Jacket',       description: 'Grounded edge that works with everything in your wardrobe', sampleImage: SAMPLE_IMAGES.leather_jacket },
    // Shoes
    { id: 'bld-sho-1', category: 'shoes',    subType: 'heels',       colorFamily: 'black',  priority: 1, label: 'Black Platform Block Heels',      description: 'Height, attitude and drama — bold from the ground up',      sampleImage: SAMPLE_IMAGES.black_heels },
    // Bag
    { id: 'bld-bag-1', category: 'bag',      subType: 'mini-bag',    colorFamily: 'black',  priority: 1, label: 'Mini Black Quilted Bag',          description: 'Small but mighty — a statement bag on a gold chain',        sampleImage: SAMPLE_IMAGES.mini_bag },
    // Jewelry
    { id: 'bld-jew-1', category: 'jewelry',  subType: 'necklace',    colorFamily: 'gold',   priority: 1, label: 'Chunky Gold Statement Chain',     description: 'Go big — a neck piece that declares you\'ve arrived',       sampleImage: SAMPLE_IMAGES.gold_necklace },
  ],

  // ────────────────────────────────────────────────────────────────────────
  // ROMANTIC  —  soft hues, feminine details, delicate and dreamy
  // ────────────────────────────────────────────────────────────────────────
  romantic: [
    // Tops
    { id: 'rom-top-1', category: 'top',      subType: 'blouse',      colorFamily: 'pink',   priority: 1, label: 'Dusty Pink Ruffle Blouse',        description: 'Soft ruffles and a dreamy blush that whispers romance',     sampleImage: SAMPLE_IMAGES.pink_blouse },
    { id: 'rom-top-2', category: 'top',      subType: 'sweater',     colorFamily: 'cream',  priority: 2, label: 'Off-Shoulder Cream Knit',         description: 'Gentle and feminine — cosy texture with delicate appeal',   sampleImage: SAMPLE_IMAGES.cream_sweater },
    // Bottoms
    { id: 'rom-bot-1', category: 'bottom',   subType: 'midi-skirt',  colorFamily: 'beige',  priority: 1, label: 'Beige Satin Midi Skirt',          description: 'Soft drape and quiet sheen for feminine, graceful dressing', sampleImage: SAMPLE_IMAGES.camel_skirt },
    { id: 'rom-bot-2', category: 'bottom',   subType: 'maxi-skirt',  colorFamily: 'pink',   priority: 2, label: 'Floral Blush Maxi Skirt',         description: 'Flowing florals and pretty blush tones — pure romance',     sampleImage: SAMPLE_IMAGES.pink_dress },
    // Dress
    { id: 'rom-drs-1', category: 'dress',    subType: 'wrap-dress',  colorFamily: 'pink',   priority: 1, label: 'Floral Pink Wrap Midi Dress',     description: 'Feminine wrap silhouette in a soft, romantic print',        sampleImage: SAMPLE_IMAGES.pink_dress },
    // Outerwear
    { id: 'rom-out-1', category: 'outerwear',subType: 'trench',      colorFamily: 'beige',  priority: 1, label: 'Blush Belted Trench Coat',        description: 'A cinched-waist silhouette that flatters and enchants',     sampleImage: SAMPLE_IMAGES.camel_coat },
    { id: 'rom-out-2', category: 'outerwear',subType: 'blazer',      colorFamily: 'cream',  priority: 2, label: 'Cream Linen Blazer',              description: 'Light and feminine — soft tailoring for warmer days',       sampleImage: SAMPLE_IMAGES.navy_blazer },
    // Shoes
    { id: 'rom-sho-1', category: 'shoes',    subType: 'heels',       colorFamily: 'beige',  priority: 1, label: 'Beige Strappy Block Heels',       description: 'Delicate straps and a neutral tone for romantic dressing',  sampleImage: SAMPLE_IMAGES.beige_heels },
    // Bag
    { id: 'rom-bag-1', category: 'bag',      subType: 'crossbody',   colorFamily: 'beige',  priority: 1, label: 'Beige Woven Crossbody Bag',       description: 'Textured weave and soft neutrals — charming and practical', sampleImage: SAMPLE_IMAGES.beige_bag },
    // Jewelry
    { id: 'rom-jew-1', category: 'jewelry',  subType: 'necklace',    colorFamily: 'gold',   priority: 1, label: 'Dainty Pearl & Gold Pendant',     description: 'A whisper of gold close to the heart — delicate and sweet', sampleImage: SAMPLE_IMAGES.gold_necklace },
  ],

  // ────────────────────────────────────────────────────────────────────────
  // CLASSIC  —  investment pieces, timeless silhouettes, heritage style
  // ────────────────────────────────────────────────────────────────────────
  classic: [
    // Tops
    { id: 'cls-top-1', category: 'top',      subType: 'shirt',       colorFamily: 'white',  priority: 1, label: 'Crisp White Button-Down Shirt',   description: 'The timeless foundation — impeccable, dependable, elegant', sampleImage: SAMPLE_IMAGES.white_shirt },
    { id: 'cls-top-2', category: 'top',      subType: 'blouse',      colorFamily: 'black',  priority: 2, label: 'Black Silk Blouse',               description: 'Refined fabric and a sleek cut for classic evenings',       sampleImage: SAMPLE_IMAGES.black_blouse },
    // Bottoms
    { id: 'cls-bot-1', category: 'bottom',   subType: 'trousers',    colorFamily: 'navy',   priority: 1, label: 'Dark Tailored Trousers',          description: 'Sharp creases and a clean line — perpetually polished',     sampleImage: SAMPLE_IMAGES.dark_trousers },
    { id: 'cls-bot-2', category: 'bottom',   subType: 'jeans',       colorFamily: 'blue',   priority: 2, label: 'Mid-Wash Straight-Leg Jeans',     description: 'Timeless denim that never goes out of style',              sampleImage: SAMPLE_IMAGES.jeans },
    // Dress
    { id: 'cls-drs-1', category: 'dress',    subType: 'midi-dress',  colorFamily: 'black',  priority: 1, label: 'Classic Little Black Dress',      description: 'The wardrobe icon — simple, sophisticated, always right',   sampleImage: SAMPLE_IMAGES.black_dress },
    // Outerwear
    { id: 'cls-out-1', category: 'outerwear',subType: 'blazer',      colorFamily: 'navy',   priority: 1, label: 'Navy Double-Breasted Blazer',     description: 'The quintessential classic — heritage tailoring at its best',sampleImage: SAMPLE_IMAGES.navy_blazer },
    { id: 'cls-out-2', category: 'outerwear',subType: 'trench',      colorFamily: 'camel',  priority: 2, label: 'Camel Trench Coat',               description: 'An enduring coat for every season and every decade',        sampleImage: SAMPLE_IMAGES.camel_coat },
    // Shoes
    { id: 'cls-sho-1', category: 'shoes',    subType: 'loafers',     colorFamily: 'brown',  priority: 1, label: 'Brown Leather Loafers',           description: 'Polished comfort that stands the test of time',             sampleImage: SAMPLE_IMAGES.loafers },
    // Bag
    { id: 'cls-bag-1', category: 'bag',      subType: 'tote',        colorFamily: 'camel',  priority: 1, label: 'Tan Leather Structured Tote',     description: 'Traditional craftsmanship you will carry for years',        sampleImage: SAMPLE_IMAGES.camel_bag },
    // Jewelry
    { id: 'cls-jew-1', category: 'jewelry',  subType: 'watch',       colorFamily: 'gold',   priority: 1, label: 'Gold Classic Dress Watch',        description: 'The refined finishing touch — elegance measured in time',   sampleImage: SAMPLE_IMAGES.gold_watch },
  ],

  // ────────────────────────────────────────────────────────────────────────
  // YOUTHFUL  —  playful, trend-led, energetic and fresh
  // ────────────────────────────────────────────────────────────────────────
  youthful: [
    // Tops
    { id: 'yth-top-1', category: 'top',      subType: 'tank-top',    colorFamily: 'white',  priority: 1, label: 'Fitted White Ribbed Tank',        description: 'The essential — a clean ribbed tank for any layered look',  sampleImage: SAMPLE_IMAGES.white_tee },
    { id: 'yth-top-2', category: 'top',      subType: 'crop-top',    colorFamily: 'beige',  priority: 2, label: 'Beige Ribbed Crop Top',           description: 'Playful proportions with a flattering, relaxed fit',        sampleImage: SAMPLE_IMAGES.crop_top },
    // Bottoms
    { id: 'yth-bot-1', category: 'bottom',   subType: 'wide-leg',    colorFamily: 'camel',  priority: 1, label: 'High-Waist Wide-Leg Camel Trousers', description: 'Relaxed and on-trend — the trouser that goes with everything', sampleImage: SAMPLE_IMAGES.wide_leg_trousers },
    { id: 'yth-bot-2', category: 'bottom',   subType: 'mini-skirt',  colorFamily: 'navy',   priority: 2, label: 'Denim Mini Skirt',                description: 'High-waist denim energy — retro, fun and endlessly fresh',  sampleImage: SAMPLE_IMAGES.mini_skirt },
    // Dress
    { id: 'yth-drs-1', category: 'dress',    subType: 'mini-dress',  colorFamily: 'black',  priority: 1, label: 'Mini Babydoll Dress',             description: 'A playful silhouette that goes from day to night instantly', sampleImage: SAMPLE_IMAGES.black_dress },
    // Outerwear
    { id: 'yth-out-1', category: 'outerwear',subType: 'hoodie',      colorFamily: 'grey',   priority: 1, label: 'Oversized Grey Hoodie',           description: 'Comfy, cool, and effortless — the street-style essential',  sampleImage: SAMPLE_IMAGES.grey_hoodie },
    { id: 'yth-out-2', category: 'outerwear',subType: 'bomber-jacket',colorFamily: 'black',  priority: 2, label: 'Black Satin Bomber Jacket',       description: 'Sleek and on-trend — the finisher for any youthful outfit', sampleImage: SAMPLE_IMAGES.bomber_jacket },
    // Shoes
    { id: 'yth-sho-1', category: 'shoes',    subType: 'sneakers',    colorFamily: 'white',  priority: 1, label: 'White Platform Trainers',         description: 'Fresh kicks that give every outfit an instant lift',        sampleImage: SAMPLE_IMAGES.white_sneakers },
    // Bag
    { id: 'yth-bag-1', category: 'bag',      subType: 'mini-bag',    colorFamily: 'black',  priority: 1, label: 'Mini Gold-Hardware Shoulder Bag', description: 'Tiny bag with big personality — gold chain, endless style',  sampleImage: SAMPLE_IMAGES.mini_bag },
    // Jewelry
    { id: 'yth-jew-1', category: 'jewelry',  subType: 'earrings',    colorFamily: 'gold',   priority: 1, label: 'Gold Huggie Hoop Earrings',       description: 'Stack a few, wear one — playful gold that works every day', sampleImage: SAMPLE_IMAGES.gold_hoops },
  ],
};

const BODY_TYPE_PRIORITY_BOOSTS: Record<BodyType, Record<string, number>> = {
  hourglass:           { 'dress': -1, 'bottom': 0, 'top': 0 },
  pear:                { 'top': -1, 'jewelry': -1, 'outerwear': -1 },
  apple:               { 'outerwear': -1, 'bottom': -1, 'dress': 1 },
  rectangle:           { 'outerwear': -1, 'dress': -1, 'jewelry': -1 },
  'inverted-triangle': { 'bottom': -1, 'shoes': -1, 'dress': 0 },
  athletic:            { 'dress': -1, 'outerwear': -1, 'jewelry': -1 },
};

const LIFESTYLE_CATEGORY_WEIGHTS: Record<string, Record<ItemCategory, number>> = {
  work:   { top: 1, bottom: 1, outerwear: 2, shoes: 1, jewelry: 1, dress: 1, bag: 1 },
  casual: { top: 1, bottom: 1, outerwear: 0, shoes: 2, jewelry: 0, dress: 0, bag: 1 },
  events: { top: 0, bottom: 0, outerwear: 0, shoes: 1, jewelry: 2, dress: 2, bag: 1 },
};

export const WARDROBE_BLUEPRINT: BlueprintItem[] = STYLE_BLUEPRINTS.classic;

export function getProfileBlueprint(profile: UserProfile): BlueprintItem[] {
  const primaryGoal = profile.styleGoalPrimary;
  if (!primaryGoal) return WARDROBE_BLUEPRINT;

  let items = [...STYLE_BLUEPRINTS[primaryGoal]];

  if (profile.styleGoalSecondary) {
    const secondaryItems = STYLE_BLUEPRINTS[profile.styleGoalSecondary];
    const existingIds = new Set(items.map(i => `${i.category}-${i.subType}-${i.colorFamily}`));
    for (const sItem of secondaryItems) {
      const key = `${sItem.category}-${sItem.subType}-${sItem.colorFamily}`;
      if (!existingIds.has(key)) {
        items.push({ ...sItem, priority: sItem.priority + 10 });
        existingIds.add(key);
      }
    }
  }

  if (profile.bodyType) {
    const boosts = BODY_TYPE_PRIORITY_BOOSTS[profile.bodyType];
    items = items.map(item => {
      const boost = boosts[item.category];
      if (boost !== undefined && boost !== 0) {
        return { ...item, priority: Math.max(1, item.priority + boost) };
      }
      return item;
    });
  }

  const workPct   = profile.lifestyleWork   / 100;
  const casualPct = profile.lifestyleCasual / 100;
  const eventsPct = profile.lifestyleEvents / 100;

  if (workPct > 0 || casualPct > 0 || eventsPct > 0) {
    items = items.map(item => {
      const workWeight   = (LIFESTYLE_CATEGORY_WEIGHTS.work[item.category]   || 0) * workPct;
      const casualWeight = (LIFESTYLE_CATEGORY_WEIGHTS.casual[item.category] || 0) * casualPct;
      const eventsWeight = (LIFESTYLE_CATEGORY_WEIGHTS.events[item.category] || 0) * eventsPct;
      const totalBoost   = workWeight + casualWeight + eventsWeight;
      const adjustment   = totalBoost > 1.5 ? -1 : totalBoost < 0.5 ? 1 : 0;
      return { ...item, priority: Math.max(1, item.priority + adjustment) };
    });
  }

  if (profile.constraints.maxHeelHeight === 'flat') {
    items = items.filter(item => item.subType !== 'heels');
  }
  if (profile.constraints.noSleeveless) {
    items = items.filter(item => item.subType !== 'tank-top');
  }
  if (profile.constraints.noShortSkirts) {
    items = items.map(item => {
      if (item.subType === 'mini-dress' || item.subType === 'mini-skirt') {
        return { ...item, subType: 'midi-dress', label: item.label.replace('Mini', 'Midi') };
      }
      return item;
    });
  }

  items.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.priority - b.priority;
  });

  return items;
}

export function initializeSlots(
  wardrobeItems: { category: ItemCategory; subType: string; colorFamily: string; id: string }[],
  blueprint?: BlueprintItem[]
): WardrobeSlot[] {
  const bp = blueprint || WARDROBE_BLUEPRINT;
  return bp.map(bpItem => {
    const match = wardrobeItems.find(
      item =>
        item.category   === bpItem.category &&
        (item.subType   === bpItem.subType || item.colorFamily === bpItem.colorFamily)
    );
    return {
      ...bpItem,
      status:        match ? 'owned' : 'needed',
      matchedItemId: match?.id,
    };
  });
}

export function updateSlotOwnership(
  slots: WardrobeSlot[],
  wardrobeItems: { category: ItemCategory; subType: string; colorFamily: string; id: string }[]
): WardrobeSlot[] {
  return slots.map(slot => {
    const match = wardrobeItems.find(
      item =>
        item.category   === slot.category &&
        (item.subType   === slot.subType || item.colorFamily === slot.colorFamily)
    );
    return {
      ...slot,
      status:        match ? 'owned' : 'needed',
      matchedItemId: match?.id,
    };
  });
}
