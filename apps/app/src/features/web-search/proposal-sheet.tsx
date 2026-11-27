import {
  proposalSummary,
  proposalSummaryText,
  type ChangeProposal,
  type FieldChange,
  type RowChange,
} from '@housekeeping/core';
import {
  Badge,
  Button,
  ChoiceChips,
  LoadingLines,
  Photo,
  Sheet,
  Stack,
  Text,
  useTheme,
} from '@housekeeping/ui';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { DictationField } from '@/features/shell/dictation-field';
import { useOnlineOnly } from '@/features/shell/offline';

// The Änderungsansicht (spec 0049, REQ-005): what a proposal (Websuche or „Prompt“) would
// change on an item that exists. New and changed fields and rows are tinted yellow and carry
// "neu" / "geändert"; an old value stands small, red and struck through with ↺; a removed row
// stays visible, red and struck through, with "↺ behalten"; a new row can be left out with ×.
// Never colour alone: every change has its word. "Übernehmen" hands what is still active to the
// edit mode or the form, where "Speichern" stores it (Entscheidung 6); after ✨ "Mit KI ändern" the
// recipe page saves it at once (spec 0062, REQ-010).

const WORDS = { new: 'neu', changed: 'geändert', removed: 'entfernt' } as const;
const PHOTO_SIZE = 96;

/**
 * "Was soll noch anders sein?" (spec 0055, REQ-008): `onSend` asks the AI to change the proposal
 * and says whether a new one came; then the sentence goes, otherwise it stays (AC-027).
 */
export interface ProposalRefine {
  busy: boolean;
  error?: string;
  onSend: (wish: string) => Promise<boolean>;
}

const REFINE_MAX = 500;

function RefineLine(props: { refine: ProposalRefine; testID: string }) {
  const { refine, testID } = props;
  const online = useOnlineOnly();
  const [wish, setWish] = useState('');
  const send = () => {
    if (wish.trim() === '' || refine.busy) return;
    void refine.onSend(wish.trim()).then((done) => {
      if (done) setWish('');
    });
  };
  return (
    <Stack gap={8}>
      <DictationField
        label="Was soll noch anders sein?"
        placeholder={'z. B. „nimm Räuchertofu statt Bohnen“'}
        value={wish}
        onChangeText={(text) => setWish(text.slice(0, REFINE_MAX))}
        maxLength={REFINE_MAX}
        editable={!refine.busy && !online.disabled}
        onSubmitEditing={send}
        returnKeyType="send"
        testID={`${testID}-text`}
      />
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          label={refine.busy ? 'Wird angepasst …' : 'Anpassen'}
          icon="sparkles"
          variant="secondary"
          size="sm"
          disabled={refine.busy || online.disabled || wish.trim() === ''}
          hint={online.hint}
          onPress={send}
          testID={`${testID}-send`}
        />
      </View>
      {refine.busy ? (
        <LoadingLines label="Die KI passt den Vorschlag an …" testID={`${testID}-busy`} />
      ) : null}
      {refine.error ? (
        <Text variant="small" color="warn" testID={`${testID}-error`}>
          {refine.error}
        </Text>
      ) : null}
    </Stack>
  );
}

/** The photo a proposal brings, shown as the field "Foto" (id `photo`). */
export interface ProposedPhoto {
  uri: string;
}

function Tinted(props: { active: boolean; children: ReactNode; testID?: string }) {
  const theme = useTheme();
  return (
    <View
      testID={props.testID}
      style={{
        gap: 4,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: theme.shape.radius.control,
        backgroundColor: props.active ? theme.colors.changedBg : 'transparent',
        borderWidth: props.active ? 0 : 1,
        borderColor: theme.colors.border,
      }}
    >
      {props.children}
    </View>
  );
}

function Head(props: { label: string; word?: string; testID: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Text variant="smallStrong" style={{ flexShrink: 1 }}>
        {props.label}
      </Text>
      {props.word ? <Badge label={props.word} testID={`${props.testID}-word`} /> : null}
    </View>
  );
}

function FieldRow(props: {
  field: FieldChange;
  rejected: boolean;
  onToggle: () => void;
  photo?: ProposedPhoto;
  testID: string;
}) {
  const { field, rejected, testID } = props;
  const shownAfter = field.afterLabel ?? field.after;
  const shownBefore = field.beforeLabel ?? field.before;
  return (
    <Tinted active={!rejected} testID={testID}>
      <Head label={field.label} word={rejected ? undefined : WORDS[field.status]} testID={testID} />
      {props.photo && !rejected ? (
        <Photo
          source={{ uri: props.photo.uri }}
          width={PHOTO_SIZE}
          aspectRatio={1}
          alt="Neues Foto"
        />
      ) : null}
      {rejected ? (
        <Text variant="small" testID={`${testID}-kept`}>
          {shownBefore === '' ? 'bleibt leer' : shownBefore}
        </Text>
      ) : (
        <>
          {props.photo ? null : <Text testID={`${testID}-after`}>{shownAfter}</Text>}
          {field.status === 'changed' && shownBefore !== '' ? (
            <Text variant="small" color="removed" strike testID={`${testID}-before`}>
              {shownBefore}
            </Text>
          ) : null}
        </>
      )}
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          label={
            rejected
              ? '↺ Vorschlag nehmen'
              : field.status === 'new'
                ? '× Weglassen'
                : '↺ Alter Wert'
          }
          variant="link"
          size="sm"
          onPress={props.onToggle}
          testID={`${testID}-toggle`}
        />
      </View>
    </Tinted>
  );
}

