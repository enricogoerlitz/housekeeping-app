import { matchSearchOrCreate } from '@housekeeping/core';
import {
  Button,
  CHECK_WINDOW_MS,
  CheckRow,
  ChoiceChips,
  Chip,
  EmptyState,
  FilterBar,
  Icon,
  List,
  ListRow,
  Menu,
  Row,
  RowTransition,
  SearchOrCreate,
  Section,
  Sheet,
  Stack,
  Surface,
  SwitchRow,
  Text,
  TextField,
  ViewTabs,
  useCheckWindow,
  type SheetSize,
} from '@housekeeping/ui';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import {
  KIND_LABELS,
  SAMPLE_ARTICLES,
  SAMPLE_CHECK_ITEMS,
  SAMPLE_ENTRIES,
  SAMPLE_RECIPES,
  type SampleArticle,
  type SampleKind,
  type SampleRecipe,
} from './showroom-data';

const OFFLINE_HINT = 'Offline – zum Bearbeiten brauchst du Netz';

function Block(props: { title: string; note?: string; children: ReactNode; testID: string }) {
  return (
    <Section title={props.title} testID={props.testID}>
      <Stack gap={12}>
        {props.note ? (
          <Text variant="small" color="muted">
            {props.note}
          </Text>
        ) : null}
        {props.children}
      </Stack>
    </Section>
  );
}

/** The building blocks of spec 0005 with sample data. */
export function usePatternBlocks(): ReactNode[] {
  return [
    <ViewTabsBlock key="tabs" />,
    <ChoiceBlock key="choice" />,
    <CheckWindowBlock key="check" />,
    <SheetSizesBlock key="sheets" />,
    <ArticleSearchBlock key="search" />,
    <AddEntryBlock key="add" />,
    <FilterBlock key="filter" />,
  ];
}

// ---------- REQ-004: view tabs and choice chips ----------

const FIVE_TABS = [
  { value: 'anstehend', label: 'Anstehend' },
  { value: 'alle', label: 'Alle' },
  { value: 'verlauf', label: 'Verlauf' },
  { value: 'vorlagen', label: 'Vorlagen' },
  { value: 'abwesenheiten', label: 'Abwesenheiten' },
] as const;
type FiveTab = (typeof FIVE_TABS)[number]['value'];

function ViewTabsBlock() {
  const [two, setTwo] = useState<'rezepte' | 'restaurants'>('rezepte');
  const [five, setFive] = useState<FiveTab>('anstehend');
  return (
    <Block
      title="Ansichts-Tabs"
      note="Wechseln die Ansicht. Pfeiltasten wechseln den Tab; zu viele Tabs lassen sich wischen."
      testID="showroom-viewtabs"
    >
      <ViewTabs
        label="Essen"
        value={two}
        onChange={setTwo}
        options={[
          { value: 'rezepte', label: 'Rezepte' },
          { value: 'restaurants', label: 'Restaurants' },
        ]}
        testID="showroom-tabs-two"
      />
      <ViewTabs
        label="Fünf Ansichten"
        value={five}
        onChange={setFive}
        options={[...FIVE_TABS]}
        testID="showroom-tabs-five"
      />
      <Text variant="small" color="muted" testID="showroom-tabs-five-value">
        Gewählt: {FIVE_TABS.find((tab) => tab.value === five)?.label}
      </Text>
    </Block>
  );
}

function ChoiceBlock() {
  const [kind, setKind] = useState<'idee' | 'problem' | 'lob'>('idee');
  return (
    <Block
      title="Auswahl-Chips"
      note="Genau ein Wert aus wenigen, z. B. im Formular."
      testID="showroom-choice"
    >
      <Text variant="smallStrong">Art</Text>
      <ChoiceChips
        label="Art"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'idee', label: 'Idee' },
          { value: 'problem', label: 'Problem' },
          { value: 'lob', label: 'Lob' },
        ]}
        testID="showroom-choice-kind"
      />
    </Block>
  );
}

// ---------- REQ-005: checking with the collecting window ----------

interface CheckItem {
  id: string;
  name: string;
  checked: boolean;
}

