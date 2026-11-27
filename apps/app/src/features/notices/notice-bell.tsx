import { acknowledgeNotices } from '@housekeeping/api';
import {
  noticeBadge,
  notificationTargetHref,
  type Notice,
  type NoticeKind,
} from '@housekeeping/core';
import {
  EmptyState,
  Icon,
  IconButton,
  Sheet,
  Stack,
  Text,
  WithBadge,
  keyboardFocusRing,
  toast,
  useHover,
  useTheme,
  type IconName,
} from '@housekeeping/ui';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';
import { useOnlineOnly } from '@/features/shell/offline';

import { useDueNotices } from './use-due-notices';

// Spec 0051 "Mitteilungen": the bell with the red number (REQ-003) and the window with what is
// due now (REQ-004). Reading works offline; acknowledging is an online write.

const KIND_ICON: Record<NoticeKind, IconName> = {
  entryReminder: 'alarm-clock',
  chore: 'house',
  prep: 'clock',
  cook: 'chef-hat',
  activity: 'calendar-days',
};

/** The bell in a header or the sidebar; a tap opens "Mitteilungen". */
export function NoticeBell() {
  const notices = useDueNotices();
  const [open, setOpen] = useState(false);
  const badge = noticeBadge(notices.length);
  return (
    <>
      <WithBadge count={badge.count} testID="notices-badge">
        <IconButton
          icon="bell"
          label={badge.label}
          onPress={() => setOpen(true)}
          testID="notices-bell"
        />
      </WithBadge>
      <NoticesSheet visible={open} notices={notices} onClose={() => setOpen(false)} />
    </>
  );
}

function acknowledge(keys: readonly string[]): void {
  try {
    acknowledgeNotices(keys);
  } catch (error) {
    toast.show({ message: errorMessage(error, FAILED_MESSAGE) });
  }
}

function NoticesSheet(props: { visible: boolean; notices: Notice[]; onClose: () => void }) {
  const router = useRouter();
  const online = useOnlineOnly();
  const { notices } = props;
  const openTarget = (notice: Notice) => {
    props.onClose();
    router.navigate(notificationTargetHref(notice.target) as Href);
  };
  return (
    <Sheet
      visible={props.visible}
      onClose={props.onClose}
      title="Mitteilungen"
      size="s"
      testID="notices-sheet"
      actions={{
        primary: {
          label: 'Alle bestätigen',
          icon: 'list-checks',
          onPress: () => acknowledge(notices.map((notice) => notice.key)),
          disabled: online.disabled || notices.length === 0,
          hint: online.hint,
          testID: 'notices-ack-all',
        },
        // A visible way out on phones too: "Alle bestätigen" does not close (spec 0054, AC-019).
        cancel: { label: 'Schließen', onPress: props.onClose, testID: 'notices-close' },
      }}
    >
      <Stack gap={8}>
        {online.hint ? (
          <Text variant="small" color="warn" testID="notices-offline-hint">
            {online.hint}
          </Text>
        ) : null}
        {notices.length === 0 ? (
          <EmptyState icon="bell" title="Gerade steht nichts an." testID="notices-empty" />
        ) : (
          <View style={{ gap: 4 }} testID="notices-list">
            {notices.map((notice) => (
              <NoticeRow
                key={notice.key}
                notice={notice}
                onOpen={() => openTarget(notice)}
                onAcknowledge={() => acknowledge([notice.key])}
                disabled={online.disabled}
                hint={online.hint}
              />
            ))}
          </View>
        )}
      </Stack>
    </Sheet>
  );
}

/** What, when, a tap opens it; ✓ acknowledges it. */
function NoticeRow(props: {
  notice: Notice;
  onOpen: () => void;
  onAcknowledge: () => void;
  disabled: boolean;
  hint: string | undefined;
}) {
  const theme = useTheme();
  const hover = useHover();
  const { notice } = props;
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
      testID={`notice-${notice.kind}`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${notice.title}, ${notice.detail}`}
        accessibilityHint="Öffnet den Eintrag"
        onPress={props.onOpen}
        testID={`notice-open-${notice.key}`}
        style={(state) => {
          const { hovered, focused } = state as { hovered?: boolean; focused?: boolean };
          return [
            {
              flex: 1,
              minHeight: 44,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 8,
              paddingHorizontal: 8,
              borderRadius: theme.shape.radius.control,
              backgroundColor: hover(hovered) ? theme.colors.surfaceSunken : 'transparent',
            },
            keyboardFocusRing(theme, focused),
          ];
        }}
      >
        <Icon name={KIND_ICON[notice.kind]} color="accent" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {notice.title}
          </Text>
          <Text variant="small" color="muted" numberOfLines={2}>
            {notice.detail}
          </Text>
        </View>
      </Pressable>
      <IconButton
        icon="check"
        label={`Bestätigen: ${notice.title}`}
        onPress={props.onAcknowledge}
        disabled={props.disabled}
        hint={props.hint}
        testID={`notice-ack-${notice.key}`}
      />
    </View>
  );
}
