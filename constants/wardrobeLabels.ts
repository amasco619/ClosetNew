export function wardrobeCategoryLabel(category: string, subType?: string): string {
  if (category === 'jewelry' && subType === 'stole') return 'Textile accessory';
  return category === 'jewelry' ? 'Jewelry' : category;
}