import { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { WardrobeSlot, initializeSlots, updateSlotsAfterAdd, getFirstNeededByCategory, getProfileBlueprint, BLUEPRINT_SUBTYPES_BY_CATEGORY, getLifestyleGatedSlots, LifestyleSlotGroup } from '@/constants/wardrobeBlueprint';
import {
  BodyType, EyeColor, SkinTone, Undertone, StyleGoal, ItemCategory, OccasionTag, SeasonTag,
  Constraints, UserProfile, WardrobeItem, OutfitComponent, OutfitSet, WearEntry,
  MoodGoal, OutfitReaction, ReactionType, MoodOfDay, SavedLook, WeatherSnapshot,
} from '@/constants/types';
import { generateOutfitsForItem } from '@/constants/outfitGenerator';
import { loadWeather, getCachedWeather, clearCachedWeather } from '@/constants/weather';
import { inferFabric, inferFabricWeight } from '@/constants/outfitScoring';
import { runGuestRemoval } from '@/constants/guestPhotoCleanup';
import { centroidHsl, hslToLab } from '@/constants/colorPerceptual';
import { apiRequest } from '@/lib/query-client';
import {
  upsertUserProfile, getUserProfile, getWardrobeItems,
  getSlotStatuses, getWearLogs, getRotationCursors,
  getAffinitySignals, getPairAffinitySignals,
  insertWardrobeItem, deleteWardrobeItem, insertWearLog, deleteWearLog,
  insertAffinitySignal, insertPairAffinitySignal,
  getSavedLooks, upsertSavedLook, deleteSavedLook,
} from '../lib/database';
import { supabase } from '../lib/supabase';
import { deleteWardrobeImage } from '../lib/storage';
import { rebaseGuestPhotoUri } from '../lib/rebaseGuestPhotoUri';
import {
  RotationState, INITIAL_ROTATION_STATE,
  generateOutfitPool, applyDailyRotation, computePoolHash, todayString,
} from '@/constants/outfitRotation';
import {
  AffinityState, computeAffinity, MIN_SIGNALS_TO_APPLY,
  topAffinityItems, topAffinityPairs,
} from '@/constants/affinity';

export type {
  BodyType, EyeColor, SkinTone, Undertone, StyleGoal, ItemCategory, OccasionTag, SeasonTag,
  Constraints, UserProfile, WardrobeItem, OutfitComponent, OutfitSet, WearEntry,
  MoodGoal, OutfitReaction, ReactionType,
} from '@/constants/types';

interface AppContextValue {
  profile: UserProfile;
  updateProfile: (updates: Partial<UserProfile>) => void;
  wardrobeItems: WardrobeItem[];
  activeWardrobeItems: WardrobeItem[];
  addWardrobeItem: (item: Omit<WardrobeItem, 'createdAt'> & { id?: string }) => void;
  removeWardrobeItem: (id: string) => void;
  updateWardrobeItem: (id: string, updates: Partial<Omit<WardrobeItem, 'id' | 'createdAt'>>) => void;
  isPremium: boolean;
  togglePremium: () => void;
  outfitSets: OutfitSet[];
  lastAddedSuggestions: OutfitSet[];
  clearLastAddedSuggestions: () => void;
  isLoading: boolean;
  appReady: boolean;
  isAuthenticated: boolean;
  canAddItem: boolean;
  recommendationSlots: WardrobeSlot[];
  starterRecommendations: Record<string, WardrobeSlot | undefined>;
  lifestyleSlotGroups: LifestyleSlotGroup[];
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
  missingDimensions: string[];
  dismissProfileNudge: () => void;
  shouldShowProfileNudge: boolean;
  // Saved looks
  savedLooks: SavedLook[];
  toggleSavedLook: (lookId: string) => void;
  isLookSaved: (lookId: string) => boolean;
  renameSavedLook: (lookId: string, name: string) => void;
  getSavedLookName: (lookId: string, fallback: string) => string;
  // Perceptual-colour migration progress (one-shot legacy backfill)
  backfillProgress: { done: number; total: number } | null;
  // Personal calibration loop — affinity learned from reactions + wear
  affinityState: AffinityState;
  affinityActive: boolean;        // true once N≥5 signals have accumulated
  affinitySignalCount: number;    // for "X reactions logged" UI copy
  topAffinityItems: ReturnType<typeof topAffinityItems>;
  topAffinityPairs: ReturnType<typeof topAffinityPairs>;
  // Weather-aware outerwear (Open-Meteo, no API key)
  weather: WeatherSnapshot | null;
  weatherLoading: boolean;
  refreshWeather: () => Promise<void>;
  setWeatherEnabled: (enabled: boolean) => void;
  isGuest: boolean;
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
  lifestyleActive: 0,
  lifestyleBrunch: 0,
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
  industry: 'unspecified',
  dismissedProfileNudge: undefined,
};

const FREE_ITEM_CAP = 15;
const GUEST_ITEM_CAP = 8;

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
  savedLooks: '@auracloset_saved_looks',
  perceptualMigrated: '@auracloset_perceptual_migrated_v1',
};

// Sub-type chips are derived from the curated blueprints (single source
// of truth) so every blueprint slot is guaranteed to be selectable from
// Add Item / Item Detail under the strict matcher.
const subTypes: Record<ItemCategory, string[]> = BLUEPRINT_SUBTYPES_BY_CATEGORY;

const colorFamilies = [
  // Neutrals
  'black', 'white', 'grey', 'cream', 'beige', 'camel', 'brown', 'khaki',
  // Warm
  'mustard', 'gold', 'silver', 'red', 'maroon', 'burgundy', 'coral', 'orange', 'yellow',
  // Cool
  'olive', 'green', 'mint', 'teal', 'blue', 'navy',
  // Specialty
  'lavender', 'purple', 'pink',
];

export { subTypes, colorFamilies };
export type { WardrobeSlot } from '@/constants/wardrobeBlueprint';

