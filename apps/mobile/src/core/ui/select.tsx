import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useTranslation } from '@/core/i18n';

import { FieldFrame } from './fields';
import { Icon } from './icon';
import { BottomSheet } from './overlays';
import { ListItem } from './surfaces';
import { Text } from './text';
import { useUi } from './use-ui';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export interface SelectProps<T extends string> {
  label: string;
  value: T | null;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  optional?: boolean;
  error?: string;
  disabled?: boolean;
  testID?: string;
}

/**
 * Chooses one option from a list shown in a bottom sheet.
 * States: empty (placeholder), selected, pressed, disabled, error. The selected option is
 * marked with a check icon and announced as selected.
 */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
  optional,
  error,
  disabled = false,
  testID,
}: SelectProps<T>) {
  const { theme } = useUi();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <FieldFrame label={label} optional={optional} error={error}>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder ?? t('ui.choose')}`}
        accessibilityState={{ disabled, expanded: open }}
        testID={testID}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          minHeight: theme.size.control,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
          borderRadius: theme.radius.lg,
          borderCurve: 'continuous',
          borderWidth: 2,
          borderColor: error ? theme.colors.status.danger : theme.colors.border.default,
          backgroundColor: disabled || pressed ? theme.colors.bg.sunken : theme.colors.bg.surface,
        })}
      >
        <Text flex tone={disabled ? 'disabled' : selected ? 'primary' : 'secondary'}>
          {selected?.label ?? placeholder ?? t('ui.choose')}
        </Text>
        <Icon name="chevronDown" size="md" tone="secondary" />
      </Pressable>

      <BottomSheet visible={open} onClose={() => setOpen(false)} title={label}>
        <View accessibilityRole="radiogroup">
          {options.map((option) => (
            <ListItem
              key={option.value}
              title={option.label}
              subtitle={option.description}
              trailing={
                option.value === value ? <Icon name="check" size="md" tone="success" /> : undefined
              }
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
            />
          ))}
        </View>
      </BottomSheet>
    </FieldFrame>
  );
}
