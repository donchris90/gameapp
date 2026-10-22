import { AdBanner } from '../../src/AdBanner';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api, explain } from '../../src/api';
import { useSession } from '../../src/session';
import { Avatar, Body, Button, Dim, Field, H1, Screen, colors } from '../../src/ui';

type Post = { id: string; body: string; createdAt: string; author: { id: string; username: string; displayName: string; equippedFrame?: string | null; equippedTitle?: string | null } };

export default function Community() {
  const router = useRouter();
  const { user } = useSession();
  const [posts, setPosts] = useState<Post[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try { const result = await api<{ posts: Post[] }>('/community/posts'); setPosts(result.posts); }
    catch (e) { Alert.alert('Community', explain(e)); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const publish = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const result = await api<{ post: Post }>('/community/posts', { method: 'POST', body: { body } });
      setPosts((current) => [result.post, ...current.filter((p) => p.id !== result.post.id)]);
      setDraft('');
    } catch (e) { Alert.alert('Could not broadcast', explain(e)); }
    finally { setSending(false); }
  };

  return <Screen>
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={loading} tintColor={colors.text} onRefresh={async () => { setLoading(true); await load(); setLoading(false); }} />}
      contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={{ marginTop: 10, marginBottom: 18 }}>
        <Text style={{ color: colors.accent, fontWeight: '900', fontSize: 11, letterSpacing: 2 }}>GAMEVERSE SOCIAL</Text>
        <H1>Community</H1>
        <Dim>Share updates, find teammates, and let the community know you’re ready to play.</Dim>
      </View>

      <View style={{ borderRadius: 22, padding: 16, backgroundColor: '#20194A', borderWidth: 1, borderColor: '#4C3C94', marginBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Avatar name={user?.displayName ?? 'You'} size={44} />
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '900' }}>Broadcast to everyone</Body>
            <Dim style={{ fontSize: 12 }}>Keep it friendly. Maximum 500 characters.</Dim>
          </View>
        </View>
        <Field label="" value={draft} onChangeText={setDraft} multiline maxLength={500} placeholder="Looking for Ludo players, who’s online? 🎮" style={{ minHeight: 94, textAlignVertical: 'top', paddingTop: 12 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: colors.dim, fontSize: 12, flex: 1 }}>{draft.length}/500</Text>
          <Button title="📣 Broadcast" onPress={() => void publish()} busy={sending} disabled={!draft.trim() || draft.trim().length > 500} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Body style={{ fontSize: 18, fontWeight: '900' }}>Community feed</Body>
        <Pressable onPress={() => router.push('/friends')}><Text style={{ color: colors.accent, fontWeight: '800' }}>Find players →</Text></Pressable>
      </View>
      {!posts.length ? <View style={{ padding: 24, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 34 }}>📣</Text>
        <Body style={{ fontWeight: '900' }}>Be the first to say hello</Body>
        <Dim style={{ textAlign: 'center' }}>Your broadcast will appear here for other players to discover.</Dim>
      </View> : posts.map((post) => (
        <View key={post.id} style={{ padding: 14, marginBottom: 10, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable onPress={() => router.push({ pathname: '/player/[id]', params: { id: post.author.id } })}><Avatar name={post.author.displayName} size={42} frame={post.author.equippedFrame} /></Pressable>
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: '900' }}>{post.author.displayName}</Body>
              <Dim style={{ fontSize: 12 }}>@{post.author.username} · {new Date(post.createdAt).toLocaleString()}</Dim>
            </View>
          </View>
          <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>{post.body}</Text>
          <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, flexDirection: 'row', gap: 18 }}>
            <Pressable onPress={() => router.push({ pathname: '/player/[id]', params: { id: post.author.id } })}><Text style={{ color: colors.dim, fontWeight: '700' }}>View player</Text></Pressable>
            <Pressable onPress={() => router.push('/friends')}><Text style={{ color: colors.accent, fontWeight: '800' }}>Find friends</Text></Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
    <AdBanner />
  </Screen>;
}
