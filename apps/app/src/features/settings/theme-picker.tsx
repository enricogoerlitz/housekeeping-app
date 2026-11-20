import {
  Icon,
  Text,
  ThemeProvider,
  themeFamilies,
  useTheme,
  type ColorMode,
  type ThemeFamily,
} from '@housekeeping/ui';
import { Pressable, View } from 'react-native';

import { useSettings } from '@/lib/settings';

/** One card per theme with a small live preview; choosing applies it at once (AC-046). */
export function ThemePicker() {
  const settings = useSettings();
  return (
    <View testID="theme-picker" style={{ gap: 10 }}>
      {themeFamilies.map((family) => (
        <ThemeCard
          key={family.id}
          family={family}
          mode={settings.mode}
          selected={settings.themeId === family.id}
          onSelect={() => settings.update({ themeId: family.id })}
        />
      ))}
    </View>
  );
}

function ThemeCard(props: {
  family: ThemeFamily;
  mode: ColorMode;
  selected: boolean;
  onSelect: () => void;
}) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      testID={`theme-${props.family.id}`}
      accessibilityRole="radio"
      accessibilityLabel={`Theme ${props.family.name}`}
      accessibilityState={{ selected: props.selected, checked: props.selected }}
      onPress={props.onSelect}
      style={(state) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          padding: 10,
          borderRadius: theme.shape.radius.card,
          backgroundColor: c.surface,
          borderWidth: 2,
          borderColor: props.selected ? c.accent : c.border,
          opacity: state.pressed ? 0.8 : 1,
        },
        (state as { focused?: boolean }).focused
          ? {
              outlineWidth: 2,
              outlineColor: c.text,
              outlineStyle: 'solid' as const,
              outlineOffset: 2,
            }
          : null,
      ]}
    >
      {/* The preview renders with the theme it shows, independent of the active one. */}
      <ThemeProvider themeId={props.family.id} mode={props.mode}>
        <ThemePreview />
      </ThemeProvider>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="bodyStrong">{props.family.name}</Text>
        <Text variant="small" color="muted">
          {props.family.description}
        </Text>
      </View>
      <View style={{ width: 28, alignItems: 'center' }}>
        {props.selected ? (
          <Icon
            name="circle-check"
            size={24}
            color="accent"
            testID={`theme-${props.family.id}-selected`}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

function ThemePreview() {
  const theme = useTheme();
  const c = theme.colors;
  const swatches = [c.accent, c.success, c.tones.plan.bg];
  return (
    <View
      style={{
        width: 92,
        height: 72,
        borderRadius: theme.shape.radius.control,
        backgroundColor: c.bg,
        borderWidth: 1,
        borderColor: c.border,
        padding: 8,
        justifyContent: 'space-between',
      }}
    >
      <Text variant="heading">Aa</Text>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        {swatches.map((color, index) => (
          // Index is the identity here: three fixed slots.
          <View
            key={index}
            style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: color }}
          />
        ))}
      </View>
    </View>
  );
}
