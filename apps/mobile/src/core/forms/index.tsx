import {
  type Control,
  Controller,
  type FieldPath,
  type FieldPathByValue,
  type FieldValues,
  type UseFormSetError,
} from 'react-hook-form';

import { useLanguage, useTranslation } from '@/core/i18n';
import {
  AmountField,
  type AmountFieldProps,
  Select,
  type SelectOption,
  type SelectProps,
  SwitchField,
  type SwitchFieldProps,
  TextField,
  type TextFieldProps,
} from '@/core/ui';
import { isDomainError } from '@/core/utils';

// Forms use react-hook-form with Zod schemas. Schemas report problems as short error codes
// (below); these helpers bind a field to the design-system control and translate the code.

/** Error codes a form schema or use case may report for a field. */
export const FORM_ERRORS = [
  'required',
  'tooLong',
  'invalidPhone',
  'invalidAmount',
  'invalidQuantity',
  'invalidPrefix',
  'invalidEmail',
  'duplicateName',
  'passwordTooShort',
  'passwordMismatch',
] as const;
export type FormErrorCode = (typeof FORM_ERRORS)[number];

export function isFormErrorCode(value: unknown): value is FormErrorCode {
  return FORM_ERRORS.some((code) => code === value);
}

/** Translates a field's error code; unknown codes get a generic message. */
export function useFieldErrorText(): (code: string | undefined) => string | undefined {
  const { t } = useTranslation();
  return (code) => {
    if (code === undefined) return undefined;
    return isFormErrorCode(code) ? t(`errors.${code}`) : t('errors.invalid');
  };
}

type Bound<TProps, TOmitted extends keyof TProps> = Omit<TProps, TOmitted | 'error'>;

interface FormTextFieldProps<T extends FieldValues> extends Bound<
  TextFieldProps,
  'value' | 'onChangeText' | 'onBlur'
> {
  control: Control<T>;
  name: FieldPathByValue<T, string>;
}

export function FormTextField<T extends FieldValues>({
  control,
  name,
  ...props
}: FormTextFieldProps<T>) {
  const errorText = useFieldErrorText();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          {...props}
          value={field.value}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          error={errorText(fieldState.error?.message)}
        />
      )}
    />
  );
}

interface FormAmountFieldProps<T extends FieldValues> extends Bound<
  AmountFieldProps,
  'value' | 'onChange' | 'locale'
> {
  control: Control<T>;
  name: FieldPathByValue<T, number | null>;
}

export function FormAmountField<T extends FieldValues>({
  control,
  name,
  ...props
}: FormAmountFieldProps<T>) {
  const errorText = useFieldErrorText();
  const language = useLanguage();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <AmountField
          {...props}
          locale={language}
          value={field.value}
          onChange={field.onChange}
          error={errorText(fieldState.error?.message)}
        />
      )}
    />
  );
}

interface FormSelectProps<T extends FieldValues, V extends string> extends Bound<
  SelectProps<V>,
  'value' | 'onChange'
> {
  control: Control<T>;
  name: FieldPathByValue<T, V | null>;
  options: readonly SelectOption<V>[];
  /** Called after the form value changed, for immediate side effects (e.g. switch language). */
  onValueChange?: (value: V) => void;
}

export function FormSelect<T extends FieldValues, V extends string>({
  control,
  name,
  onValueChange,
  ...props
}: FormSelectProps<T, V>) {
  const errorText = useFieldErrorText();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Select
          {...props}
          value={field.value}
          onChange={(value) => {
            field.onChange(value);
            onValueChange?.(value);
          }}
          error={errorText(fieldState.error?.message)}
        />
      )}
    />
  );
}

interface FormSwitchProps<T extends FieldValues> extends Omit<
  SwitchFieldProps,
  'value' | 'onChange'
> {
  control: Control<T>;
  name: FieldPathByValue<T, boolean>;
}

export function FormSwitch<T extends FieldValues>({ control, name, ...props }: FormSwitchProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <SwitchField {...props} value={field.value} onChange={field.onChange} />
      )}
    />
  );
}

/**
 * Shows a business-rule error from a use case on the form field it belongs to.
 * Returns false when the error is not a field error; the caller then shows a general message.
 */
export function applyFieldError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly FieldPath<T>[],
): boolean {
  if (!isDomainError(error)) return false;
  const field = fields.find((name) => name === error.field);
  if (!field) return false;
  setError(field, { message: error.code });
  return true;
}
