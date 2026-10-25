export interface AddedLooksPromptCopyInput {
  count: number;
  itemName?: string;
}

export function addedLooksPromptCopy({ count, itemName }: AddedLooksPromptCopyInput) {
  const single = count === 1;
  return {
    title: single ? `${itemName || 'Piece'} added` : `${count} pieces added`,
    message: single
      ? 'Saved to your wardrobe. We have a few ways to wear it.'
      : 'Saved to your wardrobe. We have a few ways to wear them.',
    action: single ? 'See looks with this piece' : 'See your looks',
    empty: single ? 'No looks yet with this piece.' : 'No looks yet with these pieces.',
  };
}
