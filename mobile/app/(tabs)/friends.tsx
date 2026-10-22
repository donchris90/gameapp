import { AdBanner } from '../../src/AdBanner';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api, explain } from '../../src/api';
import { useSocketEvent } from '../../src/session';
import { callFriend } from '../../src/Voice';
import { GAME_INFO } from '../../src/games';
import { Activity, Conversation, UserSummary } from '../../src/types';
import { Avatar, Body, Button, Card, Dim, Empty, Field, H1, Screen, colors } from '../../src/ui';

type Friend = UserSummary & { online: boolean; activity: Activity };
type Req = { id: string; user: UserSummary };

export default function Friends() {
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<Req[]>([]);
  const [outgoing, setOutgoing] = useState<Req[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [talks, setTalks] = useState<Record<string, Conversation>>({});

  const load = useCallback(async () => {
    const [f, r, c] = await Promise.all([
      api<Friend[]>('/friends').catch(() => null), api<{ incoming: Req[]; outgoing: Req[] }>('/friends/requests').catch(() => null),
      api<Conversation[]>('/chat/conversations').catch(() => null),
    ]);
    if (f) setFriends(f);
    if (c) setTalks(Object.fromEntries(c.map((x) => [x.user.id, x])));
    if (r) { setIncoming(r.incoming); setOutgoing(r.outgoing); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useSocketEvent('friend:request', load);
  useSocketEvent('friend:accepted', load);
  useSocketEvent<{ friendId?: string; userId?: string }>('friend:online', load);
  useSocketEvent('friend:offline', load);
  useSocketEvent('room:update', load);
  useSocketEvent('match:started', load);
  useSocketEvent('match:ended', load);
  useSocketEvent('chat:message', load);

  const search = async (text: string) => {
    setQ(text);
    if (text.trim().length < 3) { setResults([]); return; }
    try { setResults(await api<UserSummary[]>(`/friends/search?q=${encodeURIComponent(text.trim())}`)); } catch { setResults([]); }
  };
  const add = async (u: UserSummary) => {
    try { await api('/friends/requests', { method: 'POST', body: { username: u.username } }); Alert.alert('Request sent', `Waiting for ${u.displayName} to accept.`); setQ(''); setResults([]); await load(); }
    catch (e) { Alert.alert('Add friend', explain(e)); }
  };
  const addByCode = async () => {
    try { await api('/friends/requests', { method: 'POST', body: { friendCode: q.trim() } }); Alert.alert('Request sent', 'Waiting for them to accept.'); setQ(''); await load(); }
    catch (e) { Alert.alert('Add friend', explain(e)); }
  };
  const respond = async (r: Req, accept: boolean) => {
    try { await api(accept ? `/friends/requests/${r.id}/accept` : `/friends/requests/${r.id}`, { method: accept ? 'POST' : 'DELETE' }); await load(); }
    catch (e) { Alert.alert('Friends', explain(e)); }
  };
  const invite = async (f: Friend) => {
    try {
      const room = await api('/rooms/current').catch(() => null);
      if (!room) { Alert.alert('Start a game first', 'Create a room from the Play tab, then invite your friends.'); return; }
      await api('/rooms/current/invite', { method: 'POST', body: { userId: f.id } });
      Alert.alert('Invite sent', `${f.displayName} was invited.`);
      router.push('/room');
    } catch (e) { Alert.alert('Invite', explain(e)); }
  };
  const join = async (code: string) => {
    try { await api('/rooms/join', { method: 'POST', body: { code } }); router.push('/room'); }
    catch (e) { Alert.alert('Join game', explain(e)); }
  };
  const doing = (f: Friend) => {
    const a = f.activity;
    if (a.state === 'playing') return `Playing ${GAME_INFO[a.game].title}`;
    if (a.state === 'lobby') return `In a ${GAME_INFO[a.game].title} room${a.stake ? ` · ${a.stake} coins` : ''}`;
    return f.online ? 'Online' : 'Offline';
  };
  const remove = (f: Friend) => Alert.alert('Remove friend', `Remove ${f.displayName}?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => api(`/friends/${f.id}`, { method: 'DELETE' }).then(load).catch((e) => Alert.alert('Friends', explain(e))) },
  ]);

  const looksLikeCode = /^[A-Za-z0-9]{8}$/.test(q.trim());

  return (
    <Screen>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.text} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ borderRadius: 24, padding: 20, marginBottom: 16, backgroundColor: '#30235D', gap: 8, overflow: 'hidden' }}>
          <Text style={{ color: '#CFC4FF', fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>YOUR SOCIAL CIRCLE</Text>
          <H1>Friends</H1>
          <Text style={{ color: '#E2DDF8', fontSize: 13, lineHeight: 19 }}>Find your people, catch up in chat, and jump into a game together.</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <View style={{ flex: 1, borderRadius: 14, padding: 12, backgroundColor: 'rgba(255,255,255,.10)' }}>
              <Text style={{ color: '#fff', fontSize: 23, fontWeight: '900' }}>{friends.length}</Text>
              <Text style={{ color: '#DCD6F7', fontSize: 11 }}>Friends</Text>
            </View>
            <View style={{ flex: 1, borderRadius: 14, padding: 12, backgroundColor: 'rgba(255,255,255,.10)' }}>
              <Text style={{ color: '#fff', fontSize: 23, fontWeight: '900' }}>{friends.filter((f) => f.online).length}</Text>
              <Text style={{ color: '#DCD6F7', fontSize: 11 }}>Online now</Text>
            </View>
            <Pressable onPress={() => router.push('/leaderboard')} style={{ flex: 1, borderRadius: 14, padding: 12, backgroundColor: 'rgba(255,255,255,.10)', justifyContent: 'center' }}>
              <Text style={{ fontSize: 22 }}>🏆</Text><Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>Rankings</Text>
            </Pressable>
          </View>
        </View>
        <Body style={{ fontWeight: '900', fontSize: 17, marginBottom: 8 }}>Discover people</Body>
        <Field label="" placeholder="Search username or enter friend code" value={q} onChangeText={search} />
        {looksLikeCode ? <Button title="Add by friend code" kind="ghost" onPress={addByCode} style={{ marginBottom: 12 }} /> : null}
        {results.map((u) => (
          <Card key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Avatar name={u.displayName} />
            <View style={{ flex: 1 }}><Body style={{ fontWeight: '700' }}>{u.displayName}</Body><Dim>@{u.username}</Dim></View>
            <Button title="Add" onPress={() => add(u)} style={{ minHeight: 40 }} />
          </Card>
        ))}

        {incoming.length > 0 ? <Body style={{ fontWeight: '800', marginTop: 12, marginBottom: 8 }}>Requests</Body> : null}
        {incoming.map((r) => (
          <Card key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Avatar name={r.user.displayName} />
            <View style={{ flex: 1 }}><Body style={{ fontWeight: '700' }}>{r.user.displayName}</Body><Dim>wants to be friends</Dim></View>
            <Button title="Accept" onPress={() => respond(r, true)} style={{ minHeight: 40 }} />
            <Button title="✕" kind="ghost" onPress={() => respond(r, false)} style={{ minHeight: 40, paddingHorizontal: 12 }} />
          </Card>
        ))}
        {outgoing.length > 0 ? <Dim style={{ marginVertical: 6 }}>Waiting for: {outgoing.map((r) => r.user.displayName).join(', ')}</Dim> : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 8 }}>
          <Body style={{ fontWeight: '900', fontSize: 17 }}>Your friends</Body>
          <Dim>{friends.length} total · {friends.filter((f) => f.online).length} online</Dim>
        </View>
        {friends.length === 0 ? <Empty text="No friends yet. Search for a username above or share your friend code from the Me tab." /> : null}
        {friends.map((f) => (
          <Card key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Pressable onPress={() => router.push({ pathname: '/player/[id]', params: { id: f.id } })}><Avatar name={f.displayName} online={f.online} /></Pressable>
            <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: '/player/[id]', params: { id: f.id } })}>
              <Body style={{ fontWeight: '700' }}>{f.displayName}</Body>
              <Dim numberOfLines={1} style={{ color: f.activity.state === 'lobby' || f.activity.state === 'playing' ? colors.gold : colors.dim }}>{doing(f)}</Dim>
              {talks[f.id] && talks[f.id].unread > 0 ? <Dim numberOfLines={1} style={{ color: colors.text }}>{talks[f.id].last.mine ? 'You: ' : ''}{talks[f.id].last.body}</Dim> : null}
            </Pressable>
            <Pressable onPress={() => router.push({ pathname: '/chat/[userId]', params: { userId: f.id, name: f.displayName } })} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
              <Text style={{ fontSize: 24 }}>💬</Text>
              {talks[f.id]?.unread > 0 ? <View style={{ position: 'absolute', top: 0, right: 0, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.bad, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{talks[f.id].unread}</Text></View> : null}
            </Pressable>
            {f.activity.state === 'lobby' && f.activity.joinable
              ? <Button title="Join" onPress={() => join((f.activity as Extract<Activity, { state: 'lobby' }>).code)} style={{ minHeight: 40 }} />
              : <Button title="Invite" kind="ghost" onPress={() => invite(f)} style={{ minHeight: 40 }} />}
            {f.online ? <Pressable onPress={() => void callFriend(f.id)} hitSlop={6}><Text style={{ fontSize: 22 }}>📞</Text></Pressable> : null}
            <Text onPress={() => remove(f)} style={{ color: colors.dim, fontSize: 22, paddingHorizontal: 6 }}>⋯</Text>
          </Card>
        ))}
      </ScrollView>
      <AdBanner />
    </Screen>
  );
}
