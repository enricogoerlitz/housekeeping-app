import { photoSource } from '@housekeeping/api';
import {
  formatTime,
  matchSearchOrCreate,
  moveInOrder,
  orderAnnouncement,
  parseTimeInput,
  type Member,
} from '@housekeeping/core';
import {
  Button,
  CHECK_WINDOW_MS,
  CheckRow,
  ChoiceChips,
  Chip,
  Disclosure,
  DockedPanel,
  EditableSection,
  EmptyState,
  FilterBar,
  Icon,
  IconButton,
  KIND_ICONS,
  List,
  ListRow,
  MediaCard,
  Menu,
  PhotoCollage,
  ReorderList,
  Row,
  RowTransition,
  ScreenHeader,
  SearchOrCreate,
  Section,
  SelectRow,
  Sheet,
  Stack,
  Surface,
  SwitchRow,
  Text,
  TextField,
  TimeField,
  ViewTabs,
  toast,
  useBreakpoint,
  useCheckWindow,
  type DockedPanelState,
  type SheetSize,
} from '@housekeeping/ui';
import { useRef, useState, type ReactNode } from 'react';
import { View, type HostInstance } from 'react-native';

import { FavoriteButton } from '@/features/shell/favorite-button';
import { MemberRatings } from '@/features/shell/member-ratings';

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
    <ReorderBlock key="reorder" />,
    <MenuBlock key="menu" />,
    <EditableSectionBlock key="editable" />,
    <TitleBarBlock key="titlebar" />,
    <MemberRatingsBlock key="ratings" />,
    <ExpiringToastBlock key="expire" />,
    <DisclosureBlock key="disclosure" />,
    <CollageBlock key="collage" />,
    <SelectRowBlock key="select" />,
    <TimeBlock key="time" />,
  ];
}

// ---------- REQ-004: view tabs and choice chips ----------

const FIVE_TABS = [
  { value: 'anstehend', label: 'Anstehend' },
  { value: 'alle', label: 'Alle' },
  { value: 'verlauf', label: 'Verlauf' },
  { value: 'vorlagen', label: 'Vorlagen' },
  { value: 'reisen', label: 'Reisen' },
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
      <Text variant="smallStrong">Offline</Text>
      <ChoiceChips
        label="Art, offline"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'idee', label: 'Idee' },
          { value: 'problem', label: 'Problem' },
          { value: 'lob', label: 'Lob' },
        ]}
        disabled
        hint={OFFLINE_HINT}
        testID="showroom-choice-offline"
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

// ---------- Spec 0007: ordering list ----------

const SAMPLE_ORDER = ['Obst & Gemüse', 'Brot & Backwaren', 'Kühlregal', 'Getränke', 'Drogerie'];
const SAMPLE_ORDER_LABELS = {
  handle: (name: string) => `${name} verschieben`,
  up: (name: string) => `${name} nach oben`,
  down: (name: string) => `${name} nach unten`,
  position: orderAnnouncement,
};

function ReorderBlock() {
  const [order, setOrder] = useState(SAMPLE_ORDER);
  const [opened, setOpened] = useState<string | undefined>();
  const items = order.map((name) => ({ key: name, name }));
  return (
    <Block
      title="Liste zum Ordnen"
      note="Am Griff ziehen, Pfeile antippen oder im Web den Griff fokussieren und Pfeiltasten drücken. Jede Position wird angesagt; mit onPress öffnet ein Tipp auf die Zeile; offline ist alles ausgegraut."
      testID="showroom-reorder"
    >
      <ReorderList
        items={items}
        onMove={(key, toIndex) => setOrder((current) => moveInOrder(current, key, toIndex))}
        labels={{ ...SAMPLE_ORDER_LABELS, open: (name) => `${name} öffnen` }}
        onPress={setOpened}
        testID="showroom-reorder"
      />
      <Text variant="small" color="muted" testID="showroom-reorder-opened">
        {opened ? `Geöffnet: ${opened}` : 'Zeile antippen zum Öffnen'}
      </Text>
      <ReorderList
        items={items.slice(0, 2)}
        onMove={() => undefined}
        labels={SAMPLE_ORDER_LABELS}
        disabled
        disabledHint={OFFLINE_HINT}
        testID="showroom-reorder-offline"
      />
    </Block>
  );
}

