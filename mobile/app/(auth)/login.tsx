import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { explain } from '../../src/api';
import { AuthHero, BonusPill, GlowField, PasswordField } from '../../src/AuthKit';
import { useSession } from '../../src/session';
import { Button, Screen, colors } from '../../src/ui';

export default function Login() {
  const { signIn } = useSession();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const go = async () => {
    setBusy(true); setError('');
    try { await signIn(identifier.trim(), password); } catch (e) { setError(explain(e)); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 16 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <AuthHero title="PlayCircle" />
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '900', marginBottom: 14 }}>Welcome back, champ 👋</Text>
          <GlowField label="Email or username" value={identifier} onChangeText={setIdentifier} textContentType="username" autoComplete="username" returnKeyType="next" />
          <PasswordField label="Password" value={password} onChangeText={setPassword} textContentType="password" autoComplete="password" onSubmitEditing={go} returnKeyType="go" />
          <Link href="/(auth)/forgot" style={{ color: colors.accent, fontWeight: '800', alignSelf: 'flex-end', marginTop: -6, marginBottom: 14 }}>Forgot password?</Link>
          {error ? <Text style={{ color: colors.bad, marginBottom: 12, fontWeight: '700' }}>{error}</Text> : null}
          <Button title="Let's play" onPress={go} busy={busy} disabled={identifier.length < 3 || password.length < 1} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 18 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} /><Text style={{ color: colors.dim, fontWeight: '700' }}>new here?</Text><View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
          </View>
          <BonusPill text="Join today and start with 1,000 free coins" />
          <Link href="/(auth)/register" style={{ color: colors.accent, textAlign: 'center', fontWeight: '900', fontSize: 16 }}>Create your account</Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
