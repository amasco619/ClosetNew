import {
  StyleSheet, Text, View, ScrollView, Pressable, ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useApp, OutfitSet, OutfitComponent } from '@/contexts/AppContext';
import { usesConfirmedCoordinatedSet } from '../../lib/stylingRelationships';
import Colors from '@/constants/colors';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { OccasionTag, WearEntry, MoodGoal, ReactionType, WardrobeItem } from '@/constants/types';
import * as Haptics from 'expo-haptics';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import OOTDStoryCard from '@/components/OOTDStoryCard';
import { computeItemCpw, formatCpw } from '@/constants/cpw';
import { rs } from '../../lib/responsive';
import OccasionPlanner, { type ConciergeAccess } from '../../components/OccasionPlanner';
import { GarmentTile } from '@/components/GarmentTile';
import { useToast } from '@/contexts/LuxuryFeedbackContext';
import TravelPlanner from '../../components/TravelPlanner';
import { CONCIERGE_OCCASIONS, conciergeReadiness, parseConciergeIntent, type ConciergeIntent } from '../../lib/concierge';
import { defaultTempUnit, formatTemp, formatTempValue } from '@/constants/weather';
import { wardrobeValueLabel } from '@/constants/wardrobeLabels';

const MOOD_OPTIONS: { id: MoodGoal; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { id: 'confident', label: 'Confident', icon: 'flash-outline' },
  { id: 'soft',      label: 'Soft',      icon: 'cloud-outline' },
  { id: 'joyful',    label: 'Joyful',    icon: 'sunny-outline' },
  { id: 'grounded',  label: 'Grounded',  icon: 'leaf-outline' },
  { id: 'romantic',  label: 'Romantic',  icon: 'rose-outline' },
  { id: 'powerful',  label: 'Powerful',  icon: 'trophy-outline' },
];

const FREE_SCENARIOS: OccasionTag[] = ['work', 'casual', 'date-casual', 'date-dressy', 'event', 'brunch', 'active'];
const PREMIUM_SCENARIOS: OccasionTag[] = ['interview', 'wedding', 'traditional-event', 'travel', 'resort', 'night-out'];

const REWEAR_THRESHOLDS: Record<OccasionTag, number> = {
  work:          7,
  casual:        7,
  'date-casual': 7,
  'date-dressy': 14,
  event:         14,
  interview:     21,
  wedding:             21,
  'traditional-event': 21,
  travel:              0,
  brunch:        7,
  active:        3,
  resort:        14,
  'night-out':   7,
} satisfies Record<OccasionTag, number>;

// Accent colours per scenario — drives the left card border + subtle tint
const SCENARIO_ACCENT: Record<OccasionTag, string> = {
  work:          Colors.primary,
  casual:        Colors.sage,
  'date-casual': '#B8748A',
  'date-dressy': Colors.secondary,
  event:         Colors.secondary,
  interview:     Colors.primary,
  wedding:             '#B8748A',
  'traditional-event': '#C17B4A',
  travel:              Colors.sage,
  brunch:        Colors.sage,
  active:        '#5B8C5A',
  resort:        '#6BA3BE',
  'night-out':   '#7B5EA7',
} satisfies Record<OccasionTag, string>;

