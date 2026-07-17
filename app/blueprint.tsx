import { StyleSheet, Text, View, ScrollView, Pressable, Platform, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import { WardrobeSlot, findCloseMatch } from '@/constants/wardrobeBlueprint';
import Colors from '@/constants/colors';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { rs } from '../lib/responsive';

const CATEGORY_LABELS: Record<string, string> = {
  top: 'Tops',
  bottom: 'Bottoms',
  dress: 'Dresses',
  outerwear: 'Outerwear',
  shoes: 'Shoes',
  bag: 'Bags',
  jewelry: 'Jewelry',
};

const CATEGORY_ICONS: Record<string, string> = {
  top: 'shirt-outline',
  bottom: 'resize-outline',
  dress: 'body-outline',
  outerwear: 'cloudy-outline',
  shoes: 'footsteps-outline',
  bag: 'bag-handle-outline',
  jewelry: 'diamond-outline',
};

const CATEGORY_ORDER = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'jewelry'];

function groupSlotsByCategory(slots: WardrobeSlot[]): Record<string, WardrobeSlot[]> {
  const grouped: Record<string, WardrobeSlot[]> = {};
  for (const slot of slots) {
    if (!grouped[slot.category]) grouped[slot.category] = [];
    grouped[slot.category].push(slot);
  }
  return grouped;
}

