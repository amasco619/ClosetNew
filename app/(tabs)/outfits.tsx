import {
  StyleSheet, Text, View, ScrollView, Pressable,
  Platform, Image, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApp, OutfitSet, OutfitComponent } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useState, useCallback, useRef } from 'react';
import { OccasionTag, WearEntry, MoodGoal, ReactionType, WardrobeItem } from '@/constants/types';
import * as Haptics from 'expo-haptics';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import OOTDStoryCard from '@/components/OOTDStoryCard';
import { computeItemCpw, formatCpw } from '@/constants/cpw';

const MOOD_OPTIONS: { id: MoodGoal; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { id: 'confident', label: 'Confident', icon: 'flash-outline' },
  { id: 'soft',      label: 'Soft',      icon: 'cloud-outline' },
  { id: 'joyful',    label: 'Joyful',    icon: 'sunny-outline' },
  { id: 'grounded',  label: 'Grounded',  icon: 'leaf-outline' },
  { id: 'romantic',  label: 'Romantic',  icon: 'rose-outline' },
  { id: 'powerful',  label: 'Powerful',  icon: 'trophy-outline' },
];

const FREE_SCENARIOS: OccasionTag[] = ['work', 'casual', 'date-casual', 'date-dressy', 'event', 'brunch', 'active'];
const PREMIUM_SCENARIOS: OccasionTag[] = ['interview', 'wedding', 'travel', 'resort', 'night-out'];

const REWEAR_THRESHOLDS: Record<OccasionTag, number> = {
  work:          7,
  casual:        7,
  'date-casual': 7,
  'date-dressy': 14,
  event:         14,
  interview:     21,
  wedding:       21,
  travel:        0,
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
  wedding:       '#B8748A',
  travel:        Colors.sage,
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
  wedding:       { label: 'Wedding',    icon: 'rose-outline',        mood: 'Elegant & celebratory' },
  travel:        { label: 'Travel',     icon: 'airplane-outline',    mood: 'Chic & comfortable' },
  brunch:        { label: 'Brunch',     icon: 'sunny-outline',       mood: 'Effortlessly put-together' },
  active:        { label: 'Active',     icon: 'fitness-outline',     mood: 'Moves with you' },
  resort:        { label: 'Resort',     icon: 'umbrella-outline',    mood: 'Holiday ease, elevated' },
  'night-out':   { label: 'Night Out',  icon: 'moon-outline',        mood: 'Dressed to be remembered' },
} satisfies Record<OccasionTag, { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; mood: string }>;

const categoryLabels: Record<string, string> = {
  top: 'Top', bottom: 'Bottom', dress: 'Dress',
  outerwear: 'Layer', shoes: 'Shoes', bag: 'Bag', jewelry: 'Jewelry',
};

