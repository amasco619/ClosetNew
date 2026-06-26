import { useEffect } from 'react';
import { router } from 'expo-router';
import { View, StyleSheet } from 'react-native';
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

  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
});
