import { ChevronDown } from 'lucide-react';
import { type ComponentProps, type ReactNode } from 'react';

import { cx } from './cx';

const CONTROL =
  'min-h-12 w-full rounded-md border bg-bg-surface px-4 py-2 text-body text-text-primary ' +
  'placeholder:text-text-disabled disabled:bg-bg-sunken disabled:text-text-disabled ' +
  'transition-colors duration-(--vl-duration-fast) ease-standard';

interface FieldShellProps {
  id: string;
  label: string;
  /** Appended to the label for fields that may be left empty, e.g. "optional". */
  optionalLabel?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

/** Label, optional hint and error message around a form control. */
function FieldShell({ id, label, optionalLabel, hint, error, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-label text-text-primary">
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
}

type TextFieldProps = FieldProps &
  Omit<ComponentProps<'input'>, 'id' | 'className' | 'aria-invalid' | 'aria-describedby'>;

/**
 * Single-line text input.
 * States: default, focused (focus ring), disabled (sunken, muted) and error (danger border plus a
 * message announced through `aria-describedby`).
 */
export function TextField({ id, label, optionalLabel, hint, error, ...input }: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} optionalLabel={optionalLabel} hint={hint} error={error}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(CONTROL, error ? 'border-status-danger' : 'border-border-strong')}
        {...input}
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
  children,
  ...select
}: SelectFieldProps) {
  return (
    <FieldShell id={id} label={label} optionalLabel={optionalLabel} hint={hint} error={error}>
      <div className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cx(
            CONTROL,
            'appearance-none pr-12',
            error ? 'border-status-danger' : 'border-border-strong',
          )}
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
