import {
  mapsSearchUrl,
  nextEmptyField,
  recognizePaste,
  recognizePlaceText,
  type PlaceText,
} from '@housekeeping/core';
import { Button, Icon, IconButton, Row, Stack, Text, TextField, toast } from '@housekeeping/ui';
import { useRef, type ComponentRef, type ReactNode } from 'react';
import { TextInput, View } from 'react-native';

import { canReadClipboard, readClipboardText } from '@/lib/clipboard';
import { openLink } from '@/lib/open-link';

type Field = 'link' | 'address';

const NOTHING_TO_PASTE = 'Nichts Passendes in der Zwischenablage';

/**
 * The place of a restaurant, an activity or a store (spec 0042, REQ-001, REQ-003): "Name für die
 * Suche" (the entry's name when empty), "Karten-Link" with the pin that searches Google Maps for
 * name and address, "Einfügen" from the clipboard, and the address where the entry has one. A map
 * link, a web address or an address pasted into any of the fields, or read by "Einfügen", lands
 * in its own field, and the cursor goes on to the next empty one.
 */
export function PlaceField(props: {
  testPrefix: string;
  /** The entry's name: what the search uses while "Name für die Suche" is empty. */
  entryName: string;
  searchName: string;
  onSearchNameChange: (value: string) => void;
  link: string;
  /** The form reads the link (confirmation, short link, "Das ist kein Karten-Link"). */
  onLinkChange: (text: string) => void;
  linkError?: string;
  linkHint?: string;
  linkAutoFocus?: boolean;
  /** Under the link: what was read from it, a short link, an existing entry. */
  linkStatus?: ReactNode;
  address?: { value: string; onChange: (value: string) => void };
  /** A pasted web address goes to the entry's "Webseite". */
  onWebsite?: (url: string) => void;
  /** Above the fields, e.g. "Ort (optional)". */
  title?: string;
}) {
  const linkRef = useRef<ComponentRef<typeof TextInput>>(null);
  const addressRef = useRef<ComponentRef<typeof TextInput>>(null);
  const { address, onWebsite } = props;
  const order: Field[] = address ? ['link', 'address'] : ['link'];
  const search = mapsSearchUrl({
    name: props.searchName.trim() || props.entryName,
    address: address?.value,
  });

  const focusAfter = (filled: Field, values: Partial<Record<Field, string>>) => {
    const next = nextEmptyField(
      order,
      { link: props.link, address: address?.value, ...values },
      filled,
    );
    if (next) (next === 'address' ? addressRef : linkRef).current?.focus();
  };

  /** Puts a recognised text into its field; false when this form has no field for it. */
  const place = (text: PlaceText): boolean => {
    if (text.kind === 'maps') {
      props.onLinkChange(text.url);
      focusAfter('link', { link: text.url });
      return true;
    }
    if (text.kind === 'address' && address) {
      address.onChange(text.text);
      focusAfter('address', { address: text.text });
      return true;
    }
    if (text.kind === 'web' && onWebsite) {
      onWebsite(text.url);
      return true;
    }
    return false;
  };

  /** A paste into `own` that belongs elsewhere moves there; the field keeps its own text. */
  const pastedElsewhere = (previous: string, next: string, own: Field | 'search'): boolean => {
    const text = recognizePaste(previous, next);
    if (text === undefined) return false;
    const target = text.kind === 'maps' ? 'link' : text.kind === 'address' ? 'address' : text.kind;
    if (target === own || target === 'none') return false;
    return place(text);
  };

  const paste = async () => {
    const text = recognizePlaceText((await readClipboardText()) ?? '');
    if (!place(text)) toast.show({ message: NOTHING_TO_PASTE });
  };

  return (
    <Stack gap={8}>
      {props.title ? <Text variant="smallStrong">{props.title}</Text> : null}
      <TextField
        label="Name für die Suche"
        value={props.searchName}
        onChangeText={(value) => {
          if (!pastedElsewhere(props.searchName, value, 'search')) props.onSearchNameChange(value);
        }}
        placeholder={props.entryName.trim() || 'z. B. Bless'}
        testID={`${props.testPrefix}-search-name`}
      />
      <Text variant="smallStrong">Karten-Link</Text>
      <Row gap={8} align="flex-start">
        <View style={{ flex: 1, minWidth: 0 }}>
          <TextField
            accessibilityLabel="Karten-Link"
            inputRef={linkRef}
            value={props.link}
            onChangeText={(value) => {
              if (pastedElsewhere(props.link, value, 'link')) return;
              props.onLinkChange(value);
              if (recognizePaste(props.link, value)?.kind === 'maps') {
                focusAfter('link', { link: value });
              }
            }}
            placeholder="Link aus Google Maps oder Apple Karten"
            autoFocus={props.linkAutoFocus}
            error={props.linkError}
            hint={props.linkHint}
            keyboardType="url"
            left={<Icon name="link" size={18} color="muted" />}
            testID={`${props.testPrefix}-link`}
          />
        </View>
        <IconButton
          icon="map-pin"
          label="In Google Maps suchen"
          variant="soft"
          size={44}
          disabled={!search}
          hint={search ? undefined : 'Erst einen Namen eingeben'}
          onPress={() => {
            if (search) openLink(search);
          }}
          testID={`${props.testPrefix}-maps-search`}
        />
      </Row>
      {props.linkStatus}
      {canReadClipboard() ? (
        <View style={{ alignItems: 'flex-start' }}>
          <Button
            label="Einfügen"
            icon="clipboard-paste"
            variant="secondary"
            size="sm"
            onPress={() => void paste()}
            testID={`${props.testPrefix}-paste`}
          />
        </View>
      ) : null}
      {address ? (
        <TextField
          label="Adresse"
          inputRef={addressRef}
          value={address.value}
          onChangeText={(value) => {
            if (pastedElsewhere(address.value, value, 'address')) return;
            address.onChange(value);
            if (recognizePaste(address.value, value)?.kind === 'address') {
              focusAfter('address', { address: value });
            }
          }}
          placeholder="Straße, PLZ Ort"
          testID={`${props.testPrefix}-address`}
        />
      ) : null}
    </Stack>
  );
}
