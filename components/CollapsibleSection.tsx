import { useState, useCallback } from 'react';
import { Pressable, View, Text, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { rs } from '../lib/responsive';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

interface CollapsibleSectionProps {
  title: string;
  count: string;
  initiallyOpen?: boolean;
  children: React.ReactNode;
  hasBorderTop?: boolean;
}

export default function CollapsibleSection({
  title,
  count,
  initiallyOpen = false,
  children,
  hasBorderTop = false,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(initiallyOpen);
  const rotation = useSharedValue(initiallyOpen ? 180 : 0);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext({
      duration: 250,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'easeInEaseOut', property: 'scaleY' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    const next = !open;
    rotation.value = withTiming(next ? 180 : 0, { duration: 220 });
    setOpen(next);
    Haptics.selectionAsync();
  }, [open]);

  return (
    <View style={[styles.section, hasBorderTop && styles.sectionBorder]}>
      <Pressable
        style={({ pressed }) => [styles.header, pressed && { opacity: 0.7 }]}
        onPress={toggle}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.title}>{title}</Text>
        <View style={styles.right}>
          <Text style={styles.count}>{count}</Text>
          <Animated.View style={chevronStyle}>
            <Ionicons name="chevron-down" size={14} color={Colors.textLight} />
          </Animated.View>
        </View>
      </Pressable>
      {open && <View style={styles.content}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {},
  sectionBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
    minHeight: 44,
  },
  title: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: rs(13),
    color: Colors.primary,
    letterSpacing: -0.1,
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  count: {
    fontFamily: 'Inter_400Regular',
    fontSize: rs(11),
    color: Colors.textLight,
  },
  content: { paddingBottom: 10 },
});
