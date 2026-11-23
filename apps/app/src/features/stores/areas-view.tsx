import {
  createArea,
  deleteArea,
  mergeAreas,
  moveArea,
  renameArea,
  snapshot,
  useAreas,
  useArticles,
} from '@housekeeping/api';
import {
  areaDeleteQuestion,
  areaMergeQuestion,
  articleCountsByArea,
  validateAreaName,
  type Id,
} from '@housekeeping/core';
import {
  Button,
  EmptyState,
  Icon,
  IconButton,
  List,
  ListRow,
  Menu,
  ReorderList,
  Section,
  Text,
  toast,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { undoAction, useOnlineOnly } from '@/features/shell/offline';

import { useNewAreaHint } from './area-hint';
import { articleCount, messageOf, ORDER_LABELS } from './labels';
import { ConfirmDialog } from '@/features/shell/confirm-dialog';

import { MergeAreaPicker, NameSheet } from './store-dialogs';

type AreaAction = 'rename' | 'merge' | 'delete';
type Dialog =
  | { kind: 'new' }
  | { kind: 'rename'; areaId: Id }
  | { kind: 'mergePick'; areaId: Id }
  | { kind: 'mergeConfirm'; areaId: Id; targetId: Id }
  | { kind: 'delete'; areaId: Id };

/**
 * "Märkte & Bereiche" → "Bereiche" (REQ-010): the household's areas in the order without store,
 * each with its number of articles and ⋯ ("Umbenennen", "Zusammenlegen mit …", "Löschen …"),
 * then "Ohne Bereich · n Artikel ›" and "+ Neuer Bereich" (AC-051).
 */
export function AreasView() {
  const areas = useAreas();
  const articles = useArticles();
  const online = useOnlineOnly();
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog | undefined>();
  const [error, setError] = useState<string | undefined>();
  const newAreaHint = useNewAreaHint();
  // "Obst & Gemüse · 85 Artikel ›" opens "Artikel" with this area as filter (spec 0025, AC-045).
  const openArticles = (areaId: Id) =>
    router.navigate({ pathname: '/artikel', params: { bereich: areaId } });
  const counts = useMemo(() => articleCountsByArea(articles, areas), [articles, areas]);
  const sorted = useMemo(() => [...areas].sort((a, b) => a.sort - b.sort), [areas]);
  const nameOf = (areaId: Id) => areas.find((area) => area.id === areaId)?.name ?? 'Bereich';
  const countOf = (areaId: Id) => counts.byArea.get(areaId) ?? 0;
  const close = () => setDialog(undefined);

  const write = (action: () => void): boolean => {
    try {
      action();
      setError(undefined);
      return true;
    } catch (caught) {
      setError(messageOf(caught));
      return false;
    }
  };

  const remove = (areaId: Id) => {
    const name = nameOf(areaId);
    // Only an empty area comes back whole; the articles of a full one lost it on the server.
    const empty = countOf(areaId) === 0;
    const restore = snapshot();
    try {
      deleteArea(areaId);
    } catch (caught) {
      return messageOf(caught);
    }
    close();
    toast.show(
      empty
        ? {
            message: `„${name}“ gelöscht`,
            actionLabel: 'Rückgängig',
            onAction: undoAction(restore),
          }
        : { message: `„${name}“ gelöscht` },
    );
    return undefined;
  };

  const onAction = (areaId: Id, action: AreaAction) => {
    if (action === 'rename') setDialog({ kind: 'rename', areaId });
    else if (action === 'merge') setDialog({ kind: 'mergePick', areaId });
    // Without articles nothing is lost: delete at once, with "Rückgängig" (AC-056).
    else if (countOf(areaId) === 0) {
      const problem = remove(areaId);
      if (problem) setError(problem);
    } else setDialog({ kind: 'delete', areaId });
  };

  const menu = (areaId: Id, name: string) => (
    <Menu<AreaAction>
      trigger="icon"
      icon="ellipsis"
      label="Mehr"
      accessibilityLabel={`Mehr zu ${name}`}
      onChange={(action) => onAction(areaId, action)}
      options={[
        { value: 'rename', label: 'Umbenennen', disabled: online.disabled, hint: online.hint },
        {
          value: 'merge',
          label: 'Zusammenlegen mit …',
          disabled: online.disabled || areas.length < 2,
          hint: online.hint,
        },
        { value: 'delete', label: 'Löschen …', disabled: online.disabled, hint: online.hint },
      ]}
      testID={`area-menu-${areaId}`}
    />
  );

  return (
    <View testID="areas-view" style={{ maxWidth: 720 }}>
      <Text color="muted" style={{ marginBottom: 12 }}>
        Bereiche gelten im ganzen Haushalt. In dieser Reihenfolge steht die Liste, wenn kein Markt
        gewählt ist; jeder Markt hat seine eigene.
      </Text>
      {online.hint || error ? (
        <Text variant="small" color="warn" style={{ marginBottom: 10 }} testID="areas-hint">
          {error ?? online.hint}
        </Text>
      ) : null}

      <Section title="Reihenfolge ohne Markt">
        {sorted.length === 0 ? (
          <EmptyState
            icon="layers"
            title="Noch keine Bereiche"
            text="Leg einen Bereich an, z. B. „Obst & Gemüse“. Die Liste sortiert sich dann danach."
          />
        ) : (
          <ReorderList
            items={sorted.map((area) => ({
              key: area.id,
              name: area.name,
              subtitle: articleCount(countOf(area.id)),
            }))}
            onMove={(areaId, toIndex) => write(() => moveArea(areaId, toIndex))}
            labels={ORDER_LABELS}
            disabled={online.disabled}
            disabledHint={online.hint}
            trailing={(item) => (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {menu(item.key, item.name)}
                <IconButton
                  icon="chevron-right"
                  label={`Artikel in ${item.name}`}
                  onPress={() => openArticles(item.key)}
                  testID={`area-articles-${item.key}`}
                />
              </View>
            )}
            testID="areas"
          />
        )}
      </Section>

      <List>
        <ListRow
          title="Ohne Bereich"
          subtitle={articleCount(counts.withoutArea)}
          leading={<Icon name="package" color="muted" />}
          trailing={<Icon name="chevron-right" color="muted" />}
          onPress={() =>
            router.navigate({ pathname: '/artikel', params: { filter: 'ohne-bereich' } })
          }
          testID="areas-without"
        />
      </List>
      <View style={{ marginTop: 16, alignItems: 'flex-start' }}>
        <Button
          label="Neuer Bereich"
          icon="plus"
          disabled={online.disabled}
          hint={online.hint}
          onPress={() => setDialog({ kind: 'new' })}
          testID="areas-new"
        />
      </View>

      {dialog?.kind === 'new' ? (
        <NameSheet
          title="Neuer Bereich"
          label="Name"
          placeholder="z. B. Backzutaten"
          submitLabel="Anlegen"
          onSubmit={(name) => {
            const problem = validateAreaName(name, areas);
            if (problem) return problem.message;
            try {
              createArea(name);
            } catch (caught) {
              return messageOf(caught);
            }
            close();
            newAreaHint(name);
            return undefined;
          }}
          onClose={close}
          testID="area-new-sheet"
        />
      ) : null}
      {dialog?.kind === 'rename' ? (
        <NameSheet
          title="Bereich umbenennen"
          label="Name"
          initialName={nameOf(dialog.areaId)}
          submitLabel="Speichern"
          onSubmit={(name) => {
            try {
              renameArea(dialog.areaId, name);
            } catch (caught) {
              return messageOf(caught);
            }
            close();
            return undefined;
          }}
          onClose={close}
          testID="area-rename-sheet"
        />
      ) : null}
      {dialog?.kind === 'mergePick' ? (
        <MergeAreaPicker
          sourceId={dialog.areaId}
          onPick={(targetId) =>
            setDialog({ kind: 'mergeConfirm', areaId: dialog.areaId, targetId })
          }
          onClose={close}
        />
      ) : null}
      {dialog?.kind === 'mergeConfirm'
        ? (() => {
            const source = nameOf(dialog.areaId);
            const target = nameOf(dialog.targetId);
            const question = areaMergeQuestion(source, target, countOf(dialog.areaId));
            return (
              <ConfirmDialog
                title={question.title}
                message={question.message}
                confirmLabel="Zusammenlegen"
                onConfirm={() => {
                  try {
                    mergeAreas(dialog.areaId, dialog.targetId);
                  } catch (caught) {
                    return messageOf(caught);
                  }
                  close();
                  toast.show({ message: `„${source}“ ist jetzt Teil von „${target}“` });
                  return undefined;
                }}
                onCancel={close}
                testID="area-merge-dialog"
              />
            );
          })()
        : null}
      {dialog?.kind === 'delete'
        ? (() => {
            const question = areaDeleteQuestion(nameOf(dialog.areaId), countOf(dialog.areaId));
            return (
              <ConfirmDialog
                title={question.title}
                message={question.message}
                confirmLabel="Löschen"
                onConfirm={() => remove(dialog.areaId)}
                onCancel={close}
                testID="area-delete-dialog"
              />
            );
          })()
        : null}
    </View>
  );
}
