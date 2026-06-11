import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useApp } from '@/contexts/AppContext';
import type { UserProfile } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import { supabase } from '../lib/supabase';
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
  const { profile, isLoading } = useApp();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  const url = Linking.useLinkingURL();
  useEffect(() => {
    if (url) {
      createSessionFromUrl(url).catch(console.error);
    }
  }, [url]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
      setChecking(false);
    }).catch(() => setChecking(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (checking || isLoading) return;

    if (hasSession) {
      if (profile.onboardingComplete && hasRequiredOnboardingFields(profile)) {
        router.replace('/(tabs)');
      } else {
        router.replace('/onboarding');
      }
      return;
    }

    if (profile.isGuest && profile.onboardingComplete && hasRequiredOnboardingFields(profile)) {
      router.replace('/(tabs)');
      return;
    }

    router.replace('/welcome');
  }, [checking, hasSession, isLoading, profile.onboardingComplete, profile.isGuest]);

  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
});
