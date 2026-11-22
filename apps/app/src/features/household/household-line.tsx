import { Icon, Sheet, Stack, Text, keyboardFocusRing, useTheme } from '@housekeeping/ui';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { CreateHouseholdForm } from './household-forms';
import { HouseholdList } from './members-screen';

/**
 * "Enrico & Nadja ▾" above the title of the phone's overview, with more than one household
 * (spec 0019, REQ-007, AC-019): a tap opens "Haushalt wechseln", as the sidebar's name does on
 * wide screens. Switching works offline, it is local.
 */
export function HouseholdLine(props: { name: string }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${props.name}, Haushalt wechseln`}
        onPress={() => setOpen(true)}
        testID="overview-household"
        style={(state) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            alignSelf: 'flex-start',
            minHeight: 28,
            marginBottom: 2,
            borderRadius: theme.shape.radius.control,
            opacity: state.pressed ? 0.6 : 1,
          },
          keyboardFocusRing(theme, (state as { focused?: boolean }).focused),
        ]}
      >
        <Text variant="smallStrong" color="muted" numberOfLines={1}>
          {props.name}
        </Text>
        <Icon name="chevron-down" size={16} color="muted" />
      </Pressable>
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Haushalt wechseln"
        testID="overview-household-sheet"
        size="s"
      >
        <Stack gap={16}>
          <HouseholdList testIDPrefix="overview-household" onSwitched={() => setOpen(false)} />
          <CreateHouseholdForm />
        </Stack>
      </Sheet>
    </>
  );
}
