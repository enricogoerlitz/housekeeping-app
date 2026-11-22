import {
  addFeedback,
  toggleFeedbackVote,
  useCurrentMemberId,
  useFeedback,
  useMembersById,
  useToday,
} from '@housekeeping/api';
import { fuzzyIncludes, relativeDayLabel, toISODate, type FeedbackEntry } from '@housekeeping/core';
import {
  Badge,
  Button,
  Chip,
  ChoiceChips,
  EmptyState,
  Icon,
  Row,
  Screen,
  ScreenHeader,
  Section,
  Stack,
  Surface,
  Text,
  TextField,
  toast,
  useBreakpoint,
  type BadgeProps,
  type IconName,
} from '@housekeeping/ui';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useBackToManage } from '@/features/manage/navigation';
import { usePageParams } from '@/lib/url-state';
import { useOnlineOnly } from '@/features/shell/offline';

type Kind = FeedbackEntry['kind'];
type Status = FeedbackEntry['status'];
type Filter = Status | 'all';

const KIND_ICON: Record<Kind, IconName> = {
  idea: 'lightbulb',
  problem: 'bug',
  praise: 'thumbs-up',
};
const KIND_LABEL: Record<Kind, string> = { idea: 'Idee', problem: 'Problem', praise: 'Lob' };
const KIND_PLACEHOLDER: Record<Kind, string> = {
  idea: 'Was würde euch helfen?',
  problem: 'Was hat nicht geklappt?',
  praise: 'Was gefällt dir?',
};
const STATUS_LABEL: Record<Status, string> = {
  new: 'neu',
  accepted: 'angenommen',
  rejected: 'abgelehnt',
  done: 'umgesetzt',
};
const STATUS_TONE: Record<Status, BadgeProps['tone']> = {
  new: 'accent',
  accepted: 'neutral',
  rejected: 'neutral',
  done: 'success',
};
const FILTERS: Filter[] = ['all', 'new', 'accepted', 'rejected', 'done'];
const STATUS_OF_SLUG = {
  neu: 'new',
  angenommen: 'accepted',
  abgelehnt: 'rejected',
  erledigt: 'done',
} as const satisfies Record<string, Status>;
const SLUG_OF_STATUS = {
  new: 'neu',
  accepted: 'angenommen',
  rejected: 'abgelehnt',
  done: 'erledigt',
} as const satisfies Record<Status, keyof typeof STATUS_OF_SLUG>;

/** Open entries that look like the text being typed, so people add "+1" instead of a duplicate. */
function similarEntries(text: string, entries: FeedbackEntry[]): FeedbackEntry[] {
  const words = text.split(/\s+/).filter((word) => word.length >= 5);
  if (words.length === 0) return [];
  return entries
    .filter((entry) => entry.status === 'new' || entry.status === 'accepted')
    .filter((entry) => words.some((word) => fuzzyIncludes(word, entry.text)))
    .slice(0, 3);
}

/** "Verwalten" → "Feedback" (spec 0005, AC-054). */
export function FeedbackScreen() {
  const back = useBackToManage();
  const { isWide } = useBreakpoint();
  const entries = useFeedback();
  // The status filter stands in the address, `?filter=neu` (spec 0019, REQ-011).
  const address = usePageParams('feedback');
  const slug = address.params.filter;
  const filter: Filter = slug ? STATUS_OF_SLUG[slug] : 'all';
  const setFilter = (next: Filter) =>
    address.replace({ filter: next === 'all' ? undefined : SLUG_OF_STATUS[next] });

  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [entries],
  );
  const visible = filter === 'all' ? sorted : sorted.filter((entry) => entry.status === filter);

  const list = (
    <Section title="Einträge" meta={`${entries.length}`} testID="fb-list-section">
      <Stack gap={12}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {FILTERS.map((value) => (
            <Chip
              key={value}
              label={value === 'all' ? 'Alle' : STATUS_LABEL[value]}
              selected={filter === value}
              onPress={() => setFilter(value)}
              testID={`fb-filter-${value}`}
            />
          ))}
        </View>
        {visible.length === 0 ? (
          <EmptyState
            icon="message-square-plus"
            title={entries.length === 0 ? 'Noch kein Feedback' : 'Nichts in diesem Status'}
            text={
              entries.length === 0
                ? 'Ideen, Probleme und Lob landen hier – und wir sehen, was daraus wird.'
                : undefined
            }
            testID="fb-empty"
          />
        ) : (
          <View testID="fb-list" style={{ gap: 10 }}>
            {visible.map((entry) => (
              <FeedbackCard key={entry.id} entry={entry} />
            ))}
          </View>
        )}
      </Stack>
    </Section>
  );

  return (
    <Screen
      testID="feedback"
      clearFab={false}
      header={
        <ScreenHeader
          title="Feedback"
          subtitle="Ideen, Probleme und Lob für die App"
          onBack={back}
        />
      }
    >
      {isWide ? (
        <View style={{ flexDirection: 'row', gap: 32, alignItems: 'flex-start' }}>
          <View style={{ flex: 5, minWidth: 0 }}>
            <Composer entries={entries} />
          </View>
          <View style={{ flex: 6, minWidth: 0 }}>{list}</View>
        </View>
      ) : (
        <View>
          <Composer entries={entries} />
          {list}
        </View>
      )}
    </Screen>
  );
}

