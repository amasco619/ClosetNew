const WARDROBE_VALUE_LABELS: Record<string, string> = {
  gray: 'Grey',
  grey: 'Grey',
  jewelry: 'Jewellery',
  'jewelry & accessories': 'Jewellery & accessories',
};

export function wardrobeValueLabel(value: string): string {
  return WARDROBE_VALUE_LABELS[value.toLowerCase()] ?? value;
}

export function wardrobeCategoryLabel(category: string, subType?: string): string {
  if (category === 'jewelry' && subType === 'stole') return 'Textile accessory';
  return wardrobeValueLabel(category);
}