// Each profile dimension that materially feeds scoring. Each entry declares
// which scoring dimensions it unlocks so the nudge can be dimension-aware.
type ProfileDimension = { key: keyof UserProfile; unlocks: readonly string[] };
const PROFILE_DIMENSIONS: readonly ProfileDimension[] = [
  { key: 'name',             unlocks: ['personalization'] },
  { key: 'bodyType',         unlocks: ['proportion-balance'] },
  { key: 'eyeColor',         unlocks: ['color-harmony'] },
  { key: 'skinTone',         unlocks: ['color-harmony'] },
  { key: 'undertone',        unlocks: ['metal-cohesion', 'color-harmony'] },
  { key: 'styleGoalPrimary', unlocks: ['mood'] },
  { key: 'hairColor',        unlocks: ['hair-color-interaction'] },
  { key: 'heightBand',       unlocks: ['proportion-balance'] },
  { key: 'contrastLevel',    unlocks: ['contrast-match'] },
  { key: 'metalPreference',  unlocks: ['metal-cohesion'] },
] as const;

function isFilled(v: unknown): boolean {
  return v !== null && v !== undefined && v !== '';
}

function computeProfileCompleteness(p: UserProfile): number {
  const filled = PROFILE_DIMENSIONS.filter(d => isFilled(p[d.key])).length;
  return filled / PROFILE_DIMENSIONS.length;
}

