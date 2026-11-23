import { useEffect, useEffectEvent, useRef, type ReactNode } from 'react';
import { Platform, View, type HostInstance } from 'react-native';

import { Button, IconButton } from './controls';
import { Section } from './lists';
import { Row } from './primitives';

export interface EditableSectionProps {
  title: string;
  /** The section is open for editing: "Fertig" instead of the pencil. */
  editing: boolean;
  /** The pencil; opening this section saves and closes any other one (the caller decides). */
  onEdit: () => void;
  /** "Fertig": the caller checks and saves, and keeps the section open while it is invalid. */
  onDone: () => void;
  /** Accessible name of the pencil, e.g. "Notizen bearbeiten". */
  editLabel: string;
  /** Text of the button that closes the section, e.g. "Fertig". */
  doneLabel: string;
  /**
   * "Abbrechen" next to "Fertig" (spec 0023, REQ-003): closes without saving and without asking;
   * Escape on the web does the same while no window or menu is open above it. Usable offline.
   */
  onCancel?: () => void;
  cancelLabel?: string;
  /**
   * Opened, the section scrolls so that its head with "Abbrechen" and "Fertig" stands at the top
   * (on phones, spec 0023, AC-012); without animation when the system asks for reduced motion.
   */
  scrollOnOpen?: boolean;
  /** Greys out the pencil, e.g. offline; `hint` says why. "Fertig" stays usable. */
  disabled?: boolean;
  hint?: string;
  /** Read view or the fields, as the caller switches them with `editing`. */
  children?: ReactNode;
  /** Shown before the pencil while the section is read, e.g. the portions stepper of "Zutaten". */
  accessory?: ReactNode;
  /**
   * No title row: the pencil stands to the right of the content, "Abbrechen" and "Fertig" above
   * the fields, for a block that has its own heading (the head of a recipe with its title);
   * `title` is not shown then.
   */
  inline?: boolean;
  /** The section; the pencil is `${testID}-edit`, "Fertig" `${testID}-done`. */
  testID?: string;
}

/**
 * A section of a page that is read by default and edited on its own (spec 0008, REQ-007): the
 * title carries a pencil, which turns into "Fertig" while the section is open. Only one section is
 * open at a time; the caller keeps that state and the draft. After "Fertig" the focus returns to
 * the pencil.
 */
export function EditableSection(props: EditableSectionProps) {
  const pencil = useRef<HostInstance>(null);
  const box = useRef<HostInstance>(null);
  const closedHere = useRef(false);
  const { editing, scrollOnOpen } = props;
  useEffect(() => {
    // Only after this section's own "Fertig": a pencil elsewhere keeps its focus.
    if (editing || !closedHere.current) return;
    closedHere.current = false;
    pencil.current?.focus();
  }, [editing]);

  const cancel = useEffectEvent(() => {
    closedHere.current = true;
    props.onCancel?.();
  });
  const cancellable = props.onCancel !== undefined;
  useEffect(() => {
    if (!editing || !cancellable || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // A window or menu above closes first; it handles its own Escape (AC-011).
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      cancel();
    };
    // Capture phase: react-native-web's TextInput stops its key events from bubbling.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [editing, cancellable]);

  useEffect(() => {
    if (!editing || !scrollOnOpen || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const node = box.current as unknown as {
      scrollIntoView?: (options: { block: 'start'; behavior: 'auto' | 'smooth' }) => void;
    } | null;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    node?.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  }, [editing, scrollOnOpen]);

  const id = (part: string) => (props.testID ? `${props.testID}-${part}` : undefined);
  const done = (
    <Button
      label={props.doneLabel}
      icon="check"
      size="sm"
      onPress={() => {
        closedHere.current = true;
        props.onDone();
      }}
      testID={id('done')}
    />
  );
  const control = editing ? (
    props.onCancel ? (
      <Row gap={8}>
        <Button
          label={props.cancelLabel ?? ''}
          variant="ghost"
          size="sm"
          onPress={() => {
            closedHere.current = true;
            props.onCancel?.();
          }}
          testID={id('cancel')}
        />
        {done}
      </Row>
    ) : (
      done
    )
  ) : (
    // The Section title row aligns on the baseline; the pencil sits centred on it.
    <View style={{ marginVertical: props.inline ? 0 : -8, marginRight: -8 }}>
      <IconButton
        ref={pencil}
        icon="pencil"
        size={44}
        label={props.editLabel}
        disabled={props.disabled}
        hint={props.hint}
        onPress={props.onEdit}
        testID={id('edit')}
      />
    </View>
  );
  const action =
    props.accessory && !editing ? (
      <Row gap={8}>
        {props.accessory}
        {control}
      </Row>
    ) : (
      control
    );

  if (props.inline && editing) {
    // The fields take the whole width; on a phone beside them they would be squeezed.
    return (
      <View ref={box} testID={props.testID} style={{ gap: 12 }}>
        <View style={{ alignSelf: 'flex-end' }}>{action}</View>
        {props.children}
      </View>
    );
  }
  if (props.inline) {
    return (
      <View
        ref={box}
        testID={props.testID}
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>{props.children}</View>
        {action}
      </View>
    );
  }
  return (
    <View ref={box}>
      <Section title={props.title} testID={props.testID} action={action}>
        {props.children}
      </Section>
    </View>
  );
}
