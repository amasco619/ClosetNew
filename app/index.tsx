import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import { supabase } from '../lib/supabase';
import * as Linking from 'expo-linking';
import { createSessionFromUrl } from '../lib/auth';

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
    supabase.auth.getClaims().then(({ data: { claims } }) => {
      if (!claims) {
        router.replace('/sign-in');
      } else {
        setHasSession(true);
      }
      setChecking(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setHasSession(false);
        router.replace('/sign-in');
      } else {
        setHasSession(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!checking && hasSession && !isLoading) {
      if (profile.onboardingComplete) {
        router.replace('/(tabs)');
      } else {
        router.replace('/onboarding');
      }
    }
  }, [checking, hasSession, isLoading, profile.onboardingComplete]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.secondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
});
