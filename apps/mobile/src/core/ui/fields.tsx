import { type ComponentProps, type ReactNode, useState } from 'react';
import { Switch, TextInput, type TextInputProps, View } from 'react-native';

import { useTranslation } from '@/core/i18n';
import { textStyle } from '@/core/theme';
import { primitives } from '@tokens/theme';
import {
  formatMoney,
  formatQuantity,
  getCurrency,
  type MinorUnits,
  parseMoneyInput,
  parseQuantityInput,
  QUANTITY_SCALE,
} from '@/shared';

import { IconButton } from './button';
import { Text } from './text';
import { useUi } from './use-ui';

interface FieldFrameProps {
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}

/** Label, hint and error message around a control. Errors are text plus color, never color alone. */
export function FieldFrame({ label, optional = false, hint, error, children }: FieldFrameProps) {
  const { theme } = useUi();
  const { t } = useTranslation();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ paddingHorizontal: theme.spacing.xs }}>
        <Text variant="overline" tone="secondary">
          {optional ? `${label} (${t('common.optional')})` : label}
        </Text>
      </View>
      {children}
      {error ? (
        <Text variant="label" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="secondary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function useInputStyle(error: string | undefined, focused: boolean, disabled: boolean) {
  const { theme, script } = useUi();
  const { colors } = theme;
  return {
    ...textStyle(theme, 'body', script),
    minHeight: theme.size.control,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    borderCurve: 'continuous' as const,
    // The border keeps its width in every state, so the text does not shift on focus.
    borderWidth: 2,
    borderColor: error
      ? colors.status.danger
      : focused
        ? colors.border.focus
        : colors.border.default,
    backgroundColor: disabled ? colors.bg.sunken : colors.bg.surface,
    color: disabled ? colors.text.disabled : colors.text.primary,
  };
}

export interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  optional?: boolean;
  hint?: string;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  multiline?: boolean;
  secure?: boolean;
  maxLength?: number;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
  onBlur?: () => void;
  ref?: ComponentProps<typeof TextInput>['ref'];
  testID?: string;
}

/**
 * Single- or multi-line text input.
 * States: default, focused (focus-colored border), disabled (sunken, muted, not
 * editable) and error (danger border plus a message announced as an alert).
 */
export function TextField({
  label,
  value,
  onChangeText,
  optional,
  hint,
  error,
  placeholder,
  disabled = false,
  multiline = false,
  secure = false,
  maxLength,
  keyboardType,
  autoCapitalize,
  autoComplete,
  returnKeyType,
  onSubmitEditing,
  onBlur,
  ref,
  testID,
}: TextFieldProps) {
  const { theme } = useUi();
  const [focused, setFocused] = useState(false);
  const style = useInputStyle(error, focused, disabled);
  return (
    <FieldFrame label={label} optional={optional} hint={hint} error={error}>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        editable={!disabled}
        multiline={multiline}
        secureTextEntry={secure}
        maxLength={maxLength}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.text.disabled}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        accessibilityState={{ disabled }}
        maxFontSizeMultiplier={2}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[style, multiline ? { minHeight: theme.size.touchTarget * 2 } : null]}
        testID={testID}
      />
    </FieldFrame>
  );
}

export interface AmountFieldProps {
  label: string;
  /** Minor units, or null while the field is empty or holds an invalid amount. */
  value: MinorUnits | null;
  onChange: (value: MinorUnits | null) => void;
  /** Interface language, for digits and grouping. */
  locale: string;
  currency: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  disabled?: boolean;
  testID?: string;
}

function amountText(value: MinorUnits | null, locale: string, currency: string): string {
  return value === null ? '' : formatMoney(value, { locale, currency, showSymbol: false });
}

/**
 * Money input. The person types a decimal amount (in either digit script); the field reports
 * integer minor units and never produces a floating-point number.
 * States: as TextField. While focused it shows what was typed; on blur it shows the formatted
 * amount.
 */
