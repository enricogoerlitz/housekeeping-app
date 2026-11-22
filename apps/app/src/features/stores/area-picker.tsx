import { assignArticleArea, createArea, useAreas } from '@housekeeping/api';
import { matchSearchOrCreate, type Id } from '@housekeeping/core';
import { Icon, List, ListRow, SearchOrCreate, Stack, Text } from '@housekeeping/ui';
import { useState } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';

import { useNewAreaHint } from './area-hint';

const FAILED = 'Das hat nicht geklappt.';

/**
 * The one area picker (spec 0025, REQ-010) of "Posten bearbeiten", "Artikel bearbeiten" and
 * "Liegt woanders …": "Bereich suchen oder anlegen", "Ohne Bereich" on top, every area in the
 * order without store, the current one with ✓, and „Deko“ neu anlegen while typing. Assigning is
 * the store action "Bereich zuordnen" and works offline; creating an area needs the network
 * (AC-036, AC-037). `onPicked` gets the name of the chosen area, undefined for "Ohne Bereich".
 */
export function AreaPicker(props: {
  articleId: Id;
  currentAreaId: Id | undefined;
  onPicked: (areaName: string | undefined) => void;
  testID: string;
}) {
  const areas = useAreas();
  const online = useOnlineOnly();
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | undefined>();
  const newAreaHint = useNewAreaHint();
  const result = matchSearchOrCreate(query, areas);
  const name = query.trim();
  const sorted = [...areas].sort((a, b) => a.sort - b.sort);

  const pick = (areaId: Id | undefined) => {
    if (areaId !== props.currentAreaId) assignArticleArea(props.articleId, areaId);
    props.onPicked(areas.find((area) => area.id === areaId)?.name);
  };
  const create = () => {
    try {
      const areaId = createArea(name);
      if (areaId !== props.currentAreaId) assignArticleArea(props.articleId, areaId);
      props.onPicked(name);
      newAreaHint(name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : FAILED);
    }
  };
  const check = (selected: boolean) =>
    selected ? <Icon name="check" size={18} color="accent" /> : undefined;

  return (
    <Stack gap={12}>
      <SearchOrCreate
        query={query}
        onQueryChange={(value) => {
          setQuery(value);
          setError(undefined);
        }}
        label="Bereich suchen"
        placeholder="Bereich suchen oder anlegen"
        clearLabel="Suche leeren"
        autoFocus
        hits={result.matches.map((match) => ({ key: match.item.id, title: match.item.name }))}
        onSelect={pick}
        createOptions={result.canCreate ? [{ key: 'area', label: `„${name}“ neu anlegen` }] : []}
        onCreate={create}
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
        testID={`${props.testID}-search`}
      />
      {error ? (
        <Text variant="small" color="warn" testID={`${props.testID}-error`}>
          {error}
        </Text>
      ) : null}
      {name === '' ? (
        <List testID={`${props.testID}-all`}>
          {[
            <ListRow
              key="none"
              title="Ohne Bereich"
              trailing={check(props.currentAreaId === undefined)}
              onPress={() => pick(undefined)}
              testID={`${props.testID}-option-none`}
            />,
            ...sorted.map((area) => (
              <ListRow
                key={area.id}
                title={area.name}
                trailing={check(area.id === props.currentAreaId)}
                accessibilityLabel={
                  area.id === props.currentAreaId ? `${area.name}, ausgewählt` : area.name
                }
                onPress={() => pick(area.id)}
                testID={`${props.testID}-option-${area.id}`}
              />
            )),
          ]}
        </List>
      ) : null}
    </Stack>
  );
}