const SCENARIO_EMPTY_HINT: Partial<Record<OccasionTag, string>> = {
  active:        'Add leggings, a sports top, or training shoes and we\'ll build your active looks.',
  brunch:        'Add a relaxed blouse, midi skirt, or casual dress and we\'ll style your weekend brunch looks.',
  work:          'Add tailored trousers, blazers, or office-ready tops and we\'ll style polished work looks.',
  casual:        'Add everyday tops, denim, or casual dresses and we\'ll style relaxed everyday looks.',
  'date-casual': 'Add a casual dress or a flattering top-and-jeans combo and we\'ll style your day date looks.',
  'date-dressy': 'Add a statement dress or dressy separates and we\'ll style your evening date looks.',
  event:         'Add a dress or occasion-ready separates and we\'ll style standout event looks.',
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
      <Image
        source={{ uri: component.photoUri }}
        style={[
          styles.itemPhoto,
          { width: size, height: size * 1.25, borderRadius: 14 },
          heroBorder,
        ]}
        resizeMode="cover"
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
}) {
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

  const moodText = outfit.rationale || scenario?.mood;
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
      Alert.alert('Export failed', 'Unable to export this look right now.');
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
                <Text style={styles.itemColor} numberOfLines={1}>{comp.colorFamily}</Text>
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
    ? `${firstNewItem.colorFamily} ${firstNewItem.subType.replace(/-/g, ' ')}`
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
    wardrobeItems,
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
  const cpwToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const filtered = outfitSets.filter(o => o.scenario === selectedScenario);
  const isPremiumScenario = PREMIUM_SCENARIOS.includes(selectedScenario);
  const hasWardrobe = activeWardrobeItems.length > 0;

  function handleScenarioPress(scenario: OccasionTag) {
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
        {lastAddedSuggestions.length > 0 && (
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

        {/* Outfit cards or empty state */}
        {filtered.length === 0 ? (
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
                ? (SCENARIO_EMPTY_HINT[selectedScenario] ?? `Add more items suited to ${scenarioLabels[selectedScenario]?.label.toLowerCase()} occasions and we'll style complete looks for you.`)
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

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: 20, marginTop: 10, marginBottom: 16,
  },
  headerLabel: {
    fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textLight,
    letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 4,
  },
  title: {
    fontFamily: 'Inter_700Bold', fontSize: 30, color: Colors.primary, letterSpacing: -0.8,
  },
  outfitCountBadge: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, marginBottom: 4,
  },
  outfitCountText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, letterSpacing: 0.1 },

  // ── Scenario chips ────────────────────────────────────────────────────────
  scenarioScroll: { flexGrow: 0, marginBottom: 12 },
  scenarioScrollContent: { paddingHorizontal: 20, gap: 7, alignItems: 'center' },
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
  scenarioText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textSecondary },
  scenarioTextActive: { color: Colors.white, fontFamily: 'Inter_600SemiBold' },
  scenarioTextLocked: { color: Colors.textLight },

  // ── Mood row ──────────────────────────────────────────────────────────────
  moodScroll: { flexGrow: 0, marginBottom: 12 },
  moodScrollContent: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
  moodPrompt: {
    fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginRight: 2,
  },
  moodChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.secondary + '40',
  },
  moodChipActive: { backgroundColor: Colors.secondary, borderColor: Colors.secondary },
  moodChipText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.secondary },
  moodChipTextActive: { color: Colors.white },

  moodLockedStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 12,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
    backgroundColor: Colors.secondary + '08',
    borderWidth: 1, borderColor: Colors.secondary + '20',
  },
  moodLockedText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.secondary },

  // ── Main scroll ───────────────────────────────────────────────────────────
  scrollContent: { paddingHorizontal: 20 },

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
  nudgeTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.primary, marginBottom: 2 },
  nudgeSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  nudgeActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  nudgeCta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nudgeCtaText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.secondary },
  nudgeDismiss: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textLight },

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
  premiumStripTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.primary, letterSpacing: -0.1 },
  premiumStripSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

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
  bannerTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.primary, flex: 1 },
  bannerDismiss: { padding: 4 },
  bannerSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginBottom: 14, lineHeight: 17 },
  bannerScroll: { gap: 10 },
  bannerCard: {
    width: 156, backgroundColor: Colors.white, borderRadius: 14,
    padding: 12, borderWidth: 1, borderColor: Colors.border,
    shadowColor: Colors.primary, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },
  bannerCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  bannerCardScenario: { fontFamily: 'Inter_600SemiBold', fontSize: 11, textTransform: 'capitalize', letterSpacing: 0.1 },
  bannerPhotos: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 8 },
  bannerPhotoWrap: {},
  bannerHeroLabel: { fontFamily: 'Inter_500Medium', fontSize: 9, color: Colors.secondary, textAlign: 'center', marginTop: 2 },
  bannerItemCount: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textLight },

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
  scenarioPillText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.1 },

  readyBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  readyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  readyText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.success },

  wornBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.success + '12', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10,
  },
  wornBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.success },

  moodText: {
    fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary,
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
    fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.secondary, flex: 1, lineHeight: 15,
  },
  rewearAdvisorTextUrgent: { color: '#92400E' },

  photosRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  photoWrap: { alignItems: 'center', flex: 1 },
  itemPhoto: { marginBottom: 7 },
  itemPhotoFallback: {
    backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', marginBottom: 7,
  },
  itemLabel: {
    fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.primary,
    textTransform: 'capitalize', textAlign: 'center',
  },
  itemColor: {
    fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textSecondary,
    textTransform: 'capitalize', marginTop: 2, textAlign: 'center',
  },
  focalBadge: {
    marginTop: 5, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
    borderWidth: 1, backgroundColor: 'transparent',
  },
  focalBadgeText: { fontFamily: 'Inter_500Medium', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },

  accessoriesWrap: {
    borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 14, marginBottom: 4,
  },
  accessoriesLabel: {
    fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textLight,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10,
  },
  accessoriesRow: { flexDirection: 'row', gap: 12 },
  accessoryWrap: { alignItems: 'center' },
  accessoryLabel: {
    fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textSecondary,
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
  logWearText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.white },
  undoWearBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.background, borderRadius: 14, borderWidth: 1,
    borderColor: Colors.border, paddingVertical: 11,
  },
  undoWearText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary },

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
  reactionText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textSecondary },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyState: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 32 },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: Colors.secondary + '12', alignItems: 'center', justifyContent: 'center',
    marginBottom: 6, borderWidth: 1, borderColor: Colors.secondary + '20',
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold', fontSize: 18, color: Colors.primary,
    marginTop: 16, textAlign: 'center', letterSpacing: -0.2,
  },
  emptySub: {
    fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary,
    marginTop: 8, textAlign: 'center', lineHeight: 20,
  },
  emptyAction: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingHorizontal: 22, paddingVertical: 13, marginTop: 24,
    shadowColor: Colors.primary, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3,
  },
  emptyActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.white },

  cpwToast: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.secondary + '12',
    borderRadius: 12, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.secondary + '28',
  },
  cpwToastText: {
    fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.secondary, flex: 1, lineHeight: 17,
  },

  exportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  exportBtnText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textSecondary },
});
