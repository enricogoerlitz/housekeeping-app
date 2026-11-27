import {
  addBadge,
  backspaceRemovesBadge,
  badgeLabel,
  matchBadges,
  slashQuery,
  takeSlash,
  type AgentBadgeSlug,
} from '@housekeeping/core';
import { Chip, IconButton, pickImageFile, Surface, Text, useTheme } from '@housekeeping/ui';
import { useState, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { Pressable, View, type TextInput } from 'react-native';

import { DictationField } from '@/features/shell/dictation-field';
import type { PromptDictation } from '@/lib/use-prompt-dictation';

import {
  ATTACHMENT_ACCEPT,
  previewOf,
  type AttachmentPreview,
  type PickedAttachment,
} from './agent-attachments';

// Spec 0067, REQ-004/REQ-005: the agent's input. Badges and attachments stand inside the field
// above the text, as chips with ✕ — never as free text; backspace right behind the badges removes
// the last one whole (AC-007). "/" opens the badges above the field, typing filters them (AC-006).
// The field grows to 4.5 lines and then scrolls (AC-009); "+" opens the picker for photos and PDF.
// UI review 27.11. (Enrico): one slim rounded bar like the phone chat apps — "+" left, the text,
// mic and send right; badges, files and the place are small chips inside it, no rows of their own.

export interface AgentInputProps {
  text: string;
  onChangeText: (text: string) => void;
  badges: readonly AgentBadgeSlug[];
  onBadges: (badges: AgentBadgeSlug[]) => void;
  attachments: readonly PickedAttachment[];
  onRemoveAttachment: (key: string) => void;
  /** Preview feedback 28.11.: a tap on a file's chip shows it; its ✕ removes it. */
  onPreview: (preview: AttachmentPreview) => void;
  onPickFile: (file: File) => void;
  /** A photo being prepared: "+" waits. */
  preparing: boolean;
  dictation: PromptDictation;
  editable: boolean;
  placeholder: string;
  onSubmit: () => void;
  trailing: ReactNode;
  /** The input, so the start page and the slash menu put the cursor back into it. */
  inputRef: RefObject<ComponentRef<typeof TextInput> | null>;
  /**
   * The place as a small chip in the field, only where it counts (spec 0067 decision 17: with
   * "Ausgehen" or a chosen place); otherwise there is no row for it (UI review 27.11.).
   */
  place?: { label: string; accessibilityLabel: string; onPress: () => void };
}

export function AgentInput(props: AgentInputProps) {
  const theme = useTheme();
  const [selection, setSelection] = useState({ start: props.text.length, end: props.text.length });
  const caret = selection.start === selection.end ? Math.min(selection.end, props.text.length) : -1;
  const slash = caret >= 0 ? slashQuery(props.text, caret) : undefined;
  const matches = slash ? matchBadges(slash.query, props.badges) : [];
  const menu = slash !== undefined && matches.length > 0 && props.editable;

  const choose = (slug: AgentBadgeSlug) => {
    if (!slash) return;
    const next = takeSlash(props.text, slash);
    props.onChangeText(next.text);
    setSelection({ start: next.cursor, end: next.cursor });
    props.onBadges(addBadge(props.badges, slug));
    props.inputRef.current?.focus();
  };

  const chips =
    props.badges.length > 0 || props.attachments.length > 0 || props.place ? (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} testID="agent-input-chips">
        {props.place ? (
          <Chip
            label={props.place.label}
            icon="map-pin"
            size="sm"
            disabled={!props.editable}
            accessibilityLabel={props.place.accessibilityLabel}
            onPress={props.place.onPress}
            testID="agent-place-chip"
          />
        ) : null}
        {props.badges.map((slug) => (
          <Chip
            key={slug}
            label={badgeLabel(slug)}
            tone="ki"
            size="sm"
            removable
            disabled={!props.editable}
            accessibilityLabel={`${badgeLabel(slug)} entfernen`}
            onPress={() => props.onBadges(props.badges.filter((entry) => entry !== slug))}
            testID={`agent-badge-${slug}`}
          />
        ))}
        {props.attachments.map((entry) => (
          <Chip
            key={entry.key}
            label={entry.label}
            icon={entry.attachment.kind === 'image' ? 'image' : 'file-text'}
            size="sm"
            disabled={!props.editable}
            accessibilityLabel={`${entry.label} ansehen`}
            onPress={() => props.onPreview(previewOf(entry))}
            onRemove={() => props.onRemoveAttachment(entry.key)}
            removeLabel={`${entry.label} entfernen`}
            testID={`agent-attachment-${entry.key}`}
          />
        ))}
      </View>
    ) : null;

  return (
    <View style={{ gap: 6 }}>
      {menu ? (
        // UI review 27.11.: one line per area, no heading, so the menu stays small over the keyboard.
        <Surface testID="agent-slash-menu" padding={4} style={{ gap: 0 }}>
          {matches.map((badge) => (
            <Pressable
              key={badge.slug}
              accessibilityRole="button"
              accessibilityLabel={`/${badge.label}: ${badge.line}`}
              onPress={() => choose(badge.slug)}
              testID={`agent-slash-${badge.slug}`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                minHeight: 44,
                paddingHorizontal: 10,
                borderRadius: theme.shape.radius.control,
                backgroundColor: pressed ? theme.colors.surfaceSunken : 'transparent',
              })}
            >
              <Text variant="bodyStrong">/{badge.label}</Text>
              <Text variant="small" color="muted" numberOfLines={1} style={{ flex: 1 }}>
                {badge.line}
              </Text>
            </Pressable>
          ))}
        </Surface>
      ) : null}
      <DictationField
        accessibilityLabel="Nachricht an den Agent"
        placeholder={props.placeholder}
        value={props.text}
        onChangeText={(next) => {
          // Typing leaves the cursor behind the change; a reported selection corrects it.
          setSelection({ start: next.length, end: next.length });
          props.onChangeText(next);
        }}
        onSelection={setSelection}
        onKeyPress={(event) => {
          if (event.nativeEvent.key !== 'Backspace') return;
          const next = backspaceRemovesBadge(props.badges, selection);
          if (next) props.onBadges(next);
        }}
        editable={props.editable}
        multiline
        grow
        growLines={4.5}
        round
        top={chips}
        left={
          <IconButton
            icon="plus"
            label="Foto oder Datei anhängen"
            variant="plain"
            disabled={!props.editable || props.preparing}
            onPress={() => pickImageFile(props.onPickFile, { accept: ATTACHMENT_ACCEPT })}
            testID="agent-attach"
          />
        }
        dictation={props.dictation}
        onSubmitEditing={() => {
          const first = matches[0];
          if (menu && first) choose(first.slug);
          else props.onSubmit();
        }}
        blurOnSubmit={!menu}
        returnKeyType="send"
        inputRef={props.inputRef}
        testID="agent-input"
        trailing={props.trailing}
      />
    </View>
  );
}
