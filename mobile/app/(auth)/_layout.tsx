import { Stack } from 'expo-router';
import { colors } from '../../src/ui';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
