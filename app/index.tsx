import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import * as Linking from 'expo-linking';
import { createSessionFromUrl } from '../lib/auth';
import { NATIVE_OAUTH_CALLBACK_URL, isOAuthCallbackUrl } from '../lib/oauth-callback';
import { AmodkaErrorState } from '@/components/AmodkaErrorState';
import { reportError } from '@/shared/observability';

import { hasRequiredOnboardingFields } from '../shared/profile-personalization';

export default function IndexScreen() {
  const { profile, appReady, startupError, retryInitialization, isAuthenticated } = useApp();
  const splashHidden = useRef(false);

  const containerOpacity = useSharedValue(0);
  const wordmarkOpacity = useSharedValue(0);
  const accentScaleX = useSharedValue(0);
  const taglineOpacity = useSharedValue(0);

  useEffect(() => {
    containerOpacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) });
    wordmarkOpacity.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.ease) });
    accentScaleX.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });

    taglineOpacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.ease) });
  }, [containerOpacity, wordmarkOpacity, accentScaleX, taglineOpacity]);

  const url = Linking.useLinkingURL();
  useEffect(() => {
    if (url && isOAuthCallbackUrl(url, NATIVE_OAUTH_CALLBACK_URL)) {
      createSessionFromUrl(url, NATIVE_OAUTH_CALLBACK_URL).catch(error =>
        reportError(error, 'oauth_callback', { dependency: 'supabase_auth' }),
      );
    }
  }, [url]);

  useEffect(() => {
    if (!appReady) return;

    if (!splashHidden.current) {
      splashHidden.current = true;
      SplashScreen.hideAsync().catch(error =>
        reportError(error, 'splash_hide', { dependency: 'expo_splash' }),
      );
    }

    if (startupError) return;

    const navigateTo = (path: string) => {
      router.replace(path as Parameters<typeof router.replace>[0]);
    };

    const fadeOutThenNavigate = (path: string) => {
      // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue writes are imperative animation commands, not React state mutations.
      containerOpacity.value = withTiming(
        0,
        { duration: 180, easing: Easing.in(Easing.ease) },
        (finished) => {
          if (finished) runOnJS(navigateTo)(path);
        }
      );
    };

    if (isAuthenticated) {
      if (profile.onboardingComplete && hasRequiredOnboardingFields(profile)) {
        fadeOutThenNavigate('/(tabs)');
      } else {
        fadeOutThenNavigate('/onboarding');
      }
      return;
    }

    if (profile.isGuest) {
      if (profile.onboardingComplete && hasRequiredOnboardingFields(profile)) {
        fadeOutThenNavigate('/(tabs)');
      } else {
        fadeOutThenNavigate('/onboarding?guest=true');
      }
      return;
    }

    fadeOutThenNavigate('/welcome');
  }, [appReady, startupError, isAuthenticated, profile, containerOpacity]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
  }));

  const accentStyle = useAnimatedStyle(() => ({
    width: accentScaleX.value * 32,
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
  }));

  if (startupError) {
    return (
      <View style={styles.container}>
        <AmodkaErrorState type="network" onRetry={retryInitialization} />
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      accessible={!appReady}
      accessibilityRole={!appReady ? 'progressbar' : undefined}
      accessibilityLabel={!appReady ? 'Preparing your wardrobe' : undefined}
      accessibilityLiveRegion={!appReady ? 'polite' : undefined}
      aria-live={!appReady ? 'polite' : undefined}
    >
      <Animated.View style={[styles.content, containerStyle]}>
        <Animated.Text style={[styles.wordmark, wordmarkStyle]}>
          Amodka
        </Animated.Text>
        <Animated.View style={[styles.accent, accentStyle]} />
        <Animated.Text style={[styles.tagline, taglineStyle]}>
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
