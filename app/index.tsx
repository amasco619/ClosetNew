import { useEffect } from 'react';
import { router } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useApp } from '@/contexts/AppContext';
import type { UserProfile } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import * as Linking from 'expo-linking';
import { createSessionFromUrl } from '../lib/auth';

function hasRequiredOnboardingFields(p: UserProfile): boolean {
  return !!(
    p.name?.trim() &&
    p.bodyType &&
    p.eyeColor &&
    p.skinTone &&
    p.undertone &&
    p.styleGoalPrimary
  );
}

export default function IndexScreen() {
  const { profile, appReady, isAuthenticated } = useApp();

  const containerOpacity = useSharedValue(0);
  const wordmarkOpacity = useSharedValue(0);
  const accentScaleX = useSharedValue(0);
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    containerOpacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) });
    wordmarkOpacity.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.ease) });
    accentScaleX.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });

    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const url = Linking.useLinkingURL();
  useEffect(() => {
    if (url) {
      createSessionFromUrl(url).catch(console.error);
    }
  }, [url]);

  useEffect(() => {
    if (!appReady) return;

    if (isAuthenticated) {
      if (profile.onboardingComplete && hasRequiredOnboardingFields(profile)) {
        router.replace('/(tabs)');
      } else {
        router.replace('/onboarding');
      }
      return;
    }

    if (profile.isGuest) {
      if (profile.onboardingComplete && hasRequiredOnboardingFields(profile)) {
        router.replace('/(tabs)');
      } else {
        router.replace('/onboarding?guest=true');
      }
      return;
    }

    router.replace('/welcome');
  }, [appReady, isAuthenticated, profile.onboardingComplete, profile.isGuest, profile.name, profile.bodyType, profile.eyeColor, profile.skinTone, profile.undertone, profile.styleGoalPrimary]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
  }));

  const accentStyle = useAnimatedStyle(() => ({
    width: accentScaleX.value * 32,
  }));

  const dotsStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, containerStyle]}>
        <Animated.Text style={[styles.wordmark, wordmarkStyle]}>
          AuraCloset
        </Animated.Text>
        <Animated.View style={[styles.accent, accentStyle]} />
        <Animated.Text style={[styles.tagline, dotsStyle]}>
          Your quiet-luxury stylist in your pocket
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
  },
  wordmark: {
    fontFamily: 'Inter_700Bold',
    fontSize: 30,
    letterSpacing: -0.8,
    color: Colors.primary,
  },
  accent: {
    height: 1.5,
    backgroundColor: Colors.secondary,
    marginTop: 10,
  },
  tagline: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    letterSpacing: 0,
    color: Colors.textSecondary,
    marginTop: 12,
  },
});
