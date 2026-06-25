# AuraCloset — Developer Technical Specification: Body Archetype Silhouettes

**Target Audience:** React Native / Expo Mobile Developers  
**Document Reference:** Authoritative UI/UX Design System (§2, §3, §12 of `TECHNICAL.md`)  
**Subject:** Digitized Couture Silhouettes for Onboarding Step 2 (`app/onboarding_step2.tsx`)  

---

## 1. Executive Summary & Design Engineering Decision

In the current onboarding prototype (`image.png`), body shape selection relies on clip-art medical/fitness style line drawings overlaid with harsh orange triangles and ovals. This presentation immediately triggers user associations with fitness diet trackers or medical survey questionnaires.

To maintain the *"Tesla of wardrobe apps"* prestige, we have engineered 6 bespoke **Couture Atelier Vector Silhouettes** saved to `assets/body_types/*.svg`. 

### Why Vector SVGs (`react-native-svg`) over PNG bitmaps?
1. **Infinite Resolution Scalability:** SVGs render with crystalline sharpness on OLED iPhone/Android screens at any pixel density.
2. **Minimal Footprint:** Each vector file is under `2 KB` (vs `200 KB+` for bitmaps), drastically optimizing app bundle download speed.
3. **Dynamic Theming:** The vector stroke `#101826` and Champagne Gold `#D0B892` washes can be dynamically manipulated in React Native via props when a user taps or selects a card.

---

## 2. Silhouette Architectural Inventory

| Archetype | File Path | Sculptural Line-Art Specification |
| :--- | :--- | :--- |
| **Hourglass** | `assets/body_types/hourglass.svg` | Balanced shoulder/hip sweeping contours with dashed Champagne Gold waist cinch band (`x: 38 -> 82`). |
| **Pear** | `assets/body_types/pear.svg` | Delicate narrow shoulder posture sweeping outward into graceful lower drape arcs. |
| **Apple** | `assets/body_types/apple.svg` | Soft fuller midsection silhouette framed by delicate geometric champagne dotted halo. |
| **Rectangle** | `assets/body_types/rectangle.svg` | Architectural chic straight lines framed by minimalist golden structural rectangle overlay. |
| **Inverted Triangle**| `assets/body_types/inverted_triangle.svg`| Bold sculptural fashion-runway shoulders tapering down sleekly to narrow hips. |
| **Athletic** | `assets/body_types/athletic.svg` | Toned sculptural couture lines with horizontal posture indicators. |

---

## 3. Screen Layout & Interactive Choreography

### 3.1 Grid Canvas Hierarchy
* **Screen Canvas:** `#F5F3F0` (Warm Off-White).
* **Card Surface:** `height: 180pt`, `borderRadius: 18pt`, `backgroundColor: #FFFFFF`. Hairline `1px` border `rgba(16, 24, 38, 0.08)`.
* **Selection State Physics (<300ms Mandate):**
  * When unselected: `scale: 1.0`, `borderWidth: 1`, `borderColor: Colors.border`.
  * When selected: Animate via Reanimated spring (`stiffness: 300, damping: 18`) to `scale: 0.98`, `borderWidth: 2`, `borderColor: Colors.secondary` (`#D0B892`), outer gold glow shadow (`shadowColor: '#D0B892', shadowOpacity: 0.25, shadowRadius: 14`).
  * Haptic Feedback: Every card tap must trigger `Haptics.selectionAsync()`.

---

## 4. Developer Production Snippet (`app/onboarding_step2.tsx`)

```tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SvgXml } from 'react-native-svg';
import { Colors } from '../constants/colors';

// Import raw SVGs as strings or via expo-asset
import HourglassSvg from '../assets/body_types/hourglass.svg';

export default function OnboardingBodyShape() {
  const [selectedShape, setSelectedShape] = useState<string | null>('hourglass');

  const handleSelect = (shapeId: string) => {
    Haptics.selectionAsync();
    setSelectedShape(shapeId);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.grid}>
      <Text style={styles.title}>Body Shape</Text>
      <Text style={styles.sub}>This helps us recommend the most flattering silhouettes</Text>

      <View style={styles.columnGrid}>
        {/* Render Cards */}
      </View>
    </ScrollView>
  );
}
```
