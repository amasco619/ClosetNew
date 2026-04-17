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
  white_tee:               require('@/assets/recommendations/white_tee.png'),
  white_shirt:             require('@/assets/recommendations/white_shirt.png'),
  blue_shirt:              require('@/assets/recommendations/blue_shirt.png'),
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
  pink_dress:              require('@/assets/recommendations/pink_dress.png'),
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
  brown_boots:             require('@/assets/recommendations/brown_boots.png'),
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
  silver_watch:            require('@/assets/recommendations/silver_watch.png'),
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
};

const STYLE_BLUEPRINTS: Record<StyleGoal, BlueprintItem[]> = {

  // ────────────────────────────────────────────────────────────────────────
  // MINIMAL  —  quiet neutrals, clean lines, nothing extra
  // ────────────────────────────────────────────────────────────────────────
  minimal: [
    // Tops
    { id: 'min-top-1', category: 'top',       subType: 'tank-top',      colorFamily: 'white',  priority: 1, label: 'Fitted White Ribbed Tank',          description: 'The cleanest starting point — effortless and pure',            sampleImage: SAMPLE_IMAGES.white_tee },
    { id: 'min-top-2', category: 'top',       subType: 'sweater',       colorFamily: 'cream',  priority: 2, label: 'Fine-Knit Cream Sweater',           description: 'Soft texture in a quiet, warm neutral',                        sampleImage: SAMPLE_IMAGES.cream_sweater },
    { id: 'min-top-3', category: 'top',       subType: 'shirt',         colorFamily: 'white',  priority: 3, label: 'Oversized White Linen Shirt',        description: 'Relaxed linen volume — minimal dressing at its best',          sampleImage: SAMPLE_IMAGES.white_linen_overshirt },
    // Bottoms
    { id: 'min-bot-1', category: 'bottom',    subType: 'trousers',      colorFamily: 'grey',   priority: 1, label: 'Straight-Leg Grey Trousers',        description: 'Precise tailoring with no unnecessary detail',                 sampleImage: SAMPLE_IMAGES.grey_trousers },
    { id: 'min-bot-2', category: 'bottom',    subType: 'jeans',         colorFamily: 'navy',   priority: 2, label: 'Dark Slim Straight Jeans',          description: 'Clean denim in a sleek, pared-back cut',                       sampleImage: SAMPLE_IMAGES.dark_slim_jeans },
    { id: 'min-bot-3', category: 'bottom',    subType: 'wide-leg',      colorFamily: 'white',  priority: 3, label: 'White Wide-Leg Linen Trousers',     description: 'Flowing white linen — airy, light and intentionally simple',   sampleImage: SAMPLE_IMAGES.white_wide_leg_trousers },
    // Dresses
    { id: 'min-drs-1', category: 'dress',     subType: 'midi-dress',    colorFamily: 'beige',  priority: 1, label: 'Beige Silk Slip Midi Dress',        description: 'Fluid, understated, and beautifully minimal',                  sampleImage: SAMPLE_IMAGES.beige_slip_dress },
    { id: 'min-drs-2', category: 'dress',     subType: 'shirt-dress',   colorFamily: 'white',  priority: 2, label: 'White Linen Shirt Dress',           description: 'Casual elegance — one piece that does everything quietly',     sampleImage: SAMPLE_IMAGES.white_linen_dress },
    { id: 'min-drs-3', category: 'dress',     subType: 'knit-dress',    colorFamily: 'grey',   priority: 3, label: 'Grey Ribbed Knit Midi Dress',       description: 'Textural comfort in a no-fuss, chic neutral',                  sampleImage: SAMPLE_IMAGES.grey_knit_dress },
    // Outerwear
    { id: 'min-out-1', category: 'outerwear', subType: 'coat',          colorFamily: 'camel',  priority: 1, label: 'Camel Tailored Wool Coat',          description: 'A clean silhouette in the definitive neutral',                 sampleImage: SAMPLE_IMAGES.camel_coat },
    { id: 'min-out-2', category: 'outerwear', subType: 'blazer',        colorFamily: 'cream',  priority: 2, label: 'Cream Oversized Blazer',            description: 'Relaxed tailoring, soft and effortless',                       sampleImage: SAMPLE_IMAGES.cream_blazer },
    { id: 'min-out-3', category: 'outerwear', subType: 'cardigan',      colorFamily: 'grey',   priority: 3, label: 'Light Grey Longline Cardigan',      description: 'Draped simplicity — layering that never overcomplicates',      sampleImage: SAMPLE_IMAGES.grey_cardigan },
    // Shoes
    { id: 'min-sho-1', category: 'shoes',     subType: 'flats',         colorFamily: 'white',  priority: 1, label: 'White Leather Ballet Flats',        description: 'Minimal footwear — clean, flat, and timeless',                 sampleImage: SAMPLE_IMAGES.white_flats },
    { id: 'min-sho-2', category: 'shoes',     subType: 'mules',         colorFamily: 'beige',  priority: 2, label: 'Beige Pointed-Toe Mules',           description: 'Effortless and sleek — a slide that whispers refinement',      sampleImage: SAMPLE_IMAGES.beige_mules },
    { id: 'min-sho-3', category: 'shoes',     subType: 'sneakers',      colorFamily: 'white',  priority: 3, label: 'White Minimalist Sneakers',         description: 'Clean white trainers that ground any minimal look',            sampleImage: SAMPLE_IMAGES.white_sneakers },
    // Bags
    { id: 'min-bag-1', category: 'bag',       subType: 'tote',          colorFamily: 'black',  priority: 1, label: 'Black Structured Tote',             description: 'One clean bag that carries everything — nothing more',         sampleImage: SAMPLE_IMAGES.black_bag },
    { id: 'min-bag-2', category: 'bag',       subType: 'tote',          colorFamily: 'beige',  priority: 2, label: 'Beige Leather Tote',                description: 'Soft and unfussy — the everyday carry for a minimal wardrobe', sampleImage: SAMPLE_IMAGES.beige_bag },
    { id: 'min-bag-3', category: 'bag',       subType: 'crossbody',     colorFamily: 'white',  priority: 3, label: 'White Compact Crossbody',           description: 'Small, clean, and precise — just what you need',               sampleImage: SAMPLE_IMAGES.white_crossbody },
    // Jewelry
    { id: 'min-jew-1', category: 'jewelry',   subType: 'ring',          colorFamily: 'gold',   priority: 1, label: 'Thin Gold Stacking Rings',          description: 'A quiet glimmer — barely there but perfectly placed',          sampleImage: SAMPLE_IMAGES.gold_stacking_rings },
    { id: 'min-jew-2', category: 'jewelry',   subType: 'necklace',      colorFamily: 'gold',   priority: 2, label: 'Gold Delicate Chain Necklace',      description: 'One fine chain, close to the collarbone — nothing more needed', sampleImage: SAMPLE_IMAGES.gold_necklace },
    { id: 'min-jew-3', category: 'jewelry',   subType: 'earrings',      colorFamily: 'gold',   priority: 3, label: 'Small Gold Stud Earrings',          description: 'A single, quiet dot of gold — the only finish you need',      sampleImage: SAMPLE_IMAGES.gold_stud_earrings },
  ],

  // ────────────────────────────────────────────────────────────────────────
  // ELEVATED  —  luxe fabrics, polished silhouettes, quiet confidence
  // ────────────────────────────────────────────────────────────────────────
  elevated: [
    // Tops
    { id: 'elv-top-1', category: 'top',       subType: 'blouse',        colorFamily: 'black',  priority: 1, label: 'Black Satin Blouse',                description: 'Luxe fabric that commands a room without effort',              sampleImage: SAMPLE_IMAGES.black_blouse },
    { id: 'elv-top-2', category: 'top',       subType: 'sweater',       colorFamily: 'cream',  priority: 2, label: 'Cashmere Ribbed Crewneck',          description: 'Premium softness — the definition of quiet luxury',            sampleImage: SAMPLE_IMAGES.cream_sweater },
    { id: 'elv-top-3', category: 'top',       subType: 'camisole',      colorFamily: 'ivory',  priority: 3, label: 'Ivory Silk Camisole',               description: 'Barely-there elegance — silk against the skin, effortlessly chic', sampleImage: SAMPLE_IMAGES.ivory_silk_cami },
    // Bottoms
    { id: 'elv-bot-1', category: 'bottom',    subType: 'trousers',      colorFamily: 'navy',   priority: 1, label: 'Wide-Leg Navy Trousers',            description: 'Fluid lines and sharp tailoring — effortlessly refined',       sampleImage: SAMPLE_IMAGES.navy_wide_leg_trousers },
    { id: 'elv-bot-2', category: 'bottom',    subType: 'midi-skirt',    colorFamily: 'camel',  priority: 2, label: 'Camel Midi A-Line Skirt',           description: 'A sophisticated silhouette in a warm statement neutral',       sampleImage: SAMPLE_IMAGES.camel_skirt },
    { id: 'elv-bot-3', category: 'bottom',    subType: 'wide-leg',      colorFamily: 'black',  priority: 3, label: 'Black Tailored Wide-Leg Pants',     description: 'Strong lines and clean drape — polished power dressing',      sampleImage: SAMPLE_IMAGES.black_wide_leg_pants },
    // Dresses
    { id: 'elv-drs-1', category: 'dress',     subType: 'midi-dress',    colorFamily: 'black',  priority: 1, label: 'Black Silk Slip Midi Dress',        description: 'Understated glamour for elevated evenings',                    sampleImage: SAMPLE_IMAGES.black_silk_slip_dress },
    { id: 'elv-drs-2', category: 'dress',     subType: 'wrap-dress',    colorFamily: 'navy',   priority: 2, label: 'Navy Wrap Midi Dress',              description: 'A polished wrap silhouette in a deeply elegant navy',          sampleImage: SAMPLE_IMAGES.navy_wrap_dress },
    { id: 'elv-drs-3', category: 'dress',     subType: 'slip-dress',    colorFamily: 'champagne', priority: 3, label: 'Champagne Satin Slip Dress',    description: 'Luminous satin that turns any occasion into a moment',         sampleImage: SAMPLE_IMAGES.champagne_slip_dress },
    // Outerwear
    { id: 'elv-out-1', category: 'outerwear', subType: 'blazer',        colorFamily: 'navy',   priority: 1, label: 'Structured Navy Blazer',            description: 'Sharp shoulders and clean tailoring — the power piece',        sampleImage: SAMPLE_IMAGES.navy_blazer },
    { id: 'elv-out-2', category: 'outerwear', subType: 'coat',          colorFamily: 'camel',  priority: 2, label: 'Camel Longline Overcoat',           description: 'Investment outerwear with enduring, polished appeal',          sampleImage: SAMPLE_IMAGES.camel_coat },
    { id: 'elv-out-3', category: 'outerwear', subType: 'blazer',        colorFamily: 'cream',  priority: 3, label: 'Cream Double-Breasted Blazer',      description: 'Soft tailoring with a luxurious finish — refined and fresh',   sampleImage: SAMPLE_IMAGES.cream_blazer },
    // Shoes
    { id: 'elv-sho-1', category: 'shoes',     subType: 'heels',         colorFamily: 'black',  priority: 1, label: 'Black Pointed-Toe Heels',           description: 'Sleek lines that signal sophistication at every step',         sampleImage: SAMPLE_IMAGES.black_heels },
    { id: 'elv-sho-2', category: 'shoes',     subType: 'heels',         colorFamily: 'nude',   priority: 2, label: 'Nude Strappy Heeled Sandals',       description: 'Leg-lengthening nude tones and elegant straps — understated allure', sampleImage: SAMPLE_IMAGES.nude_heels },
    { id: 'elv-sho-3', category: 'shoes',     subType: 'slingbacks',    colorFamily: 'camel',  priority: 3, label: 'Camel Leather Slingbacks',          description: 'Refined pointed toe — a European-chic finishing touch',        sampleImage: SAMPLE_IMAGES.camel_slingbacks },
    // Bags
    { id: 'elv-bag-1', category: 'bag',       subType: 'shoulder-bag',  colorFamily: 'camel',  priority: 1, label: 'Camel Leather Shoulder Bag',        description: 'Structured craftsmanship in the season\'s warmest neutral',   sampleImage: SAMPLE_IMAGES.camel_bag },
    { id: 'elv-bag-2', category: 'bag',       subType: 'mini-bag',      colorFamily: 'black',  priority: 2, label: 'Black Mini Structured Bag',         description: 'Compact luxury — a small bag with maximum presence',           sampleImage: SAMPLE_IMAGES.mini_bag },
    { id: 'elv-bag-3', category: 'bag',       subType: 'clutch',        colorFamily: 'tan',    priority: 3, label: 'Tan Leather Clutch',                description: 'Clean lines and buttery leather — a timeless evening carry',   sampleImage: SAMPLE_IMAGES.tan_clutch },
    // Jewelry
    { id: 'elv-jew-1', category: 'jewelry',   subType: 'earrings',      colorFamily: 'gold',   priority: 1, label: 'Gold Statement Drop Earrings',      description: 'A refined finishing touch that elevates every look',           sampleImage: SAMPLE_IMAGES.gold_drop_earrings },
    { id: 'elv-jew-2', category: 'jewelry',   subType: 'bracelet',      colorFamily: 'gold',   priority: 2, label: 'Gold Chain Bracelet',               description: 'Linked gold at the wrist — understated elegance in motion',    sampleImage: SAMPLE_IMAGES.gold_bracelet },
    { id: 'elv-jew-3', category: 'jewelry',   subType: 'earrings',      colorFamily: 'pearl',  priority: 3, label: 'Pearl Stud Earrings',               description: 'The most timeless jewel — soft luminescence, always right',   sampleImage: SAMPLE_IMAGES.pearl_studs },
  ],

  // ────────────────────────────────────────────────────────────────────────
  // BOLD  —  strong colours, statement pieces, unapologetic confidence
  // ────────────────────────────────────────────────────────────────────────
  bold: [
    // Tops
    { id: 'bld-top-1', category: 'top',       subType: 'blouse',        colorFamily: 'red',    priority: 1, label: 'Red Satin Statement Blouse',        description: 'Rich red that stops the room before you say a word',          sampleImage: SAMPLE_IMAGES.red_blouse },
    { id: 'bld-top-2', category: 'top',       subType: 'crop-top',      colorFamily: 'black',  priority: 2, label: 'Black Cutout Crop Top',             description: 'Bold proportions with an edge — confidence in every cut',     sampleImage: SAMPLE_IMAGES.black_cutout_crop_top },
    { id: 'bld-top-3', category: 'top',       subType: 'fitted-top',    colorFamily: 'cobalt', priority: 3, label: 'Cobalt Blue Fitted Top',            description: 'Vivid cobalt energy — a colour that demands the spotlight',    sampleImage: SAMPLE_IMAGES.cobalt_blue_top },
    // Bottoms
    { id: 'bld-bot-1', category: 'bottom',    subType: 'wide-leg',      colorFamily: 'black',  priority: 1, label: 'High-Waist Wide-Leg Trousers',      description: 'Powerful silhouette with strong, graphic lines',               sampleImage: SAMPLE_IMAGES.black_wide_leg_pants },
    { id: 'bld-bot-2', category: 'bottom',    subType: 'midi-skirt',    colorFamily: 'red',    priority: 2, label: 'Red Midi Pencil Skirt',             description: 'A bold, body-skimming statement from waist to knee',          sampleImage: SAMPLE_IMAGES.red_pencil_skirt },
    { id: 'bld-bot-3', category: 'bottom',    subType: 'mini-skirt',    colorFamily: 'leopard',priority: 3, label: 'Leopard Print Mini Skirt',          description: 'Fearless animal print — you\'re not here to blend in',        sampleImage: SAMPLE_IMAGES.leopard_mini_skirt },
    // Dresses
    { id: 'bld-drs-1', category: 'dress',     subType: 'mini-dress',    colorFamily: 'black',  priority: 1, label: 'Black Bodycon Mini Dress',          description: 'Confident curves and unapologetic style in one piece',         sampleImage: SAMPLE_IMAGES.black_bodycon_dress },
    { id: 'bld-drs-2', category: 'dress',     subType: 'maxi-dress',    colorFamily: 'red',    priority: 2, label: 'Red Wrap Maxi Dress',               description: 'Sweeping red drama — a head-turning entrance guaranteed',      sampleImage: SAMPLE_IMAGES.red_wrap_dress },
    { id: 'bld-drs-3', category: 'dress',     subType: 'midi-dress',    colorFamily: 'emerald',priority: 3, label: 'Emerald Green Midi Dress',          description: 'Rich jewel-tone green that commands every room effortlessly',  sampleImage: SAMPLE_IMAGES.emerald_dress },
    // Outerwear
    { id: 'bld-out-1', category: 'outerwear', subType: 'blazer',        colorFamily: 'red',    priority: 1, label: 'Oversized Red Power Blazer',        description: 'Own the room — structured shoulders and pure red energy',     sampleImage: SAMPLE_IMAGES.red_blazer },
    { id: 'bld-out-2', category: 'outerwear', subType: 'leather-jacket',colorFamily: 'black',  priority: 2, label: 'Black Leather Moto Jacket',         description: 'Grounded edge that works with everything in your wardrobe',   sampleImage: SAMPLE_IMAGES.black_leather_moto },
    { id: 'bld-out-3', category: 'outerwear', subType: 'coat',          colorFamily: 'animal', priority: 3, label: 'Animal Print Statement Coat',       description: 'Wear the coat, become the statement — fearless from the first layer', sampleImage: SAMPLE_IMAGES.animal_print_coat },
    // Shoes
    { id: 'bld-sho-1', category: 'shoes',     subType: 'heels',         colorFamily: 'black',  priority: 1, label: 'Black Platform Block Heels',        description: 'Height, attitude and drama — bold from the ground up',        sampleImage: SAMPLE_IMAGES.black_heels },
    { id: 'bld-sho-2', category: 'shoes',     subType: 'heels',         colorFamily: 'red',    priority: 2, label: 'Red Strappy Heeled Sandals',        description: 'Statement-making red from heel to toe — zero hesitation',     sampleImage: SAMPLE_IMAGES.red_heels },
    { id: 'bld-sho-3', category: 'shoes',     subType: 'boots',         colorFamily: 'snake',  priority: 3, label: 'Snake Print Ankle Boots',           description: 'Textured, edgy and wild — the finishing touch for any bold look', sampleImage: SAMPLE_IMAGES.snake_boots },
    // Bags
    { id: 'bld-bag-1', category: 'bag',       subType: 'mini-bag',      colorFamily: 'black',  priority: 1, label: 'Mini Black Quilted Bag',            description: 'Small but mighty — a statement bag on a gold chain',          sampleImage: SAMPLE_IMAGES.mini_bag },
    { id: 'bld-bag-2', category: 'bag',       subType: 'mini-bag',      colorFamily: 'red',    priority: 2, label: 'Red Structured Mini Bag',           description: 'Bold red on your arm — small bag, massive impact',             sampleImage: SAMPLE_IMAGES.red_mini_bag },
    { id: 'bld-bag-3', category: 'bag',       subType: 'clutch',        colorFamily: 'gold',   priority: 3, label: 'Gold Metallic Evening Clutch',      description: 'Gleaming gold that makes the whole look electric',             sampleImage: SAMPLE_IMAGES.gold_clutch },
    // Jewelry
    { id: 'bld-jew-1', category: 'jewelry',   subType: 'necklace',      colorFamily: 'gold',   priority: 1, label: 'Chunky Gold Statement Chain',       description: 'Go big — a neck piece that declares you\'ve arrived',         sampleImage: SAMPLE_IMAGES.chunky_gold_chain },
    { id: 'bld-jew-2', category: 'jewelry',   subType: 'earrings',      colorFamily: 'gold',   priority: 2, label: 'Bold Geometric Drop Earrings',      description: 'Architectural shapes that frame the face with intention',      sampleImage: SAMPLE_IMAGES.geometric_earrings },
    { id: 'bld-jew-3', category: 'jewelry',   subType: 'bracelet',      colorFamily: 'gold',   priority: 3, label: 'Layered Gold Bangles',              description: 'Stack them all — cascading gold that makes noise when you move', sampleImage: SAMPLE_IMAGES.gold_bangles },
  ],

  // ────────────────────────────────────────────────────────────────────────
  // ROMANTIC  —  soft hues, feminine details, delicate and dreamy
  // ────────────────────────────────────────────────────────────────────────
  romantic: [
    // Tops
    { id: 'rom-top-1', category: 'top',       subType: 'blouse',        colorFamily: 'pink',   priority: 1, label: 'Dusty Pink Ruffle Blouse',          description: 'Soft ruffles and a dreamy blush that whispers romance',       sampleImage: SAMPLE_IMAGES.pink_blouse },
    { id: 'rom-top-2', category: 'top',       subType: 'sweater',       colorFamily: 'cream',  priority: 2, label: 'Off-Shoulder Cream Knit',           description: 'Gentle and feminine — cosy texture with delicate appeal',     sampleImage: SAMPLE_IMAGES.cream_sweater },
    { id: 'rom-top-3', category: 'top',       subType: 'camisole',      colorFamily: 'lilac',  priority: 3, label: 'Lilac Lace Trim Camisole',          description: 'Soft lilac with delicate lace — tenderly feminine and sweet',  sampleImage: SAMPLE_IMAGES.lilac_lace_cami },
    // Bottoms
    { id: 'rom-bot-1', category: 'bottom',    subType: 'midi-skirt',    colorFamily: 'beige',  priority: 1, label: 'Beige Satin Midi Skirt',            description: 'Soft drape and quiet sheen for feminine, graceful dressing',  sampleImage: SAMPLE_IMAGES.beige_satin_midi },
    { id: 'rom-bot-2', category: 'bottom',    subType: 'maxi-skirt',    colorFamily: 'pink',   priority: 2, label: 'Floral Blush Maxi Skirt',           description: 'Flowing florals and pretty blush tones — pure romance',       sampleImage: SAMPLE_IMAGES.floral_blush_maxi_skirt },
    { id: 'rom-bot-3', category: 'bottom',    subType: 'mini-skirt',    colorFamily: 'white',  priority: 3, label: 'White Broderie Anglaise Mini Skirt',description: 'Delicate eyelet embroidery — sweetly romantic and summery',    sampleImage: SAMPLE_IMAGES.white_broderie_skirt },
    // Dresses
    { id: 'rom-drs-1', category: 'dress',     subType: 'wrap-dress',    colorFamily: 'pink',   priority: 1, label: 'Floral Pink Wrap Midi Dress',       description: 'Feminine wrap silhouette in a soft, romantic print',          sampleImage: SAMPLE_IMAGES.floral_pink_wrap_dress },
    { id: 'rom-drs-2', category: 'dress',     subType: 'midi-dress',    colorFamily: 'blush',  priority: 2, label: 'Blush Tulle Midi Dress',            description: 'Dreamy layers of blush tulle — a romantic vision in motion',   sampleImage: SAMPLE_IMAGES.blush_tulle_dress },
    { id: 'rom-drs-3', category: 'dress',     subType: 'maxi-dress',    colorFamily: 'ivory',  priority: 3, label: 'Ivory Lace Maxi Dress',             description: 'Delicate floral lace from hem to cuff — timeless feminine grace', sampleImage: SAMPLE_IMAGES.ivory_lace_dress },
    // Outerwear
    { id: 'rom-out-1', category: 'outerwear', subType: 'trench',        colorFamily: 'beige',  priority: 1, label: 'Blush Belted Trench Coat',          description: 'A cinched-waist silhouette that flatters and enchants',       sampleImage: SAMPLE_IMAGES.blush_trench_coat },
    { id: 'rom-out-2', category: 'outerwear', subType: 'blazer',        colorFamily: 'cream',  priority: 2, label: 'Cream Linen Blazer',                description: 'Light and feminine — soft tailoring for warmer days',         sampleImage: SAMPLE_IMAGES.cream_linen_blazer },
    { id: 'rom-out-3', category: 'outerwear', subType: 'jacket',        colorFamily: 'pink',   priority: 3, label: 'Pink Faux Fur Jacket',              description: 'Fluffy, playful and unapologetically feminine — wear joy',    sampleImage: SAMPLE_IMAGES.pink_faux_fur },
    // Shoes
    { id: 'rom-sho-1', category: 'shoes',     subType: 'heels',         colorFamily: 'beige',  priority: 1, label: 'Beige Strappy Block Heels',         description: 'Delicate straps and a neutral tone for romantic dressing',    sampleImage: SAMPLE_IMAGES.beige_heels },
    { id: 'rom-sho-2', category: 'shoes',     subType: 'flats',         colorFamily: 'pink',   priority: 2, label: 'Ballet Pink Satin Flats',           description: 'Soft pink satin and a bow — ballet-inspired feminine charm',  sampleImage: SAMPLE_IMAGES.ballet_pink_flats },
    { id: 'rom-sho-3', category: 'shoes',     subType: 'kitten-heels',  colorFamily: 'ivory',  priority: 3, label: 'Ivory Kitten Heel Mules',           description: 'A graceful low heel in the softest ivory — endlessly feminine', sampleImage: SAMPLE_IMAGES.ivory_kitten_heels },
    // Bags
    { id: 'rom-bag-1', category: 'bag',       subType: 'crossbody',     colorFamily: 'beige',  priority: 1, label: 'Beige Woven Crossbody Bag',         description: 'Textured weave and soft neutrals — charming and practical',   sampleImage: SAMPLE_IMAGES.beige_bag },
    { id: 'rom-bag-2', category: 'bag',       subType: 'mini-bag',      colorFamily: 'pink',   priority: 2, label: 'Pink Mini Quilted Bag',             description: 'Quilted blush with gold chain — a romantic bag in miniature', sampleImage: SAMPLE_IMAGES.pink_mini_bag },
    { id: 'rom-bag-3', category: 'bag',       subType: 'clutch',        colorFamily: 'cream',  priority: 3, label: 'Cream Pearl-Detail Clutch',         description: 'Pearl-trimmed ivory — the most enchanting evening carry',     sampleImage: SAMPLE_IMAGES.cream_clutch },
    // Jewelry
    { id: 'rom-jew-1', category: 'jewelry',   subType: 'necklace',      colorFamily: 'gold',   priority: 1, label: 'Dainty Pearl & Gold Pendant',       description: 'A whisper of gold close to the heart — delicate and sweet',   sampleImage: SAMPLE_IMAGES.pearl_gold_pendant },
    { id: 'rom-jew-2', category: 'jewelry',   subType: 'bracelet',      colorFamily: 'rose-gold', priority: 2, label: 'Rose Gold Chain Bracelet',      description: 'Blush-toned gold that glows softly at the wrist',             sampleImage: SAMPLE_IMAGES.rose_gold_bracelet },
    { id: 'rom-jew-3', category: 'jewelry',   subType: 'earrings',      colorFamily: 'pink',   priority: 3, label: 'Pink Crystal Drop Earrings',        description: 'Glittering pink crystals — light-catching and utterly pretty', sampleImage: SAMPLE_IMAGES.pink_crystal_earrings },
  ],

  // ────────────────────────────────────────────────────────────────────────
  // CLASSIC  —  investment pieces, timeless silhouettes, heritage style
  // ────────────────────────────────────────────────────────────────────────
  classic: [
    // Tops
    { id: 'cls-top-1', category: 'top',       subType: 'shirt',         colorFamily: 'white',  priority: 1, label: 'Crisp White Button-Down Shirt',     description: 'The timeless foundation — impeccable, dependable, elegant',   sampleImage: SAMPLE_IMAGES.white_shirt },
    { id: 'cls-top-2', category: 'top',       subType: 'blouse',        colorFamily: 'black',  priority: 2, label: 'Black Silk Blouse',                 description: 'Refined fabric and a sleek cut for classic evenings',         sampleImage: SAMPLE_IMAGES.black_blouse },
    { id: 'cls-top-3', category: 'top',       subType: 'polo',          colorFamily: 'navy',   priority: 3, label: 'Navy Fine-Knit Polo',               description: 'Heritage sportswear elevated — polished and quietly luxurious', sampleImage: SAMPLE_IMAGES.navy_polo },
    // Bottoms
    { id: 'cls-bot-1', category: 'bottom',    subType: 'trousers',      colorFamily: 'navy',   priority: 1, label: 'Dark Tailored Trousers',            description: 'Sharp creases and a clean line — perpetually polished',       sampleImage: SAMPLE_IMAGES.dark_trousers },
    { id: 'cls-bot-2', category: 'bottom',    subType: 'jeans',         colorFamily: 'blue',   priority: 2, label: 'Mid-Wash Straight-Leg Jeans',       description: 'Timeless denim that never goes out of style',                 sampleImage: SAMPLE_IMAGES.jeans },
    { id: 'cls-bot-3', category: 'bottom',    subType: 'midi-skirt',    colorFamily: 'camel',  priority: 3, label: 'Camel A-Line Midi Skirt',           description: 'A ladylike silhouette in a forever-wearable warm neutral',    sampleImage: SAMPLE_IMAGES.camel_midi_skirt },
    // Dresses
    { id: 'cls-drs-1', category: 'dress',     subType: 'midi-dress',    colorFamily: 'black',  priority: 1, label: 'Classic Little Black Dress',        description: 'The wardrobe icon — simple, sophisticated, always right',     sampleImage: SAMPLE_IMAGES.black_dress },
    { id: 'cls-drs-2', category: 'dress',     subType: 'sheath-dress',  colorFamily: 'navy',   priority: 2, label: 'Navy Sheath Dress',                 description: 'Tailored simplicity — a dress that does every occasion with poise', sampleImage: SAMPLE_IMAGES.navy_sheath_dress },
    { id: 'cls-drs-3', category: 'dress',     subType: 'wrap-dress',    colorFamily: 'camel',  priority: 3, label: 'Camel Belted Wrap Dress',           description: 'Flattering and ageless — the wrap cut in a timeless neutral', sampleImage: SAMPLE_IMAGES.camel_wrap_dress },
    // Outerwear
    { id: 'cls-out-1', category: 'outerwear', subType: 'blazer',        colorFamily: 'navy',   priority: 1, label: 'Navy Double-Breasted Blazer',       description: 'The quintessential classic — heritage tailoring at its best', sampleImage: SAMPLE_IMAGES.navy_blazer },
    { id: 'cls-out-2', category: 'outerwear', subType: 'trench',        colorFamily: 'camel',  priority: 2, label: 'Camel Trench Coat',                 description: 'An enduring coat for every season and every decade',          sampleImage: SAMPLE_IMAGES.camel_coat },
    { id: 'cls-out-3', category: 'outerwear', subType: 'pea-coat',      colorFamily: 'black',  priority: 3, label: 'Black Wool Pea Coat',               description: 'Nautical heritage in deep black — structured, storied, timeless', sampleImage: SAMPLE_IMAGES.black_pea_coat },
    // Shoes
    { id: 'cls-sho-1', category: 'shoes',     subType: 'loafers',       colorFamily: 'brown',  priority: 1, label: 'Brown Leather Loafers',             description: 'Polished comfort that stands the test of time',               sampleImage: SAMPLE_IMAGES.loafers },
    { id: 'cls-sho-2', category: 'shoes',     subType: 'heels',         colorFamily: 'black',  priority: 2, label: 'Black Pointed-Toe Heels',           description: 'The quintessential heel — sharp, sleek and eternally stylish', sampleImage: SAMPLE_IMAGES.black_heels },
    { id: 'cls-sho-3', category: 'shoes',     subType: 'sneakers',      colorFamily: 'white',  priority: 3, label: 'White Classic Sneakers',            description: 'Clean white trainers — the one casual nod every wardrobe needs', sampleImage: SAMPLE_IMAGES.white_sneakers },
    // Bags
    { id: 'cls-bag-1', category: 'bag',       subType: 'tote',          colorFamily: 'camel',  priority: 1, label: 'Tan Leather Structured Tote',       description: 'Traditional craftsmanship you will carry for years',          sampleImage: SAMPLE_IMAGES.camel_bag },
    { id: 'cls-bag-2', category: 'bag',       subType: 'clutch',        colorFamily: 'black',  priority: 2, label: 'Black Patent Leather Clutch',       description: 'High-gloss patent — the classic evening bag, perfected',      sampleImage: SAMPLE_IMAGES.black_patent_clutch },
    { id: 'cls-bag-3', category: 'bag',       subType: 'shoulder-bag',  colorFamily: 'navy',   priority: 3, label: 'Navy Chain Shoulder Bag',           description: 'A gold-chained navy bag — European elegance in every link',   sampleImage: SAMPLE_IMAGES.navy_chain_bag },
    // Jewelry
    { id: 'cls-jew-1', category: 'jewelry',   subType: 'watch',         colorFamily: 'gold',   priority: 1, label: 'Gold Classic Dress Watch',          description: 'The refined finishing touch — elegance measured in time',     sampleImage: SAMPLE_IMAGES.gold_dress_watch },
    { id: 'cls-jew-2', category: 'jewelry',   subType: 'earrings',      colorFamily: 'pearl',  priority: 2, label: 'Pearl Drop Earrings',               description: 'Heritage elegance at the ear — softly luminous and timeless', sampleImage: SAMPLE_IMAGES.pearl_drop_earrings },
    { id: 'cls-jew-3', category: 'jewelry',   subType: 'bracelet',      colorFamily: 'gold',   priority: 3, label: 'Simple Gold Bangle',                description: 'One smooth arc of gold — the most enduring arm statement',    sampleImage: SAMPLE_IMAGES.gold_bangle },
  ],

  // ────────────────────────────────────────────────────────────────────────
  // YOUTHFUL  —  playful, trend-led, energetic and fresh
  // ────────────────────────────────────────────────────────────────────────
  youthful: [
    // Tops
    { id: 'yth-top-1', category: 'top',       subType: 'tank-top',      colorFamily: 'white',  priority: 1, label: 'Fitted White Ribbed Tank',          description: 'The essential — a clean ribbed tank for any layered look',    sampleImage: SAMPLE_IMAGES.white_tee },
    { id: 'yth-top-2', category: 'top',       subType: 'crop-top',      colorFamily: 'beige',  priority: 2, label: 'Beige Ribbed Crop Top',             description: 'Playful proportions with a flattering, relaxed fit',          sampleImage: SAMPLE_IMAGES.beige_crop_top },
    { id: 'yth-top-3', category: 'top',       subType: 'graphic-tee',   colorFamily: 'white',  priority: 3, label: 'Vintage-Inspired Graphic Tee',      description: 'Retro nostalgia in a soft tee — effortlessly cool and current', sampleImage: SAMPLE_IMAGES.graphic_tee },
    // Bottoms
    { id: 'yth-bot-1', category: 'bottom',    subType: 'wide-leg',      colorFamily: 'camel',  priority: 1, label: 'High-Waist Wide-Leg Camel Trousers',description: 'Relaxed and on-trend — the trouser that goes with everything', sampleImage: SAMPLE_IMAGES.beige_trousers },
    { id: 'yth-bot-2', category: 'bottom',    subType: 'jeans',         colorFamily: 'blue',   priority: 2, label: 'High-Waist Straight Jeans',         description: 'The 90s youth formula — high-waist, straight-leg and endlessly wearable', sampleImage: SAMPLE_IMAGES.high_waist_jeans },
    { id: 'yth-bot-3', category: 'bottom',    subType: 'mini-skirt',    colorFamily: 'blue',   priority: 3, label: 'Denim Mini Skirt',                  description: 'High-waist denim energy — retro, fun and endlessly fresh',    sampleImage: SAMPLE_IMAGES.denim_mini_skirt },
    { id: 'yth-bot-4', category: 'bottom',    subType: 'mini-skirt',    colorFamily: 'plaid',  priority: 4, label: 'Plaid Mini Skirt',                  description: 'Preppy plaid in a fun mini cut — playful, cheeky and charming', sampleImage: SAMPLE_IMAGES.plaid_mini_skirt },
    // Dresses
    { id: 'yth-drs-1', category: 'dress',     subType: 'mini-dress',    colorFamily: 'black',  priority: 1, label: 'Mini Babydoll Dress',               description: 'A playful silhouette that goes from day to night instantly',  sampleImage: SAMPLE_IMAGES.black_dress },
    { id: 'yth-drs-2', category: 'dress',     subType: 'shirt-dress',   colorFamily: 'blue',   priority: 2, label: 'Denim Shirt Dress',                 description: 'Effortless denim from collar to hem — the casual dress icon',  sampleImage: SAMPLE_IMAGES.denim_shirt_dress },
    { id: 'yth-drs-3', category: 'dress',     subType: 'slip-dress',    colorFamily: 'black',  priority: 3, label: 'Casual Black Slip Dress',           description: 'Soft satin, bias-cut and effortless — the easiest way to look pulled together', sampleImage: SAMPLE_IMAGES.casual_slip_dress },
    { id: 'yth-drs-4', category: 'dress',     subType: 'mini-dress',    colorFamily: 'floral', priority: 4, label: 'Floral Smocked Mini Dress',         description: 'Puff sleeves and sweet florals — the ultimate carefree summer dress', sampleImage: SAMPLE_IMAGES.floral_smocked_dress },
    // Outerwear
    { id: 'yth-out-1', category: 'outerwear', subType: 'blazer',        colorFamily: 'black',  priority: 1, label: 'Oversized Black Blazer',            description: 'Smart-meets-playful — the trend-forward layer over jeans, skirts and dresses', sampleImage: SAMPLE_IMAGES.oversized_blazer },
    { id: 'yth-out-2', category: 'outerwear', subType: 'denim-jacket',  colorFamily: 'blue',   priority: 2, label: 'Classic Denim Jacket',              description: 'The Americana staple — throws over anything and adds instant cool', sampleImage: SAMPLE_IMAGES.denim_jacket },
    { id: 'yth-out-3', category: 'outerwear', subType: 'hoodie',        colorFamily: 'grey',   priority: 3, label: 'Oversized Grey Hoodie',             description: 'Comfy, cool, and effortless — the street-style essential',    sampleImage: SAMPLE_IMAGES.grey_hoodie },
    { id: 'yth-out-4', category: 'outerwear', subType: 'bomber-jacket', colorFamily: 'black',  priority: 4, label: 'Black Satin Bomber Jacket',         description: 'Sleek and on-trend — the finisher for any youthful outfit',   sampleImage: SAMPLE_IMAGES.satin_bomber },
    { id: 'yth-out-5', category: 'outerwear', subType: 'varsity-jacket',colorFamily: 'multi',  priority: 5, label: 'Colourful Varsity Jacket',          description: 'Retro team spirit — bold colourblocking with nostalgic charm', sampleImage: SAMPLE_IMAGES.varsity_jacket },
    // Shoes
    { id: 'yth-sho-1', category: 'shoes',     subType: 'sneakers',      colorFamily: 'white',  priority: 1, label: 'White Chunky Trainers',             description: 'Thick-sole 90s dad sneakers — the youth-formula finisher',    sampleImage: SAMPLE_IMAGES.chunky_trainers },
    { id: 'yth-sho-2', category: 'shoes',     subType: 'sneakers',      colorFamily: 'white',  priority: 2, label: 'White Platform Trainers',           description: 'Fresh kicks that give every outfit an instant lift',          sampleImage: SAMPLE_IMAGES.white_sneakers },
    { id: 'yth-sho-3', category: 'shoes',     subType: 'flats',         colorFamily: 'pink',   priority: 3, label: 'Ballet Pink Flats',                 description: 'Soft and sweet — ballerina energy for every day',             sampleImage: SAMPLE_IMAGES.ballet_pink_flats },
    { id: 'yth-sho-4', category: 'shoes',     subType: 'sandals',       colorFamily: 'white',  priority: 4, label: 'White Chunky Platform Sandals',     description: 'Retro platform vibes — chunky, bold and brilliantly fun',     sampleImage: SAMPLE_IMAGES.white_chunky_sandals },
    // Bags
    { id: 'yth-bag-1', category: 'bag',       subType: 'mini-bag',      colorFamily: 'black',  priority: 1, label: 'Mini Gold-Hardware Shoulder Bag',   description: 'Tiny bag with big personality — gold chain, endless style',   sampleImage: SAMPLE_IMAGES.mini_bag },
    { id: 'yth-bag-2', category: 'bag',       subType: 'tote',          colorFamily: 'canvas', priority: 2, label: 'Natural Canvas Tote Bag',           description: 'Carry everything casually — the laid-back everyday essential', sampleImage: SAMPLE_IMAGES.canvas_tote },
    { id: 'yth-bag-3', category: 'bag',       subType: 'backpack',      colorFamily: 'pastel', priority: 3, label: 'Pastel Mini Backpack',              description: 'Playful pastel in a cute mini size — hands-free and happy',   sampleImage: SAMPLE_IMAGES.pastel_backpack },
    // Jewelry
    { id: 'yth-jew-1', category: 'jewelry',   subType: 'earrings',      colorFamily: 'gold',   priority: 1, label: 'Gold Huggie Hoop Earrings',         description: 'Stack a few, wear one — playful gold that works every day',   sampleImage: SAMPLE_IMAGES.gold_hoops },
    { id: 'yth-jew-2', category: 'jewelry',   subType: 'necklace',      colorFamily: 'gold',   priority: 2, label: 'Layered Dainty Chain Necklaces',    description: 'Two or three delicate chains — effortless layered cool',      sampleImage: SAMPLE_IMAGES.layered_necklaces },
    { id: 'yth-jew-3', category: 'jewelry',   subType: 'bracelet',      colorFamily: 'multi',  priority: 3, label: 'Colorful Resin Bangles',            description: 'Fun, bright stacked bangles — wear your mood on your wrist',  sampleImage: SAMPLE_IMAGES.colorful_bangles },
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
    items = items.map(item => ({
      ...item,
      priority: item.priority + (boosts[item.category] ?? 0),
    }));
  }

  const lifestyleWeights: Record<ItemCategory, number> = {
    top: 0, bottom: 0, outerwear: 0, shoes: 0, jewelry: 0, dress: 0, bag: 0,
  };

  const totalLifestyle = (profile.lifestyleWork || 0) + (profile.lifestyleCasual || 0) + (profile.lifestyleEvents || 0);
  if (totalLifestyle > 0) {
    for (const [scenario, weights] of Object.entries(LIFESTYLE_CATEGORY_WEIGHTS)) {
      const scenarioKey = scenario as 'work' | 'casual' | 'events';
      const proportion =
        scenarioKey === 'work'   ? (profile.lifestyleWork   || 0) / totalLifestyle :
        scenarioKey === 'casual' ? (profile.lifestyleCasual || 0) / totalLifestyle :
                                   (profile.lifestyleEvents || 0) / totalLifestyle;
      for (const [cat, weight] of Object.entries(weights)) {
        lifestyleWeights[cat as ItemCategory] += weight * proportion;
      }
    }

    items = items.map(item => ({
      ...item,
      priority: item.priority - Math.round(lifestyleWeights[item.category]),
    }));
  }

  if (profile.constraints?.maxHeelHeight === 'flat') {
    items = items.filter(item => !(item.category === 'shoes' && item.subType === 'heels'));
  }
  if (profile.constraints?.noSleeveless) {
    items = items.filter(item => !(item.category === 'top' && item.subType === 'tank-top'));
  }
  if (profile.constraints?.noShortSkirts) {
    items = items.filter(item => !(item.subType === 'mini-skirt' || item.subType === 'mini-dress'));
  }

  items.sort((a, b) => a.priority - b.priority);
  return items;
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
  'chocolate': 'brown',
};