const initialCheckItems = (): CheckItem[] =>
  SAMPLE_CHECK_ITEMS.map((name) => ({ id: name.toLowerCase(), name, checked: false }));

function CheckWindowBlock() {
  const [items, setItems] = useState(initialCheckItems);
  const [settledLog, setSettledLog] = useState<string[]>([]);
  const setChecked = (id: string, checked: boolean) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, checked } : item)));
  const check = useCheckWindow({
    items,
    getId: (item) => item.id,
    isChecked: (item) => item.checked,
    // Like a shopping item: saved at once, only the moving waits.
    onToggle: (item, checked) => setChecked(item.id, checked),
    onSettle: (ids) => setSettledLog((log) => [...log, ids.length > 0 ? ids.join(', ') : '–']),
    announce: (item, checked) => `${item.name} ${checked ? 'abgehakt' : 'wieder offen'}`,
  });
  const done = items.filter((item) => item.checked && !check.rows.includes(item));
  return (
    <Block
      title="Abhaken mit Sammel-Fenster"
      note={`Haken streicht durch, nochmal tippen nimmt ihn zurück. ${CHECK_WINDOW_MS / 1000} s nach dem letzten Tipp gehen alle abgehakten Zeilen gemeinsam.`}
      testID="showroom-check-window"
    >
      <List testID="showroom-check-open">
        {check.rows.map((item) => (
          <RowTransition key={item.id}>
            <CheckRow
              title={item.name}
              checked={check.isChecked(item)}
              onToggle={() => check.toggle(item)}
              testID={`showroom-check-${item.id}`}
            />
          </RowTransition>
        ))}
      </List>
      {check.rows.length === 0 ? (
        <Text color="muted" testID="showroom-check-empty">
          Alles erledigt.
        </Text>
      ) : null}
      <Row wrap gap={8}>
        <Button
          label="Nadja hakt „Eier“ ab"
          size="sm"
          variant="secondary"
          onPress={() => setChecked('eier', true)}
          testID="showroom-check-remote-eier"
        />
        <Button
          label="Nadja hakt „Brot“ ab"
          size="sm"
          variant="secondary"
          onPress={() => setChecked('brot', true)}
          testID="showroom-check-remote-brot"
        />
        <Button
          label="Zurücksetzen"
          size="sm"
          variant="link"
          onPress={() => {
            setItems(initialCheckItems());
            setSettledLog([]);
          }}
          testID="showroom-check-reset"
        />
      </Row>
      {done.length > 0 ? (
        <View>
          <Text variant="smallStrong" color="muted">
            Erledigt
          </Text>
          <List testID="showroom-check-done">
            {done.map((item) => (
              <CheckRow
                key={item.id}
                title={item.name}
                checked
                onToggle={() => setChecked(item.id, false)}
                testID={`showroom-done-${item.id}`}
              />
            ))}
          </List>
        </View>
      ) : null}
      <Text variant="caption" color="muted" testID="showroom-check-log">
        Aufgeräumt: {settledLog.length > 0 ? settledLog.join(' · ') : 'noch nichts'}
      </Text>
    </Block>
  );
}

// ---------- REQ-003: fixed window sizes ----------

const ADD_KINDS = [
  { value: 'rezept', label: 'Rezept' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'aktivitaet', label: 'Aktivität' },
  { value: 'freitext', label: 'Freitext' },
  { value: 'reste', label: 'Reste' },
] as const;
type AddKind = (typeof ADD_KINDS)[number]['value'];
const KIND_ROWS: Record<AddKind, number> = {
  rezept: 14,
  restaurant: 3,
  aktivitaet: 6,
  freitext: 0,
  reste: 1,
};

type OpenSheet = 'small' | 'small-long' | 'small-grow' | 'medium' | 'large';

