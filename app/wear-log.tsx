import {
  StyleSheet, Text, View, ScrollView, Pressable, Platform, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApp, WearEntry, WardrobeItem } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { OccasionTag } from '@/constants/types';

const scenarioLabels: Record<OccasionTag, { label: string; icon: string }> = {
  work:          { label: 'Work',       icon: 'briefcase-outline' },
  casual:        { label: 'Casual',     icon: 'cafe-outline' },
  'date-casual': { label: 'Date · Day', icon: 'cafe-outline' },
  'date-dressy': { label: 'Date Night', icon: 'heart-outline' },
  event:         { label: 'Event',      icon: 'sparkles-outline' },
  interview:     { label: 'Interview',  icon: 'mic-outline' },
  wedding:       { label: 'Wedding',    icon: 'rose-outline' },
  travel:        { label: 'Travel',     icon: 'airplane-outline' },
};

function formatDate(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function groupByDate(entries: WearEntry[]): { date: string; entries: WearEntry[] }[] {
  const map = new Map<string, WearEntry[]>();
  for (const entry of entries) {
    const group = map.get(entry.date) ?? [];
    group.push(entry);
    map.set(entry.date, group);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, entries]) => ({ date, entries }));
}

function ItemThumb({ item }: { item: WardrobeItem | undefined }) {
  if (!item) return null;
  if (item.photoUri) {
    return (
      <Image
        source={{ uri: item.photoUri }}
        style={styles.itemThumb}
        resizeMode="cover"
      />
    );
  }
  return (
    <View style={[styles.itemThumb, styles.itemThumbFallback]}>
      <Ionicons name="shirt-outline" size={18} color={Colors.secondary} />
    </View>
  );
}

export default function WearLogScreen() {
  const insets = useSafeAreaInsets();
  const { wearHistory, undoWear, wardrobeItems, isPremium } = useApp();
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const grouped = groupByDate(wearHistory);

  function getItems(entry: WearEntry): WardrobeItem[] {
    return entry.itemIds
      .map(id => wardrobeItems.find(w => w.id === id))
      .filter((w): w is WardrobeItem => Boolean(w));
  }

  if (!isPremium) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={Colors.primary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Wear Log</Text>
          </View>
        </View>
        <View style={styles.gateContainer}>
          <View style={styles.gateIcon}>
            <Ionicons name="calendar-outline" size={36} color={Colors.secondary} />
          </View>
          <Text style={styles.gateTitle}>Wear Log</Text>
          <Text style={styles.gateDesc}>
            Track every outfit you wear, review your history, and discover your cost-per-wear. A Premium feature.
          </Text>
          <Pressable style={styles.gateButton} onPress={() => router.push('/premium')}>
            <Ionicons name="star" size={16} color={Colors.white} />
            <Text style={styles.gateButtonText}>Unlock with Premium</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={Colors.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Wear Log</Text>
          <Text style={styles.subtitle}>
            {wearHistory.length === 0
              ? 'No outfits logged yet'
              : `${wearHistory.length} outfit${wearHistory.length === 1 ? '' : 's'} logged`}
          </Text>
        </View>
      </View>

      {wearHistory.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="calendar-outline" size={48} color={Colors.border} />
          </View>
          <Text style={styles.emptyTitle}>No outfits logged yet</Text>
          <Text style={styles.emptySubtitle}>
            Tap "Wearing this today" on any outfit card in the Outfits tab to start tracking what you wear.
          </Text>
          <Pressable style={styles.emptyAction} onPress={() => router.push('/(tabs)/outfits')}>
            <Ionicons name="sparkles-outline" size={16} color={Colors.white} />
            <Text style={styles.emptyActionText}>Browse Outfits</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {grouped.map((group, gi) => (
            <Animated.View key={group.date} entering={FadeInDown.delay(gi * 60).duration(400)}>
              <View style={styles.dateHeader}>
                <Text style={styles.dateLabel}>{formatDate(group.date)}</Text>
                <View style={styles.dateDivider} />
                <Text style={styles.dayCount}>
                  {group.entries.length} look{group.entries.length !== 1 ? 's' : ''}
                </Text>
              </View>

              {group.entries.map((entry, ei) => {
                const items = getItems(entry);
                const scenario = scenarioLabels[entry.occasion];
                const isToday = entry.date === new Date().toISOString().slice(0, 10);

                return (
                  <View key={entry.id} style={styles.entryCard}>
                    <View style={styles.entryHeader}>
                      <View style={styles.scenarioPill}>
                        <Ionicons
                          name={scenario?.icon as any || 'ellipse-outline'}
                          size={13}
                          color={Colors.secondary}
                        />
                        <Text style={styles.scenarioLabel}>{scenario?.label}</Text>
                      </View>
                      <Text style={styles.entryTime}>{formatTime(entry.loggedAt)}</Text>
                    </View>

                    {items.length > 0 && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.thumbsRow}
                      >
                        {items.map(item => (
                          <View key={item.id} style={styles.thumbWrap}>
                            <ItemThumb item={item} />
                            <Text style={styles.thumbLabel} numberOfLines={1}>
                              {item.subType.replace(/-/g, ' ')}
                            </Text>
                          </View>
                        ))}
                      </ScrollView>
                    )}

                    {items.length === 0 && (
                      <Text style={styles.noItemsText}>Items no longer in wardrobe</Text>
                    )}

                    {isToday && (
                      <Pressable
                        style={styles.undoButton}
                        onPress={() => undoWear(entry.id)}
                      >
                        <Ionicons name="return-up-back-outline" size={13} color={Colors.textSecondary} />
                        <Text style={styles.undoText}>Remove entry</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </Animated.View>
          ))}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, marginTop: 8, marginBottom: 20,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  title: { fontFamily: 'Inter_700Bold', fontSize: 24, color: Colors.primary, letterSpacing: -0.5 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 1 },

  scrollContent: { paddingHorizontal: 20 },

  dateHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 12, marginTop: 8,
  },
  dateLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary, flexShrink: 0 },
  dateDivider: { flex: 1, height: 1, backgroundColor: Colors.border },
  dayCount: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textLight, flexShrink: 0 },

  entryCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 14,
    marginBottom: 12, borderWidth: 1, borderColor: Colors.border,
  },
  entryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  scenarioPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.background, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  scenarioLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.primary },
  entryTime: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textLight },

  thumbsRow: { gap: 10, paddingBottom: 4 },
  thumbWrap: { alignItems: 'center', width: 68 },
  itemThumb: { width: 64, height: 80, borderRadius: 10, marginBottom: 5 },
  itemThumbFallback: {
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  thumbLabel: {
    fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textSecondary,
    textTransform: 'capitalize', textAlign: 'center',
  },

  noItemsText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textLight, fontStyle: 'italic' },

  undoButton: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  undoText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textSecondary },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 80 },
  emptyIcon: {
    width: 88, height: 88, borderRadius: 24,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 20, color: Colors.primary, textAlign: 'center' },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 20, marginTop: 10,
  },
  emptyAction: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 12, marginTop: 24,
  },
  emptyActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.white },

  gateContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 36, paddingBottom: 80,
  },
  gateIcon: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: Colors.secondary + '12',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  gateTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.primary, textAlign: 'center' },
  gateDesc: {
    fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 21, marginTop: 10, marginBottom: 28,
  },
  gateButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.secondary, borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 14,
  },
  gateButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.white },
});
