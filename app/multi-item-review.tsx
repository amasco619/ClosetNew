import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import Colors from '@/constants/colors';
import { wardrobeCategoryLabel } from '@/constants/wardrobeLabels';
import { useApp } from '@/contexts/AppContext';
import { AiProcessingConsent } from '@/components/AiProcessingConsent';
import { authenticatedApiRequest } from '@/lib/query-client';
import { getAiProcessingPreference, setAiProcessingPreference } from '@/lib/aiProcessingPreference';
import { constructMultiItemDraft, type B3RelationshipType, type B3WardrobeFields, type MultiItemClassificationResult } from '@/lib/multiItemConstruction';
import { runSaveAll, type BulkItemCore, type ClassifyResult } from '@/lib/bulkClassifyCore';
import { resolveWardrobeUploadArg } from '@/lib/uploadArg';
import { uploadWardrobeImage, deleteWardrobeImage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

type Piece = BulkItemCore & { detectionId: string; classification: ClassifyResult; fields: B3WardrobeFields };
const RELATIONSHIPS: { type: B3RelationshipType; label: string }[] = [
  { type: 'coordinated_set', label: 'Matching set' },
  { type: 'multi_item', label: 'Separate pieces' },
  { type: 'layered', label: 'Layered outfit' },
];

export default function MultiItemReview() {
  const { uri } = useLocalSearchParams<{ uri: string }>();
  const { addWardrobeGroupItems } = useApp();
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [relationship, setRelationship] = useState<B3RelationshipType>('multi_item');
  const [inferredRelationship, setInferredRelationship] = useState<B3RelationshipType>('multi_item');
  const [relationshipConfidence, setRelationshipConfidence] = useState<number | undefined>();
  const [sharedAttributes, setSharedAttributes] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<'checking' | 'consent' | 'paused' | 'loading' | 'review' | 'error'>('checking');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);
  const started = useRef(false);
  const savingRef = useRef(false);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    void getAiProcessingPreference().then(preference => {
      if (!mounted.current) return;
      setPhase(preference === 'allowed' ? 'loading' : preference === 'not_asked' ? 'consent' : 'paused');
    }).catch(() => { if (mounted.current) { setError('AI preference could not be checked. No photo was sent.'); setPhase('paused'); } });
  }, []);

  useEffect(() => {
    if (phase !== 'loading' || started.current || !uri) return;
    started.current = true;
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Sign in to save a group of garments.');
        const image = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1024 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true });
        if (!image.base64) throw new Error('This photo could not be read.');
        const response = await authenticatedApiRequest('POST', '/api/classify-garments', { imageBase64: image.base64 });
        const draft = constructMultiItemDraft(await response.json() as MultiItemClassificationResult);
        const cropped = await Promise.all(draft.items.map(async item => {
          const r = item.source.region;
          const originX = Math.min(image.width - 1, Math.round(r.x * image.width));
          const originY = Math.min(image.height - 1, Math.round(r.y * image.height));
          const width = Math.min(image.width - originX, Math.max(1, Math.round(r.width * image.width)));
          const height = Math.min(image.height - originY, Math.max(1, Math.round(r.height * image.height)));
          const crop = await ImageManipulator.manipulateAsync(image.uri,
            [{ crop: { originX, originY, width, height } }],
            { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG });
          return { detectionId: item.detectionId, uri: crop.uri, status: 'settled', fields: item.wardrobeFields,
            classification: item.wardrobeFields as ClassifyResult };
        }));
        if (!mounted.current) return;
        setPieces(cropped);
        setSelected(cropped.map(item => item.detectionId));
        setRelationship(draft.group.relationshipType);
        setInferredRelationship(draft.group.relationshipType);
        setRelationshipConfidence(draft.group.relationshipConfidence);
        setSharedAttributes(draft.group.sharedAttributes);
        setPhase('review');
      } catch {
        if (mounted.current) {
          setError('Could not identify 2–6 separate garments in this photo. Try another photo or use the single-item flow.');
          setPhase('error');
        }
      }
    })();
  }, [phase, uri]);

  const confirmSave = () => {
    if (savingRef.current || selected.length < 2) return;
    const selectedPieces = pieces.filter(item => selected.includes(item.detectionId));
    const label = RELATIONSHIPS.find(option => option.type === relationship)?.label ?? relationship;
    Alert.alert('Confirm detected pieces', `Save these ${selectedPieces.length} independently wearable garments as: ${label}?`,
      [{ text: 'Keep reviewing', style: 'cancel' }, { text: 'Confirm and save', onPress: () => { void save(selectedPieces); } }]);
  };

  const save = async (selectedPieces: Piece[]) => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      await runSaveAll(selectedPieces.map(item => ({ uri: item.uri, classification: item.classification })), mounted, {
        generateId: () => Crypto.randomUUID(),
        getSession: async () => {
          const userId = (await supabase.auth.getSession()).data.session?.user.id;
          if (!userId) throw new Error('Sign in to save a group of garments.');
          return userId;
        },
        resize: async photo => ImageManipulator.manipulateAsync(photo, [],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }),
        upload: async (userId, base64, id, mimeType) =>
          (await uploadWardrobeImage(userId, base64, id, mimeType as 'image/jpeg' | 'image/png')).signedUrl,
        deleteUploaded: deleteWardrobeImage,
        resolveUploadArg: resolveWardrobeUploadArg,
        addItems: payloads => addWardrobeGroupItems(payloads.map(({ id, photoUri, storagePath }, index) => ({
            ...selectedPieces[index].fields, id, photoUri, storagePath,
          })), {
          relationshipType: relationship,
          relationshipConfidence: relationship === inferredRelationship && selectedPieces.length === pieces.length
            ? relationshipConfidence : undefined,
          sharedAttributes: selectedPieces.length === pieces.length ? sharedAttributes : {},
        }),
        setItems: update => setPieces(prev => update(prev) as Piece[]),
        setSaving,
        onItemHaptic: () => {},
        onSaveError: () => Alert.alert('Save failed', 'Nothing was added. Review the pieces and try again.'),
        onLocalOnlyComplete: () => Alert.alert('Upload pending', 'No pieces were saved. Sign in and retry when upload is available.'),
        onDoneHaptic: () => {},
        navigate: () => router.replace('/(tabs)/wardrobe'),
      });
    } finally {
      savingRef.current = false;
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Review pieces</Text>
        <Text style={styles.help}>Confirm each independently wearable piece and how they relate before saving. Only the selected pieces will be added.</Text>
        {(phase === 'checking' || phase === 'loading') && <ActivityIndicator color={Colors.sage} />}
        {phase === 'paused' && (
          <>
            <Text style={styles.help}>{error || 'AI processing is paused. This photo has not been sent.'}</Text>
            <Pressable style={styles.button} onPress={() => setPhase('consent')}><Text style={styles.buttonText}>Use AI for this photo</Text></Pressable>
          </>
        )}
        {phase === 'error' && (
          <>
            <Text style={styles.help}>{error}</Text>
            <Pressable style={styles.button} onPress={() => router.back()}><Text style={styles.buttonText}>Return to Add Item</Text></Pressable>
          </>
        )}
        {phase === 'review' && (
          <>
            {pieces.map(piece => (
              <Pressable key={piece.detectionId}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected.includes(piece.detectionId) }}
                onPress={() => setSelected(ids => ids.includes(piece.detectionId)
                  ? ids.filter(id => id !== piece.detectionId) : [...ids, piece.detectionId])}
                style={styles.piece}>
                <Image source={{ uri: piece.uri }} style={styles.photo} contentFit="cover" />
                <View style={styles.details}>
                  <Text style={styles.name}>{piece.classification.description}</Text>
                  <Text style={styles.help}>{wardrobeCategoryLabel(piece.classification.category, piece.classification.subType)} · {piece.classification.subType === 'stole' ? 'Stole' : piece.classification.subType}</Text>
                </View>
                <Text style={styles.name}>{selected.includes(piece.detectionId) ? '✓' : '○'}</Text>
              </Pressable>
            ))}
            <Text style={styles.heading}>Relationship</Text>
            {RELATIONSHIPS.map(option => (
              <Pressable key={option.type} accessibilityRole="radio" accessibilityState={{ checked: relationship === option.type }}
                onPress={() => setRelationship(option.type)} style={styles.option}>
                <Text style={styles.name}>{relationship === option.type ? '◉' : '○'} {option.label}</Text>
              </Pressable>
            ))}
            <Pressable disabled={selected.length < 2 || saving} onPress={confirmSave}
              style={[styles.button, (selected.length < 2 || saving) && styles.disabled]}>
              <Text style={styles.buttonText}>{saving ? 'Saving…' : `Confirm ${selected.length} pieces and save`}</Text>
            </Pressable>
            {selected.length < 2 && <Text style={styles.help}>A group needs at least two confirmed garments. Use Add Item for a single piece.</Text>}
          </>
        )}
      </ScrollView>
      <AiProcessingConsent visible={phase === 'consent'} onCancel={() => setPhase('paused')}
        onAllow={() => { void setAiProcessingPreference('allowed')
          .then(() => { if (mounted.current) setPhase('loading'); })
          .catch(() => { if (mounted.current) { setError('AI preference could not be saved. No photo was sent.'); setPhase('paused'); } }); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingTop: 52, paddingBottom: 48 },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },
  heading: { marginTop: 20, marginBottom: 8, fontSize: 18, fontWeight: '600', color: Colors.textPrimary },
  help: { color: Colors.textSecondary, lineHeight: 20, marginTop: 6 },
  piece: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, marginTop: 12, backgroundColor: Colors.white },
  photo: { width: 72, height: 72, borderRadius: 8 },
  details: { flex: 1 },
  name: { color: Colors.textPrimary, fontWeight: '600' },
  option: { padding: 14, marginTop: 6, borderRadius: 12, backgroundColor: Colors.white },
  button: { marginTop: 24, padding: 16, borderRadius: 12, alignItems: 'center', backgroundColor: Colors.sage },
  buttonText: { color: Colors.white, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});