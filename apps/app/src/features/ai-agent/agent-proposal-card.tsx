import {
  agentProposalData,
  runAgentCommand,
  snapshot,
  syncNow,
  useAgentProposalData,
} from '@housekeeping/api';
import {
  applyLabel,
  isDeleteKind,
  namedEntity,
  recheckAction,
  resolveAction,
  STALE_HINT,
  type AgentEntityRef,
  type AgentProposal,
  type ResolvedEntry,
} from '@housekeeping/core';
import { Button, Icon, SelectRow, Surface, Text, toast, useTheme } from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { confirmFirst } from '@/features/shell/confirm-dialog';
import { errorMessage } from '@/features/shell/error-message';
import { useOnlineOnly } from '@/features/shell/offline';

import { AgentEntities } from './agent-entities';

// Spec 0067, REQ-009: the collect card of a proposal. Every entry is a row with its line from the
// household's data and a check mark; "n übernehmen" runs the ticked ones one by one through the
// app's own commands, each with its own result (AC-018, AC-019); before that the data is read
// again and an entry changed meanwhile is unticked with a hint. "Rückgängig" takes back what was
// applied. A delete is never ticked with the others: it has its own button and asks first. A card
// of a chat from "Verlauf" only shows what was proposed.

type EntryState =
  | { phase: 'open'; selected: boolean; note?: string }
  | { phase: 'running' }
  | { phase: 'done' }
  | { phase: 'failed'; reason: string }
  | { phase: 'undone' };

const RESULT: Record<'done' | 'undone' | 'running', string> = {
  done: 'Übernommen',
  undone: 'Zurückgenommen',
  running: 'Wird übernommen …',
};

