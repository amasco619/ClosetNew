import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import SwipeToDismiss from '@/components/SwipeToDismiss';
import Colors from '@/constants/colors';

const BATCH_CAP = 10;

const FEATURES = [
  { icon: 'flash-outline',            label: `Up to ${BATCH_CAP} items per batch` },
  { icon: 'sparkles-outline',         label: 'AI analysis runs simultaneously'    },
  { icon: 'checkmark-circle-outline', label: 'Review and save all in one step'   },
] as const;

export default function BulkImportStudio() {
  const insets = useSafeAreaInsets();
  const [picking, setPicking] = useState(false);

  const handleSelect = async () => {
    if (picking) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required to select items.');
      return;
    }

    setPicking(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: BATCH_CAP,
        quality: 0.9,
      });
      if (!result.canceled && result.assets.length > 0) {
        router.push({
          pathname: '/bulk-review',
          params: { uris: JSON.stringify(result.assets.map(a => a.uri)) },
        });
      }
    } finally {
      setPicking(false);
    }
  };

  return (
    <SwipeToDismiss>
      <StatusBar style="dark" />
      <View style={[
        styles.container,
        { paddingTop: Platform.OS === 'android' ? 0 : insets.top },
      ]}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={8}>
            <Ionicons name="close" size={24} color={Colors.primary} />
          </Pressable>
        </View>

        <View style={styles.content}>
          <Animated.View entering={FadeInDown.duration(280).delay(60)}>
            <Text style={styles.micro}>ATELIER INGESTION</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(280).delay(120)}>
            <Text style={styles.title}>{'Bulk Digitization\nStudio'}</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(280).delay(180)}>
            <Text style={styles.body}>
              {`Select up to ${BATCH_CAP} garments from your library. Gemini AI analyses each item in parallel while you review — zero waiting.`}
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(280).delay(240)} style={styles.featureCard}>
            {FEATURES.map(({ icon, label }) => (
              <View key={label} style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <Ionicons name={icon} size={14} color={Colors.secondary} />
                </View>
                <Text style={styles.featureText}>{label}</Text>
              </View>
            ))}
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(280).delay(300)}>
            <Pressable
              style={({ pressed }) => [
                styles.btn,
                pressed && !picking && { opacity: 0.82, transform: [{ scale: 0.97 }] },
                picking && { opacity: 0.6 },
              ]}
              onPress={handleSelect}
              disabled={picking}
            >
              <Ionicons name="images-outline" size={20} color={Colors.white} />
              <Text style={styles.btnText}>
                {picking ? 'Opening Library...' : `Choose Batch (Max ${BATCH_CAP})`}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </SwipeToDismiss>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 32 },
  micro: {
    fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.secondary,
    letterSpacing: 1.2, marginBottom: 12,
  },
  title: {
    fontFamily: 'Inter_700Bold', fontSize: 30, color: Colors.primary,
    letterSpacing: -0.8, lineHeight: 36, marginBottom: 14,
  },
  body: {
    fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary,
    lineHeight: 21, marginBottom: 28,
  },
  featureCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 16, marginBottom: 28,
    borderWidth: 1, borderColor: Colors.border, gap: 12,
    shadowColor: Colors.primary, shadowOpacity: 0.05,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureIcon: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: Colors.secondary + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  featureText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16,
    shadowColor: Colors.primary, shadowOpacity: 0.25,
    shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  btnText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.white },
});
