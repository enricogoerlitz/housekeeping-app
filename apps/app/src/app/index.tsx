import { APP_NAME } from '@housekeeping/core';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';

// Placeholder screen: proves the app boots on every platform and resolves workspace packages.
// Replaced by the first feature spec; styling moves to packages/ui with the design system.
export default function HomeScreen() {
  const dark = useColorScheme() === 'dark';
  return (
    <View style={[styles.container, { backgroundColor: dark ? '#000' : '#fff' }]}>
      <Text style={[styles.title, { color: dark ? '#fff' : '#000' }]}>{APP_NAME}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '600' },
});
