import {
  StyleSheet, Text, View, ScrollView, Pressable,
  Platform, Image, ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApp, OutfitSet, OutfitComponent } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useState, useCallback } from 'react';
import { OccasionTag, WearEntry, MoodGoal, ReactionType } from '@/constants/types';
import * as Haptics from 'expo-haptics';

const MOOD_OPTIONS: { id: MoodGoal; label: string; icon: string }[] = [
  { id: 'confident', label: 'Confident', icon: 'flash-outline' },
  { id: 'soft',      label: 'Soft',      icon: 'cloud-outline' },
  { id: 'joyful',    label: 'Joyful',    icon: 'sunny-outline' },
  { id: 'grounded',  label: 'Grounded',  icon: 'leaf-outline' },
  { id: 'romantic',  label: 'Romantic',  icon: 'rose-outline' },
  { id: 'powerful',  label: 'Powerful',  icon: 'trophy-outline' },
];

const FREE_SCENARIOS: OccasionTag[] = ['work', 'casual', 'date', 'event'];
const PREMIUM_SCENARIOS: OccasionTag[] = ['interview', 'wedding', 'travel'];

const REWEAR_THRESHOLDS: Record<OccasionTag, number> = {
  work:      7,
  casual:    7,
  date:      14,
  event:     14,
  interview: 21,
  wedding:   21,
  travel:    0,
};

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

const scenarioLabels: Record<OccasionTag, { label: string; icon: string; mood: string }> = {
  work:      { label: 'Work',      icon: 'briefcase-outline',  mood: 'Sharp & polished' },
  casual:    { label: 'Casual',    icon: 'cafe-outline',       mood: 'Easy & effortless' },
  date:      { label: 'Date',      icon: 'heart-outline',      mood: 'Confident & feminine' },
  event:     { label: 'Event',     icon: 'sparkles-outline',   mood: 'Dressed to impress' },
  interview: { label: 'Interview', icon: 'mic-outline',        mood: 'Authoritative & calm' },
  wedding:   { label: 'Wedding',   icon: 'rose-outline',       mood: 'Elegant & celebratory' },
  travel:    { label: 'Travel',    icon: 'airplane-outline',   mood: 'Chic & comfortable' },
};

const categoryLabels: Record<string, string> = {
  top: 'Top', bottom: 'Bottom', dress: 'Dress',
  outerwear: 'Layer', shoes: 'Shoes', bag: 'Bag', jewelry: 'Jewelry',
};

const categoryIcons: Record<string, string> = {
  top: 'shirt-outline', bottom: 'resize-outline', dress: 'body-outline',
  outerwear: 'cloudy-outline', shoes: 'footsteps-outline',
  bag: 'bag-handle-outline', jewelry: 'diamond-outline',
};

