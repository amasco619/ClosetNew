import { StyleSheet, Text, View, ScrollView, Pressable, Platform, Image, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useMemo, useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { countRecommendedOutfits } from '@/constants/wardrobeBlueprint';
import { defaultTempUnit, formatTemp, formatTempValue } from '@/constants/weather';
import Colors from '@/constants/colors';
import Animated, { FadeInDown, FadeInUp, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

const styleGoalLabels: Record<string, string> = {
  youthful: 'Youthful', elevated: 'Elevated', minimal: 'Minimal',
  romantic: 'Romantic', bold: 'Bold', classic: 'Classic',
};

const categoryIcons: Record<string, string> = {
  top: 'shirt-outline', bottom: 'resize-outline', dress: 'body-outline',
  outerwear: 'cloudy-outline', shoes: 'footsteps-outline', bag: 'bag-handle-outline',
  jewelry: 'diamond-outline',
};

const categoryLabels: Record<string, string> = {
  top: 'Tops', bottom: 'Bottoms', outerwear: 'Outerwear', shoes: 'Shoes', jewelry: 'Jewelry',
};

const occasionLabels: Record<string, string> = {
  work: 'Work', casual: 'Casual',
  'date-casual': 'Date · Day', 'date-dressy': 'Date Night',
  event: 'Event', interview: 'Interview', wedding: 'Wedding', travel: 'Travel',
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const {
    profile, wardrobeItems, activeWardrobeItems, outfitSets, isPremium, canAddItem,
    starterRecommendations, recommendationSlots, todaysWear, wearHistory, backfillProgress,
    reactToOutfit, getOutfitReaction, logWear, undoWear, isWornToday,
    weather, weatherLoading, isGuest,
  } = useApp();
  // Resolve the temperature unit: user override, or auto-detect from locale.
  const effectiveTempUnit = profile.tempUnit ?? defaultTempUnit();

  // Compact summary for the weather chip — only shown when the user hasn't
  // opted out and we actually have a snapshot. Tapping the chip opens
  // Profile so they can disable weather-aware outfits in one place.
  const weatherSummary = (() => {
    if (profile.weatherEnabled === false) return null;
    if (!weather) return weatherLoading ? 'Reading weather…' : null;
    const t = formatTemp(weather.currentTempC, effectiveTempUnit);
    const lo = formatTempValue(weather.lowC, effectiveTempUnit);
    const hi = formatTempValue(weather.highC, effectiveTempUnit);
    const unitSuffix = effectiveTempUnit === 'F' ? '°F' : '°';
    const wet = weather.precipProbability >= 0.6 ? ' · Rain likely' : '';
    const loc = weather.locationLabel ? ` · ${weather.locationLabel}` : '';
    return `${t} · L${lo}/H${hi}${unitSuffix}${wet}${loc}`;
  })();
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const categoryCounts: Record<string, number> = {};
  activeWardrobeItems.forEach(item => {
    categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
  });

  // Outfit Ideas: count curated looks assembable from the style blueprint.
  // Uses the full recommendation set (owned + needed) so the number reflects
  // all curated looks for the user's style, not just what they already own.
  // Falls back to the classic blueprint when no primary style goal is set.
  const outfitIdeas = countRecommendedOutfits(recommendationSlots);

  // A "ready" outfit requires all pieces to be owned AND a complete core:
  // (dress OR top+bottom) AND shoes together.
  const readyOutfitsList = useMemo(() => outfitSets.filter(o => {
    if (!o.components.every(c => c.owned)) return false;
    const hasDress  = o.components.some(c => c.category === 'dress');
    const hasTop    = o.components.some(c => c.category === 'top');
    const hasBottom = o.components.some(c => c.category === 'bottom');
    const hasShoes  = o.components.some(c => c.category === 'shoes');
    return (hasDress || (hasTop && hasBottom)) && hasShoes;
  }), [outfitSets]);
  const readyOutfits = readyOutfitsList.length;
  // Surface one "Today's Pick" — the highest-confidence ready outfit — so the
  // calibration loop can collect signals straight from the dashboard.
  const todaysPick = readyOutfitsList[0] ?? null;
  const pickReaction = todaysPick ? getOutfitReaction(todaysPick) : null;
  const pickWornToday = todaysPick ? isWornToday(todaysPick) : false;
  const pickFp = todaysPick
    ? todaysPick.components.map(c => c.matchedItemId).filter(Boolean).sort().join('|')
    : '';
  const pickWornEntry = pickFp
    ? wearHistory.find(e => e.outfitFingerprint === pickFp && e.date === new Date().toISOString().slice(0, 10))
    : undefined;

  const quickTips = [
    { icon: 'bulb-outline' as const, text: 'A navy blazer works for both work and evening events.' },
    { icon: 'color-palette-outline' as const, text: 'Neutral tones create a luxury feel effortlessly.' },
    { icon: 'diamond-outline' as const, text: 'Minimal gold jewelry elevates any casual outfit.' },
  ];

  const [showAccountPrompt, setShowAccountPrompt] = useState(false);
  const [promptDismissed, setPromptDismissed] = useState(false);
  useEffect(() => {
    if (!isGuest || promptDismissed) return;
    if (wardrobeItems.length === 0) return;
    const t = setTimeout(() => setShowAccountPrompt(true), 4000);
    return () => clearTimeout(t);
  }, [isGuest, promptDismissed, wardrobeItems.length]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Animated.View entering={FadeInDown.delay(60).duration(280)} style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back</Text>
            <Text style={styles.appName}>AuraCloset</Text>
          </View>
          {isPremium && (
            <View style={styles.premiumBadge}>
              <Ionicons name="star" size={14} color={Colors.secondary} />
              <Text style={styles.premiumText}>Premium</Text>
            </View>
          )}
        </Animated.View>

        {isGuest && (
          <Pressable
            style={({ pressed }) => [styles.guestBanner, pressed && { opacity: 0.82 }]}
            onPress={() => { Haptics.selectionAsync(); router.push('/sign-in'); }}
          >
            <Ionicons name="cloud-upload-outline" size={14} color={Colors.secondary} />
            <Text style={styles.guestBannerText}>Saved on device — create an account to sync</Text>
            <Ionicons name="chevron-forward" size={13} color={Colors.secondary} />
          </Pressable>
        )}

        {weatherSummary && (
          <Pressable
            onPress={() => router.push('/(tabs)/profile')}
            style={styles.weatherChip}
          >
            <Ionicons name="partly-sunny-outline" size={14} color={Colors.primary} />
            <Text style={styles.weatherChipText}>{weatherSummary}</Text>
          </Pressable>
        )}

        {backfillProgress && backfillProgress.total > 0 && (
          <View style={styles.backfillBanner}>
            <Ionicons name="color-palette-outline" size={16} color={Colors.secondary} />
            <Text style={styles.backfillText}>
              Refining colour analysis · {backfillProgress.done}/{backfillProgress.total}
            </Text>
            <View style={styles.backfillTrack}>
              <View
                style={[
                  styles.backfillFill,
                  { width: `${Math.round((backfillProgress.done / backfillProgress.total) * 100)}%` },
                ]}
              />
            </View>
          </View>
        )}

        <Animated.View entering={FadeInDown.delay(120).duration(280)} style={styles.statsRow}>
          <Pressable
            style={({ pressed }) => [styles.statCard, pressed && styles.cardPressed]}
            onPress={() => { Haptics.selectionAsync(); router.push('/(tabs)/wardrobe'); }}
          >
            <Text style={styles.statNumber}>{activeWardrobeItems.length}</Text>
            <Text style={styles.statLabel}>Items</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.statCard, pressed && styles.cardPressed]}
            onPress={() => { Haptics.selectionAsync(); router.push('/(tabs)/outfits'); }}
          >
            <Text style={styles.statNumber}>{readyOutfits}</Text>
            <Text style={styles.statLabel}>Ready Outfits</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.statCard, pressed && styles.cardPressed]}
            onPress={() => { Haptics.selectionAsync(); router.push('/outfit-ideas'); }}
          >
            <Text style={styles.statNumber}>{outfitIdeas}</Text>
            <Text style={styles.statLabel}>Outfit Ideas</Text>
          </Pressable>
        </Animated.View>

        {todaysPick && (
          <Animated.View entering={FadeInDown.delay(180).duration(280)} style={styles.pickCard}>
            <View style={styles.pickHeader}>
              <Ionicons name="sparkles" size={16} color={Colors.secondary} />
              <Text style={styles.pickTitle}>Today's Pick</Text>
              <Pressable onPress={() => router.push('/(tabs)/outfits')} style={styles.pickSeeAll}>
                <Text style={styles.pickSeeAllText}>More</Text>
                <Ionicons name="chevron-forward" size={13} color={Colors.secondary} />
              </Pressable>
            </View>
            <View style={styles.pickPhotosRow}>
              {todaysPick.components.slice(0, 4).map((c, i) => {
                const item = c.matchedItemId ? wardrobeItems.find(w => w.id === c.matchedItemId) : null;
                return (
                  <View key={`pick-${i}`} style={styles.pickPhotoWrap}>
                    {item?.photoUri ? (
                      <Image source={{ uri: item.photoUri }} style={styles.pickPhoto} resizeMode="cover" />
                    ) : (
                      <View style={[styles.pickPhoto, styles.pickPhotoFallback]}>
                        <Ionicons name="shirt-outline" size={20} color={Colors.textLight} />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
            <View style={styles.pickActions}>
              {pickWornToday ? (
                <Pressable
                  style={styles.pickUndoBtn}
                  onPress={() => pickWornEntry && undoWear(pickWornEntry.id)}
                >
                  <Ionicons name="return-up-back-outline" size={13} color={Colors.textSecondary} />
                  <Text style={styles.pickUndoText}>Worn — undo</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={styles.pickWearBtn}
                  onPress={() => { Haptics.selectionAsync(); logWear(todaysPick); }}
                >
                  <Ionicons name="calendar-outline" size={13} color={Colors.white} />
                  <Text style={styles.pickWearText}>Wore today</Text>
                </Pressable>
              )}
              <View style={styles.pickReactionRow}>
                <Pressable
                  style={[styles.pickReactBtn, pickReaction === 'love' && styles.pickReactBtnLove]}
                  onPress={() => { Haptics.selectionAsync(); reactToOutfit(todaysPick, 'love'); }}
                  hitSlop={6}
                >
                  <Ionicons
                    name={pickReaction === 'love' ? 'heart' : 'heart-outline'}
                    size={15}
                    color={pickReaction === 'love' ? '#DC2626' : Colors.textSecondary}
                  />
                </Pressable>
                <Pressable
                  style={[styles.pickReactBtn, pickReaction === 'not-today' && styles.pickReactBtnSkip]}
                  onPress={() => { Haptics.selectionAsync(); reactToOutfit(todaysPick, 'not-today'); }}
                  hitSlop={6}
                >
                  <Ionicons
                    name={pickReaction === 'not-today' ? 'close-circle' : 'close-circle-outline'}
                    size={15}
                    color={pickReaction === 'not-today' ? Colors.textSecondary : Colors.textLight}
                  />
                </Pressable>
              </View>
            </View>
          </Animated.View>
        )}

        {profile.styleGoalPrimary && (
          <Animated.View entering={FadeInDown.delay(220).duration(280)} style={styles.styleCard}>
            <View style={styles.styleCardHeader}>
              <MaterialCommunityIcons name="hanger" size={20} color={Colors.secondary} />
              <Text style={styles.styleCardTitle}>Your Style</Text>
            </View>
            <Text style={styles.styleCardValue}>
              {styleGoalLabels[profile.styleGoalPrimary]}
              {profile.styleGoalSecondary ? ` + ${styleGoalLabels[profile.styleGoalSecondary]}` : ''}
            </Text>
          </Animated.View>
        )}

        {todaysWear.length > 0 && (
          <Animated.View entering={FadeInDown.delay(250).duration(280)} style={styles.todayCard}>
            <View style={styles.todayCardHeader}>
              <Ionicons name="calendar" size={18} color={Colors.secondary} />
              <Text style={styles.todayCardTitle}>Today's Looks</Text>
              <Pressable onPress={() => router.push(isPremium ? '/wear-log' : '/premium')} style={styles.todaySeeAll}>
                <Text style={styles.todaySeeAllText}>See all</Text>
                <Ionicons name="chevron-forward" size={13} color={Colors.secondary} />
              </Pressable>
            </View>
            <View style={styles.todayPills}>
              {todaysWear.map(entry => (
                <View key={entry.id} style={styles.todayPill}>
                  <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
                  <Text style={styles.todayPillText}>{occasionLabels[entry.occasion] ?? entry.occasion}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(290).duration(280)}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsRow}>
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
              onPress={() => {
                if (canAddItem) {
                  router.push('/add-item');
                } else {
                  router.push('/premium');
                }
              }}
            >
              <View style={[styles.actionIcon, { backgroundColor: Colors.blush + '30' }]}>
                <Ionicons name="add" size={24} color={Colors.primary} />
              </View>
              <Text style={styles.actionLabel}>Add Item</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
              onPress={() => router.push('/(tabs)/outfits')}
            >
              <View style={[styles.actionIcon, { backgroundColor: Colors.sage + '30' }]}>
                <Ionicons name="sparkles" size={24} color={Colors.sage} />
              </View>
              <Text style={styles.actionLabel}>Get Outfits</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
              onPress={() => router.push(isPremium ? '/blueprint' : '/premium')}
            >
              <View style={[styles.actionIcon, { backgroundColor: Colors.secondary + '20' }]}>
                {isPremium ? (
                  <Ionicons name="map-outline" size={24} color={Colors.secondary} />
                ) : (
                  <View style={{ position: 'relative' }}>
                    <Ionicons name="map-outline" size={24} color={Colors.secondary} />
                    <View style={styles.lockBadge}>
                      <Ionicons name="lock-closed" size={9} color={Colors.white} />
                    </View>
                  </View>
                )}
              </View>
              <Text style={styles.actionLabel}>Blueprint</Text>
            </Pressable>
          </View>
        </Animated.View>

        {Object.values(starterRecommendations).some(Boolean) && (
          <Animated.View entering={FadeInDown.delay(340).duration(280)}>
            <Text style={styles.sectionTitle}>Starter Recommendations</Text>
            <Text style={styles.recSubtitle}>
              {profile.styleGoalPrimary
                ? `Curated for your ${styleGoalLabels[profile.styleGoalPrimary]} style`
                : 'Key pieces to build your capsule wardrobe'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recScroll} contentContainerStyle={styles.recScrollContent}>
              {Object.entries(starterRecommendations).map(([cat, slot]) => {
                if (!slot) return null;
                return (
                  <View key={slot.id} style={styles.recCard}>
                    <Image source={slot.sampleImage} style={styles.recImage} resizeMode="cover" />
                    <View style={styles.recCategoryBadge}>
                      <Text style={styles.recCategoryText}>{categoryLabels[cat] || cat}</Text>
                    </View>
                    <Text style={styles.recLabel} numberOfLines={1}>{slot.label}</Text>
                    <Text style={styles.recDesc} numberOfLines={2}>{slot.description}</Text>
                    <View style={styles.recNeededBadge}>
                      <Ionicons name="add-circle-outline" size={12} color={Colors.warning} />
                      <Text style={styles.recNeededText}>Needed</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </Animated.View>
        )}

        {activeWardrobeItems.length > 0 && (
          <Animated.View entering={FadeInDown.delay(380).duration(280)}>
            <Text style={styles.sectionTitle}>Wardrobe Breakdown</Text>
            <View style={styles.breakdownCard}>
              {Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                <View key={cat} style={styles.breakdownRow}>
                  <View style={styles.breakdownLeft}>
                    <Ionicons name={categoryIcons[cat] as any || 'ellipse-outline'} size={18} color={Colors.secondary} />
                    <Text style={styles.breakdownLabel}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</Text>
                  </View>
                  <View style={styles.breakdownRight}>
                    <View style={styles.breakdownBarBg}>
                      <View style={[styles.breakdownBarFill, { width: `${Math.min((count / activeWardrobeItems.length) * 100, 100)}%` }]} />
                    </View>
                    <Text style={styles.breakdownCount}>{count}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(420).duration(280)}>
          <Text style={styles.sectionTitle}>Style Tips</Text>
          {quickTips.map((tip, i) => (
            <View key={i} style={styles.tipCard}>
              <Ionicons name={tip.icon} size={20} color={Colors.secondary} />
              <Text style={styles.tipText}>{tip.text}</Text>
            </View>
          ))}
        </Animated.View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <Modal
        visible={showAccountPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => { setShowAccountPrompt(false); setPromptDismissed(true); }}
      >
        <Pressable
          style={styles.promptOverlay}
          onPress={() => { setShowAccountPrompt(false); setPromptDismissed(true); }}
        >
          <Animated.View entering={FadeInUp.duration(280)} style={styles.promptSheet}>
            <View style={styles.promptDrag} />
            <Text style={styles.promptTitle}>Save your wardrobe</Text>
            <Text style={styles.promptBody}>
              Your wardrobe is saved on this device. Create a free account to back it up and access it from any device.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.promptPrimary, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
              onPress={() => { setShowAccountPrompt(false); router.push('/sign-in'); }}
            >
              <Text style={styles.promptPrimaryText}>Create Free Account</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.promptSecondary, pressed && { opacity: 0.7 }]}
              onPress={() => { setShowAccountPrompt(false); setPromptDismissed(true); }}
            >
              <Text style={styles.promptSecondaryText}>Maybe later</Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingHorizontal: 20 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 20 },
  greeting: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textLight, letterSpacing: 0.8, textTransform: 'uppercase' },
  appName: { fontFamily: 'Inter_700Bold', fontSize: 30, color: Colors.primary, letterSpacing: -0.8, marginTop: 2 },
  premiumBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.secondary + '18', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.secondary + '30',
  },
  premiumText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.secondary, letterSpacing: 0.3 },

  weatherChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    marginTop: 0, marginBottom: 16,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.sage + '20',
    borderWidth: 1, borderColor: Colors.sage + '30',
  },
  weatherChipText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.primary },

  backfillBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 16, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, backgroundColor: Colors.secondary + '10',
    borderWidth: 1, borderColor: Colors.secondary + '20',
  },
  backfillText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textSecondary, flexShrink: 1 },
  backfillTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.secondary + '20', overflow: 'hidden', marginLeft: 4 },
  backfillFill: { height: '100%', backgroundColor: Colors.secondary, borderRadius: 2 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 18, padding: 16, alignItems: 'center',
    shadowColor: Colors.primary, shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 2, borderWidth: 1, borderColor: Colors.border,
  },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  statNumber: { fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.primary, letterSpacing: -0.5 },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary, marginTop: 4, textAlign: 'center' },

  styleCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 16, marginBottom: 20,
    shadowColor: Colors.primary, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  styleCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  styleCardTitle: { fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.textLight, letterSpacing: 1, textTransform: 'uppercase' },
  styleCardValue: { fontFamily: 'Inter_600SemiBold', fontSize: 18, color: Colors.primary, letterSpacing: -0.2 },

  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.primary, marginBottom: 12, letterSpacing: -0.2 },

  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  actionButton: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 16, padding: 16, alignItems: 'center',
    shadowColor: Colors.primary, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 1, borderWidth: 1, borderColor: Colors.border,
  },
  actionPressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
  actionIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  actionLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.primary },
  lockBadge: { position: 'absolute', bottom: -3, right: -5, width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.secondary, alignItems: 'center', justifyContent: 'center' },

  breakdownCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 16, marginBottom: 24,
    shadowColor: Colors.primary, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9 },
  breakdownLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  breakdownLabel: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.primary },
  breakdownRight: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1.5 },
  breakdownBarBg: { flex: 1, height: 5, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  breakdownBarFill: { height: '100%', backgroundColor: Colors.secondary, borderRadius: 3 },
  breakdownCount: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.textSecondary, width: 24, textAlign: 'right', fontVariant: ['tabular-nums'] },

  tipCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: Colors.white, borderRadius: 14, padding: 14, marginBottom: 8,
    borderLeftWidth: 3, borderLeftColor: Colors.secondary + '60',
    shadowColor: Colors.primary, shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  tipText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, flex: 1, lineHeight: 19 },

  todayCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: Colors.success + '35',
    shadowColor: Colors.success, shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  todayCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  todayCardTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary, flex: 1 },
  todaySeeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  todaySeeAllText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.secondary },
  todayPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  todayPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.success + '10', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.success + '28',
  },
  todayPillText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.primary },

  recSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, marginBottom: 12, marginTop: -6 },
  recScroll: { marginBottom: 24, marginHorizontal: -20 },
  recScrollContent: { paddingHorizontal: 20, gap: 12, paddingRight: 20 },
  recCard: {
    width: 156, backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden',
    shadowColor: Colors.primary, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    elevation: 2, borderWidth: 1, borderColor: Colors.border,
  },
  recImage: { width: 156, height: 126, backgroundColor: Colors.border },
  recCategoryBadge: {
    position: 'absolute', top: 8, left: 8,
    backgroundColor: 'rgba(16,24,38,0.65)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  recCategoryText: { fontFamily: 'Inter_600SemiBold', fontSize: 9, color: Colors.white, textTransform: 'uppercase', letterSpacing: 0.8 },
  recLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.primary, paddingHorizontal: 10, paddingTop: 10, letterSpacing: -0.1 },
  recDesc: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary, paddingHorizontal: 10, marginTop: 3, lineHeight: 15 },
  recNeededBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8 },
  recNeededText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.warning },

  pickCard: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: Colors.secondary + '28',
    shadowColor: Colors.secondary, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 2, overflow: 'hidden',
  },
  pickHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  pickTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary, flex: 1 },
  pickSeeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  pickSeeAllText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.secondary },
  pickPhotosRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  pickPhotoWrap: { flex: 1, aspectRatio: 0.85, maxWidth: 72 },
  pickPhoto: { width: '100%', height: '100%', borderRadius: 10, backgroundColor: Colors.background },
  pickPhotoFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  pickActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pickWearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  pickWearText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.white },
  pickUndoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.success + '15', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.success + '25',
  },
  pickUndoText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textSecondary },
  pickReactionRow: { flexDirection: 'row', gap: 6 },
  pickReactBtn: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  pickReactBtnLove: { backgroundColor: '#FEE2E2', borderColor: '#FECACA' },
  pickReactBtnSkip: { backgroundColor: Colors.background, borderColor: Colors.textLight },

  guestBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.secondary + '12',
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14,
    marginBottom: 12, borderWidth: 1, borderColor: Colors.secondary + '25',
  },
  guestBannerText: {
    fontFamily: 'Inter_400Regular', fontSize: 12,
    color: Colors.textSecondary, flex: 1,
  },

  promptOverlay: {
    flex: 1, backgroundColor: 'rgba(16,24,38,0.45)', justifyContent: 'flex-end',
  },
  promptSheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 44,
    shadowColor: Colors.primary, shadowOpacity: 0.15, shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 }, elevation: 8,
  },
  promptDrag: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border,
    alignSelf: 'center', marginBottom: 20,
  },
  promptTitle: {
    fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.primary,
    letterSpacing: -0.5, marginBottom: 10,
  },
  promptBody: {
    fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary,
    lineHeight: 21, marginBottom: 24,
  },
  promptPrimary: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginBottom: 10,
    shadowColor: Colors.primary, shadowOpacity: 0.25, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  promptPrimaryText: {
    fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.white,
  },
  promptSecondary: { paddingVertical: 13, alignItems: 'center' },
  promptSecondaryText: {
    fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.textSecondary,
  },
});
