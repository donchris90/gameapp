import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSession, useSocketEvent } from './session';
import { sfx } from './sfx';
import { colors } from './ui';

export const EMOTES: Record<string, { emoji: string; text: string }> = {
  gg: { emoji: '🤝', text: 'Good game' }, wow: { emoji: '😮', text: 'Wow!' }, haha: { emoji: '😂', text: 'Haha' }, oops: { emoji: '😅', text: 'Oops' },
  fire: { emoji: '🔥', text: 'On fire' }, clap: { emoji: '👏', text: 'Well played' }, think: { emoji: '🤔', text: 'Thinking…' }, hurry: { emoji: '⏰', text: 'Hurry up!' },
  luck: { emoji: '🍀', text: 'Good luck' }, nice: { emoji: '👌', text: 'Nice move' }, rematch: { emoji: '🔁', text: 'Rematch?' }, cry: { emoji: '😭', text: 'Ouch' },
};

interface Bubble { key: number; who: string; emote: string; mine: boolean }

/** A 😀 button for the game header, the picker it opens, and the speech bubbles that show reactions from the other player. */
export function EmoteControls({ matchId, disabled }: { matchId: string; disabled?: boolean }) {
  const { socket } = useSession();
  const [open, setOpen] = useState(false);
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const n = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const show = (b: Omit<Bubble, 'key'>) => {
    setBubble({ ...b, key: ++n.current });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setBubble(null), 2600);
  };
  useSocketEvent<{ matchId: string; from: { displayName: string }; emote: string }>('match:emote', (e) => {
    if (e.matchId !== matchId || !EMOTES[e.emote]) return;
    sfx('tap');
    show({ who: e.from.displayName, emote: e.emote, mine: false });
  });

  const send = (emote: string) => {
    setOpen(false);
    socket?.emit('match:emote', { matchId, emote }, (r: { ok: boolean }) => { if (r?.ok) show({ who: 'You', emote, mine: true }); });
  };

  return (
    <>
      <Pressable onPress={() => setOpen(true)} disabled={disabled} hitSlop={10} style={{ opacity: disabled ? 0.4 : 1 }}><Text style={{ fontSize: 18 }}>😀</Text></Pressable>
      {bubble ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 44, right: 0, zIndex: 60, elevation: 60, maxWidth: 220, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16,
          backgroundColor: bubble.mine ? colors.accent : colors.card, borderWidth: 1, borderColor: bubble.mine ? colors.accent : colors.line }}>
          <Text style={{ fontSize: 26 }}>{EMOTES[bubble.emote].emoji}</Text>
          <View><Text style={{ color: bubble.mine ? '#fff' : colors.dim, fontSize: 11, fontWeight: '700' }}>{bubble.who}</Text><Text style={{ color: '#fff', fontWeight: '800' }}>{EMOTES[bubble.emote].text}</Text></View>
        </View>
      ) : null}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.55)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 28 }}>
            <Text style={{ color: colors.dim, fontWeight: '700', marginBottom: 10, textAlign: 'center' }}>Send a reaction</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
              {Object.entries(EMOTES).map(([id, e]) => (
                <Pressable key={id} onPress={() => send(id)} style={{ width: '22%', alignItems: 'center', paddingVertical: 10, borderRadius: 14, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.line }}>
                  <Text style={{ fontSize: 28 }}>{e.emoji}</Text>
                  <Text numberOfLines={1} style={{ color: colors.text, fontSize: 10, fontWeight: '700', marginTop: 2 }}>{e.text}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
