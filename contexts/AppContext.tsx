import { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { WardrobeSlot, initializeSlots, updateSlotsAfterAdd, getFirstNeededByCategory, getProfileBlueprint } from '@/constants/wardrobeBlueprint';
import { BodyType, EyeColor, SkinTone, Undertone, StyleGoal, ItemCategory, OccasionTag, SeasonTag, Constraints, UserProfile } from '@/constants/types';

export type { BodyType, EyeColor, SkinTone, Undertone, StyleGoal, ItemCategory, OccasionTag, SeasonTag, Constraints, UserProfile } from '@/constants/types';

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
}

export interface OutfitSet {
  id: string;
  scenario: OccasionTag;
  components: OutfitComponent[];
}

interface AppContextValue {
  profile: UserProfile;
  updateProfile: (updates: Partial<UserProfile>) => void;
  wardrobeItems: WardrobeItem[];
  addWardrobeItem: (item: Omit<WardrobeItem, 'id' | 'createdAt'>) => void;
  removeWardrobeItem: (id: string) => void;
  isPremium: boolean;
  togglePremium: () => void;
  outfitSets: OutfitSet[];
  isLoading: boolean;
  canAddItem: boolean;
  recommendationSlots: WardrobeSlot[];
  starterRecommendations: Record<string, WardrobeSlot | undefined>;
}

const defaultProfile: UserProfile = {
  name: '',
  bodyType: null,
  eyeColor: null,
  skinTone: null,
  undertone: null,
  styleGoalPrimary: null,
  styleGoalSecondary: null,
  lifestyleWork: 40,
  lifestyleCasual: 40,
  lifestyleEvents: 20,
  constraints: {
    noSleeveless: false,
    noShortSkirts: false,
    maxHeelHeight: 'any',
  },
  onboardingComplete: false,
};

const FREE_ITEM_CAP = 30;

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEYS = {
  profile: '@auracloset_profile',
  wardrobe: '@auracloset_wardrobe',
  premium: '@auracloset_premium',
  slots: '@auracloset_slots',
};

const subTypes: Record<ItemCategory, string[]> = {
  top: ['t-shirt', 'long-sleeve', 'polo-shirt', 'henley', 'rugby-shirt', 'shirt', 'blouse', 'sweater', 'turtleneck', 'tank-top', 'crop-top', 'cardigan'],
  bottom: ['jeans', 'trousers', 'chinos', 'wide-leg', 'joggers', 'shorts', 'leggings', 'mini-skirt', 'midi-skirt', 'maxi-skirt'],
  dress: ['mini-dress', 'midi-dress', 'maxi-dress', 'wrap-dress', 'shirt-dress', 'cocktail-dress'],
  outerwear: ['jacket', 'hoodie', 'blazer', 'coat', 'peacoat', 'trench', 'raincoat', 'puffer', 'vest', 'denim-jacket', 'bomber-jacket', 'leather-jacket'],
  shoes: ['sneakers', 'heels', 'flats', 'boots', 'sandals', 'loafers', 'mules'],
  bag: ['tote', 'crossbody', 'clutch', 'backpack', 'shoulder-bag', 'mini-bag'],
  jewelry: ['necklace', 'earrings', 'bracelet', 'ring', 'watch', 'brooch'],
};

const colorFamilies = ['black', 'white', 'navy', 'beige', 'grey', 'brown', 'red', 'pink', 'blue', 'green', 'burgundy', 'cream', 'olive', 'camel', 'lavender', 'coral'];

