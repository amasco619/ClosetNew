const WARDROBE_VALUE_LABELS: Record<string, string> = {
  gray: 'Grey',
  grey: 'Grey',
  jewelry: 'Jewellery',
  'jewelry & accessories': 'Jewellery & accessories',
};

export function wardrobeValueLabel(value: string): string {
  return WARDROBE_VALUE_LABELS[value.toLowerCase()] ?? value;
}

export function wardrobeItemDisplayName(colorFamily: string, subType: string): string {
  const subtype = subType
    .split('-')
    .map((part, index) => index === 0
      ? part.charAt(0).toUpperCase() + part.slice(1)
      : part.toLowerCase())
    .join('-');
  return `${wardrobeValueLabel(colorFamily)} ${subtype}`;
}

export function wardrobeCategoryLabel(category: string, subType?: string): string {
  if (category === 'jewelry' && subType === 'stole') return 'Textile accessory';
  return wardrobeValueLabel(category);
}