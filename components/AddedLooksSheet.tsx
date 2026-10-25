import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { rs } from '@/lib/responsive';
import { useApp, type AddedLooksPrompt as AddedLooksPromptState } from '@/contexts/AppContext';
import { filterLastAddedSuggestions } from '@/lib/lastAddedSuggestions';
import { addedLooksPromptCopy } from '@/lib/addedLooksPromptCopy';

interface AddedLooksSheetProps {
  prompt: AddedLooksPromptState | null;
  visible: boolean;
  hasSuggestions: boolean;
  onSeeLooks: () => void;
  onDismiss: () => void;
}

export function AddedLooksSheet({
  prompt,
  visible,
  hasSuggestions,
  onSeeLooks,
  onDismiss,
}: AddedLooksSheetProps) {
  const insets = useSafeAreaInsets();
  if (!prompt) return null;
  const single = prompt.count === 1;
  const copy = addedLooksPromptCopy(prompt);

  return (
    <Modal
      testID="added-looks-modal"
      visible={visible}
      transparent
      statusBarTranslucent
      presentationStyle="overFullScreen"
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={styles.stage}>
        <Pressable
          testID="added-looks-backdrop"
          accessibilityRole="button"
          accessibilityLabel="Close added items"
          style={styles.scrim}
          onPress={onDismiss}
        />
        <View
          testID="added-looks-sheet"
          accessibilityViewIsModal
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) + 12 }]}
        >
          <View style={styles.handle} />
          <View style={styles.itemRow}>
            {prompt.photoUri ? (
              <Image
                source={{ uri: prompt.photoUri }}
                style={styles.thumbnail}
                resizeMode="cover"
                accessibilityLabel={single ? `${prompt.itemName ?? 'Added piece'} photo` : 'Saved wardrobe pieces'}
              />
            ) : (
              <View style={styles.thumbnailFallback}>
                <Ionicons name="shirt-outline" size={28} color={Colors.secondary} />
              </View>
            )}
            <View style={styles.copy}>
              <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
              <Text style={styles.message}>{copy.message}</Text>
            </View>
          </View>
          {!hasSuggestions && (
            <Text testID="added-looks-empty" style={styles.emptyNote}>
              {copy.empty}
            </Text>
          )}
          <Pressable
            testID="added-looks-see"
            accessibilityRole="button"
            accessibilityLabel={copy.action}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={onSeeLooks}
          >
            <Text style={styles.primaryText}>
              {copy.action}
            </Text>
          </Pressable>
          <Pressable
            testID="added-looks-not-now"
            accessibilityRole="button"
            accessibilityLabel="Not now"
            style={styles.dismissButton}
            onPress={onDismiss}
          >
            <Text style={styles.dismissText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function AddedLooksSheetHost() {
  const {
    addedLooksPrompt,
    lastAddedSuggestions,
    wardrobeItems,
    dismissAddedLooksPrompt,
    activateLastAddedSuggestions,
  } = useApp();
  const [presentedPrompt, setPresentedPrompt] = useState<AddedLooksPromptState | null>(null);
  useEffect(() => {
    if (!addedLooksPrompt) return;
    const timer = setTimeout(() => setPresentedPrompt(addedLooksPrompt), 280);
    return () => clearTimeout(timer);
  }, [addedLooksPrompt]);

  if (!addedLooksPrompt || !wardrobeItems.some(item => item.id === addedLooksPrompt.anchorItemId)) return null;
  const validSuggestions = filterLastAddedSuggestions(
    lastAddedSuggestions,
    new Set(wardrobeItems.map(item => item.id)),
  );
  const hasSuggestions = validSuggestions.some(look => look.heroId === addedLooksPrompt.anchorItemId);
  return (
    <AddedLooksSheet
      prompt={addedLooksPrompt}
      visible={presentedPrompt === addedLooksPrompt}
      hasSuggestions={hasSuggestions}
      onDismiss={dismissAddedLooksPrompt}
      onSeeLooks={() => {
        activateLastAddedSuggestions(addedLooksPrompt.anchorItemId);
        router.navigate('/(tabs)/outfits');
      }}
    />
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(16, 24, 38, 0.42)' },
  sheet: {
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: Colors.white,
    shadowColor: Colors.primary,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -4 },
    elevation: 14,
  },
  handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: Colors.border, marginBottom: 22 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  thumbnail: { width: 80, height: 80, borderRadius: 18, backgroundColor: Colors.background },
  thumbnailFallback: {
    width: 80, height: 80, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  copy: { flex: 1 },
  title: {
    fontSize: rs(25),
    lineHeight: rs(31),
    color: Colors.primary,
    fontFamily: 'Georgia',
  },
  message: { marginTop: 4, fontFamily: 'Inter_400Regular', fontSize: rs(14), lineHeight: 20, color: Colors.textSecondary },
  emptyNote: { marginBottom: 12, fontFamily: 'Inter_400Regular', fontSize: rs(13), color: Colors.textLight, textAlign: 'center' },
  primaryButton: {
    minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18,
    borderRadius: 18, backgroundColor: Colors.primary,
    shadowColor: Colors.primary, shadowOpacity: 0.26, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  primaryText: { fontFamily: 'Inter_600SemiBold', fontSize: rs(15), color: Colors.white, textAlign: 'center' },
  pressed: { opacity: 0.86, transform: [{ scale: 0.97 }] },
  dismissButton: { minHeight: 52, justifyContent: 'center', alignItems: 'center', marginTop: 6 },
  dismissText: { fontFamily: 'Inter_500Medium', fontSize: rs(14), color: Colors.textSecondary },
});
