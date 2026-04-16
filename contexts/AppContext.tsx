import { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { WardrobeSlot, initializeSlots, updateSlotsAfterAdd, getFirstNeededByCategory, getProfileBlueprint } from '@/constants/wardrobeBlueprint';
import {
  BodyType, EyeColor, SkinTone, Undertone, StyleGoal, ItemCategory, OccasionTag, SeasonTag,
  Constraints, UserProfile, WardrobeItem, OutfitComponent, OutfitSet, WearEntry,
  MoodGoal, OutfitReaction, ReactionType, MoodOfDay,
} from '@/constants/types';
import { generateOutfitsForItem } from '@/constants/outfitGenerator';
import {
  RotationState, INITIAL_ROTATION_STATE,
  generateOutfitPool, applyDailyRotation, computePoolHash, todayString,
} from '@/constants/outfitRotation';

export type {
  BodyType, EyeColor, SkinTone, Undertone, StyleGoal, ItemCategory, OccasionTag, SeasonTag,
  Constraints, UserProfile, WardrobeItem, OutfitComponent, OutfitSet, WearEntry,
  MoodGoal, OutfitReaction, ReactionType,
} from '@/constants/types';

interface AppContextValue {
  profile: UserProfile;
  updateProfile: (updates: Partial<UserProfile>) => void;
  wardrobeItems: WardrobeItem[];
  addWardrobeItem: (item: Omit<WardrobeItem, 'id' | 'createdAt'>) => void;
  removeWardrobeItem: (id: string) => void;
  updateWardrobeItem: (id: string, updates: Partial<Omit<WardrobeItem, 'id' | 'createdAt'>>) => void;
  isPremium: boolean;
  togglePremium: () => void;
  outfitSets: OutfitSet[];
  lastAddedSuggestions: OutfitSet[];
  clearLastAddedSuggestions: () => void;
  isLoading: boolean;
  canAddItem: boolean;
  recommendationSlots: WardrobeSlot[];
  starterRecommendations: Record<string, WardrobeSlot | undefined>;
  wearHistory: WearEntry[];
  todaysWear: WearEntry[];
  logWear: (outfit: OutfitSet) => void;
  undoWear: (entryId: string) => void;
  getItemWearCount: (itemId: string) => number;
  isWornToday: (outfit: OutfitSet) => boolean;
  // Sophisticated stylist additions
  todayMood: MoodGoal | null;
  setTodayMood: (mood: MoodGoal | null) => void;
  reactions: OutfitReaction[];
  reactToOutfit: (outfit: OutfitSet, type: ReactionType) => void;
  clearOutfitReaction: (fingerprint: string) => void;
  getOutfitReaction: (outfit: OutfitSet) => ReactionType | null;
  profileCompleteness: number; // 0..1
  dismissProfileNudge: () => void;
  shouldShowProfileNudge: boolean;
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
    colorAversions: [],
  },
  onboardingComplete: false,
  hairColor: null,
  heightBand: null,
  contrastLevel: null,
  metalPreference: null,
  lifePhase: 'none',
  defaultMood: null,
  dismissedProfileNudge: undefined,
};

