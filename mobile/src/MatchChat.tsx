import { useCallback, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSession, useSocketEvent } from './session';
import { colors } from './ui';

interface Chat { from: { id: string; displayName: string }; text: string; at: string }

/** Chat with the other players of a match, over the room's chat. Messages keep arriving while the panel is closed. */
export function useMatchChat() {
  const { socket } = useSession();
  const [list, setList] = useState<Chat[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpenState] = useState(false);
  const openRef = useRef(false);
  useSocketEvent<Chat>('room:chat', (c) => {
    setList((l) => [...l.slice(-59), c]);
    if (!openRef.current) setUnread((n) => n + 1);
  });
  const setOpen = useCallback((v: boolean) => { openRef.current = v; setOpenState(v); if (v) setUnread(0); }, []);
  const send = useCallback((text: string) => { if (text.trim()) socket?.emit('room:chat', { text: text.trim() }); }, [socket]);
  return { list, unread, open, setOpen, send };
}

export function ChatButton({ unread, onPress }: { unread: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10}>
      <Text style={{ fontSize: 18 }}>💬</Text>
      {unread > 0 ? <View style={{ position: 'absolute', right: -6, top: -4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.bad, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>{unread > 9 ? '9+' : unread}</Text></View> : null}
    </Pressable>
  );
}

/** A panel that slides over the lower half of the screen so the board stays visible above it. */
export function ChatPanel({ chat }: { chat: ReturnType<typeof useMatchChat> }) {
  const { user } = useSession();
  const [text, setText] = useState('');
  if (!chat.open) return null;
  const submit = () => { chat.send(text); setText(''); };
  return (
    <Modal transparent animationType="slide" onRequestClose={() => chat.setOpen(false)} statusBarTranslucent>
      <Pressable style={{ flex: 1 }} onPress={() => chat.setOpen(false)} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ height: 330, backgroundColor: '#151A33', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,.1)', padding: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontWeight: '900', fontSize: 15 }}>Chat</Text>
            <Pressable onPress={() => chat.setOpen(false)} hitSlop={10}><Text style={{ color: colors.dim, fontWeight: '800' }}>Close</Text></Pressable>
          </View>
          <FlatList
            style={{ flex: 1 }} data={chat.list} keyExtractor={(_, i) => String(i)}
            ListEmptyComponent={<Text style={{ color: colors.dim, textAlign: 'center', marginTop: 24 }}>Say something to the table.</Text>}
            renderItem={({ item }) => {
              const mine = item.from.id === user?.id;
              return (
                <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginVertical: 3 }}>
                  {mine ? null : <Text style={{ color: colors.dim, fontSize: 11, fontWeight: '700' }}>{item.from.displayName}</Text>}
                  <View style={{ maxWidth: '82%', backgroundColor: mine ? colors.accent : 'rgba(255,255,255,.08)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 }}><Text style={{ color: '#fff' }}>{item.text}</Text></View>
                </View>
              );
            }}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput value={text} onChangeText={setText} onSubmitEditing={submit} placeholder="Message" placeholderTextColor={colors.dim} maxLength={300} returnKeyType="send"
              style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.07)', color: colors.text, paddingHorizontal: 14 }} />
            <Pressable onPress={submit} style={{ height: 44, paddingHorizontal: 18, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '900' }}>Send</Text></Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
