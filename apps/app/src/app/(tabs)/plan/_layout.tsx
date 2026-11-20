import { useTheme } from '@housekeeping/ui';
import { Stack } from 'expo-router';

// A deep link to an activity still has the plan underneath, so "Zurück" and a second tap on the
// tab lead to it.
export const unstable_settings = { anchor: 'index' };

/** The plan tab is a stack, so an activity's page keeps the tab bar and the sidebar (spec 0004). */
export default function PlanLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }}
    />
  );
}
