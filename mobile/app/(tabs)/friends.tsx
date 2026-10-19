import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api, explain } from '../../src/api';
import { useSocketEvent } from '../../src/session';
import { UserSummary } from '../../src/types';
import { Avatar, Body, Button, Card, Dim, Empty, Field, H1, Screen, colors } from '../../src/ui';

type Friend = UserSummary & { online: boolean };
type Req = { id: string; user: UserSummary };

export default function Friends() {
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<Req[]>([]);
  const [outgoing, setOutgoing] = useState<Req[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [f, r] = await Promise.all([api<Friend[]>('/friends').catch(() => null), api<{ incoming: Req[]; outgoing: Req[] }>('/friends/requests').catch(() => null)]);
    if (f) setFriends(f);
    if (r) { setIncoming(r.incoming); setOutgoing(r.outgoing); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useSocketEvent('friend:request', load);
  useSocketEvent('friend:accepted', load);
  useSocketEvent<{ friendId?: string; userId?: string }>('friend:online', load);
  useSocketEvent('friend:offline', load);

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
  const remove = (f: Friend) => Alert.alert('Remove friend', `Remove ${f.displayName}?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => api(`/friends/${f.id}`, { method: 'DELETE' }).then(load).catch((e) => Alert.alert('Friends', explain(e))) },
  ]);

  const looksLikeCode = /^[A-Za-z0-9]{8}$/.test(q.trim());

  return (
    <Screen>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.text} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
        <H1>Friends</H1>
        <Field label="" placeholder="Find by username or friend code" value={q} onChangeText={search} />
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

        <Body style={{ fontWeight: '800', marginTop: 12, marginBottom: 8 }}>Your friends ({friends.length})</Body>
        {friends.length === 0 ? <Empty text="No friends yet. Search for a username above or share your friend code from the Me tab." /> : null}
        {friends.map((f) => (
          <Card key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Avatar name={f.displayName} online={f.online} />
            <View style={{ flex: 1 }}><Body style={{ fontWeight: '700' }}>{f.displayName}</Body><Dim>{f.online ? 'Online' : 'Offline'}</Dim></View>
            <Button title="Invite" kind="ghost" onPress={() => invite(f)} style={{ minHeight: 40 }} />
            <Text onPress={() => remove(f)} style={{ color: colors.dim, fontSize: 22, paddingHorizontal: 6 }}>⋯</Text>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
