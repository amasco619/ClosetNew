import { StyleSheet, Text, View, ScrollView, Pressable, Platform, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import SwipeToDismiss from '@/components/SwipeToDismiss';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { rs } from '../lib/responsive';
import { ApiRequestError, authenticatedApiRequest } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import * as React from 'react';
import {
  type BillingPlan,
  type BillingPlanOption,
  RevenueCatBillingError,
  getBillingAvailability,
  getBillingErrorCategory,
  getBillingPlans,
  presentRevenueCatCustomerCenter,
  purchaseBillingPlan,
  restoreBillingPurchases,
  setRevenueCatIdentity,
} from '@/lib/revenuecat';

const FEATURES = [
  { icon: 'infinite-outline', title: 'Full Wardrobe', desc: 'Add up to 2,000 wardrobe pieces.' },
  { icon: 'map-outline', title: 'Wardrobe Blueprint', desc: 'See exactly what pieces you need to build a complete wardrobe.' },
  { icon: 'sparkles-outline', title: 'Mood Styling', desc: 'Set your mood each day — Confident, Soft, Powerful — and get outfits that match how you want to feel.' },
  { icon: 'calendar-outline', title: 'Wear Log', desc: 'Track every outfit you wear, review your full history, and discover your cost-per-wear.' },
  { icon: 'partly-sunny-outline', title: 'Season-Smart Styling', desc: 'Weather-aware outfit recommendations for your location.' },
  { icon: 'layers-outline', title: 'Advanced Scenarios', desc: 'Job interviews, weddings, travel days, and more.' },
  { icon: 'analytics-outline', title: 'Deep Diagnostics', desc: 'Wardrobe health score, colour palette analysis, scenario coverage, and priority gap recommendations.' },
  { icon: 'diamond-outline', title: 'Jewelry Intelligence', desc: 'Smart jewelry pairing based on neckline, occasion, and metals.' },
];

export default function PremiumScreen() {
  const insets = useSafeAreaInsets();
  const {
    isPremium, isAuthenticated, authenticatedUserId, entitlementUnavailable, refreshPremiumEntitlement,
  } = useApp();
  const [billingUserId, setBillingUserId] = React.useState<string | null>(null);
  const [plans, setPlans] = React.useState<BillingPlanOption[]>([]);
  const [serverBillingReady, setServerBillingReady] = React.useState(false);
  const [billingReadinessRetry, setBillingReadinessRetry] = React.useState(0);
  const [selectedPlan, setSelectedPlan] = React.useState<BillingPlan>('monthly');
  const [loadingPlans, setLoadingPlans] = React.useState(false);
  const [working, setWorking] = React.useState(false);
  const [billingMessage, setBillingMessage] = React.useState<string | null>(null);
  const [billingMessageIsError, setBillingMessageIsError] = React.useState(false);
  const selectedPlanRef = React.useRef(selectedPlan);
  const currentIdentityRef = React.useRef({
    userId: isAuthenticated ? authenticatedUserId : null,
    generation: 0,
  });
  const currentUserId = isAuthenticated ? authenticatedUserId : null;
  React.useLayoutEffect(() => {
    if (currentIdentityRef.current.userId !== currentUserId) {
      currentIdentityRef.current = {
        userId: currentUserId,
        generation: currentIdentityRef.current.generation + 1,
      };
    }
  }, [currentUserId]);
  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const availability = getBillingAvailability();

  const isCurrentBillingIdentity = React.useCallback((userId: string, generation: number) =>
    currentIdentityRef.current.userId === userId &&
    currentIdentityRef.current.generation === generation, []);

  const assertAuthenticatedBillingIdentity = React.useCallback(async (userId: string, generation: number) => {
    if (!isCurrentBillingIdentity(userId, generation)) {
      throw new RevenueCatBillingError('identity_changed');
    }
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || session?.user.id !== userId || !isCurrentBillingIdentity(userId, generation)) {
      throw new RevenueCatBillingError('identity_changed');
    }
  }, [isCurrentBillingIdentity]);

  const isServerBillingReady = async (): Promise<boolean> => {
    try {
      const response = await authenticatedApiRequest('GET', '/api/user/billing/readiness');
      const readiness: unknown = await response.json();
      return typeof readiness === 'object' && readiness !== null &&
        'ready' in readiness && readiness.ready === true;
    } catch {
      return false;
    }
  };

  React.useEffect(() => {
    let mounted = true;
    const identityGeneration = currentIdentityRef.current.generation;
    const expectedUserId = authenticatedUserId;
    const loadPlans = async () => {
      if (!isAuthenticated || !expectedUserId) {
        setBillingUserId(null);
        setPlans([]);
        setServerBillingReady(false);
        setLoadingPlans(false);
        setBillingMessage('Sign in to your Amodka account to subscribe or restore purchases.');
        setBillingMessageIsError(false);
        return;
      }
      setLoadingPlans(true);
      setServerBillingReady(false);
      setBillingMessage(null);
      try {
        const userId = expectedUserId;
        setBillingUserId(userId);
        await assertAuthenticatedBillingIdentity(userId, identityGeneration);
        const serverReady = await isServerBillingReady();
        await assertAuthenticatedBillingIdentity(userId, identityGeneration);
        if (!serverReady) {
          if (!mounted || !isCurrentBillingIdentity(userId, identityGeneration)) return;
          setPlans([]);
          setBillingMessage('Amodka billing is not currently ready. Purchases are disabled until billing setup is complete. Please try again later.');
          setBillingMessageIsError(true);
          return;
        }
        if (!mounted || !isCurrentBillingIdentity(userId, identityGeneration)) return;
        setServerBillingReady(true);
        await setRevenueCatIdentity(userId);
        const options = await getBillingPlans(userId);
        if (!mounted || !isCurrentBillingIdentity(userId, identityGeneration)) return;
        setBillingUserId(userId);
        setPlans(options);
        if (!options.some(option => option.plan === selectedPlanRef.current) && options.length) {
          selectedPlanRef.current = options[0].plan;
          setSelectedPlan(options[0].plan);
        }
        if (!options.length) {
          setBillingMessage('Subscription plans are not configured for this store yet.');
        }
      } catch (error) {
        if (!mounted || !expectedUserId ||
            !isCurrentBillingIdentity(expectedUserId, identityGeneration)) return;
        const category = getBillingErrorCategory(error);
        if (category === 'identity_changed') return;
        const unavailableReason = getBillingAvailability().reason;
        const message = category === 'wrong_account'
          ? 'This RevenueCat subscription is associated with another Amodka account. Sign in to the original account or contact support.'
          : category === 'unavailable'
          ? unavailableReason === 'expo_go'
            ? 'Purchases are available in a native development or store build, not Expo Go.'
            : unavailableReason === 'missing_configuration'
              ? 'Store subscriptions are not configured in this app build yet.'
              : 'Purchases are temporarily unavailable. Please try again later.'
          : category === 'configuration'
            ? 'Subscription configuration is incomplete. Please try again later.'
            : category === 'network'
              ? 'We couldn’t load store pricing. Check your connection and try again.'
              : 'Subscription plans could not be loaded. Please try again.';
        setPlans([]);
        setBillingMessage(message);
        setBillingMessageIsError(category !== 'unavailable');
      } finally {
        if (mounted && expectedUserId &&
            isCurrentBillingIdentity(expectedUserId, identityGeneration)) setLoadingPlans(false);
      }
    };
    void loadPlans();
    return () => { mounted = false; };
  }, [isAuthenticated, authenticatedUserId, billingReadinessRetry, assertAuthenticatedBillingIdentity, isCurrentBillingIdentity]);

  const reconcileThenCheckServerAccess = async (userId: string, generation: number) => {
    await assertAuthenticatedBillingIdentity(userId, generation);
    try {
      await authenticatedApiRequest('POST', '/api/user/entitlements/reconcile');
    } catch (error) {
      await assertAuthenticatedBillingIdentity(userId, generation);
      if (error instanceof ApiRequestError && error.status === 409) {
        throw new RevenueCatBillingError('wrong_account');
      }
      throw error;
    }
    await assertAuthenticatedBillingIdentity(userId, generation);
    // Give RevenueCat webhook/entitlement reconciliation a short opportunity to
    // update the existing authoritative entitlement endpoint. Never grant
    // access from the local SDK's CustomerInfo or reconciliation response.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await assertAuthenticatedBillingIdentity(userId, generation);
      const hasPremium = await refreshPremiumEntitlement();
      await assertAuthenticatedBillingIdentity(userId, generation);
      if (hasPremium) return true;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return false;
  };

  const handlePurchase = async () => {
    if (!billingUserId || !isAuthenticated || billingUserId !== authenticatedUserId) {
      setBillingMessage('Sign in to your Amodka account before subscribing.');
      setBillingMessageIsError(true);
      return;
    }
    if (!serverBillingReady) {
      setBillingMessage('Amodka billing is not currently ready. Purchases are disabled until billing setup is complete. Please try again later.');
      setBillingMessageIsError(true);
      return;
    }
    const identityGeneration = currentIdentityRef.current.generation;
    setWorking(true);
    setBillingMessage('Your purchase is being processed securely.');
    setBillingMessageIsError(false);
    try {
      await assertAuthenticatedBillingIdentity(billingUserId, identityGeneration);
      const serverReady = await isServerBillingReady();
      await assertAuthenticatedBillingIdentity(billingUserId, identityGeneration);
      if (!serverReady) {
        setServerBillingReady(false);
        setPlans([]);
        setBillingMessage('Amodka billing is not currently ready. No purchase was started. Please try again later.');
        setBillingMessageIsError(true);
        return;
      }
      await assertAuthenticatedBillingIdentity(billingUserId, identityGeneration);
      const result = await purchaseBillingPlan(billingUserId, selectedPlan, plans);
      if (!isCurrentBillingIdentity(billingUserId, identityGeneration)) return;
      const serverPremium = await reconcileThenCheckServerAccess(billingUserId, identityGeneration);
      if (!isCurrentBillingIdentity(billingUserId, identityGeneration)) return;
      if (serverPremium) {
        setBillingMessage('Premium is active on your Amodka account.');
      } else if (result === 'pending') {
        setBillingMessage('The store is still processing this purchase. Premium will appear after account verification completes.');
      } else {
        setBillingMessage('Purchase received. Premium access is being verified by Amodka and may take a moment to appear.');
      }
    } catch (error) {
      const category = getBillingErrorCategory(error);
      if (category === 'identity_changed') {
        return;
      } else if (category === 'cancelled') {
        setBillingMessage('Purchase cancelled. No changes were made.');
        setBillingMessageIsError(false);
      } else if (category === 'pending') {
        setBillingMessage('The store marked this payment as pending. Premium will appear after the store completes it and Amodka verifies access.');
        setBillingMessageIsError(false);
      } else if (category === 'wrong_account') {
        setBillingMessage('This store purchase is associated with another Amodka account. Sign in to that account or contact support; it has not been transferred.');
        setBillingMessageIsError(true);
      } else if (category === 'unavailable') {
        setBillingMessage('Purchases are unavailable in this app environment. Use a native development or store build.');
        setBillingMessageIsError(true);
      } else {
        setBillingMessage('The purchase could not be completed. Please try again or restore an existing subscription.');
        setBillingMessageIsError(true);
      }
    } finally {
      setWorking(false);
    }
  };

  const handleRestore = async () => {
    if (!billingUserId || !isAuthenticated || billingUserId !== authenticatedUserId) {
      setBillingMessage('Sign in to your Amodka account before restoring purchases.');
      setBillingMessageIsError(true);
      return;
    }
    const identityGeneration = currentIdentityRef.current.generation;
    setWorking(true);
    setBillingMessage('Checking store purchases for this Amodka account…');
    setBillingMessageIsError(false);
    try {
      await assertAuthenticatedBillingIdentity(billingUserId, identityGeneration);
      const serverReady = await isServerBillingReady();
      await assertAuthenticatedBillingIdentity(billingUserId, identityGeneration);
      if (!serverReady) {
        setServerBillingReady(false);
        setPlans([]);
        setBillingMessage('Amodka billing is not currently ready. Restore is temporarily unavailable. Please try again later.');
        setBillingMessageIsError(true);
        return;
      }
      await assertAuthenticatedBillingIdentity(billingUserId, identityGeneration);
      await restoreBillingPurchases(billingUserId);
      if (!isCurrentBillingIdentity(billingUserId, identityGeneration)) return;
      if (await reconcileThenCheckServerAccess(billingUserId, identityGeneration)) {
        if (!isCurrentBillingIdentity(billingUserId, identityGeneration)) return;
        setBillingMessage('Your Premium subscription has been restored and verified.');
      } else {
        setBillingMessage('The store restore completed, but Amodka has not verified Premium access yet. Please try again shortly.');
        setBillingMessageIsError(true);
      }
    } catch (error) {
      const category = getBillingErrorCategory(error);
      if (category === 'identity_changed') return;
      setBillingMessage(category === 'wrong_account'
        ? 'This purchase is associated with another Amodka account. It has not been transferred; sign in to the original account or contact support.'
        : category === 'unavailable'
          ? 'Restore is unavailable in this app environment. Use a native development or store build.'
          : 'Purchases could not be restored. Check your connection and try again.');
      setBillingMessageIsError(true);
    } finally {
      setWorking(false);
    }
  };

  const handleCustomerCenter = async () => {
    if (!billingUserId || !isAuthenticated || billingUserId !== authenticatedUserId) return;
    const identityGeneration = currentIdentityRef.current.generation;
    setWorking(true);
    try {
      await presentRevenueCatCustomerCenter(billingUserId);
      if (!isCurrentBillingIdentity(billingUserId, identityGeneration)) return;
      await reconcileThenCheckServerAccess(billingUserId, identityGeneration);
    } catch (error) {
      if (getBillingErrorCategory(error) === 'identity_changed') return;
      const category = getBillingErrorCategory(error);
      setBillingMessage(category === 'wrong_account'
        ? 'This store purchase is associated with another Amodka account. Contact support for help.'
        : 'Subscription management is temporarily unavailable. Please try again later.');
      setBillingMessageIsError(true);
    } finally {
      setWorking(false);
    }
  };

  return (
    <SwipeToDismiss>
    <StatusBar style="dark" />
    <View style={[styles.container, { paddingTop: (Platform.OS === 'android' ? 0 : insets.top) + webTopInset }]}>
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
            <Text style={styles.headerTitle}>Amodka Premium</Text>
            <Text style={styles.headerSubtitle}>Unlock the full power of your personal stylist</Text>
          </LinearGradient>
        </Animated.View>

        {FEATURES.map((feat, i) => {
          const isBlueprintAndPremium = feat.title === 'Wardrobe Blueprint' && isPremium;
          const isDiagnosticsAndPremium = feat.title === 'Deep Diagnostics' && isPremium;
          const isTappable = isBlueprintAndPremium || isDiagnosticsAndPremium;
          return (
            <Animated.View key={feat.title} entering={FadeInDown.delay(200 + i * 80).duration(400)}>
              <Pressable
                style={({ pressed }) => [styles.featureCard, isTappable && pressed && { opacity: 0.75 }]}
                onPress={
                  isBlueprintAndPremium ? () => router.replace('/blueprint')
                  : isDiagnosticsAndPremium ? () => router.push('/diagnostics')
                  : undefined
                }
              >
                <View style={styles.featureIconWrap}>
                  <Ionicons name={feat.icon as any} size={24} color={Colors.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>{feat.title}</Text>
                  <Text style={styles.featureDesc}>{feat.desc}</Text>
                </View>
                {isTappable && (
                  <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
                )}
              </Pressable>
            </Animated.View>
          );
        })}

        <Animated.View entering={FadeInDown.delay(700).duration(400)} style={styles.pricingCard}>
          <View style={styles.pricingHeader}>
            <Text style={styles.pricingTitle}>Premium subscriptions</Text>
            <Text style={styles.savingsText}>Monthly or annual</Text>
          </View>
          <View style={styles.pricingDivider} />
          {loadingPlans ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator color={Colors.secondary} />
              <Text style={styles.planHint}>Loading localized store pricing…</Text>
            </View>
          ) : plans.length > 0 ? (
            <>
              {plans.map(option => (
                <Pressable
                  key={option.productId}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selectedPlan === option.plan }}
                  disabled={working}
                  onPress={() => {
                    selectedPlanRef.current = option.plan;
                    setSelectedPlan(option.plan);
                  }}
                  style={[styles.planOption, selectedPlan === option.plan && styles.selectedPlanOption]}
                >
                  <View style={[styles.radio, selectedPlan === option.plan && styles.radioSelected]}>
                    {selectedPlan === option.plan && <View style={styles.radioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pricingTitle}>{option.plan === 'monthly' ? 'Monthly' : 'Annual'}</Text>
                    {option.trialDescription ? (
                      <Text style={styles.trialText}>{option.trialDescription} with subscription</Text>
                    ) : null}
                  </View>
                  <Text style={styles.localizedPrice}>{option.localizedPrice}</Text>
                </Pressable>
              ))}
              <Text style={styles.planHint}>Auto-renews at the store price shown until cancelled. Manage or cancel through your app store.</Text>
            </>
          ) : (
            <>
              <Text style={billingMessageIsError ? styles.errorMessage : styles.planHint}>
                {billingMessage ?? (
                  availability.reason === 'expo_go'
                    ? 'Purchases are available in a native development or store build, not Expo Go.'
                    : availability.reason === 'missing_configuration'
                      ? 'Store subscriptions are not configured in this app build yet.'
                      : 'Subscription plans are currently unavailable.'
                )}
              </Text>
              {!serverBillingReady && isAuthenticated && !loadingPlans &&
                billingMessage?.includes('billing is not currently ready') && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setBillingReadinessRetry(value => value + 1)}
                  >
                    <Text style={styles.actionText}>Check billing availability again</Text>
                  </Pressable>
                )}
            </>
          )}
          {billingMessage && plans.length > 0 && (
            <Text style={billingMessageIsError ? styles.errorMessage : styles.planHint}>{billingMessage}</Text>
          )}
        </Animated.View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) + (Platform.OS === 'web' ? 34 : 0) }]}>
        {isPremium ? (
          <View style={[styles.upgradeButton, styles.downgradeButton]}>
            <Text style={[styles.upgradeText, { color: Colors.textSecondary }]}>Premium membership active</Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: working || loadingPlans || !serverBillingReady || !plans.length || !isAuthenticated || billingUserId !== authenticatedUserId }}
            disabled={working || loadingPlans || !serverBillingReady || !plans.length || !isAuthenticated || billingUserId !== authenticatedUserId}
            onPress={handlePurchase}
            style={[styles.upgradeButton, (working || loadingPlans || !serverBillingReady || !plans.length || !isAuthenticated || billingUserId !== authenticatedUserId) && styles.disabledButton]}
          >
            {working ? <ActivityIndicator color={Colors.white} /> : <Ionicons name="star" size={20} color={Colors.white} />}
            <Text style={styles.upgradeText}>Continue with {selectedPlan === 'monthly' ? 'monthly' : 'annual'} Premium</Text>
          </Pressable>
        )}
        <View style={styles.secondaryActions}>
          <Pressable accessibilityRole="button" onPress={handleRestore} disabled={working}>
            <Text style={styles.actionText}>Restore purchases</Text>
          </Pressable>
          {availability.available && isAuthenticated && (
            <Pressable accessibilityRole="button" onPress={handleCustomerCenter} disabled={working}>
              <Text style={styles.actionText}>Manage subscription</Text>
            </Pressable>
          )}
        </View>
        {entitlementUnavailable && (
          <Text style={styles.errorMessage}>We couldn’t verify your current access with Amodka. Premium access is unavailable until verification succeeds.</Text>
        )}
        {!isAuthenticated && (
          <Text style={styles.disclaimer}>Sign in to subscribe or restore purchases to your Amodka account.</Text>
        )}
      </View>
    </View>
    </SwipeToDismiss>
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
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: rs(26), color: Colors.primary, textAlign: 'center', letterSpacing: -0.5 },
  headerSubtitle: { fontFamily: 'Inter_400Regular', fontSize: rs(15), color: Colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  featureCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: Colors.white, borderRadius: 14, padding: 16, marginBottom: 8 },
  featureIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.secondary + '12', alignItems: 'center', justifyContent: 'center' },
  featureTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(15), color: Colors.primary },
  featureDesc: { fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.textSecondary, marginTop: 2, lineHeight: 17 },
  pricingCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 20, marginTop: 12 },
  pricingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  pricingTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(16), color: Colors.primary },
  savingsText: { fontFamily: 'Inter_500Medium', fontSize: rs(12), color: Colors.success, marginTop: 2 },
  priceBadge: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  priceText: { fontFamily: 'Inter_700Bold', fontSize: rs(22), color: Colors.primary },
  priceUnit: { fontFamily: 'Inter_400Regular', fontSize: rs(13), color: Colors.textSecondary },
  pricingDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 8 },
  footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: Colors.background },
  upgradeButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.secondary, borderRadius: 14, paddingVertical: 16 },
  downgradeButton: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  upgradeText: { fontFamily: 'Inter_600SemiBold', fontSize: rs(16), color: Colors.white },
  disclaimer: { fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.textLight, textAlign: 'center', marginTop: 10 },
  planOption: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 14, marginVertical: 5 },
  selectedPlanOption: { borderColor: Colors.secondary, backgroundColor: Colors.secondary + '08' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.textLight, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: Colors.secondary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.secondary },
  localizedPrice: { fontFamily: 'Inter_600SemiBold', fontSize: rs(15), color: Colors.primary },
  trialText: { fontFamily: 'Inter_500Medium', fontSize: rs(12), color: Colors.success, marginTop: 3 },
  planHint: { fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.textSecondary, marginTop: 10, lineHeight: 18 },
  errorMessage: { fontFamily: 'Inter_500Medium', fontSize: rs(12), color: Colors.error, marginTop: 10, lineHeight: 18 },
  inlineLoading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  secondaryActions: { flexDirection: 'row', justifyContent: 'center', gap: 28, paddingVertical: 13 },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: rs(13), color: Colors.primary, textDecorationLine: 'underline' },
  disabledButton: { opacity: 0.55 },
});
