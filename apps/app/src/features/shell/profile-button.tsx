import { useCurrentMember } from '@housekeeping/api';
import { Avatar, IconButton, useBreakpoint } from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { MANAGE_ICON } from '@/features/manage/manage-entries';

/** The avatar in a screen header: opens the personal settings. */
function ProfileButton() {
  const member = useCurrentMember();
  const router = useRouter();
  return (
    <Pressable
      testID="profile-button"
      accessibilityRole="button"
      accessibilityLabel="Profil und Einstellungen"
      onPress={() => router.navigate('/einstellungen')}
      hitSlop={6}
    >
      <Avatar name={member.name} color={member.color} size="m" />
    </Pressable>
  );
}

/** ⊞: opens the page "Verwalten" (spec 0005, D2). */
function ManageButton() {
  const router = useRouter();
  return (
    <IconButton
      icon={MANAGE_ICON}
      label="Verwalten"
      onPress={() => router.navigate('/verwalten')}
      testID="header-manage"
    />
  );
}

/**
 * The end of the header on every tab's first page: on phones ⊞ left of the avatar (AC-054); on
 * wider screens nothing, the sidebar has both (AC-013).
 */
export function StartPageActions() {
  const { isPhone } = useBreakpoint();
  if (!isPhone) return null;
  return (
    <>
      <ManageButton />
      <ProfileButton />
    </>
  );
}
