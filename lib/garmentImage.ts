const LIGHT_GARMENT_FAMILIES = new Set(['white', 'cream', 'beige']);

/** Prefer the persisted Storage path; signed URLs may include query strings. */
export function isTransparentGarmentImage(photoUri?: string | null, storagePath?: string | null): boolean {
  const source = storagePath || photoUri || '';
  return source.split(/[?#]/, 1)[0].toLowerCase().endsWith('.png');
}

export function isLightGarmentFamily(colorFamily?: string | null): boolean {
  return LIGHT_GARMENT_FAMILIES.has((colorFamily ?? '').toLowerCase());
}
