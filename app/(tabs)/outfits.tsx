import {
  StyleSheet, Text, View, ScrollView, Pressable, ActivityIndicator, FlatList,
  Modal, useWindowDimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useApp, OutfitSet, OutfitComponent } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { OccasionTag, ReactionType, WardrobeItem } from '@/constants/types';
import * as Haptics from 'expo-haptics';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import OOTDStoryCard from '@/components/OOTDStoryCard';
import { computeItemCpw, formatCpw } from '@/constants/cpw';
import { rs } from '../../lib/responsive';
import OccasionPlanner, { type ConciergeAccess } from '../../components/OccasionPlanner';
import { GarmentTile } from '@/components/GarmentTile';
import LockedLookSilhouettes from '../../components/LockedLookSilhouettes';
import { useToast } from '@/contexts/LuxuryFeedbackContext';
import TravelPlanner from '../../components/TravelPlanner';
import { CONCIERGE_OCCASIONS, conciergeReadiness, parseConciergeIntent, type ConciergeIntent } from '../../lib/concierge';
import { defaultTempUnit, formatTemp, formatTempValue } from '@/constants/weather';
import { wardrobeValueLabel } from '@/constants/wardrobeLabels';
import { usesConfirmedCoordinatedSet } from '../../lib/stylingRelationships';
import { filterLastAddedSuggestions } from '../../lib/lastAddedSuggestions';
import {
  buildLookPages, lockedLookCount, lockedLookTitle, pageIndexForDot,
  pageIndexFromOffset, runLookOverflowAction,
} from '../../lib/lookCarousel';

const FREE_SCENARIOS: OccasionTag[] = ['work', 'casual', 'date-casual', 'date-dressy', 'event', 'brunch', 'active'];
const PREMIUM_SCENARIOS: OccasionTag[] = ['interview', 'wedding', 'traditional-event', 'travel', 'resort', 'night-out'];

