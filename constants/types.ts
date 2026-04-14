export type BodyType = 'hourglass' | 'pear' | 'apple' | 'rectangle' | 'inverted-triangle' | 'athletic';
export type EyeColor = 'dark-brown' | 'light-brown' | 'hazel' | 'green' | 'blue' | 'grey';
export type SkinTone = 'very-light' | 'light' | 'medium-light' | 'medium' | 'medium-dark' | 'dark' | 'very-dark';
export type Undertone = 'cool' | 'neutral' | 'warm';
export type StyleGoal = 'youthful' | 'elevated' | 'minimal' | 'romantic' | 'bold' | 'classic';
export type ItemCategory = 'top' | 'bottom' | 'dress' | 'outerwear' | 'shoes' | 'bag' | 'jewelry';
export type OccasionTag = 'work' | 'date' | 'casual' | 'event' | 'interview' | 'wedding' | 'travel';
export type SeasonTag = 'winter' | 'summer' | 'spring' | 'fall' | 'all-season';

export interface Constraints {
  noSleeveless: boolean;
  noShortSkirts: boolean;
  maxHeelHeight: 'any' | 'low' | 'medium' | 'flat';
}

export interface UserProfile {
  name: string;
  bodyType: BodyType | null;
  eyeColor: EyeColor | null;
  skinTone: SkinTone | null;
  undertone: Undertone | null;
  styleGoalPrimary: StyleGoal | null;
  styleGoalSecondary: StyleGoal | null;
  lifestyleWork: number;
  lifestyleCasual: number;
  lifestyleEvents: number;
  constraints: Constraints;
  onboardingComplete: boolean;
}

export interface WardrobeItem {
  id: string;
  photoUri: string;
  category: ItemCategory;
  subType: string;
  colorFamily: string;
  description?: string;
  occasionTags: OccasionTag[];
  seasonTags: SeasonTag[];
  formalityLevel: number;
  createdAt: string;
}

export interface OutfitComponent {
  category: ItemCategory;
  subType: string;
  colorFamily: string;
  owned: boolean;
  matchedItemId?: string;
  photoUri?: string;
}

export interface OutfitSet {
  id: string;
  scenario: OccasionTag;
  components: OutfitComponent[];
}

export interface WearEntry {
  id: string;
  date: string;              // YYYY-MM-DD
  occasion: OccasionTag;
  outfitFingerprint: string; // sorted matched item IDs joined by '|'
  itemIds: string[];         // wardrobe item IDs worn
  loggedAt: string;          // ISO timestamp
}