const FREE_ITEM_CAP = 10;

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEYS = {
  profile: '@auracloset_profile',
  wardrobe: '@auracloset_wardrobe',
  premium: '@auracloset_premium',
  slots: '@auracloset_slots',
  rotation: '@auracloset_rotation',
  wearHistory: '@auracloset_wear_history',
  reactions: '@auracloset_reactions',
  mood: '@auracloset_mood',
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

function computeProfileCompleteness(p: UserProfile): number {
  const fields: any[] = [
    p.name, p.bodyType, p.eyeColor, p.skinTone, p.undertone,
    p.styleGoalPrimary,
    p.hairColor, p.heightBand, p.contrastLevel, p.metalPreference,
  ];
  const filled = fields.filter(f => f !== null && f !== undefined && f !== '').length;
  return filled / fields.length;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>([]);
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [recommendationSlots, setRecommendationSlots] = useState<WardrobeSlot[]>([]);
  const [slotsInitialized, setSlotsInitialized] = useState(false);
  const [lastAddedSuggestions, setLastAddedSuggestions] = useState<OutfitSet[]>([]);
  const [rotationState, setRotationState] = useState<RotationState>(INITIAL_ROTATION_STATE);
  const [wearHistory, setWearHistory] = useState<WearEntry[]>([]);
  const [reactions, setReactions] = useState<OutfitReaction[]>([]);
  const [moodOfDay, setMoodOfDay] = useState<MoodOfDay | null>(null);

  useEffect(() => { loadData(); }, []);

  // Merge stored profile with defaults so fields added in later versions exist
  const mergeProfile = (stored: Partial<UserProfile>): UserProfile => ({
    ...defaultProfile,
    ...stored,
    constraints: {
      ...defaultProfile.constraints,
      ...(stored.constraints ?? {}),
      colorAversions: stored.constraints?.colorAversions ?? [],
    },
  });

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
      const [profileData, wardrobeData, premiumData, slotsData, rotationData, wearData, reactionsData, moodData] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.profile),
        AsyncStorage.getItem(STORAGE_KEYS.wardrobe),
        AsyncStorage.getItem(STORAGE_KEYS.premium),
        AsyncStorage.getItem(STORAGE_KEYS.slots),
        AsyncStorage.getItem(STORAGE_KEYS.rotation),
        AsyncStorage.getItem(STORAGE_KEYS.wearHistory),
        AsyncStorage.getItem(STORAGE_KEYS.reactions),
        AsyncStorage.getItem(STORAGE_KEYS.mood),
      ]);
      const loadedProfile = profileData ? mergeProfile(JSON.parse(profileData)) : defaultProfile;
      setProfile(loadedProfile);
      const loadedItems = wardrobeData ? JSON.parse(wardrobeData) : [];
      if (wardrobeData) setWardrobeItems(loadedItems);
      if (premiumData) setIsPremium(JSON.parse(premiumData));
      if (rotationData) setRotationState(JSON.parse(rotationData));
      if (wearData) setWearHistory(JSON.parse(wearData));
      if (reactionsData) setReactions(JSON.parse(reactionsData));
      if (moodData) setMoodOfDay(JSON.parse(moodData));
      if (slotsData) {
        const savedStatuses: { id: string; status: 'needed' | 'owned'; matchedItemId?: string }[] = JSON.parse(slotsData);
        const blueprint = getProfileBlueprint(loadedProfile);
        const fullSlots = initializeSlots(loadedItems, blueprint);
        const merged = fullSlots.map(slot => {
          const saved = savedStatuses.find(s => s.id === slot.id);
          if (saved) return { ...slot, status: saved.status, matchedItemId: saved.matchedItemId };
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
      const updated = { ...prev, ...updates, constraints: { ...prev.constraints, ...(updates.constraints ?? {}) } };
      AsyncStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearLastAddedSuggestions = useCallback(() => setLastAddedSuggestions([]), []);

  // ── Wear tracking ─────────────────────────────────────────────────────────────

  function outfitFingerprintOf(outfit: OutfitSet): string {
    return outfit.components.map(c => c.matchedItemId).filter(Boolean).sort().join('|');
  }

  const logWear = useCallback((outfit: OutfitSet) => {
    const fp = outfitFingerprintOf(outfit);
    const itemIds = outfit.components.map(c => c.matchedItemId).filter((id): id is string => Boolean(id));
    const entry: WearEntry = {
      id: Crypto.randomUUID(),
      date: todayString(),
      occasion: outfit.scenario,
      outfitFingerprint: fp,
      itemIds,
      loggedAt: new Date().toISOString(),
    };
    setWearHistory(prev => {
      const updated = [entry, ...prev];
      AsyncStorage.setItem(STORAGE_KEYS.wearHistory, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const undoWear = useCallback((entryId: string) => {
    setWearHistory(prev => {
      const updated = prev.filter(e => e.id !== entryId);
      AsyncStorage.setItem(STORAGE_KEYS.wearHistory, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const todaysWear = useMemo(() => {
    const today = todayString();
    return wearHistory.filter(e => e.date === today);
  }, [wearHistory]);

  const getItemWearCount = useCallback(
    (itemId: string) => wearHistory.filter(e => e.itemIds.includes(itemId)).length,
    [wearHistory],
  );

  const isWornToday = useCallback(
    (outfit: OutfitSet) => {
      const fp = outfitFingerprintOf(outfit);
      const today = todayString();
      return wearHistory.some(e => e.date === today && e.outfitFingerprint === fp);
    },
    [wearHistory],
  );

  // ── Reactions ────────────────────────────────────────────────────────────────

  const reactToOutfit = useCallback((outfit: OutfitSet, type: ReactionType) => {
    const fp = outfitFingerprintOf(outfit);
    if (!fp) return;
    const today = todayString();
    setReactions(prev => {
      // Replace any existing reaction of the same type+fp from today (toggle)
      const withoutSameToday = prev.filter(
        r => !(r.outfitFingerprint === fp && r.date === today && r.type === type)
      );
      if (withoutSameToday.length < prev.length) {
        AsyncStorage.setItem(STORAGE_KEYS.reactions, JSON.stringify(withoutSameToday));
        return withoutSameToday; // toggle off
      }
      // Otherwise add new (and remove opposite type for today)
      const cleaned = prev.filter(
        r => !(r.outfitFingerprint === fp && r.date === today)
      );
      const entry: OutfitReaction = {
        id: Crypto.randomUUID(),
        outfitFingerprint: fp,
        type,
        date: today,
        scenario: outfit.scenario,
      };
      const updated = [entry, ...cleaned];
      AsyncStorage.setItem(STORAGE_KEYS.reactions, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearOutfitReaction = useCallback((fingerprint: string) => {
    setReactions(prev => {
      const updated = prev.filter(r => r.outfitFingerprint !== fingerprint);
      AsyncStorage.setItem(STORAGE_KEYS.reactions, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const getOutfitReaction = useCallback((outfit: OutfitSet): ReactionType | null => {
    const fp = outfitFingerprintOf(outfit);
    if (!fp) return null;
    const today = todayString();
    const todayReaction = reactions.find(r => r.outfitFingerprint === fp && r.date === today);
    return todayReaction?.type ?? null;
  }, [reactions]);

  // ── Mood of day ──────────────────────────────────────────────────────────────

  const todayMood: MoodGoal | null = useMemo(() => {
    const today = todayString();
    if (moodOfDay && moodOfDay.date === today) return moodOfDay.mood;
    return profile.defaultMood ?? null;
  }, [moodOfDay, profile.defaultMood]);

  const setTodayMood = useCallback((mood: MoodGoal | null) => {
    const today = todayString();
    const entry: MoodOfDay = { date: today, mood };
    setMoodOfDay(entry);
    AsyncStorage.setItem(STORAGE_KEYS.mood, JSON.stringify(entry));
  }, []);

  // ── Wardrobe mutations ───────────────────────────────────────────────────────

  const addWardrobeItem = useCallback((item: Omit<WardrobeItem, 'id' | 'createdAt'>) => {
    const newItem: WardrobeItem = {
      ...item,
      id: Crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    setWardrobeItems(prev => {
      const updated = [...prev, newItem];
      AsyncStorage.setItem(STORAGE_KEYS.wardrobe, JSON.stringify(updated));
      const suggestions = generateOutfitsForItem(newItem, updated, profile);
      setLastAddedSuggestions(suggestions);
      return updated;
    });
    setRecommendationSlots(prev => {
      const updated = updateSlotsAfterAdd(prev, newItem);
      AsyncStorage.setItem(STORAGE_KEYS.slots, JSON.stringify(
        updated.map(s => ({ id: s.id, status: s.status, matchedItemId: s.matchedItemId }))
      ));
      return updated;
    });
  }, [profile]);

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

  const updateWardrobeItem = useCallback((id: string, updates: Partial<Omit<WardrobeItem, 'id' | 'createdAt'>>) => {
    setWardrobeItems(prev => {
      const next = prev.map(item => item.id === id ? { ...item, ...updates } : item);
      AsyncStorage.setItem(STORAGE_KEYS.wardrobe, JSON.stringify(next));
      return next;
    });
  }, []);

  const togglePremium = useCallback(() => {
    setIsPremium(prev => {
      const updated = !prev;
      AsyncStorage.setItem(STORAGE_KEYS.premium, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // ── Rotation-based outfit generation ─────────────────────────────────────────

  const outfitPool = useMemo(
    () => generateOutfitPool(wardrobeItems, profile, todayMood, reactions, todayString()),
    [wardrobeItems, profile, todayMood, reactions],
  );

  const recentWornFingerprints = useMemo(() => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const set = new Set<string>();
    for (const entry of wearHistory) {
      if (entry.date >= sevenDaysAgo && entry.outfitFingerprint) set.add(entry.outfitFingerprint);
    }
    return set;
  }, [wearHistory]);

  const outfitSets = useMemo(() => {
    if (wardrobeItems.length === 0) return [];
    const today = todayString();
    const { outfits } = applyDailyRotation(outfitPool, rotationState, today, recentWornFingerprints);
    return outfits;
  }, [outfitPool, rotationState, wardrobeItems.length, recentWornFingerprints]);

  useEffect(() => {
    if (isLoading || wardrobeItems.length === 0) return;
    const today = todayString();
    const newHash = computePoolHash(wardrobeItems, profile, todayMood);
    const hashChanged = newHash !== rotationState.poolHash;
    const dateChanged = today !== rotationState.lastDate;
    if (!hashChanged && !dateChanged) return;

    let baseState = rotationState;
    if (hashChanged) {
      baseState = {
        ...INITIAL_ROTATION_STATE,
        poolHash: newHash,
        shuffleSeed: Math.floor(Math.random() * 9_000_000) + 1_000_000,
      };
    }
    const { newState } = applyDailyRotation(outfitPool, baseState, today, recentWornFingerprints);
    const stateToSave: RotationState = { ...newState, poolHash: newHash };
    setRotationState(stateToSave);
    AsyncStorage.setItem(STORAGE_KEYS.rotation, JSON.stringify(stateToSave));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wardrobeItems, profile, todayMood, outfitPool, rotationState.poolHash, rotationState.lastDate, isLoading, recentWornFingerprints]);

  const canAddItem = isPremium || wardrobeItems.length < FREE_ITEM_CAP;
  const starterRecommendations = useMemo(() => getFirstNeededByCategory(recommendationSlots), [recommendationSlots]);

  // ── Profile completeness / nudge ─────────────────────────────────────────────

  const profileCompleteness = useMemo(() => computeProfileCompleteness(profile), [profile]);

  const dismissProfileNudge = useCallback(() => {
    updateProfile({ dismissedProfileNudge: todayString() });
  }, [updateProfile]);

  const shouldShowProfileNudge = useMemo(() => {
    if (profileCompleteness >= 0.9) return false;
    if (profile.dismissedProfileNudge === todayString()) return false;
    return true;
  }, [profileCompleteness, profile.dismissedProfileNudge]);

  const value = useMemo(() => ({
    profile, updateProfile, wardrobeItems, addWardrobeItem, removeWardrobeItem, updateWardrobeItem,
    isPremium, togglePremium, outfitSets, lastAddedSuggestions, clearLastAddedSuggestions,
    isLoading, canAddItem, recommendationSlots, starterRecommendations,
    wearHistory, todaysWear, logWear, undoWear, getItemWearCount, isWornToday,
    todayMood, setTodayMood, reactions, reactToOutfit, clearOutfitReaction, getOutfitReaction,
    profileCompleteness, dismissProfileNudge, shouldShowProfileNudge,
  }), [profile, updateProfile, wardrobeItems, addWardrobeItem, removeWardrobeItem, updateWardrobeItem,
       isPremium, togglePremium, outfitSets, lastAddedSuggestions, clearLastAddedSuggestions,
       isLoading, canAddItem, recommendationSlots, starterRecommendations,
       wearHistory, todaysWear, logWear, undoWear, getItemWearCount, isWornToday,
       todayMood, setTodayMood, reactions, reactToOutfit, clearOutfitReaction, getOutfitReaction,
       profileCompleteness, dismissProfileNudge, shouldShowProfileNudge]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
