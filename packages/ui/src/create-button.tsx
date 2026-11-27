import { Button, IconButton } from './controls';
import { useBreakpoint } from './theme-context';

export interface CreateButtonProps {
  /** What it creates, as an action: "Rezept anlegen", "Reise eintragen" (text from the app). */
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  /** Why it is greyed out (e.g. offline). */
  hint?: string;
  testID?: string;
}

/**
 * The one way to create something on a page (spec 0054, REQ-001), at the right of the header: on
 * phones a "+" without a circle named by `label`, from tablet width a small filled button
 * "+ ‹label›" — creating is the main action of a list page.
 */
export function CreateButton(props: CreateButtonProps) {
  const { isPhone } = useBreakpoint();
  if (isPhone) {
    return (
      <IconButton
        icon="plus"
        label={props.label}
        onPress={props.onPress}
        disabled={props.disabled}
        hint={props.hint}
        testID={props.testID}
      />
    );
  }
  return (
    <Button
      label={props.label}
      icon="plus"
      size="sm"
      onPress={props.onPress}
      disabled={props.disabled}
      hint={props.hint}
      testID={props.testID}
    />
  );
}
