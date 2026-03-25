import { StyleSheet, Text, View, ScrollView, Pressable, Platform, Image, ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp, OutfitSet, OutfitComponent } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useState } from 'react';

const scenarios = ['work', 'casual', 'date', 'event'] as const;
const scenarioLabels: Record<string, { label: string; icon: string }> = {
  work: { label: 'Work', icon: 'briefcase-outline' },
  casual: { label: 'Casual', icon: 'cafe-outline' },
  date: { label: 'Date', icon: 'heart-outline' },
  event: { label: 'Event', icon: 'sparkles-outline' },
};

const categoryIcons: Record<string, string> = {
  top: 'shirt-outline', bottom: 'resize-outline', dress: 'body-outline',
  outerwear: 'cloudy-outline', shoes: 'footsteps-outline', bag: 'bag-handle-outline',
  jewelry: 'diamond-outline',
};

const COMPONENT_IMAGES: Record<string, ImageSourcePropType> = {
  'top-blouse-white': require('@/assets/recommendations/white_shirt.png'),
  'top-blouse-pink': require('@/assets/recommendations/black_blouse.png'),
  'top-blouse-cream': require('@/assets/recommendations/cream_sweater.png'),
  'top-shirt-blue': require('@/assets/recommendations/blue_shirt.png'),
  'top-shirt-white': require('@/assets/recommendations/white_shirt.png'),
  'top-t-shirt-white': require('@/assets/recommendations/white_tee.png'),
  'top-sweater-cream': require('@/assets/recommendations/cream_sweater.png'),
  'bottom-trousers-navy': require('@/assets/recommendations/dark_trousers.png'),
  'bottom-trousers-beige': require('@/assets/recommendations/beige_trousers.png'),
  'bottom-chinos-beige': require('@/assets/recommendations/beige_trousers.png'),
  'bottom-jeans-blue': require('@/assets/recommendations/jeans.png'),
  'bottom-jeans-black': require('@/assets/recommendations/dark_trousers.png'),
  'bottom-skirt-black': require('@/assets/recommendations/dark_trousers.png'),
  'bottom-wide-leg-black': require('@/assets/recommendations/dark_trousers.png'),
  'outerwear-blazer-navy': require('@/assets/recommendations/navy_blazer.png'),
  'outerwear-blazer-black': require('@/assets/recommendations/navy_blazer.png'),
  'shoes-loafers-black': require('@/assets/recommendations/loafers.png'),
  'shoes-flats-black': require('@/assets/recommendations/loafers.png'),
  'shoes-sneakers-white': require('@/assets/recommendations/white_sneakers.png'),
  'shoes-boots-brown': require('@/assets/recommendations/brown_boots.png'),
  'shoes-heels-beige': require('@/assets/recommendations/black_heels.png'),
  'shoes-heels-black': require('@/assets/recommendations/black_heels.png'),
  'shoes-heels-gold': require('@/assets/recommendations/black_heels.png'),
  'shoes-mules-gold': require('@/assets/recommendations/loafers.png'),
  'bag-tote-camel': require('@/assets/recommendations/black_bag.png'),
  'bag-crossbody-brown': require('@/assets/recommendations/black_bag.png'),
  'bag-clutch-gold': require('@/assets/recommendations/black_bag.png'),
  'bag-clutch-black': require('@/assets/recommendations/black_bag.png'),
  'bag-shoulder-bag-brown': require('@/assets/recommendations/black_bag.png'),
  'jewelry-watch-gold': require('@/assets/recommendations/silver_watch.png'),
  'jewelry-earrings-gold': require('@/assets/recommendations/gold_hoops.png'),
  'jewelry-earrings-silver': require('@/assets/recommendations/gold_hoops.png'),
  'jewelry-necklace-gold': require('@/assets/recommendations/gold_necklace.png'),
  'jewelry-necklace-silver': require('@/assets/recommendations/gold_necklace.png'),
  'jewelry-bracelet-gold': require('@/assets/recommendations/gold_necklace.png'),
  'jewelry-bracelet-silver': require('@/assets/recommendations/gold_necklace.png'),
  'jewelry-ring-gold': require('@/assets/recommendations/gold_hoops.png'),
  'dress-midi-dress-burgundy': require('@/assets/recommendations/black_dress.png'),
  'dress-shirt-dress-navy': require('@/assets/recommendations/black_dress.png'),
  'dress-cocktail-dress-black': require('@/assets/recommendations/black_dress.png'),
};

function getComponentImage(comp: OutfitComponent): ImageSourcePropType | null {
  const key = `${comp.category}-${comp.subType}-${comp.colorFamily}`;
  return COMPONENT_IMAGES[key] || null;
}