// ---------- Spec 0008: menu, sections, title bar, ratings, toast running out ----------

type SampleSort = 'zuletzt' | 'haeufig' | 'bewertung' | 'neu' | 'az' | 'zufall';
const SAMPLE_SORTS: { value: SampleSort; label: string }[] = [
  { value: 'zuletzt', label: 'Zuletzt gekocht' },
  { value: 'haeufig', label: 'Am häufigsten' },
  { value: 'bewertung', label: 'Bewertung' },
  { value: 'neu', label: 'Neu' },
  { value: 'az', label: 'A–Z' },
  { value: 'zufall', label: 'Zufall' },
];

function MenuBlock() {
  const [sort, setSort] = useState<SampleSort>('zuletzt');
  const [action, setAction] = useState<string>();
  const label =
    sort === 'zuletzt' ? 'Zuletzt' : (SAMPLE_SORTS.find((s) => s.value === sort)?.label ?? '');
  return (
    <Block
      title="Menü"
      note="Der gewählte Wert trägt einen Haken. Im Web: Pfeiltasten, Pos1/Ende, Enter oder Leertaste wählen, Escape schließt."
      testID="showroom-menu"
    >
      <Row gap={12}>
        <Menu
          label={label}
          icon="arrow-up-down"
          accessibilityLabel={`Sortierung: ${label}`}
          options={SAMPLE_SORTS}
          value={sort}
          onChange={setSort}
          testID="showroom-menu-sort"
        />
        <Menu
          label="Aktionen"
          trigger="icon"
          accessibilityLabel="Weitere Aktionen"
          options={[
            { value: 'foto', label: 'Foto ändern' },
            { value: 'loeschen', label: 'Löschen', disabled: true, hint: OFFLINE_HINT },
          ]}
          onChange={setAction}
          testID="showroom-menu-actions"
        />
      </Row>
      <Text variant="small" color="muted" testID="showroom-menu-value">
        Sortierung: {SAMPLE_SORTS.find((s) => s.value === sort)?.label}
        {action ? ` · zuletzt gewählt: ${action}` : ''}
      </Text>
    </Block>
  );
}

type SampleSection = 'notizen' | 'zubereitung';

function EditableSectionBlock() {
  const [open, setOpen] = useState<SampleSection>();
  const [offline, setOffline] = useState(false);
  const [notes, setNotes] = useState('Mit doppelt Béchamel noch besser.');
  const [draft, setDraft] = useState(notes);
  const [error, setError] = useState<string>();
  const edit = (section: SampleSection) => {
    // Switching saves the open section, as "Fertig" does (spec 0008, AC-028).
    if (open === 'notizen') setNotes(draft);
    setDraft(notes);
    setError(undefined);
    setOpen(section);
  };
  const done = () => {
    if (open === 'notizen' && draft.trim() === '') {
      setError('Notiz fehlt');
      return;
    }
    if (open === 'notizen') setNotes(draft);
    setOpen(undefined);
  };
  return (
    <Block
      title="Abschnitt bearbeiten"
      note="Stift öffnet genau einen Abschnitt, „Fertig“ schließt ihn. Ein anderer Stift speichert den offenen. Offline sind die Stifte ausgegraut."
      testID="showroom-editable"
    >
      <SwitchRow label="Offline" value={offline} onValueChange={setOffline} />
      <EditableSection
        title="Notizen"
        editing={open === 'notizen'}
        onEdit={() => edit('notizen')}
        onDone={done}
        editLabel="Notizen bearbeiten"
        doneLabel="Fertig"
        disabled={offline}
        hint={offline ? OFFLINE_HINT : undefined}
        testID="showroom-editable-notes"
      >
        {open === 'notizen' ? (
          <TextField
            accessibilityLabel="Notizen"
            value={draft}
            onChangeText={setDraft}
            multiline
            error={error}
          />
        ) : (
          <Text testID="showroom-editable-notes-text">{notes}</Text>
        )}
      </EditableSection>
      <EditableSection
        title="Zubereitung"
        editing={open === 'zubereitung'}
        onEdit={() => edit('zubereitung')}
        onDone={done}
        editLabel="Zubereitung bearbeiten"
        doneLabel="Fertig"
        disabled={offline}
        hint={offline ? OFFLINE_HINT : undefined}
        testID="showroom-editable-steps"
      >
        <Text color={open === 'zubereitung' ? 'text' : 'muted'}>
          {open === 'zubereitung'
            ? 'Hier stünden die Felder der Schritte.'
            : '1. Kichererbsen kochen · 2. Pürieren · 3. Abschmecken'}
        </Text>
      </EditableSection>
    </Block>
  );
}

