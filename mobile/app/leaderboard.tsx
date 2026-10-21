import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../src/api';
import { titleText } from '../src/cosmetics';
import { GAME_INFO } from '../src/games';
import { useSession } from '../src/session';
import { GameType, LeaderRow, Leaderboard } from '../src/types';
import { Avatar, Body, Card, Chip, Dim, Empty, H1, Screen, colors } from '../src/ui';

const GAMES: GameType[] = ['TICTACTOE', 'AYO', 'LUDO', 'WHOT', 'APEX', 'WATER_SORT'];
const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : String(r));

export default function LeaderboardScreen() {
  const router = useRouter();
  const { user } = useSession();
  const [period, setPeriod] = useState<'week' | 'all'>('week');
  const [game, setGame] = useState<GameType | null>(null);
  const [data, setData] = useState<Leaderboard | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setData(null); setFailed(false);
    api<Leaderboard>(`/leaderboard?period=${period}${game ? `&game=${game}` : ''}`).then(setData).catch(() => setFailed(true));
  }, [period, game]);
  useEffect(() => { load(); }, [load]);

  const row = ({ item }: { item: LeaderRow }) => (
    <Pressable onPress={() => router.push({ pathname: '/player/[id]', params: { id: item.userId } })}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, paddingVertical: 10, borderColor: item.userId === user?.id ? colors.accent : colors.line }}>
        <Text style={{ width: 34, textAlign: 'center', color: colors.text, fontWeight: '900', fontSize: item.rank <= 3 ? 22 : 16 }}>{medal(item.rank)}</Text>
        <Avatar name={item.displayName} size={38} frame={item.frame} />
        <View style={{ flex: 1 }}>
          <Body style={{ fontWeight: '700' }}>{item.displayName}{item.userId === user?.id ? ' (you)' : ''}</Body>
          {titleText(item.title) ? <Dim>{titleText(item.title)}</Dim> : null}
        </View>
        <Text style={{ color: colors.gold, fontWeight: '900', fontSize: 18 }}>{item.wins}</Text>
      </Card>
    </Pressable>
  );

  return (
    <Screen>
      <Text onPress={() => router.back()} style={{ color: colors.accent, fontWeight: '800', paddingTop: 12 }}>‹ Back</Text>
      <H1>🏆 Leaderboard</H1>
      <Dim>Most wins against real players. Games against the computer do not count.</Dim>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <Chip label="This week" selected={period === 'week'} onPress={() => setPeriod('week')} />
        <Chip label="All time" selected={period === 'all'} onPress={() => setPeriod('all')} />
      </View>
      <View style={{ height: 52 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8, alignItems: 'center' }}>
          <Chip label="All games" selected={game === null} onPress={() => setGame(null)} />
          {GAMES.map((g) => <Chip key={g} label={`${GAME_INFO[g].emoji} ${GAME_INFO[g].title}`} selected={game === g} onPress={() => setGame(g)} />)}
        </ScrollView>
      </View>

      {failed ? <Empty text="Could not load the leaderboard. Pull back and try again." />
        : !data ? <ActivityIndicator color={colors.text} style={{ marginTop: 40 }} />
        : (
          <>
            <FlatList data={data.top} keyExtractor={(r) => r.userId} renderItem={row} contentContainerStyle={{ paddingTop: 6, paddingBottom: 16 }}
              ListEmptyComponent={<Empty text={game === 'WATER_SORT' ? 'Nobody has solved a level this period.' : 'No wins yet this period. Be the first!'} />} />
            <Card style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Body style={{ fontWeight: '800' }}>You</Body>
              <Dim>{data.me.rank ? `Rank ${data.me.rank} of ${data.players} · ${data.me.wins} win${data.me.wins === 1 ? '' : 's'}` : 'No wins in this list yet'}</Dim>
            </Card>
          </>
        )}
    </Screen>
  );
}