function missingScoringDimensions(p: UserProfile): string[] {
  const missing = new Set<string>();
  for (const d of PROFILE_DIMENSIONS) {
    if (!isFilled(p[d.key])) d.unlocks.forEach(u => missing.add(u));
  }
  return Array.from(missing);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>([]);
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [appReady, setAppReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [recommendationSlots, setRecommendationSlots] = useState<WardrobeSlot[]>([]);
  const [slotsInitialized, setSlotsInitialized] = useState(false);
  const [lastAddedSuggestions, setLastAddedSuggestions] = useState<OutfitSet[]>([]);
  const [rotationState, setRotationState] = useState<RotationState>(INITIAL_ROTATION_STATE);
  const [wearHistory, setWearHistory] = useState<WearEntry[]>([]);
  const [reactions, setReactions] = useState<OutfitReaction[]>([]);
  const [moodOfDay, setMoodOfDay] = useState<MoodOfDay | null>(null);
  const [savedLooks, setSavedLooks] = useState<SavedLook[]>([]);
  const [backfillProgress, setBackfillProgress] = useState<{ done: number; total: number } | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          // INITIAL_SESSION is intentionally excluded: loadData() calls getSession()
          // internally and awaits loadUserDataFromDB before setAppReady(true), so the
          // initial session is fully settled before routing fires. Handling INITIAL_SESSION
          // here as well would create a race where setAppReady(true) could fire before
          // the DB load started by this listener has completed.
          const userId = session.user.id;
          // Dedup: loadData() may have already loaded this user's data.
          if (currentUserIdRef.current === userId) return;
          currentUserIdRef.current = userId;
          const authName: string =
            session.user.user_metadata?.full_name ||
            session.user.user_metadata?.name ||
            '';
          // Snapshot local (potentially guest) profile before any DB operations
          const localRaw = await AsyncStorage.getItem(STORAGE_KEYS.profile).catch(() => null);
          const localSnap: UserProfile | null = localRaw ? mergeProfile(JSON.parse(localRaw)) : null;
          await loadUserDataFromDB(userId, authName, localSnap);
          setIsAuthenticated(true);
        }

        if (event === 'SIGNED_OUT') {
          currentUserIdRef.current = null;
          setIsAuthenticated(false);
          setProfile(defaultProfile);
          setWardrobeItems([]);
          setIsPremium(false);
          setRotationState(INITIAL_ROTATION_STATE);
          setWearHistory([]);
          setReactions([]);
          setMoodOfDay(null);
          setSavedLooks([]);
          setRecommendationSlots([]);
          setSlotsInitialized(false);
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

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

  const profileBlueprintKey = `${profile.styleGoalPrimary || ''}-${profile.styleGoalSecondary || ''}-${profile.bodyType || ''}-${profile.lifestyleWork}-${profile.lifestyleCasual}-${profile.lifestyleEvents}-${profile.lifestyleActive ?? 0}-${profile.lifestyleBrunch ?? 0}-${profile.constraints.noSleeveless}-${profile.constraints.noShortSkirts}-${profile.constraints.maxHeelHeight}`;

  useEffect(() => {
    if (!isLoading && !slotsInitialized) {
      const blueprint = getProfileBlueprint(profile);
      const active = isPremium ? wardrobeItems : wardrobeItems.slice(0, FREE_ITEM_CAP);
      const slots = initializeSlots(active, blueprint);
      setRecommendationSlots(slots);
      setSlotsInitialized(true);
      AsyncStorage.setItem(STORAGE_KEYS.slots, JSON.stringify(
        slots.map(s => ({ id: s.id, status: s.status, matchedItemId: s.matchedItemId }))
      ));
    }
  }, [isLoading, slotsInitialized, wardrobeItems, isPremium]);

  useEffect(() => {
    if (slotsInitialized) {
      const blueprint = getProfileBlueprint(profile);
      const active = isPremium ? wardrobeItems : wardrobeItems.slice(0, FREE_ITEM_CAP);
      const slots = initializeSlots(active, blueprint);
      setRecommendationSlots(slots);
      AsyncStorage.setItem(STORAGE_KEYS.slots, JSON.stringify(
        slots.map(s => ({ id: s.id, status: s.status, matchedItemId: s.matchedItemId }))
      ));
    }
  }, [profileBlueprintKey, isPremium, wardrobeItems, slotsInitialized]);

  const loadData = async () => {
    try {
      const [profileData, wardrobeData, premiumData, slotsData, rotationData, wearData, reactionsData, moodData, savedLooksData] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.profile),
        AsyncStorage.getItem(STORAGE_KEYS.wardrobe),
        AsyncStorage.getItem(STORAGE_KEYS.premium),
        AsyncStorage.getItem(STORAGE_KEYS.slots),
        AsyncStorage.getItem(STORAGE_KEYS.rotation),
        AsyncStorage.getItem(STORAGE_KEYS.wearHistory),
        AsyncStorage.getItem(STORAGE_KEYS.reactions),
        AsyncStorage.getItem(STORAGE_KEYS.mood),
        AsyncStorage.getItem(STORAGE_KEYS.savedLooks),
      ]);
      const loadedProfile: UserProfile = profileData ? mergeProfile(JSON.parse(profileData)) : defaultProfile;
      if (profileData) setProfile(loadedProfile);
      const rawItems: WardrobeItem[] = wardrobeData ? JSON.parse(wardrobeData) : [];
      // ── Guest photo path normalisation ────────────────────────────────────
      // On Android, FileSystem.documentDirectory can change between app
      // updates. Guest items were saved as absolute paths
      // (`${documentDirectory}wardrobe_<uuid>.jpg`). If the directory
      // portion has shifted we silently rebase to the current value so
      // thumbnails keep rendering. Paths that don't match the
      // `wardrobe_*.jpg|png` guest naming convention are left untouched.
      const currentDocDir = FileSystem.documentDirectory ?? '';
      // ── Perceptual migration (two phase) ──────────────────────────────────
      // Phase 1 (synchronous, instant): seed every legacy item's HSL/Lab
      // from the colour-family centroid so the scorer never sees null while
      // the app boots. Cheap pure math.
      // Phase 2 (background, image-based): for items not yet migrated,
      // re-fetch the photo and ask the server to compute precise HSL/Lab
      // from the dominant garment pixel — same pipeline as new uploads.
      // A persistent flag prevents this from ever running twice.
      const legacyIds = new Set<string>();
      const texturePersistIds = new Set<string>();
      const rebasedPathIds = new Set<string>();
      const seededItems = rawItems.map((it) => {
        // Rebase guest photo paths if documentDirectory has changed
        if (it.photoUri) {
          const rebased = rebaseGuestPhotoUri(it.photoUri, currentDocDir);
          if (rebased !== it.photoUri) {
            it = { ...it, photoUri: rebased };
            rebasedPathIds.add(it.id);
          }
        }
        // One-shot occasion migration (April 2026): the legacy `'date'` tag
        // was split into `'date-casual'` / `'date-dressy'`. Default forward
        // to `'date-dressy'` since the historical scorer band [3,7] sat
        // closer to the new dressy band than the casual one. Users can
        // re-tag explicitly if they prefer the casual variant.
        const occasionTags = (it.occasionTags ?? []).map(t =>
          (t as string) === 'date' ? 'date-dressy' : t,
        ) as typeof it.occasionTags;
        const withTags = occasionTags === it.occasionTags ? it : { ...it, occasionTags };
        // Texture pairing migration (April 2026): items uploaded before
        // fabric/weight capture get a sub-type-derived default so the new
        // textureHarmony scorer has something to reason about. User-tagged
        // values are preserved.
        const fabricBackfill = withTags.fabric ?? inferFabric(withTags.subType);
        const weightBackfill = withTags.weight ?? inferFabricWeight(withTags.subType);
        const needsTextureBackfill = fabricBackfill !== withTags.fabric || weightBackfill !== withTags.weight;
        const withTexture = needsTextureBackfill
          ? { ...withTags, fabric: fabricBackfill, weight: weightBackfill }
          : withTags;
        // Texture-only backfills should persist to disk but must NOT enrol the
        // item in the expensive image-based perceptual migration pass — that
        // path is reserved for items missing HSL/Lab.
        if (needsTextureBackfill) texturePersistIds.add(withTexture.id);
        if (withTexture.dominantHsl && withTexture.dominantLab) return withTexture;
        const hsl = withTexture.dominantHsl ?? centroidHsl(withTexture.colorFamily);
        const lab = withTexture.dominantLab ?? hslToLab(hsl.h, hsl.s, hsl.l);
        legacyIds.add(withTexture.id);
        return { ...withTexture, dominantHsl: hsl, dominantLab: lab };
      });
      if (wardrobeData) setWardrobeItems(seededItems);
      if (legacyIds.size > 0 || texturePersistIds.size > 0 || rebasedPathIds.size > 0) {
        AsyncStorage.setItem(STORAGE_KEYS.wardrobe, JSON.stringify(seededItems));
      }
      // ── Temp-cache URI integrity check ────────────────────────────────────
      // Authenticated-user items reference their Supabase Storage URL (https://)
      // or, briefly, the ephemeral local URI that was used before the upload
      // completed. If the app is backgrounded during an upload iOS may purge
      // the temp cache, leaving a stale file:// URI that will never resolve.
      // We detect this at load time and warn so developers can observe it in
      // logs / Sentry before users report broken thumbnails. Guest photos use
      // the `wardrobe_*` naming convention and are already handled by the
      // rebase logic above — skip them here.
      const isGuestPhotoUri = (uri: string): boolean => {
        const filename = uri.split('/').pop() ?? '';
        return /^wardrobe_[^/]+\.(jpg|png)$/i.test(filename);
      };
      const nonGuestFileUris = seededItems.filter(
        it => it.photoUri?.startsWith('file://') && !isGuestPhotoUri(it.photoUri),
      );
      if (nonGuestFileUris.length > 0) {
        setTimeout(async () => {
          for (const item of nonGuestFileUris) {
            try {
              const info = await FileSystem.getInfoAsync(item.photoUri);
              if (!info.exists) {
                console.warn(
                  `[AuraCloset] Wardrobe photo missing from temp cache — ` +
                  `item id=${item.id} subType=${item.subType} uri=${item.photoUri}`,
                );
              }
            } catch (err) {
              console.warn(
                `[AuraCloset] Could not verify wardrobe photo — ` +
                `item id=${item.id} uri=${item.photoUri}`,
                err,
              );
            }
          }
        }, 1000);
      }
      // Phase 2 image refinement only runs if there is genuine legacy work to
      // do (some item lacked perceptual fields). Items added through the
      // current upload flow already carry precise per-pixel values and are
      // never reprocessed — that would burn API calls and risk overwriting
      // good values with marginally different ones.
      const migratedFlag = await AsyncStorage.getItem(STORAGE_KEYS.perceptualMigrated);
      if (!migratedFlag && legacyIds.size > 0) {
        const legacyTargets = seededItems.filter(it => legacyIds.has(it.id));
        // Defer slightly so the first paint is unblocked.
        setTimeout(() => { runPerceptualMigration(legacyTargets); }, 800);
      } else if (!migratedFlag) {
        // Nothing to migrate — record the flag so we don't keep checking.
        AsyncStorage.setItem(STORAGE_KEYS.perceptualMigrated, '1');
      }
      if (premiumData) setIsPremium(JSON.parse(premiumData));
      if (rotationData) setRotationState(JSON.parse(rotationData));
      // Migrate persisted wear history + reactions from the legacy single
      // `'date'` scenario to `'date-dressy'` so labels/lookups don't blank
      // out for users with existing logs.
      if (wearData) {
        const parsed: WearEntry[] = JSON.parse(wearData);
        let mutated = false;
        const migrated = parsed.map(e => {
          if ((e.occasion as string) === 'date') {
            mutated = true;
            return { ...e, occasion: 'date-dressy' as const };
          }
          return e;
        });
        setWearHistory(migrated);
        if (mutated) AsyncStorage.setItem(STORAGE_KEYS.wearHistory, JSON.stringify(migrated));
      }
      if (reactionsData) {
        const parsed: OutfitReaction[] = JSON.parse(reactionsData);
        let mutated = false;
        const migrated = parsed.map(r => {
          if ((r.scenario as string) === 'date') {
            mutated = true;
            return { ...r, scenario: 'date-dressy' as const };
          }
          return r;
        });
        setReactions(migrated);
        if (mutated) AsyncStorage.setItem(STORAGE_KEYS.reactions, JSON.stringify(migrated));
      }
      if (moodData) setMoodOfDay(JSON.parse(moodData));
      if (savedLooksData) setSavedLooks(JSON.parse(savedLooksData));
      if (slotsData) {
        // Always trust strict matcher recomputation against current items and
        // current blueprint — guarantees that legacy persisted statuses from a
        // looser matcher are corrected on load. Persisted status is no longer
        // honoured because slot ownership is fully derivable from items.
        const blueprint = getProfileBlueprint(loadedProfile);
        const fullSlots = initializeSlots(seededItems, blueprint);
        setRecommendationSlots(fullSlots);
        AsyncStorage.setItem(STORAGE_KEYS.slots, JSON.stringify(
          fullSlots.map(s => ({ id: s.id, status: s.status, matchedItemId: s.matchedItemId }))
        ));
        setSlotsInitialized(true);
      }
      // Check for an existing Supabase session and load DB data before
      // signalling ready — eliminates the race with onAuthStateChange.
      const { data: { session: initSession } } = await supabase.auth.getSession()
        .catch(() => ({ data: { session: null } }));
      if (initSession?.user) {
        const initUserId = initSession.user.id;
        const initAuthName: string =
          initSession.user.user_metadata?.full_name ||
          initSession.user.user_metadata?.name ||
          '';
        if (currentUserIdRef.current !== initUserId) {
          currentUserIdRef.current = initUserId;
          await loadUserDataFromDB(initUserId, initAuthName, loadedProfile);
        }
        setIsAuthenticated(true);
      }
    } catch (e) {
      console.error('Failed to load data:', e);
    } finally {
      setIsLoading(false);
      setAppReady(true);
    }
  };

  // ── Load all user data from Supabase DB ───────────────────────────────────
  // Called from loadData() on initial mount (when a session already exists in
  // SecureStore) and from onAuthStateChange for subsequent SIGNED_IN events.
  // The dedup guard in both call sites (currentUserIdRef) prevents double-loads.
  const loadUserDataFromDB = async (
    userId: string,
    authName: string,
    localSnap: UserProfile | null,
  ) => {
    // Clear guest mode on any sign-in so local data is preserved
    // but the user transitions to an authenticated account.
    setProfile(prev => {
      if (prev.isGuest) {
        const updated = { ...prev, isGuest: false };
        AsyncStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(updated));
        return updated;
      }
      return prev;
    });

    await upsertUserProfile({
      id: userId,
      ...(authName ? { name: authName } : {}),
    }).catch(console.error);

    try {
      const [
        dbProfile, items, _slots, logs,
        _cursors, _affinitySignals, _pairSignals,
      ] = await Promise.all([
        getUserProfile(userId),
        getWardrobeItems(userId),
        getSlotStatuses(userId),
        getWearLogs(userId),
        getRotationCursors(userId),
        getAffinitySignals(userId),
        getPairAffinitySignals(userId),
      ]);

      // Load saved looks separately — table may not exist yet for some users
      const dbSavedLooks = await getSavedLooks(userId).catch(() => []);

      // A "blank" account has never completed onboarding on this or any device
      const isNewBlankAccount = !dbProfile || (
        !dbProfile.body_type && !dbProfile.eye_color && !dbProfile.skin_tone &&
        !dbProfile.onboarding_complete
      );
      // The local snapshot has onboarding data if the guest completed the quiz
      const guestHasData = !!(
        localSnap?.bodyType && localSnap?.eyeColor && localSnap?.styleGoalPrimary
      );

      if (isNewBlankAccount && guestHasData && localSnap) {
        // Guest created a new account — carry their onboarding preferences forward
        await upsertUserProfile({
          id: userId,
          name: localSnap.name || authName || undefined,
          body_type: localSnap.bodyType ?? undefined,
          eye_color: localSnap.eyeColor ?? undefined,
          skin_tone: localSnap.skinTone ?? undefined,
          undertone: localSnap.undertone ?? undefined,
          style_goals: [localSnap.styleGoalPrimary, localSnap.styleGoalSecondary].filter(Boolean) as string[],
          secondary_goal: localSnap.styleGoalSecondary ?? undefined,
          lifestyle: {
            work: localSnap.lifestyleWork,
            casual: localSnap.lifestyleCasual,
            events: localSnap.lifestyleEvents,
            active: localSnap.lifestyleActive ?? 0,
            brunch: localSnap.lifestyleBrunch ?? 0,
          },
          constraints: localSnap.constraints,
          onboarding_complete: localSnap.onboardingComplete ?? false,
        }).catch(console.error);
        setProfile(mergeProfile({ ...localSnap, isGuest: false, name: localSnap.name || authName || '' }));
      } else if (dbProfile) {
        const ext = (dbProfile.constraints?._profile as any) ?? {};
        setProfile(prev => mergeProfile({
          ...prev,
          name: dbProfile.name || authName || prev.name,
          bodyType: dbProfile.body_type ?? prev.bodyType,
          eyeColor: dbProfile.eye_color ?? prev.eyeColor,
          skinTone: dbProfile.skin_tone ?? prev.skinTone,
          undertone: dbProfile.undertone ?? prev.undertone,
          styleGoalPrimary: dbProfile.style_goals?.[0] ?? prev.styleGoalPrimary,
          styleGoalSecondary: dbProfile.secondary_goal ?? prev.styleGoalSecondary,
          lifestyleWork: dbProfile.lifestyle?.work ?? prev.lifestyleWork,
          lifestyleCasual: dbProfile.lifestyle?.casual ?? prev.lifestyleCasual,
          lifestyleEvents: dbProfile.lifestyle?.events ?? prev.lifestyleEvents,
          lifestyleActive: dbProfile.lifestyle?.active ?? prev.lifestyleActive ?? 0,
          lifestyleBrunch: dbProfile.lifestyle?.brunch ?? prev.lifestyleBrunch ?? 0,
          constraints: {
            noSleeveless: dbProfile.constraints?.noSleeveless ?? prev.constraints?.noSleeveless ?? false,
            noShortSkirts: dbProfile.constraints?.noShortSkirts ?? prev.constraints?.noShortSkirts ?? false,
            maxHeelHeight: dbProfile.constraints?.maxHeelHeight ?? prev.constraints?.maxHeelHeight ?? 'any',
            colorAversions: dbProfile.constraints?.colorAversions ?? prev.constraints?.colorAversions ?? [],
          },
          hairColor: ext.hairColor !== undefined ? ext.hairColor : (prev.hairColor ?? null),
          heightBand: ext.heightBand !== undefined ? ext.heightBand : (prev.heightBand ?? null),
          faceShape: ext.faceShape !== undefined ? ext.faceShape : (prev.faceShape ?? null),
          contrastLevel: ext.contrastLevel !== undefined ? ext.contrastLevel : (prev.contrastLevel ?? null),
          metalPreference: ext.metalPreference !== undefined ? ext.metalPreference : (prev.metalPreference ?? null),
          defaultMood: ext.defaultMood !== undefined ? ext.defaultMood : (prev.defaultMood ?? null),
          industry: ext.industry ?? prev.industry ?? 'unspecified',
          lifePhase: ext.lifePhase !== undefined ? ext.lifePhase : (prev.lifePhase ?? null),
          tempUnit: ext.tempUnit ?? prev.tempUnit ?? null,
          weatherEnabled: (ext.weatherEnabled !== undefined && ext.weatherEnabled !== null)
            ? ext.weatherEnabled
            : prev.weatherEnabled,
          onboardingComplete: dbProfile.onboarding_complete ?? prev.onboardingComplete,
        }));
        if (dbProfile.premium) setIsPremium(true);
      } else if (authName) {
        setProfile(prev => ({ ...prev, name: prev.name || authName, isGuest: false }));
      }

      if (items && items.length > 0) {
        const mapped: WardrobeItem[] = items.map((it: any) => ({
          id: it.id,
          photoUri: it.cleaned_image_url || it.image_url || '',
          category: it.garment_type as ItemCategory,
          subType: it.sub_type || '',
          colorFamily: it.color_family || '',
          description: it.description,
          occasionTags: it.occasion || [],
          seasonTags: [],
          createdAt: it.created_at,
          formalityLevel: 5,
        }));
        setWardrobeItems(mapped);
        AsyncStorage.setItem(STORAGE_KEYS.wardrobe, JSON.stringify(mapped));
      }

      if (logs && logs.length > 0) {
        const mappedLogs: WearEntry[] = logs.map((l: any) => ({
          id: l.id,
          date: l.logged_at?.slice(0, 10) ?? '',
          occasion: l.occasion ?? 'casual',
          outfitFingerprint: l.outfit_fingerprint ?? '',
          itemIds: l.item_ids ?? [],
          loggedAt: l.logged_at ?? new Date().toISOString(),
        }));
        setWearHistory(mappedLogs);
        AsyncStorage.setItem(STORAGE_KEYS.wearHistory, JSON.stringify(mappedLogs));
      }

      if (dbSavedLooks.length > 0) {
        const mappedLooks: SavedLook[] = dbSavedLooks.map((l: any) => ({
          id: l.id,
          customName: l.custom_name || undefined,
          savedAt: l.saved_at,
        }));
        setSavedLooks(mappedLooks);
        AsyncStorage.setItem(STORAGE_KEYS.savedLooks, JSON.stringify(mappedLooks));
      }
    } catch (err: any) {
      console.error('[AppContext] DB data load error:', err.message);
    }
  };

  // ── Perceptual migration runner ──────────────────────────────────────────
  // Walks legacy items, re-fetches each photo, and asks the server to compute
  // precise HSL/Lab from the dominant garment pixel. Best-effort: items whose
  // image can't be re-fetched (e.g. URI no longer valid) keep their centroid
  // values silently. Persists progress through `setBackfillProgress` so the
  // UI can surface a small banner. Marks a flag so we never re-run.
  const runPerceptualMigration = async (items: WardrobeItem[]) => {
    const targets = items.filter(it => !!it.photoUri);
    if (targets.length === 0) {
      AsyncStorage.setItem(STORAGE_KEYS.perceptualMigrated, '1');
      return;
    }
    setBackfillProgress({ done: 0, total: targets.length });
    let done = 0;
    for (const it of targets) {
      try {
        const res = await fetch(it.photoUri);
        const blob = await res.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const idx = result.indexOf(',');
            resolve(idx >= 0 ? result.slice(idx + 1) : result);
          };
          reader.onerror = () => reject(new Error('FileReader failed'));
          reader.readAsDataURL(blob);
        });
        const apiRes = await apiRequest('POST', '/api/extract-color', {
          imageBase64: base64,
          colorFamily: it.colorFamily,
        });
        const data = await apiRes.json();
        if (data?.dominantHsl && data?.dominantLab) {
          // Persist this single item's refined values; centralises through
          // updateWardrobeItem so the consistency rule applies.
          setWardrobeItems(prev => {
            const next = prev.map(p => p.id === it.id
              ? { ...p, dominantHsl: data.dominantHsl, dominantLab: data.dominantLab }
              : p);
            AsyncStorage.setItem(STORAGE_KEYS.wardrobe, JSON.stringify(next));
            return next;
          });
        }
      } catch (e) {
        // Silent — item keeps its centroid values. Log for diagnostics.
        console.warn(`[perceptual-migration] skipped item ${it.id}:`, (e as Error)?.message);
      }
      done += 1;
      setBackfillProgress({ done, total: targets.length });
    }
    AsyncStorage.setItem(STORAGE_KEYS.perceptualMigrated, '1');
    // Clear banner after a short delay so the user sees the final count.
    setTimeout(() => setBackfillProgress(null), 1500);
  };

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfile(prev => {
      const updated = { ...prev, ...updates, constraints: { ...prev.constraints, ...(updates.constraints ?? {}) } };
      AsyncStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(updated));
      if (currentUserIdRef.current) {
        upsertUserProfile({
          id: currentUserIdRef.current,
          name: updated.name || undefined,
          body_type: updated.bodyType ?? undefined,
          eye_color: updated.eyeColor ?? undefined,
          skin_tone: updated.skinTone ?? undefined,
          undertone: updated.undertone ?? undefined,
          style_goals: [updated.styleGoalPrimary, updated.styleGoalSecondary].filter(Boolean) as string[],
          secondary_goal: updated.styleGoalSecondary ?? undefined,
          lifestyle: { work: updated.lifestyleWork, casual: updated.lifestyleCasual, events: updated.lifestyleEvents, active: updated.lifestyleActive ?? 0, brunch: updated.lifestyleBrunch ?? 0 },
          constraints: {
            noSleeveless: updated.constraints?.noSleeveless ?? false,
            noShortSkirts: updated.constraints?.noShortSkirts ?? false,
            maxHeelHeight: updated.constraints?.maxHeelHeight ?? 'any',
            colorAversions: updated.constraints?.colorAversions ?? [],
            _profile: {
              hairColor: updated.hairColor ?? null,
              heightBand: updated.heightBand ?? null,
              faceShape: updated.faceShape ?? null,
              contrastLevel: updated.contrastLevel ?? null,
              metalPreference: updated.metalPreference ?? null,
              defaultMood: updated.defaultMood ?? null,
              industry: updated.industry ?? null,
              lifePhase: updated.lifePhase ?? null,
              tempUnit: updated.tempUnit ?? null,
              weatherEnabled: updated.weatherEnabled ?? null,
            },
          },
          onboarding_complete: updated.onboardingComplete,
        }).catch(console.error);
      }
      return updated;
    });
  }, []);

  const clearLastAddedSuggestions = useCallback(() => setLastAddedSuggestions([]), []);

  // ── Weather (Open-Meteo, no API key) ─────────────────────────────────────
  // Cached snapshot loads instantly on mount; a fresh fetch runs in the
  // background. When the user disables the toggle we drop the cache so we
  // never silently keep a stale forecast in memory.
  const refreshWeather = useCallback(async () => {
    setWeatherLoading(true);
    try {
      const fresh = await loadWeather(true);
      if (fresh) setWeather(fresh);
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  useEffect(() => {
    // Wait until persisted profile has hydrated — otherwise an opted-out user
    // could still get a permission prompt / network fetch on cold boot
    // because `defaultProfile.weatherEnabled` reads as undefined → "on".
    if (isLoading) return;
    if (profile.weatherEnabled === false) return;
    let cancelled = false;
    (async () => {
      const cached = await getCachedWeather();
      if (!cancelled && cached) setWeather(cached);
      // Show "Reading weather…" on the Home chip until the first forecast
      // resolves on cold boot, not just when the user manually refreshes.
      if (!cached) setWeatherLoading(true);
      try {
        const fresh = await loadWeather(false);
        if (!cancelled && fresh) setWeather(fresh);
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isLoading, profile.weatherEnabled]);

  const setWeatherEnabled = useCallback((enabled: boolean) => {
    setProfile(prev => {
      const updated = { ...prev, weatherEnabled: enabled };
      AsyncStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(updated));
      return updated;
    });
    if (!enabled) {
      setWeather(null);
      clearCachedWeather();
    } else {
      // Kick off a fresh fetch so the chip lights up right away.
      refreshWeather();
    }
  }, [refreshWeather]);

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
      heroId: outfit.heroId,
    };
    setWearHistory(prev => {
      const updated = [entry, ...prev];
      AsyncStorage.setItem(STORAGE_KEYS.wearHistory, JSON.stringify(updated));
      if (currentUserIdRef.current) {
        insertWearLog({
          user_id: currentUserIdRef.current,
          outfit_fingerprint: fp,
          item_ids: itemIds,
          occasion: outfit.scenario,
        }).catch(console.error);
        itemIds.forEach(itemId => {
          insertAffinitySignal({
            user_id: currentUserIdRef.current!,
            item_id: itemId,
            signal_type: 'worn',
            weight: 1,
          }).catch(console.error);
        });
      }
      return updated;
    });
  }, []);

  const undoWear = useCallback((entryId: string) => {
    setWearHistory(prev => {
      const updated = prev.filter(e => e.id !== entryId);
      AsyncStorage.setItem(STORAGE_KEYS.wearHistory, JSON.stringify(updated));
      if (currentUserIdRef.current) {
        deleteWearLog(entryId).catch(console.error);
      }
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
      if (currentUserIdRef.current) {
        const itemIds = outfit.components.map(c => c.matchedItemId).filter((id): id is string => Boolean(id));
        const signalType = type === 'love' ? 'love' : 'not_today';
        const weight = type === 'love' ? 1 : -0.5;
        itemIds.forEach(itemId => {
          insertAffinitySignal({
            user_id: currentUserIdRef.current!,
            item_id: itemId,
            signal_type: signalType,
            weight,
          }).catch(console.error);
        });
        for (let i = 0; i < itemIds.length; i++) {
          for (let j = i + 1; j < itemIds.length; j++) {
            insertPairAffinitySignal({
              user_id: currentUserIdRef.current!,
              item_id_a: itemIds[i],
              item_id_b: itemIds[j],
              signal_type: signalType,
              weight,
            }).catch(console.error);
          }
        }
      }
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

  const addWardrobeItem = useCallback((item: Omit<WardrobeItem, 'createdAt'> & { id?: string }) => {
    const newItem: WardrobeItem = {
      ...item,
      id: item.id ?? Crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    setWardrobeItems(prev => {
      const updated = [...prev, newItem];
      AsyncStorage.setItem(STORAGE_KEYS.wardrobe, JSON.stringify(updated));
      if (currentUserIdRef.current) {
        insertWardrobeItem({
          id: newItem.id,
          user_id: currentUserIdRef.current,
          garment_type: newItem.category,
          sub_type: newItem.subType,
          color_family: newItem.colorFamily,
          description: newItem.description,
          occasion: newItem.occasionTags,
          image_url: newItem.photoUri,
          cleaned_image_url: (newItem as any).cleanedImageUrl,
        }).catch(console.error);
      }
      const suggestions = generateOutfitsForItem(newItem, updated, profile, weather);
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
  }, [profile, weather]);

  const removeWardrobeItem = useCallback((id: string) => {
    if (currentUserIdRef.current) {
      deleteWardrobeItem(id).catch(console.error);
      const item = wardrobeItems.find(i => i.id === id);
      if (item?.photoUri) {
        deleteWardrobeImage(currentUserIdRef.current!, id).catch(console.warn);
      }
    } else {
      runGuestRemoval(id, wardrobeItems, FileSystem.documentDirectory, FileSystem.deleteAsync).catch(console.warn);
    }
    setWardrobeItems(prev => {
      const updated = prev.filter(item => item.id !== id);
      AsyncStorage.setItem(STORAGE_KEYS.wardrobe, JSON.stringify(updated));
      const blueprint = getProfileBlueprint(profile);
      const activeUpdated = isPremium ? updated : updated.slice(0, FREE_ITEM_CAP);
      const refreshedSlots = initializeSlots(activeUpdated, blueprint);
      setRecommendationSlots(refreshedSlots);
      AsyncStorage.setItem(STORAGE_KEYS.slots, JSON.stringify(
        refreshedSlots.map(s => ({ id: s.id, status: s.status, matchedItemId: s.matchedItemId }))
      ));
      return updated;
    });
  }, [profile, isPremium, wardrobeItems]);

  const updateWardrobeItem = useCallback((id: string, updates: Partial<Omit<WardrobeItem, 'id' | 'createdAt'>>) => {
    setWardrobeItems(prev => {
      const next = prev.map(item => {
        if (item.id !== id) return item;
        const merged = { ...item, ...updates };
        // Consistency rule: when the user changes colorFamily without supplying
        // fresh perceptual values, reseed dominantHsl/Lab from the centroid of
        // the new family. Otherwise the scorer would keep using stale values
        // sampled from an image whose colour the user has just overridden.
        if (
          updates.colorFamily !== undefined &&
          updates.colorFamily !== item.colorFamily &&
          updates.dominantHsl === undefined &&
          updates.dominantLab === undefined
        ) {
          const hsl = centroidHsl(updates.colorFamily);
          merged.dominantHsl = hsl;
          merged.dominantLab = hslToLab(hsl.h, hsl.s, hsl.l);
        }
        return merged;
      });
      AsyncStorage.setItem(STORAGE_KEYS.wardrobe, JSON.stringify(next));
      // Edits to category / sub-type / colour can change which blueprint slot
      // an item satisfies under strict matching. Recompute slot ownership so
      // Blueprint progress, Outfit Ideas, and Smart Buy stay in sync.
      const matcherFieldChanged =
        updates.category !== undefined ||
        updates.subType !== undefined ||
        updates.colorFamily !== undefined;
      if (matcherFieldChanged) {
        const blueprint = getProfileBlueprint(profile);
        const activeNext = isPremium ? next : next.slice(0, FREE_ITEM_CAP);
        const refreshedSlots = initializeSlots(activeNext, blueprint);
        setRecommendationSlots(refreshedSlots);
        AsyncStorage.setItem(STORAGE_KEYS.slots, JSON.stringify(
          refreshedSlots.map(s => ({ id: s.id, status: s.status, matchedItemId: s.matchedItemId }))
        ));
      }
      return next;
    });
  }, [profile, isPremium]);

  const togglePremium = useCallback(() => {
    setIsPremium(prev => {
      const updated = !prev;
      AsyncStorage.setItem(STORAGE_KEYS.premium, JSON.stringify(updated));
      if (currentUserIdRef.current) {
        upsertUserProfile({ id: currentUserIdRef.current, premium: updated }).catch(console.error);
      }
      return updated;
    });
  }, []);

  // ── Rotation-based outfit generation ─────────────────────────────────────────

  // The slice of wardrobeItems that is active for display and outfit/slot
  // computation. Free users see only the first FREE_ITEM_CAP items; all
  // items are still persisted so upgrading restores the full wardrobe.
  const activeWardrobeItems = useMemo(
    () => isPremium
      ? wardrobeItems
      : wardrobeItems.slice(0, profile.isGuest ? GUEST_ITEM_CAP : FREE_ITEM_CAP),
    [isPremium, profile.isGuest, wardrobeItems],
  );

  const affinityState = useMemo(
    () => computeAffinity(reactions, wearHistory, todayString()),
    [reactions, wearHistory],
  );

  const outfitPool = useMemo(
    () => generateOutfitPool(
      activeWardrobeItems, profile, todayMood, reactions, todayString(), wearHistory, affinityState, weather,
    ),
    [activeWardrobeItems, profile, todayMood, reactions, wearHistory, affinityState, weather],
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
    if (activeWardrobeItems.length === 0) return [];
    const today = todayString();
    const { outfits } = applyDailyRotation(outfitPool, rotationState, today, recentWornFingerprints, isPremium, profile.isGuest);
    return outfits;
  }, [outfitPool, rotationState, activeWardrobeItems.length, recentWornFingerprints, isPremium]);

  useEffect(() => {
    if (isLoading || activeWardrobeItems.length === 0) return;
    const today = todayString();
    const newHash = computePoolHash(activeWardrobeItems, profile, todayMood, weather);
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
    const { newState } = applyDailyRotation(outfitPool, baseState, today, recentWornFingerprints, isPremium, profile.isGuest);
    const stateToSave: RotationState = { ...newState, poolHash: newHash };
    setRotationState(stateToSave);
    AsyncStorage.setItem(STORAGE_KEYS.rotation, JSON.stringify(stateToSave));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWardrobeItems, profile, todayMood, outfitPool, rotationState.poolHash, rotationState.lastDate, isLoading, recentWornFingerprints, weather]);

  const itemCap = isPremium ? Infinity : profile.isGuest ? GUEST_ITEM_CAP : FREE_ITEM_CAP;
  const canAddItem = wardrobeItems.length < itemCap;
  const starterRecommendations = useMemo(() => getFirstNeededByCategory(recommendationSlots), [recommendationSlots]);
  const lifestyleSlotGroups = useMemo(
    () => getLifestyleGatedSlots(
      recommendationSlots,
      profile.lifestyleActive ?? 0,
      profile.lifestyleBrunch ?? 0,
      profile.lifestyleEvents ?? 0,
    ),
    [recommendationSlots, profile.lifestyleActive, profile.lifestyleBrunch, profile.lifestyleEvents],
  );

  // ── Profile completeness / nudge ─────────────────────────────────────────────

  const profileCompleteness = useMemo(() => computeProfileCompleteness(profile), [profile]);

  const dismissProfileNudge = useCallback(() => {
    updateProfile({ dismissedProfileNudge: todayString() });
  }, [updateProfile]);

  const missingDimensions = useMemo(() => missingScoringDimensions(profile), [profile]);

  // ── Saved looks ──────────────────────────────────────────────────────────────

  const persistSavedLooks = (looks: SavedLook[]) => {
    AsyncStorage.setItem(STORAGE_KEYS.savedLooks, JSON.stringify(looks));
  };

  const toggleSavedLook = useCallback((lookId: string) => {
    setSavedLooks(prev => {
      const exists = prev.some(l => l.id === lookId);
      const savedAt = new Date().toISOString();
      const updated = exists
        ? prev.filter(l => l.id !== lookId)
        : [{ id: lookId, savedAt }, ...prev];
      persistSavedLooks(updated);
      if (currentUserIdRef.current) {
        if (exists) {
          deleteSavedLook(currentUserIdRef.current, lookId).catch(console.warn);
        } else {
          upsertSavedLook({
            user_id: currentUserIdRef.current,
            id: lookId,
            saved_at: savedAt,
          }).catch(console.warn);
        }
      }
      return updated;
    });
  }, []);

  const isLookSaved = useCallback(
    (lookId: string) => savedLooks.some(l => l.id === lookId),
    [savedLooks],
  );

  const renameSavedLook = useCallback((lookId: string, name: string) => {
    setSavedLooks(prev => {
      const trimmed = name.trim();
      const existing = prev.find(l => l.id === lookId);
      const updated = prev.map(l =>
        l.id === lookId ? { ...l, customName: trimmed.length > 0 ? trimmed : undefined } : l,
      );
      persistSavedLooks(updated);
      if (currentUserIdRef.current && existing) {
        upsertSavedLook({
          user_id: currentUserIdRef.current,
          id: lookId,
          custom_name: trimmed.length > 0 ? trimmed : null,
          saved_at: existing.savedAt,
        }).catch(console.warn);
      }
      return updated;
    });
  }, []);

  const getSavedLookName = useCallback(
    (lookId: string, fallback: string) => {
      const entry = savedLooks.find(l => l.id === lookId);
      return entry?.customName && entry.customName.length > 0 ? entry.customName : fallback;
    },
    [savedLooks],
  );

  const shouldShowProfileNudge = useMemo(() => {
    if (profile.dismissedProfileNudge === todayString()) return false;
    // Dimension-aware: only prompt when a scoring dimension would silently
    // score zero — not just because completeness is below an arbitrary %.
    const silentlyZero = missingDimensions.filter(d => d !== 'personalization');
    return silentlyZero.length > 0;
  }, [missingDimensions, profile.dismissedProfileNudge]);

  const topItems = useMemo(() => topAffinityItems(affinityState, 5), [affinityState]);
  const topPairs = useMemo(() => topAffinityPairs(affinityState, 5), [affinityState]);
  const affinityActive = affinityState.signalCount >= MIN_SIGNALS_TO_APPLY;

  const value = useMemo(() => ({
    profile, updateProfile, wardrobeItems, activeWardrobeItems, addWardrobeItem, removeWardrobeItem, updateWardrobeItem,
    isPremium, togglePremium, outfitSets, lastAddedSuggestions, clearLastAddedSuggestions,
    isLoading, appReady, isAuthenticated, canAddItem, recommendationSlots, starterRecommendations, lifestyleSlotGroups,
    wearHistory, todaysWear, logWear, undoWear, getItemWearCount, isWornToday,
    todayMood, setTodayMood, reactions, reactToOutfit, clearOutfitReaction, getOutfitReaction,
    profileCompleteness, missingDimensions, dismissProfileNudge, shouldShowProfileNudge,
    savedLooks, toggleSavedLook, isLookSaved, renameSavedLook, getSavedLookName,
    backfillProgress,
    affinityState, affinityActive,
    affinitySignalCount: affinityState.signalCount,
    topAffinityItems: topItems, topAffinityPairs: topPairs,
    weather, weatherLoading, refreshWeather, setWeatherEnabled,
    isGuest: profile.isGuest === true,
  }), [profile, updateProfile, wardrobeItems, activeWardrobeItems, addWardrobeItem, removeWardrobeItem, updateWardrobeItem,
       isPremium, togglePremium, outfitSets, lastAddedSuggestions, clearLastAddedSuggestions,
       isLoading, appReady, isAuthenticated, canAddItem, recommendationSlots, starterRecommendations, lifestyleSlotGroups,
       wearHistory, todaysWear, logWear, undoWear, getItemWearCount, isWornToday,
       todayMood, setTodayMood, reactions, reactToOutfit, clearOutfitReaction, getOutfitReaction,
       profileCompleteness, missingDimensions, dismissProfileNudge, shouldShowProfileNudge,
       savedLooks, toggleSavedLook, isLookSaved, renameSavedLook, getSavedLookName,
       backfillProgress, affinityState, affinityActive, topItems, topPairs,
       weather, weatherLoading, refreshWeather, setWeatherEnabled]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
