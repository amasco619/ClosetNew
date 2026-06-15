/**
 * Canonical, asset-free blueprint slot data.
 *
 * This is the single source of truth for every named STYLE_BLUEPRINTS set.
 * wardrobeBlueprint.ts imports STYLE_BLUEPRINT_SLOTS and adds `sampleImage`
 * from its SAMPLE_IMAGES map — it never maintains its own parallel copy of
 * this data.
 *
 * Because this file contains no require() / import() of PNG assets it can be
 * imported safely in Node/tsx test environments, making tests run against the
 * real production slot definitions rather than a hand-maintained mirror.
 */

import type { ItemCategory, StyleGoal } from './types';

export interface SlotMeta {
  id: string;
  category: ItemCategory;
  subType: string;
  colorFamily: string;
  priority: number;
  label: string;
  description: string;
  /** Key into wardrobeBlueprint.ts SAMPLE_IMAGES record */
  imageKey: string;
}

export const STYLE_BLUEPRINT_SLOTS: Record<StyleGoal, SlotMeta[]> = {

  // ── MINIMAL ──────────────────────────────────────────────────────────────
  minimal: [
    // Tops
    { id: 'min-top-1', category: 'top',       subType: 'tank-top',       colorFamily: 'white',  priority: 1,  label: 'Fitted White Ribbed Tank',           description: 'The cleanest starting point — effortless and pure',                                  imageKey: 'white_tee' },
    { id: 'min-top-2', category: 'top',       subType: 'sweater',        colorFamily: 'cream',  priority: 2,  label: 'Fine-Knit Cream Sweater',            description: 'Soft texture in a quiet, warm neutral',                                              imageKey: 'cream_sweater' },
    { id: 'min-top-3', category: 'top',       subType: 'shirt',          colorFamily: 'white',  priority: 3,  label: 'Oversized White Linen Shirt',         description: 'Relaxed linen volume — minimal dressing at its best',                                imageKey: 'white_linen_overshirt' },
    // Bottoms
    { id: 'min-bot-1', category: 'bottom',    subType: 'trousers',       colorFamily: 'grey',   priority: 1,  label: 'Straight-Leg Grey Trousers',         description: 'Precise tailoring with no unnecessary detail',                                       imageKey: 'grey_trousers' },
    { id: 'min-bot-2', category: 'bottom',    subType: 'jeans',          colorFamily: 'navy',   priority: 2,  label: 'Dark Slim Straight Jeans',           description: 'Clean denim in a sleek, pared-back cut',                                             imageKey: 'dark_slim_jeans' },
    { id: 'min-bot-3', category: 'bottom',    subType: 'wide-leg',       colorFamily: 'white',  priority: 3,  label: 'White Wide-Leg Linen Trousers',      description: 'Flowing white linen — airy, light and intentionally simple',                         imageKey: 'white_wide_leg_trousers' },
    // Dresses
    { id: 'min-drs-1', category: 'dress',     subType: 'midi-dress',     colorFamily: 'beige',  priority: 1,  label: 'Beige Silk Slip Midi Dress',         description: 'Fluid, understated, and beautifully minimal',                                        imageKey: 'beige_slip_dress' },
    { id: 'min-drs-2', category: 'dress',     subType: 'shirt-dress',    colorFamily: 'white',  priority: 2,  label: 'White Linen Shirt Dress',            description: 'Casual elegance — one piece that does everything quietly',                           imageKey: 'white_linen_dress' },
    { id: 'min-drs-3', category: 'dress',     subType: 'knit-dress',     colorFamily: 'grey',   priority: 3,  label: 'Grey Ribbed Knit Midi Dress',        description: 'Textural comfort in a no-fuss, chic neutral',                                        imageKey: 'grey_knit_dress' },
    // Outerwear
    { id: 'min-out-1', category: 'outerwear', subType: 'coat',           colorFamily: 'camel',  priority: 1,  label: 'Camel Tailored Wool Coat',           description: 'A clean silhouette in the definitive neutral',                                       imageKey: 'camel_coat' },
    { id: 'min-out-2', category: 'outerwear', subType: 'blazer',         colorFamily: 'cream',  priority: 2,  label: 'Cream Oversized Blazer',             description: 'Relaxed tailoring, soft and effortless',                                             imageKey: 'cream_blazer' },
    { id: 'min-out-3', category: 'outerwear', subType: 'cardigan',       colorFamily: 'grey',   priority: 3,  label: 'Light Grey Longline Cardigan',       description: 'Draped simplicity — layering that never overcomplicates',                            imageKey: 'grey_cardigan' },
    // Shoes
    { id: 'min-sho-1', category: 'shoes',     subType: 'flats',          colorFamily: 'white',  priority: 1,  label: 'White Leather Ballet Flats',         description: 'Minimal footwear — clean, flat, and timeless',                                       imageKey: 'white_flats' },
    { id: 'min-sho-2', category: 'shoes',     subType: 'mules',          colorFamily: 'beige',  priority: 2,  label: 'Beige Pointed-Toe Mules',            description: 'Effortless and sleek — a slide that whispers refinement',                            imageKey: 'beige_mules' },
    { id: 'min-sho-3', category: 'shoes',     subType: 'sneakers',       colorFamily: 'white',  priority: 3,  label: 'White Minimalist Sneakers',          description: 'Clean white trainers that ground any minimal look',                                  imageKey: 'white_sneakers' },
    // Bags
    { id: 'min-bag-1', category: 'bag',       subType: 'tote',           colorFamily: 'black',  priority: 1,  label: 'Black Structured Tote',              description: 'One clean bag that carries everything — nothing more',                               imageKey: 'black_bag' },
    { id: 'min-bag-2', category: 'bag',       subType: 'tote',           colorFamily: 'beige',  priority: 2,  label: 'Beige Leather Tote',                 description: 'Soft and unfussy — the everyday carry for a minimal wardrobe',                       imageKey: 'beige_bag' },
    { id: 'min-bag-3', category: 'bag',       subType: 'crossbody',      colorFamily: 'white',  priority: 3,  label: 'White Compact Crossbody',            description: 'Small, clean, and precise — just what you need',                                     imageKey: 'white_crossbody' },
    // Jewelry
    { id: 'min-jew-1', category: 'jewelry',   subType: 'ring',           colorFamily: 'gold',   priority: 1,  label: 'Thin Gold Stacking Rings',           description: 'A quiet glimmer — barely there but perfectly placed',                                imageKey: 'gold_stacking_rings' },
    { id: 'min-jew-2', category: 'jewelry',   subType: 'necklace',       colorFamily: 'gold',   priority: 2,  label: 'Gold Delicate Chain Necklace',       description: 'One fine chain, close to the collarbone — nothing more needed',                      imageKey: 'gold_necklace' },
    { id: 'min-jew-3', category: 'jewelry',   subType: 'earrings',       colorFamily: 'gold',   priority: 3,  label: 'Small Gold Stud Earrings',           description: 'A single, quiet dot of gold — the only finish you need',                            imageKey: 'gold_stud_earrings' },
    // Active / Brunch / Resort / Night Out additions
    { id: 'min-act-1', category: 'bottom',    subType: 'leggings',       colorFamily: 'black',  priority: 4,  label: 'Black Seamless Leggings',            description: 'A tonal activewear base — clean, minimal, functional',                               imageKey: 'activewear_leggings' },
    { id: 'min-act-2', category: 'outerwear', subType: 'windbreaker',    colorFamily: 'black',  priority: 5,  label: 'Black Lightweight Windbreaker',      description: 'Clean outerwear for active days — minimal, not fussy',                               imageKey: 'windbreaker' },
    { id: 'min-act-3', category: 'shoes',     subType: 'training-shoes', colorFamily: 'white',  priority: 6,  label: 'White Minimal Training Shoes',       description: 'Pared-back trainers for active days — clean form, precise purpose',                  imageKey: 'training_shoes' },
    { id: 'min-brn-1', category: 'shoes',     subType: 'sandals',        colorFamily: 'tan',    priority: 7,  label: 'Tan Minimalist Strappy Sandals',     description: 'Clean lines and a neutral strap — the brunch shoe done right',                       imageKey: 'brunch_sandals' },
    { id: 'min-brn-2', category: 'dress',     subType: 'midi-dress',     colorFamily: 'white',  priority: 8,  label: 'White Linen Brunch Midi Dress',      description: 'Understated weekend dressing — effortless linen for slow mornings',                  imageKey: 'white_linen_dress' },
    { id: 'min-brn-3', category: 'bag',       subType: 'wicker-bag',     colorFamily: 'tan',    priority: 9,  label: 'Tan Natural Wicker Tote',            description: 'Unpretentious and tactile — a natural carry that needs nothing more',                imageKey: 'wicker_bag' },
    { id: 'min-rsr-1', category: 'dress',     subType: 'resort-dress',   colorFamily: 'white',  priority: 10, label: 'White Minimal Resort Dress',         description: 'Pared-back resort dressing — simple, effortless, unbothered',                        imageKey: 'resort_dress' },
    { id: 'min-ngt-1', category: 'dress',     subType: 'mini-dress',     colorFamily: 'black',  priority: 11, label: 'Black Mini Dress',                   description: 'One sleek black mini — your nighttime minimal uniform',                               imageKey: 'mini_dress_black' },
  ],

  // ── ELEVATED ─────────────────────────────────────────────────────────────
  elevated: [
    // Tops
    { id: 'elv-top-1', category: 'top',       subType: 'blouse',         colorFamily: 'black',     priority: 1,  label: 'Black Satin Blouse',                 description: 'Luxe fabric that commands a room without effort',                                    imageKey: 'black_blouse' },
    { id: 'elv-top-2', category: 'top',       subType: 'sweater',        colorFamily: 'cream',     priority: 2,  label: 'Cashmere Ribbed Crewneck',           description: 'Premium softness — the definition of quiet luxury',                                  imageKey: 'cream_sweater' },
    { id: 'elv-top-3', category: 'top',       subType: 'camisole',       colorFamily: 'ivory',     priority: 3,  label: 'Ivory Silk Camisole',                description: 'Barely-there elegance — silk against the skin, effortlessly chic',                  imageKey: 'ivory_silk_cami' },
    // Bottoms
    { id: 'elv-bot-1', category: 'bottom',    subType: 'trousers',       colorFamily: 'navy',      priority: 1,  label: 'Wide-Leg Navy Trousers',             description: 'Fluid lines and sharp tailoring — effortlessly refined',                            imageKey: 'navy_wide_leg_trousers' },
    { id: 'elv-bot-2', category: 'bottom',    subType: 'midi-skirt',     colorFamily: 'camel',     priority: 2,  label: 'Camel Midi A-Line Skirt',            description: 'A sophisticated silhouette in a warm statement neutral',                             imageKey: 'camel_skirt' },
    { id: 'elv-bot-3', category: 'bottom',    subType: 'wide-leg',       colorFamily: 'black',     priority: 3,  label: 'Black Tailored Wide-Leg Pants',      description: 'Strong lines and clean drape — polished power dressing',                            imageKey: 'black_wide_leg_pants' },
    // Dresses
    { id: 'elv-drs-1', category: 'dress',     subType: 'midi-dress',     colorFamily: 'black',     priority: 1,  label: 'Black Silk Slip Midi Dress',         description: 'Understated glamour for elevated evenings',                                          imageKey: 'black_silk_slip_dress' },
    { id: 'elv-drs-2', category: 'dress',     subType: 'wrap-dress',     colorFamily: 'navy',      priority: 2,  label: 'Navy Wrap Midi Dress',               description: 'A polished wrap silhouette in a deeply elegant navy',                                imageKey: 'navy_wrap_dress' },
    { id: 'elv-drs-3', category: 'dress',     subType: 'slip-dress',     colorFamily: 'champagne', priority: 3,  label: 'Champagne Satin Slip Dress',         description: 'Luminous satin that turns any occasion into a moment',                               imageKey: 'champagne_slip_dress' },
    // Outerwear
    { id: 'elv-out-1', category: 'outerwear', subType: 'blazer',         colorFamily: 'navy',      priority: 1,  label: 'Structured Navy Blazer',             description: 'Sharp shoulders and clean tailoring — the power piece',                              imageKey: 'navy_blazer' },
    { id: 'elv-out-2', category: 'outerwear', subType: 'coat',           colorFamily: 'camel',     priority: 2,  label: 'Camel Longline Overcoat',            description: 'Investment outerwear with enduring, polished appeal',                                imageKey: 'camel_coat' },
    { id: 'elv-out-3', category: 'outerwear', subType: 'blazer',         colorFamily: 'cream',     priority: 3,  label: 'Cream Double-Breasted Blazer',       description: 'Soft tailoring with a luxurious finish — refined and fresh',                         imageKey: 'cream_blazer' },
    // Shoes
    { id: 'elv-sho-1', category: 'shoes',     subType: 'heels',          colorFamily: 'black',     priority: 1,  label: 'Black Pointed-Toe Heels',            description: 'Sleek lines that signal sophistication at every step',                               imageKey: 'black_heels' },
    { id: 'elv-sho-2', category: 'shoes',     subType: 'heels',          colorFamily: 'nude',      priority: 2,  label: 'Nude Strappy Heeled Sandals',        description: 'Leg-lengthening nude tones and elegant straps — understated allure',                 imageKey: 'nude_heels' },
    { id: 'elv-sho-3', category: 'shoes',     subType: 'slingbacks',     colorFamily: 'camel',     priority: 3,  label: 'Camel Leather Slingbacks',           description: 'Refined pointed toe — a European-chic finishing touch',                              imageKey: 'camel_slingbacks' },
    // Bags
    { id: 'elv-bag-1', category: 'bag',       subType: 'shoulder-bag',   colorFamily: 'camel',     priority: 1,  label: 'Camel Leather Shoulder Bag',         description: "Structured craftsmanship in the season's warmest neutral",                           imageKey: 'camel_bag' },
    { id: 'elv-bag-2', category: 'bag',       subType: 'mini-bag',       colorFamily: 'black',     priority: 2,  label: 'Black Mini Structured Bag',          description: 'Compact luxury — a small bag with maximum presence',                                 imageKey: 'mini_bag' },
    { id: 'elv-bag-3', category: 'bag',       subType: 'clutch',         colorFamily: 'tan',       priority: 3,  label: 'Tan Leather Clutch',                 description: 'Clean lines and buttery leather — a timeless evening carry',                         imageKey: 'tan_clutch' },
    // Jewelry
    { id: 'elv-jew-1', category: 'jewelry',   subType: 'earrings',       colorFamily: 'gold',      priority: 1,  label: 'Gold Statement Drop Earrings',       description: 'A refined finishing touch that elevates every look',                                 imageKey: 'gold_drop_earrings' },
    { id: 'elv-jew-2', category: 'jewelry',   subType: 'bracelet',       colorFamily: 'gold',      priority: 2,  label: 'Gold Chain Bracelet',                description: 'Linked gold at the wrist — understated elegance in motion',                          imageKey: 'gold_bracelet' },
    { id: 'elv-jew-3', category: 'jewelry',   subType: 'earrings',       colorFamily: 'pearl',     priority: 3,  label: 'Pearl Stud Earrings',                description: 'The most timeless jewel — soft luminescence, always right',                          imageKey: 'pearl_studs' },
    // Active / Brunch / Resort / Night Out additions
    { id: 'elv-act-1', category: 'bag',       subType: 'gym-bag',        colorFamily: 'black',     priority: 4,  label: 'Black Structured Gym Bag',           description: 'Elevated even at the gym — a sleek carryall with minimal detail',                   imageKey: 'gym_bag' },
    { id: 'elv-act-2', category: 'bottom',    subType: 'leggings',       colorFamily: 'black',     priority: 5,  label: 'Black High-Performance Leggings',    description: 'Sleek activewear in deep black — elevated even at the gym',                          imageKey: 'activewear_leggings' },
    { id: 'elv-act-3', category: 'shoes',     subType: 'training-shoes', colorFamily: 'white',     priority: 6,  label: 'White Premium Training Shoes',       description: 'Refined trainers that look as considered off the court as on it',                    imageKey: 'training_shoes' },
    { id: 'elv-act-4', category: 'outerwear', subType: 'sports-hoodie',  colorFamily: 'grey',      priority: 7,  label: 'Grey Cashmere-Blend Active Hoodie',  description: 'A luxury active layer — soft, polished, and built for movement',                     imageKey: 'sports_hoodie' },
    { id: 'elv-brn-1', category: 'dress',     subType: 'midi-dress',     colorFamily: 'beige',     priority: 8,  label: 'Beige Satin Slip Brunch Dress',      description: 'Fluid satin at the table — effortlessly elevated for late mornings',                 imageKey: 'beige_slip_dress' },
    { id: 'elv-brn-2', category: 'shoes',     subType: 'loafers',        colorFamily: 'camel',     priority: 9,  label: 'Camel Block-Heel Loafers',           description: 'A structured heel in a heritage shape — brunch footwear, perfected',                 imageKey: 'loafers' },
    { id: 'elv-brn-3', category: 'bag',       subType: 'wicker-bag',     colorFamily: 'tan',       priority: 10, label: 'Tan Structured Wicker Tote',         description: 'Natural craftsmanship for a relaxed morning — quietly luxurious',                    imageKey: 'wicker_bag' },
    { id: 'elv-rsr-1', category: 'dress',     subType: 'cover-up',       colorFamily: 'ivory',     priority: 11, label: 'Ivory Kaftan Cover-Up',              description: 'Resort-worthy elegance — luxe fabric that flows poolside',                           imageKey: 'beach_coverup' },
    { id: 'elv-rsr-2', category: 'shoes',     subType: 'espadrilles',    colorFamily: 'camel',     priority: 12, label: 'Camel Espadrille Wedges',            description: 'European-summer dressing — a raised heel with holiday ease',                         imageKey: 'espadrilles' },
    { id: 'elv-ngt-1', category: 'shoes',     subType: 'strappy-heels',  colorFamily: 'black',     priority: 13, label: 'Black Strappy Evening Heels',        description: 'A bare, elegant strap — the most refined way to dress up a look',                   imageKey: 'strappy_heels' },
    { id: 'elv-ngt-2', category: 'bag',       subType: 'evening-bag',    colorFamily: 'gold',      priority: 14, label: 'Gold Evening Clutch',                description: 'A slim gold clutch — one piece that turns any look into an occasion',                imageKey: 'evening_clutch_gold' },
  ],

  // ── BOLD ─────────────────────────────────────────────────────────────────
  bold: [
    // Tops
    { id: 'bld-top-1', category: 'top',       subType: 'blouse',              colorFamily: 'red',    priority: 1,  label: 'Red Satin Statement Blouse',         description: 'Rich red that stops the room before you say a word',                                imageKey: 'red_blouse' },
    { id: 'bld-top-2', category: 'top',       subType: 'crop-top',            colorFamily: 'black',  priority: 2,  label: 'Black Cutout Crop Top',              description: 'Bold proportions with an edge — confidence in every cut',                           imageKey: 'black_cutout_crop_top' },
    { id: 'bld-top-3', category: 'top',       subType: 'fitted-top',          colorFamily: 'cobalt', priority: 3,  label: 'Cobalt Blue Fitted Top',             description: 'Vivid cobalt energy — a colour that demands the spotlight',                          imageKey: 'cobalt_blue_top' },
    // Bottoms
    { id: 'bld-bot-1', category: 'bottom',    subType: 'wide-leg',            colorFamily: 'black',  priority: 1,  label: 'High-Waist Wide-Leg Trousers',       description: 'Powerful silhouette with strong, graphic lines',                                     imageKey: 'black_wide_leg_pants' },
    { id: 'bld-bot-2', category: 'bottom',    subType: 'midi-skirt',          colorFamily: 'red',    priority: 2,  label: 'Red Midi Pencil Skirt',              description: 'A bold, body-skimming statement from waist to knee',                                imageKey: 'red_pencil_skirt' },
    { id: 'bld-bot-3', category: 'bottom',    subType: 'mini-skirt',          colorFamily: 'leopard',priority: 3,  label: 'Leopard Print Mini Skirt',           description: "Fearless animal print — you're not here to blend in",                               imageKey: 'leopard_mini_skirt' },
    // Dresses
    { id: 'bld-drs-1', category: 'dress',     subType: 'mini-dress',          colorFamily: 'black',  priority: 1,  label: 'Black Bodycon Mini Dress',           description: 'Confident curves and unapologetic style in one piece',                               imageKey: 'black_bodycon_dress' },
    { id: 'bld-drs-2', category: 'dress',     subType: 'maxi-dress',          colorFamily: 'red',    priority: 2,  label: 'Red Wrap Maxi Dress',                description: 'Sweeping red drama — a head-turning entrance guaranteed',                            imageKey: 'red_wrap_dress' },
    { id: 'bld-drs-3', category: 'dress',     subType: 'midi-dress',          colorFamily: 'emerald',priority: 3,  label: 'Emerald Green Midi Dress',           description: 'Rich jewel-tone green that commands every room effortlessly',                        imageKey: 'emerald_dress' },
    // Outerwear
    { id: 'bld-out-1', category: 'outerwear', subType: 'blazer',              colorFamily: 'red',    priority: 1,  label: 'Oversized Red Power Blazer',         description: 'Own the room — structured shoulders and pure red energy',                            imageKey: 'red_blazer' },
    { id: 'bld-out-2', category: 'outerwear', subType: 'leather-jacket',      colorFamily: 'black',  priority: 2,  label: 'Black Leather Moto Jacket',          description: 'Grounded edge that works with everything in your wardrobe',                          imageKey: 'black_leather_moto' },
    { id: 'bld-out-3', category: 'outerwear', subType: 'coat',                colorFamily: 'animal', priority: 3,  label: 'Animal Print Statement Coat',        description: 'Wear the coat, become the statement — fearless from the first layer',                imageKey: 'animal_print_coat' },
    // Shoes
    { id: 'bld-sho-1', category: 'shoes',     subType: 'heels',               colorFamily: 'black',  priority: 1,  label: 'Black Platform Block Heels',         description: 'Height, attitude and drama — bold from the ground up',                               imageKey: 'black_heels' },
    { id: 'bld-sho-2', category: 'shoes',     subType: 'heels',               colorFamily: 'red',    priority: 2,  label: 'Red Strappy Heeled Sandals',         description: 'Statement-making red from heel to toe — zero hesitation',                            imageKey: 'red_heels' },
    { id: 'bld-sho-3', category: 'shoes',     subType: 'boots',               colorFamily: 'snake',  priority: 3,  label: 'Snake Print Ankle Boots',            description: 'Textured, edgy and wild — the finishing touch for any bold look',                   imageKey: 'snake_boots' },
    // Bags
    { id: 'bld-bag-1', category: 'bag',       subType: 'mini-bag',            colorFamily: 'black',  priority: 1,  label: 'Mini Black Quilted Bag',             description: "Small but mighty — a statement bag on a gold chain",                                imageKey: 'mini_bag' },
    { id: 'bld-bag-2', category: 'bag',       subType: 'mini-bag',            colorFamily: 'red',    priority: 2,  label: 'Red Structured Mini Bag',            description: 'Bold red on your arm — small bag, massive impact',                                   imageKey: 'red_mini_bag' },
    { id: 'bld-bag-3', category: 'bag',       subType: 'clutch',              colorFamily: 'gold',   priority: 3,  label: 'Gold Metallic Evening Clutch',       description: 'Gleaming gold that makes the whole look electric',                                   imageKey: 'gold_clutch' },
    // Jewelry
    { id: 'bld-jew-1', category: 'jewelry',   subType: 'necklace',            colorFamily: 'gold',   priority: 1,  label: 'Chunky Gold Statement Chain',        description: "Go big — a neck piece that declares you've arrived",                                imageKey: 'chunky_gold_chain' },
    { id: 'bld-jew-2', category: 'jewelry',   subType: 'earrings',            colorFamily: 'gold',   priority: 2,  label: 'Bold Geometric Drop Earrings',       description: 'Architectural shapes that frame the face with intention',                            imageKey: 'geometric_earrings' },
    { id: 'bld-jew-3', category: 'jewelry',   subType: 'bracelet',            colorFamily: 'gold',   priority: 3,  label: 'Layered Gold Bangles',               description: 'Stack them all — cascading gold that makes noise when you move',                    imageKey: 'gold_bangles' },
    // Active / Brunch / Night Out additions
    { id: 'bld-act-1', category: 'outerwear', subType: 'windbreaker',         colorFamily: 'red',    priority: 4,  label: 'Red Colour-Block Windbreaker',       description: 'Bold activewear energy — vivid colour and a strong silhouette',                     imageKey: 'windbreaker' },
    { id: 'bld-act-2', category: 'bag',       subType: 'gym-bag',             colorFamily: 'black',  priority: 5,  label: 'Bold Printed Sports Bag',            description: 'Make a statement at the gym — no rules, just commitment',                           imageKey: 'gym_bag' },
    { id: 'bld-act-3', category: 'bottom',    subType: 'leggings',            colorFamily: 'black',  priority: 6,  label: 'Black High-Waist Active Leggings',   description: 'Strong and confident at the gym — bold activewear, zero compromise',                imageKey: 'activewear_leggings' },
    { id: 'bld-act-4', category: 'shoes',     subType: 'training-shoes',      colorFamily: 'white',  priority: 7,  label: 'White Statement Training Shoes',     description: 'Clean bright kicks that carry the same energy off the track',                       imageKey: 'training_shoes' },
    { id: 'bld-brn-1', category: 'dress',     subType: 'midi-dress',          colorFamily: 'red',    priority: 8,  label: 'Red Bold Wrap Brunch Dress',         description: 'Confident colour at the table — bold brunch dressing, undiluted',                   imageKey: 'red_wrap_dress' },
    { id: 'bld-brn-2', category: 'shoes',     subType: 'sandals',             colorFamily: 'black',  priority: 9,  label: 'Black Block-Heel Sandals',           description: 'Bold structure underfoot — a statement sandal for weekend mornings',                 imageKey: 'brunch_sandals' },
    { id: 'bld-brn-3', category: 'bag',       subType: 'tote',                colorFamily: 'black',  priority: 10, label: 'Black Structured Brunch Tote',       description: 'A sculptural black carry for brunch — bold, graphic, unmissable',                   imageKey: 'black_bag' },
    { id: 'bld-ngt-1', category: 'top',       subType: 'sequin-top',          colorFamily: 'gold',   priority: 11, label: 'Gold Sequin Statement Top',          description: 'All that glitters — sequins at night are your boldest move',                        imageKey: 'sequin_top' },
    { id: 'bld-ngt-2', category: 'jewelry',   subType: 'statement-earrings',  colorFamily: 'gold',   priority: 12, label: 'Oversized Statement Drop Earrings',  description: 'Large, loud, and unforgettable — the bold finale to any night look',               imageKey: 'statement_earrings' },
  ],

  // ── ROMANTIC ─────────────────────────────────────────────────────────────
  romantic: [
    // Tops
    { id: 'rom-top-1', category: 'top',       subType: 'blouse',              colorFamily: 'pink',      priority: 1,  label: 'Dusty Pink Ruffle Blouse',           description: 'Soft ruffles and a dreamy blush that whispers romance',                             imageKey: 'pink_blouse' },
    { id: 'rom-top-2', category: 'top',       subType: 'sweater',             colorFamily: 'cream',     priority: 2,  label: 'Off-Shoulder Cream Knit',            description: 'Gentle and feminine — cosy texture with delicate appeal',                           imageKey: 'cream_sweater' },
    { id: 'rom-top-3', category: 'top',       subType: 'camisole',            colorFamily: 'lilac',     priority: 3,  label: 'Lilac Lace Trim Camisole',           description: 'Soft lilac with delicate lace — tenderly feminine and sweet',                        imageKey: 'lilac_lace_cami' },
    // Bottoms
    { id: 'rom-bot-1', category: 'bottom',    subType: 'midi-skirt',          colorFamily: 'beige',     priority: 1,  label: 'Beige Satin Midi Skirt',             description: 'Soft drape and quiet sheen for feminine, graceful dressing',                        imageKey: 'beige_satin_midi' },
    { id: 'rom-bot-2', category: 'bottom',    subType: 'maxi-skirt',          colorFamily: 'pink',      priority: 2,  label: 'Floral Blush Maxi Skirt',            description: 'Flowing florals and pretty blush tones — pure romance',                              imageKey: 'floral_blush_maxi_skirt' },
    { id: 'rom-bot-3', category: 'bottom',    subType: 'mini-skirt',          colorFamily: 'white',     priority: 3,  label: 'White Broderie Anglaise Mini Skirt', description: 'Delicate eyelet embroidery — sweetly romantic and summery',                          imageKey: 'white_broderie_skirt' },
    // Dresses
    { id: 'rom-drs-1', category: 'dress',     subType: 'wrap-dress',          colorFamily: 'pink',      priority: 1,  label: 'Floral Pink Wrap Midi Dress',        description: 'Feminine wrap silhouette in a soft, romantic print',                                 imageKey: 'floral_pink_wrap_dress' },
    { id: 'rom-drs-2', category: 'dress',     subType: 'midi-dress',          colorFamily: 'blush',     priority: 2,  label: 'Blush Tulle Midi Dress',             description: 'Dreamy layers of blush tulle — a romantic vision in motion',                         imageKey: 'blush_tulle_dress' },
    { id: 'rom-drs-3', category: 'dress',     subType: 'maxi-dress',          colorFamily: 'ivory',     priority: 3,  label: 'Ivory Lace Maxi Dress',              description: 'Delicate floral lace from hem to cuff — timeless feminine grace',                   imageKey: 'ivory_lace_dress' },
    // Outerwear
    { id: 'rom-out-1', category: 'outerwear', subType: 'trench',              colorFamily: 'beige',     priority: 1,  label: 'Blush Belted Trench Coat',           description: 'A cinched-waist silhouette that flatters and enchants',                              imageKey: 'blush_trench_coat' },
    { id: 'rom-out-2', category: 'outerwear', subType: 'blazer',              colorFamily: 'cream',     priority: 2,  label: 'Cream Linen Blazer',                 description: 'Light and feminine — soft tailoring for warmer days',                                imageKey: 'cream_linen_blazer' },
    { id: 'rom-out-3', category: 'outerwear', subType: 'jacket',              colorFamily: 'pink',      priority: 3,  label: 'Pink Faux Fur Jacket',               description: 'Fluffy, playful and unapologetically feminine — wear joy',                           imageKey: 'pink_faux_fur' },
    // Shoes
    { id: 'rom-sho-1', category: 'shoes',     subType: 'heels',               colorFamily: 'beige',     priority: 1,  label: 'Beige Strappy Block Heels',          description: 'Delicate straps and a neutral tone for romantic dressing',                           imageKey: 'beige_heels' },
    { id: 'rom-sho-2', category: 'shoes',     subType: 'flats',               colorFamily: 'pink',      priority: 2,  label: 'Ballet Pink Satin Flats',            description: 'Soft pink satin and a bow — ballet-inspired feminine charm',                         imageKey: 'ballet_pink_flats' },
    { id: 'rom-sho-3', category: 'shoes',     subType: 'kitten-heels',        colorFamily: 'ivory',     priority: 3,  label: 'Ivory Kitten Heel Mules',            description: 'A graceful low heel in the softest ivory — endlessly feminine',                      imageKey: 'ivory_kitten_heels' },
    // Bags
    { id: 'rom-bag-1', category: 'bag',       subType: 'crossbody',           colorFamily: 'beige',     priority: 1,  label: 'Beige Woven Crossbody Bag',          description: 'Textured weave and soft neutrals — charming and practical',                          imageKey: 'beige_bag' },
    { id: 'rom-bag-2', category: 'bag',       subType: 'mini-bag',            colorFamily: 'pink',      priority: 2,  label: 'Pink Mini Quilted Bag',              description: 'Quilted blush with gold chain — a romantic bag in miniature',                        imageKey: 'pink_mini_bag' },
    { id: 'rom-bag-3', category: 'bag',       subType: 'clutch',              colorFamily: 'cream',     priority: 3,  label: 'Cream Pearl-Detail Clutch',          description: 'Pearl-trimmed ivory — the most enchanting evening carry',                            imageKey: 'cream_clutch' },
    // Jewelry
    { id: 'rom-jew-1', category: 'jewelry',   subType: 'necklace',            colorFamily: 'gold',      priority: 1,  label: 'Dainty Pearl & Gold Pendant',        description: 'A whisper of gold close to the heart — delicate and sweet',                         imageKey: 'pearl_gold_pendant' },
    { id: 'rom-jew-2', category: 'jewelry',   subType: 'bracelet',            colorFamily: 'rose-gold', priority: 2,  label: 'Rose Gold Chain Bracelet',           description: 'Blush-toned gold that glows softly at the wrist',                                   imageKey: 'rose_gold_bracelet' },
    { id: 'rom-jew-3', category: 'jewelry',   subType: 'earrings',            colorFamily: 'pink',      priority: 3,  label: 'Pink Crystal Drop Earrings',         description: 'Glittering pink crystals — light-catching and utterly pretty',                       imageKey: 'pink_crystal_earrings' },
    // Active / Brunch / Resort / Night Out additions
    { id: 'rom-brn-1', category: 'top',       subType: 'linen-set',           colorFamily: 'white',     priority: 4,  label: 'White Linen Co-ord Set',             description: 'An effortlessly matched set — brunch dressing that looks planned',                   imageKey: 'linen_co_ord_set' },
    { id: 'rom-brn-2', category: 'bag',       subType: 'wicker-bag',          colorFamily: 'tan',       priority: 5,  label: 'Tan Wicker Shoulder Bag',            description: 'Natural raffia with romance — the most charming summer carry',                       imageKey: 'wicker_bag' },
    { id: 'rom-brn-3', category: 'dress',     subType: 'midi-dress',          colorFamily: 'blush',     priority: 6,  label: 'Blush Floral Brunch Midi Dress',     description: 'Romantic florals at the weekend table — dreamy, gentle, just right',                imageKey: 'floral_smocked_dress' },
    { id: 'rom-brn-4', category: 'shoes',     subType: 'sandals',             colorFamily: 'beige',     priority: 7,  label: 'Beige Block-Heel Brunch Sandals',    description: 'A soft neutral strap with gentle height — the romantic brunch shoe',                 imageKey: 'brunch_sandals' },
    { id: 'rom-act-1', category: 'bottom',    subType: 'leggings',            colorFamily: 'black',     priority: 8,  label: 'Black Active Leggings',              description: 'A sleek movement base that keeps up with your active days',                          imageKey: 'activewear_leggings' },
    { id: 'rom-act-2', category: 'shoes',     subType: 'training-shoes',      colorFamily: 'white',     priority: 9,  label: 'White Feminine Training Shoes',      description: 'Clean, sweet trainers for romantic souls on the move',                               imageKey: 'training_shoes' },
    { id: 'rom-act-3', category: 'outerwear', subType: 'sports-hoodie',       colorFamily: 'pink',      priority: 10, label: 'Pink Soft Active Hoodie',            description: 'Blush movement wear with a tender, feminine touch',                                  imageKey: 'sports_hoodie' },
    { id: 'rom-rsr-1', category: 'dress',     subType: 'cover-up',            colorFamily: 'pink',      priority: 11, label: 'Pink Floral Kaftan Cover-Up',        description: 'Dreamy florals at the resort — a cover-up that looks like a look',                  imageKey: 'beach_coverup' },
    { id: 'rom-ngt-1', category: 'jewelry',   subType: 'statement-earrings',  colorFamily: 'gold',      priority: 12, label: 'Romantic Gold Drop Earrings',        description: 'Delicate yet dramatic — the golden focal point for romantic evenings',               imageKey: 'statement_earrings' },
  ],

  // ── CLASSIC ──────────────────────────────────────────────────────────────
  classic: [
    // Tops
    { id: 'cls-top-1', category: 'top',       subType: 'shirt',          colorFamily: 'white',  priority: 1,  label: 'Crisp White Button-Down Shirt',      description: 'The timeless foundation — impeccable, dependable, elegant',                         imageKey: 'white_shirt' },
    { id: 'cls-top-2', category: 'top',       subType: 'blouse',         colorFamily: 'black',  priority: 2,  label: 'Black Silk Blouse',                  description: 'Refined fabric and a sleek cut for classic evenings',                                imageKey: 'black_blouse' },
    { id: 'cls-top-3', category: 'top',       subType: 'polo',           colorFamily: 'navy',   priority: 3,  label: 'Navy Fine-Knit Polo',                description: 'Heritage sportswear elevated — polished and quietly luxurious',                      imageKey: 'navy_polo' },
    // Bottoms
    { id: 'cls-bot-1', category: 'bottom',    subType: 'trousers',       colorFamily: 'navy',   priority: 1,  label: 'Dark Tailored Trousers',             description: 'Sharp creases and a clean line — perpetually polished',                              imageKey: 'dark_trousers' },
    { id: 'cls-bot-2', category: 'bottom',    subType: 'jeans',          colorFamily: 'blue',   priority: 2,  label: 'Mid-Wash Straight-Leg Jeans',        description: 'Timeless denim that never goes out of style',                                        imageKey: 'jeans' },
    { id: 'cls-bot-3', category: 'bottom',    subType: 'midi-skirt',     colorFamily: 'camel',  priority: 3,  label: 'Camel A-Line Midi Skirt',            description: 'A ladylike silhouette in a forever-wearable warm neutral',                          imageKey: 'camel_midi_skirt' },
    // Dresses
    { id: 'cls-drs-1', category: 'dress',     subType: 'midi-dress',     colorFamily: 'black',  priority: 1,  label: 'Classic Little Black Dress',         description: 'The wardrobe icon — simple, sophisticated, always right',                            imageKey: 'black_dress' },
    { id: 'cls-drs-2', category: 'dress',     subType: 'sheath-dress',   colorFamily: 'navy',   priority: 2,  label: 'Navy Sheath Dress',                  description: 'Tailored simplicity — a dress that does every occasion with poise',                  imageKey: 'navy_sheath_dress' },
    { id: 'cls-drs-3', category: 'dress',     subType: 'wrap-dress',     colorFamily: 'camel',  priority: 3,  label: 'Camel Belted Wrap Dress',            description: 'Flattering and ageless — the wrap cut in a timeless neutral',                       imageKey: 'camel_wrap_dress' },
    // Outerwear
    { id: 'cls-out-1', category: 'outerwear', subType: 'blazer',         colorFamily: 'navy',   priority: 1,  label: 'Navy Double-Breasted Blazer',        description: 'The quintessential classic — heritage tailoring at its best',                        imageKey: 'navy_blazer' },
    { id: 'cls-out-2', category: 'outerwear', subType: 'trench',         colorFamily: 'camel',  priority: 2,  label: 'Camel Trench Coat',                  description: 'An enduring coat for every season and every decade',                                 imageKey: 'camel_coat' },
    { id: 'cls-out-3', category: 'outerwear', subType: 'pea-coat',       colorFamily: 'black',  priority: 3,  label: 'Black Wool Pea Coat',                description: 'Nautical heritage in deep black — structured, storied, timeless',                   imageKey: 'black_pea_coat' },
    // Shoes
    { id: 'cls-sho-1', category: 'shoes',     subType: 'loafers',        colorFamily: 'brown',  priority: 1,  label: 'Brown Leather Loafers',              description: 'Polished comfort that stands the test of time',                                      imageKey: 'loafers' },
    { id: 'cls-sho-2', category: 'shoes',     subType: 'heels',          colorFamily: 'black',  priority: 2,  label: 'Black Pointed-Toe Heels',            description: 'The quintessential heel — sharp, sleek and eternally stylish',                       imageKey: 'black_heels' },
    { id: 'cls-sho-3', category: 'shoes',     subType: 'sneakers',       colorFamily: 'white',  priority: 3,  label: 'White Classic Sneakers',             description: 'Clean white trainers — the one casual nod every wardrobe needs',                    imageKey: 'white_sneakers' },
    // Bags
    { id: 'cls-bag-1', category: 'bag',       subType: 'tote',           colorFamily: 'camel',  priority: 1,  label: 'Tan Leather Structured Tote',        description: 'Traditional craftsmanship you will carry for years',                                 imageKey: 'camel_bag' },
    { id: 'cls-bag-2', category: 'bag',       subType: 'clutch',         colorFamily: 'black',  priority: 2,  label: 'Black Patent Leather Clutch',        description: 'High-gloss patent — the classic evening bag, perfected',                            imageKey: 'black_patent_clutch' },
    { id: 'cls-bag-3', category: 'bag',       subType: 'shoulder-bag',   colorFamily: 'navy',   priority: 3,  label: 'Navy Chain Shoulder Bag',            description: 'A gold-chained navy bag — European elegance in every link',                         imageKey: 'navy_chain_bag' },
    // Jewelry
    { id: 'cls-jew-1', category: 'jewelry',   subType: 'watch',          colorFamily: 'gold',   priority: 1,  label: 'Gold Classic Dress Watch',           description: 'The refined finishing touch — elegance measured in time',                            imageKey: 'gold_dress_watch' },
    { id: 'cls-jew-2', category: 'jewelry',   subType: 'earrings',       colorFamily: 'pearl',  priority: 2,  label: 'Pearl Drop Earrings',                description: 'Heritage elegance at the ear — softly luminous and timeless',                        imageKey: 'pearl_drop_earrings' },
    { id: 'cls-jew-3', category: 'jewelry',   subType: 'bracelet',       colorFamily: 'gold',   priority: 3,  label: 'Simple Gold Bangle',                 description: 'One smooth arc of gold — the most enduring arm statement',                           imageKey: 'gold_bangle' },
    // Active / Brunch / Resort / Night Out additions
    { id: 'cls-act-1', category: 'outerwear', subType: 'sports-hoodie',  colorFamily: 'grey',   priority: 4,  label: 'Grey Sports Hoodie',                 description: 'A classic grey hoodie for active days — understated and easy',                       imageKey: 'sports_hoodie' },
    { id: 'cls-act-2', category: 'bottom',    subType: 'leggings',       colorFamily: 'black',  priority: 5,  label: 'Black Classic Active Leggings',      description: 'A clean, reliable active base — timeless even at the gym',                          imageKey: 'activewear_leggings' },
    { id: 'cls-act-3', category: 'shoes',     subType: 'training-shoes', colorFamily: 'white',  priority: 6,  label: 'White Heritage Training Shoes',      description: 'Classic clean trainers that have earned their place in any wardrobe',               imageKey: 'training_shoes' },
    { id: 'cls-brn-1', category: 'shoes',     subType: 'sandals',        colorFamily: 'tan',    priority: 7,  label: 'Tan Classic Strappy Sandals',        description: 'Heritage sandal shape — the timeless warm-weather go-to',                           imageKey: 'brunch_sandals' },
    { id: 'cls-brn-2', category: 'dress',     subType: 'midi-dress',     colorFamily: 'navy',   priority: 8,  label: 'Navy Brunch Midi Wrap Dress',        description: 'A timeless wrap silhouette in navy — brunch dressing that never dates',             imageKey: 'navy_wrap_dress' },
    { id: 'cls-brn-3', category: 'bag',       subType: 'wicker-bag',     colorFamily: 'tan',    priority: 9,  label: 'Tan Wicker Brunch Tote',             description: 'A natural, classic carry for weekend mornings — simple and enduring',               imageKey: 'wicker_bag' },
    { id: 'cls-rsr-1', category: 'dress',     subType: 'resort-dress',   colorFamily: 'navy',   priority: 10, label: 'Navy Resort Dress',                  description: 'Nautical-inspired resort dressing — classic through and through',                   imageKey: 'resort_dress' },
    { id: 'cls-ngt-1', category: 'dress',     subType: 'mini-dress',     colorFamily: 'black',  priority: 11, label: 'Classic Black Mini Dress',           description: 'The little black dress, mini-length — perpetually the right choice',                imageKey: 'mini_dress_black' },
    { id: 'cls-ngt-2', category: 'shoes',     subType: 'strappy-heels',  colorFamily: 'nude',   priority: 12, label: 'Nude Strappy Evening Heels',         description: 'An invisible strap in nude — timeless, polished, always right',                     imageKey: 'strappy_heels' },
  ],

  // ── YOUTHFUL ─────────────────────────────────────────────────────────────
  youthful: [
    // Tops
    { id: 'yth-top-1', category: 'top',       subType: 'tank-top',            colorFamily: 'white',  priority: 1,  label: 'Fitted White Ribbed Tank',           description: 'The essential — a clean ribbed tank for any layered look',                          imageKey: 'white_tee' },
    { id: 'yth-top-2', category: 'top',       subType: 'crop-top',            colorFamily: 'beige',  priority: 2,  label: 'Beige Ribbed Crop Top',              description: 'Playful proportions with a flattering, relaxed fit',                                 imageKey: 'beige_crop_top' },
    { id: 'yth-top-3', category: 'top',       subType: 'graphic-tee',         colorFamily: 'white',  priority: 3,  label: 'Vintage-Inspired Graphic Tee',       description: 'Retro nostalgia in a soft tee — effortlessly cool and current',                      imageKey: 'graphic_tee' },
    // Bottoms
    { id: 'yth-bot-1', category: 'bottom',    subType: 'wide-leg',            colorFamily: 'camel',  priority: 1,  label: 'High-Waist Wide-Leg Camel Trousers', description: 'Relaxed and on-trend — the trouser that goes with everything',                       imageKey: 'beige_trousers' },
    { id: 'yth-bot-2', category: 'bottom',    subType: 'jeans',               colorFamily: 'blue',   priority: 2,  label: 'High-Waist Straight Jeans',          description: 'The 90s youth formula — high-waist, straight-leg and endlessly wearable',           imageKey: 'high_waist_jeans' },
    { id: 'yth-bot-3', category: 'bottom',    subType: 'mini-skirt',          colorFamily: 'blue',   priority: 3,  label: 'Denim Mini Skirt',                   description: 'High-waist denim energy — retro, fun and endlessly fresh',                           imageKey: 'denim_mini_skirt' },
    { id: 'yth-bot-4', category: 'bottom',    subType: 'mini-skirt',          colorFamily: 'plaid',  priority: 4,  label: 'Plaid Mini Skirt',                   description: 'Preppy plaid in a fun mini cut — playful, cheeky and charming',                      imageKey: 'plaid_mini_skirt' },
    // Dresses
    { id: 'yth-drs-1', category: 'dress',     subType: 'mini-dress',          colorFamily: 'black',  priority: 1,  label: 'Mini Babydoll Dress',                description: 'A playful silhouette that goes from day to night instantly',                         imageKey: 'black_dress' },
    { id: 'yth-drs-2', category: 'dress',     subType: 'shirt-dress',         colorFamily: 'blue',   priority: 2,  label: 'Denim Shirt Dress',                  description: 'Effortless denim from collar to hem — the casual dress icon',                        imageKey: 'denim_shirt_dress' },
    { id: 'yth-drs-3', category: 'dress',     subType: 'slip-dress',          colorFamily: 'black',  priority: 3,  label: 'Casual Black Slip Dress',            description: 'Soft satin, bias-cut and effortless — the easiest way to look pulled together',    imageKey: 'casual_slip_dress' },
    { id: 'yth-drs-4', category: 'dress',     subType: 'mini-dress',          colorFamily: 'floral', priority: 4,  label: 'Floral Smocked Mini Dress',          description: 'Puff sleeves and sweet florals — the ultimate carefree summer dress',                imageKey: 'floral_smocked_dress' },
    // Outerwear
    { id: 'yth-out-1', category: 'outerwear', subType: 'blazer',              colorFamily: 'black',  priority: 1,  label: 'Oversized Black Blazer',             description: 'Smart-meets-playful — the trend-forward layer over jeans, skirts and dresses',      imageKey: 'oversized_blazer' },
    { id: 'yth-out-2', category: 'outerwear', subType: 'denim-jacket',        colorFamily: 'blue',   priority: 2,  label: 'Classic Denim Jacket',               description: 'The Americana staple — throws over anything and adds instant cool',                  imageKey: 'denim_jacket' },
    { id: 'yth-out-3', category: 'outerwear', subType: 'hoodie',              colorFamily: 'grey',   priority: 3,  label: 'Oversized Grey Hoodie',              description: 'Comfy, cool, and effortless — the street-style essential',                           imageKey: 'grey_hoodie' },
    { id: 'yth-out-4', category: 'outerwear', subType: 'bomber-jacket',       colorFamily: 'black',  priority: 4,  label: 'Black Satin Bomber Jacket',          description: 'Sleek and on-trend — the finisher for any youthful outfit',                          imageKey: 'satin_bomber' },
    { id: 'yth-out-5', category: 'outerwear', subType: 'varsity-jacket',      colorFamily: 'multi',  priority: 5,  label: 'Colourful Varsity Jacket',           description: 'Retro team spirit — bold colourblocking with nostalgic charm',                       imageKey: 'varsity_jacket' },
    // Shoes
    { id: 'yth-sho-1', category: 'shoes',     subType: 'sneakers',            colorFamily: 'white',  priority: 1,  label: 'White Chunky Trainers',              description: 'Thick-sole 90s dad sneakers — the youth-formula finisher',                           imageKey: 'chunky_trainers' },
    { id: 'yth-sho-2', category: 'shoes',     subType: 'sneakers',            colorFamily: 'white',  priority: 2,  label: 'White Platform Trainers',            description: 'Fresh kicks that give every outfit an instant lift',                                 imageKey: 'white_sneakers' },
    { id: 'yth-sho-3', category: 'shoes',     subType: 'flats',               colorFamily: 'pink',   priority: 3,  label: 'Ballet Pink Flats',                  description: 'Soft and sweet — ballerina energy for every day',                                    imageKey: 'ballet_pink_flats' },
    { id: 'yth-sho-4', category: 'shoes',     subType: 'sandals',             colorFamily: 'white',  priority: 4,  label: 'White Chunky Platform Sandals',      description: 'Retro platform vibes — chunky, bold and brilliantly fun',                            imageKey: 'white_chunky_sandals' },
    // Bags
    { id: 'yth-bag-1', category: 'bag',       subType: 'mini-bag',            colorFamily: 'black',  priority: 1,  label: 'Mini Gold-Hardware Shoulder Bag',    description: 'Tiny bag with big personality — gold chain, endless style',                          imageKey: 'mini_bag' },
    { id: 'yth-bag-2', category: 'bag',       subType: 'tote',                colorFamily: 'canvas', priority: 2,  label: 'Natural Canvas Tote Bag',            description: 'Carry everything casually — the laid-back everyday essential',                       imageKey: 'canvas_tote' },
    { id: 'yth-bag-3', category: 'bag',       subType: 'backpack',            colorFamily: 'pastel', priority: 3,  label: 'Pastel Mini Backpack',               description: 'Playful pastel in a cute mini size — hands-free and happy',                          imageKey: 'pastel_backpack' },
    // Jewelry
    { id: 'yth-jew-1', category: 'jewelry',   subType: 'earrings',            colorFamily: 'gold',   priority: 1,  label: 'Gold Huggie Hoop Earrings',          description: 'Stack a few, wear one — playful gold that works every day',                          imageKey: 'gold_hoops' },
    { id: 'yth-jew-2', category: 'jewelry',   subType: 'necklace',            colorFamily: 'gold',   priority: 2,  label: 'Layered Dainty Chain Necklaces',     description: 'Two or three delicate chains — effortless layered cool',                             imageKey: 'layered_necklaces' },
    { id: 'yth-jew-3', category: 'jewelry',   subType: 'bracelet',            colorFamily: 'multi',  priority: 3,  label: 'Colorful Resin Bangles',             description: 'Fun, bright stacked bangles — wear your mood on your wrist',                        imageKey: 'colorful_bangles' },
    // Active / Brunch / Resort / Night Out additions
    { id: 'yth-act-1', category: 'top',       subType: 'sports-bra',          colorFamily: 'black',  priority: 5,  label: 'Black Sports Bra',                   description: 'Your active-wear anchor — cool, confident and versatile',                            imageKey: 'sports_bra' },
    { id: 'yth-act-2', category: 'bottom',    subType: 'leggings',            colorFamily: 'black',  priority: 6,  label: 'Black High-Waist Leggings',          description: 'The movement essential — high-waist with a sleek, clean fit',                        imageKey: 'activewear_leggings' },
    { id: 'yth-act-3', category: 'shoes',     subType: 'training-shoes',      colorFamily: 'white',  priority: 7,  label: 'White Training Shoes',               description: 'Fresh white kicks that go from the gym to the street',                               imageKey: 'training_shoes' },
    { id: 'yth-act-4', category: 'outerwear', subType: 'windbreaker',         colorFamily: 'black',  priority: 8,  label: 'Black Sporty Windbreaker',           description: 'Street-sport energy — a sleek windbreaker for active days and beyond',               imageKey: 'windbreaker' },
    { id: 'yth-brn-1', category: 'dress',     subType: 'midi-dress',          colorFamily: 'floral', priority: 9,  label: 'Floral Brunch Midi Dress',           description: 'Bright florals and relaxed morning energy — weekend dressing at its best',           imageKey: 'floral_smocked_dress' },
    { id: 'yth-brn-2', category: 'shoes',     subType: 'loafers',             colorFamily: 'beige',  priority: 10, label: 'Beige Casual Loafers',               description: 'Effortlessly laid-back brunch footwear — comfortable and current',                   imageKey: 'loafers' },
    { id: 'yth-brn-3', category: 'bag',       subType: 'wicker-bag',          colorFamily: 'tan',    priority: 11, label: 'Tan Wicker Shoulder Bag',            description: 'Natural raffia energy for brunch — laid-back, youthful, charming',                  imageKey: 'wicker_bag' },
    { id: 'yth-rsr-1', category: 'dress',     subType: 'resort-dress',        colorFamily: 'floral', priority: 12, label: 'Floral Resort Dress',                description: 'Bright florals and vacation energy — holiday dressing done young',                   imageKey: 'resort_dress' },
    { id: 'yth-ngt-1', category: 'top',       subType: 'sequin-top',          colorFamily: 'silver', priority: 13, label: 'Silver Sequin Party Top',            description: 'Sequins and youth energy — wear this and the night opens up',                        imageKey: 'sequin_top' },
    { id: 'yth-ngt-2', category: 'jewelry',   subType: 'statement-earrings',  colorFamily: 'gold',   priority: 14, label: 'Fun Statement Drop Earrings',        description: 'Bold, playful earrings that say you dressed for the night',                          imageKey: 'statement_earrings' },
  ],
};

export const STYLE_GOALS: StyleGoal[] = [
  'minimal', 'elevated', 'bold', 'romantic', 'classic', 'youthful',
];

export const CORE_CATEGORIES: ItemCategory[] = [
  'top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'jewelry',
];