function SheetSizesBlock() {
  const [open, setOpen] = useState<OpenSheet>();
  const [grown, setGrown] = useState(false);
  const [pantryOpen, setPantryOpen] = useState(false);
  const [kind, setKind] = useState<AddKind>('rezept');
  const [nameError, setNameError] = useState(false);
  const close = () => {
    setOpen(undefined);
    // An expanded small window stays large only until it is closed (AC-019).
    setGrown(false);
    setPantryOpen(false);
    setNameError(false);
  };
  const smallSize: SheetSize = grown ? 'l' : 's';
  return (
    <Block
      title="Fenster mit fester Größe"
      note="Klein: so hoch wie der Inhalt, höchstens die Hälfte. Mittel und Groß: feste Größe, nur die Mitte scrollt."
      testID="showroom-sheets"
    >
      <Row wrap gap={8}>
        <Button
          label="Klein"
          size="sm"
          variant="secondary"
          onPress={() => setOpen('small')}
          testID="showroom-sheet-s"
        />
        <Button
          label="Klein, 30 Einträge"
          size="sm"
          variant="secondary"
          onPress={() => setOpen('small-long')}
          testID="showroom-sheet-s-long"
        />
        <Button
          label="Klein mit Aufklappen"
          size="sm"
          variant="secondary"
          onPress={() => setOpen('small-grow')}
          testID="showroom-sheet-s-grow"
        />
        <Button
          label="Mittel"
          size="sm"
          variant="secondary"
          onPress={() => setOpen('medium')}
          testID="showroom-sheet-m"
        />
        <Button
          label="Groß mit Tabs"
          size="sm"
          variant="secondary"
          onPress={() => setOpen('large')}
          testID="showroom-sheet-l"
        />
      </Row>

      <Sheet
        visible={open === 'small'}
        onClose={close}
        title="Markt wählen"
        size="s"
        testID="showroom-sheet-small"
      >
        <List>
          {['Rewe Südstadt', 'Edeka Kalk', 'Wochenmarkt'].map((name) => (
            <ListRow
              key={name}
              title={name}
              leading={<Icon name="store" color="muted" />}
              onPress={close}
            />
          ))}
        </List>
      </Sheet>

      <Sheet
        visible={open === 'small-long'}
        onClose={close}
        title="30 Einträge"
        size="s"
        testID="showroom-sheet-small-long"
      >
        <List>
          {Array.from({ length: 30 }, (_, index) => (
            <ListRow key={index} title={`Eintrag ${index + 1}`} />
          ))}
        </List>
      </Sheet>

      <Sheet
        visible={open === 'small-grow'}
        onClose={close}
        title="Vorrat prüfen"
        size={smallSize}
        testID="showroom-sheet-small-grow"
        footer={<Button label="Fertig" full onPress={close} />}
      >
        <Text>Drei Zutaten für die Woche.</Text>
        <Button
          label={pantryOpen ? 'Vorrat & Gewürze einklappen' : 'Vorrat & Gewürze (12)'}
          icon={pantryOpen ? 'chevron-up' : 'chevron-down'}
          variant="link"
          onPress={() => {
            setPantryOpen(!pantryOpen);
            setGrown(true);
          }}
          testID="showroom-sheet-grow-toggle"
        />
        {pantryOpen ? (
          <List>
            {Array.from({ length: 12 }, (_, index) => (
              <ListRow key={index} title={`Gewürz ${index + 1}`} />
            ))}
          </List>
        ) : null}
      </Sheet>

      <Sheet
        visible={open === 'medium'}
        onClose={close}
        title="Aufgabe anlegen"
        size="m"
        testID="showroom-sheet-medium"
        footer={
          <Button label="Speichern" full onPress={close} testID="showroom-sheet-medium-save" />
        }
      >
        <Stack gap={14}>
          {[
            'Titel',
            'Raum',
            'Rhythmus',
            'Zuständig',
            'Aufwand',
            'Notiz',
            'Erinnerung',
            'Start',
          ].map((label) => (
            <TextField key={label} label={label} placeholder={label} />
          ))}
        </Stack>
      </Sheet>

      <Sheet
        visible={open === 'large'}
        onClose={close}
        title="Sa 2. Jan · Abend"
        size="l"
        testID="showroom-sheet-large"
        header={
          <ViewTabs
            label="Art"
            value={kind}
            onChange={(next) => {
              setKind(next);
              setNameError(false);
            }}
            options={[...ADD_KINDS]}
            testID="showroom-sheet-large-kind"
          />
        }
        footer={
          <Button
            label="Weiter"
            full
            onPress={() => (kind === 'aktivitaet' ? setNameError(true) : close())}
            testID="showroom-sheet-large-next"
          />
        }
      >
        {kind === 'aktivitaet' ? (
          <TextField
            label="Neue Aktivität"
            placeholder="Name"
            error={nameError ? 'Name fehlt' : undefined}
            testID="showroom-sheet-large-name"
          />
        ) : null}
        {kind === 'freitext' ? (
          <TextField label="Was gibt's?" placeholder="z. B. Brotzeit" />
        ) : null}
        <List>
          {Array.from({ length: KIND_ROWS[kind] }, (_, index) => (
            <ListRow
              key={index}
              title={`${ADD_KINDS.find((entry) => entry.value === kind)?.label} ${index + 1}`}
            />
          ))}
        </List>
      </Sheet>
    </Block>
  );
}