export function AmountField({
  label,
  value,
  onChange,
  locale,
  currency,
  optional,
  hint,
  error,
  disabled = false,
  testID,
}: AmountFieldProps) {
  const { theme } = useUi();
  const [focused, setFocused] = useState(false);
  // Only what the person is typing right now is local state; otherwise the value prop rules.
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const style = useInputStyle(error, focused, disabled);
  const symbol = getCurrency(currency).symbol;

  return (
    <FieldFrame label={label} optional={optional} hint={hint} error={error}>
      <View style={{ justifyContent: 'center' }}>
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', left: theme.spacing.lg, zIndex: theme.zIndex.raised }}
        >
          <Text tone={disabled ? 'disabled' : 'secondary'}>{symbol}</Text>
        </View>
        <TextInput
          value={draft ?? amountText(value, locale, currency)}
        onChangeText={(text) => {
          setDraft(text);
          onChange(text.trim() === '' ? null : parseMoneyInput(text, locale, currency));
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setDraft(undefined);
        }}
        editable={!disabled}
        keyboardType="decimal-pad"
        selectTextOnFocus
        placeholder={amountText(0, locale, currency)}
        placeholderTextColor={theme.colors.text.disabled}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        accessibilityState={{ disabled }}
        maxFontSizeMultiplier={2}
          style={[
            style,
            { fontVariant: ['tabular-nums'], paddingLeft: theme.spacing.lg + theme.spacing.xl },
          ]}
          testID={testID}
        />
      </View>
    </FieldFrame>
  );
}

export interface QuantityFieldProps {
  label: string;
  /** Quantity in thousandths, or null while empty or invalid. */
  value: number | null;
  onChange: (qtyMilli: number | null) => void;
  locale: string;
  /** Unit shown after the label, e.g. "bag". */
  unit?: string;
  error?: string;
  disabled?: boolean;
  testID?: string;
}

/**
 * Quantity input with − and + buttons that step by one whole unit. Fractions ("1.5") can be
 * typed. States: as TextField; the − button is disabled when the quantity cannot go lower.
 */
export function QuantityField({
  label,
  value,
  onChange,
  locale,
  unit,
  error,
  disabled = false,
  testID,
}: QuantityFieldProps) {
  const { theme } = useUi();
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const style = useInputStyle(error, focused, disabled);
  const current = value ?? 0;

  return (
    <FieldFrame label={unit ? `${label} (${unit})` : label} error={error}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <IconButton
          icon="minus"
          outlined
          accessibilityLabel={`${t('ui.decrease')}: ${label}`}
          disabled={disabled || current <= QUANTITY_SCALE}
          onPress={() => onChange(Math.max(QUANTITY_SCALE, current - QUANTITY_SCALE))}
        />
        <TextInput
          value={draft ?? (value === null ? '' : formatQuantity(value, locale))}
          onChangeText={(text) => {
            setDraft(text);
            const parsed = parseQuantityInput(text, locale);
            onChange(parsed !== null && parsed > 0 ? parsed : null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setDraft(undefined);
          }}
          editable={!disabled}
          keyboardType="decimal-pad"
          selectTextOnFocus
          accessibilityLabel={label}
          accessibilityState={{ disabled }}
          maxFontSizeMultiplier={2}
          style={[style, { flex: 1, textAlign: 'center', fontVariant: ['tabular-nums'] }]}
          testID={testID}
        />
        <IconButton
          icon="add"
          outlined
          accessibilityLabel={`${t('ui.increase')}: ${label}`}
          disabled={disabled}
          onPress={() => onChange(current + QUANTITY_SCALE)}
        />
      </View>
    </FieldFrame>
  );
}

export interface SwitchFieldProps {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** Keep label and switch together at their natural width, e.g. beside a list heading. */
  inline?: boolean;
  testID?: string;
}

/** On/off setting with its label. States: off, on, disabled. */
export function SwitchField({
  label,
  description,
  value,
  onChange,
  disabled = false,
  inline = false,
  testID,
}: SwitchFieldProps) {
  const { theme } = useUi();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: inline ? theme.spacing.sm : theme.spacing.lg,
        minHeight: theme.size.touchTarget,
      }}
    >
      <View style={inline ? null : { flex: 1, gap: theme.spacing.xs }}>
        <Text variant={inline ? 'label' : 'bodyStrong'} tone={disabled ? 'disabled' : 'primary'}>
          {label}
        </Text>
        {description ? (
          <Text variant="label" tone="secondary">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ true: theme.colors.action.primary, false: theme.colors.border.default }}
        thumbColor={
          value || theme.scheme === 'light' ? primitives.neutral[0] : theme.colors.text.secondary
        }
        testID={testID}
      />
    </View>
  );
}
