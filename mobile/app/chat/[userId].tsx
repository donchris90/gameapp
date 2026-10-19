import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { api, explain } from '../../src/api';
import { useSession, useSocketEvent } from '../../src/session';
import { ChatMessage, UserSummary } from '../../src/types';
import { Avatar, Body, Dim, Screen, colors } from '../../src/ui';

const MAX = 500;
const REASONS = ['Insults or harassment', 'Spam or scams', 'Inappropriate content', 'Something else'];

export default function Chat() {
  const { userId, name } = useLocalSearchParams<{ userId: string; name?: string }>();
  const router = useRouter();
  const { user, refreshChatUnread } = useSession();
  const [friend, setFriend] = useState<UserSummary | null>(name ? { id: userId, username: '', displayName: name } : null);
  const [items, setItems] = useState<ChatMessage[]>([]); // newest first, as the inverted list wants
  const [older, setOlder] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const loading = useRef(false);

  const markRead = useCallback(() => {
    api(`/chat/with/${userId}/read`, { method: 'POST' }).then(() => refreshChatUnread()).catch(() => undefined);
  }, [userId, refreshChatUnread]);

  useEffect(() => {
    let live = true;
    api<{ messages: ChatMessage[]; nextBefore: string | null }>(`/chat/with/${userId}?limit=30`)
      .then((r) => { if (!live) return; setItems([...r.messages].reverse()); setOlder(r.nextBefore); markRead(); })
      .catch((e) => setProblem(explain(e)));
    if (!friend) api<Array<UserSummary>>('/friends').then((l) => { const f = l.find((x) => x.id === userId); if (live && f) setFriend(f); }).catch(() => undefined);
    return () => { live = false; };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useSocketEvent<ChatMessage>('chat:message', (m) => {
    if (m.from !== userId && m.to !== userId) return;
    setItems((cur) => (cur.some((x) => x.id === m.id) ? cur : [m, ...cur]));
    if (m.from === userId) markRead();
  });

  const loadOlder = async () => {
    if (!older || loading.current) return;
    loading.current = true;
    try {
      const r = await api<{ messages: ChatMessage[]; nextBefore: string | null }>(`/chat/with/${userId}?limit=30&before=${older}`);
      setItems((cur) => [...cur, ...[...r.messages].reverse().filter((m) => !cur.some((x) => x.id === m.id))]);
      setOlder(r.nextBefore);
    } catch { /* try again on the next scroll */ } finally { loading.current = false; }
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const m = await api<ChatMessage>(`/chat/with/${userId}`, { method: 'POST', body: { body } });
      setItems((cur) => (cur.some((x) => x.id === m.id) ? cur : [m, ...cur]));
      setText('');
    } catch (e) { Alert.alert('Message not sent', explain(e)); } finally { setSending(false); }
  };

  const report = (m: ChatMessage, alsoBlock: boolean) => {
    const choose = (reason: string) => api('/chat/report', { method: 'POST', body: { messageId: m.id, reason } })
      .then(() => (alsoBlock ? api(`/blocks/${userId}`, { method: 'POST' }).then(() => router.back()) : undefined))
      .then(() => Alert.alert('Thank you', alsoBlock ? 'Reported and blocked.' : 'We will look at it.'))
      .catch((e) => Alert.alert('Report', explain(e)));
    Alert.alert('Why are you reporting this?', undefined, [...REASONS.map((r) => ({ text: r, onPress: () => void choose(r) })), { text: 'Cancel', style: 'cancel' as const }]);
  };
  const messageMenu = (m: ChatMessage) => {
    if (m.from === user?.id) return;
    Alert.alert('Message', m.body.length > 80 ? `${m.body.slice(0, 77)}...` : m.body, [
      { text: 'Report', onPress: () => report(m, false) },
      { text: 'Report and block', style: 'destructive', onPress: () => report(m, true) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
          <Text onPress={() => router.back()} style={{ color: colors.accent, fontWeight: '700', fontSize: 16 }}>‹ Back</Text>
          {friend ? <Avatar name={friend.displayName} size={36} /> : null}
          <Body style={{ fontWeight: '800', flex: 1 }} >{friend?.displayName ?? 'Chat'}</Body>
        </View>

        {problem ? <View style={{ flex: 1, justifyContent: 'center' }}><Dim style={{ textAlign: 'center' }}>{problem}</Dim></View> : (
          <FlatList
            style={{ flex: 1 }} inverted data={items} keyExtractor={(m) => m.id}
            onEndReached={loadOlder} onEndReachedThreshold={0.4} keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<View style={{ transform: [{ scaleY: -1 }], paddingTop: 40 }}><Dim style={{ textAlign: 'center' }}>Say hi 👋</Dim></View>}
            renderItem={({ item }) => {
              const mine = item.from === user?.id;
              return (
                <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginVertical: 3 }}>
                  <Pressable onLongPress={() => messageMenu(item)} delayLongPress={350} style={{ maxWidth: '82%', backgroundColor: mine ? colors.accent : colors.card, borderRadius: 16, borderBottomRightRadius: mine ? 4 : 16, borderBottomLeftRadius: mine ? 16 : 4, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={{ color: mine ? colors.accentText : colors.text, fontSize: 16 }}>{item.body}</Text>
                    <Text style={{ color: mine ? 'rgba(255,255,255,0.7)' : colors.dim, fontSize: 10, alignSelf: 'flex-end', marginTop: 2 }}>
                      {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{mine && item.readAt ? '  ✓✓' : ''}
                    </Text>
                  </Pressable>
                </View>
              );
            }}
          />
        )}

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', paddingVertical: 10 }}>
          <TextInput
            value={text} onChangeText={setText} placeholder="Message" placeholderTextColor={colors.dim} multiline maxLength={MAX}
            style={{ flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: colors.card, color: colors.text, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16 }}
          />
          <Pressable onPress={send} disabled={!text.trim() || sending} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() ? colors.accent : colors.card, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.accentText, fontSize: 18, fontWeight: '900' }}>➤</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
