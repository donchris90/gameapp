import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, Share, Text, TextInput, View } from 'react-native';
import { api, explain } from '../src/api';
import { GAME_INFO } from '../src/games';
import { useSession, useSocketEvent } from '../src/session';
import { Room, UserSummary } from '../src/types';
import { titleText } from '../src/cosmetics';
import { VoiceButton } from '../src/Voice';
import { Avatar, Body, Button, Card, Coins, Dim, Screen, colors } from '../src/ui';

type Chat = { from: { id: string; displayName: string }; text: string; at: string };

export default function RoomScreen() {
  const router = useRouter();
  const { user, socket } = useSession();
  const [room, setRoom] = useState<Room | null>(null);
  const [chat, setChat] = useState<Chat[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [friends, setFriends] = useState<Array<UserSummary & { online: boolean }>>([]);
  const left = useRef(false);

  const load = useCallback(async () => {
    try { setRoom(await api<Room>('/rooms/current')); } catch { if (!left.current) router.replace('/(tabs)'); }
  }, [router]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useSocketEvent<Room>('room:update', (r) => setRoom(r));
  useSocketEvent<Room>('room:started', (r) => setRoom(r));
  useSocketEvent('room:aborted', () => { Alert.alert('Game cancelled', 'Too few players were left to continue.'); void load(); });
  useSocketEvent('room:kicked', () => { left.current = true; Alert.alert('Removed', 'The host removed you from the room.'); router.replace('/(tabs)'); });
  useSocketEvent<Chat>('room:chat', (c) => setChat((l) => [...l.slice(-49), c]));
  useEffect(() => { if (socket?.connected) void load(); }, [socket?.connected, load]);

  if (!room || !user) return <Screen><View style={{ flex: 1 }} /></Screen>;
  const info = GAME_INFO[room.game];
  const isHost = room.hostId === user.id;
  const me = room.members.find((m) => m.userId === user.id);
  const others = room.members.filter((m) => m.userId !== room.hostId);
  const everyoneReady = others.every((m) => m.ready);
  const enough = room.members.length >= room.minPlayers;

  const act = async (fn: () => Promise<unknown>, title: string) => {
    setBusy(true);
    try { await fn(); } catch (e) { Alert.alert(title, explain(e)); } finally { setBusy(false); }
  };
  const leave = () => act(async () => { left.current = true; await api('/rooms/current/leave', { method: 'POST' }); router.replace('/(tabs)'); }, 'Leave room');
  const openInvite = async () => {
    try { setFriends(await api('/friends')); setInviting(true); } catch (e) { Alert.alert('Invite', explain(e)); }
  };
  const send = () => {
    const t = text.trim();
    if (!t) return;
    socket?.emit('room:chat', { text: t });
    setText('');
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }}>
          <Pressable onPress={leave} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }}><Text style={{ color: colors.bad, fontWeight: '800' }}>Leave room</Text></Pressable>
          <View style={{ alignItems: 'center', flex: 1 }}><Body style={{ fontWeight: '900' }}>{info.emoji} {info.title}</Body><Dim style={{ fontSize: 10 }}>MULTIPLAYER LOBBY</Dim></View>
          <View style={{ minWidth: 44, alignItems: 'flex-end' }}><VoiceButton /></View>
        </View>

        <View style={{ borderRadius: 24, padding: 20, backgroundColor: '#34247D', gap: 12, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: '#D8D0FF', fontSize: 11, fontWeight: '900', letterSpacing: 1.5 }}>YOUR GAME LOBBY</Text>
            <Text style={{ color: '#C4F7DB', fontSize: 11, fontWeight: '900' }}>{room.members.length >= room.minPlayers ? 'READY TO START' : 'WAITING FOR PLAYERS'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 58, height: 58, borderRadius: 18, backgroundColor: 'rgba(255,255,255,.14)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 32 }}>{info.emoji}</Text>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>{info.title}</Text>
              <Text style={{ color: '#D8D0FF', fontSize: 12 }}>{room.members.length} of {room.maxPlayers} players · {room.stake > 0 ? `${room.stake.toLocaleString()} coins entry` : 'Friendly game'}</Text>
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,.18)' }} />
          <Text style={{ color: '#D8D0FF', fontSize: 11, fontWeight: '800' }}>ROOM CODE · TAP TO COPY</Text>
          <Pressable onPress={async () => { await Clipboard.setStringAsync(room.code); Alert.alert('Copied', 'Room code copied.'); }} style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,.12)', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14 }}>
            <Text style={{ color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: 6 }}>{room.code}</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
            <View style={{ flex: 1 }}><Button title="Share invite" kind="ghost" style={{ minHeight: 42, borderColor: 'rgba(255,255,255,.3)' }} onPress={() => Share.share({ message: `Join my ${info.title} game on PlayCircle! Room code: ${room.code}` })} /></View>
            <View style={{ flex: 1 }}><Button title="Invite friends" style={{ minHeight: 42 }} onPress={openInvite} /></View>
          </View>
        </View>

        <View style={{ gap: 8, marginTop: 18 }}><Text style={{ color: colors.text, fontSize: 18, fontWeight: "900", marginBottom: 2 }}>Players in your room</Text>
          {Array.from({ length: room.maxPlayers }, (_, i) => room.members.find((m) => m.seat === i) ?? null).map((m, i) => (
            <Card key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderRadius: 18 }}>
              {m ? (
                <>
                  <Pressable onPress={() => router.push({ pathname: '/player/[id]', params: { id: m.userId } })}><Avatar name={m.displayName} online={m.online} frame={m.frame} /></Pressable>
                  <View style={{ flex: 1 }}><Body style={{ fontWeight: '700' }}>{m.displayName}{m.userId === user.id ? ' (you)' : ''}</Body><Dim>{titleText(m.title) ? `${titleText(m.title)} · ` : ''}{m.userId === room.hostId ? 'Host' : m.ready ? 'Ready' : 'Not ready'}</Dim></View>
                  {m.userId === room.hostId ? <Text>👑</Text> : m.ready ? <Text style={{ color: colors.good, fontWeight: '800' }}>✓</Text> : null}
                  {isHost && m.userId !== user.id ? <Text onPress={() => act(() => api(`/rooms/current/kick/${m.userId}`, { method: 'POST' }), 'Remove player')} style={{ color: colors.dim, fontSize: 18, paddingHorizontal: 6 }}>✕</Text> : null}
                </>
              ) : <View style={{ flex: 1, paddingVertical: 8, gap: 3 }}><Body style={{ fontWeight: "800" }}>Open player slot</Body><Dim>Invite a friend or share the room code to fill this seat.</Dim></View>}
            </Card>
          ))}
        </View>

        <View style={{ marginTop: 14 }}>
          {isHost ? (
            <Button title={enough ? (everyoneReady ? 'Start game' : 'Waiting for everyone to be ready') : `Need ${room.minPlayers - room.members.length} more`} busy={busy} disabled={!enough || !everyoneReady}
              onPress={() => act(() => api('/rooms/current/start', { method: 'POST' }), 'Start game')} />
          ) : (
            <Button title={me?.ready ? 'Not ready' : "I'm ready"} kind={me?.ready ? 'ghost' : 'primary'} busy={busy}
              onPress={() => act(() => api('/rooms/current/ready', { method: 'POST', body: { ready: !me?.ready } }), 'Ready')} />
          )}
        </View>

        <FlatList
          style={{ flex: 1, marginTop: 12 }} data={chat} keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => <Text style={{ color: colors.text, marginVertical: 2 }}><Text style={{ color: item.from.id === user.id ? colors.accent : colors.gold, fontWeight: '700' }}>{item.from.displayName}: </Text>{item.text}</Text>}
          ListEmptyComponent={<Dim style={{ textAlign: 'center', marginTop: 8 }}>Say hi 👋</Dim>}
        />
        <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 12, alignItems: 'center' }}>
          <TextInput value={text} onChangeText={setText} onSubmitEditing={send} placeholder="Message" placeholderTextColor={colors.dim} maxLength={200}
            style={{ flex: 1, backgroundColor: colors.card, color: colors.text, borderRadius: 12, paddingHorizontal: 14, height: 44, borderWidth: 1, borderColor: colors.line }} />
          <Button title="Send" onPress={send} style={{ minHeight: 44 }} />
        </View>
      </KeyboardAvoidingView>

      <Modal visible={inviting} transparent animationType="slide" onRequestClose={() => setInviting(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={() => setInviting(false)} />
        <View style={{ backgroundColor: colors.bg, padding: 16, maxHeight: '60%', borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
          <Body style={{ fontWeight: '800', marginBottom: 10 }}>Invite a friend</Body>
          <FlatList data={friends} keyExtractor={(f) => f.id} ListEmptyComponent={<Dim>No friends yet. Add some in the Friends tab.</Dim>}
            renderItem={({ item }) => (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                <Avatar name={item.displayName} online={item.online} />
                <Body style={{ flex: 1 }}>{item.displayName}</Body>
                <Button title="Invite" style={{ minHeight: 40 }} onPress={() => api('/rooms/current/invite', { method: 'POST', body: { userId: item.id } }).then(() => Alert.alert('Invite sent')).catch((e) => Alert.alert('Invite', explain(e)))} />
              </View>
            )} />
          <Button title="Close" kind="ghost" onPress={() => setInviting(false)} style={{ marginTop: 8 }} />
        </View>
      </Modal>
    </Screen>
  );
}
