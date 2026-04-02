import { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { WardrobeSlot, initializeSlots, updateSlotsAfterAdd, getFirstNeededByCategory, getProfileBlueprint } from '@/constants/wardrobeBlueprint';
import { BodyType, EyeColor, SkinTone, Undertone, StyleGoal, ItemCategory, OccasionTag, SeasonTag, Constraints, UserProfile, WardrobeItem, OutfitComponent, OutfitSet } from '@/constants/types';
import { generatePersonalizedOutfits } from '@/constants/outfitGenerator';

export type { BodyType, EyeColor, SkinTone, Undertone, StyleGoal, ItemCategory, OccasionTag, SeasonTag, Constraints, UserProfile, WardrobeItem, OutfitComponent, OutfitSet } from '@/constants/types';

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

const FREE_ITEM_CAP = 10;

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

  const outfitSets = useMemo(() => generatePersonalizedOutfits(wardrobeItems, profile), [wardrobeItems, profile]);
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
