import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { actionGradient, boxShadow, textStyle } from '@/core/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';
import { useUi } from './use-ui';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

export interface SegmentedControlProps<T extends string> {
  /** What is being chosen, for screen readers. */
  accessibilityLabel: string;
  value: T;
  options: readonly ChoiceOption<T>[];
  onChange: (value: T) => void;
  /** Each segment gets `${testID}-${value}`. */
  testID?: string;
}

/**
 * Chooses one of two to four options that are all visible at once (report period, how an
 * invoice is paid, appearance). For longer lists use `Select`.
 * States per segment: unselected, selected (brand gradient, announced as selected), pressed.
 */
export function SegmentedControl<T extends string>({
  accessibilityLabel,
  value,
  options,
  onChange,
  testID,
}: SegmentedControlProps<T>) {
  const { theme } = useUi();
  const { colors } = theme;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={{
        flexDirection: 'row',
        gap: theme.spacing.xs,
        padding: theme.spacing.xs,
        borderRadius: theme.radius.xl,
        borderCurve: 'continuous',
        backgroundColor: colors.bg.surface,
        boxShadow: boxShadow(theme, 'sm'),
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, checked: selected }}
            testID={testID ? `${testID}-${option.value}` : undefined}
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.spacing.sm,
              minHeight: theme.size.touchTarget,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: theme.spacing.xs,
              borderRadius: theme.radius.lg,
              borderCurve: 'continuous',
              backgroundColor: selected
                ? colors.action.primary
                : pressed
                  ? colors.bg.sunken
                  : 'transparent',
              backgroundImage: selected ? actionGradient(theme) : undefined,
            })}
          >
            {option.icon ? (
              <Icon name={option.icon} size="md" tone={selected ? 'onAction' : 'primary'} />
            ) : null}
            <Text variant="bodyStrong" tone={selected ? 'onAction' : 'primary'} align="center">
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export interface ChipGroupProps<T extends string> {
  /** What the chips filter, for screen readers. */
  accessibilityLabel: string;
  value: T;
  options: readonly ChoiceOption<T>[];
  onChange: (value: T) => void;
  /** Each chip gets `${testID}-${value}`. */
  testID?: string;
}

/**
 * Row of filter chips where exactly one is active (All / Paid / Due / Partial). The row
 * scrolls sideways when the chips do not fit, e.g. at large text sizes.
 * States per chip: unselected, selected (brand gradient, announced as selected), pressed.
 */
export function ChipGroup<T extends string>({
  accessibilityLabel,
  value,
  options,
  onChange,
  testID,
}: ChipGroupProps<T>) {
  const { theme } = useUi();
  const { colors } = theme;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      // Each chip's shadow needs room, or the scroll view clips it.
      contentContainerStyle={{ gap: theme.spacing.sm, padding: theme.spacing.xs }}
      style={{ margin: -theme.spacing.xs, flexGrow: 0 }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, checked: selected }}
            // The chip is 40dp tall; the slop brings its touch target to 48dp.
            hitSlop={theme.spacing.xs}
            testID={testID ? `${testID}-${option.value}` : undefined}
            style={({ pressed }) => ({
              justifyContent: 'center',
              minHeight: theme.size.touchTarget - theme.spacing.sm,
              paddingHorizontal: theme.spacing.lg,
              borderRadius: theme.radius.full,
              backgroundColor: selected
                ? colors.action.primary
                : pressed
                  ? colors.bg.sunken
                  : colors.bg.surface,
              backgroundImage: selected ? actionGradient(theme) : undefined,
              boxShadow: selected ? undefined : boxShadow(theme, 'sm'),
            })}
          >
            <Text variant="bodyStrong" tone={selected ? 'onAction' : 'primary'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export interface SearchFieldProps {
  /** Names the field for screen readers, e.g. "Search by name or phone". */
  label: string;
  /** Short prompt shown while the field is empty. */
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  testID?: string;
}

/**
 * Search box at the top of a list.
 * States: empty (placeholder), filled, focused (focus-colored border).
 */
export function SearchField({
  label,
  placeholder,
  value,
  onChangeText,
  testID,
}: SearchFieldProps) {
  const { theme, script } = useUi();
  const { colors } = theme;
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: theme.size.control,
        paddingHorizontal: theme.spacing.xl,
        borderRadius: theme.radius.full,
        borderWidth: 2,
        borderColor: focused ? colors.border.focus : 'transparent',
        backgroundColor: colors.bg.surface,
        boxShadow: boxShadow(theme, 'sm'),
      }}
    >
      <Icon name="search" size="md" tone="secondary" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={colors.text.secondary}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={label}
        maxFontSizeMultiplier={2}
        style={[
          textStyle(theme, 'body', script),
          { flex: 1, paddingVertical: theme.spacing.sm, color: colors.text.primary },
        ]}
        testID={testID}
      />
    </View>
  );
}
