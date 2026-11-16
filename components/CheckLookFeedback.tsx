import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { FEEDBACK_REASON_CHIPS, sendLookFeedback, type FeedbackReason } from '@/lib/checkLookClient';

export default function CheckLookFeedback({ requestId }: { requestId: string }) {
  const [thumb, setThumb] = useState<'up' | 'down' | null>(null);
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [showReasons, setShowReasons] = useState(false);
  // Serialise taps so a slow first request cannot overwrite the latest choice.
  const queue = useRef(Promise.resolve());
  function send(value: 'up' | 'down', chip: FeedbackReason | null) {
    queue.current = queue.current.catch(() => {}).then(() => sendLookFeedback(requestId, value, chip));
  }
  function choose(value: 'up' | 'down') {
    setThumb(value); setReason(null); setShowReasons(value === 'down');
    send(value, null);
  }
  return (
    <View testID="check-look-feedback" style={styles.container}>
      <View style={styles.row}>
        {(['up', 'down'] as const).map(value => (
          <Pressable key={value} testID={`check-look-thumb-${value}`} accessibilityRole="button"
            accessibilityLabel={value === 'up' ? 'Helpful verdict' : 'Unhelpful verdict'}
            accessibilityState={{ selected: thumb === value }} onPress={() => choose(value)}
            style={[styles.thumb, thumb === value && styles.selected]}>
            <Feather name={value === 'up' ? 'thumbs-up' : 'thumbs-down'} size={18} color={Colors.textPrimary} />
          </Pressable>
        ))}
      </View>
      {showReasons && (
        <View>
          <Text style={styles.note}>This helps us improve Check my look.</Text>
          <View style={styles.row}>
            {FEEDBACK_REASON_CHIPS.map(([value, label]) => (
              <Pressable key={value} testID={`check-look-reason-${value}`} accessibilityRole="button"
                accessibilityState={{ selected: reason === value }}
                onPress={() => { setReason(value); send('down', value); }}
                style={[styles.chip, reason === value && styles.selected]}>
                <Text style={styles.label}>{label}</Text>
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" testID="check-look-feedback-skip"
              onPress={() => setShowReasons(false)} style={styles.chip}>
              <Text style={styles.label}>Skip</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { marginTop: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center',
    borderRadius: 22, borderWidth: 1, borderColor: Colors.border },
  selected: { borderColor: Colors.primary, backgroundColor: Colors.background },
  note: { color: Colors.textSecondary, fontSize: 13, marginVertical: 10 },
  chip: { borderColor: Colors.border, borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  label: { color: Colors.textPrimary, fontSize: 13 },
});
