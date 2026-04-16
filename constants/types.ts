export type BodyType = 'hourglass' | 'pear' | 'apple' | 'rectangle' | 'inverted-triangle' | 'athletic';
export type EyeColor = 'dark-brown' | 'light-brown' | 'hazel' | 'green' | 'blue' | 'grey';
export type SkinTone = 'very-light' | 'light' | 'medium-light' | 'medium' | 'medium-dark' | 'dark' | 'very-dark';
export type Undertone = 'cool' | 'neutral' | 'warm';
export type StyleGoal = 'youthful' | 'elevated' | 'minimal' | 'romantic' | 'bold' | 'classic';
export type ItemCategory = 'top' | 'bottom' | 'dress' | 'outerwear' | 'shoes' | 'bag' | 'jewelry';
export type OccasionTag = 'work' | 'date' | 'casual' | 'event' | 'interview' | 'wedding' | 'travel';
export type SeasonTag = 'winter' | 'summer' | 'spring' | 'fall' | 'all-season';

// ─── Sophisticated stylist signals (all optional for backward compatibility) ─────
export type HairColor = 'black' | 'dark-brown' | 'medium-brown' | 'light-brown' | 'blonde' | 'red' | 'grey' | 'silver';
export type HeightBand = 'petite' | 'average' | 'tall';
export type ContrastLevel = 'high' | 'medium' | 'low';
export type MoodGoal = 'confident' | 'soft' | 'joyful' | 'grounded' | 'romantic' | 'powerful';
export type LifePhase = 'none' | 'pregnancy' | 'postpartum' | 'weight-flux' | 'feeling-off';
export type MetalPreference = 'gold' | 'silver' | 'rose-gold' | 'mixed';

export type Pattern = 'solid' | 'stripe' | 'floral' | 'check' | 'print' | 'color-block' | 'geometric' | 'animal';
export type PatternScale = 'small' | 'medium' | 'large';
export type Fabric = 'cotton' | 'silk' | 'denim' | 'wool' | 'linen' | 'synthetic' | 'leather' | 'knit' | 'satin' | 'cashmere';
export type Fit = 'slim' | 'regular' | 'loose' | 'oversized' | 'tailored';
export type Neckline = 'crew' | 'v-neck' | 'scoop' | 'turtleneck' | 'boat' | 'square' | 'halter' | 'off-shoulder' | 'collared';
export type SleeveLength = 'sleeveless' | 'short' | 'three-quarter' | 'long';
export type Rise = 'low' | 'mid' | 'high';
export type WarmthBand = 'cold' | 'cool' | 'mild' | 'warm' | 'hot';
export type MetalTone = 'gold' | 'silver' | 'rose-gold' | 'mixed' | 'none';

export type ColorAversion = string; // e.g. 'yellow', 'orange', 'neon'

export interface Constraints {
  noSleeveless: boolean;
  noShortSkirts: boolean;
  maxHeelHeight: 'any' | 'low' | 'medium' | 'flat';
  colorAversions?: ColorAversion[];
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
  // Sophisticated stylist fields (optional)
  hairColor?: HairColor | null;
  heightBand?: HeightBand | null;
  contrastLevel?: ContrastLevel | null;
  metalPreference?: MetalPreference | null;
  lifePhase?: LifePhase | null;
  defaultMood?: MoodGoal | null;
  dismissedProfileNudge?: string; // YYYY-MM-DD
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
  purchasePrice?: number;
  createdAt: string;
  // Sophisticated stylist signals (all optional)
  pattern?: Pattern;
  patternScale?: PatternScale;
  fabric?: Fabric;
  fit?: Fit;
  metalTone?: MetalTone;       // for jewelry, buckles, hardware
  accentColor?: string;         // secondary color for prints/color-blocks
  mood?: MoodGoal[];            // moods this item naturally evokes
  neckline?: Neckline;         // tops / dresses
  sleeveLength?: SleeveLength; // tops / dresses / outerwear
  rise?: Rise;                 // bottoms
  warmthBand?: WarmthBand;     // how warm/cool this item feels to wear
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
  rationale?: string;           // Human-readable one-liner: why this works
  confidenceScore?: number;     // total score, for display/debugging
}

export interface WearEntry {
  id: string;
  date: string;              // YYYY-MM-DD
  occasion: OccasionTag;
  outfitFingerprint: string; // sorted matched item IDs joined by '|'
  itemIds: string[];         // wardrobe item IDs worn
  loggedAt: string;          // ISO timestamp
}

export type ReactionType = 'love' | 'not-today';

export interface OutfitReaction {
  id: string;
  outfitFingerprint: string;
  type: ReactionType;
  date: string;              // YYYY-MM-DD of reaction
  scenario: OccasionTag;
}

export interface MoodOfDay {
  date: string;              // YYYY-MM-DD
  mood: MoodGoal | null;     // null = user explicitly cleared mood for today
}

export interface SavedLook {
  id: string;                // RecommendedOutfitGroup.id (recipe id)
  customName?: string;       // user-provided rename; falls back to recipe label
  savedAt: string;           // ISO timestamp
}
