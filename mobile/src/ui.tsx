import { frameColor } from './cosmetics';
import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = {
  bg: '#0B1020', card: '#151C33', cardAlt: '#1D2645', line: '#2A3560', text: '#F2F5FF', dim: '#98A2C8',
  accent: '#7C5CFF', accentText: '#FFFFFF', gold: '#FFC83D', good: '#2ED573', bad: '#FF5A6E', x: '#5EC2FF', o: '#FF9F5E',
};

export function Screen({ children, scroll, style }: { children: ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle> }) {
  return <SafeAreaView style={[s.screen, style]} edges={['top', 'left', 'right']}>{children}</SafeAreaView>;
}

export function Button({ title, onPress, kind = 'primary', busy, disabled, style }: {
  title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger' | 'gold'; busy?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || busy;
  const bg = kind === 'primary' ? colors.accent : kind === 'danger' ? colors.bad : kind === 'gold' ? colors.gold : 'transparent';
  const fg = kind === 'gold' ? '#1A1405' : colors.accentText;
  return (
    <Pressable onPress={onPress} disabled={off} style={({ pressed }) => [s.btn, { backgroundColor: bg, borderColor: kind === 'ghost' ? colors.line : bg, opacity: off ? 0.5 : pressed ? 0.85 : 1 }, style]}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: kind === 'ghost' ? colors.text : fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string; error?: string }) {
  const { label, error, style, ...rest } = props;
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.dim} autoCapitalize="none" autoCorrect={false} {...rest} style={[s.input, error ? { borderColor: colors.bad } : null, style]} />
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Coins({ amount, size = 16 }: { amount: number; size?: number }) {
  return (
    <View style={s.coinRow}>
      <View style={[s.coin, { width: size + 4, height: size + 4, borderRadius: (size + 4) / 2 }]}><Text style={{ fontSize: size - 4, fontWeight: '800', color: '#1A1405' }}>C</Text></View>
      <Text style={{ color: colors.gold, fontWeight: '800', fontSize: size }}>{amount.toLocaleString()}</Text>
    </View>
  );
}

export function Chip({ label, selected, onPress, disabled }: { label: string; selected?: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[s.chip, selected && { backgroundColor: colors.accent, borderColor: colors.accent }, disabled && { opacity: 0.35 }]}>
      <Text style={{ color: colors.text, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

export function Avatar({ name, size = 40, online, frame }: { name: string; size?: number; online?: boolean; frame?: string | null }) {
  const ring = frameColor(frame);
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <View>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${hue},55%,45%)`, alignItems: 'center', justifyContent: 'center', ...(ring ? { borderWidth: Math.max(3, size / 14), borderColor: ring } : null) }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.42 }}>{name.slice(0, 1).toUpperCase()}</Text>
      </View>
      {online !== undefined ? <View style={[s.dot, { backgroundColor: online ? colors.good : colors.line }]} /> : null}
    </View>
  );
}

export const H1 = ({ children }: { children: ReactNode }) => <Text style={s.h1}>{children}</Text>;
export const Dim = ({ children, style }: { children: ReactNode; style?: any }) => <Text style={[{ color: colors.dim }, style]}>{children}</Text>;
export const Body = ({ children, style }: { children: ReactNode; style?: any }) => <Text style={[{ color: colors.text, fontSize: 16 }, style]}>{children}</Text>;

export function Empty({ text }: { text: string }) {
  return <Text style={{ color: colors.dim, textAlign: 'center', marginVertical: 24 }}>{text}</Text>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  btn: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderWidth: 1 },
  btnText: { fontSize: 16, fontWeight: '800' },
  label: { color: colors.dim, marginBottom: 6, fontSize: 13, fontWeight: '600' },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, height: 48, fontSize: 16 },
  error: { color: colors.bad, marginTop: 4, fontSize: 13 },
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.line },
  coinRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coin: { backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  chip: { paddingHorizontal: 16, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  dot: { position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.bg },
  h1: { color: colors.text, fontSize: 28, fontWeight: '900', marginBottom: 4 },
});