// ---------- REQ-006: search or create ----------

function ArticleSearchBlock() {
  const [articles, setArticles] = useState<SampleArticle[]>(SAMPLE_ARTICLES);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<SampleArticle>();
  const [offline, setOffline] = useState(false);
  const result = matchSearchOrCreate(query, articles);
  const choose = (article: SampleArticle | undefined) => {
    setSelected(article);
    setQuery('');
  };
  const name = query.trim();
  return (
    <Block
      title="Suchen oder anlegen"
      note="Über Artikel mit Synonymen. Probiere „Karot“, „Kokos“, „Kokosmilsch“, „Milchko“, „karotten“, „Drachenfrucht“."
      testID="showroom-search"
    >
      {selected ? (
        <Row gap={8}>
          <Text variant="smallStrong">Ausgewählt:</Text>
          <Chip
            label={selected.name}
            selected
            removable
            accessibilityLabel={`${selected.name} entfernen`}
            onPress={() => setSelected(undefined)}
            testID="showroom-search-selected"
          />
        </Row>
      ) : null}
      <SearchOrCreate
        query={query}
        onQueryChange={setQuery}
        label="Artikel suchen"
        placeholder="Artikel suchen oder anlegen"
        clearLabel="Suche leeren"
        hits={result.matches.map((match) => ({
          key: match.item.id,
          title: match.item.name,
          detail: match.matchedSynonym ? `auch: ${match.matchedSynonym}` : undefined,
          meta: match.item.area,
        }))}
        onSelect={(key) => choose(articles.find((article) => article.id === key))}
        createOptions={result.canCreate ? [{ key: 'article', label: `„${name}“ neu anlegen` }] : []}
        onCreate={() => {
          const article: SampleArticle = {
            id: `neu-${articles.length}`,
            name,
            area: 'Ohne Bereich',
          };
          setArticles([...articles, article]);
          choose(article);
        }}
        brake={
          result.similar
            ? {
                question: `Meinst du ${result.similar.name}?`,
                acceptLabel: 'Ja',
                createAnywayLabel: 'Trotzdem neu',
                onAccept: () => choose(result.similar),
              }
            : undefined
        }
        createDisabledHint={offline ? OFFLINE_HINT : undefined}
        testID="showroom-search-articles"
      />
      <SwitchRow
        label="Offline zeigen"
        description="Nur hier im Showroom: Anlegen ist dann ausgegraut."
        value={offline}
        onValueChange={setOffline}
        testID="showroom-search-offline"
      />
    </Block>
  );
}

const KINDS: SampleKind[] = ['recipe', 'restaurant', 'activity'];

