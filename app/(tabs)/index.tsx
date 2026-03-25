import { StyleSheet, Text, View, ScrollView, Pressable, Platform, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import Animated, { FadeInDown } from 'react-native-reanimated';

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

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { profile, wardrobeItems, outfitSets, isPremium, canAddItem, starterRecommendations } = useApp();
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const categoryCounts: Record<string, number> = {};
  wardrobeItems.forEach(item => {
    categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
  });

  const readyOutfits = outfitSets.filter(o => o.components.every(c => c.owned)).length;

  const quickTips = [
    { icon: 'bulb-outline' as const, text: 'A navy blazer works for both work and evening events.' },
    { icon: 'color-palette-outline' as const, text: 'Neutral tones create a luxury feel effortlessly.' },
    { icon: 'diamond-outline' as const, text: 'Minimal gold jewelry elevates any casual outfit.' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.header}>
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

        <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.statsRow}>
          <Pressable style={styles.statCard} onPress={() => router.push('/(tabs)/wardrobe')}>
            <Text style={styles.statNumber}>{wardrobeItems.length}</Text>
            <Text style={styles.statLabel}>Items</Text>
          </Pressable>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{readyOutfits}</Text>
            <Text style={styles.statLabel}>Ready Outfits</Text>
          </View>
          <Pressable style={styles.statCard} onPress={() => router.push('/(tabs)/outfits')}>
            <Text style={styles.statNumber}>{outfitSets.length}</Text>
            <Text style={styles.statLabel}>Outfit Ideas</Text>
          </Pressable>
        </Animated.View>

        {profile.styleGoalPrimary && (
          <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.styleCard}>
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

        <Animated.View entering={FadeInDown.delay(400).duration(500)}>
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
            {!isPremium && (
              <Pressable
                style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
                onPress={() => router.push('/premium')}
              >
                <View style={[styles.actionIcon, { backgroundColor: Colors.secondary + '30' }]}>
                  <Ionicons name="star" size={24} color={Colors.secondary} />
                </View>
                <Text style={styles.actionLabel}>Go Premium</Text>
              </Pressable>
            )}
          </View>
        </Animated.View>

        {Object.values(starterRecommendations).some(Boolean) && (
          <Animated.View entering={FadeInDown.delay(450).duration(500)}>
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

        {wardrobeItems.length > 0 && (
          <Animated.View entering={FadeInDown.delay(500).duration(500)}>
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
                      <View style={[styles.breakdownBarFill, { width: `${Math.min((count / wardrobeItems.length) * 100, 100)}%` }]} />
                    </View>
                    <Text style={styles.breakdownCount}>{count}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(600).duration(500)}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 24 },
  greeting: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary, letterSpacing: 0.5 },
  appName: { fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.primary, letterSpacing: -0.5 },
  premiumBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.secondary + '15', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  premiumText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.secondary },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statCard: { flex: 1, backgroundColor: Colors.white, borderRadius: 16, padding: 16, alignItems: 'center' },
  statNumber: { fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.primary },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  styleCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, marginBottom: 24 },
  styleCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  styleCardTitle: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' },
  styleCardValue: { fontFamily: 'Inter_600SemiBold', fontSize: 18, color: Colors.primary },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 18, color: Colors.primary, marginBottom: 14, letterSpacing: -0.3 },
  actionsRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  actionButton: { flex: 1, backgroundColor: Colors.white, borderRadius: 16, padding: 16, alignItems: 'center' },
  actionPressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  actionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  actionLabel: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.primary },
  breakdownCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, marginBottom: 28 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  breakdownLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  breakdownLabel: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.primary },
  breakdownRight: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1.5 },
  breakdownBarBg: { flex: 1, height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  breakdownBarFill: { height: '100%', backgroundColor: Colors.secondary, borderRadius: 3 },
  breakdownCount: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.textSecondary, width: 24, textAlign: 'right' },
  tipCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderRadius: 12, padding: 14, marginBottom: 8 },
  tipText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, flex: 1, lineHeight: 18 },
  recSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, marginBottom: 14, marginTop: -8 },
  recScroll: { marginBottom: 24, marginHorizontal: -20 },
  recScrollContent: { paddingHorizontal: 20, gap: 12 },
  recCard: { width: 160, backgroundColor: Colors.white, borderRadius: 14, overflow: 'hidden' },
  recImage: { width: 160, height: 130, backgroundColor: Colors.border },
  recCategoryBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: Colors.overlay, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  recCategoryText: { fontFamily: 'Inter_500Medium', fontSize: 10, color: Colors.white, textTransform: 'uppercase', letterSpacing: 0.5 },
  recLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.primary, paddingHorizontal: 10, paddingTop: 10 },
  recDesc: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary, paddingHorizontal: 10, marginTop: 2, lineHeight: 15 },
  recNeededBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8 },
  recNeededText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.warning },
});