// Scenario accents remain in use for the just-added look banner and Traditional context.
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
  wornToday,
  wornTodayEntryId,
  onLogWear,
  onUndoWear,
  reaction,
  onReact,
  isPremium,
}: {
  outfit: OutfitSet;
  index: number;
  wornToday: boolean;
  wornTodayEntryId?: string;
  onLogWear: (outfit: OutfitSet) => void;
  onUndoWear: (entryId: string) => void;
  reaction: ReactionType | null;
  onReact: (outfit: OutfitSet, type: ReactionType) => void;
  isPremium: boolean;
}) {
  const toast = useToast();
  const scenario = scenarioLabels[outfit.scenario];
  const hasOwnedItems = outfit.components.some(c => c.owned && c.matchedItemId);

  // Keep the existing Premium boundary for generated rationale.
  const lookName = isPremium ? (outfit.rationale || scenario?.mood) : scenario?.mood;
  const storyRef = useRef<View>(null);
  const [exporting, setExporting] = useState(false);
  const [overflowVisible, setOverflowVisible] = useState(false);

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

  const pieceName = (component: OutfitComponent) =>
    component.subType.replace(/-/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  const onePiece = outfit.components.some(component =>
    component.category === 'dress' || /gown|kaftan/i.test(component.subType),
  );
  const slotCategories = ['top', 'bottom', 'shoes', 'outerwear'];
  const knownCategories = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'jewelry'];
  const unknownItems = outfit.components.filter(component => !knownCategories.includes(component.category));
  const slots = onePiece
    ? [outfit.components.find(component => component.category === 'dress' || /gown|kaftan/i.test(component.subType))]
    : unknownItems.length
      ? [...outfit.components].slice(0, 4)
      : slotCategories.map(category => outfit.components.find(component => component.category === category));
  const handleOverflowAction = (action: 'not-today' | 'export') => {
    setOverflowVisible(false);
    runLookOverflowAction(action, {
      notToday: () => { Haptics.selectionAsync(); onReact(outfit, 'not-today'); },
      exportLook: () => { void handleExport(); },
    });
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 70).duration(280)} style={styles.lookPage}>
      <View style={styles.lookCard}>
        <View style={[styles.lookMat, onePiece && styles.lookMatOnePiece, unknownItems.length > 0 && styles.lookMatUnknown]}>
          {slots.map((component, slotIndex) => (
            <View key={`${component?.category ?? 'empty'}-${slotIndex}`} style={[
              styles.lookSlot,
              onePiece && styles.lookSlotOnePiece,
              !component && styles.lookSlotEmpty,
            ]}>
              {component ? (
                <>
                  <View style={styles.lookSlotPhotoShadow}>
                    <OutfitItemPhoto component={component} size={onePiece ? 190 : 112} />
                  </View>
                  {!onePiece && <Text style={styles.slotLabel}>{categoryLabels[component.category] || component.category}</Text>}
                </>
              ) : <View style={styles.emptyGarmentSlot} />}
            </View>
          ))}
        </View>
        <View style={styles.lookCaption}>
          <Text style={styles.lookName} numberOfLines={1}>{lookName || scenario?.mood || scenario?.label}</Text>
          <Text style={styles.lookMeta} numberOfLines={1}>
            {scenario?.label}  ·  {wornToday ? 'Worn today' : 'Ready to wear'}{usesConfirmedCoordinatedSet(outfit) ? ' · Styled as a set' : ''}
          </Text>
          <Text style={styles.lookPieces} numberOfLines={1}>{outfit.components.map(pieceName).join(', ')}</Text>
        </View>
      </View>
      {hasOwnedItems && (
        <View style={styles.lookActions}>
          {wornToday ? (
            <Pressable testID={`look-wear-${outfit.id}`} accessibilityRole="button" accessibilityLabel="Undo wearing this look today"
              style={styles.lookWearButton} onPress={() => wornTodayEntryId && onUndoWear(wornTodayEntryId)}>
              <Ionicons name="return-up-back-outline" size={18} color={Colors.white} />
              <Text style={styles.lookWearText}>Undo</Text>
            </Pressable>
          ) : (
            <Pressable testID={`look-wear-${outfit.id}`} accessibilityRole="button" accessibilityLabel="Wear today"
              style={styles.lookWearButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onLogWear(outfit); }}>
              <Ionicons name="calendar-outline" size={18} color={Colors.white} />
              <Text style={styles.lookWearText}>Wear today</Text>
            </Pressable>
          )}
          <Pressable testID={`look-love-${outfit.id}`} accessibilityRole="button" accessibilityLabel={reaction === 'love' ? 'Remove Love reaction' : 'Love this look'}
            accessibilityState={{ selected: reaction === 'love' }} style={styles.lookIconButton}
            onPress={() => { Haptics.selectionAsync(); onReact(outfit, 'love'); }}>
            <Ionicons name={reaction === 'love' ? 'heart' : 'heart-outline'} size={22} color={reaction === 'love' ? '#A94955' : Colors.primary} />
          </Pressable>
          <Pressable testID={`look-overflow-${outfit.id}`} accessibilityRole="button" accessibilityLabel="More look actions"
            style={styles.lookIconButton} onPress={() => setOverflowVisible(true)}>
            <Ionicons name="ellipsis-horizontal" size={22} color={Colors.primary} />
          </Pressable>
        </View>
      )}
      <View ref={storyRef} collapsable={false} style={{ position: 'absolute', left: -900, top: 0 }}>
        <OOTDStoryCard outfit={outfit} />
      </View>
      <Modal
        testID={`look-action-modal-${outfit.id}`}
        visible={overflowVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOverflowVisible(false)}
      >
        <View style={styles.actionSheetBackdrop}>
          <Pressable
            testID={`look-action-backdrop-${outfit.id}`}
            accessibilityRole="button"
            accessibilityLabel="Close look actions"
            style={StyleSheet.absoluteFill}
            onPress={() => setOverflowVisible(false)}
          />
          <View testID={`look-action-sheet-${outfit.id}`} accessibilityViewIsModal style={styles.actionSheet}>
            <View style={styles.actionSheetHandle} />
            <Text style={styles.actionSheetTitle}>Look options</Text>
            <Pressable
              testID={`look-action-not-today-${outfit.id}`}
              accessibilityRole="button"
              accessibilityLabel="Not today"
              style={styles.actionSheetButton}
              onPress={() => handleOverflowAction('not-today')}
            >
              <Text style={styles.actionSheetButtonText}>Not today</Text>
            </Pressable>
            <Pressable
              testID={`look-action-export-${outfit.id}`}
              accessibilityRole="button"
              accessibilityLabel="Export look"
              accessibilityState={{ disabled: exporting }}
              disabled={exporting}
              style={styles.actionSheetButton}
              onPress={() => handleOverflowAction('export')}
            >
              <Text style={styles.actionSheetButtonText}>{exporting ? 'Preparing…' : 'Export look'}</Text>
            </Pressable>
            <Pressable
              testID={`look-action-cancel-${outfit.id}`}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={styles.actionSheetCancel}
              onPress={() => setOverflowVisible(false)}
            >
              <Text style={styles.actionSheetCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  const { width: screenWidth } = useWindowDimensions();
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
    reactToOutfit,
    getOutfitReaction,
    profileCompleteness,
    shouldShowProfileNudge,
    dismissProfileNudge,
    missingDimensions,
    getItemWearCount,
  } = useApp();
  const visibleLastAddedSuggestions = useMemo(() => filterLastAddedSuggestions(
    lastAddedSuggestions,
    new Set(wardrobeItems.map(item => item.id)),
  ), [lastAddedSuggestions, wardrobeItems]);
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
  const [carouselPage, setCarouselPage] = useState(0);
  const carouselRef = useRef<FlatList<OutfitSet | null>>(null);
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
    setCarouselPage(0);
    carouselRef.current?.scrollToOffset?.({ offset: 0, animated: false });
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
      setCarouselPage(0);
      carouselRef.current?.scrollToOffset?.({ offset: 0, animated: false });
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
  const hasWardrobe = activeWardrobeItems.length > 0;
  const lockedPages = lockedLookCount(
    isAuthenticated,
    !!profile?.isGuest,
    isPremium,
    entitlementUnavailable,
    filtered.length,
  );
  const lookPages = buildLookPages(filtered, lockedPages);
  const carouselKey = `${selectedScenario}:${activeWardrobeItems.map(item => item.id).join(',')}:${filtered.map(look => look.id).join(',')}:${lockedPages}:${screenWidth}`;

  function handleScenarioPress(scenario: OccasionTag) {
    clearConcierge();
    if (PREMIUM_SCENARIOS.includes(scenario) && !isPremium) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      router.push('/premium');
    } else {
      Haptics.selectionAsync();
      setCarouselPage(0);
      carouselRef.current?.scrollToOffset?.({ offset: 0, animated: false });
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
    <View style={{ marginBottom: 12 }}>
      <View style={styles.planningRow}>
        <Ionicons name="sparkles-outline" size={17} color={Colors.secondary} />
        <Pressable testID="concierge-entry" accessibilityRole="button" accessibilityLabel="Plan an occasion or a travel capsule"
          onPress={openPlanner} style={({ pressed }) => [styles.planningMain, pressed && { opacity: 0.75 }]}>
          <Text style={styles.planningTitle}>Plan an occasion or a travel capsule</Text>
        </Pressable>
        <Text style={styles.planningPremium}>PREMIUM</Text>
        <Pressable testID="travel-entry" accessibilityRole="button" accessibilityLabel="Open travel capsule planner"
          onPress={() => { clearConcierge(); setTravelOpen(true); }} style={styles.planningTravel}>
          <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
        </Pressable>
      </View>
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
        {conciergeSummary}
        {wardrobeLoading ? (
          <View style={styles.wardrobeLoading}>
            <ActivityIndicator color={Colors.secondary} size="large" />
            <Text style={styles.wardrobeLoadErrorText}>Loading your full wardrobe for accurate looks…</Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={wardrobeLoadError ? 'Retry loading your full wardrobe' : 'Load your full wardrobe'}
            onPress={() => { setLoadRetry(count => count + 1); }}
            style={[styles.wardrobeLoadError, { minHeight: 44, justifyContent: 'center' }]}
          >
            <Text style={styles.wardrobeLoadErrorText}>
              {wardrobeLoadError ? 'Your full wardrobe could not be loaded. Tap to retry.' : 'Your full wardrobe is not available yet. Tap to retry.'}
            </Text>
          </Pressable>
        )}
        <View style={{ marginHorizontal: 16, marginTop: 'auto' }}>{conciergeControls}</View>
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
      </View>

      {/* ── Scenario chips ──────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scenarioScroll}
        contentContainerStyle={styles.scenarioScrollContent}
      >
        {[...FREE_SCENARIOS, ...PREMIUM_SCENARIOS].map(s => {
          const isLocked = PREMIUM_SCENARIOS.includes(s) && !isPremium;
          const isActive = selectedScenario === s;
          return (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityLabel={s === 'traditional-event' ? 'Traditional styling' : scenarioLabels[s].label}
              accessibilityState={{ selected: isActive }}
              style={({ pressed }) => [
                styles.scenarioTab,
                isLocked && styles.scenarioChipLocked,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => handleScenarioPress(s)}
            >
              <Text style={[
                styles.scenarioText,
                isActive && styles.scenarioTextActive,
                isLocked && styles.scenarioTextLocked,
              ]}>
                {scenarioLabels[s].label}
              </Text>
              {isLocked && <Ionicons name="lock-closed" size={11} color={Colors.textLight} />}
              <View style={[styles.scenarioUnderline, !isActive && styles.scenarioUnderlineHidden]} />
            </Pressable>
          );
        })}
      </ScrollView>

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
                <Pressable accessibilityRole="button" accessibilityLabel="Refine your style profile"
                  onPress={() => router.push('/(tabs)/profile?focus=refinements')} style={[styles.nudgeCta, { minHeight: 44 }]}>
                  <Text style={styles.nudgeCtaText}>Refine</Text>
                  <Ionicons name="arrow-forward" size={11} color={Colors.secondary} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Dismiss style profile reminder"
                  onPress={dismissProfileNudge} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Text style={styles.nudgeDismiss}>Not now</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        )}


        {/* Just-added banner */}
        {!conciergePlan && visibleLastAddedSuggestions.length > 0 && (
          <JustAddedBanner
            suggestions={visibleLastAddedSuggestions}
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
              accessibilityRole="button"
              accessibilityLabel="Add clothing item"
              style={({ pressed }) => [styles.emptyAction, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
              onPress={() => router.push('/add-item')}
            >
              <Ionicons name="add" size={16} color={Colors.white} />
              <Text style={styles.emptyActionText}>Add clothing item</Text>
            </Pressable>
          </Animated.View>
        ) : (
          <>
            {(() => {
              const pageWidth = screenWidth;
              const cardWidth = screenWidth - 32;
              return (
                <>
                  <FlatList
                    ref={carouselRef}
                    key={carouselKey}
                    testID="looks-pager"
                    horizontal
                    pagingEnabled
                    snapToInterval={pageWidth}
                    decelerationRate="fast"
                    disableIntervalMomentum
                    nestedScrollEnabled
                    directionalLockEnabled
                    showsHorizontalScrollIndicator={false}
                    scrollEnabled={lookPages.length > 1}
                    data={lookPages}
                    keyExtractor={(item, index) => item?.id ?? `locked-${index}`}
                    contentContainerStyle={styles.lookPagerContent}
                    style={styles.lookPager}
                    onLayout={() => setCarouselPage(0)}
                    onMomentumScrollEnd={event => setCarouselPage(pageIndexFromOffset(event.nativeEvent.contentOffset.x, pageWidth))}
                    renderItem={({ item, index }) => item ? (
                      <View testID={`look-page-${index}`} style={[styles.lookPageFrame, { width: pageWidth, paddingHorizontal: 16 }]}>
                        <OutfitCard
                          outfit={item} index={index} wornToday={isWornToday(item)}
                          wornTodayEntryId={isWornToday(item) ? getTodayEntryId(item) : undefined}
                          onLogWear={handleLogWear} onUndoWear={undoWear}
                          reaction={getOutfitReaction(item)}
                          onReact={reactToOutfit} isPremium={isPremium}
                        />
                      </View>
                    ) : (
                      <View testID="locked-look-page-frame" style={{ width: pageWidth, paddingHorizontal: 16 }}>
                      <View testID="locked-look-page" style={[styles.lockedLookCard, { width: cardWidth }]}>
                        <View style={styles.silhouetteArt} accessible={false}>
                          <LockedLookSilhouettes />
                          <View style={styles.lockMedallion}><Ionicons name="lock-closed" size={20} color={Colors.secondary} /></View>
                        </View>
                        <Text style={styles.lockedLookTitle}>{lockedLookTitle(lockedPages, scenarioLabels[selectedScenario].label)}</Text>
                        <Text style={styles.lockedLookBody}>Premium shows four looks for every occasion, built from the pieces you already own.</Text>
                        <Pressable testID="locked-look-upgrade" accessibilityRole="button" accessibilityLabel="Unlock with Premium"
                          style={({ pressed }) => [styles.lockedLookButton, pressed && { opacity: 0.82 }]}
                          onPress={() => router.push('/premium')}>
                          <Text style={styles.lockedLookButtonText}>Unlock with Premium</Text>
                        </Pressable>
                      </View>
                      </View>
                    )}
                  />
                  <View testID="look-page-indicators" style={styles.lookDots} accessibilityLabel={`${filtered.length + lockedPages} looks`}>
                    {Array.from({ length: filtered.length + lockedPages }, (_, dotIndex) => {
                      const pageIndex = pageIndexForDot(dotIndex, filtered.length);
                      const isLockedDot = dotIndex >= filtered.length;
                      const isActive = carouselPage === pageIndex && (!isLockedDot || dotIndex === filtered.length);
                      return (
                      <Pressable key={dotIndex} testID={`look-dot-${dotIndex}`} accessibilityRole="button"
                        accessibilityLabel={isLockedDot ? `Show Premium look ${dotIndex - filtered.length + 1}` : `Show look ${dotIndex + 1}`}
                        accessibilityState={{ selected: isActive }}
                        style={styles.lookDotTap}
                        onPress={() => {
                          setCarouselPage(pageIndex);
                          carouselRef.current?.scrollToOffset?.({ offset: pageIndex * pageWidth, animated: true });
                        }}>
                        <View style={[
                          styles.lookDot,
                          isActive && (isLockedDot ? styles.lookDotLockedActive : styles.lookDotActive),
                          isLockedDot && styles.lookDotLocked,
                        ]} />
                      </Pressable>
                    );})}
                  </View>
                </>
              );
            })()}
          </>
        )}
        {conciergeControls}
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
    fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }),
    fontSize: rs(38), color: Colors.primary, letterSpacing: -1.1, lineHeight: rs(44),
  },
  // ── Scenario chips ────────────────────────────────────────────────────────
  scenarioScroll: { flexGrow: 0, marginBottom: 10, minHeight: 48 },
  scenarioScrollContent: { paddingHorizontal: 16, gap: 22, alignItems: 'center' },
  scenarioTab: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 5, position: 'relative', paddingHorizontal: 1 },
  scenarioChipLocked: { opacity: 0.55 },
  scenarioUnderline: { position: 'absolute', height: 2, bottom: 0, left: 0, right: 0, backgroundColor: Colors.primary },
  scenarioUnderlineHidden: { opacity: 0 },
  scenarioText: { fontFamily: 'Inter_500Medium', fontSize: rs(14), color: Colors.textSecondary },
  scenarioTextActive: { color: Colors.primary, fontFamily: 'Inter_600SemiBold' },
  scenarioTextLocked: { color: Colors.textLight },

  // ── Main scroll ───────────────────────────────────────────────────────────
  scrollContent: { paddingHorizontal: 16 },
  planningRow: {
    minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, borderRadius: 16, borderWidth: 1,
    borderColor: Colors.border, backgroundColor: Colors.background,
  },
  planningMain: { flex: 1, minHeight: 48, justifyContent: 'center' },
  planningTitle: { fontFamily: 'Inter_500Medium', fontSize: rs(12), color: Colors.textPrimary },
  planningPremium: { fontFamily: 'Inter_600SemiBold', fontSize: rs(9), letterSpacing: 1, color: '#8B7354' },
  planningTravel: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  lookPager: { marginHorizontal: -16, overflow: 'visible' },
  lookPagerContent: {},
  lookPageFrame: { paddingHorizontal: 0 },
  lookPage: { marginBottom: 6 },
  lookCard: {
    overflow: 'hidden', borderRadius: 28, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: '#FFFEFC',
  },
  lookMat: {
    height: 340, padding: 18, backgroundColor: '#F4F1EC',
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
  },
  lookMatOnePiece: { height: 340 },
  lookMatUnknown: { height: 340 },
  lookSlot: { width: '50%', height: '50%', alignItems: 'center', justifyContent: 'center' },
  lookSlotOnePiece: { width: '100%', height: '100%' },
  lookSlotEmpty: { opacity: 0.36 },
  emptyGarmentSlot: { width: 94, height: 108, borderRadius: 14, borderWidth: 1, borderColor: '#D7D0C5', backgroundColor: '#F8F6F2' },
  slotLabel: { marginTop: 2, fontFamily: 'Inter_500Medium', fontSize: rs(9), color: Colors.textLight, letterSpacing: 0.8, textTransform: 'uppercase' },
  lookCaption: { paddingHorizontal: 22, paddingTop: 15, paddingBottom: 18 },
  lookName: { fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }), fontSize: rs(25), lineHeight: rs(31), fontStyle: 'italic', color: Colors.primary },
  lookMeta: { marginTop: 5, fontFamily: 'Inter_500Medium', fontSize: rs(12), color: Colors.textSecondary },
  lookPieces: { marginTop: 5, fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.textSecondary },
  lookActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  lookWearButton: {
    flex: 1, minHeight: 56, borderRadius: 28, backgroundColor: '#101522',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
  },
  lookWearText: { fontFamily: 'Inter_600SemiBold', fontSize: rs(14), color: Colors.white },
  lookIconButton: {
    width: 56, height: 56, minWidth: 44, minHeight: 44, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFEFC',
    borderWidth: 1, borderColor: Colors.border,
  },
  lookDots: { minHeight: 38, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  lookDotTap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  lookDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#D3CEC5' },
  lookDotActive: { width: 22, backgroundColor: '#101522' },
  lookDotLocked: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: Colors.secondary },
  lookDotLockedActive: { width: 22, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: Colors.secondary },
  lookSlotPhotoShadow: {
    shadowColor: Colors.primary, shadowOpacity: 0.13, shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  actionSheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16, 24, 38, 0.32)' },
  actionSheet: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: Colors.white,
    shadowColor: Colors.primary, shadowOpacity: 0.14, shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 }, elevation: 12,
  },
  actionSheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: Colors.border, marginBottom: 14 },
  actionSheetTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(16), color: Colors.primary, marginBottom: 8 },
  actionSheetButton: { minHeight: 52, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: Colors.border },
  actionSheetButtonText: { fontFamily: 'Inter_500Medium', fontSize: rs(14), color: Colors.primary },
  actionSheetCancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  actionSheetCancelText: { fontFamily: 'Inter_500Medium', fontSize: rs(14), color: Colors.textSecondary },
  lockedLookCard: {
    minHeight: 510, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 30, paddingVertical: 32, borderRadius: 28,
    borderWidth: 1, borderColor: '#E2D7C4', backgroundColor: '#FFFEFC',
  },
  silhouetteArt: { width: 226, height: 138, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 28, marginBottom: 18 },
  lockMedallion: { position: 'absolute', width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFEFC', borderWidth: 1, borderColor: '#D8C8A8', alignItems: 'center', justifyContent: 'center' },
  lockedLookTitle: { fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }), fontStyle: 'italic', fontSize: rs(27), color: Colors.primary, textAlign: 'center' },
  lockedLookBody: { marginTop: 12, fontFamily: 'Inter_400Regular', fontSize: rs(13), lineHeight: 20, color: Colors.textSecondary, textAlign: 'center' },
  lockedLookButton: { minHeight: 54, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 26, marginTop: 22, borderRadius: 28, backgroundColor: '#101522' },
  lockedLookButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: rs(14), color: Colors.secondary },
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

  premiumStripTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(13), color: Colors.primary, letterSpacing: -0.1 },

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

  // ── Garment photo fallback shared with the just-added strip ────────────────
  itemPhoto: { marginBottom: 7 },
  itemPhotoFallback: {
    backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', marginBottom: 7,
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center', justifyContent: 'center', minHeight: 360,
    marginHorizontal: 0, paddingHorizontal: 28, paddingVertical: 38,
    borderRadius: 28, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
    shadowColor: Colors.primary, shadowOpacity: 0.035, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 1,
  },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center',
    marginBottom: 6, borderWidth: 1, borderColor: Colors.border,
  },
  emptyTitle: {
    fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }), fontSize: rs(23), color: Colors.primary,
    marginTop: 16, textAlign: 'center', letterSpacing: -0.2,
  },
  emptySub: {
    fontFamily: 'Inter_400Regular', fontSize: rs(13), color: Colors.textSecondary,
    marginTop: 8, textAlign: 'center', lineHeight: 20,
  },
  emptyAction: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Colors.primary, borderRadius: 28,
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

});