function TitleBarBlock() {
  return (
    <Block
      title="Kopfzeile mit Titel beim Scrollen"
      note="Für Seiten mit eigenem großen Titel (Rezeptseite). Auf dem Handy erscheint der Titel erst nach dem Scrollen in der schmalen Leiste, ab Tablet steht er von Anfang an da."
      testID="showroom-titlebar"
    >
      <Surface>
        <ScreenHeader
          title="Lasagne"
          titleOnScroll
          backLabel="Essen"
          onBack={() => undefined}
          right={
            <>
              <FavoriteButton
                active
                disabled={false}
                onPress={() => undefined}
                testID="showroom-titlebar-favorite"
              />
              <Menu
                label="Aktionen"
                trigger="icon"
                accessibilityLabel="Weitere Aktionen"
                options={[{ value: 'foto', label: 'Foto ändern' }]}
                onChange={() => undefined}
              />
            </>
          }
          testID="showroom-titlebar-title"
        />
      </Surface>
    </Block>
  );
}

// MemberRatings shows no avatars, so the colours stay empty.
const SAMPLE_MEMBERS: Member[] = [
  { id: 'enrico', name: 'Enrico', color: '', dietPreference: 'flexible', dislikes: [] },
  { id: 'nadja', name: 'Nadja', color: '', dietPreference: 'vegetarian', dislikes: [] },
  { id: 'lea', name: 'Lea', color: '', dietPreference: 'flexible', dislikes: [] },
];

function MemberRatingsBlock() {
  const [ratings, setRatings] = useState<Record<string, number>>({ nadja: 5 });
  const [offline, setOffline] = useState(false);
  return (
    <Block
      title="Bewertungen der Mitglieder"
      note="„Du“ setzt die eigenen Sterne in halben Schritten; die anderen stehen nur zur Anzeige, ohne Bewertung leer."
      testID="showroom-ratings"
    >
      <SwitchRow label="Offline" value={offline} onValueChange={setOffline} />
      <MemberRatings
        ratings={ratings}
        members={SAMPLE_MEMBERS}
        me="enrico"
        onRate={(stars) => setRatings((current) => ({ ...current, enrico: stars }))}
        disabled={offline}
        hint={offline ? OFFLINE_HINT : undefined}
        testID="showroom-ratings-stars"
      />
    </Block>
  );
}

function ExpiringToastBlock() {
  const [result, setResult] = useState('–');
  return (
    <Block
      title="Hinweis läuft aus"
      note="„Rückgängig“ 5 Sekunden lang. Erst wenn der Hinweis ohne „Rückgängig“ ausläuft (oder ein neuer ihn ersetzt), passiert das Endgültige, z. B. das Foto löschen."
      testID="showroom-expire"
    >
      <Button
        label="Beispiel löschen"
        variant="ghost"
        onPress={() => {
          setResult('Hinweis läuft …');
          toast.show({
            message: 'Halloumi-Pfanne gelöscht',
            actionLabel: 'Rückgängig',
            onAction: () => setResult('Rückgängig gemacht'),
            onExpire: () => setResult('Abgelaufen – Foto wäre jetzt gelöscht'),
          });
        }}
        testID="showroom-expire-show"
      />
      <Text variant="small" color="muted" testID="showroom-expire-result">
        {result}
      </Text>
    </Block>
  );
}

