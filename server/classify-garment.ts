import type { Request, Response } from "express";
import axios from "axios";

type ItemCategory = "top" | "bottom" | "dress" | "outerwear" | "shoes" | "bag" | "jewelry";
type OccasionTag = "work" | "casual" | "date-casual" | "date-dressy" | "event";

// Default occasions by subType. `date` was split in April 2026 into
// `date-casual` (coffee/lunch) and `date-dressy` (dinner/wine bar). Casual
// fabrics map to `date-casual`; dressier construction maps to `date-dressy`.
const SUBTYPE_OCCASIONS: Record<string, OccasionTag[]> = {
  // Tops
  "t-shirt":        ["casual"],
  "long-sleeve":    ["casual", "date-casual"],
  "polo-shirt":     ["casual", "work"],
  "henley":         ["casual"],
  "rugby-shirt":    ["casual"],
  "tank-top":       ["casual"],
  "crop-top":       ["casual", "date-casual"],
  "shirt":          ["work", "casual", "date-casual", "date-dressy"],
  "blouse":         ["work", "date-dressy", "event"],
  "sweater":        ["casual", "date-casual"],
  "cardigan":       ["work", "casual"],
  "turtleneck":     ["work", "casual", "date-dressy"],
  // Outerwear
  "blazer":         ["work", "event", "date-dressy"],
  "coat":           ["work", "casual"],
  "peacoat":        ["work", "casual", "date-dressy"],
  "trench":         ["work", "casual"],
  "jacket":         ["casual", "date-casual"],
  "hoodie":         ["casual"],
  "bomber-jacket":  ["casual", "date-casual"],
  "leather-jacket": ["casual", "date-dressy"],
  "puffer":         ["casual"],
  "raincoat":       ["casual"],
  "vest":           ["casual", "work"],
  "denim-jacket":   ["casual", "date-casual"],
  // Bottoms
  "jeans":          ["casual", "date-casual"],
  "trousers":       ["work", "date-dressy", "event"],
  "chinos":         ["work", "casual", "date-casual"],
  "wide-leg":       ["casual", "date-casual"],
  "joggers":        ["casual"],
  "shorts":         ["casual"],
  "leggings":       ["casual"],
  "mini-skirt":     ["casual", "date-casual"],
  "midi-skirt":     ["work", "date-dressy", "event"],
  "maxi-skirt":     ["casual", "date-casual"],
  // Dresses
  "midi-dress":     ["date-dressy", "event"],
  "maxi-dress":     ["casual", "date-dressy", "event"],
  "mini-dress":     ["date-dressy", "event"],
  "wrap-dress":     ["date-dressy", "work"],
  "shirt-dress":    ["work", "casual", "date-casual"],
  "cocktail-dress": ["event", "date-dressy"],
  // Shoes
  "sneakers":       ["casual"],
  "heels":          ["date-dressy", "event", "work"],
  "flats":          ["work", "casual"],
  "boots":          ["casual", "date-casual"],
  "sandals":        ["casual", "date-casual"],
  "loafers":        ["work", "casual"],
  "mules":          ["casual", "date-casual", "date-dressy"],
  // Bags
  "tote":           ["work", "casual"],
  "crossbody":      ["casual", "date-casual"],
  "clutch":         ["date-dressy", "event"],
  "backpack":       ["casual"],
  "shoulder-bag":   ["work", "casual", "date-dressy"],
  "mini-bag":       ["date-dressy", "event"],
  // Jewelry
  "necklace":       ["date-dressy", "event", "casual"],
  "earrings":       ["date-dressy", "event", "work"],
  "bracelet":       ["casual", "date-casual"],
  "ring":           ["casual", "work"],
  "watch":          ["work", "casual"],
  "brooch":         ["work", "event"],
};

// Per-displayName overrides for garments that differ from their subType default
const DISPLAYNAME_OCCASION_OVERRIDES: Record<string, OccasionTag[]> = {
  "Dress shirt":       ["work", "date-dressy", "event"],
  "Oxford shirt":      ["work", "date-dressy"],
  "Flannel shirt":     ["casual"],
  "Chambray shirt":    ["casual"],
  "Button-down shirt": ["work", "casual", "date-casual"],
  "Polo shirt":        ["casual", "work"],
  "Long-sleeve t-shirt": ["casual", "date-casual"],
  "Hoodie":            ["casual"],
  "Sweatshirt":        ["casual"],
  "Pullover":          ["casual"],
  "Jumper":            ["casual", "date-casual"],
  "Bomber jacket":     ["casual", "date-casual"],
  "Leather jacket":    ["casual", "date-dressy"],
  "Denim jacket":      ["casual"],
  "Windbreaker":       ["casual"],
  "Parka":             ["casual"],
  "Suit jacket":       ["work", "event"],
  "Sport coat":        ["work", "date-dressy"],
  "Peacoat":           ["work", "casual", "date-dressy"],
  "Overcoat":          ["work", "casual"],
  "Trench coat":       ["work", "casual", "date-dressy"],
  "Pencil skirt":      ["work", "date-dressy"],
  "Mini skirt":        ["casual", "date-casual"],
  "Midi skirt":        ["work", "date-dressy", "event"],
  "Maxi skirt":        ["casual", "date-casual"],
  "A-line skirt":      ["casual", "date-casual"],
  "Sundress":          ["casual", "date-casual"],
  "Evening gown":      ["event"],
  "Cocktail dress":    ["event", "date-dressy"],
  "Shift dress":       ["work", "date-dressy"],
  "Wrap dress":        ["date-dressy", "work"],
  "Maxi dress":        ["casual", "date-dressy", "event"],
};

function inferOccasions(subType: string | null, displayName: string): OccasionTag[] {
  if (DISPLAYNAME_OCCASION_OVERRIDES[displayName]) {
    return DISPLAYNAME_OCCASION_OVERRIDES[displayName];
  }
  if (subType && SUBTYPE_OCCASIONS[subType]) {
    return SUBTYPE_OCCASIONS[subType];
  }
  return ["casual"];
}

