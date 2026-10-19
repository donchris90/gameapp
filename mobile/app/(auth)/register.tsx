import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { explain } from '../../src/api';
import { useSession } from '../../src/session';
import { Button, Dim, Field, H1, Screen, colors } from '../../src/ui';

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

export default function Register() {
  const { signUp } = useSession();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const age = ageOf(birthDate);
  const errs = {
    email: email && !/^\S+@\S+\.\S+$/.test(email) ? 'Enter a valid email' : '',
    username: username && !/^[A-Za-z0-9_]{3,20}$/.test(username) ? '3-20 letters, numbers or _' : '',
    password: password && password.length < 8 ? 'At least 8 characters' : '',
    birthDate: birthDate.length === 10 && age === null ? 'Use YYYY-MM-DD' : age !== null && age < 18 ? 'You must be 18 or older to play' : '',
  };
  const ok = /^\S+@\S+\.\S+$/.test(email) && /^[A-Za-z0-9_]{3,20}$/.test(username) && password.length >= 8 && age !== null && age >= 18 && agree;

  const go = async () => {
    setBusy(true); setError('');
    try { await signUp({ email: email.trim(), username, password, birthDate }); } catch (e) { setError(explain(e)); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingVertical: 24 }} keyboardShouldPersistTaps="handled">
          <H1>Create account</H1>
          <Dim style={{ marginBottom: 20 }}>You get 1,000 free coins to start. PlayCircle is for players 18 and over.</Dim>
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="emailAddress" error={errs.email} />
          <Field label="Username" value={username} onChangeText={setUsername} error={errs.username} />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" error={errs.password} />
          <Field label="Date of birth (YYYY-MM-DD)" value={birthDate} onChangeText={setBirthDate} keyboardType="numbers-and-punctuation" maxLength={10} placeholder="1998-04-23" error={errs.birthDate} />
          <Pressable onPress={() => setAgree(!agree)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 16 }}>
            <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: agree ? colors.accent : colors.line, backgroundColor: agree ? colors.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {agree ? <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text> : null}
            </View>
            <Text style={{ color: colors.text, flex: 1 }}>I am 18 or older and I accept the Terms. Coins are for play only and cannot be cashed out.</Text>
          </Pressable>
          {error ? <Text style={{ color: colors.bad, marginBottom: 12 }}>{error}</Text> : null}
          <Button title="Create account" onPress={go} busy={busy} disabled={!ok} />
          <View style={{ height: 14 }} />
          <Link href="/(auth)/login" style={{ color: colors.accent, textAlign: 'center', fontWeight: '700', fontSize: 15 }}>I already have an account</Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
