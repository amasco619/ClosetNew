# AuraCloset — Developer Technical Specification: Bulk Digitization & Zero-Latency AI Ingestion

**Target Audience:** React Native / Expo Mobile Developers & Node/Express Backend Engineers  
**Document Reference:** Authoritative UI/UX Design System & Rate Limiting (§2, §4, §9, §12 of `TECHNICAL.md`)  
**Subject:** Technical Brief for 10-Item Bulk Studio (`app/bulk-import.tsx` & `app/bulk-review.tsx`)  

---

## 1. Executive Summary & Zero-Latency Strategy

To guarantee absolute compliance with the Express API rate limiter (`aiLimiter: 10 req/min`) while ensuring **zero perceived latency**, the bulk ingestion architecture implements a strict **10-Garment Hard Cap** coupled with **Optimistic UI Canvas Rendering**.

Rather than forcing users to wait 5–8 seconds for 10 AI network calls to resolve before navigating to the review grid, the app mounts the review canvas instantaneously (`0ms` delay) using local photo URIs. AI garment classifications settle asynchronously in the background, smoothly shimmering detected metadata onto each card in real time.

---

## 2. Rate-Limit Cap & Optimistic Ingestion Pipeline

```
User Picks Photos ──► [expo-image-picker: selectionLimit = 10]
                             │
                             ▼ (0ms Instant Mount)
                  Lookbook Review Grid (`bulk-review.tsx`)
                  Displays 10 Quartz Shimmer Cards Immediately
                             │
                             ▼ (Async Parallel Background Fetch)
                  POST /api/classify-garment (Up to 10 Req)
                             │
                             ▼ (Real-Time Card Settlement)
                  Cards Shimmer with Detected Tags (Tops · Navy)
```

---

## 3. UI/UX Specifications: Lookbook Studio Grid & Quartz Shimmer

### 3.1 Atmospheric Atelier Ingestion Status (Pre-Render State)
While background AI network calls settle, unrendered cards must **never** display generic grey UI spinners or standard utility text like *"Loading..."*

Instead, each card thumbnail displays a **Translucent Quartz Glass Surface** with a sweeping **Champagne Gold (`#D0B892`) breathing pulse**, accompanied by crisp geometric symbols and high-fashion micro-copy:

```
┌──────────────────────────────────────────────────────────┐
│ FLOATING HEADER: ✦ ATELIER DIGITIZING BATCH (6 OF 10)    │
├──────────────────────────────────────────────────────────┤
│ CARD 1 (Settled)            │ CARD 2 (Processing)        │
│                             │                            │
│  ┌───────────────────────┐  │  ┌───────────────────────┐ │
│  │ Photo                 │  │  │ [Pulsing Gold Wash]   │ │
│  │                       │  │  │ ✦ REVIEWING SILHOUETTE│ │
│  └───────────────────────┘  │  └───────────────────────┘ │
│                             │                            │
│  SILK BLOUSE                │  ✦ EXTRACTING WEAVE...     │
│  Tops · Champagne Gold      │  Atelier AI Analyzing      │
│                             │                            │
│  [ Refine Details  ↗ ]      │  [ Stylist Reviewing ]     │
└─────────────────────────────┴────────────────────────────┘
```

### 3.2 Micro-Copy Cycling States
For any card awaiting `POST /api/classify-garment` resolution, cycle the status typography every `450ms` using `Reanimated`:
1. `✦  REVIEWING SILHOUETTE`
2. `✦  DERIVING OCCASION TAGS`
3. `✦  CURATING COLOR HARMONY`
4. `✦  EXTRACTING FABRIC WEAVE`

When the API returns `200 OK`, fire `Haptics.impactAsync(Light)` and execute `FadeInDown.duration(280)` to composite the real flat-lay garment image and its verified tags.

---

## 4. Developer Production Snippets

### 4.1 Bulk Review Card Component (`app/bulk-review.tsx`)

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { FadeIn, FadeInDown, useSharedValue, useAnimatedStyle, withRepeat, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';

interface BulkCardProps {
  photoUri: string;
  isSettled: boolean;
  classification?: { category: string; colorFamily: string; displayName: string };
  onPress: () => void;
}

export const BulkReviewCard: React.FC<BulkCardProps> = ({ photoUri, isSettled, classification, onPress }) => {
  const [statusIdx, setStatusIdx] = useState(0);
  const statuses = ['REVIEWING SILHOUETTE', 'DERIVING OCCASION TAGS', 'CURATING COLOR HARMONY'];

  const goldPulse = useSharedValue(0.3);

  useEffect(() => {
    if (!isSettled) {
      goldPulse.value = withRepeat(withTiming(0.8, { duration: 900 }), -1, true);
      const timer = setInterval(() => setStatusIdx(i => (i + 1) % statuses.length), 550);
      return () => clearInterval(timer);
    }
  }, [isSettled]);

  const animatedWashStyle = useAnimatedStyle(() => ({
    opacity: goldPulse.value,
  }));

  if (!isSettled) {
    return (
      <View style={styles.cardContainer}>
        <Animated.View style={[styles.quartzWash, animatedWashStyle]}>
          <Text style={styles.quartzSymbol}>✦</Text>
          <Text style={styles.quartzStatus}>{statuses[statusIdx]}</Text>
        </Animated.View>
        <Text style={styles.processingLabel}>Atelier AI Analyzing...</Text>
      </View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(280)} style={styles.cardContainer}>
      {/* Settled Card Content */}
    </Animated.View>
  );
};
```