// ---------- Spec 0012, REQ-004: foldable group "Gepackt (n)" ----------

const SAMPLE_PACKING = ['Badehose', 'Sonnencreme', 'Handtuch', 'Sonnenbrille', 'Flip-Flops'];
const initialPacking = (): CheckItem[] =>
  SAMPLE_PACKING.map((name, index) => ({ id: name.toLowerCase(), name, checked: index < 2 }));

function DisclosureBlock() {
  const [items, setItems] = useState(initialPacking);
  const setPacked = (id: string, checked: boolean) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, checked } : item)));
  const pack = useCheckWindow({
    items,
    getId: (item) => item.id,
    isChecked: (item) => item.checked,
    onToggle: (item, checked) => setPacked(item.id, checked),
    announce: (item, checked) => `${item.name} ${checked ? 'gepackt' : 'wieder offen'}`,
    keepInDone: true,
  });
  const packed = pack.doneRows;
  return (
    <Block
      title="Aufklappbare Gruppe"
      note={`Gepacktes gleitet ${CHECK_WINDOW_MS / 1000} s nach dem letzten Tipp in „Gepackt (n)“, eingeklappt. Antippen klappt auf; dort Ausgepacktes bleibt ebenso ${CHECK_WINDOW_MS / 1000} s stehen (keepInDone). Leer verschwindet die Gruppe.`}
      testID="showroom-disclosure"
    >
      <Row gap={8}>
        <Icon name="luggage" size={18} color="muted" />
        <Text variant="smallStrong">
          Strand {packed.length}/{items.length}
        </Text>
      </Row>
      <List testID="showroom-disclosure-open">
        {pack.rows.map((item) => (
          <RowTransition key={item.id}>
            <CheckRow
              title={item.name}
              checked={pack.isChecked(item)}
              onToggle={() => pack.toggle(item)}
              testID={`showroom-pack-${item.id}`}
            />
          </RowTransition>
        ))}
      </List>
      <Disclosure
        title="Gepackt"
        count={packed.length}
        expandedLabel="aufgeklappt"
        collapsedLabel="eingeklappt"
        testID="showroom-packed"
      >
        <List>
          {packed.map((item) => (
            <RowTransition key={item.id}>
              <CheckRow
                title={item.name}
                checked={pack.isChecked(item)}
                onToggle={() => pack.toggle(item)}
                testID={`showroom-packed-${item.id}`}
              />
            </RowTransition>
          ))}
        </List>
      </Disclosure>
      <Disclosure
        title="Schon aufgeklappt"
        count={2}
        expandedLabel="aufgeklappt"
        collapsedLabel="eingeklappt"
        defaultExpanded
        testID="showroom-disclosure-open-example"
      >
        <Text variant="small" color="muted">
          Zwei Beispielzeilen.
        </Text>
      </Disclosure>
      <Button
        label="Zurücksetzen"
        size="sm"
        variant="link"
        onPress={() => setItems(initialPacking())}
        testID="showroom-disclosure-reset"
      />
    </Block>
  );
}

// ---------- Spec 0009, E14 and E16: photo collage, multi-select with a reason ----------

const COLLAGE_PHOTOS = ['salat', 'nudelsalat', 'steak', 'beerensalat', 'pizza']
  .map(photoSource)
  .filter((source): source is number => source !== undefined);
const COLLECTION_BADGE = { label: 'Sammlung', icon: KIND_ICONS.collection };