function AddEntryBlock() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState(SAMPLE_ENTRIES);
  const [chosen, setChosen] = useState<string>();
  const [slot, setSlot] = useState<'mittag' | 'abend'>('abend');
  const result = matchSearchOrCreate(query, entries);
  const name = query.trim();
  const pick = (label: string) => {
    setChosen(label);
    setQuery('');
    setOpen(false);
  };
  return (
    <Block
      title="Suchen oder anlegen mit mehreren Arten"
      note="Im Fenster „Groß“: je Art eine Zeile, „Mehr Angaben“ klappt im selben Fenster auf."
      testID="showroom-add"
    >
      <Row gap={10} wrap>
        <Button
          label="Hinzufügen"
          icon="plus"
          onPress={() => setOpen(true)}
          testID="showroom-add-open"
        />
        {chosen ? (
          <Text color="muted" testID="showroom-add-chosen">
            Eingeplant: {chosen}
          </Text>
        ) : null}
      </Row>
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Sa 2. Jan · Abend"
        size="l"
        testID="showroom-add-sheet"
      >
        <SearchOrCreate
          query={query}
          onQueryChange={setQuery}
          label="Was steht an?"
          placeholder="Was steht an?"
          clearLabel="Suche leeren"
          hits={result.matches.map((match) => ({
            key: match.item.id,
            title: match.item.name,
            meta: KIND_LABELS[match.item.kind],
          }))}
          onSelect={(key) => pick(entries.find((entry) => entry.id === key)?.name ?? key)}
          createOptions={
            result.canCreate
              ? KINDS.map((kind) => ({
                  key: kind,
                  label: `„${name}“ als ${KIND_LABELS[kind]} anlegen`,
                }))
              : []
          }
          onCreate={(key) => {
            const kind = KINDS.find((entry) => entry === key) ?? 'recipe';
            setEntries([...entries, { id: `neu-${entries.length}`, name, kind }]);
            pick(`${name} (${KIND_LABELS[kind]})`);
          }}
          brake={
            result.similar
              ? {
                  question: `Meinst du ${result.similar.name}?`,
                  acceptLabel: 'Ja',
                  createAnywayLabel: 'Trotzdem neu',
                  onAccept: () => pick(result.similar?.name ?? name),
                }
              : undefined
          }
          more={{
            label: 'Mehr Angaben',
            children: (
              <>
                <ChoiceChips
                  label="Tageszeit"
                  value={slot}
                  onChange={setSlot}
                  options={[
                    { value: 'mittag', label: 'Mittag' },
                    { value: 'abend', label: 'Abend' },
                  ]}
                  testID="showroom-add-slot"
                />
                <TextField label="Notiz" placeholder="z. B. mit Gästen" />
                <TextField label="Wer kocht?" placeholder="Name" />
              </>
            ),
          }}
          testID="showroom-add-search"
        />
      </Sheet>
    </Block>
  );
}

// ---------- REQ-007: filter row ----------

type SortKey = 'zuletzt' | 'neu' | 'az' | 'bewertung';
const SORTS: { value: SortKey; label: string }[] = [
  { value: 'zuletzt', label: 'Zuletzt' },
  { value: 'neu', label: 'Neu' },
  { value: 'az', label: 'A–Z' },
  { value: 'bewertung', label: 'Bewertung' },
];
type FilterKey = 'favoriten' | 'vegan' | 'schnell' | SampleRecipe['cuisine'];
const QUICK: { key: FilterKey; label: string }[] = [
  { key: 'favoriten', label: 'Favoriten' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'schnell', label: '< 30 Min' },
];
const CUISINE_FILTERS: SampleRecipe['cuisine'][] = [
  'Italienisch',
  'Asiatisch',
  'Orientalisch',
  'Deutsch',
];
const filterLabel = (key: FilterKey) => QUICK.find((entry) => entry.key === key)?.label ?? key;

function matchesFilter(recipe: SampleRecipe, filter: FilterKey): boolean {
  if (filter === 'favoriten') return recipe.favorite;
  if (filter === 'vegan') return recipe.vegan;
  if (filter === 'schnell') return recipe.minutes < 30;
  return recipe.cuisine === filter;
}

function sortRecipes(recipes: SampleRecipe[], sort: SortKey): SampleRecipe[] {
  const copy = [...recipes];
  if (sort === 'zuletzt') return copy.sort((a, b) => a.lastCooked - b.lastCooked);
  if (sort === 'neu') return copy.sort((a, b) => a.added - b.added);
  if (sort === 'az') return copy.sort((a, b) => a.title.localeCompare(b.title, 'de'));
  return copy.sort((a, b) => b.rating - a.rating);
}