export function AgentProposalCard(props: {
  proposal: AgentProposal;
  /** From "Verlauf": shown, not applied (it may have been applied then). */
  loaded: boolean;
  testID: string;
}) {
  const { proposal, testID } = props;
  const theme = useTheme();
  const online = useOnlineOnly();
  const data = useAgentProposalData();
  // What the rows were when the card came: a later change is "stale" (REQ-009).
  const [seen, setSeen] = useState<string[]>(() => {
    const now = data;
    return proposal.actions.map((action) => (now ? resolveAction(action, now).seen : ''));
  });
  const [states, setStates] = useState<EntryState[]>(() =>
    proposal.actions.map((action) => ({ phase: 'open', selected: !isDeleteKind(action.kind) })),
  );
  const [restore, setRestore] = useState<(() => void) | undefined>();
  // Preview 28.11.: what applying made or changed shows as its card under the proposal.
  const [made, setMade] = useState<AgentEntityRef[]>([]);
  const [busy, setBusy] = useState(false);

  const entries: ResolvedEntry[] = proposal.actions.map((action) =>
    data
      ? resolveAction(action, data)
      : { title: action.name, detail: '', destructive: false, seen: '' },
  );
  const setState = (index: number, next: EntryState) =>
    setStates((current) => current.map((state, at) => (at === index ? next : state)));

  const chosen = states.flatMap((state, index) =>
    state.phase === 'open' && state.selected && !entries[index]?.problem ? [index] : [],
  );

  /** Runs the given entries one by one; returns how many went through. */
  const run = async (indexes: readonly number[]): Promise<number> => {
    let applied = 0;
    for (const index of indexes) {
      const entry = resolveAction(proposal.actions[index]!, agentProposalData());
      if (!entry.command) {
        setState(index, { phase: 'failed', reason: entry.problem ?? 'Geht nicht mehr' });
        continue;
      }
      setState(index, { phase: 'running' });
      try {
        const touched = await runAgentCommand(entry.command);
        if (touched)
          setMade((current) =>
            current.some((ref) => ref.id === touched.id) ? current : [...current, touched],
          );
        setState(index, { phase: 'done' });
        applied += 1;
      } catch (error) {
        setState(index, { phase: 'failed', reason: errorMessage(error) });
      }
    }
    return applied;
  };

  const apply = async () => {
    if (busy || chosen.length === 0 || online.disabled) return;
    setBusy(true);
    // Read again before applying: another device may have changed something (REQ-009).
    await syncNow().catch(() => undefined);
    const now = agentProposalData();
    const ready: number[] = [];
    const nextSeen = [...seen];
    for (const index of chosen) {
      const check = recheckAction(proposal.actions[index]!, seen[index] ?? '', now);
      nextSeen[index] = check.entry.seen;
      if (check.result === 'failed')
        setState(index, { phase: 'failed', reason: check.entry.problem ?? 'Geht nicht mehr' });
      else if (check.result === 'stale')
        setState(index, { phase: 'open', selected: false, note: STALE_HINT });
      else ready.push(index);
    }
    // Ticking a stale entry again takes the state it shows now.
    setSeen(nextSeen);
    const undo = snapshot();
    const applied = await run(ready);
    if (applied > 0) setRestore(() => undo);
    setBusy(false);
  };

  const undoAll = () => {
    if (!restore) return;
    try {
      restore();
      setStates((current) =>
        current.map((state) => (state.phase === 'done' ? { phase: 'undone' } : state)),
      );
      setRestore(undefined);
      setMade([]);
    } catch (error) {
      toast.show({ message: errorMessage(error) });
    }
  };

  const removeOne = (index: number) => {
    const entry = entries[index];
    if (!entry?.command) return;
    confirmFirst({
      title: `„${entry.title}“ – ${entry.detail}?`,
      confirmLabel: 'Löschen',
      onConfirm: () => {
        const undo = snapshot();
        void run([index]).then((applied) => {
          if (applied > 0) setRestore(() => undo);
        });
      },
      testID: `${testID}-confirm`,
    });
  };

  const anyDone = states.some((state) => state.phase === 'done');
  // A chat from "Verlauf": the entries of the proposal the household has now.
  const shown: AgentEntityRef[] = props.loaded
    ? proposal.actions.flatMap((action) => {
        if (!data || isDeleteKind(action.kind) || action.kind === 'add_to_list') return [];
        const target = namedEntity(action.name, data);
        return target ? [{ kind: target.kind, id: target.id }] : [];
      })
    : made;
  const cards = shown.filter(
    (ref, index) => shown.findIndex((other) => other.id === ref.id) === index,
  );
  const openRows = states.some((state) => state.phase === 'open');

  return (
    <Surface testID={testID} style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="sparkles" size={18} color="accent" />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {proposal.title ?? 'Vorschlag'}
        </Text>
      </View>
      {props.loaded ? (
        <Text variant="small" color="muted" testID={`${testID}-loaded`}>
          Vorschlag aus diesem Chat – zum Übernehmen frag noch einmal.
        </Text>
      ) : null}
      <View>
        {proposal.actions.map((action, index) => {
          const entry = entries[index]!;
          const state = states[index]!;
          const rowId = `${testID}-entry-${index}`;
          const status =
            state.phase === 'failed'
              ? state.reason
              : state.phase === 'open'
                ? (state.note ?? entry.problem)
                : RESULT[state.phase];
          const warned = state.phase === 'failed' || (state.phase === 'open' && !!entry.problem);
          if (props.loaded || state.phase !== 'open' || entry.problem) {
            return (
              <View
                key={index}
                testID={rowId}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: 48,
                  paddingVertical: 6,
                  paddingHorizontal: 4,
                }}
              >
                <Icon
                  name={
                    state.phase === 'done'
                      ? 'check'
                      : state.phase === 'failed' || entry.problem
                        ? 'circle-alert'
                        : state.phase === 'undone'
                          ? 'undo'
                          : state.phase === 'running'
                            ? 'clock'
                            : 'list-checks'
                  }
                  size={18}
                  color={state.phase === 'done' ? 'accent' : 'muted'}
                />
                <View style={{ flex: 1 }}>
                  <Text variant="rowTitle">{entry.title}</Text>
                  {/* A result reads in the line of what happened: "Auf die Liste · Übernommen". */}
                  <Text variant="small" color="muted" testID={`${rowId}-status`}>
                    {warned || !status || props.loaded
                      ? entry.detail
                      : `${entry.detail} · ${status}`}
                  </Text>
                  {warned && status && !props.loaded ? (
                    <Text variant="small" color="warn" testID={`${rowId}-reason`}>
                      {status}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          }
          if (isDeleteKind(action.kind)) {
            return (
              <View
                key={index}
                testID={rowId}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: 48,
                  paddingVertical: 6,
                  paddingHorizontal: 4,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: theme.colors.border,
                }}
              >
                <Icon name="trash" size={18} color="muted" />
                <View style={{ flex: 1 }}>
                  <Text variant="rowTitle">{entry.title}</Text>
                  <Text variant="small" color="muted">
                    {entry.detail}
                  </Text>
                </View>
                <Button
                  label="Löschen …"
                  variant="link"
                  quiet
                  size="sm"
                  disabled={online.disabled || busy}
                  hint={online.hint}
                  onPress={() => removeOne(index)}
                  testID={`${rowId}-delete`}
                />
              </View>
            );
          }
          return (
            <SelectRow
              key={index}
              title={entry.title}
              subtitle={entry.detail}
              hint={state.note}
              selected={state.selected}
              disabled={busy}
              onToggle={() => setState(index, { phase: 'open', selected: !state.selected })}
              testID={rowId}
            />
          );
        })}
      </View>
      {!props.loaded && (openRows || anyDone) ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          {openRows && chosen.length > 0 ? (
            <Button
              label={applyLabel(chosen.length)}
              icon="check"
              size="sm"
              disabled={busy || online.disabled}
              hint={online.hint}
              onPress={() => void apply()}
              testID={`${testID}-apply`}
            />
          ) : null}
          {restore ? (
            <Button
              label="Rückgängig"
              icon="undo"
              variant="secondary"
              size="sm"
              disabled={busy || online.disabled}
              hint={online.hint}
              onPress={undoAll}
              testID={`${testID}-undo`}
            />
          ) : null}
        </View>
      ) : null}
      {cards.length > 0 ? (
        <AgentEntities
          extra={{ kind: 'entities', id: `${proposal.id}-made`, items: cards }}
          testID={`${testID}-made`}
        />
      ) : null}
    </Surface>
  );
}
