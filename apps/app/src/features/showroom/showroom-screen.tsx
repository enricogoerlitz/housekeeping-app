import { photoSource } from '@housekeeping/api';
import {
  Avatar,
  AvatarStack,
  Badge,
  Button,
  CheckRow,
  CreateButton,
  Checkbox,
  Chip,
  ChoiceChips,
  DueBar,
  EmptyState,
  getTheme,
  GhostRow,
  GroupLabel,
  Icon,
  IconButton,
  List,
  ListRow,
  MediaCard,
  Notice,
  OfflineBanner,
  Photo,
  ProgressBar,
  ProposalCard,
  Row,
  Screen,
  ScreenHeader,
  Section,
  Sheet,
  Stack,
  Stars,
  Surface,
  SwitchRow,
  Text,
  TextField,
  ThemeProvider,
  icons,
  themeFamilies,
  toast,
  useBreakpoint,
  useTheme,
  useThemeFonts,
  ViewTabs,
  type ColorMode,
  type IconName,
  type TextVariant,
  type ThemeId,
  type Tone,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { OFFLINE_BANNER_TEXT } from '@/features/shell/offline';
import { useSettings } from '@/lib/settings';

import { EndlessDemo, EndlessDetail, EndlessGridDemo } from './showroom-endless';
import { useDockedPanelDemo, usePatternBlocks } from './showroom-patterns';

// Sample member colours come from the data in the real app; the showroom borrows theme colours
// so it stays free of colour literals.
function useSampleMembers() {
  const c = useTheme().colors;
  return [
    { id: 'a', name: 'Enrico', color: c.accent },
    { id: 'b', name: 'Nadja', color: c.success },
  ];
}

const TONES: Tone[] = ['essen', 'plan', 'liste', 'haushalt', 'ki'];

/** Every building block of the design system with its states (AC-004). Previews locally. */
export function ShowroomScreen() {
  const settings = useSettings();
  const [themeId, setThemeId] = useState<ThemeId>(settings.themeId);
  const [mode, setMode] = useState<ColorMode>(settings.mode);
  // Fonts load per theme (spec 0058, REQ-006): the one shown here may not be loaded yet.
  useThemeFonts(getTheme(themeId, mode).fonts);
  return (
    <ThemeProvider themeId={themeId} mode={mode}>
      <ShowroomContent themeId={themeId} mode={mode} onTheme={setThemeId} onMode={setMode} />
    </ThemeProvider>
  );
}

type ShowroomView = 'bausteine' | 'muster' | 'liste' | 'raster';
type AreaChoice = Tone | 'keiner';

function ShowroomContent(props: {
  themeId: ThemeId;
  mode: ColorMode;
  onTheme: (id: ThemeId) => void;
  onMode: (mode: ColorMode) => void;
}) {
  const router = useRouter();
  const { isWide } = useBreakpoint();
  const blocks = useBlocks();
  const patterns = usePatternBlocks();
  const docked = useDockedPanelDemo();
  const [view, setView] = useState<ShowroomView>('bausteine');
  const [area, setArea] = useState<AreaChoice>('essen');
  const [openRow, setOpenRow] = useState<number>();
  // The endless list and grid scroll the page themselves.
  const listScrolls = view === 'liste' || view === 'raster';

  const columns = (list: ReactNode[]) => {
    const half = Math.ceil(list.length / 2);
    return isWide ? (
      <View style={{ flexDirection: 'row', gap: 32, alignItems: 'flex-start' }}>
        <View style={{ flex: 1, minWidth: 0 }}>{list.slice(0, half)}</View>
        <View style={{ flex: 1, minWidth: 0 }}>{list.slice(half)}</View>
      </View>
    ) : (
      <View>{list}</View>
    );
  };

  return (
    <Screen
      testID="showroom"
      clearFab={false}
      tone={area === 'keiner' ? undefined : area}
      scroll={!listScrolls}
      aside={view === 'muster' ? docked.panel : undefined}
      style={listScrolls ? { flex: 1, paddingTop: 0, paddingBottom: 0 } : undefined}
      header={
        <ScreenHeader
          title="Showroom"
          subtitle="Alle Bausteine des Design-Systems"
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          right={
            <IconButton
              icon="plus"
              variant="filled"
              label="Beispielaktion"
              onPress={() => toast.show({ message: 'Beispielaktion' })}
              testID="showroom-action"
            />
          }
        />
      }
      tabs={
        <ViewTabs<ShowroomView>
          label="Showroom"
          value={view}
          onChange={(next) => {
            setView(next);
            setOpenRow(undefined);
          }}
          options={[
            { value: 'bausteine', label: 'Bausteine' },
            { value: 'muster', label: 'Muster' },
            { value: 'liste', label: 'Endlos-Liste' },
            { value: 'raster', label: 'Endlos-Raster' },
          ]}
          testID="showroom-view"
        />
      }
      toolbar={
        <PreviewBar
          themeId={props.themeId}
          mode={props.mode}
          area={area}
          onTheme={props.onTheme}
          onMode={props.onMode}
          onArea={setArea}
        />
      }
    >
      {view === 'bausteine' ? columns(blocks) : null}
      {view === 'muster' ? columns([docked.block, ...patterns]) : null}
      {listScrolls ? (
        <View style={{ flex: 1 }}>
          {view === 'liste' ? (
            <EndlessDemo onOpen={setOpenRow} />
          ) : (
            <EndlessGridDemo onOpen={setOpenRow} />
          )}
          {/* Like a page pushed onto the stack: the list stays mounted underneath (AC-043). */}
          {openRow !== undefined ? (
            <EndlessDetail row={openRow} onBack={() => setOpenRow(undefined)} />
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

/** Theme, mode and area colour of the preview; slides away on phones while scrolling down. */
function PreviewBar(props: {
  themeId: ThemeId;
  mode: ColorMode;
  area: AreaChoice;
  onTheme: (id: ThemeId) => void;
  onMode: (mode: ColorMode) => void;
  onArea: (area: AreaChoice) => void;
}) {
  return (
    <View style={{ gap: 8 }} testID="showroom-preview">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 16, alignItems: 'center' }}
      >
        <ChoiceChips<ThemeId>
          label="Theme"
          value={props.themeId}
          onChange={props.onTheme}
          options={themeFamilies.map((family) => ({ value: family.id, label: family.name }))}
          testID="showroom-theme"
        />
        <ChoiceChips<ColorMode>
          label="Hell oder dunkel"
          value={props.mode}
          onChange={props.onMode}
          options={[
            { value: 'light', label: 'Hell' },
            { value: 'dark', label: 'Dunkel' },
          ]}
          testID="showroom-mode"
        />
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, alignItems: 'center' }}
      >
        <Text variant="smallStrong" color="muted">
          Bereich
        </Text>
        <ChoiceChips<AreaChoice>
          label="Bereichsfarbe"
          value={props.area}
          onChange={props.onArea}
          options={[
            { value: 'essen', label: 'Essen' },
            { value: 'plan', label: 'Plan' },
            { value: 'liste', label: 'Liste' },
            { value: 'haushalt', label: 'Haushalt' },
            { value: 'keiner', label: 'Keiner' },
          ]}
          testID="showroom-area"
        />
      </ScrollView>
      <Text variant="caption" color="muted">
        Nur Vorschau – die App-Einstellung bleibt, wie sie ist. Die Bereichsfarbe zeigt nur
        „Frisch“.
      </Text>
    </View>
  );
}

function Block(props: { title: string; children: ReactNode; testID: string }) {
  return (
    <Section title={props.title} testID={props.testID}>
      <Stack gap={12}>{props.children}</Stack>
    </Section>
  );
}

function useBlocks(): ReactNode[] {
  return [
    <TextBlock key="text" />,
    <IconBlock key="icons" />,
    <ButtonBlock key="buttons" />,
    <ChipBlock key="chips" />,
    <CheckBlock key="checks" />,
    <InputBlock key="inputs" />,
    <SectionBlock key="sections" />,
    <ListBlock key="lists" />,
    <PeopleBlock key="people" />,
    <MediaBlock key="media" />,
    <ProgressBlock key="progress" />,
    <StateBlock key="states" />,
    <ProposalBlock key="proposal" />,
    <OverlayBlock key="overlay" />,
  ];
}

function TextBlock() {
  const theme = useTheme();
  const variants = Object.keys(theme.type) as TextVariant[];
  return (
    <Block title="Text" testID="showroom-text">
      {variants.map((variant) => (
        <Row key={variant} gap={12} align="baseline">
          <Text variant="caption" color="muted" style={{ width: 96 }}>
            {variant}
          </Text>
          <Text variant={variant} style={{ flex: 1 }} numberOfLines={1}>
            Mango-Curry
          </Text>
        </Row>
      ))}
      <Row wrap gap={12}>
        <Text color="muted">muted</Text>
        <Text color="accent">accent</Text>
        <Text color="success">success</Text>
        <Text color="warn">warn</Text>
        <Text strike>durchgestrichen</Text>
      </Row>
    </Block>
  );
}

function IconBlock() {
  const names = Object.keys(icons) as IconName[];
  return (
    <Block title="Symbole" testID="showroom-icons">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {names.map((name) => (
          <View key={name} style={{ width: 76, alignItems: 'center', gap: 4, paddingVertical: 6 }}>
            <Icon name={name} />
            <Text variant="caption" color="muted" numberOfLines={1}>
              {name}
            </Text>
          </View>
        ))}
      </View>
    </Block>
  );
}

function ButtonBlock() {
  return (
    <Block title="Buttons" testID="showroom-buttons">
      <Row wrap gap={10}>
        <Button label="Primär" icon="plus" />
        <Button label="Sekundär" variant="secondary" />
        <Button label="Umriss" variant="ghost" />
        <Button label="Link" variant="link" />
        <Button label="Verlassen" variant="link" quiet />
        <CreateButton label="Rezept anlegen" />
      </Row>
      <Row wrap gap={10}>
        <Button label="Klein" size="sm" />
        <Button label="Ausgegraut" disabled hint="Offline – zum Bearbeiten brauchst du Netz" />
        <Button label="Ausgegraut" variant="ghost" disabled />
      </Row>
      <Button label="Volle Breite" icon="check" full />
      <Row gap={10}>
        <IconButton icon="pencil" label="Bearbeiten" />
        <IconButton icon="heart" label="Favorit" variant="soft" />
        <IconButton icon="plus" label="Hinzufügen" variant="filled" />
        <IconButton icon="trash" label="Löschen (ausgegraut)" disabled />
      </Row>
    </Block>
  );
}

function ChipBlock() {
  return (
    <Block title="Chips" testID="showroom-chips">
      <Row wrap gap={8}>
        <Chip label="Statisch" />
        <Chip label="Antippbar" onPress={() => undefined} />
        <Chip label="Gewählt" selected onPress={() => undefined} />
        <Chip label="Mit Symbol" icon="leaf" onPress={() => undefined} />
        <Chip label="Ausgegraut" disabled onPress={() => undefined} />
      </Row>
      <Row wrap gap={8}>
        {TONES.map((tone) => (
          <Chip key={tone} label={tone} tone={tone} onPress={() => undefined} />
        ))}
      </Row>
    </Block>
  );
}

function CheckBlock() {
  const [checked, setChecked] = useState(false);
  const [on, setOn] = useState(true);
  const [stars, setStars] = useState(4.5);
  return (
    <Block title="Auswahl" testID="showroom-checks">
      <Row gap={16}>
        <Checkbox label="Aus" checked={false} onChange={() => undefined} />
        <Checkbox label="An" checked onChange={() => undefined} />
        <Checkbox label="Ausgegraut" checked={false} disabled />
      </Row>
      <List>
        <CheckRow
          title="Milch"
          note="Hafer"
          subtitle="Kühlregal"
          checked={checked}
          onToggle={() => setChecked(!checked)}
        />
        <CheckRow title="Brot" checked onToggle={() => undefined} />
        <CheckRow title="Offline ausgegraut" checked={false} disabled onToggle={() => undefined} />
      </List>
      <SwitchRow label="Schalter" description="Mit Beschreibung" value={on} onValueChange={setOn} />
      <SwitchRow label="Ausgegraut" value={false} onValueChange={() => undefined} disabled />
      <Row gap={16} wrap>
        <Stars value={stars} onChange={setStars} label="Deine Bewertung" testID="showroom-stars" />
        <Stars value={3.5} size={16} />
        <Stars
          value={4.5}
          onChange={() => undefined}
          disabled
          hint="Offline – zum Bearbeiten brauchst du Netz"
        />
      </Row>
    </Block>
  );
}

function InputBlock() {
  const [value, setValue] = useState('');
  return (
    <Block title="Eingabefelder" testID="showroom-inputs">
      <TextField label="Normal" placeholder="Titel" value={value} onChangeText={setValue} />
      <TextField label="Mit Hinweis" placeholder="z. B. Bad" hint="Optional" />
      <TextField label="Mit Fehler" value="" placeholder="Titel" error="Titel fehlt" />
      <TextField
        round
        accessibilityLabel="Suche"
        placeholder="Suchen …"
        left={<Icon name="search" size={20} color="muted" />}
        right={<IconButton icon="mic" label="Sprechen" size={40} />}
      />
      <TextField label="Mehrzeilig" placeholder="Was würde euch helfen?" multiline />
    </Block>
  );
}

function SectionBlock() {
  return (
    <Block title="Abschnitte" testID="showroom-sections">
      <Section title="Essen heute" meta="2 Gerichte">
        <Text>Abschnitt mit Titel und Angabe rechts</Text>
      </Section>
      <Section title="Haushalt" action={<Button label="Alle" variant="link" size="sm" />}>
        <Text>Abschnitt mit Aktion</Text>
      </Section>
    </Block>
  );
}

function ListBlock() {
  return (
    <Block title="Listen" testID="showroom-lists">
      <GroupLabel>Obst & Gemüse</GroupLabel>
      <List>
        <ListRow
          title="Möhren"
          note="Bio"
          subtitle="auch: Karotten"
          trailing={<Text color="muted">1 kg</Text>}
        />
        <ListRow
          title="Antippbar"
          leading={<Icon name="store" color="muted" />}
          trailing={<Icon name="chevron-right" color="muted" />}
          onPress={() => undefined}
        />
        <ListRow title="Ausgegraut" disabled onPress={() => undefined} />
        <ListRow title="Erledigt" strike />
      </List>
      <GhostRow
        title="Eier"
        meta="6×"
        onAccept={() => toast.show({ message: 'Übernommen' })}
        onDiscard={() => toast.show({ message: 'Verworfen' })}
      />
    </Block>
  );
}

function PeopleBlock() {
  const members = useSampleMembers();
  return (
    <Block title="Personen und Marken" testID="showroom-people">
      <Row gap={12}>
        {members.map((member) => (
          <Row key={member.id} gap={6}>
            <Avatar name={member.name} color={member.color} size="xs" />
            <Avatar name={member.name} color={member.color} size="s" />
            <Avatar name={member.name} color={member.color} size="m" />
            <Avatar name={member.name} color={member.color} size="l" />
          </Row>
        ))}
      </Row>
      <AvatarStack members={members} />
      <Row wrap gap={6}>
        <Badge label="neutral" />
        <Badge label="erfolg" tone="success" icon="check" />
        <Badge label="hinweis" tone="warn" />
        <Badge label="akzent" tone="accent" />
        {TONES.map((tone) => (
          <Badge key={tone} label={tone} tone={tone} />
        ))}
      </Row>
    </Block>
  );
}

function MediaBlock() {
  return (
    <Block title="Bilder und Karten" testID="showroom-media">
      <Row gap={12} align="flex-start">
        <View style={{ flex: 1 }}>
          <Photo source={photoSource('curry')} aspectRatio={4 / 3} alt="Mango-Curry" />
        </View>
        <View style={{ flex: 1 }}>
          <Photo aspectRatio={4 / 3} placeholderIcon="cooking-pot" />
        </View>
      </Row>
      <Row gap={12} align="stretch">
        <MediaCard
          title="Mango-Curry"
          kicker="Abend · 35 Min"
          meta="vegan möglich"
          image={photoSource('curry')}
          layout="photoTop"
          badge={{ label: 'Rezept', icon: 'cooking-pot' }}
          onPress={() => undefined}
        />
        <MediaCard
          title="Ohne Foto"
          kicker="Vormittag"
          meta="Platzhalter"
          layout="photoTop"
          placeholderIcon="mountain"
          badge={{ label: 'Aktivität', icon: 'mountain' }}
        />
      </Row>
      <MediaCard
        title="Lasagne"
        kicker="Heute · Abend"
        meta="Vorbereitung: Ragù"
        image={photoSource('lasagne')}
        layout="thumbRow"
        corner={<Icon name="heart" size={18} color="accent" />}
      />
      <MediaCard
        title="Eislaufen (Hohenschönhausen)"
        kicker="Vormittag"
        meta="Eisstadion Hohenschönhausen"
        layout="thumbRow"
        placeholderIcon="mountain"
        badge={{ label: 'Aktivität', icon: 'mountain' }}
        onPress={() => undefined}
        testID="showroom-media-badge"
      />
      <MediaCard
        title="Groß"
        kicker="Größe l"
        image={photoSource('dal')}
        layout="thumbRow"
        size="l"
      />
    </Block>
  );
}

function ProgressBlock() {
  return (
    <Block title="Fortschritt" testID="showroom-progress">
      <Row gap={10}>
        <ProgressBar value={0.6} label="6 von 10 erledigt" />
        <Text variant="small" color="muted">
          6/10
        </Text>
      </Row>
      <Row gap={16}>
        <DueBar value={0.3} label="30 %" />
        <DueBar value={0.8} label="80 %" />
        <DueBar value={1.2} label="fällig" />
      </Row>
    </Block>
  );
}

function StateBlock() {
  return (
    <Block title="Zustände" testID="showroom-states">
      <OfflineBanner text={OFFLINE_BANNER_TEXT} testID="showroom-offline-banner" />
      <Notice text="Passt nicht für Nadja" />
      <Notice
        text="Curry geändert"
        icon="info"
        action={<Button label="Ansehen" variant="link" size="sm" />}
      />
      <Surface>
        <EmptyState
          icon="book-open"
          title="Noch keine Rezepte"
          text="Legt euer erstes Rezept an. Ein Titel reicht; Zutaten, Schritte und Links kommen später dazu."
        >
          <Button label="Rezept anlegen" icon="pencil" />
        </EmptyState>
      </Surface>
    </Block>
  );
}

function ProposalBlock() {
  const [checked, setChecked] = useState<string[]>(['servings', 'tofu']);
  const [status, setStatus] = useState<'open' | 'accepted' | 'discarded'>('open');
  const toggle = (id: string) =>
    setChecked((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  return (
    <Block title="Vorschlagskarte" testID="showroom-proposal">
      <ProposalCard
        title="Mango-Curry ändern"
        note="Beispielantwort – KI ist noch nicht angeschlossen"
        status={status}
        parts={[
          {
            id: 'servings',
            label: 'Portionen',
            before: '4',
            after: '6',
            checked: checked.includes('servings'),
          },
          {
            id: 'tofu',
            label: 'Zutat',
            before: 'Hähnchenbrust 300 g',
            after: 'Räuchertofu 450 g',
            checked: checked.includes('tofu'),
          },
          {
            id: 'sauce',
            label: 'Zutat',
            before: 'Fischsauce',
            after: 'Sojasauce',
            checked: checked.includes('sauce'),
          },
        ]}
        onTogglePart={toggle}
        onAccept={() => setStatus('accepted')}
        onEdit={() => undefined}
        onDiscard={() => setStatus('discarded')}
      />
      {status !== 'open' ? (
        <Button label="Zurücksetzen" variant="link" size="sm" onPress={() => setStatus('open')} />
      ) : null}
    </Block>
  );
}

function OverlayBlock() {
  const [open, setOpen] = useState(false);
  return (
    <Block title="Sheet und Hinweis" testID="showroom-overlay">
      <Row wrap gap={10}>
        <Button
          label="Sheet öffnen"
          variant="secondary"
          onPress={() => setOpen(true)}
          testID="showroom-open-sheet"
        />
        <Button
          label="Hinweis zeigen"
          variant="ghost"
          onPress={() =>
            toast.show({
              message: 'Posten entfernt',
              actionLabel: 'Rückgängig',
              onAction: () => undefined,
            })
          }
          testID="showroom-show-toast"
        />
      </Row>
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Beispiel-Sheet"
        testID="showroom-sheet"
        size="s"
        footer={<Button label="Fertig" full onPress={() => setOpen(false)} />}
      >
        <Text>Auf dem Handy von unten, auf breiten Bildschirmen als Dialog.</Text>
      </Sheet>
    </Block>
  );
}
