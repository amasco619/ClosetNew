/**
 * Executes the re-photograph save path:
 *   1. Adds the new item unconditionally.
 *   2. Removes the old (orphan) item only when replaceItemId is provided and non-empty.
 *
 * Generic over the item type so it works with addWardrobeItem's
 * Omit<WardrobeItem, 'createdAt'> & { id?: string } signature as well as
 * full WardrobeItem objects used in tests.
 *
 * Extracted as a pure, asset-free utility so the branching logic can be
 * imported both by app/add-item.tsx (production) and __tests__ (verification).
 * Any regression in this function is therefore caught by the tests.
 */
export function applyRePhotographSave<T>(
  addItem: (item: T) => void,
  removeItem: (id: string) => void,
  item: T,
  replaceItemId?: string,
): void {
  addItem(item);
  if (replaceItemId) {
    removeItem(replaceItemId);
  }
}
