import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { explain } from '../../src/api';
import { AuthHero, BonusPill, GlowField, PasswordField, StrengthBar } from '../../src/AuthKit';
import { useSession } from '../../src/session';
import { Avatar, Button, Screen, colors } from '../../src/ui';

function ageOf(birth: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d)) age--;
  return age;
}

/** Turns 19980423 into 1998-04-23 as the player types. */
const dashes = (t: string) => { const d = t.replace(/\D/g, '').slice(0, 8); return d.length > 6 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d; };
const STEPS = ['Your name', 'Your login', 'Last step'];
const ok = <Text style={{ color: colors.good, fontWeight: '900', fontSize: 18 }}>✓</Text>;

export default function Register() {
  const { signUp } = useSession();
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const age = ageOf(birthDate);
  const nameOk = /^[A-Za-z0-9_]{3,20}$/.test(username);
  const emailOk = /^\S+@\S+\.\S+$/.test(email);
  const passOk = password.length >= 8;
  const errs = {
    username: username && !nameOk ? '3-20 letters, numbers or _' : '',
    email: email && !emailOk ? 'Enter a valid email' : '',
    birthDate: birthDate.length === 10 && age === null ? 'That date does not look right' : age !== null && age < 18 ? 'You must be 18 or older to play' : '',
  };
  const canNext = step === 0 ? nameOk : step === 1 ? emailOk && passOk : age !== null && age >= 18 && agree;

  const go = async () => {
    setBusy(true); setError('');
    try { await signUp({ email: email.trim(), username, password, birthDate }); } catch (e) { setError(explain(e)); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 16 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <AuthHero title="Join PlayCircle" compact />
          <BonusPill text="1,000 free coins are waiting for you" />

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
            {STEPS.map((s, i) => <View key={s} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= step ? colors.accent : colors.line }} />)}
          </View>
          <Text style={{ color: colors.dim, fontWeight: '800', fontSize: 12, marginBottom: 14 }}>STEP {step + 1} OF 3 · {STEPS[step].toUpperCase()}</Text>

          {step === 0 ? (
            <>
              <View style={{ alignItems: 'center', marginBottom: 14, gap: 8 }}>
                <Avatar name={username || '?'} size={84} />
                <Text style={{ color: colors.text, fontSize: 22, fontWeight: '900' }}>{username || 'Your name'}</Text>
                <Text style={{ color: colors.dim }}>This is how your friends will see you</Text>
              </View>
              <GlowField label="Pick a player name" value={username} onChangeText={setUsername} maxLength={20} error={errs.username} placeholder="e.g. NaijaKing" right={nameOk ? ok : null} />
            </>
          ) : null}

          {step === 1 ? (
            <>
              <GlowField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" error={errs.email} placeholder="you@gmail.com" right={emailOk ? ok : null}
              />
              <PasswordField label="Password" value={password} onChangeText={setPassword} textContentType="newPassword" hint={<StrengthBar password={password} />} />
              <Text style={{ color: colors.dim, fontSize: 12, marginTop: -4 }}>Your email is only used to sign in and to reset your password.</Text>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <GlowField label="Date of birth" value={birthDate} onChangeText={(t) => setBirthDate(dashes(t))} keyboardType="number-pad" maxLength={10} placeholder="YYYY-MM-DD" error={errs.birthDate} right={age !== null && age >= 18 ? ok : null} />
              <Text style={{ color: colors.dim, fontSize: 12, marginTop: -6, marginBottom: 14 }}>PlayCircle is for players 18 and over. Type the numbers and the dashes appear.</Text>
              <Pressable onPress={() => setAgree(!agree)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: agree ? colors.accent : colors.line, backgroundColor: agree ? colors.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {agree ? <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text> : null}
                </View>
                <Text style={{ color: colors.text, flex: 1 }}>I am 18 or older and I accept the Terms. Coins are for play only and cannot be cashed out.</Text>
              </Pressable>
            </>
          ) : null}

          {error ? <Text style={{ color: colors.bad, marginBottom: 12, fontWeight: '700' }}>{error}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {step > 0 ? <Button title="Back" kind="ghost" onPress={() => { setError(''); setStep(step - 1); }} style={{ flex: 1 }} /> : null}
            {step < 2
              ? <Button title="Next" onPress={() => setStep(step + 1)} disabled={!canNext} style={{ flex: 2 }} />
              : <Button title="Start playing 🎉" onPress={go} busy={busy} disabled={!canNext} style={{ flex: 2 }} />}
          </View>
          <View style={{ height: 16 }} />
          <Link href="/(auth)/login" style={{ color: colors.accent, textAlign: 'center', fontWeight: '800', fontSize: 15 }}>I already have an account</Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