function generateOutfitSets(items: WardrobeItem[], profile: UserProfile): OutfitSet[] {
  const scenarios: OccasionTag[] = ['work', 'casual', 'date', 'event'];
  const sets: OutfitSet[] = [];

  const outfitTemplates: Record<OccasionTag, OutfitComponent[][]> = {
    work: [
      [
        { category: 'top', subType: 'blouse', colorFamily: 'white', owned: false },
        { category: 'bottom', subType: 'trousers', colorFamily: 'navy', owned: false },
        { category: 'shoes', subType: 'loafers', colorFamily: 'black', owned: false },
        { category: 'bag', subType: 'tote', colorFamily: 'camel', owned: false },
        { category: 'jewelry', subType: 'watch', colorFamily: 'gold', owned: false },
      ],
      [
        { category: 'top', subType: 'shirt', colorFamily: 'blue', owned: false },
        { category: 'bottom', subType: 'chinos', colorFamily: 'beige', owned: false },
        { category: 'outerwear', subType: 'blazer', colorFamily: 'navy', owned: false },
        { category: 'shoes', subType: 'flats', colorFamily: 'black', owned: false },
        { category: 'jewelry', subType: 'earrings', colorFamily: 'gold', owned: false },
      ],
      [
        { category: 'dress', subType: 'shirt-dress', colorFamily: 'navy', owned: false },
        { category: 'shoes', subType: 'heels', colorFamily: 'beige', owned: false },
        { category: 'bag', subType: 'shoulder-bag', colorFamily: 'brown', owned: false },
        { category: 'jewelry', subType: 'necklace', colorFamily: 'gold', owned: false },
      ],
    ],
    casual: [
      [
        { category: 'top', subType: 't-shirt', colorFamily: 'white', owned: false },
        { category: 'bottom', subType: 'jeans', colorFamily: 'blue', owned: false },
        { category: 'shoes', subType: 'sneakers', colorFamily: 'white', owned: false },
        { category: 'bag', subType: 'crossbody', colorFamily: 'brown', owned: false },
      ],
      [
        { category: 'top', subType: 'sweater', colorFamily: 'cream', owned: false },
        { category: 'bottom', subType: 'jeans', colorFamily: 'black', owned: false },
        { category: 'shoes', subType: 'boots', colorFamily: 'brown', owned: false },
        { category: 'jewelry', subType: 'bracelet', colorFamily: 'gold', owned: false },
      ],
    ],
    date: [
      [
        { category: 'dress', subType: 'midi-dress', colorFamily: 'burgundy', owned: false },
        { category: 'shoes', subType: 'heels', colorFamily: 'black', owned: false },
        { category: 'bag', subType: 'clutch', colorFamily: 'gold', owned: false },
        { category: 'jewelry', subType: 'earrings', colorFamily: 'gold', owned: false },
        { category: 'jewelry', subType: 'necklace', colorFamily: 'gold', owned: false },
      ],
      [
        { category: 'top', subType: 'blouse', colorFamily: 'pink', owned: false },
        { category: 'bottom', subType: 'skirt', colorFamily: 'black', owned: false },
        { category: 'shoes', subType: 'heels', colorFamily: 'beige', owned: false },
        { category: 'jewelry', subType: 'bracelet', colorFamily: 'silver', owned: false },
      ],
    ],
    event: [
      [
        { category: 'dress', subType: 'cocktail-dress', colorFamily: 'black', owned: false },
        { category: 'shoes', subType: 'heels', colorFamily: 'gold', owned: false },
        { category: 'bag', subType: 'clutch', colorFamily: 'black', owned: false },
        { category: 'jewelry', subType: 'earrings', colorFamily: 'silver', owned: false },
        { category: 'jewelry', subType: 'necklace', colorFamily: 'silver', owned: false },
      ],
      [
        { category: 'top', subType: 'blouse', colorFamily: 'cream', owned: false },
        { category: 'bottom', subType: 'wide-leg', colorFamily: 'black', owned: false },
        { category: 'outerwear', subType: 'blazer', colorFamily: 'black', owned: false },
        { category: 'shoes', subType: 'mules', colorFamily: 'gold', owned: false },
        { category: 'jewelry', subType: 'ring', colorFamily: 'gold', owned: false },
      ],
    ],
  };

  for (const scenario of scenarios) {
    const templates = outfitTemplates[scenario];
    for (let i = 0; i < templates.length; i++) {
      const components = templates[i].map(comp => {
        if (profile.constraints.noSleeveless && comp.subType === 'tank-top') {
          return { ...comp, subType: 'blouse' };
        }
        if (profile.constraints.noShortSkirts && comp.subType === 'mini-dress') {
          return { ...comp, subType: 'midi-dress' };
        }
        if (profile.constraints.maxHeelHeight === 'flat' && comp.subType === 'heels') {
          return { ...comp, subType: 'flats' };
        }

        const match = items.find(
          item => item.category === comp.category && (item.subType === comp.subType || item.colorFamily === comp.colorFamily)
        );
        if (match) {
          return { ...comp, owned: true, matchedItemId: match.id };
        }
        return comp;
      });

      sets.push({
        id: `${scenario}-${i}`,
        scenario,
        components,
      });
    }
  }

  return sets;
}