function OutfitItemPhoto({ component, size = 72 }: { component: OutfitComponent; size?: number }) {
  if (component.photoUri) {
    return (
      <Image
        source={{ uri: component.photoUri }}
        style={[styles.itemPhoto, { width: size, height: size * 1.2, borderRadius: 12 }]}
        resizeMode="cover"
      />
    );
  }
  return (
    <View style={[styles.itemPhotoFallback, { width: size, height: size * 1.2, borderRadius: 12 }]}>
      <Ionicons
        name={categoryIcons[component.category] as any || 'ellipse-outline'}
        size={size * 0.36}
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

  return (
    <Animated.View entering={FadeInDown.delay(index * 80).duration(400)}>
      <View style={[styles.outfitCard, highlight && styles.outfitCardHighlight, wornToday && styles.outfitCardWorn]}>
        <View style={styles.outfitCardHeader}>
          <View style={styles.scenarioPill}>
            <Ionicons name={scenario?.icon as any || 'ellipse'} size={13} color={Colors.secondary} />
            <Text style={styles.scenarioPillText}>{scenario?.label}</Text>
          </View>
          {wornToday ? (
            <View style={styles.wornBadge}>
              <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
              <Text style={styles.wornBadgeText}>Worn today</Text>
            </View>
          ) : (
            <View style={styles.readyBadge}>
              <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
              <Text style={styles.readyText}>Ready to wear</Text>
            </View>
          )}
        </View>

        {outfit.rationale ? (
          <Text style={styles.moodText}>{outfit.rationale}</Text>
        ) : scenario?.mood ? (
          <Text style={styles.moodText}>{scenario.mood}</Text>
        ) : null}

        {showRewearAdvisor && !wornToday && (
          <View style={[styles.rewearAdvisor, rewearUrgent && styles.rewearAdvisorUrgent]}>
            <Ionicons
              name={rewearUrgent ? 'time-outline' : 'refresh-circle-outline'}
              size={13}
              color={rewearUrgent ? '#B45309' : Colors.secondary}
            />
            <Text style={[styles.rewearAdvisorText, rewearUrgent && styles.rewearAdvisorTextUrgent]}>
              {rewearUrgent
                ? `Worn ${lastWorn.daysAgo === 1 ? 'yesterday' : `${lastWorn.daysAgo} days ago`} — let this one breathe a little longer`
                : `Worn ${lastWorn.daysAgo} days ago — almost ready to re-wear`}
            </Text>
          </View>
        )}

        <View style={styles.photosRow}>
          {coreItems.map((comp, i) => (
            <View key={`core-${i}`} style={styles.photoWrap}>
              <OutfitItemPhoto component={comp} size={80} />
              <Text style={styles.itemLabel} numberOfLines={1}>
                {categoryLabels[comp.category] || comp.category}
              </Text>
              <Text style={styles.itemColor} numberOfLines={1}>{comp.colorFamily}</Text>
            </View>
          ))}
        </View>

        {accessories.length > 0 && (
          <View style={styles.accessoriesRow}>
            {accessories.map((comp, i) => (
              <View key={`acc-${i}`} style={styles.accessoryWrap}>
                <OutfitItemPhoto component={comp} size={52} />
                <Text style={styles.accessoryLabel} numberOfLines={1}>
                  {categoryLabels[comp.category] || comp.category}
                </Text>
              </View>
            ))}
          </View>
        )}

        {hasOwnedItems && (
          <View style={styles.wearButtonRow}>
            {wornToday ? (
              <Pressable
                style={styles.undoWearButton}
                onPress={() => wornTodayEntryId && onUndoWear(wornTodayEntryId)}
              >
                <Ionicons name="return-up-back-outline" size={14} color={Colors.textSecondary} />
                <Text style={styles.undoWearText}>Undo</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.logWearButton}
                onPress={() => onLogWear(outfit)}
              >
                <Ionicons name="calendar-outline" size={14} color={Colors.white} />
                <Text style={styles.logWearText}>Wearing this today</Text>
              </Pressable>
            )}
            <View style={styles.reactionRow}>
              <Pressable
                style={[styles.reactionButton, reaction === 'love' && styles.reactionButtonLove]}
                onPress={() => { Haptics.selectionAsync(); onReact(outfit, 'love'); }}
                hitSlop={6}
              >
                <Ionicons
                  name={reaction === 'love' ? 'heart' : 'heart-outline'}
                  size={16}
                  color={reaction === 'love' ? '#DC2626' : Colors.textSecondary}
                />
                <Text style={[styles.reactionText, reaction === 'love' && { color: '#DC2626' }]}>
                  Love
                </Text>
              </Pressable>
              <Pressable
                style={[styles.reactionButton, reaction === 'not-today' && styles.reactionButtonSkip]}
                onPress={() => { Haptics.selectionAsync(); onReact(outfit, 'not-today'); }}
                hitSlop={6}
              >
                <Ionicons
                  name={reaction === 'not-today' ? 'close-circle' : 'close-circle-outline'}
                  size={16}
                  color={reaction === 'not-today' ? Colors.textSecondary : Colors.textLight}
                />
                <Text style={styles.reactionText}>Not today</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

function JustAddedBanner({
  suggestions,
  onDismiss,
}: {
  suggestions: OutfitSet[];
  onDismiss: () => void;
}) {
  const firstNewItem = suggestions[0]?.components[0];
  const label = firstNewItem
    ? `${firstNewItem.colorFamily} ${firstNewItem.subType.replace(/-/g, ' ')}`
    : 'new item';

  return (
    <Animated.View entering={FadeInUp.duration(500)} style={styles.bannerWrap}>
      <View style={styles.bannerHeader}>
        <View style={styles.bannerTitleRow}>
          <Ionicons name="sparkles" size={16} color={Colors.secondary} />
          <Text style={styles.bannerTitle}>Styled for your {label}</Text>
        </View>
        <Pressable onPress={onDismiss} style={styles.bannerDismiss} hitSlop={8}>
          <Ionicons name="close" size={18} color={Colors.textSecondary} />
        </Pressable>
      </View>
      <Text style={styles.bannerSubtitle}>
        Here's how to wear it with what you already own
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.bannerScroll}
      >
        {suggestions.map((outfit, i) => (
          <View key={outfit.id} style={styles.bannerCard}>
            <View style={styles.bannerCardHeader}>
              <Ionicons
                name={scenarioLabels[outfit.scenario]?.icon as any || 'ellipse'}
                size={12}
                color={Colors.secondary}
              />
              <Text style={styles.bannerCardScenario}>
                {scenarioLabels[outfit.scenario]?.label}
              </Text>
            </View>
            <View style={styles.bannerPhotos}>
              {outfit.components.slice(0, 4).map((comp, j) => (
                <View key={j} style={styles.bannerPhotoWrap}>
                  <OutfitItemPhoto component={comp} size={56} />
                </View>
              ))}
            </View>
            <Text style={styles.bannerItemCount}>
              {outfit.components.length} piece look
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
  } = useApp();
  const [selectedScenario, setSelectedScenario] = useState<OccasionTag>('casual');
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const filtered = outfitSets.filter(o => o.scenario === selectedScenario);
  const isPremiumScenario = PREMIUM_SCENARIOS.includes(selectedScenario);
  const hasWardrobe = wardrobeItems.length > 0;

  function handleScenarioPress(scenario: OccasionTag) {
    const isLocked = PREMIUM_SCENARIOS.includes(scenario) && !isPremium;
    if (isLocked) {
      router.push('/premium');
    } else {
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

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Looks</Text>
        <Text style={styles.subtitle}>
          {hasWardrobe
            ? 'Outfits curated from your wardrobe — ready to wear today'
            : 'Add items to your wardrobe to unlock personalised outfit suggestions'}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scenarioScroll}
        contentContainerStyle={styles.scenarioScrollContent}
      >
        {FREE_SCENARIOS.map(s => (
          <Pressable
            key={s}
            style={[styles.scenarioChip, selectedScenario === s && styles.scenarioChipActive]}
            onPress={() => handleScenarioPress(s)}
          >
            <Ionicons
              name={scenarioLabels[s].icon as any}
              size={14}
              color={selectedScenario === s ? Colors.white : Colors.textSecondary}
            />
            <Text style={[styles.scenarioText, selectedScenario === s && styles.scenarioTextActive]}>
              {scenarioLabels[s].label}
            </Text>
          </Pressable>
        ))}

        <View style={styles.scenarioDivider} />

        {PREMIUM_SCENARIOS.map(s => {
          const isLocked = !isPremium;
          const isActive = selectedScenario === s;
          return (
            <Pressable
              key={s}
              style={[
                styles.scenarioChip,
                styles.scenarioChipPremium,
                isActive && styles.scenarioChipActive,
                isLocked && styles.scenarioChipLocked,
              ]}
              onPress={() => handleScenarioPress(s)}
            >
              <Ionicons
                name={scenarioLabels[s].icon as any}
                size={14}
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

      {hasWardrobe && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.moodScroll}
          contentContainerStyle={styles.moodScrollContent}
        >
          <Text style={styles.moodPrompt}>Today I want to feel</Text>
          {MOOD_OPTIONS.map(m => {
            const active = todayMood === m.id;
            return (
              <Pressable
                key={m.id}
                style={[styles.moodChip, active && styles.moodChipActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setTodayMood(active ? null : m.id);
                }}
              >
                <Ionicons
                  name={m.icon as any}
                  size={13}
                  color={active ? Colors.white : Colors.secondary}
                />
                <Text style={[styles.moodChipText, active && styles.moodChipTextActive]}>
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {shouldShowProfileNudge && hasWardrobe && (
          <View style={styles.profileNudge}>
            <View style={styles.profileNudgeIconWrap}>
              <Ionicons name="sparkles-outline" size={16} color={Colors.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileNudgeTitle}>
                Your style profile is {Math.round(profileCompleteness * 100)}% complete
              </Text>
              <Text style={styles.profileNudgeSubtitle}>
                A few more details — hair, height, metal preference — sharpen every recommendation.
              </Text>
              <View style={styles.profileNudgeActions}>
                <Pressable onPress={() => router.push('/(tabs)/profile' as any)} style={styles.profileNudgeCta}>
                  <Text style={styles.profileNudgeCtaText}>Refine</Text>
                  <Ionicons name="arrow-forward" size={12} color={Colors.secondary} />
                </Pressable>
                <Pressable onPress={dismissProfileNudge} hitSlop={8}>
                  <Text style={styles.profileNudgeDismiss}>Not now</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {lastAddedSuggestions.length > 0 && (
          <JustAddedBanner
            suggestions={lastAddedSuggestions}
            onDismiss={clearLastAddedSuggestions}
          />
        )}

        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="shirt-outline" size={52} color={Colors.border} />
            <Text style={styles.emptyTitle}>
              {hasWardrobe ? `No ${scenarioLabels[selectedScenario]?.label} looks yet` : 'Your wardrobe is empty'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {hasWardrobe
                ? `Add more items that suit ${scenarioLabels[selectedScenario]?.label.toLowerCase()} occasions and we'll style complete looks for you.`
                : 'Start adding clothing items and the app will build complete outfit suggestions from your wardrobe.'}
            </Text>
            <Pressable
              style={styles.emptyAction}
              onPress={() => router.push('/add-item')}
            >
              <Ionicons name="add" size={16} color={Colors.white} />
              <Text style={styles.emptyActionText}>Add Clothing Item</Text>
            </Pressable>
          </View>
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
                onLogWear={logWear}
                onUndoWear={undoWear}
                wearHistory={wearHistory}
                reaction={getOutfitReaction(outfit)}
                onReact={reactToOutfit}
              />
            );
          })
        )}

        {!isPremium && hasWardrobe && !isPremiumScenario && (
          <Pressable style={styles.premiumCta} onPress={() => router.push('/premium')}>
            <View style={styles.premiumCtaIconWrap}>
              <Ionicons name="layers-outline" size={22} color={Colors.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.premiumCtaTitle}>Unlock More Occasions</Text>
              <Text style={styles.premiumCtaSubtitle}>Interview, wedding, travel and more — curated for every moment</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
          </Pressable>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: { paddingHorizontal: 20, marginTop: 8, marginBottom: 14 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.primary, letterSpacing: -0.5 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, marginTop: 3, lineHeight: 18 },

  scenarioScroll: { flexGrow: 0, marginBottom: 14 },
  scenarioScrollContent: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
  scenarioDivider: { width: 1, height: 26, backgroundColor: Colors.border, marginHorizontal: 4 },

  scenarioChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 8, paddingHorizontal: 13, borderRadius: 12,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  scenarioChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  scenarioChipPremium: { borderColor: Colors.secondary + '60' },
  scenarioChipLocked: { opacity: 0.6 },
  scenarioText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textSecondary },
  scenarioTextActive: { color: Colors.white },
  scenarioTextLocked: { color: Colors.textLight },

  scrollContent: { paddingHorizontal: 20 },

  bannerWrap: {
    backgroundColor: Colors.secondary + '12',
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.secondary + '30',
  },
  bannerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  bannerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  bannerTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary, flex: 1 },
  bannerDismiss: { padding: 2 },
  bannerSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginBottom: 14, lineHeight: 17 },
  bannerScroll: { gap: 12 },
  bannerCard: {
    width: 160, backgroundColor: Colors.white, borderRadius: 14,
    padding: 12, borderWidth: 1, borderColor: Colors.border,
  },
  bannerCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  bannerCardScenario: { fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.textSecondary, textTransform: 'capitalize' },
  bannerPhotos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  bannerPhotoWrap: {},
  bannerItemCount: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textLight },

  outfitCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  outfitCardHighlight: { borderColor: Colors.secondary + '50', backgroundColor: Colors.secondary + '05' },
  outfitCardWorn: { borderColor: Colors.success + '50', backgroundColor: Colors.success + '06' },

  outfitCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  scenarioPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.background, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  scenarioPillText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.primary },

  readyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  readyText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.success },

  wornBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  wornBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.success },

  wearButtonRow: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  logWearButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: 10,
    paddingVertical: 9, paddingHorizontal: 16,
  },
  logWearText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.white },
  undoWearButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, paddingVertical: 8, paddingHorizontal: 16,
  },
  undoWearText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary },

  moodText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginBottom: 8, fontStyle: 'italic', lineHeight: 17 },

  moodScroll: { flexGrow: 0, marginBottom: 10 },
  moodScrollContent: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
  moodPrompt: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textSecondary, marginRight: 4 },
  moodChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 6, paddingHorizontal: 11, borderRadius: 11,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.secondary + '40',
  },
  moodChipActive: { backgroundColor: Colors.secondary, borderColor: Colors.secondary },
  moodChipText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.secondary },
  moodChipTextActive: { color: Colors.white },

  profileNudge: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: Colors.secondary + '08', borderRadius: 14,
    padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.secondary + '25',
  },
  profileNudgeIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: Colors.secondary + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  profileNudgeTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.primary, marginBottom: 2 },
  profileNudgeSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  profileNudgeActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  profileNudgeCta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  profileNudgeCtaText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.secondary },
  profileNudgeDismiss: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textLight },

  reactionRow: {
    flexDirection: 'row', gap: 12, alignItems: 'center',
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  reactionButton: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 5, paddingHorizontal: 9, borderRadius: 8,
  },
  reactionButtonLove: { backgroundColor: '#FEE2E2' },
  reactionButtonSkip: { backgroundColor: Colors.border },
  reactionText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.textSecondary },

  rewearAdvisor: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.secondary + '12', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.secondary + '25',
  },
  rewearAdvisorUrgent: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
  },
  rewearAdvisorText: {
    fontFamily: 'Inter_500Medium', fontSize: 11,
    color: Colors.secondary, flex: 1, lineHeight: 15,
  },
  rewearAdvisorTextUrgent: {
    color: '#92400E',
  },

  photosRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  photoWrap: { alignItems: 'center', flex: 1 },
  itemPhoto: { backgroundColor: Colors.border, marginBottom: 6 },
  itemPhotoFallback: {
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6, borderWidth: 1, borderColor: Colors.border,
  },
  itemLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.primary, textTransform: 'capitalize', textAlign: 'center' },
  itemColor: { fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textSecondary, textTransform: 'capitalize', marginTop: 2 },

  accessoriesRow: {
    flexDirection: 'row', gap: 10, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  accessoryWrap: { alignItems: 'center' },
  accessoryLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textSecondary, textTransform: 'capitalize', marginTop: 4 },

  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 18, color: Colors.primary, marginTop: 18, textAlign: 'center' },
  emptySubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  emptyAction: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 12, marginTop: 24,
  },
  emptyActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.white },

  premiumCta: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.secondary + '10', borderRadius: 14, padding: 16, marginTop: 8,
  },
  premiumCtaIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: Colors.secondary + '18', alignItems: 'center', justifyContent: 'center',
  },
  premiumCtaTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary },
  premiumCtaSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
});
