import { StyleSheet, Text, View, ScrollView, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const FEATURES = [
  { icon: 'infinite-outline', title: 'Unlimited Wardrobe', desc: 'No 30-item cap. Add every piece you own.' },
  { icon: 'map-outline', title: 'Wardrobe Blueprint', desc: 'See exactly what pieces you need to build a complete wardrobe.' },
  { icon: 'partly-sunny-outline', title: 'Season-Smart Styling', desc: 'Weather-aware outfit recommendations for your location.' },
  { icon: 'layers-outline', title: 'Advanced Scenarios', desc: 'Job interviews, weddings, travel days, and more.' },
  { icon: 'analytics-outline', title: 'Deep Diagnostics', desc: 'Detailed gap analysis with shopping suggestions.' },
  { icon: 'diamond-outline', title: 'Jewelry Intelligence', desc: 'Smart jewelry pairing based on neckline, occasion, and metals.' },
];

export default function PremiumScreen() {
  const insets = useSafeAreaInsets();
  const { isPremium, togglePremium } = useApp();
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const handleUpgrade = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    togglePremium();
    if (!isPremium) {
      setTimeout(() => router.back(), 500);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={Colors.primary} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.header}>
          <LinearGradient
            colors={[Colors.secondary + '20', Colors.blush + '30', Colors.background]}
            style={styles.headerGradient}
          >
            <View style={styles.crownIcon}>
              <Ionicons name="star" size={36} color={Colors.secondary} />
            </View>
            <Text style={styles.headerTitle}>AuraCloset Premium</Text>
            <Text style={styles.headerSubtitle}>Unlock the full power of your personal stylist</Text>
          </LinearGradient>
        </Animated.View>

        {FEATURES.map((feat, i) => (
          <Animated.View key={feat.title} entering={FadeInDown.delay(200 + i * 80).duration(400)} style={styles.featureCard}>
            <View style={styles.featureIconWrap}>
              <Ionicons name={feat.icon as any} size={24} color={Colors.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>{feat.title}</Text>
              <Text style={styles.featureDesc}>{feat.desc}</Text>
            </View>
          </Animated.View>
        ))}

        <Animated.View entering={FadeInDown.delay(700).duration(400)} style={styles.pricingCard}>
          <View style={styles.pricingHeader}>
            <Text style={styles.pricingTitle}>Monthly</Text>
            <View style={styles.priceBadge}>
              <Text style={styles.priceText}>$9.99</Text>
              <Text style={styles.priceUnit}>/mo</Text>
            </View>
          </View>
          <View style={styles.pricingDivider} />
          <View style={styles.pricingHeader}>
            <View>
              <Text style={styles.pricingTitle}>Annual</Text>
              <Text style={styles.savingsText}>Save 40%</Text>
            </View>
            <View style={styles.priceBadge}>
              <Text style={styles.priceText}>$5.99</Text>
              <Text style={styles.priceUnit}>/mo</Text>
            </View>
          </View>
        </Animated.View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) + (Platform.OS === 'web' ? 34 : 0) }]}>
        <Pressable
          style={[styles.upgradeButton, isPremium && styles.downgradeButton]}
          onPress={handleUpgrade}
        >
          {isPremium ? (
            <Text style={[styles.upgradeText, { color: Colors.textSecondary }]}>Downgrade to Free</Text>
          ) : (
            <>
              <Ionicons name="star" size={20} color={Colors.white} />
              <Text style={styles.upgradeText}>Upgrade to Premium</Text>
            </>
          )}
        </Pressable>
        {!isPremium && (
          <Text style={styles.disclaimer}>Cancel anytime. No commitments.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8 },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 20 },
  header: { marginBottom: 20, borderRadius: 20, overflow: 'hidden' },
  headerGradient: { paddingVertical: 36, paddingHorizontal: 24, alignItems: 'center' },
  crownIcon: { width: 72, height: 72, borderRadius: 22, backgroundColor: Colors.secondary + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 26, color: Colors.primary, textAlign: 'center', letterSpacing: -0.5 },
  headerSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 15, color: Colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  featureCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: Colors.white, borderRadius: 14, padding: 16, marginBottom: 8 },
  featureIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.secondary + '12', alignItems: 'center', justifyContent: 'center' },
  featureTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.primary },
  featureDesc: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 17 },
  pricingCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 20, marginTop: 12 },
  pricingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  pricingTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.primary },
  savingsText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.success, marginTop: 2 },
  priceBadge: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  priceText: { fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.primary },
  priceUnit: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary },
  pricingDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 8 },
  footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: Colors.background },
  upgradeButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.secondary, borderRadius: 14, paddingVertical: 16 },
  downgradeButton: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  upgradeText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.white },
  disclaimer: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textLight, textAlign: 'center', marginTop: 10 },
});