export { subTypes, colorFamilies };
export type { WardrobeSlot } from '@/constants/wardrobeBlueprint';

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>([]);
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [recommendationSlots, setRecommendationSlots] = useState<WardrobeSlot[]>([]);
  const [slotsInitialized, setSlotsInitialized] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const profileBlueprintKey = `${profile.styleGoalPrimary || ''}-${profile.styleGoalSecondary || ''}-${profile.bodyType || ''}-${profile.lifestyleWork}-${profile.lifestyleCasual}-${profile.lifestyleEvents}-${profile.constraints.noSleeveless}-${profile.constraints.noShortSkirts}-${profile.constraints.maxHeelHeight}`;

  useEffect(() => {
    if (!isLoading && !slotsInitialized) {
      const blueprint = getProfileBlueprint(profile);
      const slots = initializeSlots(wardrobeItems, blueprint);
      setRecommendationSlots(slots);
      setSlotsInitialized(true);
      AsyncStorage.setItem(STORAGE_KEYS.slots, JSON.stringify(
        slots.map(s => ({ id: s.id, status: s.status, matchedItemId: s.matchedItemId }))
      ));
    }
  }, [isLoading, slotsInitialized, wardrobeItems]);

  useEffect(() => {
    if (slotsInitialized) {
      const blueprint = getProfileBlueprint(profile);
      const slots = initializeSlots(wardrobeItems, blueprint);
      setRecommendationSlots(slots);
      AsyncStorage.setItem(STORAGE_KEYS.slots, JSON.stringify(
        slots.map(s => ({ id: s.id, status: s.status, matchedItemId: s.matchedItemId }))
      ));
    }
  }, [profileBlueprintKey]);

  const loadData = async () => {
    try {
      const [profileData, wardrobeData, premiumData, slotsData] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.profile),
        AsyncStorage.getItem(STORAGE_KEYS.wardrobe),
        AsyncStorage.getItem(STORAGE_KEYS.premium),
        AsyncStorage.getItem(STORAGE_KEYS.slots),
      ]);
      if (profileData) setProfile(JSON.parse(profileData));
      const loadedItems = wardrobeData ? JSON.parse(wardrobeData) : [];
      if (wardrobeData) setWardrobeItems(loadedItems);
      if (premiumData) setIsPremium(JSON.parse(premiumData));
      if (slotsData) {
        const savedStatuses: { id: string; status: 'needed' | 'owned'; matchedItemId?: string }[] = JSON.parse(slotsData);
        const loadedProfile = profileData ? JSON.parse(profileData) : defaultProfile;
        const blueprint = getProfileBlueprint(loadedProfile);
        const fullSlots = initializeSlots(loadedItems, blueprint);
        const merged = fullSlots.map(slot => {
          const saved = savedStatuses.find(s => s.id === slot.id);
          if (saved) {
            return { ...slot, status: saved.status, matchedItemId: saved.matchedItemId };
          }
          return slot;
        });
        setRecommendationSlots(merged);
        setSlotsInitialized(true);
      }
    } catch (e) {
      console.error('Failed to load data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfile(prev => {
      const updated = { ...prev, ...updates };
      AsyncStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const addWardrobeItem = useCallback((item: Omit<WardrobeItem, 'id' | 'createdAt'>) => {
    const newItem: WardrobeItem = {
      ...item,
      id: Crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    setWardrobeItems(prev => {
      const updated = [...prev, newItem];
      AsyncStorage.setItem(STORAGE_KEYS.wardrobe, JSON.stringify(updated));
      return updated;
    });
    setRecommendationSlots(prev => {
      const updated = updateSlotsAfterAdd(prev, newItem);
      AsyncStorage.setItem(STORAGE_KEYS.slots, JSON.stringify(
        updated.map(s => ({ id: s.id, status: s.status, matchedItemId: s.matchedItemId }))
      ));
      return updated;
    });
  }, []);

  const removeWardrobeItem = useCallback((id: string) => {
    setWardrobeItems(prev => {
      const updated = prev.filter(item => item.id !== id);
      AsyncStorage.setItem(STORAGE_KEYS.wardrobe, JSON.stringify(updated));
      const blueprint = getProfileBlueprint(profile);
      const refreshedSlots = initializeSlots(updated, blueprint);
      setRecommendationSlots(refreshedSlots);
      AsyncStorage.setItem(STORAGE_KEYS.slots, JSON.stringify(
        refreshedSlots.map(s => ({ id: s.id, status: s.status, matchedItemId: s.matchedItemId }))
      ));
      return updated;
    });
  }, [profile]);

  const togglePremium = useCallback(() => {
    setIsPremium(prev => {
      const updated = !prev;
      AsyncStorage.setItem(STORAGE_KEYS.premium, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const outfitSets = useMemo(() => generateOutfitSets(wardrobeItems, profile), [wardrobeItems, profile]);
  const canAddItem = isPremium || wardrobeItems.length < FREE_ITEM_CAP;
  const starterRecommendations = useMemo(() => getFirstNeededByCategory(recommendationSlots), [recommendationSlots]);

  const value = useMemo(() => ({
    profile,
    updateProfile,
    wardrobeItems,
    addWardrobeItem,
    removeWardrobeItem,
    isPremium,
    togglePremium,
    outfitSets,
    isLoading,
    canAddItem,
    recommendationSlots,
    starterRecommendations,
  }), [profile, updateProfile, wardrobeItems, addWardrobeItem, removeWardrobeItem, isPremium, togglePremium, outfitSets, isLoading, canAddItem, recommendationSlots, starterRecommendations]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