interface GarmentMapping {
  category: ItemCategory;
  subType: string;
  displayName: string;
}

const GARMENT_LABEL_MAP: Record<string, GarmentMapping> = {
  // ── T-shirts ────────────────────────────────────────────────────────────
  "T-shirt":             { category: "top", subType: "t-shirt",    displayName: "T-shirt" },
  "T-Shirt":             { category: "top", subType: "t-shirt",    displayName: "T-shirt" },
  "Active shirt":        { category: "top", subType: "t-shirt",    displayName: "T-shirt" },
  "Active Shirt":        { category: "top", subType: "t-shirt",    displayName: "T-shirt" },
  "Rugby shirt":         { category: "top", subType: "rugby-shirt", displayName: "Rugby shirt" },
  "Rugby":               { category: "top", subType: "rugby-shirt", displayName: "Rugby shirt" },
  "Undershirt":          { category: "top", subType: "t-shirt",    displayName: "T-shirt" },
  "Long-sleeved t-shirt":{ category: "top", subType: "long-sleeve", displayName: "Long-sleeve t-shirt" },
  "Long sleeved t-shirt":{ category: "top", subType: "long-sleeve", displayName: "Long-sleeve t-shirt" },
  "Henley shirt":        { category: "top", subType: "henley",      displayName: "Henley" },
  "Ringer T-shirt":      { category: "top", subType: "t-shirt",     displayName: "T-shirt" },
  "V-neck":              { category: "top", subType: "t-shirt",     displayName: "V-neck top" },
  "Raglan sleeve":       { category: "top", subType: "long-sleeve", displayName: "Raglan top" },

  // ── Polo shirts ─────────────────────────────────────────────────────────
  "Polo shirt":          { category: "top", subType: "polo-shirt",  displayName: "Polo shirt" },
  "Polo Shirt":          { category: "top", subType: "polo-shirt",  displayName: "Polo shirt" },

  // ── Tank tops ────────────────────────────────────────────────────────────
  "Tank top":            { category: "top", subType: "tank-top",   displayName: "Tank top" },
  "Vest top":            { category: "top", subType: "tank-top",   displayName: "Vest top" },
  "Sleeveless shirt":    { category: "top", subType: "tank-top",   displayName: "Sleeveless top" },

  // ── Crop tops ────────────────────────────────────────────────────────────
  "Crop top":            { category: "top", subType: "crop-top",   displayName: "Crop top" },

  // ── Shirts ───────────────────────────────────────────────────────────────
  "Shirt":               { category: "top", subType: "shirt",      displayName: "Shirt" },
  "Dress shirt":         { category: "top", subType: "shirt",      displayName: "Dress shirt" },
  "Button-down shirt":   { category: "top", subType: "shirt",      displayName: "Button-down shirt" },
  "Button down shirt":   { category: "top", subType: "shirt",      displayName: "Button-down shirt" },
  "Oxford shirt":        { category: "top", subType: "shirt",      displayName: "Oxford shirt" },
  "Flannel":             { category: "top", subType: "shirt",      displayName: "Flannel shirt" },
  "Chambray":            { category: "top", subType: "shirt",      displayName: "Chambray shirt" },

  // ── Blouses ──────────────────────────────────────────────────────────────
  "Blouse":              { category: "top", subType: "blouse",     displayName: "Blouse" },
  "Tunic":               { category: "top", subType: "blouse",     displayName: "Tunic" },

  // ── Sweaters & knits ─────────────────────────────────────────────────────
  "Sweater":             { category: "top", subType: "sweater",    displayName: "Sweater" },
  "Jumper":              { category: "top", subType: "sweater",    displayName: "Jumper" },
  "Pullover":            { category: "top", subType: "sweater",    displayName: "Pullover" },
  "Sweatshirt":          { category: "top", subType: "sweater",    displayName: "Sweatshirt" },
  "Knit":                { category: "top", subType: "sweater",    displayName: "Knit top" },
  "Knitwear":            { category: "top", subType: "sweater",    displayName: "Knitwear" },

  // ── Cardigans ────────────────────────────────────────────────────────────
  "Cardigan":            { category: "top", subType: "cardigan",   displayName: "Cardigan" },

  // ── Turtlenecks ──────────────────────────────────────────────────────────
  "Turtleneck":          { category: "top", subType: "turtleneck", displayName: "Turtleneck" },
  "Mock neck":           { category: "top", subType: "turtleneck", displayName: "Mock-neck top" },

  // ── Blazers ──────────────────────────────────────────────────────────────
  "Blazer":              { category: "outerwear", subType: "blazer",       displayName: "Blazer" },
  "Sport coat":          { category: "outerwear", subType: "blazer",       displayName: "Sport coat" },
  "Sports coat":         { category: "outerwear", subType: "blazer",       displayName: "Sport coat" },
  "Suit jacket":         { category: "outerwear", subType: "blazer",       displayName: "Suit jacket" },

  // ── Coats ────────────────────────────────────────────────────────────────
  "Coat":                { category: "outerwear", subType: "coat",          displayName: "Coat" },
  "Overcoat":            { category: "outerwear", subType: "coat",          displayName: "Overcoat" },
  "Pea coat":            { category: "outerwear", subType: "peacoat",       displayName: "Peacoat" },
  "Peacoat":             { category: "outerwear", subType: "peacoat",       displayName: "Peacoat" },
  "Duffle coat":         { category: "outerwear", subType: "coat",          displayName: "Duffle coat" },
  "Raincoat":            { category: "outerwear", subType: "raincoat",      displayName: "Raincoat" },

  // ── Trench coats ─────────────────────────────────────────────────────────
  "Trench coat":         { category: "outerwear", subType: "trench",        displayName: "Trench coat" },

  // ── Puffer & parkas ──────────────────────────────────────────────────────
  "Parka":               { category: "outerwear", subType: "puffer",        displayName: "Parka" },
  "Windbreaker":         { category: "outerwear", subType: "raincoat",      displayName: "Windbreaker" },

  // ── Jackets ──────────────────────────────────────────────────────────────
  "Jacket":              { category: "outerwear", subType: "jacket",        displayName: "Jacket" },
  "Bomber jacket":       { category: "outerwear", subType: "bomber-jacket", displayName: "Bomber jacket" },
  "Leather jacket":      { category: "outerwear", subType: "leather-jacket",displayName: "Leather jacket" },

  // ── Denim jackets ────────────────────────────────────────────────────────
  "Denim jacket":        { category: "outerwear", subType: "denim-jacket", displayName: "Denim jacket" },

  // ── Vests ────────────────────────────────────────────────────────────────
  "Vest":                { category: "outerwear", subType: "vest",         displayName: "Vest" },
  "Gilet":               { category: "outerwear", subType: "vest",         displayName: "Gilet" },

  // ── Jeans ────────────────────────────────────────────────────────────────
  "Jeans":               { category: "bottom", subType: "jeans",    displayName: "Jeans" },
  "Denim":               { category: "bottom", subType: "jeans",    displayName: "Jeans" },
  "Skinny jeans":        { category: "bottom", subType: "jeans",    displayName: "Skinny jeans" },
  "Bootcut jeans":       { category: "bottom", subType: "jeans",    displayName: "Bootcut jeans" },

  // ── Trousers ─────────────────────────────────────────────────────────────
  "Trousers":            { category: "bottom", subType: "trousers", displayName: "Trousers" },
  "Pants":               { category: "bottom", subType: "trousers", displayName: "Trousers" },
  "Slacks":              { category: "bottom", subType: "trousers", displayName: "Trousers" },
  "Cargo pants":         { category: "bottom", subType: "trousers", displayName: "Cargo trousers" },
  "Capri pants":         { category: "bottom", subType: "trousers", displayName: "Capri trousers" },
  "Sweatpants":          { category: "bottom", subType: "joggers",  displayName: "Sweatpants" },
  "Joggers":             { category: "bottom", subType: "joggers",  displayName: "Joggers" },

  // ── Chinos ───────────────────────────────────────────────────────────────
  "Chinos":              { category: "bottom", subType: "chinos",   displayName: "Chinos" },
  "Khakis":              { category: "bottom", subType: "chinos",   displayName: "Chinos" },

  // ── Shorts ───────────────────────────────────────────────────────────────
  "Shorts":              { category: "bottom", subType: "shorts",   displayName: "Shorts" },
  "Bermuda shorts":      { category: "bottom", subType: "shorts",   displayName: "Bermuda shorts" },

  // ── Leggings ─────────────────────────────────────────────────────────────
  "Leggings":            { category: "bottom", subType: "leggings", displayName: "Leggings" },
  "Tights":              { category: "bottom", subType: "leggings", displayName: "Tights" },

  // ── Skirts ───────────────────────────────────────────────────────────────
  "Skirt":               { category: "bottom", subType: "midi-skirt", displayName: "Skirt" },
  "Miniskirt":           { category: "bottom", subType: "mini-skirt", displayName: "Mini skirt" },
  "Mini skirt":          { category: "bottom", subType: "mini-skirt", displayName: "Mini skirt" },
  "Midi skirt":          { category: "bottom", subType: "midi-skirt", displayName: "Midi skirt" },
  "Maxi skirt":          { category: "bottom", subType: "maxi-skirt", displayName: "Maxi skirt" },
  "Pencil skirt":        { category: "bottom", subType: "midi-skirt", displayName: "Pencil skirt" },
  "A-line skirt":        { category: "bottom", subType: "midi-skirt", displayName: "A-line skirt" },

  // ── Dresses ──────────────────────────────────────────────────────────────
  "Dress":               { category: "dress", subType: "midi-dress",     displayName: "Dress" },
  "Gown":                { category: "dress", subType: "midi-dress",     displayName: "Gown" },
  "Sundress":            { category: "dress", subType: "mini-dress",     displayName: "Sundress" },
  "Wrap dress":          { category: "dress", subType: "wrap-dress",     displayName: "Wrap dress" },
  "Shift dress":         { category: "dress", subType: "midi-dress",     displayName: "Shift dress" },
  "Maxi dress":          { category: "dress", subType: "maxi-dress",     displayName: "Maxi dress" },
  "Mini dress":          { category: "dress", subType: "mini-dress",     displayName: "Mini dress" },
  "Cocktail dress":      { category: "dress", subType: "cocktail-dress", displayName: "Cocktail dress" },
  "Evening gown":        { category: "dress", subType: "cocktail-dress", displayName: "Evening gown" },
  "One-piece garment":   { category: "dress", subType: "midi-dress",     displayName: "Dress" },

  // ── Sneakers & athletic shoes ────────────────────────────────────────────
  "Sneakers":            { category: "shoes", subType: "sneakers",  displayName: "Sneakers" },
  "Sneaker":             { category: "shoes", subType: "sneakers",  displayName: "Sneakers" },
  "Athletic shoe":       { category: "shoes", subType: "sneakers",  displayName: "Sneakers" },
  "Running shoe":        { category: "shoes", subType: "sneakers",  displayName: "Running shoes" },
  "Sports shoes":        { category: "shoes", subType: "sneakers",  displayName: "Sneakers" },
  "Tennis shoe":         { category: "shoes", subType: "sneakers",  displayName: "Tennis shoes" },
  "Trainer":             { category: "shoes", subType: "sneakers",  displayName: "Trainers" },
  "Trainers":            { category: "shoes", subType: "sneakers",  displayName: "Trainers" },

  // ── Heels ────────────────────────────────────────────────────────────────
  "High heels":          { category: "shoes", subType: "heels",     displayName: "Heels" },
  "High-heeled shoe":    { category: "shoes", subType: "heels",     displayName: "Heels" },
  "Stiletto":            { category: "shoes", subType: "heels",     displayName: "Stilettos" },
  "Stilettos":           { category: "shoes", subType: "heels",     displayName: "Stilettos" },
  "Pump":                { category: "shoes", subType: "heels",     displayName: "Pumps" },
  "Pumps":               { category: "shoes", subType: "heels",     displayName: "Pumps" },
  "Court shoe":          { category: "shoes", subType: "heels",     displayName: "Court heels" },
  "Wedge":               { category: "shoes", subType: "heels",     displayName: "Wedge heels" },
  "Block heel":          { category: "shoes", subType: "heels",     displayName: "Block heels" },
  "Kitten heel":         { category: "shoes", subType: "heels",      displayName: "Kitten heels" },
  "Slingback":           { category: "shoes", subType: "heels",      displayName: "Slingback heels" },

  // ── Flats ─────────────────────────────────────────────────────────────────
  "Flat shoes":          { category: "shoes", subType: "flats",     displayName: "Flats" },
  "Flat":                { category: "shoes", subType: "flats",     displayName: "Flats" },
  "Ballet flat":         { category: "shoes", subType: "flats",     displayName: "Ballet flats" },
  "Ballet flats":        { category: "shoes", subType: "flats",     displayName: "Ballet flats" },
  "Ballerina":           { category: "shoes", subType: "flats",     displayName: "Ballet flats" },
  "Ballet shoe":         { category: "shoes", subType: "flats",     displayName: "Ballet flats" },
  "Ballet pump":         { category: "shoes", subType: "flats",     displayName: "Ballet flats" },
  "Slip-on shoe":        { category: "shoes", subType: "flats",     displayName: "Slip-on flats" },
  "Slip-on":             { category: "shoes", subType: "flats",     displayName: "Slip-on flats" },
  "Slip on shoe":        { category: "shoes", subType: "flats",     displayName: "Slip-on flats" },
  "Dress shoe":          { category: "shoes", subType: "loafers",   displayName: "Dress shoes" },
  "Casual shoe":         { category: "shoes", subType: "flats",     displayName: "Flats" },
  "Comfort shoe":        { category: "shoes", subType: "flats",     displayName: "Flats" },
  "Comfortable shoe":    { category: "shoes", subType: "flats",     displayName: "Flats" },
  "Patent leather shoe": { category: "shoes", subType: "flats",     displayName: "Patent flats" },
  "Mary Jane":           { category: "shoes", subType: "flats",     displayName: "Mary Janes" },
  "Mary Janes":          { category: "shoes", subType: "flats",     displayName: "Mary Janes" },
  "Slipper":             { category: "shoes", subType: "flats",     displayName: "Flats" },

  // ── Boots ────────────────────────────────────────────────────────────────
  "Boot":                { category: "shoes", subType: "boots",     displayName: "Boots" },
  "Boots":               { category: "shoes", subType: "boots",     displayName: "Boots" },
  "Ankle boot":          { category: "shoes", subType: "boots",     displayName: "Ankle boots" },
  "Ankle boots":         { category: "shoes", subType: "boots",     displayName: "Ankle boots" },
  "Knee-high boot":      { category: "shoes", subType: "boots",     displayName: "Knee-high boots" },
  "Chelsea boot":        { category: "shoes", subType: "boots",     displayName: "Chelsea boots" },

  // ── Sandals ──────────────────────────────────────────────────────────────
  "Sandal":              { category: "shoes", subType: "sandals",   displayName: "Sandals" },
  "Sandals":             { category: "shoes", subType: "sandals",   displayName: "Sandals" },
  "Flip-flops":          { category: "shoes", subType: "sandals",   displayName: "Sandals" },
  "Thong sandal":        { category: "shoes", subType: "sandals",   displayName: "Sandals" },

  // ── Loafers & mules ──────────────────────────────────────────────────────
  "Loafer":              { category: "shoes", subType: "loafers",   displayName: "Loafers" },
  "Loafers":             { category: "shoes", subType: "loafers",   displayName: "Loafers" },
  "Moccasin":            { category: "shoes", subType: "loafers",   displayName: "Loafers" },
  "Moccasins":           { category: "shoes", subType: "loafers",   displayName: "Loafers" },
  "Oxford shoe":         { category: "shoes", subType: "loafers",   displayName: "Oxford shoes" },
  "Oxford":              { category: "shoes", subType: "loafers",   displayName: "Oxford shoes" },
  "Derby shoe":          { category: "shoes", subType: "loafers",   displayName: "Derby shoes" },
  "Derby":               { category: "shoes", subType: "loafers",   displayName: "Derby shoes" },
  "Penny loafer":        { category: "shoes", subType: "loafers",   displayName: "Loafers" },
  "Mule":                { category: "shoes", subType: "mules",     displayName: "Mules" },
  "Mules":               { category: "shoes", subType: "mules",     displayName: "Mules" },
  "Slide":               { category: "shoes", subType: "mules",     displayName: "Slides" },

  // ── Generic shoe fallback ─────────────────────────────────────────────────
  "Shoe":                { category: "shoes", subType: "flats",     displayName: "Shoes" },
  "Footwear":            { category: "shoes", subType: "sneakers",  displayName: "Shoes" },

  // ── Totes & large bags ────────────────────────────────────────────────────
  "Tote bag":            { category: "bag", subType: "tote",         displayName: "Tote bag" },
  "Shopping bag":        { category: "bag", subType: "tote",         displayName: "Tote bag" },

  // ── Shoulder bags & handbags ─────────────────────────────────────────────
  "Handbag":             { category: "bag", subType: "shoulder-bag", displayName: "Handbag" },
  "Bag":                 { category: "bag", subType: "shoulder-bag", displayName: "Bag" },
  "Purse":               { category: "bag", subType: "shoulder-bag", displayName: "Bag" },
  "Shoulder bag":        { category: "bag", subType: "shoulder-bag", displayName: "Shoulder bag" },
  "Satchel":             { category: "bag", subType: "shoulder-bag", displayName: "Satchel" },
  "Messenger bag":       { category: "bag", subType: "shoulder-bag", displayName: "Messenger bag" },

  // ── Crossbody bags ───────────────────────────────────────────────────────
  "Crossbody bag":       { category: "bag", subType: "crossbody",    displayName: "Crossbody bag" },
  "Cross-body bag":      { category: "bag", subType: "crossbody",    displayName: "Crossbody bag" },

  // ── Clutches ─────────────────────────────────────────────────────────────
  "Clutch":              { category: "bag", subType: "clutch",        displayName: "Clutch" },
  "Clutch bag":          { category: "bag", subType: "clutch",        displayName: "Clutch" },
  "Evening bag":         { category: "bag", subType: "clutch",        displayName: "Evening clutch" },
  "Minaudière":          { category: "bag", subType: "clutch",        displayName: "Clutch" },
  "Wallet":              { category: "bag", subType: "clutch",        displayName: "Wallet" },

  // ── Backpacks ─────────────────────────────────────────────────────────────
  "Backpack":            { category: "bag", subType: "backpack",      displayName: "Backpack" },
  "Knapsack":            { category: "bag", subType: "backpack",      displayName: "Backpack" },
  "Rucksack":            { category: "bag", subType: "backpack",      displayName: "Backpack" },

  // ── Necklaces ────────────────────────────────────────────────────────────
  "Necklace":            { category: "jewelry", subType: "necklace",  displayName: "Necklace" },
  "Pendant":             { category: "jewelry", subType: "necklace",  displayName: "Pendant necklace" },
  "Chain":               { category: "jewelry", subType: "necklace",  displayName: "Chain necklace" },
  "Choker":              { category: "jewelry", subType: "necklace",  displayName: "Choker" },
  "Pearl necklace":      { category: "jewelry", subType: "necklace",  displayName: "Pearl necklace" },
  "Gold chain":          { category: "jewelry", subType: "necklace",  displayName: "Gold chain" },

  // ── Earrings ─────────────────────────────────────────────────────────────
  "Earring":             { category: "jewelry", subType: "earrings",  displayName: "Earrings" },
  "Earrings":            { category: "jewelry", subType: "earrings",  displayName: "Earrings" },
  "Hoop earring":        { category: "jewelry", subType: "earrings",  displayName: "Hoop earrings" },
  "Hoop earrings":       { category: "jewelry", subType: "earrings",  displayName: "Hoop earrings" },
  "Stud earring":        { category: "jewelry", subType: "earrings",  displayName: "Stud earrings" },
  "Drop earring":        { category: "jewelry", subType: "earrings",  displayName: "Drop earrings" },
  "Dangle earring":      { category: "jewelry", subType: "earrings",  displayName: "Drop earrings" },

  // ── Bracelets ─────────────────────────────────────────────────────────────
  "Bracelet":            { category: "jewelry", subType: "bracelet",  displayName: "Bracelet" },
  "Bangle":              { category: "jewelry", subType: "bracelet",  displayName: "Bangle" },
  "Bangles":             { category: "jewelry", subType: "bracelet",  displayName: "Bangles" },
  "Cuff":                { category: "jewelry", subType: "bracelet",  displayName: "Cuff bracelet" },
  "Cuff bracelet":       { category: "jewelry", subType: "bracelet",  displayName: "Cuff bracelet" },

  // ── Rings ─────────────────────────────────────────────────────────────────
  "Ring":                { category: "jewelry", subType: "ring",      displayName: "Ring" },
  "Rings":               { category: "jewelry", subType: "ring",      displayName: "Rings" },
  "Band":                { category: "jewelry", subType: "ring",      displayName: "Ring" },
  "Signet ring":         { category: "jewelry", subType: "ring",      displayName: "Signet ring" },

  // ── Watches ──────────────────────────────────────────────────────────────
  "Watch":               { category: "jewelry", subType: "watch",     displayName: "Watch" },
  "Wristwatch":          { category: "jewelry", subType: "watch",     displayName: "Watch" },
  "Timepiece":           { category: "jewelry", subType: "watch",     displayName: "Watch" },

  // ── Brooches ──────────────────────────────────────────────────────────────
  "Brooch":              { category: "jewelry", subType: "brooch",    displayName: "Brooch" },
  "Pin":                 { category: "jewelry", subType: "brooch",    displayName: "Pin" },

  // ── Generic jewelry fallback ──────────────────────────────────────────────
  "Jewelry":             { category: "jewelry", subType: "necklace",  displayName: "Jewelry" },
  "Jewellery":           { category: "jewelry", subType: "necklace",  displayName: "Jewellery" },
  "Accessory":           { category: "jewelry", subType: "necklace",  displayName: "Accessory" },
  "Fashion accessory":   { category: "jewelry", subType: "necklace",  displayName: "Accessory" },
};

