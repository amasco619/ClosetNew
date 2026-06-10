import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '../lib/supabase';

const FEATURES = [
  'Digitise your wardrobe in seconds',
  'Personalised outfit suggestions, daily',
  'Calibrates to your taste over time',
] as const;

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { updateProfile } = useApp();
  const webTop = Platform.OS === 'web' ? 67 : 0;

  useEffect(() => {
    supabase.auth.getClaims().then(({ data }) => {
      if (data?.claims) router.replace('/(tabs)');
    });
  }, []);

  const handleGetStarted = () => {
    Haptics.selectionAsync();
    updateProfile({ isGuest: true });
    router.replace('/onboarding?guest=true');
  };

  const handleSignIn = () => {
    Haptics.selectionAsync();
    router.push('/sign-in');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTop, paddingBottom: insets.bottom + 24 }]}>
      <Animated.View entering={FadeInDown.duration(280).delay(60)} style={styles.hero}>
        <View style={styles.logoMark}>
          <Text style={styles.logoInitial}>A</Text>
        </View>
        <Text style={styles.wordmark}>AuraCloset</Text>
        <Text style={styles.tagline}>Your quiet-luxury stylist in your pocket</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(280).delay(160)} style={styles.features}>
        {FEATURES.map((feat, i) => (
          <View key={i} style={styles.featureRow}>
            <View style={styles.featureDot} />
            <Text style={styles.featureText}>{feat}</Text>
          </View>
        ))}
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(280).delay(260)} style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
          onPress={handleGetStarted}
        >
          <Text style={styles.primaryBtnText}>Get Started</Text>
          <Text style={styles.primaryBtnSub}>No account needed</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.7 }]}
          onPress={handleSignIn}
        >
          <Text style={styles.secondaryBtnText}>I already have an account</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.secondary} />
        </Pressable>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(280).delay(340)} style={styles.footer}>
        <Ionicons name="lock-closed-outline" size={12} color={Colors.textLight} />
        <Text style={styles.footerText}>Your wardrobe stays private, always</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
  },
  hero: {
    alignItems: 'center',
    paddingTop: 48,
  },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: Colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  logoInitial: {
    fontFamily: 'Inter_700Bold',
    fontSize: 36,
    color: Colors.secondary,
    letterSpacing: -1,
  },
  wordmark: {
    fontFamily: 'Inter_700Bold',
    fontSize: 30,
    color: Colors.primary,
    letterSpacing: -0.8,
    marginBottom: 10,
  },
  tagline: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: 0.1,
  },
  features: {
    gap: 14,
    paddingVertical: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.secondary,
  },
  featureText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  actions: {
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  primaryBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  primaryBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.white,
    letterSpacing: -0.2,
  },
  primaryBtnSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: '#FFFFFF99',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.secondary + '40',
    backgroundColor: Colors.white,
  },
  secondaryBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.secondary,
    letterSpacing: -0.1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 8,
  },
  footerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textLight,
    letterSpacing: 0.1,
  },
});
