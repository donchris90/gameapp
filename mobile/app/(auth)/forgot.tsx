import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { api, explain } from '../../src/api';
import { AuthHero, GlowField, PasswordField, StrengthBar } from '../../src/AuthKit';
import { Button, Screen, colors } from '../../src/ui';

export default function Forgot() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const send = async () => {
    setBusy(true); setError('');
    try { await api('/auth/forgot', { method: 'POST', auth: false, body: { email: email.trim() } }); setStep('code'); setWait(45); }
    catch (e) { setError(explain(e)); } finally { setBusy(false); }
  };
  const reset = async () => {
    setBusy(true); setError('');
    try {
      await api('/auth/reset', { method: 'POST', auth: false, body: { email: email.trim(), code, newPassword: pw } });
      Alert.alert('Password changed', 'You can log in with your new password now.', [{ text: 'Log in', onPress: () => router.replace('/(auth)/login') }]);
    } catch (e) { setError(explain(e)); } finally { setBusy(false); }
  };
  const mismatch = pw2.length > 0 && pw !== pw2;

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 16 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => (step === 'code' ? setStep('email') : router.back())} hitSlop={10} style={{ alignSelf: 'flex-start', marginBottom: 6 }}><Text style={{ color: colors.dim, fontWeight: '800' }}>‹ BACK</Text></Pressable>
          <AuthHero title="Forgot password?" compact />

          {step === 'email' ? (
            <>
              <Text style={{ color: colors.dim, marginBottom: 16, textAlign: 'center' }}>No stress. Type the email you signed up with and we will send you a 6-digit code.</Text>
              <GlowField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" onSubmitEditing={send} />
              {error ? <Text style={{ color: colors.bad, marginBottom: 12, fontWeight: '700' }}>{error}</Text> : null}
              <Button title="Send me the code" onPress={send} busy={busy} disabled={!emailOk} />
              <Pressable onPress={() => { setStep('code'); }} style={{ marginTop: 16 }} disabled={!emailOk}><Text style={{ color: emailOk ? colors.accent : colors.dim, textAlign: 'center', fontWeight: '800' }}>I already have a code</Text></Pressable>
            </>
          ) : (
            <>
              <Text style={{ color: colors.dim, marginBottom: 16, textAlign: 'center' }}>We sent a code to <Text style={{ color: colors.text, fontWeight: '800' }}>{email.trim()}</Text>. Check your inbox and your spam folder. It lasts about 20 minutes.</Text>
              <Text style={{ color: colors.dim, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>6-digit code</Text>
              <TextInput value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} placeholder="••••••" placeholderTextColor={colors.line} textContentType="oneTimeCode" autoComplete="sms-otp"
                style={{ backgroundColor: colors.card, borderWidth: 1.5, borderColor: code.length === 6 ? colors.accent : colors.line, borderRadius: 14, color: colors.gold, fontSize: 30, fontWeight: '900', letterSpacing: 12, textAlign: 'center', paddingVertical: 12, marginBottom: 14 }} />
              <PasswordField label="New password" value={pw} onChangeText={setPw} textContentType="newPassword" hint={<StrengthBar password={pw} />} />
              <PasswordField label="Type it again" value={pw2} onChangeText={setPw2} textContentType="newPassword" error={mismatch ? 'The two passwords are not the same' : undefined} onSubmitEditing={reset} />
              {error ? <Text style={{ color: colors.bad, marginBottom: 12, fontWeight: '700' }}>{error}</Text> : null}
              <Button title="Change my password" onPress={reset} busy={busy} disabled={code.length !== 6 || pw.length < 8 || pw !== pw2} />
              <Pressable onPress={send} disabled={wait > 0 || busy} style={{ marginTop: 16 }}><Text style={{ color: wait > 0 ? colors.dim : colors.accent, textAlign: 'center', fontWeight: '800' }}>{wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}</Text></Pressable>
            </>
          )}
          <View style={{ height: 8 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
