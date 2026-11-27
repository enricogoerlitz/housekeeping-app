import { nextEmptyField, recognizePaste, type PlaceText } from '@housekeeping/core';
import { Icon, Stack, Text, TextField } from '@housekeeping/ui';
import { useRef, type ComponentRef, type ReactNode } from 'react';
import { TextInput } from 'react-native';

type Field = 'link' | 'address';

/**
 * The place of a restaurant, an activity or a store (spec 0042, REQ-001, REQ-003): the field
 * "Google Maps Link" and the address where the entry has one, for an activity above them its
 * "Ortsname". A map link, a web address or an address pasted into any of the fields lands in its
 * own field, and the cursor goes on to the next empty one. Beside the link there is no
 * "Einfügen" and no Google Maps search (spec 0042, decision 14): pasting into the field is the way.
 */
export function PlaceField(props: {
  testPrefix: string;
  /** "Ortsname" of an activity (spec 0042, decision 4), above the link. */
  placeName?: { value: string; onChange: (value: string) => void; placeholder: string };
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
  const { address, onWebsite, placeName } = props;
  const order: Field[] = address ? ['link', 'address'] : ['link'];

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
  const pastedElsewhere = (previous: string, next: string, own: Field | 'name'): boolean => {
    const text = recognizePaste(previous, next);
    if (text === undefined) return false;
    const target = text.kind === 'maps' ? 'link' : text.kind === 'address' ? 'address' : text.kind;
    if (target === own || target === 'none') return false;
    return place(text);
  };

  return (
    <Stack gap={8}>
      {props.title ? <Text variant="smallStrong">{props.title}</Text> : null}
      {placeName ? (
        <TextField
          label="Ortsname"
          value={placeName.value}
          onChangeText={(value) => {
            if (!pastedElsewhere(placeName.value, value, 'name')) placeName.onChange(value);
          }}
          placeholder={placeName.placeholder}
          testID={`${props.testPrefix}-place-name`}
        />
      ) : null}
      <TextField
        label="Google Maps Link"
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
      {props.linkStatus}
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
