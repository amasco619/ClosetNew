import { StyleSheet, Text, View, ScrollView, Pressable, Platform, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import { WardrobeSlot, findCloseMatch } from '@/constants/wardrobeBlueprint';
import Colors from '@/constants/colors';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

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

function SlotCard({ slot, highlighted, closeMatchColor }: { slot: WardrobeSlot; highlighted?: boolean; closeMatchColor?: string }) {
  const isOwned = slot.status === 'owned';
  return (
    <View style={[styles.slotCard, highlighted && styles.slotCardHighlighted]}>
      {highlighted ? (
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
      {!isOwned && closeMatchColor ? (
        <View style={styles.closeMatchHint}>
          <Ionicons name="eye-outline" size={10} color={Colors.secondary} />
          <Text style={styles.closeMatchText} numberOfLines={1}>You own a {closeMatchColor} one</Text>
        </View>
      ) : null}
    </View>
  );
}

function PremiumGate() {
  return (
    <View style={styles.gateContainer}>
      <LinearGradient
        colors={[Colors.background, Colors.background + '00']}
        style={[styles.gateGradient, { pointerEvents: 'none' }]}
      />
      <View style={styles.gateCard}>
        <View style={styles.gateIconWrap}>
          <Ionicons name="map-outline" size={36} color={Colors.secondary} />
        </View>
        <Text style={styles.gateTitle}>Wardrobe Blueprint</Text>
        <Text style={styles.gateSubtitle}>
          See exactly which pieces are missing from your personalised capsule wardrobe — curated for your style, body type, and lifestyle.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.gateButton, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/premium')}
        >
          <Ionicons name="star" size={18} color={Colors.white} />
          <Text style={styles.gateButtonText}>Unlock with Premium</Text>
        </Pressable>
        <Text style={styles.gateDisclaimer}>Cancel anytime. No commitments.</Text>
      </View>
    </View>
  );
}

export default function BlueprintScreen() {
  const insets = useSafeAreaInsets();
  const { isPremium, recommendationSlots, profile, wardrobeItems } = useApp();
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
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.primary} />
        </Pressable>
        <Text style={styles.topBarTitle}>Wardrobe Blueprint</Text>
        <View style={{ width: 40 }} />
      </View>

      {!isPremium ? (
        <>
          <View style={[styles.previewFade, { pointerEvents: 'none' }]}>
            <ScrollView scrollEnabled={false} contentContainerStyle={styles.scrollContent}>
              <View style={styles.progressCard}>
                <View style={styles.progressHeader}>
                  <View>
                    <Text style={styles.progressTitle}>Blueprint Progress</Text>
                    <Text style={styles.progressSub}>Your personalised capsule wardrobe</Text>
                  </View>
                  <Text style={styles.progressCount}>— / —</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: '30%' }]} />
                </View>
              </View>
              {['top', 'bottom', 'outerwear'].map((cat) => (
                <View key={cat} style={styles.categorySection}>
                  <View style={styles.categoryHeader}>
                    <Ionicons name={CATEGORY_ICONS[cat] as any} size={18} color={Colors.secondary} />
                    <Text style={styles.categoryTitle}>{CATEGORY_LABELS[cat]}</Text>
                    <Text style={styles.categoryCount}>? / 3</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.slotsScroll} contentContainerStyle={styles.slotsScrollContent}>
                    {[1, 2, 3].map(i => (
                      <View key={i} style={[styles.slotCard, styles.slotCardBlurred]}>
                        <View style={[styles.slotImageWrap, { backgroundColor: Colors.border }]} />
                        <View style={styles.blurLine} />
                        <View style={[styles.blurLine, { width: '60%' }]} />
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ))}
            </ScrollView>
          </View>
          <PremiumGate />
        </>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.progressCard}>
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
              <Animated.View key={cat} entering={FadeInDown.delay(150 + catIndex * 60).duration(400)}>
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
                      const close = findCloseMatch(wardrobeItems, slot);
                      return (
                        <SlotCard
                          key={slot.id}
                          slot={slot}
                          highlighted={slot.id === highlight}
                          closeMatchColor={close?.colorFamily}
                        />
                      );
                    })}
                  </ScrollView>
                </View>
              </Animated.View>
            );
          })}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, marginBottom: 4 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 17, color: Colors.primary, letterSpacing: -0.3 },
  scrollContent: { paddingHorizontal: 20 },

  progressCard: { backgroundColor: Colors.white, borderRadius: 18, padding: 18, marginBottom: 24 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  progressTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.primary },
  progressSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  progressCount: { fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.secondary },
  progressBarBg: { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: Colors.secondary, borderRadius: 4 },
  progressFooter: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 10 },

  categorySection: { marginBottom: 24 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  categoryTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.primary, flex: 1 },
  categoryCount: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary },
  categoryCountComplete: { color: Colors.success },

  slotsScroll: { marginHorizontal: -20 },
  slotsScrollContent: { paddingHorizontal: 20, gap: 12 },

  slotCard: { width: 155, backgroundColor: Colors.white, borderRadius: 14, overflow: 'hidden' },
  slotCardBlurred: { opacity: 0.4 },
  slotCardHighlighted: {
    borderWidth: 2,
    borderColor: Colors.secondary,
  },
  slotHighlightBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.secondary,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  slotHighlightText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    color: Colors.white,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  slotImageWrap: { width: 155, height: 140, backgroundColor: Colors.border, position: 'relative' },
  slotImage: { width: 155, height: 140 },
  slotBadge: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: Colors.white },
  slotBadgeOwned: {},
  slotBadgeNeeded: {},
  slotBadgeText: { fontFamily: 'Inter_500Medium', fontSize: 10 },
  slotLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.primary, paddingHorizontal: 10, paddingTop: 10 },
  slotDesc: { fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textSecondary, paddingHorizontal: 10, paddingTop: 2, paddingBottom: 10, lineHeight: 14 },

  blurLine: { height: 10, backgroundColor: Colors.border, borderRadius: 5, marginHorizontal: 10, marginTop: 8, width: '80%' },
  closeMatchHint: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginHorizontal: 10, marginBottom: 10, marginTop: 4,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6,
    backgroundColor: Colors.secondary + '14',
  },
  closeMatchText: {
    fontFamily: 'Inter_500Medium', fontSize: 9.5, color: Colors.secondary,
    textTransform: 'capitalize', flexShrink: 1,
  },

  previewFade: { flex: 1, overflow: 'hidden' },

  gateContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, top: '20%' },
  gateGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 80 },
  gateCard: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 40 },
  gateIconWrap: { width: 76, height: 76, borderRadius: 22, backgroundColor: Colors.secondary + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  gateTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.primary, textAlign: 'center', letterSpacing: -0.4, marginBottom: 10 },
  gateSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 28 },
  gateButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.secondary, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 32, marginBottom: 12 },
  gateButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.white },
  gateDisclaimer: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textLight },
});
