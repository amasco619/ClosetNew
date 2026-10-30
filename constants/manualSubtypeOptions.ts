import type { ItemCategory } from './types';

export const MANUAL_ONLY_SUBTYPES: Partial<Record<ItemCategory, readonly string[]>> = {
  jewelry: ['gyale', 'kallabi', 'mayafi', 'hijab'],
};

export function manualSubtypeOptions(category: ItemCategory, existing: readonly string[]): string[] {
  return [...new Set([...existing, ...(MANUAL_ONLY_SUBTYPES[category] ?? [])])];
}
