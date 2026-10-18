import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';

export default function PersonalIntelligenceScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const {
    affinityActive,
    affinitySignalCount,
    topAffinityItems,
    topAffinityPairs,
    wardrobeItems,
    isPremium,
  } = useApp();
  const signalCount = Math.round(affinitySignalCount);
  const itemLabel = (id: string) => {
    const item = wardrobeItems.find(wardrobeItem => wardrobeItem.id === id);
    if (!item) return 'Removed item';
    return `${item.colorFamily} ${item.subType.replace(/-/g, ' ')}`;
  };
  const entering = reduceMotion ? undefined : FadeInDown.duration(200);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Profile"
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.primary} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.headerTitle}>Personal Intelligence</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Animated.View entering={entering} style={styles.card}>
          <View style={styles.statusRow}>
            <Text style={styles.status}>
              {affinityActive
                ? `Active · ${signalCount} signal${signalCount === 1 ? '' : 's'}`
                : `Learning… ${signalCount}/5 signals before tuning kicks in`}
            </Text>
          </View>
          <Text style={styles.explainer}>
            Loves, &quot;not today&quot; taps, and outfits you wear quietly shape what surfaces next. Nothing is ever fully banned.
          </Text>

          <Text accessibilityRole="header" style={styles.sectionTitle}>Pieces you reach for</Text>
          {topAffinityItems.liked.length === 0
            ? <Text style={styles.emptyState}>None yet — log a few outfits to start.</Text>
            : topAffinityItems.liked.map(({ id, score }) => (
              <View key={`liked-${id}`} style={styles.signalRow}>
                <Text style={styles.itemLabel}>{itemLabel(id)}</Text>
                <Text style={styles.score}>{`+${score.toFixed(1)}`}</Text>
              </View>
            ))}

          <Text accessibilityRole="header" style={styles.sectionTitle}>Pieces you skip</Text>
          {topAffinityItems.disliked.length === 0
            ? <Text style={styles.emptyState}>None — keep tapping &quot;not today&quot; to teach me.</Text>
            : topAffinityItems.disliked.map(({ id, score }) => (
              <View key={`disliked-${id}`} style={styles.signalRow}>
                <Text style={styles.itemLabel}>{itemLabel(id)}</Text>
                <Text style={styles.score}>{score.toFixed(1)}</Text>
              </View>
            ))}

          {isPremium ? (
            topAffinityPairs.liked.length > 0 && (
              <>
                <Text accessibilityRole="header" style={styles.sectionTitle}>Combinations that work</Text>
                {topAffinityPairs.liked.map(({ ids, score }) => (
                  <View key={`pair-${ids[0]}-${ids[1]}`} style={styles.signalRow}>
                    <Text style={styles.itemLabel}>{itemLabel(ids[0])} + {itemLabel(ids[1])}</Text>
                    <Text style={styles.score}>{`+${score.toFixed(1)}`}</Text>
                  </View>
                ))}
              </>
            )
          ) : (
            <View style={styles.premiumRow}>
              <View style={styles.premiumCopy}>
                <Ionicons name="lock-closed-outline" size={14} color={Colors.primary + 'B3'} />
                <Text style={styles.premiumText}>Combination learning — Premium</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    minHeight: 56,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: { width: 44, height: 44, justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: Colors.primary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
  },
  headerSpacer: { width: 44 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 32, paddingTop: 8 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingBottom: 8,
    overflow: 'hidden',
  },
  statusRow: {
    minHeight: 56,
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  status: { color: Colors.textSecondary, fontFamily: 'Inter_500Medium', fontSize: 14 },
  explainer: {
    color: Colors.textSecondary,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sectionTitle: {
    color: Colors.textSecondary,
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  emptyState: {
    color: Colors.textSecondary,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
    fontStyle: 'italic',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  signalRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  itemLabel: { flex: 1, color: Colors.primary, fontFamily: 'Inter_400Regular', fontSize: 14 },
  score: {
    color: Colors.textSecondary,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  premiumRow: {
    minHeight: 56,
    marginTop: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  premiumCopy: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  premiumText: { flex: 1, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', fontSize: 14 },
});
