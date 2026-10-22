import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, TextInput, TextInputProps, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from './ui';

/** The eye that shows or hides what is typed in a password box. */
function Eye({ open, color }: { open: boolean; color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
      <Circle cx={12} cy={12} r={3} />
      {open ? null : <Path d="M4 4l16 16" />}
    </Svg>
  );
}

/** A text box for passwords with a show/hide eye on the right. */
export function PasswordField({ label, error, hint, ...rest }: TextInputProps & { label: string; error?: string; hint?: ReactNode }) {
  const [show, setShow] = useState(false);
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: colors.dim, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderWidth: 1.5, borderRadius: 14, borderColor: error ? colors.bad : focus ? colors.accent : colors.line }}>
        <TextInput
          placeholderTextColor={colors.dim} autoCapitalize="none" autoCorrect={false} {...rest} secureTextEntry={!show}
          onFocus={(e) => { setFocus(true); rest.onFocus?.(e); }} onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
          style={{ flex: 1, color: colors.text, fontSize: 16, paddingHorizontal: 14, paddingVertical: 13 }}
        />
        <Pressable onPress={() => setShow((v) => !v)} hitSlop={10} accessibilityRole="button" accessibilityLabel={show ? 'Hide password' : 'Show password'} style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
          <Eye open={show} color={show ? colors.accent : colors.dim} />
        </Pressable>
      </View>
      {error ? <Text style={{ color: colors.bad, fontSize: 12, marginTop: 4 }}>{error}</Text> : hint}
    </View>
  );
}

/** A text box with a focus glow, used on the sign-in screens. */
export function GlowField({ label, error, right, ...rest }: TextInputProps & { label: string; error?: string; right?: ReactNode }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: colors.dim, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderWidth: 1.5, borderRadius: 14, borderColor: error ? colors.bad : focus ? colors.accent : colors.line }}>
        <TextInput
          placeholderTextColor={colors.dim} autoCapitalize="none" autoCorrect={false} {...rest}
          onFocus={(e) => { setFocus(true); rest.onFocus?.(e); }} onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
          style={{ flex: 1, color: colors.text, fontSize: 16, paddingHorizontal: 14, paddingVertical: 13 }}
        />
        {right ? <View style={{ paddingRight: 14 }}>{right}</View> : null}
      </View>
      {error ? <Text style={{ color: colors.bad, fontSize: 12, marginTop: 4 }}>{error}</Text> : null}
    </View>
  );
}

/** How strong a password is, 0 to 4, with a plain reason for what is missing. */
export function passwordScore(p: string) {
  let n = 0;
  if (p.length >= 8) n++;
  if (p.length >= 12) n++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) n++;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) n++;
  return p.length < 8 ? Math.min(n, 1) : n;
}
const LEVELS = [['Too short', colors.bad], ['Weak', colors.bad], ['Okay', '#FF9F5E'], ['Good', '#9BE15D'], ['Strong', colors.good]] as const;
export function StrengthBar({ password }: { password: string }) {
  if (!password) return null;
  const s = passwordScore(password);
  const [label, color] = LEVELS[s];
  return (
    <View style={{ marginTop: 8, gap: 5 }}>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        {[1, 2, 3, 4].map((i) => <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= s ? color : colors.line }} />)}
      </View>
      <Text style={{ color, fontSize: 12, fontWeight: '800' }}>{label}{password.length < 8 ? ' · use at least 8 characters' : s < 3 ? ' · add capitals, numbers or symbols' : ''}</Text>
    </View>
  );
}

const TILES = [
  { e: '🎲', x: '6%', y: 8, c: '#C0392B', d: 0 }, { e: '🃏', x: '70%', y: 0, c: '#8E44AD', d: 400 },
  { e: '🏎️', x: '80%', y: 92, c: '#E8501A', d: 800 }, { e: '❌', x: '0%', y: 96, c: '#2B6CFF', d: 1200 },
  { e: '🫘', x: '36%', y: -6, c: '#D35400', d: 600 },
];
const LINES = ['Ludo with your friends', 'Whot, the real way', 'Race your rivals in Apex', 'Ayo, pack the 4s', 'Win coins, win bragging rights'];

function Tile({ e, x, y, c, d }: (typeof TILES)[number]) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(t, { toValue: 1, duration: 1800, delay: d, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(t, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [t, d]);
  return (
    <Animated.View style={{ position: 'absolute', left: x as any, top: y, width: 54, height: 54, borderRadius: 16, backgroundColor: c, alignItems: 'center', justifyContent: 'center', shadowColor: c, shadowOpacity: 0.5, shadowRadius: 10, elevation: 6,
      transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) }, { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '8deg'] }) }] }}>
      <Text style={{ fontSize: 28 }}>{e}</Text>
    </Animated.View>
  );
}

/** The playful top of the sign-in screens: bobbing game tiles, the name, and a line that keeps changing. */
export function AuthHero({ title, compact }: { title: string; compact?: boolean }) {
  const [i, setI] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => { setI((n) => (n + 1) % LINES.length); Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start(); });
    }, 2600);
    return () => clearInterval(id);
  }, [fade]);
  return (
    <View style={{ alignItems: 'center', marginBottom: compact ? 14 : 22 }}>
      {compact ? null : <View style={{ height: 150, width: '100%' }}>{TILES.map((t) => <Tile key={t.e} {...t} />)}</View>}
      <Text style={{ color: colors.text, fontSize: compact ? 28 : 34, fontWeight: '900', letterSpacing: 0.5 }}>{title}</Text>
      <Animated.Text style={{ color: colors.accent, fontWeight: '800', marginTop: 6, opacity: fade, height: 20 }}>{LINES[i]}</Animated.Text>
    </View>
  );
}

/** A little pill that says what the player gets for joining. */
export function BonusPill({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', backgroundColor: 'rgba(255,200,61,.12)', borderColor: 'rgba(255,200,61,.35)', borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 18 }}>
      <Text style={{ fontSize: 18 }}>🎁</Text>
      <Text style={{ color: colors.gold, fontWeight: '800', fontSize: 13 }}>{text}</Text>
    </View>
  );
}
