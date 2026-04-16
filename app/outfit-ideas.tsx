import { StyleSheet, Text, View, ScrollView, Pressable, Platform, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import { generateRecommendedOutfitGroups, RecommendedOutfitGroup, WardrobeSlot } from '@/constants/wardrobeBlueprint';
import Colors from '@/constants/colors';
import Animated, { FadeInDown } from 'react-native-reanimated';

const CATEGORY_LABELS: Record<string, string> = {
  top: 'Top',
  bottom: 'Bottom',
  dress: 'Dress',
  shoes: 'Shoes',
  outerwear: 'Outerwear',
  bag: 'Bag',
  jewelry: 'Jewelry',
};

const STYLE_GOAL_LABELS: Record<string, string> = {
  youthful: 'Youthful', elevated: 'Elevated', minimal: 'Minimal',
  romantic: 'Romantic', bold: 'Bold', classic: 'Classic',
};

function SlotChip({ slot }: { slot: WardrobeSlot }) {
  const owned = slot.status === 'owned';
  return (
    <View style={styles.slotChip}>
      <View style={styles.slotImageWrap}>
        <Image source={slot.sampleImage} style={styles.slotImage} resizeMode="cover" />
        <View style={[styles.statusDot, owned ? styles.statusDotOwned : styles.statusDotNeeded]}>
          <Ionicons
            name={owned ? 'checkmark' : 'add'}
            size={8}
            color={Colors.white}
          />
        </View>
      </View>
      <Text style={styles.slotCategory} numberOfLines={1}>
        {CATEGORY_LABELS[slot.category]}
      </Text>
      <Text style={styles.slotLabel} numberOfLines={2}>
        {slot.label}
      </Text>
      <View style={[styles.slotStatusBadge, owned ? styles.slotStatusOwned : styles.slotStatusNeeded]}>
        <Text style={[styles.slotStatusText, { color: owned ? Colors.success : Colors.warning }]}>
          {owned ? 'Owned' : 'Needed'}
        </Text>
      </View>
    </View>
  );
}

function OutfitGroupCard({ group, index }: { group: RecommendedOutfitGroup; index: number }) {
  const neededCount = group.slots.filter(s => s.status === 'needed').length;

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(400)} style={[
      styles.groupCard,
      group.isComplete && styles.groupCardComplete,
    ]}>
      <View style={styles.groupHeader}>
        <View style={styles.groupLabelRow}>
          <View style={[styles.lookBadge, group.isComplete && styles.lookBadgeComplete]}>
            <Text style={[styles.lookBadgeText, group.isComplete && styles.lookBadgeTextComplete]}>
              {group.label}
            </Text>
          </View>
          {group.isComplete ? (
            <View style={styles.completePill}>
              <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
              <Text style={styles.completePillText}>Ready to wear</Text>
            </View>
          ) : (
            <Text style={styles.missingText}>
              {neededCount} piece{neededCount !== 1 ? 's' : ''} to go
            </Text>
          )}
        </View>
        {group.vibe ? (
          <View style={styles.vibeRow}>
            <Ionicons name="sparkles-outline" size={11} color={Colors.secondary} />
            <Text style={styles.vibeText}>{group.vibe}</Text>
          </View>
        ) : null}
        {group.rationale ? (
          <Text style={styles.rationaleText}>{group.rationale}</Text>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.slotsRow}
      >
        {group.slots.map(slot => (
          <SlotChip key={slot.id} slot={slot} />
        ))}
      </ScrollView>
    </Animated.View>
  );
}

