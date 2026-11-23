// Showroom block for spec 0016: the drag foundation of packages/ui with three boxes and chips.
import {
  Chip,
  DragProvider,
  Section,
  Stack,
  Surface,
  SwitchRow,
  Text,
  announce,
  toast,
  useDragSource,
  useDropTarget,
} from '@housekeeping/ui';
import { useRef, useState, type ReactNode } from 'react';
import { View, type HostInstance } from 'react-native';

const OFFLINE_HINT = 'Offline – zum Bearbeiten brauchst du Netz';

type DragBox = 'montag' | 'dienstag' | 'vorgemerkt';
const DRAG_BOXES: { id: DragBox; label: string }[] = [
  { id: 'montag', label: 'Montag' },
  { id: 'dienstag', label: 'Dienstag' },
  { id: 'vorgemerkt', label: 'Vorgemerkt' },
];
const DRAG_ITEMS = [
  { id: 'lasagne', name: 'Lasagne' },
  { id: 'reste', name: 'Reste von Lasagne' },
  { id: 'halloumi', name: 'Halloumi-Pfanne' },
] as const;
type DragItemId = (typeof DRAG_ITEMS)[number]['id'];
const REFUSED = 'Reste lassen sich nicht vormerken';

const boxLabel = (box: string) => DRAG_BOXES.find((entry) => entry.id === box)?.label ?? box;
const itemName = (id: string) => DRAG_ITEMS.find((item) => item.id === id)?.name ?? id;
const isItem = (id: string): id is DragItemId => DRAG_ITEMS.some((item) => item.id === id);
const isBox = (id: string): id is DragBox => DRAG_BOXES.some((box) => box.id === id);
// Like leftovers, which stay behind their dish (spec 0016, AC-015): they cannot be put aside.
const dragAllowed = (box: string, item: string) => !(item === 'reste' && box === 'vorgemerkt');

export function DragDropBlock() {
  const [offline, setOffline] = useState(false);
  const [placed, setPlaced] = useState<Record<DragItemId, DragBox>>({
    lasagne: 'montag',
    reste: 'dienstag',
    halloumi: 'vorgemerkt',
  });
  const moveTo = (item: DragItemId, box: DragBox) => {
    if (placed[item] === box) return;
    setPlaced((current) => ({ ...current, [item]: box }));
    const message = `${itemName(item)} → ${boxLabel(box)}`;
    toast.show({ message });
    announce(message);
  };
  const nextBox = (item: DragItemId): DragBox => {
    const boxes = DRAG_BOXES.filter((box) => dragAllowed(box.id, item));
    const index = boxes.findIndex((box) => box.id === placed[item]);
    return boxes[(index + 1) % boxes.length]?.id ?? placed[item];
  };

  return (
    <Section title="Ziehen und Ablegen" testID="showroom-drag">
      <Stack gap={12}>
        <Text variant="small" color="muted">
          Finger: gedrückt halten, bis der Eintrag sich abhebt, dann ziehen; Wischen ohne Halten
          scrollt. Maus: drücken und ziehen. Abbrechen: außerhalb loslassen, Escape oder ein zweiter
          Finger. „Reste von Lasagne“ lässt sich nicht vormerken: das Feld wird blass. Screenreader:
          Aktion „Verschieben“.
        </Text>
        <SwitchRow label="Offline" value={offline} onValueChange={setOffline} />
        <DragProvider
          isAllowed={dragAllowed}
          targetLabel={(box, item) => (dragAllowed(box, item) ? `→ ${boxLabel(box)}` : REFUSED)}
          onLift={(item) => announce(`${itemName(item)} angefasst`)}
          onHover={(box) => {
            if (box) announce(boxLabel(box));
          }}
          onDrop={(box, item) => {
            if (isItem(item) && isBox(box)) moveTo(item, box);
          }}
          onCancel={(item, refused) => {
            if (refused) toast.show({ message: REFUSED });
            else announce(`${itemName(item)} zurückgelegt`);
          }}
          style={{ zIndex: 1 }}
          testID="showroom-drag-area"
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {DRAG_BOXES.map((box) => (
              <DropBox key={box.id} id={box.id} label={box.label}>
                {DRAG_ITEMS.filter((item) => placed[item.id] === box.id).map((item) => (
                  <DragChip
                    key={item.id}
                    id={item.id}
                    name={item.name}
                    disabled={offline}
                    onMove={() => moveTo(item.id, nextBox(item.id))}
                  />
                ))}
              </DropBox>
            ))}
          </View>
        </DragProvider>
      </Stack>
    </Section>
  );
}

function DropBox(props: { id: DragBox; label: string; children: ReactNode }) {
  const ref = useRef<HostInstance>(null);
  const target = useDropTarget(props.id, ref);
  return (
    <View
      ref={ref}
      onLayout={target.onLayout}
      testID={`showroom-drag-box-${props.id}`}
      style={{ flexGrow: 1, flexBasis: 160, opacity: target.dimmed ? 0.4 : 1 }}
    >
      <Surface sunken padding={12} style={{ minHeight: 120, gap: 8 }}>
        <Text variant="smallStrong" color="muted">
          {props.label}
        </Text>
        {props.children}
      </Surface>
    </View>
  );
}

function DragChip(props: { id: string; name: string; disabled: boolean; onMove: () => void }) {
  const {
    ref,
    props: sourceProps,
    style,
    dragging,
    guardPress,
  } = useDragSource({
    id: props.id,
    preview: () => <Chip label={props.name} />,
    disabled: props.disabled,
    onBlocked: () => toast.show({ message: OFFLINE_HINT }),
    accessibilityAction: { label: 'Verschieben', onAction: props.onMove },
  });
  return (
    <View
      ref={ref}
      {...sourceProps}
      testID={`showroom-drag-item-${props.id}`}
      style={[style, { alignSelf: 'flex-start', opacity: dragging ? 0.35 : 1 }]}
    >
      <Chip
        label={props.name}
        onPress={guardPress(() => toast.show({ message: `${props.name} geöffnet` }))}
      />
    </View>
  );
}
