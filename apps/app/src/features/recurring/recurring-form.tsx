import {
  catalogChoice,
  createArticle,
  createRecurringItem,
  deleteRecurringItem,
  snapshot,
  starterCatalogEntries,
  updateRecurringItem,
  useArticles,
  useRecurringItems,
  useToday,
} from '@housekeeping/api';
import {
  AMOUNT_NOT_RECOGNIZED,
  nextRecurringDay,
  parseItemAmount,
  recurringAmountLabel,
  recurringDraftProblem,
  recurringItemTitle,
  recurringNextText,
  recurringRepeat,
  recurringRule,
  searchArticleCatalog,
  type Id,
  type RepeatDraft,
} from '@housekeeping/core';
import {
  Button,
  Row,
  SearchOrCreate,
  Stack,
  SwitchRow,
  Text,
  TextField,
  toast,
  type SheetAction,
} from '@housekeeping/ui';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { RepeatFields } from '@/features/activities/series-fields';
import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';
import { undoAction, useOnlineOnly } from '@/features/shell/offline';

const KINDS = ['weekly', 'monthly'] as const;

export interface RecurringFormProps {
  /** The Dauerposten to change; without it a new one. */
  recurringId?: Id;
  /** A new one for this article ("Regelmäßig kaufen ›" at the article, AC-010). */
  articleId?: Id;
  /** Saved, deleted or nothing left to show. */
  onDone: () => void;
  /** "Öffnen ›" at "Für Cola gibt es schon einen Dauerposten" (AC-008). */
  onOpen: (recurringId: Id) => void;
  /**
   * A new value starts the fields again from what is stored: the step of "Artikel bearbeiten"
   * keeps the form while it shows the article's other fields (I-05, review 0004).
   */
  session?: number;
}

export interface RecurringForm {
  title: string;
  body: ReactNode;
  save: SheetAction;
  /** "Löschen" of an existing one. */
  remove?: SheetAction;
}

/** The article of a new Dauerposten: "Suchen oder anlegen" like "+ Neu" on "Artikel". */
function ArticleChoice(props: { onChosen: (articleId: Id) => void; disabled: boolean }) {
  const articles = useArticles();
  const online = useOnlineOnly();
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | undefined>();
  const result = searchArticleCatalog(query, articles, starterCatalogEntries);
  const name = query.trim();
  const attempt = (action: () => Id) => {
    try {
      props.onChosen(action());
    } catch (caught) {
      setError(errorMessage(caught, FAILED_MESSAGE));
    }
  };
  return (
    <Stack gap={6}>
      <SearchOrCreate
        query={query}
        onQueryChange={(value) => {
          setQuery(value);
          setError(undefined);
        }}
        label="Artikel"
        placeholder="Artikel suchen, z. B. Milch"
        clearLabel="Eingabe leeren"
        autoFocus
        hits={result.matches.map(({ item, matchedSynonym }) => ({
          key: item.id,
          title: item.name,
          detail: matchedSynonym ? `auch: ${matchedSynonym}` : undefined,
        }))}
        onSelect={(key) => {
          const match = result.matches.find((candidate) => candidate.item.id === key);
          if (match) attempt(() => catalogChoice(match.item).id);
        }}
        createOptions={
          result.canCreate && !props.disabled
            ? [{ key: 'article', label: `„${name}“ neu anlegen` }]
            : []
        }
        onCreate={() => attempt(() => createArticle({ name }))}
        createDisabledHint={online.hint}
        testID="recurring-article-search"
      />
      {error ? (
        <Text variant="small" color="warn" testID="recurring-article-error">
          {error}
        </Text>
      ) : null}
    </Stack>
  );
}

/**
 * The fields of a Dauerposten (spec 0060, REQ-001): Artikel, Menge, Zusatz, Rhythmus (weekly on
 * weekdays every N weeks, or monthly on a day) and "Pausiert", with "Anlegen" (a new one) or
 * "Speichern" and "Löschen" (an existing one).
 * Shown in its own window on "Dauerposten" and as a step of "Artikel bearbeiten". Online only.
 */