function normalizeColor(value: string | undefined): string {
  if (!value) return '';
  const cleaned = value.trim().toLowerCase();
  return COLOR_ALIASES[cleaned] ?? cleaned;
}

/**
 * A close-but-not-exact match: same category + sub-type but a different
 * colour family. Used for the "you have something similar" hint on slots
 * that are still classed as "needed" by the strict matcher.
 */
export function findCloseMatch(
  wardrobeItems: Array<{ id: string; category: ItemCategory; subType: string; colorFamily: string }>,
  slot: WardrobeSlot,
): { id: string; colorFamily: string } | null {
  if (slot.status === 'owned') return null;
  const slotSub = normalizeSubType(slot.subType);
  const slotCol = normalizeColor(slot.colorFamily);
  const hit = wardrobeItems.find(wi =>
    wi.category === slot.category
    && normalizeSubType(wi.subType) === slotSub
    && normalizeColor(wi.colorFamily) !== slotCol
  );
  return hit ? { id: hit.id, colorFamily: hit.colorFamily } : null;
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
 * A single curated outfit group assembled from recommendation slots.
 * Each group represents one complete ready-to-wear look from the blueprint.
 */
export interface RecommendedOutfitGroup {
  id: string;
  label: string;
  vibe?: string;
  rationale?: string;
  slots: WardrobeSlot[];
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

const OUTFIT_RECIPES: Record<StyleGoal, OutfitRecipe[]> = {
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
};

function inferStyleGoal(slots: WardrobeSlot[]): StyleGoal | null {
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
export function generateRecommendedOutfitGroups(slots: WardrobeSlot[]): RecommendedOutfitGroup[] {
  if (slots.length === 0) return [];

  const goal = inferStyleGoal(slots);
  const slotsById = new Map(slots.map(s => [s.id, s]));
  const groups: RecommendedOutfitGroup[] = [];

  if (goal) {
    const recipes = OUTFIT_RECIPES[goal] ?? [];
    for (const recipe of recipes) {
      const resolved = recipe.slotIds
        .map(id => slotsById.get(id))
        .filter((s): s is WardrobeSlot => !!s);
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
 * When all items in a group are acquired the count drops by 1.
 */
export function countRecommendedOutfits(slots: WardrobeSlot[]): number {
  return generateRecommendedOutfitGroups(slots).filter(g => !g.isComplete).length;
}

/**
 * A suggestion for the single highest-leverage missing item — the one slot
 * whose acquisition would immediately complete (unlock) the greatest number
 * of currently-incomplete curated looks. Falls back to the most-frequently
 * needed slot across incomplete looks when no single item would finish any.
 */
export interface NextSmartBuy {
  slot: WardrobeSlot;
  unlocks: number;
  appearsIn: number;
  isDirectUnlock: boolean;
}

export function computeNextSmartBuy(slots: WardrobeSlot[]): NextSmartBuy | null {
  const groups = generateRecommendedOutfitGroups(slots);
  const incomplete = groups.filter(g => !g.isComplete);
  if (incomplete.length === 0) return null;

  const unlockCount = new Map<string, number>();
  const appearCount = new Map<string, number>();
  const slotById = new Map<string, WardrobeSlot>();

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

export function getFirstNeededByCategory(slots: WardrobeSlot[]): Record<string, WardrobeSlot | undefined> {
  const result: Record<string, WardrobeSlot | undefined> = {};
  for (const slot of slots) {
    if (slot.status === 'needed' && !result[slot.category]) {
      result[slot.category] = slot;
    }
  }
  return result;
}
