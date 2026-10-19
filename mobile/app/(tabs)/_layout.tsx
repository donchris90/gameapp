import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useSession } from '../../src/session';
import { colors } from '../../src/ui';

const icon = (e: string) => ({ focused }: { focused: boolean }) => <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.55 }}>{e}</Text>;

export default function TabsLayout() {
  const { chatUnread } = useSession();
  return (
    <Tabs screenOptions={{
      headerShown: false, tabBarActiveTintColor: colors.text, tabBarInactiveTintColor: colors.dim,
      tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.line }, sceneStyle: { backgroundColor: colors.bg },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Play', tabBarIcon: icon('🎮') }} />
      <Tabs.Screen name="shop" options={{ title: 'Coins', tabBarIcon: icon('🪙') }} />
      <Tabs.Screen name="friends" options={{ title: 'Friends', tabBarIcon: icon('👥'), tabBarBadge: chatUnread > 0 ? chatUnread : undefined }} />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: icon('🙂') }} />
    </Tabs>
  );
}
