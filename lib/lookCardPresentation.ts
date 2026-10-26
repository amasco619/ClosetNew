import type { OutfitComponent, OutfitSet } from '../constants/types';
import { wardrobeValueLabel } from '../constants/wardrobeLabels';

const ONE_PIECE_SUBTYPES = new Set([
  'dress', 'gown', 'kaftan', 'aso-ebi', 'iro-and-buba', 'boubou',
]);
const HEADWEAR_SUBTYPES = new Set([
  'gele', 'headwrap', 'head-scarf', 'headscarf', 'stole', 'hat', 'sunhat', 'cap',
]);
export function isHeadwearSubtype(subType: string): boolean {
  return HEADWEAR_SUBTYPES.has(subType.toLowerCase());
}
const COLOUR_WORDS = [
  'cream', 'beige', 'camel', 'brown', 'olive', 'navy', 'black', 'white', 'grey',
  'burgundy', 'red', 'pink', 'blush', 'coral', 'orange', 'yellow', 'mustard',
  'green', 'emerald', 'blue', 'lavender', 'purple', 'rose', 'terracotta', 'gold',
  'peach', 'gray',
];
const COLOUR_WORD_SET = new Set(COLOUR_WORDS);

export function isOnePieceComponent(component: OutfitComponent): boolean {
  return component.category === 'dress' || ONE_PIECE_SUBTYPES.has(component.subType.toLowerCase());
}

export function onePieceLayoutComponents(components: OutfitComponent[]) {
  return {
    dress: components.find(isOnePieceComponent),
    shoes: components.find(component => component.category === 'shoes'),
    layer: components.find(component => component.category === 'outerwear'),
  };
}

export function lookAccessoryComponents(components: OutfitComponent[]): OutfitComponent[] {
  return components.filter(component =>
    component.category === 'bag' ||
    component.category === 'jewelry' ||
    isHeadwearSubtype(component.subType),
  );
}

export function visibleLookAccessories(components: OutfitComponent[]): OutfitComponent[] {
  return lookAccessoryComponents(components).slice(0, 4);
}

export function lookAccessoryOverflow(components: OutfitComponent[]): number {
  return Math.max(0, lookAccessoryComponents(components).length - 4);
}

export function accessoryDisplayLabel(subType: string): string {
  const words = subType
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(word => word && !COLOUR_WORD_SET.has(word.toLowerCase()));
  if (words.length === 0) return 'Accessory';
  return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export function getLookRationale(outfit: OutfitSet): string {
  const rationale = outfit.rationale ?? '';
  const hero = outfit.components.find(component => component.matchedItemId === outfit.heroId);
  if (!rationale) return rationale;

  const variants = new Set(COLOUR_WORDS);
  if (hero) {
    variants.add(hero.colorFamily.replace(/-/g, ' ').toLowerCase());
    variants.add(wardrobeValueLabel(hero.colorFamily).replace(/-/g, ' ').toLowerCase());
  }
  if (variants.has('gray') || variants.has('grey')) {
    variants.add('gray');
    variants.add('grey');
  }

  for (const colour of variants) {
    const escaped = colour.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const withoutHeroColour = rationale.replace(
      new RegExp(`(built around your )${escaped}\\s+`, 'i'),
      '$1',
    );
    if (withoutHeroColour !== rationale) return withoutHeroColour;
  }
  return rationale;
}