export default function OutfitIdeasScreen() {
  const insets = useSafeAreaInsets();
  const { recommendationSlots, profile } = useApp();
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const groups = generateRecommendedOutfitGroups(recommendationSlots);
  const remaining = groups.filter(g => !g.isComplete).length;
  const completed = groups.filter(g => g.isComplete).length;

  const styleLabel = profile.styleGoalPrimary
    ? STYLE_GOAL_LABELS[profile.styleGoalPrimary]
    : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.primary} />
        </Pressable>
        <Text style={styles.topBarTitle}>Outfit Ideas</Text>
        <View style={{ width: 40 }} />
      </View>

      {!profile.styleGoalPrimary ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="color-wand-outline" size={40} color={Colors.secondary} />
          </View>
          <Text style={styles.emptyTitle}>No style goal set</Text>
          <Text style={styles.emptySubtitle}>
            Set a primary style goal in your profile to unlock curated outfit ideas tailored to you.
          </Text>
          <Pressable style={styles.emptyButton} onPress={() => router.push('/(tabs)/profile')}>
            <Text style={styles.emptyButtonText}>Go to Profile</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Animated.View entering={FadeInDown.delay(0).duration(400)} style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryBlock}>
                <Text style={styles.summaryNumber}>{remaining}</Text>
                <Text style={styles.summaryLabel}>Ideas remaining</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryBlock}>
                <Text style={[styles.summaryNumber, { color: Colors.success }]}>{completed}</Text>
                <Text style={styles.summaryLabel}>Looks complete</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryBlock}>
                <Text style={styles.summaryNumber}>{groups.length}</Text>
                <Text style={styles.summaryLabel}>Total looks</Text>
              </View>
            </View>
            <View style={styles.styleTagRow}>
              <Ionicons name="sparkles" size={13} color={Colors.secondary} />
              <Text style={styles.styleTag}>
                Curated for your {styleLabel} style
                {profile.styleGoalSecondary
                  ? ` + ${STYLE_GOAL_LABELS[profile.styleGoalSecondary]}`
                  : ''}
              </Text>
            </View>
          </Animated.View>

          <Text style={styles.sectionTitle}>Your Curated Looks</Text>
          <Text style={styles.sectionSubtitle}>
            Acquire all pieces in a look to unlock it from your wardrobe. Owned items are tracked automatically.
          </Text>

          {groups.map((group, index) => (
            <OutfitGroupCard key={group.id} group={group} index={index} />
          ))}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 4,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    color: Colors.primary,
    letterSpacing: -0.3,
  },

  scrollContent: { paddingHorizontal: 20, paddingTop: 4 },

  summaryCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 18,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 14,
  },
  summaryBlock: { alignItems: 'center', flex: 1 },
  summaryNumber: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: Colors.secondary,
    letterSpacing: -1,
  },
  summaryLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  summaryDivider: { width: 1, height: 36, backgroundColor: Colors.border },
  styleTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
  },
  styleTag: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.textSecondary,
  },

  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.primary,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
    marginBottom: 16,
  },

  groupCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  groupCardComplete: {
    borderColor: Colors.success + '60',
    backgroundColor: Colors.success + '06',
  },

  groupHeader: { marginBottom: 14 },
  vibeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  vibeText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: Colors.secondary,
    letterSpacing: 0.2,
  },
  rationaleText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginTop: 6,
  },
  groupLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  lookBadge: {
    backgroundColor: Colors.secondary + '18',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  lookBadgeComplete: { backgroundColor: Colors.success + '18' },
  lookBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.secondary,
  },
  lookBadgeTextComplete: { color: Colors.success },

  completePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.success + '15',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  completePillText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: Colors.success,
  },
  missingText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
  },

  slotsRow: { gap: 10, paddingRight: 4 },

  slotChip: {
    width: 110,
    backgroundColor: Colors.background,
    borderRadius: 12,
    overflow: 'hidden',
  },
  slotImageWrap: {
    width: 110,
    height: 100,
    backgroundColor: Colors.border,
    position: 'relative',
  },
  slotImage: { width: 110, height: 100 },
  statusDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDotOwned: { backgroundColor: Colors.success },
  statusDotNeeded: { backgroundColor: Colors.warning },

  slotCategory: {
    fontFamily: 'Inter_500Medium',
    fontSize: 9,
    color: Colors.textLight,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  slotLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: Colors.primary,
    paddingHorizontal: 8,
    paddingTop: 2,
    lineHeight: 15,
  },
  slotStatusBadge: {
    marginHorizontal: 8,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  slotStatusOwned: { backgroundColor: Colors.success + '18' },
  slotStatusNeeded: { backgroundColor: Colors.warning + '18' },
  slotStatusText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 9,
  },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.secondary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: Colors.primary,
    letterSpacing: -0.4,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  emptyButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.white,
  },
});
