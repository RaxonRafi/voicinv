import { ChevronDown } from 'lucide-react';
import { type ComponentProps, type ReactNode } from 'react';

import { cx } from './cx';

const CONTROL =
  'min-h-12 w-full rounded-xl border bg-bg-surface px-4 py-2 text-body text-text-primary ' +
  'placeholder:text-text-disabled disabled:bg-bg-sunken disabled:text-text-disabled ' +
  'transition-colors duration-(--vl-duration-fast) ease-standard';

const borderFor = (error: string | undefined, attention: boolean) =>
  error ? 'border-status-danger' : attention ? 'border-confidence-low' : 'border-border-default';

interface FieldShellProps {
  id: string;
  label: string;
  /** Appended to the label for fields that may be left empty, e.g. "optional". */
  optionalLabel?: string;
  hint?: string;
  error?: string;
  /** Keeps the label for screen readers only, when a heading above already names the field. */
  hideLabel?: boolean;
  children: ReactNode;
}

/** Label, optional hint and error message around a form control. */
function FieldShell({
  id,
  label,
  optionalLabel,
  hint,
  error,
  hideLabel,
  children,
}: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={cx('text-label text-text-primary', hideLabel && 'sr-only')}>
        {label}
        {optionalLabel ? <span className="text-text-secondary"> ({optionalLabel})</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-caption text-text-secondary">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-label text-status-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

interface FieldProps {
  id: string;
  label: string;
  optionalLabel?: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
  /**
   * Marks a value the app is unsure about (a low-confidence voice field): an amber border,
   * always together with a hint that says so in words.
   */
  attention?: boolean;
}

type TextFieldProps = FieldProps & {
  /** Short text shown inside the field before the value, e.g. a currency symbol. */
  prefix?: string;
} & Omit<
    ComponentProps<'input'>,
    'id' | 'className' | 'aria-invalid' | 'aria-describedby' | 'prefix'
  >;

/**
 * Single-line text input.
 * States: default, focused (focus ring), disabled (sunken, muted), needs attention (amber
 * border plus hint) and error (danger border plus a message announced through
 * `aria-describedby`).
 */
export function TextField({
  id,
  label,
  optionalLabel,
  hint,
  error,
  hideLabel,
  attention = false,
  prefix,
  ...input
}: TextFieldProps) {
  const control = (
    <input
      id={id}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(id, hint, error)}
      className={cx(CONTROL, borderFor(error, attention), prefix !== undefined && 'pl-12')}
      {...input}
    />
  );
  return (
    <FieldShell
      id={id}
      label={label}
      optionalLabel={optionalLabel}
      hint={hint}
      error={error}
      hideLabel={hideLabel}
    >
      {prefix === undefined ? (
        control
      ) : (
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-body text-text-secondary"
          >
            {prefix}
          </span>
          {control}
        </div>
      )}
    </FieldShell>
  );
}

type TextAreaFieldProps = FieldProps &
  Omit<ComponentProps<'textarea'>, 'id' | 'className' | 'aria-invalid' | 'aria-describedby'>;

/** Multi-line text input. Same states as TextField. */
export function TextAreaField({
  id,
  label,
  optionalLabel,
  hint,
  error,
  hideLabel,
  attention = false,
  rows = 3,
  ...textarea
}: TextAreaFieldProps) {
  return (
    <FieldShell
      id={id}
      label={label}
      optionalLabel={optionalLabel}
      hint={hint}
      error={error}
      hideLabel={hideLabel}
    >
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(CONTROL, 'resize-y', borderFor(error, attention))}
        {...textarea}
      />
    </FieldShell>
  );
}

type SelectFieldProps = FieldProps &
  Omit<ComponentProps<'select'>, 'id' | 'className' | 'aria-invalid' | 'aria-describedby'>;

/** Native select, so it works with every keyboard, screen reader and phone. Same states as TextField. */
export function SelectField({
  id,
  label,
  optionalLabel,
  hint,
  error,
  hideLabel,
  attention = false,
  children,
  ...select
}: SelectFieldProps) {
  return (
    <FieldShell
      id={id}
      label={label}
      optionalLabel={optionalLabel}
      hint={hint}
      error={error}
      hideLabel={hideLabel}
    >
      <div className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cx(CONTROL, 'appearance-none pr-12', borderFor(error, attention))}
          {...select}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-text-secondary"
        />
      </div>
    </FieldShell>
  );
}
