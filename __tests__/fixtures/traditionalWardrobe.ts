import type { GarmentGroup, UserProfile, WardrobeItem } from '../../constants/types';

export const traditionalProfile: UserProfile = {
  name: 'Styling fixture', bodyType: null, eyeColor: null, skinTone: null, undertone: null,
  styleGoalPrimary: 'classic', styleGoalSecondary: null,
  lifestyleWork: 3, lifestyleCasual: 4, lifestyleEvents: 3, lifestyleActive: 1, lifestyleBrunch: 2,
  constraints: { noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'any' },
  onboardingComplete: true, weatherEnabled: false, isGuest: false,
};

const piece = (id: string, category: WardrobeItem['category'], subType: string, colorFamily: string,
  formalityLevel: number, extra: Partial<WardrobeItem> = {}): WardrobeItem => ({
  id, category, subType, colorFamily, formalityLevel, photoUri: `test://wardrobe-${id}`,
  createdAt: '2026-01-01T00:00:00Z', seasonTags: [], occasionTags: [],
  fit: 'regular', ...extra,
});

// Real canonical shapes with different valid core choices; no frozen benchmark.
export const traditionalWardrobe: WardrobeItem[] = [
  piece('buba', 'top', 'buba', 'blue', 8, { fabric: 'lace', pattern: 'wax-print', patternScale: 'medium', confirmedFields: ['subType', 'formalityLevel'] }),
  piece('iro', 'bottom', 'iro', 'blue', 8, { fabric: 'lace', pattern: 'wax-print', patternScale: 'medium', confirmedFields: ['subType', 'formalityLevel'] }),
  piece('western-top', 'top', 'blouse', 'cream', 5, { fabric: 'silk' }),
  piece('western-bottom', 'bottom', 'jeans', 'blue', 3, { fabric: 'denim' }),
  piece('western-dress', 'dress', 'cocktail-dress', 'burgundy', 7, { fabric: 'silk' }),
  piece('heels', 'shoes', 'heels', 'black', 7, { fabric: 'leather' }),
  piece('clutch', 'bag', 'clutch', 'gold', 7),
  piece('sneakers', 'shoes', 'sneakers', 'white', 3),
  piece('day-bag', 'bag', 'shoulder-bag', 'cream', 4),
];

export const traditionalGroups: GarmentGroup[] = [{
  id: 'confirmed-set', userId: 'fixture-owner', relationshipType: 'coordinated_set',
  confirmationStatus: 'user_confirmed', sharedAttributes: { pattern: 'wax-print' },
  members: ['buba', 'iro'].map(garmentId => ({
    userId: 'fixture-owner', groupId: 'confirmed-set', garmentId, createdAt: '2026-01-01T00:00:00Z',
  })),
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}];