function FilterBlock() {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FilterKey[]>([]);
  const [sort, setSort] = useState<SortKey>('zuletzt');
  const toggle = (key: FilterKey) =>
    setFilters((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    );
  const needle = search.trim().toLowerCase();
  const shown = sortRecipes(
    SAMPLE_RECIPES.filter(
      (recipe) =>
        (needle === '' || recipe.title.toLowerCase().includes(needle)) &&
        filters.every((filter) => matchesFilter(recipe, filter)),
    ),
    sort,
  );
  const sortLabel = SORTS.find((entry) => entry.value === sort)?.label ?? '';
  const count = shown.length;
  return (
    <Block
      title="Filterzeile"
      note="40 Beispielrezepte. Höchstens zwei Zeilen Bedienung."
      testID="showroom-filter"
    >
      <FilterBar
        search={
          <TextField
            round
            value={search}
            onChangeText={setSearch}
            accessibilityLabel="Rezepte suchen"
            placeholder="Rezepte suchen …"
            left={<Icon name="search" size={20} color="muted" />}
            testID="showroom-filter-search"
          />
        }
        filterLabel={filters.length > 0 ? `Filter (${filters.length})` : 'Filter'}
        activeCount={filters.length}
        sort={
          <Menu
            label={sortLabel}
            icon="arrow-up-down"
            accessibilityLabel={`Sortierung: ${sortLabel}`}
            options={SORTS}
            value={sort}
            onChange={setSort}
            testID="showroom-filter-sort"
          />
        }
        chips={
          <>
            {filters.map((key) => (
              <Chip
                key={key}
                label={filterLabel(key)}
                selected
                removable
                accessibilityLabel={`${filterLabel(key)} entfernen`}
                onPress={() => toggle(key)}
                testID={`showroom-filter-active-${key}`}
              />
            ))}
            {QUICK.filter((entry) => !filters.includes(entry.key)).map((entry) => (
              <Chip
                key={entry.key}
                label={entry.label}
                onPress={() => toggle(entry.key)}
                testID={`showroom-filter-quick-${entry.key}`}
              />
            ))}
          </>
        }
        panelTitle="Filter"
        panel={
          <Stack gap={12}>
            <Text variant="smallStrong">Schnell</Text>
            <Row wrap gap={8}>
              {QUICK.map((entry) => (
                <Chip
                  key={entry.key}
                  label={entry.label}
                  selected={filters.includes(entry.key)}
                  onPress={() => toggle(entry.key)}
                  testID={`showroom-filter-panel-${entry.key}`}
                />
              ))}
            </Row>
            <Text variant="smallStrong">Küche</Text>
            <Row wrap gap={8}>
              {CUISINE_FILTERS.map((cuisine) => (
                <Chip
                  key={cuisine}
                  label={cuisine}
                  selected={filters.includes(cuisine)}
                  onPress={() => toggle(cuisine)}
                  testID={`showroom-filter-panel-${cuisine}`}
                />
              ))}
            </Row>
          </Stack>
        }
        resetLabel="Zurücksetzen"
        onReset={() => setFilters([])}
        applyLabel={`${count} ${count === 1 ? 'Rezept' : 'Rezepte'} zeigen`}
        collapseLabel="Einklappen"
        testID="showroom-filter-bar"
      />
      {count === 0 ? (
        <Surface>
          <EmptyState
            icon="list-filter"
            title="Kein Rezept passt"
            text="Lockere die Filter oder setze sie zurück."
          >
            <Button
              label="Filter zurücksetzen"
              onPress={() => setFilters([])}
              testID="showroom-filter-empty-reset"
            />
          </EmptyState>
        </Surface>
      ) : (
        <View>
          <Text variant="small" color="muted" testID="showroom-filter-count">
            {count} {count === 1 ? 'Rezept' : 'Rezepte'}
          </Text>
          <List testID="showroom-filter-list">
            {shown.slice(0, 8).map((recipe) => (
              <ListRow
                key={recipe.id}
                title={recipe.title}
                subtitle={`${recipe.cuisine} · ${recipe.minutes} Min${recipe.vegan ? ' · vegan' : ''}`}
                testID={`showroom-filter-row-${recipe.id}`}
              />
            ))}
          </List>
          {count > 8 ? (
            <Text variant="caption" color="muted">
              … und {count - 8} weitere
            </Text>
          ) : null}
        </View>
      )}
    </Block>
  );
}
