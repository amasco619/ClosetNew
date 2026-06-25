# AuraCloset — Developer Technical Specification: Onboarding Quiz Redesign

**Target Audience:** React Native / Expo Mobile Developers  
**Document Reference:** Authoritative UI/UX Design System (§2, §5, §12 of `TECHNICAL.md`)  
**Subject:** Redesign Brief for Initial Onboarding Step (`app/onboarding.tsx`)  

---

## 1. Executive Summary & Aesthetic Vision

The initial onboarding page represents the user's transition from the dramatic, dark landing screen into their **private personal dressing room (The Sanctuary)**. 

In the current implementation (`image.png`), the onboarding screen utilizes generic survey conventions: a cartoonish clothes hanger icon, 10 segmented clinical dashes, standard flat inputs, and a muddy grey "Continue" button. To establish a sophisticated, high-fashion *"Tesla of wardrobe apps"* feel, onboarding must feel like a **1-on-1 consultation with a quiet-luxury stylist**. 

---

## 2. Architectural Critique of Current Implementation

| Component | Current State (`image.png`) | Luxury Engineering Flaw | Developer Remediation |
| :--- | :--- | :--- | :--- |
| **Header Badge** | Coat hanger icon inside rounded cream square. | Looks like a dry-cleaning utility or closet organizer app. | **Remove clip-art.** Replace with clean white space or the delicate geometric **Atelier Monogram** (`48x48pt`). |
| **Progress Bar** | 10 separate grey dash segments. | Feels long, clinical, daunting, and repetitive. | Replace with a smooth **Liquid Capsule Track** (`height: 4pt`) + micro-label (`STEP 1 OF 10 · PERSONAL CALIBRATION`). |
| **Copywriting** | *"Welcome to AuraCloset... What should we call you?"* | Redundant welcome; generic Typeform tone. | Elevate to personal consultation copy: **"May we have your name?"** / *"To begin your calibration..."* |
| **Input Surface** | Standard flat white box on off-white canvas. | Lacks tactile elevation and depth of field. | Craft as **Elevated Surface Card** with hairline border (`rgba(16,24,38,0.1)`) and Champagne focus state. |
| **Submit CTA** | Flat muddy grey button (`#8e8e93`). | Communicates "disabled form" rather than luxury action. | Implement **Dynamic Navy/Gold Card** with tactile Reanimated spring scale (`0.97`) + haptic thuds. |

---

## 3. UI Layout & Component Specifications (`app/onboarding.tsx`)

### 3.1 Screen Visual Canvas
```
┌──────────────────────────────────────────────────────────┐
│ CANVAS: Warm Off-White (#F5F3F0)                         │
├──────────────────────────────────────────────────────────┤
│ TOP NAV: Back Arrow [<] (hitSlop: 12)                    │
│                                                          │
│   [ PROGRESS: ─── (Gold) ─────────────────── (Grey) ]    │
│   [ Micro-Label: STEP 1 OF 10 · PERSONAL CALIBRATION ]   │
│                                                          │
│   ┌──────┐                                               │
│   │  ◆   │  ◄── Atelier Monogram Badge (48x48pt)         │
│   └──────┘                                               │
│                                                          │
│   Headline: May we have your name?                       │
│   Subtitle: To begin your personal calibration...        │
│                                                          │
│   ┌──────────────────────────────────────────────────┐   │
│   │ [stylist focus cursor] Your name                 │   │
│   └──────────────────────────────────────────────────┘   │
│                                                          │
│                                                          │
│   ┌──────────────────────────────────────────────────┐   │
│   │ CONTINUE  ──►  (Active Navy Card + Gold Shadow)  │   │
│   └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### 3.2 Design System Tokens & Styling Rules
* **Background Canvas:** Solid `#F5F3F0` (Warm Off-White). Do not use dark photography here; contrast against the dark landing screen creates psychological intimacy.
* **Liquid Capsule Progress Track:**
  * Track container: `width: 100%`, `height: 4pt`, `borderRadius: 2pt`, `backgroundColor: 'rgba(16, 24, 38, 0.08)'`.
  * Active fill bar: `height: 100%`, `borderRadius: 2pt`, `backgroundColor: Colors.secondary` (`#D0B892`). Animate progress changes via Reanimated `withSpring`.
  * Micro-tracker text: `Inter_500Medium`, 10pt, `Colors.sage` (`#8AA39B`), uppercase, `letterSpacing: 3.0pt`, `marginTop: 8pt`.
