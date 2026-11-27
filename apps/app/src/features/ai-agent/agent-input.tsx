import {
  addBadge,
  backspaceRemovesBadge,
  badgeLabel,
  matchBadges,
  slashQuery,
  takeSlash,
  type AgentBadgeSlug,
} from '@housekeeping/core';
import {
  Chip,
  IconButton,
  List,
  ListRow,
  pickImageFile,
  Surface,
  Text,
} from '@housekeeping/ui';
import { useState, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { View, type TextInput } from 'react-native';

import { DictationField } from '@/features/shell/dictation-field';
import type { PromptDictation } from '@/lib/use-prompt-dictation';

import { ATTACHMENT_ACCEPT, type PickedAttachment } from './agent-attachments';

// Spec 0067, REQ-004/REQ-005: the agent's input. Badges and attachments stand inside the field
// above the text, as chips with ✕ — never as free text; backspace right behind the badges removes
// the last one whole (AC-007). "/" opens the badges above the field, typing filters them (AC-006).
// The field grows to 4.5 lines and then scrolls (AC-009); "+" opens the picker for photos and PDF.

export interface AgentInputProps {
  text: string;
  onChangeText: (text: string) => void;
  badges: readonly AgentBadgeSlug[];
  onBadges: (badges: AgentBadgeSlug[]) => void;
  attachments: readonly PickedAttachment[];
  onRemoveAttachment: (key: string) => void;
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
}

export function AgentInput(props: AgentInputProps) {
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
    props.badges.length > 0 || props.attachments.length > 0 ? (
      <View
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}
        testID="agent-input-chips"
      >
        {props.badges.map((slug) => (
          <Chip
            key={slug}
            label={badgeLabel(slug)}
            tone="ki"
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
            removable
            disabled={!props.editable}
            accessibilityLabel={`${entry.label} entfernen`}
            onPress={() => props.onRemoveAttachment(entry.key)}
            testID={`agent-attachment-${entry.key}`}
          />
        ))}
      </View>
    ) : null;

  return (
    <View style={{ gap: 8 }}>
      {menu ? (
        <Surface testID="agent-slash-menu" style={{ padding: 4, gap: 2 }}>
          <Text variant="caption" color="muted" style={{ paddingHorizontal: 10, paddingTop: 6 }}>
            Bereich wählen
          </Text>
          <List>
            {matches.map((badge) => (
              <ListRow
                key={badge.slug}
                title={`/${badge.label}`}
                subtitle={badge.line}
                onPress={() => choose(badge.slug)}
                testID={`agent-slash-${badge.slug}`}
              />
            ))}
          </List>
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