function Composer(props: { entries: FeedbackEntry[] }) {
  const online = useOnlineOnly();
  const me = useCurrentMemberId();
  const [kind, setKind] = useState<Kind>('idea');
  const [text, setText] = useState('');
  const similar = similarEntries(text, props.entries);
  const empty = text.trim() === '';

  const send = () => {
    if (empty || online.disabled) return;
    addFeedback({ kind, text, screen: 'Feedback' });
    setText('');
    toast.show({ message: 'Danke! Gespeichert.' });
  };

  return (
    <Section title="Neues Feedback" testID="fb-composer">
      <Surface style={{ gap: 14 }}>
        <ChoiceChips<Kind>
          label="Art"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'idea', label: 'Idee' },
            { value: 'problem', label: 'Problem' },
            { value: 'praise', label: 'Lob' },
          ]}
          testID="fb-kind"
        />
        <TextField
          accessibilityLabel={`${KIND_LABEL[kind]} beschreiben`}
          placeholder={KIND_PLACEHOLDER[kind]}
          value={text}
          onChangeText={setText}
          multiline
          testID="fb-text"
        />
        {similar.length > 0 ? (
          <View testID="fb-similar" style={{ gap: 8 }}>
            <Text variant="smallStrong">Gibt es schon ähnlich – lieber +1?</Text>
            {similar.map((entry) => {
              const voted = entry.votes.includes(me);
              return (
                <Row key={entry.id} gap={10} align="flex-start">
                  <Text variant="small" color="muted" style={{ flex: 1 }} numberOfLines={2}>
                    {entry.text}
                  </Text>
                  {entry.authorId !== me ? (
                    <Chip
                      label={voted ? '+1 gegeben' : '+1'}
                      icon="thumbs-up"
                      selected={voted}
                      disabled={online.disabled}
                      onPress={() => toggleFeedbackVote(entry.id)}
                      testID={`fb-similar-${entry.id}`}
                    />
                  ) : null}
                </Row>
              );
            })}
          </View>
        ) : null}
        <Stack gap={6}>
          <Button
            label="Senden"
            icon="send"
            onPress={send}
            disabled={empty || online.disabled}
            hint={online.hint ?? (empty ? 'Schreib zuerst, worum es geht' : undefined)}
            testID="fb-send"
          />
          {online.hint ? (
            <Text variant="small" color="muted">
              {online.hint}
            </Text>
          ) : null}
        </Stack>
      </Surface>
    </Section>
  );
}

function FeedbackCard(props: { entry: FeedbackEntry }) {
  const { entry } = props;
  const membersById = useMembersById();
  const me = useCurrentMemberId();
  const today = useToday();
  const online = useOnlineOnly();
  const author = membersById[entry.authorId]?.name ?? 'Jemand';
  const voted = entry.votes.includes(me);
  const own = entry.authorId === me;
  const day = relativeDayLabel(toISODate(new Date(entry.createdAt)), today);
  const voteLabel = entry.votes.length > 0 ? `+1 · ${entry.votes.length}` : '+1';

  return (
    <Surface testID={`fb-entry-${entry.id}`} style={{ gap: 10 }}>
      <Row gap={12} align="flex-start">
        <View style={{ paddingTop: 1 }}>
          <Icon name={KIND_ICON[entry.kind]} size={20} color="muted" />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text selectable testID={`fb-text-${entry.id}`}>
            {entry.text}
          </Text>
          <Text variant="caption" color="muted">
            {KIND_LABEL[entry.kind]} · {author} · {day}
            {entry.screen && entry.screen !== 'Feedback' ? ` · ${entry.screen}` : ''}
          </Text>
          {entry.status === 'rejected' && entry.reason ? (
            <Text variant="small" color="muted">
              Begründung: {entry.reason}
            </Text>
          ) : null}
        </View>
      </Row>
      <Row justify="space-between" gap={10}>
        <Row gap={6}>
          <Badge
            label={STATUS_LABEL[entry.status]}
            tone={STATUS_TONE[entry.status]}
            testID={`fb-status-${entry.id}`}
          />
          {entry.status === 'done' && entry.specRef ? (
            <Text variant="caption" color="muted">
              Spec {entry.specRef}
            </Text>
          ) : null}
        </Row>
        <Chip
          label={voteLabel}
          icon="thumbs-up"
          selected={voted}
          onPress={own ? undefined : () => toggleFeedbackVote(entry.id)}
          disabled={online.disabled}
          testID={`fb-vote-${entry.id}`}
        />
      </Row>
    </Surface>
  );
}
