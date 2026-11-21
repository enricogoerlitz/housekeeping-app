import { Text, type EditableSectionProps } from '@housekeeping/ui';

import { useOnlineOnly } from '@/features/shell/offline';

import type { PageSection, SectionEditor } from './use-section-editor';

export const DONE_LABEL = 'Fertig';

/** The props every section of the recipe page shares: pen, "Fertig", offline greyed out. */
export function useSectionFrame(
  editor: SectionEditor,
  section: PageSection,
  title: string,
): Omit<EditableSectionProps, 'testID' | 'children'> {
  const online = useOnlineOnly();
  return {
    title,
    editing: editor.editing(section),
    onEdit: () => editor.edit(section),
    onDone: editor.done,
    editLabel: `${title} bearbeiten`,
    doneLabel: DONE_LABEL,
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
