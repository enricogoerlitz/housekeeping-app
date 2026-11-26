import { createActivityKind, useActivityKinds, useActivityKindsById } from '@housekeeping/api';
import {
  activityIconLabel,
  KIND_NAME_MAX_LENGTH,
  matchSearchOrCreate,
  type ActivityIcon,
  type Id,
} from '@housekeeping/core';
import {
  Button,
  Chip,
  Icon,
  IconButton,
  IconChoice,
  Row,
  SearchOrCreate,
  Stack,
  Text,
  toast,
} from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';
import { useOnlineOnly } from '@/features/shell/offline';

import { ACTIVITY_ICON_OPTIONS } from './activity-photo';

/** The symbol a new kind starts with until one is chosen. */
const NEW_KIND_ICON: ActivityIcon = 'sparkles';

/**
 * "Art" of an activity (spec 0041, REQ-001): the chosen kind with "Ändern" and ✕, or the search
 * "Art suchen oder anlegen" with every kind as a chip and „Wellness“ neu anlegen, where the new
 * kind gets its symbol before it is created for the whole household (AC-002; online only).
 */
export function ActivityKindField(props: {
  kindId: Id | undefined;
  onChange: (kindId: Id | undefined) => void;
}) {
  const kinds = useActivityKinds();
  const kindsById = useActivityKindsById();
  const online = useOnlineOnly();
  const chosen = props.kindId === undefined ? undefined : kindsById[props.kindId];
  const [searching, setSearching] = useState(chosen === undefined);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState<string | undefined>();
  const [icon, setIcon] = useState<ActivityIcon>(NEW_KIND_ICON);
  const [error, setError] = useState<string | undefined>();
  const result = matchSearchOrCreate(query, kinds);
  const name = query.trim();

  const pick = (kindId: Id | undefined) => {
    props.onChange(kindId);
    setQuery('');
    setSearching(kindId === undefined);
  };
  const create = () => {
    if (creating === undefined) return;
    try {
      const id = createActivityKind(creating, icon);
      toast.show({ message: `Art „${creating.trim()}“ angelegt` });
      setCreating(undefined);
      pick(id);
    } catch (caught) {
      setError(errorMessage(caught, FAILED_MESSAGE));
    }
  };

  if (chosen && !searching) {
    return (
      <Stack gap={6}>
        <Text variant="smallStrong">Art</Text>
        <View
          testID="activity-kind-chosen"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
        >
          <Icon name={chosen.icon} size={20} color="muted" />
          <Text style={{ flex: 1 }} numberOfLines={1}>
            {chosen.name}
          </Text>
          <Button
            label="Ändern"
            variant="link"
            size="sm"
            onPress={() => setSearching(true)}
            testID="activity-kind-change"
          />
          <IconButton
            icon="x"
            label="Ohne Art"
            onPress={() => pick(undefined)}
            testID="activity-kind-clear"
          />
        </View>
      </Stack>
    );
  }

  if (creating !== undefined) {
    return (
      <View testID="activity-kind-new" style={{ gap: 10 }}>
        <Text variant="smallStrong">{`Symbol für „${creating.trim()}“`}</Text>
        <IconChoice
          label={`Symbol für ${creating.trim()}`}
          options={ACTIVITY_ICON_OPTIONS}
          value={icon}
          onChange={setIcon}
          testID="activity-kind-new-icon"
        />
        {error ? (
          <Text variant="small" color="warn" testID="activity-kind-error">
            {error}
          </Text>
        ) : null}
        <Row gap={10}>
          <Button
            label="Art anlegen"
            icon="check"
            size="sm"
            disabled={online.disabled}
            hint={online.hint}
            onPress={create}
            testID="activity-kind-create"
          />
          <Button
            label="Abbrechen"
            variant="secondary"
            size="sm"
            onPress={() => setCreating(undefined)}
            testID="activity-kind-create-cancel"
          />
        </Row>
      </View>
    );
  }

  return (
    <Stack gap={8}>
      <SearchOrCreate
        query={query}
        onQueryChange={(value) => {
          setQuery(value);
          setError(undefined);
        }}
        label="Art"
        placeholder="Art suchen oder anlegen"
        clearLabel="Suche leeren"
        hits={result.matches.map((match) => ({ key: match.item.id, title: match.item.name }))}
        onSelect={pick}
        createOptions={result.canCreate ? [{ key: 'kind', label: `„${name}“ neu anlegen` }] : []}
        onCreate={() => {
          if (name.length > KIND_NAME_MAX_LENGTH) {
            setError(`Höchstens ${KIND_NAME_MAX_LENGTH} Zeichen`);
            return;
          }
          setIcon(NEW_KIND_ICON);
          setError(undefined);
          setCreating(name);
        }}
        brake={
          result.similar
            ? {
                question: `Meinst du ${result.similar.name}?`,
                acceptLabel: 'Ja',
                createAnywayLabel: 'Trotzdem neu',
                onAccept: () => {
                  if (result.similar) pick(result.similar.id);
                },
              }
            : undefined
        }
        createDisabledHint={online.hint}
        testID="activity-kind"
      />
      {error ? (
        <Text variant="small" color="warn" testID="activity-kind-error">
          {error}
        </Text>
      ) : null}
      {name === '' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {kinds.map((kind) => (
            <Chip
              key={kind.id}
              label={kind.name}
              icon={kind.icon}
              selected={kind.id === props.kindId}
              onPress={() => pick(kind.id)}
              testID={`activity-kind-option-${kind.id}`}
            />
          ))}
        </View>
      ) : null}
      {chosen ? (
        <Button
          label="Abbrechen"
          variant="link"
          size="sm"
          onPress={() => setSearching(false)}
          testID="activity-kind-keep"
        />
      ) : null}
    </Stack>
  );
}

/**
 * "Symbol" of an activity (REQ-002): the kind's symbol unless an own one is chosen from the fixed
 * list; "Symbol der Art nehmen" goes back.
 */
export function ActivityIconField(props: {
  icon: ActivityIcon | undefined;
  /** The symbol without an own one: the kind's or the default. */
  fallback: ActivityIcon;
  onChange: (icon: ActivityIcon | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const shown = props.icon ?? props.fallback;
  return (
    <Stack gap={8}>
      <Text variant="smallStrong">Symbol</Text>
      <View testID="activity-icon" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name={shown} size={22} color="text" />
        <Text style={{ flex: 1 }} color="muted" numberOfLines={1} testID="activity-icon-label">
          {props.icon
            ? `${activityIconLabel(props.icon)} (eigenes)`
            : `${activityIconLabel(props.fallback)} (von der Art)`}
        </Text>
        <Button
          label={open ? 'Fertig' : 'Ändern'}
          variant="link"
          size="sm"
          onPress={() => setOpen(!open)}
          testID="activity-icon-toggle"
        />
      </View>
      {open ? (
        <Stack gap={8}>
          <IconChoice
            label="Symbol"
            options={ACTIVITY_ICON_OPTIONS}
            value={props.icon}
            onChange={(icon) => props.onChange(icon)}
            testID="activity-icon-choice"
          />
          {props.icon ? (
            <Button
              label="Symbol der Art nehmen"
              variant="link"
              size="sm"
              onPress={() => props.onChange(undefined)}
              testID="activity-icon-reset"
            />
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}
