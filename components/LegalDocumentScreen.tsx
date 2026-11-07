import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetch } from 'expo/fetch';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { COMPLIANCE_DOCUMENT_META } from '@/constants/complianceDocumentMeta';
import { getApiUrl } from '@/lib/query-client';

type DocumentSlug = 'privacy-policy' | 'terms-of-service';

type DocumentResponse = {
  title: string;
  content: string;
};

type Block =
  | { kind: 'heading'; text: string; level: number }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] };

function parseMarkdown(content: string): Block[] {
  const lines = content.split(/\r?\n/);
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ kind: 'list', items: list });
    list = [];
  };

  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const bullet = /^-\s+(.+)$/.exec(line);
    if (!line.trim() || line.startsWith('<!--')) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'heading', text: heading[2], level: heading[1].length });
    } else if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

export function LegalDocumentScreen({ slug }: { slug: DocumentSlug }) {
  const [document, setDocument] = useState<DocumentResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const url = new URL(`/legal/${slug}`, getApiUrl()).toString();
        const response = await fetch(url, { credentials: 'omit' });
        if (!response.ok) throw new Error('Document unavailable');
        const result = await response.json() as DocumentResponse;
        if (active) setDocument(result);
      } catch {
        if (active) setError(true);
      }
    })();
    return () => { active = false; };
  }, [slug]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()}>
          <Text style={styles.back}>‹  Back</Text>
        </Pressable>
        <Text style={styles.pageTitle}>{document?.title ?? 'Amodka documents'}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View accessibilityRole="alert" style={styles.draftBanner}>
          <Text style={styles.draftText}>DRAFT: for legal review</Text>
        </View>
        <Text style={styles.meta}>Version {COMPLIANCE_DOCUMENT_META.version}</Text>
        <Text style={styles.meta}>Effective date: {COMPLIANCE_DOCUMENT_META.effectiveDate}</Text>
        <Text style={styles.changeLog}>Change log: {COMPLIANCE_DOCUMENT_META.changeLog}</Text>
        {document ? parseMarkdown(document.content).map((block, index) => {
          if (block.kind === 'heading') {
            return <Text key={index} accessibilityRole="header" style={[styles.heading, block.level === 1 && styles.mainHeading]}>{block.text}</Text>;
          }
          if (block.kind === 'list') {
            return (
              <View key={index} style={styles.list}>
                {block.items.map((item, itemIndex) => (
                  <Text key={itemIndex} style={styles.body}>•  {item}</Text>
                ))}
              </View>
            );
          }
          return <Text key={index} style={styles.body}>{block.text}</Text>;
        }) : error
          ? <Text accessibilityRole="alert" style={styles.body}>This document could not be loaded. Check your connection and try again.</Text>
          : <ActivityIndicator accessibilityLabel="Loading document" color={Colors.primary} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  back: { color: Colors.primary, fontFamily: 'Inter_500Medium', fontSize: 14, paddingVertical: 8 },
  pageTitle: { color: Colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 23, marginTop: 8 },
  content: { padding: 22, paddingBottom: 48, gap: 12 },
  draftBanner: { borderWidth: 1, borderColor: Colors.secondary, backgroundColor: '#FBF7EF', borderRadius: 12, padding: 12 },
  draftText: { color: Colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  meta: { color: Colors.textSecondary, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  changeLog: { color: Colors.textSecondary, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginBottom: 8 },
  heading: { color: Colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 18, marginTop: 14 },
  mainHeading: { fontSize: 25, marginTop: 0 },
  body: { color: Colors.primary, fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 23 },
  list: { gap: 8, paddingLeft: 4 },
});
