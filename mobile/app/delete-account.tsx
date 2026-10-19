import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { api, explain } from '../src/api';
import { useSession } from '../src/session';
import { Body, Button, Dim, Field, H1, Screen, colors } from '../src/ui';
import { Text } from 'react-native';

export default function DeleteAccount() {
  const router = useRouter();
  const { signOut } = useSession();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const confirm = () => Alert.alert('Delete your account?', 'This cannot be undone. Your coins are lost and cannot be refunded.', [
    { text: 'Keep my account', style: 'cancel' },
    {
      text: 'Delete forever', style: 'destructive',
      onPress: async () => {
        setBusy(true);
        try { await api('/users/me/delete', { method: 'POST', body: { password } }); await signOut(); }
        catch (e) { Alert.alert('Could not delete', explain(e)); }
        finally { setBusy(false); }
      },
    },
  ]);

  return (
    <Screen>
      <Text onPress={() => router.back()} style={{ color: colors.dim, fontSize: 16, marginVertical: 8 }}>‹ Back</Text>
      <H1>Delete account</H1>
      <View style={{ gap: 10, marginTop: 8 }}>
        <Body>Your name, email, birth date, friends and sign-ins are erased. Your coins are lost and can never be paid out. Records of coin purchases are kept without your name, as the law and the app stores require.</Body>
        <Dim>If you are in a game, finish or resign it first.</Dim>
        <Field label="Enter your password to confirm" secureTextEntry value={password} onChangeText={setPassword} autoCapitalize="none" />
        <Button title="Delete my account" kind="danger" busy={busy} disabled={password.length === 0} onPress={confirm} />
      </View>
    </Screen>
  );
}
