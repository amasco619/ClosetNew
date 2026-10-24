import type { OutfitSet } from '@/constants/types';

export function filterLastAddedSuggestions(
  suggestions: OutfitSet[],
  wardrobeItemIds: ReadonlySet<string>,
): OutfitSet[] {
  const anchorId = suggestions[0]?.heroId;
  if (!anchorId || !wardrobeItemIds.has(anchorId)) return [];

  return suggestions.filter(suggestion =>
    suggestion.heroId === anchorId &&
    suggestion.components.every(component =>
      !component.owned || (!!component.matchedItemId && wardrobeItemIds.has(component.matchedItemId)),
    ),
  );
}