function CollageBlock() {
  const { isPhone } = useBreakpoint();
  return (
    <Block
      title="Foto-Collage"
      note="Sammlung ohne eigenes Foto: die Fotos der ersten bis zu vier enthaltenen Rezepte mit Foto, in ihrer Reihenfolge. Ohne Foto der Platzhalter mit Stapel-Symbol, mit eigenem Foto nur dieses."
      testID="showroom-collage"
    >
      <Row wrap gap={12} align="flex-start">
        {[0, 1, 2, 3, 5].map((count) => (
          <Stack key={count} gap={4} style={{ width: 120 }}>
            <PhotoCollage
              sources={COLLAGE_PHOTOS.slice(0, count)}
              aspectRatio={4 / 3}
              testID={`showroom-collage-${count}`}
            />
            <Text variant="caption" color="muted">
              {count === 0 ? 'ohne Foto' : count === 1 ? '1 Foto' : `${count} Fotos`}
            </Text>
          </Stack>
        ))}
      </Row>
      <Row gap={12} align="stretch">
        <View style={{ flex: 1 }}>
          <MediaCard
            title="Grillabend"
            meta="2 Rezepte"
            images={COLLAGE_PHOTOS.slice(0, 2)}
            layout="photoTop"
            photoAspectRatio={4 / 3}
            size={isPhone ? 'm' : 'l'}
            badge={COLLECTION_BADGE}
            onPress={() => undefined}
            testID="showroom-collage-card"
          />
        </View>
        <View style={{ flex: 1 }}>
          <MediaCard
            title="Sommerfest"
            layout="photoTop"
            photoAspectRatio={4 / 3}
            size={isPhone ? 'm' : 'l'}
            images={[]}
            badge={COLLECTION_BADGE}
            onPress={() => undefined}
          />
        </View>
      </Row>
      <MediaCard
        title="Mezze-Abend"
        kicker="Heute · Abend"
        meta="3 Rezepte"
        images={COLLAGE_PHOTOS.slice(0, 3)}
        layout="thumbRow"
        badge={COLLECTION_BADGE}
        onPress={() => undefined}
      />
      <View style={{ maxWidth: 560 }}>
        <PhotoCollage
          sources={COLLAGE_PHOTOS.slice(0, 4)}
          aspectRatio={4 / 3}
          alt="Fotos von Gemischter Salat, Nudelsalat, Steak und Beerensalat"
          testID="showroom-collage-page"
        />
      </View>
    </Block>
  );
}

const SAMPLE_PICKS = [
  { id: 'kartoffelsalat', title: 'Kartoffelsalat', subtitle: '30 Min', contained: true },
  {
    id: 'grillgemuese',
    title: 'Grillgemüse',
    subtitle: '25 Min · vegan möglich',
    contained: false,
  },
  { id: 'tzatziki', title: 'Tzatziki', subtitle: '10 Min · vegetarisch', contained: false },
];

function SelectRowBlock() {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Block
      title="Mehrfachauswahl"
      note="Die ganze Zeile ist ein Ankreuzfeld (Tipp oder Leertaste). Nicht wählbare Zeilen sind ausgegraut und sagen, warum."
      testID="showroom-select"
    >
      <List>
        {SAMPLE_PICKS.map((pick) => (
          <SelectRow
            key={pick.id}
            title={pick.title}
            subtitle={pick.subtitle}
            selected={picked.has(pick.id)}
            onToggle={() => toggle(pick.id)}
            disabled={pick.contained}
            hint={pick.contained ? 'schon enthalten' : undefined}
            testID={`showroom-select-${pick.id}`}
          />
        ))}
      </List>
      <Button
        label={picked.size === 1 ? '1 Rezept übernehmen' : `${picked.size} Rezepte übernehmen`}
        disabled={picked.size === 0}
        onPress={() => setPicked(new Set())}
        testID="showroom-select-take"
      />
    </Block>
  );
}

// ---------- Spec 0013: time field and a switch with details ----------

