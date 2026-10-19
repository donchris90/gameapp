import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { explain } from '../../src/api';
import { useSession } from '../../src/session';
import { Button, Dim, Field, H1, Screen, colors } from '../../src/ui';

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
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 52, marginBottom: 8 }}>🎮</Text>
          <H1>PlayCircle</H1>
          <Dim style={{ marginBottom: 28 }}>Play with friends. Make new ones.</Dim>
          <Field label="Email or username" value={identifier} onChangeText={setIdentifier} textContentType="username" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" onSubmitEditing={go} />
          {error ? <Text style={{ color: colors.bad, marginBottom: 12 }}>{error}</Text> : null}
          <Button title="Log in" onPress={go} busy={busy} disabled={identifier.length < 3 || password.length < 1} />
          <View style={{ height: 14 }} />
          <Link href="/(auth)/register" style={{ color: colors.accent, textAlign: 'center', fontWeight: '700', fontSize: 15 }}>New here? Create an account</Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