const COLOR_LABEL_MAP: Record<string, string> = {
  "Black": "black",
  "White": "white",
  "Gray": "grey",
  "Grey": "grey",
  "Silver": "grey",
  "Blue": "blue",
  "Navy": "navy",
  "Indigo": "blue",
  "Cobalt blue": "blue",
  "Red": "red",
  "Maroon": "burgundy",
  "Burgundy": "burgundy",
  "Crimson": "red",
  "Green": "green",
  "Olive": "olive",
  "Teal": "green",
  "Sage": "green",
  "Brown": "brown",
  "Tan": "camel",
  "Camel": "camel",
  "Beige": "beige",
  "Khaki": "beige",
  "Cream": "cream",
  "Ivory": "cream",
  "Yellow": "yellow",
  "Gold": "yellow",
  "Pink": "pink",
  "Rose": "pink",
  "Blush": "pink",
  "Purple": "lavender",
  "Violet": "lavender",
  "Lavender": "lavender",
  "Lilac": "lavender",
  "Orange": "orange",
  "Rust": "orange",
  "Amber": "orange",
  "Coral": "coral",
  "Terracotta": "orange",
  "Copper": "orange",
};

function rgbToColorFamily(r: number, g: number, b: number): string {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  // Achromatic (grey/white/black)
  // Real-world black items (leather, denim, wool) photograph at lightness 0.18–0.28
  // due to indoor lighting, sheen, and camera exposure — raise the threshold accordingly.
  if (saturation < 0.12) {
    if (lightness > 0.88) return "white";
    if (lightness < 0.28) return "black";
    return "grey";
  }

  // Calculate hue (0–360) — computed early so the warm-neutral block can use it
  // to exclude rust/terracotta (hue 9–18°) which share saturation with camel/brown
  // but are chromatically orange, not warm-neutral.
  let hue = 0;
  if (delta !== 0) {
    if (max === rn) hue = ((gn - bn) / delta) % 6;
    else if (max === gn) hue = (bn - rn) / delta + 2;
    else hue = (rn - gn) / delta + 4;
    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;
  }

  // Warm neutrals (beige, camel, brown, cream) — muted saturation AND true warm-brown hue.
  // Require hue >= 18° so that rust/terracotta (hue 9–17°) falls through to the orange band
  // below instead of being misclassified as camel or brown.
  if (saturation < 0.45 && hue >= 18 && rn >= gn && gn >= bn) {
    if (lightness > 0.82) return "cream";
    if (lightness > 0.65) return "beige";
    if (lightness > 0.45) return "camel";
    return "brown";
  }

  // True reds occupy hue 0–8° (pure red, scarlet, crimson via >=345°).
  // Rust, terracotta, and burnt-orange start at ~9° and should read as "orange".
  if (hue < 9 || hue >= 345) return lightness < 0.35 ? "burgundy" : "red";
  if (hue < 50)  return "orange"; // 9–49°: rust, terracotta, burnt-orange, true orange
  if (hue < 65)  return "yellow";
  if (hue < 85)  return lightness < 0.40 ? "olive" : "yellow";
  if (hue < 160) return "green";
  if (hue < 200) return "green";
  if (hue < 255) return lightness < 0.30 ? "navy" : "blue";
  if (hue < 290) return "lavender";
  if (hue < 330) return lightness < 0.35 ? "burgundy" : "pink";
  return "red";
}