function SlotCard({
  slot,
  highlighted,
  closeMatch,
  showPremiumHints,
}: {
  slot: WardrobeSlot;
  highlighted?: boolean;
  closeMatch?: { name?: string; subType: string };
  showPremiumHints: boolean;
}) {
  const isOwned = slot.status === 'owned';
  return (
    <View style={[styles.slotCard, highlighted && styles.slotCardHighlighted]}>
      {highlighted && showPremiumHints ? (
        <View style={styles.slotHighlightBadge}>
          <Ionicons name="flash" size={10} color={Colors.white} />
          <Text style={styles.slotHighlightText}>Next smart buy</Text>
        </View>
      ) : null}
      <View style={styles.slotImageWrap}>
        <Image source={slot.sampleImage} style={styles.slotImage} resizeMode="cover" />
        <View style={[styles.slotBadge, isOwned ? styles.slotBadgeOwned : styles.slotBadgeNeeded]}>
          <Ionicons
            name={isOwned ? 'checkmark-circle' : 'add-circle-outline'}
            size={12}
            color={isOwned ? Colors.success : Colors.warning}
          />
          <Text style={[styles.slotBadgeText, { color: isOwned ? Colors.success : Colors.warning }]}>
            {isOwned ? 'Owned' : 'Needed'}
          </Text>
        </View>
      </View>
      <Text style={styles.slotLabel} numberOfLines={2}>{slot.label}</Text>
      <Text style={styles.slotDesc} numberOfLines={2}>{slot.description}</Text>
      {!isOwned && closeMatch && showPremiumHints ? (
        <View style={styles.closeMatchHint}>
          <Ionicons name="eye-outline" size={10} color={Colors.secondary} />
          <Text style={styles.closeMatchText} numberOfLines={1}>
            You own {closeMatch.name ? `"${closeMatch.name}"` : `a ${closeMatch.subType.replace(/-/g, ' ')}`} in this colour
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function BlueprintScreen() {
  const insets = useSafeAreaInsets();
  const { isPremium, recommendationSlots, profile, activeWardrobeItems } = useApp();
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const totalSlots = recommendationSlots.length;
  const ownedSlots = recommendationSlots.filter(s => s.status === 'owned').length;
  const progressPercent = totalSlots > 0 ? (ownedSlots / totalSlots) * 100 : 0;

  const grouped = groupSlotsByCategory(recommendationSlots);

  const styleGoalLabels: Record<string, string> = {
    youthful: 'Youthful', elevated: 'Elevated', minimal: 'Minimal',
    romantic: 'Romantic', bold: 'Bold', classic: 'Classic',
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <StatusBar style="dark" />
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.primary} />
        </Pressable>
        <Text style={styles.topBarTitle}>Wardrobe Blueprint</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Animated.View entering={FadeInDown.delay(100).duration(280)} style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <View>
              <Text style={styles.progressTitle}>Blueprint Progress</Text>
              <Text style={styles.progressSub}>
                {profile.styleGoalPrimary
                  ? `Curated for your ${styleGoalLabels[profile.styleGoalPrimary]} style`
                  : 'Your personalised capsule wardrobe'}
              </Text>
            </View>
            <Text style={styles.progressCount}>{ownedSlots} / {totalSlots}</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </View>
          <Text style={styles.progressFooter}>
            {totalSlots - ownedSlots === 0
              ? 'Your blueprint is complete!'
              : `${totalSlots - ownedSlots} piece${totalSlots - ownedSlots !== 1 ? 's' : ''} left to complete your wardrobe`}
          </Text>
        </Animated.View>

        {CATEGORY_ORDER.filter(cat => grouped[cat]?.length > 0).map((cat, catIndex) => {
          const slots = grouped[cat];
          const catOwned = slots.filter(s => s.status === 'owned').length;
          return (
            <Animated.View key={cat} entering={FadeInDown.delay(150 + catIndex * 60).duration(280)}>
              <View style={styles.categorySection}>
                <View style={styles.categoryHeader}>
                  <Ionicons name={CATEGORY_ICONS[cat] as any} size={18} color={Colors.secondary} />
                  <Text style={styles.categoryTitle}>{CATEGORY_LABELS[cat]}</Text>
                  <Text style={[styles.categoryCount, catOwned === slots.length && styles.categoryCountComplete]}>
                    {catOwned} / {slots.length}
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.slotsScroll}
                  contentContainerStyle={styles.slotsScrollContent}
                >
                  {slots.map(slot => {
                    const close = isPremium ? findCloseMatch(activeWardrobeItems, slot) : null;
                    return (
                      <SlotCard
                        key={slot.id}
                        slot={slot}
                        highlighted={slot.id === highlight}
                        closeMatch={close ?? undefined}
                        showPremiumHints={isPremium}
                      />
                    );
                  })}
                </ScrollView>
              </View>
            </Animated.View>
          );
        })}

        {!isPremium && (
          <Animated.View entering={FadeInDown.delay(550).duration(280)} style={styles.upsellStrip}>
            <View style={styles.upsellLeft}>
              <Ionicons name="sparkles-outline" size={16} color={Colors.secondary} />
              <View>
                <Text style={styles.upsellTitle}>Smart shopping guidance</Text>
                <Text style={styles.upsellSub}>
                  See your next best buy, close colour matches, and a prioritised gap list.
                </Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [styles.upsellBtn, pressed && { opacity: 0.82 }]}
              onPress={() => router.push('/premium')}
            >
              <Text style={styles.upsellBtnText}>Upgrade</Text>
            </Pressable>
          </Animated.View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, marginBottom: 4 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(17), color: Colors.primary, letterSpacing: -0.3 },
  scrollContent: { paddingHorizontal: 20 },

  progressCard: { backgroundColor: Colors.white, borderRadius: 18, padding: 18, marginBottom: 24, borderWidth: 1, borderColor: Colors.border },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  progressTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(16), color: Colors.primary },
  progressSub: { fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.textSecondary, marginTop: 2 },
  progressCount: { fontFamily: 'Inter_700Bold', fontSize: rs(22), color: Colors.secondary },
  progressBarBg: { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: Colors.secondary, borderRadius: 4 },
  progressFooter: { fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.textSecondary, marginTop: 10 },

  categorySection: { marginBottom: 24 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  categoryTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(15), color: Colors.primary, flex: 1 },
  categoryCount: { fontFamily: 'Inter_500Medium', fontSize: rs(13), color: Colors.textSecondary },
  categoryCountComplete: { color: Colors.success },

  slotsScroll: { marginHorizontal: -20 },
  slotsScrollContent: { paddingHorizontal: 20, gap: 12 },

  slotCard: { width: 155, backgroundColor: Colors.white, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  slotCardHighlighted: { borderWidth: 2, borderColor: Colors.secondary },
  slotHighlightBadge: {
    position: 'absolute', top: 8, left: 8, zIndex: 2,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.secondary, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8,
  },
  slotHighlightText: { fontFamily: 'Inter_600SemiBold', fontSize: rs(9), color: Colors.white, letterSpacing: 0.3, textTransform: 'uppercase' },
  slotImageWrap: { width: 155, height: 140, backgroundColor: Colors.border, position: 'relative' },
  slotImage: { width: 155, height: 140 },
  slotBadge: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: Colors.white },
  slotBadgeOwned: {},
  slotBadgeNeeded: {},
  slotBadgeText: { fontFamily: 'Inter_500Medium', fontSize: rs(10) },
  slotLabel: { fontFamily: 'Inter_600SemiBold', fontSize: rs(12), color: Colors.primary, paddingHorizontal: 10, paddingTop: 10 },
  slotDesc: { fontFamily: 'Inter_400Regular', fontSize: rs(10), color: Colors.textSecondary, paddingHorizontal: 10, paddingTop: 2, paddingBottom: 10, lineHeight: 14 },
  closeMatchHint: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginHorizontal: 10, marginBottom: 10, marginTop: 4,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6,
    backgroundColor: Colors.secondary + '14',
  },
  closeMatchText: { fontFamily: 'Inter_500Medium', fontSize: rs(9.5), color: Colors.secondary, textTransform: 'capitalize', flexShrink: 1 },

  upsellStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.secondary + '30',
    marginBottom: 16,
  },
  upsellLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  upsellTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(13), color: Colors.primary },
  upsellSub: { fontFamily: 'Inter_400Regular', fontSize: rs(11), color: Colors.textSecondary, marginTop: 2, lineHeight: 15 },
  upsellBtn: {
    backgroundColor: Colors.secondary, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  upsellBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: rs(12), color: Colors.white },
});