function TimeBlock() {
  const [offline, setOffline] = useState(false);
  const [text, setText] = useState('19:00');
  const [error, setError] = useState<string>();
  const [summaryOn, setSummaryOn] = useState(false);
  const [summaryAt, setSummaryAt] = useState('07:30');
  const read = () => {
    const parsed = parseTimeInput(text);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(undefined);
    setText(parsed.time === undefined ? '' : formatTime(parsed.time));
    if (parsed.time !== undefined) setSummaryAt(parsed.time);
  };
  return (
    <Block
      title="Uhrzeit und Schalter mit Detail"
      note="Eintippen: „19“, „1930“, „7.30“. Nur 5-Minuten-Schritte, ✕ leert das Feld. Beim Schalter mit Detail öffnen Titel und „›“ die Einstellung, der Schalter bleibt eigener Knopf."
      testID="showroom-time"
    >
      <SwitchRow label="Offline" value={offline} onValueChange={setOffline} />
      <TimeField
        label="Uhrzeit"
        value={text}
        onChangeText={(value) => {
          setText(value);
          setError(undefined);
        }}
        onBlur={read}
        onSubmitEditing={read}
        onClear={() => {
          setText('');
          setError(undefined);
        }}
        clearLabel="Uhrzeit entfernen"
        emptyLabel="keine Uhrzeit"
        placeholder="z. B. 19:00"
        error={error}
        disabled={offline}
        hint={offline ? OFFLINE_HINT : undefined}
        testID="showroom-time-field"
      />
      <SwitchRow
        label="Tagesüberblick"
        description={`${formatTime(summaryAt)} · Essen · Aufgaben`}
        value={summaryOn}
        onValueChange={setSummaryOn}
        disabled={offline}
        onDetail={() => toast.show({ message: 'Hier öffnet das Fenster mit Uhrzeit und Teilen' })}
        detailLabel="Tagesüberblick einstellen"
        testID="showroom-time-switch"
      />
    </Block>
  );
}

// ---------- Spec 0016, REQ-006: a panel that leaves the page usable ----------

const PANEL_ROWS = [
  'Vormittag · Bouldern',
  'Mittag · Linsen-Dal',
  'Abend · Lasagne',
  ...Array.from({ length: 14 }, (_, index) => `Eintrag ${index + 1}`),
];

/**
 * The block and its panel apart: the panel belongs into the Screen's `aside`, outside the
 * scrolling page.
 */
export function useDockedPanelDemo(): { block: ReactNode; panel: ReactNode } {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DockedPanelState>('half');
  const opener = useRef<HostInstance>(null);
  const block = (
    <Block
      key="docked"
      title="Fenster neben der Seite"
      note="Die Seite bleibt bedienbar. Handy: unten in halber Höhe; am Griff nach oben groß, nach unten zu, ein Tipp auf den Griff wechselt die Größe. Ab 700 px rechts neben dem Inhalt. Escape und Android-Zurück schließen, der Fokus kehrt zum Knopf zurück."
      testID="showroom-docked"
    >
      <Row wrap gap={8}>
        <IconButton
          ref={opener}
          icon="calendar-days"
          variant="soft"
          label="Fenster öffnen"
          onPress={() => {
            setState('half');
            setOpen(true);
          }}
          testID="showroom-docked-open"
        />
        <Button
          label="Auf eine Zeile"
          size="sm"
          variant="secondary"
          disabled={!open}
          onPress={() => setState('collapsed')}
          testID="showroom-docked-collapse"
        />
        <Button
          label="Halbe Höhe"
          size="sm"
          variant="secondary"
          disabled={!open}
          onPress={() => setState('half')}
          testID="showroom-docked-half"
        />
      </Row>
    </Block>
  );
  const panel = (
    <DockedPanel
      open={open}
      onClose={() => setOpen(false)}
      state={state}
      onStateChange={setState}
      label="Beispiel-Fenster"
      closeLabel="Schließen"
      handleLabel="Größe ändern"
      returnFocusRef={opener}
      header={
        <Text variant="sectionLabel" heading>
          Fr 27. November
        </Text>
      }
      testID="showroom-docked-panel"
    >
      <List>
        {PANEL_ROWS.map((row) => (
          <ListRow key={row} title={row} />
        ))}
      </List>
    </DockedPanel>
  );
  return { block, panel };
}
