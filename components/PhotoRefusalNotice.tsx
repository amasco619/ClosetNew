import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Colors from '@/constants/colors';
import { PHOTO_REFUSAL_BODY, PHOTO_REFUSAL_TITLE } from '@/lib/classificationRefusal';

export function PhotoRefusalNotice({
  onManual,
  onRemove,
  secondaryLabel = 'Remove',
  title = PHOTO_REFUSAL_TITLE,
}: {
  onManual: () => void;
  onRemove: () => void;
  secondaryLabel?: string;
  title?: string;
}) {
  return (
    <View style={styles.notice} accessibilityLiveRegion="polite" testID="photo-refusal-notice">
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      <Text style={styles.body}>{PHOTO_REFUSAL_BODY}</Text>
      <Pressable accessibilityRole="button" onPress={onManual} style={styles.primary}>
        <Text style={styles.primaryText}>Add manually</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onRemove} style={styles.secondary}>
        <Text style={styles.secondaryText}>{secondaryLabel}</Text>
      </Pressable>
    </View>
  );
}

/** Uses the same native Modal/light-sheet pattern as the app's AI disclosure. */
export function PhotoRefusalDialog({
  visible, onManual, onChoosePhoto,
}: {
  visible: boolean;
  onManual: () => void;
  onChoosePhoto: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onManual} accessibilityViewIsModal>
      <View style={styles.scrim}>
        <View style={styles.dialog}>
          <PhotoRefusalNotice onManual={onManual} onRemove={onChoosePhoto} secondaryLabel="Choose another photo" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(18,23,30,0.48)' },
  dialog: { alignSelf: 'center', width: '100%', maxWidth: 420, borderRadius: 24, backgroundColor: Colors.background },
  notice: { padding: 14, gap: 10 },
  title: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.textPrimary },
  body: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, color: Colors.textSecondary },
  primary: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Colors.secondary },
  primaryText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.textPrimary },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary },
});
