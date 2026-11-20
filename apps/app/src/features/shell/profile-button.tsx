import { useCurrentMember } from '@housekeeping/api';
import { Avatar } from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

/** The avatar in a screen header: opens profile and settings. */
export function ProfileButton() {
  const member = useCurrentMember();
  const router = useRouter();
  return (
    <Pressable
      testID="profile-button"
      accessibilityRole="button"
      accessibilityLabel="Profil und Einstellungen"
      onPress={() => router.push('/einstellungen')}
      hitSlop={6}
    >
      <Avatar name={member.name} color={member.color} size="m" />
    </Pressable>
  );
}