export function useRecurringForm(props: RecurringFormProps): RecurringForm {
  const recurringItems = useRecurringItems();
  const articles = useArticles();
  const today = useToday();
  const online = useOnlineOnly();
  const existing = recurringItems.find((item) => item.id === props.recurringId);

  const stored = () => ({
    articleId: existing?.articleId ?? props.articleId,
    amountText: existing ? recurringAmountLabel(existing).replace(/^(\d+)×$/, '$1') : '1',
    note: existing?.note ?? '',
    repeat: recurringRepeat(existing?.rule, today),
    paused: existing?.paused ?? false,
  });
  const [articleId, setArticleId] = useState<Id | undefined>(() => stored().articleId);
  const [amountText, setAmountText] = useState(() => stored().amountText);
  const [note, setNote] = useState(() => stored().note);
  const [repeat, setRepeat] = useState<RepeatDraft>(() => stored().repeat);
  const [paused, setPaused] = useState(() => stored().paused);
  const [error, setError] = useState<string | undefined>();
  // A new `session` starts again from what is stored (state adjusted while rendering).
  const [session, setSession] = useState(props.session);
  if (session !== props.session) {
    const fresh = stored();
    setSession(props.session);
    setArticleId(fresh.articleId);
    setAmountText(fresh.amountText);
    setNote(fresh.note);
    setRepeat(fresh.repeat);
    setPaused(fresh.paused);
    setError(undefined);
  }

  const article = articles.find((candidate) => candidate.id === articleId);
  const problem = recurringDraftProblem(
    { id: existing?.id, articleId, articleName: article?.name ?? '', amountText, repeat },
    recurringItems,
  );
  const duplicate = articleId
    ? recurringItems.find((item) => item.articleId === articleId && item.id !== existing?.id)
    : undefined;
  const rule = recurringRule(repeat);
  const ruleChanged = !existing || JSON.stringify(existing.rule) !== JSON.stringify(rule);
  const next = nextRecurringDay(
    {
      rule,
      startsOn: ruleChanged ? today : (existing?.startsOn ?? today),
      paused,
      lastAddedOn: existing?.lastAddedOn,
    },
    today,
  );
  const offlineGrey = online.disabled ? { opacity: 0.45 } : undefined;
  // The amount's own message, also while no article is chosen yet (that one says "Wähl einen Artikel.").
  const amountProblem =
    parseItemAmount(amountText) === undefined ? AMOUNT_NOT_RECOGNIZED : undefined;

  const save = () => {
    const amount = parseItemAmount(amountText);
    if (problem || !amount || !articleId) return;
    try {
      if (existing) {
        updateRecurringItem(existing.id, { amount, note, rule, paused }, today);
      } else {
        createRecurringItem({ articleId, amount, note, rule, paused }, today);
        toast.show({ message: `Dauerposten „${article?.name ?? ''}“ angelegt` });
      }
      props.onDone();
    } catch (caught) {
      setError(errorMessage(caught, FAILED_MESSAGE));
    }
  };

  const remove = () => {
    if (!existing) return;
    const restore = snapshot();
    const name = article ? recurringItemTitle(existing, article) : 'Dauerposten';
    try {
      deleteRecurringItem(existing.id);
    } catch (caught) {
      setError(errorMessage(caught, FAILED_MESSAGE));
      return;
    }
    props.onDone();
    toast.show({
      message: `${name} entfernt`,
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
    });
  };

  const body = (
    <Stack gap={16}>
      {online.hint ? (
        <Text variant="small" color="warn" testID="recurring-offline-hint">
          {online.hint}
        </Text>
      ) : null}
      {article ? (
        <Row gap={8} style={{ alignItems: 'center' }}>
          <Text variant="bodyStrong" style={{ flex: 1 }} testID="recurring-article">
            {article.name}
          </Text>
          {!existing && !props.articleId ? (
            <Button
              label="Anderer Artikel"
              variant="link"
              size="sm"
              onPress={() => setArticleId(undefined)}
              testID="recurring-article-change"
            />
          ) : null}
        </Row>
      ) : (
        <ArticleChoice onChosen={setArticleId} disabled={online.disabled} />
      )}
      {duplicate ? (
        <Row gap={8} style={{ alignItems: 'center' }} wrap>
          <Text variant="small" color="warn" testID="recurring-duplicate">
            {`Für ${article?.name ?? ''} gibt es schon einen Dauerposten`}
          </Text>
          <Button
            label="Öffnen ›"
            variant="link"
            size="sm"
            onPress={() => props.onOpen(duplicate.id)}
            testID="recurring-duplicate-open"
          />
        </Row>
      ) : null}
      <View style={[{ gap: 6 }, offlineGrey]}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ width: 120 }}>
            <TextField
              label="Menge"
              value={amountText}
              onChangeText={(value) => {
                setAmountText(value);
                setError(undefined);
              }}
              placeholder="z. B. 2"
              editable={!online.disabled}
              // D-05 (review 0004): the message stands below the row, not in the narrow field.
              invalid={amountProblem !== undefined}
              testID="recurring-amount"
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label="Zusatz"
              value={note}
              onChangeText={setNote}
              placeholder="z. B. laktosefrei"
              maxLength={200}
              editable={!online.disabled}
              testID="recurring-note"
            />
          </View>
        </View>
        {amountProblem ? (
          <Text variant="small" color="warn" testID="recurring-amount-error">
            {amountProblem}
          </Text>
        ) : null}
      </View>
      <View style={offlineGrey} pointerEvents={online.disabled ? 'none' : 'auto'}>
        <RepeatFields
          value={repeat}
          onChange={setRepeat}
          startsOn={today}
          today={today}
          kinds={KINDS}
          withoutEnd
          disabled={online.disabled}
        />
      </View>
      <SwitchRow
        label="Pausiert"
        description="Kommt nicht auf die Liste, bis du es wieder einschaltest"
        value={paused}
        disabled={online.disabled}
        onValueChange={setPaused}
        testID="recurring-paused"
      />
      <Text variant="small" color="muted" testID="recurring-next">
        {paused || next === undefined
          ? 'Pausiert – kommt nicht auf die Liste.'
          : `Kommt ${recurringNextText(next, today)} von selbst auf die Liste.`}
      </Text>
      {error ? (
        <Text variant="small" color="warn" testID="recurring-error">
          {error}
        </Text>
      ) : null}
    </Stack>
  );

  return {
    title: existing ? 'Dauerposten bearbeiten' : 'Neuer Dauerposten',
    body,
    save: {
      // N-10 (review 0004): a new one is created, an existing one changed.
      label: existing ? 'Speichern' : 'Anlegen',
      icon: 'check',
      disabled: online.disabled || problem !== undefined,
      hint: online.hint ?? (articleId ? problem : undefined),
      onPress: save,
      testID: 'recurring-save',
    },
    remove: existing
      ? {
          label: 'Löschen',
          icon: 'trash',
          disabled: online.disabled,
          hint: online.hint,
          onPress: remove,
          testID: 'recurring-delete',
        }
      : undefined,
  };
}