function RowLine(props: {
  row: RowChange;
  rejected: boolean;
  onToggle: () => void;
  testID: string;
}) {
  const { row, rejected, testID } = props;
  if (row.status === 'same') {
    return (
      <View style={{ paddingVertical: 4, paddingHorizontal: 10 }} testID={testID}>
        <Text variant="small">{row.label}</Text>
      </View>
    );
  }
  const removed = row.status === 'removed';
  // A removed row reads red and struck through until "↺ behalten"; a dropped new row greys out.
  const struck = removed ? !rejected : rejected && row.status === 'new';
  const word = removed
    ? rejected
      ? 'behalten'
      : WORDS.removed
    : rejected
      ? undefined
      : WORDS[row.status];
  const toggle = removed
    ? rejected
      ? 'Doch entfernen'
      : '↺ behalten'
    : rejected
      ? '↺ Vorschlag nehmen'
      : row.status === 'new'
        ? '× Weglassen'
        : '↺ Alter Wert';
  return (
    <Tinted active={!removed && !rejected} testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text
              variant="small"
              color={removed && !rejected ? 'removed' : struck ? 'muted' : 'text'}
              strike={struck}
              style={{ flexShrink: 1 }}
            >
              {rejected && row.beforeLabel ? row.beforeLabel : row.label}
            </Text>
            {word ? <Badge label={word} testID={`${testID}-word`} /> : null}
          </View>
          {row.status === 'changed' && row.beforeLabel && !rejected ? (
            <Text variant="small" color="removed" strike testID={`${testID}-before`}>
              {row.beforeLabel}
            </Text>
          ) : null}
        </View>
        <Button
          label={toggle}
          variant="link"
          size="sm"
          onPress={props.onToggle}
          testID={`${testID}-toggle`}
        />
      </View>
    </Tinted>
  );
}

/**
 * AC-016 – AC-021: the proposal with its sticky summary; "Übernehmen" gives the ids the person
 * took back, "Alles verwerfen" closes without a change.
 */
export function ProposalSheet(props: {
  proposal: ChangeProposal;
  photo?: ProposedPhoto;
  /** Recipes: "Was soll noch anders sein?" below the proposal (spec 0055, REQ-008). */
  refine?: ProposalRefine;
  /** Spec 0062, REQ-011: a recipe from the web search can add to or replace the one there is. */
  mode?: { value: 'add' | 'replace'; onChange: (value: 'add' | 'replace') => void };
  /** Spec 0062, REQ-011: only the rows that change, not the unchanged ones of a group. */
  onlyChanges?: boolean;
  onApply: (rejected: ReadonlySet<string>) => void;
  onClose: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  const testID = props.testID ?? 'proposal';
  const [rejected, setRejected] = useState<ReadonlySet<string>>(() => new Set());
  // AC-029 (spec 0055): a new proposal starts with every change active.
  const [shown, setShown] = useState(props.proposal);
  if (shown !== props.proposal) {
    setShown(props.proposal);
    setRejected(new Set());
  }
  const toggle = (id: string) =>
    setRejected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const summary = proposalSummaryText(proposalSummary(props.proposal, rejected));
  return (
    <Sheet
      visible
      size="l"
      title="Vorschlag prüfen"
      onClose={props.onClose}
      header={
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: theme.shape.radius.control,
            backgroundColor: theme.colors.changedBg,
          }}
        >
          <Text variant="smallStrong" testID={`${testID}-summary`}>
            {summary}
          </Text>
          <Button
            label="Alles verwerfen"
            variant="link"
            size="sm"
            onPress={props.onClose}
            testID={`${testID}-discard`}
          />
        </View>
      }
      actions={{
        primary: {
          label: 'Übernehmen',
          icon: 'check',
          onPress: () => props.onApply(rejected),
          disabled: props.refine?.busy === true,
          testID: `${testID}-apply`,
        },
        cancel: { label: 'Abbrechen', onPress: props.onClose, testID: `${testID}-cancel` },
      }}
      testID={testID}
    >
      <Stack gap={16}>
        {props.mode ? (
          <ChoiceChips
            label="Ergänzen oder ersetzen?"
            options={[
              { value: 'add', label: 'Ergänzen' },
              { value: 'replace', label: 'Ersetzen' },
            ]}
            value={props.mode.value}
            onChange={props.mode.onChange}
            disabled={props.refine?.busy === true}
            testID={`${testID}-mode`}
          />
        ) : null}
        {props.proposal.fields.length > 0 ? (
          <Stack gap={8}>
            {props.proposal.fields.map((field) => (
              <FieldRow
                key={field.id}
                field={field}
                rejected={rejected.has(field.id)}
                onToggle={() => toggle(field.id)}
                photo={field.id === 'photo' ? props.photo : undefined}
                testID={`${testID}-field-${field.id}`}
              />
            ))}
          </Stack>
        ) : null}
        {props.proposal.groups.map((group) =>
          group.rows.every((row) => row.status === 'same') ? null : (
            <Stack key={group.id} gap={6}>
              <Text variant="groupLabel">{group.label}</Text>
              {(props.onlyChanges
                ? group.rows.filter((row) => row.status !== 'same')
                : group.rows
              ).map((row) => (
                <RowLine
                  key={row.id}
                  row={row}
                  rejected={rejected.has(row.id)}
                  onToggle={() => toggle(row.id)}
                  testID={`${testID}-row-${row.id.replace(':', '-')}`}
                />
              ))}
            </Stack>
          ),
        )}
        {props.refine ? <RefineLine refine={props.refine} testID={`${testID}-refine`} /> : null}
      </Stack>
    </Sheet>
  );
}
