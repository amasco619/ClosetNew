import { useEffect } from 'react'
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'

export default function AuthCallback() {
  useEffect(() => {
    supabase.auth.getClaims().then(({ data }) => {
      // Route through index.tsx so it can run the onboarding-complete check
      // before deciding whether to land on /(tabs) or /onboarding.
      router.replace(data?.claims ? '/' : '/sign-in')
    })
  }, [])

  return (
    <View style={styles.container}>
      <ActivityIndicator color="#D0B892" size="large" />
      <Text style={styles.label}>Signing you in...</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F3F0',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  label: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '400',
    color: '#101826',
    letterSpacing: 0.3,
  },
})