function OutfitCard({ outfit, index }: { outfit: OutfitSet; index: number }) {
  const ownedCount = outfit.components.filter(c => c.owned).length;
  const totalCount = outfit.components.length;
  const isComplete = ownedCount === totalCount;

  return (
    <Animated.View entering={FadeInDown.delay(index * 100).duration(400)}>
      <View style={[styles.outfitCard, isComplete && styles.outfitCardComplete]}>
        {isComplete && (
          <View style={styles.readyBadge}>
            <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
            <Text style={styles.readyText}>Ready to wear</Text>
          </View>
        )}
        <View style={styles.outfitHeader}>
          <Ionicons name={scenarioLabels[outfit.scenario]?.icon as any || 'ellipse'} size={18} color={Colors.secondary} />
          <Text style={styles.outfitScenario}>{scenarioLabels[outfit.scenario]?.label}</Text>
          <View style={styles.progressPill}>
            <Text style={styles.progressText}>{ownedCount}/{totalCount}</Text>
          </View>
        </View>
        <View style={styles.componentsGrid}>
          {outfit.components.map((comp, i) => (
            <ComponentCard key={`${comp.category}-${comp.subType}-${i}`} component={comp} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

function ComponentCard({ component }: { component: OutfitComponent }) {
  const image = getComponentImage(component);
  return (
    <View style={[styles.componentCard, component.owned && styles.componentOwned]}>
      {image ? (
        <Image source={image} style={styles.componentImage} resizeMode="cover" />
      ) : (
        <View style={styles.componentIconWrap}>
          <Ionicons
            name={categoryIcons[component.category] as any || 'ellipse-outline'}
            size={20}
            color={component.owned ? Colors.success : Colors.textLight}
          />
        </View>
      )}
      <Text style={styles.componentType} numberOfLines={1}>{component.subType.replace('-', ' ')}</Text>
      <Text style={styles.componentColor} numberOfLines={1}>{component.colorFamily}</Text>
      <View style={[styles.statusBadge, component.owned ? styles.statusOwned : styles.statusNeeded]}>
        <Text style={[styles.statusText, component.owned ? styles.statusTextOwned : styles.statusTextNeeded]}>
          {component.owned ? 'Owned' : 'Need'}
        </Text>
      </View>
    </View>
  );
}

export default function OutfitsScreen() {
  const insets = useSafeAreaInsets();
  const { outfitSets, wardrobeItems, isPremium } = useApp();
  const [selectedScenario, setSelectedScenario] = useState<string>('work');
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const filtered = outfitSets.filter(o => o.scenario === selectedScenario);

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Outfit Ideas</Text>
        <Text style={styles.subtitle}>Curated looks based on your style</Text>
      </View>

      <View style={styles.scenarioRow}>
        {scenarios.map(s => (
          <Pressable
            key={s}
            style={[styles.scenarioChip, selectedScenario === s && styles.scenarioChipActive]}
            onPress={() => setSelectedScenario(s)}
          >
            <Ionicons
              name={scenarioLabels[s].icon as any}
              size={16}
              color={selectedScenario === s ? Colors.white : Colors.textSecondary}
            />
            <Text style={[styles.scenarioText, selectedScenario === s && styles.scenarioTextActive]}>
              {scenarioLabels[s].label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {wardrobeItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="sparkles-outline" size={48} color={Colors.textLight} />
            <Text style={styles.emptyTitle}>Add items to see outfits</Text>
            <Text style={styles.emptySubtitle}>
              Start building your wardrobe and we'll create personalized outfit ideas for you
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={48} color={Colors.textLight} />
            <Text style={styles.emptyTitle}>No outfits for this scenario</Text>
            <Text style={styles.emptySubtitle}>Try a different category</Text>
          </View>
        ) : (
          filtered.map((outfit, i) => <OutfitCard key={outfit.id} outfit={outfit} index={i} />)
        )}

        {!isPremium && wardrobeItems.length > 0 && (
          <Pressable style={styles.premiumCta} onPress={() => { import('expo-router').then(r => r.router.push('/premium')); }}>
            <Ionicons name="star" size={20} color={Colors.secondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.premiumCtaTitle}>Unlock Season-Smart Styling</Text>
              <Text style={styles.premiumCtaSubtitle}>Get weather-aware outfits and advanced scenarios</Text>
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
  header: { paddingHorizontal: 20, marginTop: 8, marginBottom: 16 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.primary, letterSpacing: -0.5 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  scenarioRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 16 },
  scenarioChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  scenarioChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  scenarioText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textSecondary },
  scenarioTextActive: { color: Colors.white },
  scrollContent: { paddingHorizontal: 20 },
  outfitCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, marginBottom: 16 },
  outfitCardComplete: { borderWidth: 1, borderColor: Colors.success + '40' },
  readyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  readyText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.success },
  outfitHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  outfitScenario: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.primary, flex: 1 },
  progressPill: { backgroundColor: Colors.background, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  progressText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.textSecondary },
  componentsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  componentCard: { width: '30%', backgroundColor: Colors.background, borderRadius: 12, padding: 10, alignItems: 'center', flexGrow: 1 },
  componentOwned: { backgroundColor: Colors.success + '10' },
  componentImage: { width: 44, height: 44, borderRadius: 10, marginBottom: 6, backgroundColor: Colors.border },
  componentIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  componentType: { fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.primary, textTransform: 'capitalize', textAlign: 'center' },
  componentColor: { fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textSecondary, textTransform: 'capitalize', marginTop: 2 },
  statusBadge: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusOwned: { backgroundColor: Colors.success + '20' },
  statusNeeded: { backgroundColor: Colors.warning + '20' },
  statusText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  statusTextOwned: { color: Colors.success },
  statusTextNeeded: { color: Colors.warning },
  emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 18, color: Colors.primary, marginTop: 16, textAlign: 'center' },
  emptySubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  premiumCta: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.secondary + '10', borderRadius: 14, padding: 16, marginTop: 8 },
  premiumCtaTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary },
  premiumCtaSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
});
