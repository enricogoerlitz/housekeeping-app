import { Text, useBreakpoint, type EditableSectionProps } from '@housekeeping/ui';

import { useOnlineOnly } from '@/features/shell/offline';

import type { PageSection, SectionEditor } from './use-section-editor';

export const DONE_LABEL = 'Fertig';
export const CANCEL_LABEL = 'Abbrechen';

/**
 * The props every section of the recipe page shares: pen, "Abbrechen" and "Fertig" (spec 0023,
 * REQ-003), offline greyed out; on phones an opened section scrolls its head to the top.
 */
export function useSectionFrame(
  editor: SectionEditor,
  section: PageSection,
  title: string,
): Omit<EditableSectionProps, 'testID' | 'children'> {
  const online = useOnlineOnly();
  const { isPhone } = useBreakpoint();
  return {
    title,
    editing: editor.editing(section),
    onEdit: () => editor.edit(section),
    onDone: editor.done,
    onCancel: editor.cancel,
    editLabel: `${title} bearbeiten`,
    doneLabel: DONE_LABEL,
    cancelLabel: CANCEL_LABEL,
    scrollOnOpen: isPhone,
    disabled: online.disabled,
    hint: online.hint,
  };
}

/** Why "Fertig" did not save (offline, or a check that failed locally). */
export function SectionError(props: { editor: SectionEditor; testID: string }) {
  if (!props.editor.error) return null;
  return (
    <Text variant="small" color="warn" testID={props.testID}>
      {props.editor.error}
    </Text>
  );
}
