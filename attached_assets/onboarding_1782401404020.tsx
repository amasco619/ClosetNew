import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const isValid = name.trim().length >= 2;

  const handleContinue = () => {
    if (!isValid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Advance to Step 2 (Body Archetype)
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top + 12, 36) }]}>
      
      {/* Top Navigation & Progress Track */}
      <View style={styles.topNav}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.primary} />
        </Pressable>
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: isValid ? '15%' : '10%' }]} />
          </View>
          <Text style={styles.microTracker}>STEP 1 OF 10 · PERSONAL CALIBRATION</Text>
        </View>
      </View>

      <View style={styles.contentArea}>
        
        {/* Minimalist Atelier Monogram replacing cartoon hanger */}
        <Animated.View entering={FadeInDown.delay(60).duration(280)} style={styles.monogramBadge}>
          <Text style={styles.monogramSymbol}>◆</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(280)} style={styles.headerGroup}>
          <Text style={styles.headline}>May we have your name?</Text>
          <Text style={styles.subtitle}>
            To begin your personal calibration, how should your quiet-luxury stylist address you?
          </Text>
        </Animated.View>

        {/* Elevated Surface Input */}
        <Animated.View entering={FadeInDown.delay(180).duration(280)}>
          <TextInput
            style={[styles.input, isFocused && styles.inputFocused]}
            placeholder="Your name"
            placeholderTextColor="rgba(16,24,38,0.35)"
            value={name}
            onChangeText={setName}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            autoFocus={true}
            autoCorrect={false}
          />
        </Animated.View>

      </View>

      {/* Dynamic Submit CTA */}
      <Animated.View 
        entering={FadeInUp.delay(240).duration(280)} 
        style={[styles.ctaWrapper, { paddingBottom: Math.max(insets.bottom + 20, 36) }]}
      >
        <Pressable
          onPress={handleContinue}
          style={({ pressed }) => [
            styles.ctaButton,
            isValid ? styles.ctaActive : styles.ctaDisabled,
            pressed && isValid && { transform: [{ scale: 0.97 }], opacity: 0.9 }
          ]}
        >
          <Text style={[styles.ctaText, isValid && styles.ctaTextActive]}>Continue</Text>
          <Ionicons name="arrow-forward" size={18} color={isValid ? Colors.secondary : 'rgba(16,24,38,0.3)'} />
        </Pressable>
      </Animated.View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 24,
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  backButton: {
    marginRight: 12,
  },
  progressContainer: {
    flex: 1,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(16, 24, 38, 0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.secondary,
    borderRadius: 2,
  },
  microTracker: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: Colors.sage,
    letterSpacing: 3,
    marginTop: 8,
    textTransform: 'uppercase',
  },
  contentArea: {
    flex: 1,
    paddingTop: 24,
  },
  monogramBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(208, 184, 146, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(208, 184, 146, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  monogramSymbol: {
    fontSize: 18,
    color: Colors.secondary,
  },
  headerGroup: {
    marginBottom: 32,
  },
  headline: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: Colors.primary,
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: 'rgba(16, 24, 38, 0.65)',
    lineHeight: 22,
    marginTop: 8,
  },
  input: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(16, 24, 38, 0.1)',
    paddingHorizontal: 20,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: Colors.primary,
  },
  inputFocused: {
    borderColor: Colors.secondary,
  },
  ctaWrapper: {
    width: '100%',
  },
  ctaButton: {
    width: '100%',
    height: 56,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaDisabled: {
    backgroundColor: 'rgba(16, 24, 38, 0.12)',
  },
  ctaActive: {
    backgroundColor: Colors.primary,
  },
  ctaText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: 'rgba(16, 24, 38, 0.35)',
  },
  ctaTextActive: {
    color: Colors.secondary,
  },
});