function getLastWornInfo(
  outfit: OutfitSet,
  wearHistory: WearEntry[],
): { daysAgo: number; date: string } | null {
  const fp = outfit.components
    .map(c => c.matchedItemId)
    .filter(Boolean)
    .sort()
    .join('|');
  if (!fp) return null;
  const today = new Date().toISOString().slice(0, 10);
  const matches = wearHistory
    .filter(e => e.outfitFingerprint === fp && e.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (matches.length === 0) return null;
  const lastDate = matches[0].date;
  const daysAgo = Math.round(
    (Date.now() - new Date(lastDate + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24),
  );
  return { daysAgo, date: lastDate };
}

const scenarioLabels: Record<OccasionTag, { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; mood: string }> = {
  work:          { label: 'Work',       icon: 'briefcase-outline',   mood: 'Sharp & polished' },
  casual:        { label: 'Casual',     icon: 'cafe-outline',        mood: 'Easy & effortless' },
  'date-casual': { label: 'Date · Day', icon: 'cafe-outline',        mood: 'Relaxed & charming' },
  'date-dressy': { label: 'Date Night', icon: 'heart-outline',       mood: 'Confident & feminine' },
  event:         { label: 'Event',      icon: 'sparkles-outline',    mood: 'Dressed to impress' },
  interview:     { label: 'Interview',  icon: 'mic-outline',         mood: 'Authoritative & calm' },
  wedding:             { label: 'Wedding',    icon: 'rose-outline',        mood: 'Elegant & celebratory' },
  'traditional-event': { label: 'Traditional', icon: 'star-outline',        mood: 'Rooted & radiant' },
  travel:              { label: 'Travel',     icon: 'airplane-outline',    mood: 'Chic & comfortable' },
  brunch:        { label: 'Brunch',     icon: 'sunny-outline',       mood: 'Effortlessly put-together' },
  active:        { label: 'Active',     icon: 'fitness-outline',     mood: 'Moves with you' },
  resort:        { label: 'Resort',     icon: 'umbrella-outline',    mood: 'Holiday ease, elevated' },
  'night-out':   { label: 'Night Out',  icon: 'moon-outline',        mood: 'Dressed to be remembered' },
} satisfies Record<OccasionTag, { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; mood: string }>;

const categoryLabels: Record<string, string> = {
  top: 'Top', bottom: 'Bottom', dress: 'Dress',
  outerwear: 'Layer', shoes: 'Shoes', bag: 'Bag', jewelry: wardrobeValueLabel('jewelry'),
};

const SCENARIO_EMPTY_HINT: Record<OccasionTag, string> = {
  active:              'Add leggings, a sports top, or training shoes and we\'ll build your active looks.',
  brunch:              'Add a relaxed blouse, midi skirt, or casual dress and we\'ll style your weekend brunch looks.',
  work:                'Add tailored trousers, blazers, or office-ready tops and we\'ll style polished work looks.',
  casual:              'Add everyday tops, denim, or casual dresses and we\'ll style relaxed everyday looks.',
  'date-casual':       'Add a casual dress or a flattering top-and-jeans combo and we\'ll style your day date looks.',
  'date-dressy':       'Add a statement dress or dressy separates and we\'ll style your evening date looks.',
  event:               'Add a dress or occasion-ready separates and we\'ll style standout event looks.',
  'traditional-event': 'Add a kaftan, gown, or lace piece and we\'ll style your traditional ceremony looks.',
  interview:           'Add a structured blazer, tailored trousers, or a polished blouse and we\'ll style authoritative interview looks.',
  wedding:             'Add an elegant dress, a refined skirt set, or formal separates and we\'ll style your wedding-guest looks.',
  travel:              'Add versatile knits, comfortable trousers, or a chic midi dress and we\'ll style polished travel looks.',
  resort:              'Add a sundress, linen separates, or a breezy co-ord and we\'ll style your resort holiday looks.',
  'night-out':         'Add a statement dress, sleek trousers, or a dressy top and we\'ll style your night-out looks.',
};

const categoryIcons: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  top: 'shirt-outline', bottom: 'resize-outline', dress: 'body-outline',
  outerwear: 'cloudy-outline', shoes: 'footsteps-outline',
  bag: 'bag-handle-outline', jewelry: 'diamond-outline',
};

function OutfitItemPhoto({ component, size = 80, isHero = false }: {
  component: OutfitComponent; size?: number; isHero?: boolean;
}) {
  const heroBorder = isHero
    ? { borderWidth: 2, borderColor: Colors.secondary }
    : { borderWidth: 1, borderColor: Colors.border };

  if (component.photoUri) {
    return (
      <GarmentTile
        uri={component.photoUri}
        variant="card"
        accessibilityLabel={`${component.category} garment in outfit`}
        style={[
          styles.itemPhoto,
          { width: size, height: size * 1.25, borderRadius: 14 },
          heroBorder,
        ]}
      />
    );
  }
  return (
    <View style={[
      styles.itemPhotoFallback,
      { width: size, height: size * 1.25, borderRadius: 14 },
      heroBorder,
    ]}>
      <Ionicons
        name={categoryIcons[component.category] || 'ellipse-outline'}
        size={size * 0.32}
        color={Colors.secondary}
      />
    </View>
  );
}

function OutfitCard({
  outfit,
  index,
  highlight = false,
  wornToday,
  wornTodayEntryId,
  onLogWear,
  onUndoWear,
  wearHistory,
  reaction,
  onReact,
  isPremium,
}: {
  outfit: OutfitSet;
  index: number;
  highlight?: boolean;
  wornToday: boolean;
  wornTodayEntryId?: string;
  onLogWear: (outfit: OutfitSet) => void;
  onUndoWear: (entryId: string) => void;
  wearHistory: WearEntry[];
  reaction: ReactionType | null;
  onReact: (outfit: OutfitSet, type: ReactionType) => void;
  isPremium: boolean;
}) {
  const toast = useToast();
  const scenario = scenarioLabels[outfit.scenario];
  const accent = SCENARIO_ACCENT[outfit.scenario] ?? Colors.secondary;
  const coreItems = outfit.components.filter(c =>
    ['top', 'bottom', 'dress'].includes(c.category)
  );
  const accessories = outfit.components.filter(c =>
    ['shoes', 'bag', 'jewelry', 'outerwear'].includes(c.category)
  );
  const hasOwnedItems = outfit.components.some(c => c.owned && c.matchedItemId);

  const lastWorn = getLastWornInfo(outfit, wearHistory);
  const threshold = REWEAR_THRESHOLDS[outfit.scenario];
  const showRewearAdvisor = lastWorn !== null && threshold > 0 && lastWorn.daysAgo < threshold;
  const halfThreshold = Math.ceil(threshold / 2);
  const rewearUrgent = lastWorn !== null && lastWorn.daysAgo < halfThreshold;

  // Premium: show the AI-generated rationale ("why this works for your
  // body type and palette"). Free: show only the short mood descriptor.
  const moodText = isPremium
    ? (outfit.rationale || scenario?.mood)
    : scenario?.mood;
  const storyRef = useRef<View>(null);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    Haptics.selectionAsync();
    setExporting(true);
    await new Promise<void>(resolve => setTimeout(resolve, 160));
    try {
      const uri = await captureRef(storyRef, {
        format: 'png',
        quality: 1.0,
        result: 'tmpfile',
      });
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share your look',
        UTI: 'public.png',
      });
    } catch (err) {
      console.error('[OOTD] Export failed:', err);
      toast.show({ message: 'Could not export this look. Please try again in a moment.' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 70).duration(280)}>
      <View style={[
        styles.outfitCard,
        { borderLeftColor: accent },
        highlight && styles.outfitCardHighlight,
        wornToday && styles.outfitCardWorn,
      ]}>

        {/* ── Card header ─────────────────────────────────────────── */}
        <View style={styles.cardHeader}>
          <View style={[styles.scenarioPill, { backgroundColor: accent + '14', borderColor: accent + '30' }]}>
            <Ionicons name={scenario?.icon || 'ellipse'} size={12} color={accent} />
            <Text style={[styles.scenarioPillText, { color: accent }]}>{scenario?.label}</Text>
          </View>
          {wornToday ? (
            <View style={styles.wornBadge}>
              <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
              <Text style={styles.wornBadgeText}>Worn today</Text>
            </View>
          ) : (
            <View style={styles.readyBadge}>
              <View style={styles.readyDot} />
              <Text style={styles.readyText}>Ready to wear</Text>
            </View>
          )}
        </View>

        {/* ── Mood phrase ─────────────────────────────────────────── */}
        {moodText ? (
          <Text style={styles.moodText}>{moodText}</Text>
        ) : null}

        {usesConfirmedCoordinatedSet(outfit) && (
          <View style={{ marginBottom: 12 }} accessible accessibilityRole="text" accessibilityLabel="Styled as a coordinated set">
            <Text style={[styles.scenarioPillText, { color: accent }]}>Styled as a set</Text>
          </View>
        )}

        {/* ── Rewear advisor ──────────────────────────────────────── */}
        {showRewearAdvisor && !wornToday && (
          <View style={[styles.rewearAdvisor, rewearUrgent && styles.rewearAdvisorUrgent]}>
            <Ionicons
              name={rewearUrgent ? 'time-outline' : 'refresh-circle-outline'}
              size={12}
              color={rewearUrgent ? '#92400E' : Colors.secondary}
            />
            <Text style={[styles.rewearAdvisorText, rewearUrgent && styles.rewearAdvisorTextUrgent]}>
              {rewearUrgent
                ? `Worn ${lastWorn!.daysAgo === 1 ? 'yesterday' : `${lastWorn!.daysAgo} days ago`} — let it breathe a little longer`
                : `Worn ${lastWorn!.daysAgo} days ago — almost ready to re-wear`}
            </Text>
          </View>
        )}

        {/* ── Core item photos ────────────────────────────────────── */}
        <View style={styles.photosRow}>
          {coreItems.map((comp, i) => {
            const isHero = !!outfit.heroId && comp.matchedItemId === outfit.heroId;
            return (
              <View key={`core-${i}`} style={styles.photoWrap}>
                <OutfitItemPhoto component={comp} size={86} isHero={isHero} />
                <Text style={styles.itemLabel} numberOfLines={1}>
                  {categoryLabels[comp.category] || comp.category}
                </Text>
                <Text style={styles.itemColor} numberOfLines={1}>{wardrobeValueLabel(comp.colorFamily)}</Text>
                {isHero && (
                  <View style={[styles.focalBadge, { borderColor: accent + '40' }]}>
                    <Text style={[styles.focalBadgeText, { color: accent }]}>Focal</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* ── Accessories ─────────────────────────────────────────── */}
        {accessories.length > 0 && (
          <View style={styles.accessoriesWrap}>
            <Text style={styles.accessoriesLabel}>Accessories</Text>
            <View style={styles.accessoriesRow}>
              {accessories.map((comp, i) => {
                const isHero = !!outfit.heroId && comp.matchedItemId === outfit.heroId;
                return (
                  <View key={`acc-${i}`} style={styles.accessoryWrap}>
                    <OutfitItemPhoto component={comp} size={50} isHero={isHero} />
                    <Text style={styles.accessoryLabel} numberOfLines={1}>
                      {categoryLabels[comp.category] || comp.category}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Actions ─────────────────────────────────────────────── */}
        {hasOwnedItems && (
          <View style={styles.actionsArea}>
            {wornToday ? (
              <Pressable
                style={({ pressed }) => [styles.undoWearBtn, pressed && { opacity: 0.7 }]}
                onPress={() => wornTodayEntryId && onUndoWear(wornTodayEntryId)}
              >
                <Ionicons name="return-up-back-outline" size={14} color={Colors.textSecondary} />
                <Text style={styles.undoWearText}>Undo</Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.logWearBtn, pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onLogWear(outfit); }}
              >
                <Ionicons name="calendar-outline" size={15} color={Colors.white} />
                <Text style={styles.logWearText}>Wearing this today</Text>
              </Pressable>
            )}
            <View style={styles.reactionRow}>
              <Pressable
                style={[styles.reactionBtn, reaction === 'love' && styles.reactionBtnLove]}
                onPress={() => { Haptics.selectionAsync(); onReact(outfit, 'love'); }}
                hitSlop={8}
              >
                <Ionicons
                  name={reaction === 'love' ? 'heart' : 'heart-outline'}
                  size={15}
                  color={reaction === 'love' ? '#DC2626' : Colors.textSecondary}
                />
                <Text style={[styles.reactionText, reaction === 'love' && { color: '#DC2626' }]}>Love</Text>
              </Pressable>
              <Pressable
                style={[styles.reactionBtn, reaction === 'not-today' && styles.reactionBtnSkip]}
                onPress={() => { Haptics.selectionAsync(); onReact(outfit, 'not-today'); }}
                hitSlop={8}
              >
                <Ionicons
                  name={reaction === 'not-today' ? 'close-circle' : 'close-circle-outline'}
                  size={15}
                  color={reaction === 'not-today' ? Colors.textSecondary : Colors.textLight}
                />
                <Text style={styles.reactionText}>Not today</Text>
              </Pressable>
            </View>
            <Pressable
              style={({ pressed }) => [styles.exportBtn, pressed && { opacity: 0.7 }]}
              onPress={handleExport}
              disabled={exporting}
            >
              <Ionicons name="share-outline" size={12} color={Colors.textSecondary} />
              <Text style={styles.exportBtnText}>
                {exporting ? 'Preparing...' : 'Export look'}
              </Text>
            </Pressable>
          </View>
        )}
        <View
          ref={storyRef}
          collapsable={false}
          style={{ position: 'absolute', left: -900, top: 0 }}
        >
          <OOTDStoryCard outfit={outfit} />
        </View>
      </View>
    </Animated.View>
  );
}

function JustAddedBanner({ suggestions, onDismiss }: {
  suggestions: OutfitSet[];
  onDismiss: () => void;
}) {
  const firstNewItem = suggestions[0]?.components[0];
  const label = firstNewItem
    ? `${wardrobeValueLabel(firstNewItem.colorFamily)} ${firstNewItem.subType.replace(/-/g, ' ')}`
    : 'new item';

  return (
    <Animated.View entering={FadeInUp.duration(280)} style={styles.bannerWrap}>
      <View style={styles.bannerHeader}>
        <View style={styles.bannerTitleRow}>
          <View style={styles.bannerIconWrap}>
            <Ionicons name="sparkles" size={14} color={Colors.secondary} />
          </View>
          <Text style={styles.bannerTitle}>Styled for your {label}</Text>
        </View>
        <Pressable onPress={onDismiss} hitSlop={10} style={styles.bannerDismiss}>
          <Ionicons name="close" size={16} color={Colors.textLight} />
        </Pressable>
      </View>
      <Text style={styles.bannerSubtitle}>How to wear it with what you already own</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.bannerScroll}
      >
        {suggestions.map((outfit) => (
          <View key={outfit.id} style={styles.bannerCard}>
            <View style={styles.bannerCardHeader}>
              <Ionicons
                name={scenarioLabels[outfit.scenario]?.icon || 'ellipse'}
                size={11}
                color={SCENARIO_ACCENT[outfit.scenario]}
              />
              <Text style={[styles.bannerCardScenario, { color: SCENARIO_ACCENT[outfit.scenario] }]}>
                {scenarioLabels[outfit.scenario]?.label}
              </Text>
            </View>
            <View style={styles.bannerPhotos}>
              {outfit.components.slice(0, 4).map((comp, j) => {
                const isHero = !!outfit.heroId && comp.matchedItemId === outfit.heroId;
                return (
                  <View key={j} style={styles.bannerPhotoWrap}>
                    <OutfitItemPhoto component={comp} size={52} isHero={isHero} />
                    {isHero && (
                      <Text style={styles.bannerHeroLabel}>Focal</Text>
                    )}
                  </View>
                );
              })}
            </View>
            <Text style={styles.bannerItemCount}>
              {outfit.components.length}-piece look
            </Text>
          </View>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

export default function OutfitsScreen() {
  const insets = useSafeAreaInsets();
  const {
    outfitSets,
    profile, weather, isAuthenticated, authenticatedUserId,
    refreshPremiumEntitlement, entitlementUnavailable,
    isLoading, appReady, dataUnavailable, startupError, retryInitialization,
    getStylingRecommendations,
    wardrobeItems,
    wardrobeTotalCount,
    wardrobeHasMore,
    loadAllWardrobeItems,
    activeWardrobeItems,
    isPremium,
    lastAddedSuggestions,
    clearLastAddedSuggestions,
    todaysWear,
    logWear,
    undoWear,
    isWornToday,
    wearHistory,
    todayMood,
    setTodayMood,
    reactToOutfit,
    getOutfitReaction,
    profileCompleteness,
    shouldShowProfileNudge,
    dismissProfileNudge,
    missingDimensions,
    getItemWearCount,
  } = useApp();
  const [cpwToast, setCpwToast] = useState<{ text: string } | null>(null);
  const [wardrobeLoadFailureKey, setWardrobeLoadFailureKey] = useState<string | null>(null);
  const [loadedWardrobeKey, setLoadedWardrobeKey] = useState<string | null>(null);
  const [loadRetry, setLoadRetry] = useState(0);
  const cpwToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wardrobeDataComplete = !wardrobeHasMore && wardrobeItems.length >= wardrobeTotalCount;
  const wardrobeLoadKey = JSON.stringify([authenticatedUserId, wardrobeItems.length, wardrobeTotalCount, wardrobeHasMore, loadRetry]);
  const wardrobeLoading = !wardrobeDataComplete && loadedWardrobeKey !== wardrobeLoadKey;
  const wardrobeLoadError = wardrobeLoadFailureKey === wardrobeLoadKey;
  useEffect(() => {
    let active = true;
    if (wardrobeDataComplete) {
      return () => { active = false; };
    }
    loadAllWardrobeItems()
      .catch(() => { if (active) setWardrobeLoadFailureKey(wardrobeLoadKey); })
      .finally(() => {
        if (active) {
          if (!wardrobeDataComplete) setWardrobeLoadFailureKey(wardrobeLoadKey);
          setLoadedWardrobeKey(wardrobeLoadKey);
        }
      });
    return () => { active = false; };
  }, [loadAllWardrobeItems, wardrobeDataComplete, wardrobeLoadKey]);

  function handleLogWear(outfit: OutfitSet) {
    logWear(outfit);
    const pricedItem = outfit.components
      .filter(c => c.matchedItemId && c.owned)
      .map(c => wardrobeItems.find((w: WardrobeItem) => w.id === c.matchedItemId))
      .filter((w): w is WardrobeItem => Boolean(w?.purchasePrice && (w.purchasePrice ?? 0) > 0))
      .sort((a: WardrobeItem, b: WardrobeItem) => (b.purchasePrice ?? 0) - (a.purchasePrice ?? 0))[0];
    if (pricedItem?.purchasePrice) {
      const newCount = getItemWearCount(pricedItem.id) + 1;
      const cpw = computeItemCpw(pricedItem.purchasePrice, newCount);
      if (cpw !== null) {
        const name = pricedItem.subType.replace(/-/g, ' ');
        const label = name.charAt(0).toUpperCase() + name.slice(1);
        setCpwToast({ text: `${label}: ${formatCpw(cpw)} per wear` });
        if (cpwToastTimer.current) clearTimeout(cpwToastTimer.current);
        cpwToastTimer.current = setTimeout(() => setCpwToast(null), 3000);
      }
    }
  }

  const [selectedScenario, setSelectedScenario] = useState<OccasionTag>('casual');
  const [traditionalOutfits, setTraditionalOutfits] = useState<OutfitSet[]>([]);
  const [traditionalNotice, setTraditionalNotice] = useState<string | null>(null);
  const [traditionalLoading, setTraditionalLoading] = useState(false);
  const [traditionalError, setTraditionalError] = useState(false);
  const [traditionalRetry, setTraditionalRetry] = useState(0);
  const [traditionalResolved, setTraditionalResolved] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [travelOpen, setTravelOpen] = useState(false);
  const closeTravel = useCallback(() => setTravelOpen(false), []);
  const [plannerAccess, setPlannerAccess] = useState<ConciergeAccess | 'denied'>('checking');
  const [conciergePlan, setConciergePlan] = useState<(ConciergeIntent & { owner: string }) | null>(null);
  const requestVersion = useRef(0);
  const intentRef = useRef<ConciergeIntent | null>(null);
  const identityRef = useRef({ isAuthenticated, authenticatedUserId });
  const actor = isAuthenticated ? authenticatedUserId : null;
  useLayoutEffect(() => {
    requestVersion.current += 1;
    identityRef.current = { isAuthenticated, authenticatedUserId };
  }, [actor, isAuthenticated, authenticatedUserId]);
  const clearConcierge = useCallback(() => {
    requestVersion.current += 1;
    if (intentRef.current) setSelectedScenario('casual');
    intentRef.current = null;
    setConciergePlan(null);
    setPlannerOpen(false);
  }, []);
  useFocusEffect(useCallback(() => () => { clearConcierge(); }, [clearConcierge]));
  useEffect(() => {
    // Clear account-specific planning state after the identity changes; the
    // render-time authorization gate already hides it before this cleanup.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Identity changes must revoke the previous account's transient concierge state.
    clearConcierge();
  }, [actor, clearConcierge]);
  const conciergeAuthorized = !!conciergePlan && isAuthenticated &&
    authenticatedUserId === conciergePlan.owner && isPremium && !entitlementUnavailable;
  useEffect(() => {
    if (conciergePlan && !conciergeAuthorized) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Entitlement loss must discard the in-memory premium plan.
      clearConcierge();
    }
  }, [conciergePlan, conciergeAuthorized, clearConcierge]);

  async function verifyConcierge(intent?: ConciergeIntent) {
    const version = ++requestVersion.current;
    const owner = identityRef.current.authenticatedUserId;
    if (!identityRef.current.isAuthenticated || !owner) {
      setPlannerAccess('sign-in');
      return;
    }
    setPlannerAccess('checking');
    const current = () => requestVersion.current === version &&
      identityRef.current.isAuthenticated && identityRef.current.authenticatedUserId === owner;
    try {
      const approved = await refreshPremiumEntitlement(true);
      if (!current()) return;
      if (!approved) { setPlannerAccess('denied'); return; }
      if (!intent) { setPlannerAccess('choose'); return; }
      const validated = parseConciergeIntent(intent);
      if (!validated) { setPlannerAccess('choose'); return; }
      intentRef.current = validated;
      setConciergePlan({ ...validated, owner });
      setSelectedScenario(validated.occasion);
      // A repeated Traditional brief is a new request, not a relabelled old card.
      setTraditionalOutfits([]);
      setTraditionalNotice(null);
      setTraditionalError(false);
      setTraditionalResolved(false);
      setTraditionalLoading(validated.occasion === 'traditional-event');
      setTraditionalRetry(count => count + 1);
      setPlannerOpen(false);
    } catch {
      if (current()) setPlannerAccess('unavailable');
    }
  }
  function openPlanner() {
    clearConcierge();
    setPlannerOpen(true);
    void verifyConcierge();
  }
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  useEffect(() => {
    if (
      selectedScenario !== 'traditional-event' ||
      !isPremium ||
      !wardrobeDataComplete ||
      wardrobeLoading ||
      wardrobeLoadError
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear premium-only styling data as soon as its access prerequisites are lost.
      setTraditionalLoading(false);
      setTraditionalResolved(false);
      setTraditionalError(false);
      setTraditionalOutfits([]);
      setTraditionalNotice(null);
      return;
    }

    let active = true;
    setTraditionalLoading(true);
    setTraditionalResolved(false);
    setTraditionalError(false);
    setTraditionalOutfits([]);
    setTraditionalNotice(null);

    getStylingRecommendations('traditional')
      .then(result => {
        if (!active) return;
        setTraditionalOutfits(result.outfits);
        setTraditionalResolved(true);
        setTraditionalNotice(result.notice ?? null);
      })
      .catch(() => {
        if (active) setTraditionalError(true);
      })
      .finally(() => {
        if (active) setTraditionalLoading(false);
      });

    return () => { active = false; };
  }, [
    selectedScenario,
    isPremium,
    wardrobeDataComplete,
    wardrobeLoading,
    wardrobeLoadError,
    getStylingRecommendations,
    traditionalRetry,
  ]);

  const filtered = conciergePlan && !conciergeAuthorized ? [] : selectedScenario === 'traditional-event'
    ? traditionalOutfits.filter(o => o.scenario === 'traditional-event')
    : outfitSets.filter(o => o.scenario === selectedScenario);
  const isPremiumScenario = PREMIUM_SCENARIOS.includes(selectedScenario);
  const hasWardrobe = activeWardrobeItems.length > 0;

  function handleScenarioPress(scenario: OccasionTag) {
    clearConcierge();
    if (PREMIUM_SCENARIOS.includes(scenario) && !isPremium) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      router.push('/premium');
    } else {
      Haptics.selectionAsync();
      setSelectedScenario(scenario);
    }
  }

  function getTodayEntryId(outfit: OutfitSet): string | undefined {
    const fp = outfit.components
      .map(c => c.matchedItemId)
      .filter(Boolean)
      .sort()
      .join('|');
    const today = new Date().toISOString().slice(0, 10);
    return todaysWear.find(e => e.date === today && e.outfitFingerprint === fp)?.id;
  }

  const activeAccent = SCENARIO_ACCENT[selectedScenario] ?? Colors.secondary;
  const planningState = conciergePlan ? conciergeReadiness({
    failed: wardrobeLoadError || dataUnavailable === true || startupError === true ||
      (selectedScenario === 'traditional-event' && traditionalError),
    loading: wardrobeLoading || isLoading === true || appReady === false ||
      (selectedScenario === 'traditional-event' && traditionalLoading),
    wardrobeComplete: wardrobeDataComplete,
    stylingComplete: selectedScenario !== 'traditional-event' || traditionalResolved,
    itemCount: activeWardrobeItems.length,
    resultCount: filtered.length,
  }) : null;
  const planningCopy = {
    loading: 'Checking your full wardrobe and styling this occasion…',
    failure: 'We could not complete your wardrobe or styling request. This is not a wardrobe gap.',
    insufficient: 'Your active wardrobe is empty. Add owned clothing, then try this occasion again.',
    empty: 'Your wardrobe was checked, but no complete owned look was returned for this occasion. Review your pieces or choose another occasion.',
    ready: `${filtered.length} ${filtered.length === 1 ? 'look is' : 'looks are'} ready from your wardrobe. Your existing style preferences have been kept.`,
  };
  const unit = profile?.tempUnit ?? defaultTempUnit();
  const weatherCopy = profile?.weatherEnabled === false ? 'Weather guidance is switched off.' : weather
    ? `Today: ${formatTemp(weather.currentTempC, unit)} · L${formatTempValue(weather.lowC, unit)}/H${formatTempValue(weather.highC, unit)}°${unit}.`
    : 'Current weather is unavailable; no warm or dry conditions are assumed.';
  const conciergeSummary = conciergeAuthorized && planningState && (
        <View testID={`concierge-result-${planningState}`} accessibilityLiveRegion="polite" aria-live="polite" style={styles.traditionalContext}>
          <View style={{ flex: 1 }}>
            <Text style={styles.premiumStripTitle}>{CONCIERGE_OCCASIONS.find(option => option.id === conciergePlan?.occasion)?.label} · Today</Text>
            <Text style={styles.traditionalContextText}>{planningCopy[planningState]}</Text>
            {['ready', 'empty', 'insufficient'].includes(planningState) && <Text style={styles.traditionalContextText}>{weatherCopy}</Text>}
            {planningState === 'failure' && <Pressable testID="concierge-result-retry" accessibilityRole="button"
              onPress={() => {
                if (dataUnavailable || startupError) retryInitialization();
                else { setLoadRetry(count => count + 1); setTraditionalRetry(count => count + 1); }
              }} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={styles.premiumStripTitle}>Try again</Text>
            </Pressable>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
              <Pressable testID="concierge-change" accessibilityRole="button" onPress={openPlanner} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={styles.premiumStripTitle}>Change occasion</Text>
              </Pressable>
              <Pressable testID="concierge-exit" accessibilityRole="button" onPress={clearConcierge} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={styles.premiumStripTitle}>Exit planning</Text>
              </Pressable>
            </View>
          </View>
        </View>
      );
  const conciergeControls = (
    <View style={{ marginHorizontal: 20, marginBottom: 12 }}>
      <Pressable testID="concierge-entry" accessibilityRole="button" accessibilityLabel="Plan an occasion today"
        onPress={openPlanner} style={({ pressed }) => [styles.premiumStrip, { minHeight: 44, marginHorizontal: 0 }, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}>
        <Ionicons name="sparkles-outline" size={18} color={Colors.secondary} />
        <Text style={styles.premiumStripTitle}>Plan an occasion</Text>
        <Text style={styles.premiumStripSub}>Today · Premium</Text>
      </Pressable>
      <Pressable testID="travel-entry" accessibilityRole="button" accessibilityLabel="Plan a temporary travel capsule"
        onPress={() => { clearConcierge(); setTravelOpen(true); }}
        style={({ pressed }) => [styles.premiumStrip, { minHeight: 44, marginHorizontal: 0, marginTop: 8 }, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}>
        <Ionicons name="bag-handle-outline" size={18} color={Colors.secondary} />
        <Text style={styles.premiumStripTitle}>Plan a travel capsule</Text>
        <Text style={styles.premiumStripSub}>Temporary · Premium</Text>
      </Pressable>
      {travelOpen && <TravelPlanner onClose={closeTravel} />}
      {plannerOpen && <OccasionPlanner
        access={plannerAccess === 'denied' ? (entitlementUnavailable ? 'unavailable' : 'not-entitled') : plannerAccess}
        onClose={clearConcierge} onRetry={() => { void verifyConcierge(); }}
        onSubmit={intent => { void verifyConcierge(intent); }}
        onSignIn={() => { clearConcierge(); router.push('/sign-in'); }}
        onUpgrade={() => { clearConcierge(); router.push('/premium'); }}
      />}
    </View>
  );

  if (!wardrobeDataComplete) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerLabel}>STYLED FOR YOU</Text>
            <Text style={styles.title}>Your Looks</Text>
          </View>
        </View>
        {conciergeControls}
        {conciergeSummary}
        {wardrobeLoading ? (
          <View style={styles.wardrobeLoading}>
            <ActivityIndicator color={Colors.secondary} size="large" />
            <Text style={styles.wardrobeLoadErrorText}>Loading your full wardrobe for accurate looks…</Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => { setLoadRetry(count => count + 1); }}
            style={styles.wardrobeLoadError}
          >
            <Text style={styles.wardrobeLoadErrorText}>
              {wardrobeLoadError ? 'Your full wardrobe could not be loaded. Tap to retry.' : 'Your full wardrobe is not available yet. Tap to retry.'}
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerLabel}>STYLED FOR YOU</Text>
          <Text style={styles.title}>Your Looks</Text>
        </View>
        {hasWardrobe && (
          <View style={[styles.outfitCountBadge, { backgroundColor: activeAccent + '14', borderColor: activeAccent + '30' }]}>
            <Text style={[styles.outfitCountText, { color: activeAccent }]}>
              {filtered.length} {filtered.length === 1 ? 'look' : 'looks'}
            </Text>
          </View>
        )}
      </View>

      {conciergeControls}
      {/* ── Scenario chips ──────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scenarioScroll}
        contentContainerStyle={styles.scenarioScrollContent}
      >
        {FREE_SCENARIOS.map(s => {
          const isActive = selectedScenario === s;
          const accent = SCENARIO_ACCENT[s];
          return (
            <Pressable
              key={s}
              style={({ pressed }) => [
                styles.scenarioChip,
                isActive && [styles.scenarioChipActive, { backgroundColor: accent, borderColor: accent }],
                pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
              ]}
              onPress={() => handleScenarioPress(s)}
            >
              <Ionicons
                name={scenarioLabels[s].icon}
                size={13}
                color={isActive ? Colors.white : Colors.textSecondary}
              />
              <Text style={[styles.scenarioText, isActive && styles.scenarioTextActive]}>
                {scenarioLabels[s].label}
              </Text>
            </Pressable>
          );
        })}

        <View style={styles.scenarioDivider} />

        {PREMIUM_SCENARIOS.map(s => {
          const isLocked = !isPremium;
          const isActive = selectedScenario === s;
          const accent = SCENARIO_ACCENT[s];
          return (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityLabel={s === 'traditional-event' ? 'Traditional styling' : scenarioLabels[s].label}
              accessibilityState={{ selected: isActive }}
              style={({ pressed }) => [
                styles.scenarioChip,
                styles.scenarioChipPremium,
                isActive && [styles.scenarioChipActive, { backgroundColor: accent, borderColor: accent }],
                isLocked && styles.scenarioChipLocked,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => handleScenarioPress(s)}
            >
              <Ionicons
                name={scenarioLabels[s].icon}
                size={13}
                color={isActive ? Colors.white : isLocked ? Colors.textLight : Colors.secondary}
              />
              <Text style={[
                styles.scenarioText,
                isActive && styles.scenarioTextActive,
                isLocked && styles.scenarioTextLocked,
              ]}>
                {scenarioLabels[s].label}
              </Text>
              {isLocked && (
                <Ionicons name="lock-closed" size={9} color={Colors.textLight} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Mood picker (premium) ────────────────────────────────────────── */}
      {hasWardrobe && isPremium && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.moodScroll}
          contentContainerStyle={styles.moodScrollContent}
        >
          <Text style={styles.moodPrompt}>Feeling</Text>
          {MOOD_OPTIONS.map(m => {
            const active = todayMood === m.id;
            return (
              <Pressable
                key={m.id}
                style={({ pressed }) => [
                  styles.moodChip,
                  active && styles.moodChipActive,
                  pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
                ]}
                onPress={() => { Haptics.selectionAsync(); setTodayMood(active ? null : m.id); }}
              >
                <Ionicons name={m.icon} size={12} color={active ? Colors.white : Colors.secondary} />
                <Text style={[styles.moodChipText, active && styles.moodChipTextActive]}>
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* ── Mood locked teaser (free) ────────────────────────────────────── */}
      {hasWardrobe && !isPremium && (
        <Pressable
          style={({ pressed }) => [styles.moodLockedStrip, pressed && { opacity: 0.75 }]}
          onPress={() => router.push('/premium')}
        >
          <Ionicons name="lock-closed" size={11} color={Colors.secondary} />
          <Text style={styles.moodLockedText}>Unlock mood filtering with Premium</Text>
          <Ionicons name="chevron-forward" size={12} color={Colors.secondary} />
        </Pressable>
      )}

      {/* ── Main scroll ─────────────────────────────────────────────────── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {conciergeSummary}
        {selectedScenario === 'traditional-event' && (
          <View
            style={styles.traditionalContext}
            accessible
            accessibilityRole="summary"
            accessibilityLabel="Style from your wardrobe with an African-first traditional occasion in mind."
          >
            <Ionicons name="information-circle-outline" size={16} color={SCENARIO_ACCENT['traditional-event']} />
            <Text style={styles.traditionalContextText}>
              Style from your wardrobe with an African-first traditional occasion in mind.
            </Text>
          </View>
        )}

        {/* Profile nudge */}
        {shouldShowProfileNudge && hasWardrobe && (
          <Animated.View entering={FadeInDown.delay(40).duration(280)} style={styles.profileNudge}>
            <View style={styles.nudgeIconWrap}>
              <Ionicons name="sparkles-outline" size={15} color={Colors.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nudgeTitle}>
                Style profile {Math.round(profileCompleteness * 100)}% complete
              </Text>
              <Text style={styles.nudgeSub}>
                {missingDimensions.length > 0
                  ? `Add ${missingDimensions.slice(0, 2).join(', ')} to sharpen recommendations.`
                  : 'A few more details sharpen every look.'}
              </Text>
              <View style={styles.nudgeActions}>
                <Pressable onPress={() => router.push('/(tabs)/profile?focus=refinements')} style={styles.nudgeCta}>
                  <Text style={styles.nudgeCtaText}>Refine</Text>
                  <Ionicons name="arrow-forward" size={11} color={Colors.secondary} />
                </Pressable>
                <Pressable onPress={dismissProfileNudge} hitSlop={8}>
                  <Text style={styles.nudgeDismiss}>Not now</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Premium upsell — shown at the top, never buried below outfit cards */}
        {!isPremium && hasWardrobe && !isPremiumScenario && (
          <Animated.View entering={FadeInDown.delay(80).duration(280)}>
            <Pressable
              style={({ pressed }) => [styles.premiumStrip, pressed && { opacity: 0.85 }]}
              onPress={() => router.push('/premium')}
            >
              <View style={styles.premiumStripIcon}>
                <Ionicons name="star" size={14} color={Colors.secondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.premiumStripTitle}>Unlock Resort, Night Out & more</Text>
                <Text style={styles.premiumStripSub}>Interview, Wedding, Travel — curated for every occasion</Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={Colors.secondary} />
            </Pressable>
          </Animated.View>
        )}

        {/* Just-added banner */}
        {!conciergePlan && lastAddedSuggestions.length > 0 && (
          <JustAddedBanner
            suggestions={lastAddedSuggestions}
            onDismiss={clearLastAddedSuggestions}
          />
        )}

        {cpwToast && (
          <Animated.View entering={FadeInUp.duration(250)} style={styles.cpwToast}>
            <Ionicons name="trending-down-outline" size={13} color={Colors.secondary} />
            <Text style={styles.cpwToastText}>{cpwToast.text}</Text>
          </Animated.View>
        )}

        {selectedScenario === 'traditional-event' && traditionalNotice && (
          <View
            style={styles.traditionalNotice}
            accessibilityLiveRegion="polite"
            accessibilityRole="text"
          >
            <Ionicons name="information-circle-outline" size={15} color={Colors.secondary} />
            <Text style={styles.traditionalNoticeText}>{traditionalNotice}</Text>
          </View>
        )}

        {conciergePlan && (!conciergeAuthorized || planningState === 'loading' || planningState === 'failure') ? null : selectedScenario === 'traditional-event' && traditionalLoading ? (
          <View
            style={styles.traditionalStatus}
            accessibilityRole="progressbar"
            accessibilityState={{ busy: true }}
            accessibilityLabel="Loading traditional occasion looks"
            accessibilityLiveRegion="polite"
          >
            <ActivityIndicator size="small" color={Colors.secondary} />
            <Text style={styles.traditionalStatusText}>Styling from your wardrobe…</Text>
          </View>
        ) : selectedScenario === 'traditional-event' && traditionalError ? (
          <View style={styles.traditionalError} accessibilityLiveRegion="polite">
            <Text style={styles.traditionalErrorText}>
              Traditional looks could not be loaded. Please try again.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry loading traditional looks"
              accessibilityState={{ disabled: traditionalLoading }}
              testID="traditional-retry"
              style={({ pressed }) => [styles.traditionalRetry, pressed && { opacity: 0.75 }]}
              onPress={() => setTraditionalRetry(count => count + 1)}
            >
              <Ionicons name="refresh-outline" size={14} color={Colors.primary} />
              <Text style={styles.traditionalRetryText}>Try again</Text>
            </Pressable>
          </View>
        ) : filtered.length === 0 ? (
          <Animated.View entering={FadeInDown.delay(120).duration(280)} style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons
                name={scenarioLabels[selectedScenario]?.icon || 'shirt-outline'}
                size={32}
                color={Colors.secondary}
              />
            </View>
            <Text style={styles.emptyTitle}>
              {hasWardrobe
                ? `No ${scenarioLabels[selectedScenario]?.label} looks yet`
                : 'Your wardrobe is empty'}
            </Text>
            <Text style={styles.emptySub}>
              {hasWardrobe
                ? (selectedScenario === 'traditional-event'
                  ? 'Your current wardrobe did not yield a complete look for this occasion. Add pieces you would like considered and we will try again.'
                  : (SCENARIO_EMPTY_HINT[selectedScenario] ?? `Add more items suited to ${scenarioLabels[selectedScenario]?.label.toLowerCase()} occasions and we'll style complete looks for you.`))
                : 'Start adding clothing and the app will build complete outfit suggestions from your wardrobe.'}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.emptyAction, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
              onPress={() => router.push('/add-item')}
            >
              <Ionicons name="add" size={16} color={Colors.white} />
              <Text style={styles.emptyActionText}>Add clothing item</Text>
            </Pressable>
          </Animated.View>
        ) : (
          filtered.map((outfit, i) => {
            const worn = isWornToday(outfit);
            const entryId = worn ? getTodayEntryId(outfit) : undefined;
            return (
              <OutfitCard
                key={outfit.id}
                outfit={outfit}
                index={i}
                wornToday={worn}
                wornTodayEntryId={entryId}
                onLogWear={handleLogWear}
                onUndoWear={undoWear}
                wearHistory={wearHistory}
                reaction={getOutfitReaction(outfit)}
                onReact={reactToOutfit}
                isPremium={isPremium}
              />
            );
          })
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  wardrobeLoadError: { padding: 9, marginHorizontal: 20, backgroundColor: Colors.error + '12', borderRadius: 10 },
  wardrobeLoadErrorText: { color: Colors.error, fontFamily: 'Inter_500Medium', fontSize: 12, textAlign: 'center' },
  wardrobeLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: 20, marginTop: 10, marginBottom: 16,
  },
  headerLabel: {
    fontFamily: 'Inter_400Regular', fontSize: rs(11), color: Colors.textLight,
    letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 4,
  },
  title: {
    fontFamily: 'Inter_700Bold', fontSize: rs(30), color: Colors.primary, letterSpacing: -0.8,
  },
  outfitCountBadge: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, marginBottom: 4,
  },
  outfitCountText: { fontFamily: 'Inter_600SemiBold', fontSize: rs(12), letterSpacing: 0.1 },

  // ── Scenario chips ────────────────────────────────────────────────────────
  scenarioScroll: { flexGrow: 0, marginBottom: 12, minHeight: 42 },
  scenarioScrollContent: { paddingHorizontal: 20, gap: 7, alignItems: 'flex-start' },
  scenarioDivider: { width: 1, height: 24, backgroundColor: Colors.border, marginHorizontal: 2 },

  scenarioChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 9, paddingHorizontal: 14, borderRadius: 20,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
    minHeight: 38,
  },
  scenarioChipActive: {},
  scenarioChipPremium: { borderColor: Colors.secondary + '55' },
  scenarioChipLocked: { opacity: 0.55 },
  scenarioText: { fontFamily: 'Inter_500Medium', fontSize: rs(12), color: Colors.textSecondary },
  scenarioTextActive: { color: Colors.white, fontFamily: 'Inter_600SemiBold' },
  scenarioTextLocked: { color: Colors.textLight },

  // ── Mood row ──────────────────────────────────────────────────────────────
  moodScroll: { flexGrow: 0, marginBottom: 12, minHeight: 42 },
  moodScrollContent: { paddingHorizontal: 20, gap: 8, alignItems: 'flex-start' },
  moodPrompt: {
    fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.textSecondary, marginRight: 2,
    lineHeight: 36, alignSelf: 'center',
  },
  moodChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.secondary + '40',
    minHeight: 36,
  },
  moodChipActive: { backgroundColor: Colors.secondary, borderColor: Colors.secondary },
  moodChipText: { fontFamily: 'Inter_500Medium', fontSize: rs(12), color: Colors.secondary },
  moodChipTextActive: { color: Colors.white },

  moodLockedStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 12,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
    backgroundColor: Colors.secondary + '08',
    borderWidth: 1, borderColor: Colors.secondary + '20',
  },
  moodLockedText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: rs(12), color: Colors.secondary },

  // ── Main scroll ───────────────────────────────────────────────────────────
  scrollContent: { paddingHorizontal: 20 },
  traditionalContext: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 9,
    paddingHorizontal: 13, paddingVertical: 11, marginBottom: 14,
    borderRadius: 12, backgroundColor: '#C17B4A0C',
    borderWidth: 1, borderColor: '#C17B4A24',
  },
  traditionalContextText: {
    flex: 1, fontFamily: 'Inter_400Regular', fontSize: rs(12),
    color: Colors.textSecondary, lineHeight: 17,
  },
  traditionalNotice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 12, marginBottom: 12, borderRadius: 12,
    backgroundColor: Colors.secondary + '0D',
    borderWidth: 1, borderColor: Colors.secondary + '24',
  },
  traditionalNoticeText: {
    flex: 1, fontFamily: 'Inter_400Regular', fontSize: rs(12),
    color: Colors.textSecondary, lineHeight: 17,
  },
  traditionalStatus: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 24, marginTop: 8,
  },
  traditionalStatusText: {
    fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.textSecondary,
  },
  traditionalError: {
    alignItems: 'center', padding: 18, marginTop: 8, borderRadius: 16,
    backgroundColor: Colors.error + '0A', borderWidth: 1, borderColor: Colors.error + '24',
  },
  traditionalErrorText: {
    fontFamily: 'Inter_500Medium', fontSize: rs(13), color: Colors.textSecondary,
    lineHeight: 19, textAlign: 'center',
  },
  traditionalRetry: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingHorizontal: 16, marginTop: 10, borderRadius: 12,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  traditionalRetryText: {
    fontFamily: 'Inter_600SemiBold', fontSize: rs(12), color: Colors.primary,
  },

  // ── Profile nudge ─────────────────────────────────────────────────────────
  profileNudge: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: Colors.secondary + '08', borderRadius: 16,
    padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: Colors.secondary + '20',
  },
  nudgeIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: Colors.secondary + '15', alignItems: 'center', justifyContent: 'center',
  },
  nudgeTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(13), color: Colors.primary, marginBottom: 2 },
  nudgeSub: { fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.textSecondary, lineHeight: 17 },
  nudgeActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  nudgeCta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nudgeCtaText: { fontFamily: 'Inter_600SemiBold', fontSize: rs(12), color: Colors.secondary },
  nudgeDismiss: { fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.textLight },

  // ── Premium strip (top of scroll) ─────────────────────────────────────────
  premiumStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.secondary + '10',
    borderRadius: 16, padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: Colors.secondary + '30',
  },
  premiumStripIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.secondary + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  premiumStripTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(13), color: Colors.primary, letterSpacing: -0.1 },
  premiumStripSub: { fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.textSecondary, marginTop: 2 },

  // ── Just-added banner ─────────────────────────────────────────────────────
  bannerWrap: {
    backgroundColor: Colors.secondary + '10',
    borderRadius: 18, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.secondary + '28',
  },
  bannerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  bannerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  bannerIconWrap: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: Colors.secondary + '18', alignItems: 'center', justifyContent: 'center',
  },
  bannerTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(13), color: Colors.primary, flex: 1 },
  bannerDismiss: { padding: 4 },
  bannerSubtitle: { fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.textSecondary, marginBottom: 14, lineHeight: 17 },
  bannerScroll: { gap: 10 },
  bannerCard: {
    width: 156, backgroundColor: Colors.white, borderRadius: 14,
    padding: 12, borderWidth: 1, borderColor: Colors.border,
    shadowColor: Colors.primary, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },
  bannerCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  bannerCardScenario: { fontFamily: 'Inter_600SemiBold', fontSize: rs(11), textTransform: 'capitalize', letterSpacing: 0.1 },
  bannerPhotos: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 8 },
  bannerPhotoWrap: {},
  bannerHeroLabel: { fontFamily: 'Inter_500Medium', fontSize: rs(9), color: Colors.secondary, textAlign: 'center', marginTop: 2 },
  bannerItemCount: { fontFamily: 'Inter_400Regular', fontSize: rs(11), color: Colors.textLight },

  // ── Outfit card ───────────────────────────────────────────────────────────
  outfitCard: {
    backgroundColor: Colors.white,
    borderRadius: 20, borderLeftWidth: 4,
    borderWidth: 1, borderColor: Colors.border,
    padding: 18, marginBottom: 14,
    shadowColor: Colors.primary, shadowOpacity: 0.05, shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 }, elevation: 2,
    overflow: 'hidden',
  },
  outfitCardHighlight: {
    borderColor: Colors.secondary + '40',
    shadowColor: Colors.secondary, shadowOpacity: 0.1,
  },
  outfitCardWorn: {
    borderColor: Colors.success + '35',
    shadowColor: Colors.success, shadowOpacity: 0.07,
  },

  cardHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  scenarioPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
    borderWidth: 1,
  },
  scenarioPillText: { fontFamily: 'Inter_600SemiBold', fontSize: rs(11), letterSpacing: 0.1 },

  readyBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  readyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  readyText: { fontFamily: 'Inter_500Medium', fontSize: rs(11), color: Colors.success },

  wornBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.success + '12', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10,
  },
  wornBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: rs(11), color: Colors.success },

  moodText: {
    fontFamily: 'Inter_400Regular', fontSize: rs(13), color: Colors.textSecondary,
    fontStyle: 'italic', lineHeight: 18, marginBottom: 14, letterSpacing: 0.1,
  },

  rewearAdvisor: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.secondary + '10', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 7, marginBottom: 14,
    borderWidth: 1, borderColor: Colors.secondary + '25',
  },
  rewearAdvisorUrgent: { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' },
  rewearAdvisorText: {
    fontFamily: 'Inter_400Regular', fontSize: rs(11), color: Colors.secondary, flex: 1, lineHeight: 15,
  },
  rewearAdvisorTextUrgent: { color: '#92400E' },

  photosRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  photoWrap: { alignItems: 'center', flex: 1 },
  itemPhoto: { marginBottom: 7 },
  itemPhotoFallback: {
    backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', marginBottom: 7,
  },
  itemLabel: {
    fontFamily: 'Inter_600SemiBold', fontSize: rs(11), color: Colors.primary,
    textTransform: 'capitalize', textAlign: 'center',
  },
  itemColor: {
    fontFamily: 'Inter_400Regular', fontSize: rs(10), color: Colors.textSecondary,
    textTransform: 'capitalize', marginTop: 2, textAlign: 'center',
  },
  focalBadge: {
    marginTop: 5, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
    borderWidth: 1, backgroundColor: 'transparent',
  },
  focalBadgeText: { fontFamily: 'Inter_500Medium', fontSize: rs(9), textTransform: 'uppercase', letterSpacing: 0.5 },

  accessoriesWrap: {
    borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 14, marginBottom: 4,
  },
  accessoriesLabel: {
    fontFamily: 'Inter_400Regular', fontSize: rs(10), color: Colors.textLight,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10,
  },
  accessoriesRow: { flexDirection: 'row', gap: 12 },
  accessoryWrap: { alignItems: 'center' },
  accessoryLabel: {
    fontFamily: 'Inter_400Regular', fontSize: rs(10), color: Colors.textSecondary,
    textTransform: 'capitalize', marginTop: 4, textAlign: 'center',
  },

  // ── Actions ───────────────────────────────────────────────────────────────
  actionsArea: {
    borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 14, marginTop: 14, gap: 10,
  },
  logWearBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 16,
    shadowColor: Colors.primary, shadowOpacity: 0.2, shadowRadius: 6, elevation: 2,
  },
  logWearText: { fontFamily: 'Inter_600SemiBold', fontSize: rs(13), color: Colors.white },
  undoWearBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.background, borderRadius: 14, borderWidth: 1,
    borderColor: Colors.border, paddingVertical: 11,
  },
  undoWearText: { fontFamily: 'Inter_500Medium', fontSize: rs(13), color: Colors.textSecondary },

  reactionRow: {
    flexDirection: 'row', gap: 10, alignItems: 'center',
  },
  reactionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  reactionBtnLove: { backgroundColor: '#FEE2E2', borderColor: '#FECACA' },
  reactionBtnSkip: { backgroundColor: Colors.border, borderColor: Colors.border },
  reactionText: { fontFamily: 'Inter_500Medium', fontSize: rs(12), color: Colors.textSecondary },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyState: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 32 },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: Colors.secondary + '12', alignItems: 'center', justifyContent: 'center',
    marginBottom: 6, borderWidth: 1, borderColor: Colors.secondary + '20',
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold', fontSize: rs(18), color: Colors.primary,
    marginTop: 16, textAlign: 'center', letterSpacing: -0.2,
  },
  emptySub: {
    fontFamily: 'Inter_400Regular', fontSize: rs(13), color: Colors.textSecondary,
    marginTop: 8, textAlign: 'center', lineHeight: 20,
  },
  emptyAction: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingHorizontal: 22, paddingVertical: 13, marginTop: 24,
    shadowColor: Colors.primary, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3,
  },
  emptyActionText: { fontFamily: 'Inter_600SemiBold', fontSize: rs(14), color: Colors.white },

  cpwToast: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.secondary + '12',
    borderRadius: 12, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.secondary + '28',
  },
  cpwToastText: {
    fontFamily: 'Inter_600SemiBold', fontSize: rs(12), color: Colors.secondary, flex: 1, lineHeight: 17,
  },

  exportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  exportBtnText: { fontFamily: 'Inter_500Medium', fontSize: rs(12), color: Colors.textSecondary },
});