// Neutrals are almost always the garment color, rarely a background color (except white/grey walls,
// which are already filtered by lightness > 0.90). Saturated colors (green blanket, blue sofa, etc.)
// are far more likely to be environmental backgrounds.
const NEUTRAL_FAMILIES = new Set(['black', 'grey', 'white', 'brown', 'beige', 'cream', 'navy', 'camel']);

// sRGB → HSL. Mirrors the client-side `rgbToHsl` so server and client agree on
// per-item perceptual values.
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
      case gn: h = (bn - rn) / d + 2; break;
      case bn: h = (rn - gn) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s, l };
}

// sRGB → CIE Lab (D65)
function rgbToLab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const lin = [r, g, b].map(v => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const X = (lin[0] * 0.4124564 + lin[1] * 0.3575761 + lin[2] * 0.1804375) / 0.95047;
  const Y = (lin[0] * 0.2126729 + lin[1] * 0.7151522 + lin[2] * 0.0721750);
  const Z = (lin[0] * 0.0193339 + lin[1] * 0.1191920 + lin[2] * 0.9503041) / 1.08883;
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/**
 * Find the RGB pixel that best represents the garment's chosen colour family.
 * Reuses the same logic as `dominantColorFamily` so the perceptual HSL/Lab
 * values agree with the displayed family label.
 */
function dominantGarmentRgb(
  colors: Array<{ color: { red: number; green: number; blue: number }; pixelFraction: number }>,
  chosenFamily: string,
  applyNeutralPreference: boolean,
): { red: number; green: number; blue: number } | null {
  if (!colors || colors.length === 0) return null;
  const sorted = [...colors].sort((a, b) => b.pixelFraction - a.pixelFraction);
  // Find the first pixel whose family matches the chosen family.
  for (const entry of sorted) {
    const { red: r, green: g, blue: b } = entry.color;
    const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
    // Skip near-white pixels for non-white items only.
    if (chosenFamily !== 'white' && lightness > 0.90) continue;
    const fam = rgbToColorFamily(r, g, b);
    if (fam === chosenFamily) return entry.color;
  }
  // Fallback: most-dominant non-background pixel.
  for (const entry of sorted) {
    const { red: r, green: g, blue: b } = entry.color;
    const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
    if (chosenFamily !== 'white' && lightness > 0.90) continue;
    return entry.color;
  }
  return sorted[0]?.color ?? null;
}

function dominantColorFamily(
  colors: Array<{ color: { red: number; green: number; blue: number }; pixelFraction: number }>,
  applyNeutralPreference = true
): string | null {
  if (!colors || colors.length === 0) return null;

  const sorted = [...colors].sort((a, b) => b.pixelFraction - a.pixelFraction);

  // ── Pre-flight: rescue white garments shot on coloured / dark surfaces ────
  // The default flow below discards pixels with lightness > 0.90 as background,
  // which is correct for studio white walls but *incorrect* when the garment
  // itself is white (e.g. white sneakers on a green towel). In that case the
  // white body gets filtered and only shadows / interior / logo pixels remain,
  // producing a "black" or "grey" result. Detect the signature here and
  // short-circuit before the lightness filter kicks in.
  const familyFractions: Record<string, number> = {};
  for (const entry of sorted) {
    const fam = rgbToColorFamily(entry.color.red, entry.color.green, entry.color.blue);
    familyFractions[fam] = (familyFractions[fam] ?? 0) + entry.pixelFraction;
  }
  const whiteFrac = familyFractions['white'] ?? 0;
  const blackFrac = familyFractions['black'] ?? 0;
  const greyFrac  = familyFractions['grey']  ?? 0;
  const beigeFrac = familyFractions['beige'] ?? 0;
  const creamFrac = familyFractions['cream'] ?? 0;
  const brownFrac = familyFractions['brown'] ?? 0;
  const camelFrac = familyFractions['camel'] ?? 0;
  const navyFrac  = familyFractions['navy']  ?? 0;
  const otherNeutralMax = Math.max(blackFrac, greyFrac, beigeFrac, creamFrac, brownFrac, camelFrac, navyFrac);
  if (whiteFrac >= 0.20 &&
      whiteFrac > blackFrac * 2 &&          // guard vs. black-item-on-white-wall shots
      whiteFrac > otherNeutralMax * 1.2) {  // guard vs. grey / beige / cream / brown / camel / navy garments
    return 'white';
  }

  const candidates: string[] = [];
  for (const entry of sorted.slice(0, 8)) {
    const { red: r, green: g, blue: b } = entry.color;
    const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
    if (lightness > 0.90) continue; // skip near-white (likely background / plain wall)
    candidates.push(rgbToColorFamily(r, g, b));
  }

  if (candidates.length === 0) return null;

  // If the most dominant pixel is black it is always the garment (backgrounds are never black).
  if (candidates[0] === 'black') return 'black';

  if (applyNeutralPreference) {
    // Footwear and bags are often photographed on coloured surfaces (green blanket, wood floor).
    // Scan all top candidates for any neutral — it is far more likely to be the item's colour
    // than the background, which will be a saturated hue (green, teal, brown, etc.).
    const neutral = candidates.find(c => NEUTRAL_FAMILIES.has(c));
    if (neutral) return neutral;
  }

  // For clothing items the garment fills the frame once near-white backgrounds are filtered,
  // so the most dominant pixel is reliably the garment body colour.
  return candidates[0];
}

function buildDescription(displayName: string, colorFamily: string | null): string {
  if (colorFamily) {
    const capitalizedColor = colorFamily.charAt(0).toUpperCase() + colorFamily.slice(1);
    return `${capitalizedColor} ${displayName.toLowerCase()}`;
  }
  return displayName;
}

const CONF_THRESHOLD = 0.55;

interface VisionLabel {
  description: string;
  score: number;
}

export async function classifyGarment(req: Request, res: Response) {
  try {
    const { imageBase64, imageUrl, userId } = req.body;

    if ((!imageBase64 && !imageUrl) || (imageBase64 && imageUrl)) {
      return res.status(400).json({ error: "imageBase64 or imageUrl required" });
    }

    const apiKey = process.env.GCV_API_KEY;
    if (!apiKey) {
      console.error("GCV_API_KEY is not set");
      return res.status(500).json({ error: "missing_gcv_api_key" });
    }

    const visionReq = {
      requests: [
        {
          image: imageBase64
            ? { content: imageBase64 }
            : { source: { imageUri: imageUrl } },
          features: [
            { type: "LABEL_DETECTION", maxResults: 20 },
            { type: "OBJECT_LOCALIZATION", maxResults: 10 },
            { type: "IMAGE_PROPERTIES" },
          ],
        },
      ],
    };

    const visionRes = await axios.post(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      visionReq
    );

    const response = visionRes.data.responses?.[0] || {};
    const annotations = response.labelAnnotations || [];
    const objectAnnotations: Array<{ name: string; score: number }> =
      response.localizedObjectAnnotations || [];
    const dominantColors: Array<{ color: { red: number; green: number; blue: number }; pixelFraction: number }> =
      response.imagePropertiesAnnotation?.dominantColors?.colors || [];

    const labels: VisionLabel[] = annotations.map((l: any) => ({
      description: l.description,
      score: l.score,
    }));

    // Log all GCV signals so misclassifications are diagnosable in server logs
    console.log("[classify] labels:", labels.slice(0, 8).map(l => `${l.description}(${l.score.toFixed(2)})`).join(", "));
    console.log("[classify] objects:", objectAnnotations.slice(0, 5).map(o => `${o.name}(${o.score.toFixed(2)})`).join(", "));

    let matched: GarmentMapping | null = null;
    let modelConfidence = 0;

    // Pass 1: try to match from LABEL_DETECTION results
    for (const l of labels) {
      if (l.score > modelConfidence) {
        modelConfidence = l.score;
      }
      const mapping = GARMENT_LABEL_MAP[l.description];
      if (mapping && l.score >= CONF_THRESHOLD) {
        matched = mapping;
        modelConfidence = l.score;
        break;
      }
    }

    // Pass 2: if labels gave no match, try OBJECT_LOCALIZATION.
    // Object localization is often better at naming specific garment/shoe types
    // in photos with mixed backgrounds (e.g. "Boot" inside a scene with textiles).
    if (!matched) {
      for (const obj of objectAnnotations) {
        const mapping = GARMENT_LABEL_MAP[obj.name];
        if (mapping && obj.score >= CONF_THRESHOLD) {
          matched = mapping;
          modelConfidence = obj.score;
          console.log(`[classify] matched via object localization: ${obj.name} (${obj.score.toFixed(2)})`);
          break;
        }
      }
    }

    // Refine: if a hood is detected alongside a jacket, it's a hoodie (maps to jacket subType with hoodie display name)
    const labelSet = new Set([
      ...labels.map((l) => l.description),
      ...objectAnnotations.map((o) => o.name),
    ]);
    if (labelSet.has("Hood") || labelSet.has("Hoodie") || labelSet.has("Drawstring")) {
      if (!matched || matched.subType === "jacket" || matched.subType === "sweater") {
        matched = { category: "outerwear", subType: "hoodie", displayName: "Hoodie" };
      }
    }

    // Refine: if a collar is detected on a basic top, it's a polo shirt
    if (labelSet.has("Collar")) {
      if (matched?.subType === "t-shirt" || matched?.subType === "long-sleeve" || matched?.subType === "sweater") {
        matched = { category: "top", subType: "polo-shirt", displayName: "Polo shirt" };
      }
    }

    // Refine: "High-heeled shoe" + Leather + Strap → heeled ankle boots.
    // GCV labels block-heel ankle boots as "High-heeled shoe" because they detect the heel.
    // However, pure heels (pumps, stilettos) almost never produce a "Strap" label — that
    // signal is characteristic of the zipper pull or ankle strap on boots.
    if (matched?.subType === "heels" && labelSet.has("Strap") && labelSet.has("Leather")) {
      matched = { category: "shoes", subType: "boots", displayName: "Ankle boots" };
    }

    // Use IMAGE_PROPERTIES (pixel-level analysis) as primary color source.
    // Footwear and bags are frequently photographed on coloured surfaces (blankets, floors),
    // so we apply neutral preference to skip past background hues and find the item colour.
    // Clothing items fill the frame once near-white backgrounds are filtered, so we trust
    // the most dominant pixel directly — neutral preference would wrongly pick up shadow creases.
    // When matched is null (unrecognised item), default to neutral preference ON — safest fallback.
    const isOnColoredSurface = matched
      ? matched.category === 'shoes' || matched.category === 'bag'
      : true;
    let colorFamily: string | null = dominantColorFamily(dominantColors, isOnColoredSurface);

    // Secondary: if pixel analysis returned nothing, try explicit color labels from GCV.
    // These can be useful when the image is solid-colored and IMAGE_PROPERTIES is sparse.
    if (!colorFamily) {
      for (const l of labels) {
        const mappedColor = COLOR_LABEL_MAP[l.description];
        if (mappedColor) {
          colorFamily = mappedColor;
          break;
        }
      }
    }

    // Accent color: second-most-dominant pixel family (ignoring near-white and
    // near-black that are almost always background / shadow). Used by prints,
    // color-block garments, and scoring for two-tone harmony checks.
    let accentColor: string | undefined;
    const accentSorted = [...dominantColors].sort((a, b) => b.pixelFraction - a.pixelFraction);
    for (const entry of accentSorted.slice(0, 8)) {
      const { red: r, green: g, blue: b } = entry.color;
      const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
      if (lightness > 0.90) continue;
      const fam = rgbToColorFamily(r, g, b);
      if (fam && fam !== colorFamily) { accentColor = fam; break; }
    }
    if (!accentColor) {
      for (const l of labels) {
        const mappedColor = COLOR_LABEL_MAP[l.description];
        if (mappedColor && mappedColor !== colorFamily) { accentColor = mappedColor; break; }
      }
    }

    if (userId) {
      console.log(`Classified garment for user ${userId}: ${matched?.subType ?? "unknown"}`);
    }

    const category = matched?.category ?? null;
    const subType = matched?.subType ?? null;
    const displayName = matched?.displayName ?? "Clothing item";
    const description = buildDescription(displayName, colorFamily);
    const occasionTags = inferOccasions(subType, displayName);

    // ── Pattern / fabric inference from labels (optional signals) ─────────────
    // These are best-effort. The client still lets the user correct them.
    let pattern: string | undefined;
    let patternScale: string | undefined;
    if (labelSet.has("Stripe") || labelSet.has("Pinstripe")) { pattern = "stripe"; }
    else if (labelSet.has("Plaid") || labelSet.has("Tartan") || labelSet.has("Check") || labelSet.has("Gingham")) { pattern = "check"; }
    else if (labelSet.has("Floral design") || labelSet.has("Floral")) { pattern = "floral"; patternScale = "medium"; }
    else if (labelSet.has("Polka dot") || labelSet.has("Pattern")) { pattern = "print"; }
    else if (labelSet.has("Animal print") || labelSet.has("Leopard") || labelSet.has("Zebra")) { pattern = "animal"; patternScale = "large"; }

    let fabric: string | undefined;
    if (labelSet.has("Denim") || labelSet.has("Jeans")) fabric = "denim";
    else if (labelSet.has("Leather")) fabric = "leather";
    else if (labelSet.has("Satin")) fabric = "satin";
    else if (labelSet.has("Silk")) fabric = "silk";
    else if (labelSet.has("Wool") || labelSet.has("Tweed")) fabric = "wool";
    else if (labelSet.has("Linen")) fabric = "linen";
    else if (labelSet.has("Cashmere")) fabric = "cashmere";
    else if (labelSet.has("Knit") || labelSet.has("Knitting")) fabric = "knit";
    else if (labelSet.has("Cotton")) fabric = "cotton";

    // Perceived fabric weight — derived from the inferred fabric so the
    // wardrobe item carries a default chip selection on creation. Users can
    // still override on the Add Item screen. Heavy = wool / cashmere / leather
    // / synthetic puffer fabrics; light = silk / satin / linen / chiffon;
    // everything else (denim, knit, cotton) reads mid.
    let weight: "light" | "mid" | "heavy" | undefined;
    if (fabric === "wool" || fabric === "cashmere" || fabric === "leather") weight = "heavy";
    else if (fabric === "silk" || fabric === "satin" || fabric === "linen") weight = "light";
    else if (fabric) weight = "mid";

    // Perceptual colour signals — derive HSL + Lab from the actual garment
    // pixel that won the family vote. Lets the outfit scorer reason about
    // undertone temperature, value spread, and saturation dominance — the
    // things a real stylist actually thinks about.
    let dominantHsl: { h: number; s: number; l: number } | undefined;
    let dominantLab: { L: number; a: number; b: number } | undefined;
    if (colorFamily) {
      const garmentRgb = dominantGarmentRgb(dominantColors, colorFamily, isOnColoredSurface);
      if (garmentRgb) {
        dominantHsl = rgbToHsl(garmentRgb.red, garmentRgb.green, garmentRgb.blue);
        dominantLab = rgbToLab(garmentRgb.red, garmentRgb.green, garmentRgb.blue);
      }
    }

    return res.json({
      category,
      subType,
      colorFamily,
      accentColor,
      description,
      occasionTags,
      pattern,
      patternScale,
      fabric,
      weight,
      dominantHsl,
      dominantLab,
      modelConfidence,
      rawLabels: labels.slice(0, 5),
      rawObjects: objectAnnotations.slice(0, 5),
      source: matched ? "gcv" : "fallback",
    });
  } catch (err: any) {
    console.error("Vision error", err.response?.data || err.message);
    return res.status(500).json({ error: "classification_failed" });
  }
}
