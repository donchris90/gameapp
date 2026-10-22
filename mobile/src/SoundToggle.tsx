import { useEffect, useState } from 'react';
import { Pressable, StyleProp, Text, ViewStyle } from 'react-native';
import { onSoundChange, setSoundOn, soundOn } from './sfx';

/** One switch for all game sound (effects and the Apex engine). Remembered between launches. */
export function SoundToggle({ style, label }: { style?: StyleProp<ViewStyle>; label?: boolean }) {
  const [on, setOn] = useState(soundOn());
  useEffect(() => { setOn(soundOn()); return onSoundChange(setOn); }, []);
  return (
    <Pressable onPress={() => void setSoundOn(!on)} hitSlop={10} accessibilityRole="button" accessibilityLabel={on ? 'Mute sound' : 'Unmute sound'}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(10,14,30,.72)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,.25)' }, style]}>
      <Text style={{ fontSize: 15 }}>{on ? '🔊' : '🔇'}</Text>
      {label ? <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{on ? 'Sound on' : 'Muted'}</Text> : null}
    </Pressable>
  );
}
