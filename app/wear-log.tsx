import {
  StyleSheet, Text, View, ScrollView, Pressable, Platform, Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApp, WearEntry, WardrobeItem } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { OccasionTag } from '@/constants/types';
import { computeItemCpw, formatCpw, computeWardrobeDividends, DividendItem } from '@/constants/cpw';
import { rs } from '../lib/responsive';

const FREE_LOG_DAYS = 7;

const scenarioLabels: Record<OccasionTag, { label: string; icon: string }> = {
  work:          { label: 'Work',       icon: 'briefcase-outline' },
  casual:        { label: 'Casual',     icon: 'cafe-outline' },
  'date-casual': { label: 'Date · Day', icon: 'cafe-outline' },
  'date-dressy': { label: 'Date Night', icon: 'heart-outline' },
  event:         { label: 'Event',      icon: 'sparkles-outline' },
  interview:     { label: 'Interview',  icon: 'mic-outline' },
  wedding:       { label: 'Wedding',    icon: 'rose-outline' },
  travel:        { label: 'Travel',     icon: 'airplane-outline' },
  brunch:        { label: 'Brunch',     icon: 'cafe-outline' },
  active:        { label: 'Active',     icon: 'fitness-outline' },
  resort:        { label: 'Resort',     icon: 'sunny-outline' },
  'night-out':   { label: 'Night Out',  icon: 'moon-outline' },
} satisfies Record<OccasionTag, { label: string; icon: string }>;

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

function ItemThumb({ item, isHero = false }: { item: WardrobeItem | undefined; isHero?: boolean }) {
  if (!item) return null;
  const heroBorderStyle = isHero
    ? { borderWidth: 2, borderColor: Colors.secondary }
    : {};
  if (item.photoUri) {
    return (
      <Image
        source={{ uri: item.photoUri }}
        style={[styles.itemThumb, heroBorderStyle]}
        resizeMode="cover"
      />
    );
  }
  return (
    <View style={[styles.itemThumb, styles.itemThumbFallback, heroBorderStyle]}>
      <Ionicons name="shirt-outline" size={18} color={Colors.secondary} />
    </View>
  );
}

function DividendCard({ dividend }: { dividend: DividendItem }) {
  const { item, wearCount, cpw } = dividend;
  return (
    <View style={styles.dividendCard}>
      {item.photoUri ? (
        <Image
          source={{ uri: item.photoUri }}
          style={styles.dividendPhoto}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.dividendPhoto, styles.dividendPhotoFallback]}>
          <Ionicons name="shirt-outline" size={20} color={Colors.secondary} />
        </View>
      )}
      <Text style={styles.dividendName} numberOfLines={1}>
        {item.subType.replace(/-/g, ' ')}
      </Text>
      <Text style={styles.dividendCpw}>{formatCpw(cpw)}</Text>
      <Text style={styles.dividendPerWear}>per wear</Text>
      <Text style={styles.dividendWears}>{wearCount} {wearCount === 1 ? 'wear' : 'wears'}</Text>
    </View>
  );
}

