import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api, explain } from '../../src/api';
import { titleText } from '../../src/cosmetics';
import { GAME_INFO } from '../../src/games';
import { callFriend } from '../../src/Voice';
import { PlayerProfile } from '../../src/types';
import { Avatar, Body, Button, Card, Dim, H1, Screen, colors } from '../../src/ui';

export default function Player() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<PlayerProfile | null>(null);
  const [gone, setGone] = useState(false);

  const load = useCallback(() => { api<PlayerProfile>(`/players/${id}`).then(setP).catch(() => setGone(true)); }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (gone) return <Screen><View style={{ flex: 1, justifyContent: 'center', gap: 12 }}><Body>This player could not be found.</Body><Button title="Back" onPress={() => router.back()} /></View></Screen>;
  if (!p) return <Screen><View style={{ flex: 1 }} /></Screen>;

  const add = async () => {
    try { await api('/friends/requests', { method: 'POST', body: { username: p.username } }); Alert.alert('Request sent', `Waiting for ${p.displayName} to accept.`); load(); }
    catch (e) { Alert.alert('Add friend', explain(e)); }
  };
  const invite = async () => {
    try {
      if (!(await api('/rooms/current').catch(() => null))) { Alert.alert('Start a game first', 'Create a room from the Play tab, then invite them.'); return; }
      await api('/rooms/current/invite', { method: 'POST', body: { userId: p.id } });
      Alert.alert('Invite sent', `${p.displayName} was invited.`); router.push('/room');
    } catch (e) { Alert.alert('Invite', explain(e)); }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Text onPress={() => router.back()} style={{ color: colors.accent, fontWeight: '800', paddingVertical: 12 }}>‹ Back</Text>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Avatar name={p.displayName} size={88} online={p.online} frame={p.frame} />
          <H1>{p.displayName}</H1>
          {titleText(p.title) ? <Text style={{ color: colors.gold, fontWeight: '800' }}>{titleText(p.title)}</Text> : null}
          <Dim>@{p.username} · joined {new Date(p.joined).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</Dim>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
          {[['Games', p.totals.played], ['Wins', p.totals.won], ['Win rate', `${p.totals.winRate}%`]].map(([label, v]) => (
            <Card key={String(label)} style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}><Text style={{ color: colors.text, fontSize: 24, fontWeight: '900' }}>{v}</Text><Dim>{label}</Dim></Card>
          ))}
        </View>

        <Card style={{ marginTop: 12, gap: 10 }}>
          {p.games.filter((g) => g.game !== 'WATER_SORT').map((g) => (
            <View key={g.game} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Body style={{ flex: 1 }}>{GAME_INFO[g.game].emoji} {GAME_INFO[g.game].title}</Body>
              <Dim>{g.won} won · {g.lost} lost{g.drawn ? ` · ${g.drawn} draw` : ''}</Dim>
            </View>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Body style={{ flex: 1 }}>{GAME_INFO.WATER_SORT.emoji} {GAME_INFO.WATER_SORT.title}</Body>
            <Dim>{p.waterSortLevel > 0 ? `Level ${p.waterSortLevel} reached` : 'Not started'}</Dim>
          </View>
        </Card>

        <View style={{ gap: 10, marginTop: 18 }}>
          {p.relation === 'none' ? <Button title="Add friend" onPress={add} /> : null}
          {p.relation === 'sent' ? <Button title="Request sent" kind="ghost" disabled onPress={() => undefined} /> : null}
          {p.relation === 'received' ? <Button title="Answer their request in Friends" kind="ghost" onPress={() => router.replace('/(tabs)/friends')} /> : null}
          {p.relation === 'friend' ? (
            <>
              <Button title="💬 Message" onPress={() => router.push({ pathname: '/chat/[userId]', params: { userId: p.id, name: p.displayName } })} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Invite to play" kind="ghost" onPress={invite} style={{ flex: 1 }} />
                <Button title="📞 Call" kind="ghost" disabled={!p.online} onPress={() => void callFriend(p.id)} style={{ flex: 1 }} />
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