* **Atelier Monogram Badge:**
  * Container: `width: 48pt`, `height: 48pt`, `borderRadius: 16pt`, `backgroundColor: 'rgba(208, 184, 146, 0.14)'`, `borderWidth: 1`, `borderColor: 'rgba(208, 184, 146, 0.35)'`, `alignItems: 'center'`, `justifyContent: 'center'`.
  * Icon: Minimalist geometric diamond `◆` or stylized serif `A` in `#D0B892`.
* **Elevated Surface Input Card:**
  * Dimensions: `height: 56pt`, `borderRadius: 16pt`, `backgroundColor: '#FFFFFF'`.
  * Border: `borderWidth: 1`, `borderColor: 'rgba(16, 24, 38, 0.1)'`.
  * Shadow (Quiet Luxury Elevation): `shadowColor: '#101826'`, `shadowOpacity: 0.05`, `shadowRadius: 10`, `shadowOffset: { width: 0, height: 4 }`, `elevation: 2`.
  * Focus State: When user taps input, animate border color to `#D0B892` (`Colors.secondary`) and outer glow.
  * Typography: `Inter_600SemiBold`, 18pt, `#101826`.
* **Dynamic Submit CTA ("Continue"):**
  * Inactive State (name length < 2): `backgroundColor: 'rgba(16, 24, 38, 0.15)'`, `color: 'rgba(16, 24, 38, 0.4)'`.
  * Active State: Silky transition to `backgroundColor: Colors.primary` (`#101826`), `color: Colors.secondary` (`#D0B892`), shadow `shadowColor: '#101826', shadowOpacity: 0.25, shadowRadius: 8`.
  * Physics: `scale: 0.97`, `opacity: 0.88` on press + trigger `Haptics.impactAsync(Light)`.

---

## 4. Animation Choreography (<300ms Mandate)

Conforming to §12 of `TECHNICAL.md`:

| UI Layer | Animation Type | Duration | Stagger Delay | Spring Curve |
| :--- | :--- | :--- | :--- | :--- |
| **Progress Track** | `FadeInDown` | 260ms | 0ms | Damping: 20 |
| **Monogram Badge** | `FadeInDown` | 280ms | 60ms | Damping: 16, Stiffness: 280 |
| **Headline & Copy** | `FadeInDown` | 280ms | 120ms | Damping: 18, Stiffness: 280 |
| **Surface Input** | `FadeInDown` | 280ms | 180ms | Damping: 18, Stiffness: 280 |
| **Bottom CTA** | `FadeInUp` | 280ms | 240ms | Damping: 18, Stiffness: 280 |

### Keyboard Avoidance Engineering
Mandatory wrapping in `react-native-keyboard-controller` (`KeyboardAvoidingView` `behavior="padding"`). When the name input automatically receives focus on screen mount (`autoFocus={true}`), the bottom "Continue" CTA button must anchor smoothly above the native keyboard header with a `20pt` bottom margin.

---

## 5. Developer Production Snippet (`app/onboarding.tsx`)

```tsx
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';

export default function OnboardingStepOne() {
  const [name, setName] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const isValid = name.trim().length >= 2;

  const handlePress = () => {
    if (!isValid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Proceed to Step 2 (Body Archetype)
  };

  return (
    <View style={styles.container}>
      {/* Liquid Progress Track */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: '10%' }]} />
      </View>
      <Text style={styles.microTracker}>STEP 1 OF 10 · PERSONAL CALIBRATION</Text>

      {/* Atelier Monogram Badge */}
      <Animated.View entering={FadeInDown.delay(60).duration(280)} style={styles.monogram}>
        <Text style={styles.monogramText}>◆</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(120).duration(280)}>
        <Text style={styles.headline}>May we have your name?</Text>
        <Text style={styles.subtitle}>To begin your personal calibration, how should your stylist address you?</Text>
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
        />
      </Animated.View>

      {/* Submit CTA */}
      <Animated.View entering={FadeInDown.delay(240).duration(280)} style={styles.ctaWrapper}>
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.ctaButton,
            isValid ? styles.ctaActive : styles.ctaDisabled,
            pressed && isValid && { transform: [{ scale: 0.97 }], opacity: 0.88 }
          ]}
        >
          <Text style={[styles.ctaText, isValid && styles.ctaTextActive]}>Continue ──►</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
```