export default function WearLogScreen() {
  const insets = useSafeAreaInsets();
  const { wearHistory, undoWear, wardrobeItems, isPremium, getItemWearCount } = useApp();
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const cutoff = (() => {
    if (isPremium) return null;
    const d = new Date();
    d.setDate(d.getDate() - FREE_LOG_DAYS);
    return d.toISOString().slice(0, 10);
  })();

  const visibleHistory = cutoff
    ? wearHistory.filter(e => e.date >= cutoff)
    : wearHistory;

  const hiddenCount = wearHistory.length - visibleHistory.length;
  const grouped = groupByDate(visibleHistory);

  const dividends: DividendItem[] = isPremium
    ? computeWardrobeDividends(wardrobeItems, getItemWearCount, 3)
    : [];

  function getItems(entry: WearEntry): WardrobeItem[] {
    return entry.itemIds
      .map(id => wardrobeItems.find(w => w.id === id))
      .filter((w): w is WardrobeItem => Boolean(w));
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={Colors.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Wear Log</Text>
          <Text style={styles.subtitle}>
            {visibleHistory.length === 0
              ? 'No outfits logged yet'
              : `${visibleHistory.length} outfit${visibleHistory.length === 1 ? '' : 's'} logged`}
          </Text>
        </View>
      </View>

      {!isPremium && (
        <Pressable
          style={({ pressed }) => [styles.freeNotice, pressed && { opacity: 0.82 }]}
          onPress={() => router.push('/premium')}
        >
          <Ionicons name="calendar-outline" size={14} color={Colors.secondary} />
          <Text style={styles.freeNoticeText}>Showing last {FREE_LOG_DAYS} days</Text>
          <View style={styles.freeNoticePill}>
            <Text style={styles.freeNoticePillText}>Full history with Premium</Text>
          </View>
        </Pressable>
      )}

      {visibleHistory.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="calendar-outline" size={48} color={Colors.border} />
          </View>
          <Text style={styles.emptyTitle}>No outfits logged yet</Text>
          <Text style={styles.emptySubtitle}>
            Tap &ldquo;Wearing this today&rdquo; on any outfit card in the Outfits tab to start tracking what you wear.
          </Text>
          <Pressable style={styles.emptyAction} onPress={() => router.push('/(tabs)/outfits')}>
            <Ionicons name="sparkles-outline" size={16} color={Colors.white} />
            <Text style={styles.emptyActionText}>Browse Outfits</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* ── Wardrobe Dividends (premium) ────────────────────────── */}
          {isPremium && dividends.length > 0 && (
            <Animated.View entering={FadeInDown.delay(40).duration(280)} style={styles.dividendsCard}>
              <View style={styles.dividendsHeader}>
                <View style={styles.dividendsAccent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.dividendsSectionLabel}>WARDROBE DIVIDENDS</Text>
                  <Text style={styles.dividendsTitle}>Hardest-working pieces</Text>
                </View>
                <View style={styles.dividendsBadge}>
                  <Ionicons name="trending-down-outline" size={12} color={Colors.secondary} />
                </View>
              </View>
              <Text style={styles.dividendsSub}>
                Sorted by lowest cost per wear
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dividendsRow}
              >
                {dividends.map(d => (
                  <DividendCard key={d.item.id} dividend={d} />
                ))}
              </ScrollView>
            </Animated.View>
          )}

          {/* ── Date groups ─────────────────────────────────────────── */}
          {grouped.map((group, gi) => (
            <Animated.View key={group.date} entering={FadeInDown.delay(gi * 60 + 80).duration(280)}>
              <View style={styles.dateHeader}>
                <Text style={styles.dateLabel}>{formatDate(group.date)}</Text>
                <View style={styles.dateDivider} />
                <Text style={styles.dayCount}>
                  {group.entries.length} look{group.entries.length !== 1 ? 's' : ''}
                </Text>
              </View>

              {group.entries.map((entry) => {
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
                        {items.map(item => {
                          const isHero = !!entry.heroId && item.id === entry.heroId;
                          const itemWearCount = getItemWearCount(item.id);
                          const itemCpw = item.purchasePrice && item.purchasePrice > 0 && itemWearCount > 0
                            ? computeItemCpw(item.purchasePrice, itemWearCount)
                            : null;
                          return (
                            <View key={item.id} style={styles.thumbWrap}>
                              <ItemThumb item={item} isHero={isHero} />
                              <Text style={styles.thumbLabel} numberOfLines={1}>
                                {item.subType.replace(/-/g, ' ')}
                              </Text>
                              {isHero && (
                                <Text style={styles.heroPieceLabel}>Focal piece</Text>
                              )}
                              {itemCpw !== null && (
                                <View style={styles.cpwChip}>
                                  <Text style={styles.cpwChipText}>{formatCpw(itemCpw)}/wear</Text>
                                </View>
                              )}
                            </View>
                          );
                        })}
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

          {!isPremium && hiddenCount > 0 && (
            <Pressable
              style={({ pressed }) => [styles.historyGate, pressed && { opacity: 0.85 }]}
              onPress={() => router.push('/premium')}
            >
              <Ionicons name="lock-closed-outline" size={18} color={Colors.secondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.historyGateTitle}>
                  {hiddenCount} older {hiddenCount === 1 ? 'entry' : 'entries'} hidden
                </Text>
                <Text style={styles.historyGateSub}>
                  Upgrade to Premium for your full wear history and cost-per-wear insights.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={Colors.secondary} />
            </Pressable>
          )}

          {!isPremium && hiddenCount === 0 && wearHistory.length > 0 && (
            <Pressable
              style={({ pressed }) => [styles.historyGate, pressed && { opacity: 0.85 }]}
              onPress={() => router.push('/premium')}
            >
              <Ionicons name="analytics-outline" size={18} color={Colors.secondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.historyGateTitle}>Unlock full history &amp; cost-per-wear</Text>
                <Text style={styles.historyGateSub}>
                  See every outfit you have ever worn and how hard each piece is working.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={Colors.secondary} />
            </Pressable>
          )}

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
    paddingHorizontal: 20, marginTop: 8, marginBottom: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  title: { fontFamily: 'Inter_700Bold', fontSize: rs(24), color: Colors.primary, letterSpacing: -0.5 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.textSecondary, marginTop: 1 },

  freeNotice: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 14,
    backgroundColor: Colors.white, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.secondary + '30',
  },
  freeNoticeText: { fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.textSecondary, flex: 1 },
  freeNoticePill: {
    backgroundColor: Colors.secondary + '18', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  freeNoticePillText: { fontFamily: 'Inter_600SemiBold', fontSize: rs(10), color: Colors.secondary },

  scrollContent: { paddingHorizontal: 20 },

  // ── Wardrobe Dividends ─────────────────────────────────────────────────────
  dividendsCard: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 16,
    marginBottom: 20, borderWidth: 1, borderColor: Colors.secondary + '28',
    borderLeftWidth: 3, borderLeftColor: Colors.secondary + '80',
    shadowColor: Colors.secondary, shadowOpacity: 0.06, shadowRadius: 10, elevation: 1,
  },
  dividendsHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 4 },
  dividendsAccent: { display: 'none' },
  dividendsSectionLabel: {
    fontFamily: 'Inter_400Regular', fontSize: rs(10), color: Colors.secondary,
    textTransform: 'uppercase', letterSpacing: 1.0, marginBottom: 2,
  },
  dividendsTitle: {
    fontFamily: 'Inter_600SemiBold', fontSize: rs(15), color: Colors.primary, letterSpacing: -0.2,
  },
  dividendsBadge: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: Colors.secondary + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  dividendsSub: {
    fontFamily: 'Inter_400Regular', fontSize: rs(11), color: Colors.textSecondary,
    marginBottom: 14, lineHeight: 15,
  },
  dividendsRow: { gap: 12 },
  dividendCard: {
    width: 96, alignItems: 'center',
    backgroundColor: Colors.background, borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  dividendPhoto: {
    width: 72, height: 90, borderRadius: 10, marginBottom: 8,
    backgroundColor: Colors.border,
  },
  dividendPhotoFallback: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  dividendName: {
    fontFamily: 'Inter_500Medium', fontSize: rs(10), color: Colors.primary,
    textTransform: 'capitalize', textAlign: 'center', marginBottom: 5,
  },
  dividendCpw: {
    fontFamily: 'Inter_700Bold', fontSize: rs(14), color: Colors.secondary,
    letterSpacing: -0.3, textAlign: 'center',
  },
  dividendPerWear: {
    fontFamily: 'Inter_400Regular', fontSize: rs(9), color: Colors.textLight,
    textAlign: 'center', marginBottom: 4,
  },
  dividendWears: {
    fontFamily: 'Inter_400Regular', fontSize: rs(9), color: Colors.textSecondary,
    textAlign: 'center',
  },

  // ── Date groups ────────────────────────────────────────────────────────────
  dateHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 12, marginTop: 8,
  },
  dateLabel: { fontFamily: 'Inter_600SemiBold', fontSize: rs(14), color: Colors.primary, flexShrink: 0 },
  dateDivider: { flex: 1, height: 1, backgroundColor: Colors.border },
  dayCount: { fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.textLight, flexShrink: 0 },

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
  scenarioLabel: { fontFamily: 'Inter_600SemiBold', fontSize: rs(12), color: Colors.primary },
  entryTime: { fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.textLight },

  thumbsRow: { gap: 10, paddingBottom: 4 },
  thumbWrap: { alignItems: 'center', width: 68 },
  itemThumb: { width: 64, height: 80, borderRadius: 10, marginBottom: 5 },
  itemThumbFallback: {
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  thumbLabel: {
    fontFamily: 'Inter_400Regular', fontSize: rs(10), color: Colors.textSecondary,
    textTransform: 'capitalize', textAlign: 'center',
  },
  heroPieceLabel: {
    fontFamily: 'Inter_500Medium', fontSize: rs(9), color: Colors.secondary,
    textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 3, textAlign: 'center',
  },
  cpwChip: {
    marginTop: 4, backgroundColor: Colors.secondary + '12',
    borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2,
    borderWidth: 1, borderColor: Colors.secondary + '25',
  },
  cpwChipText: {
    fontFamily: 'Inter_600SemiBold', fontSize: rs(9), color: Colors.secondary, textAlign: 'center',
  },

  noItemsText: { fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.textLight, fontStyle: 'italic' },

  undoButton: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  undoText: { fontFamily: 'Inter_500Medium', fontSize: rs(12), color: Colors.textSecondary },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 80 },
  emptyIcon: {
    width: 88, height: 88, borderRadius: 24,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(20), color: Colors.primary, textAlign: 'center' },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular', fontSize: rs(13), color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 20, marginTop: 10,
  },
  emptyAction: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 12, marginTop: 24,
  },
  emptyActionText: { fontFamily: 'Inter_600SemiBold', fontSize: rs(14), color: Colors.white },

  historyGate: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.secondary + '30',
    marginBottom: 16,
  },
  historyGateTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(13), color: Colors.primary },
  historyGateSub: { fontFamily: 'Inter_400Regular', fontSize: rs(11), color: Colors.textSecondary, marginTop: 2, lineHeight: 15 },
});
