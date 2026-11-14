import { Search } from 'lucide-react';
import Link from 'next/link';
import { type ComponentProps, type ReactNode } from 'react';

import { cx } from './cx';

const ICON_BUTTON =
  'inline-flex size-12 shrink-0 items-center justify-center rounded-full text-text-primary ' +
  'transition-colors duration-(--vl-duration-fast) ease-standard hover:bg-bg-sunken ' +
  'disabled:cursor-not-allowed disabled:text-text-disabled';

const ICON_BUTTON_TONE = {
  /** Sits on the page background, like a toolbar action. */
  plain: '',
  /** A white disc with a soft shadow, for the main action in a screen header. */
  raised: 'bg-bg-surface shadow-sm',
  /** Tinted, for an action that belongs to the screen's accent (the microphone). */
  accent: 'bg-bg-accent text-text-link',
} as const;

interface IconButtonOwnProps {
  /** Accessible name; the button shows only an icon. */
  label: string;
  tone?: keyof typeof ICON_BUTTON_TONE;
  children: ReactNode;
}

type IconButtonProps = IconButtonOwnProps &
  Omit<ComponentProps<'button'>, 'className' | 'children' | 'aria-label'>;

/** Round button holding one icon. States: default, hover, focused, disabled. */
export function IconButton({
  label,
  tone = 'plain',
  type = 'button',
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(ICON_BUTTON, ICON_BUTTON_TONE[tone])}
      {...rest}
    >
      {children}
    </button>
  );
}

/** A navigation link that looks like an IconButton. */
export function IconLink({
  label,
  tone = 'plain',
  href,
  children,
}: IconButtonOwnProps & { href: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cx(ICON_BUTTON, ICON_BUTTON_TONE[tone])}
    >
      {children}
    </Link>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentedProps<T extends string> {
  /** Accessible name of the group. */
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * A few mutually exclusive choices shown side by side. The chosen one is filled with the
 * action gradient and marked `aria-checked`, so it is not conveyed by color alone.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex gap-1 rounded-2xl bg-bg-surface p-1 shadow-sm"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cx(
              'inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-body-strong',
              'transition-colors duration-(--vl-duration-fast) ease-standard',
              selected
                ? 'bg-linear-to-br from-action-primary to-action-primary-end text-text-on-action'
                : 'text-text-primary hover:bg-bg-sunken',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

interface ChipProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}

/** A filter that can be switched on. The pressed state is exposed through `aria-pressed`. */
export function Chip({ selected, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-12 items-center rounded-full px-4 text-body-strong shadow-sm',
        'transition-colors duration-(--vl-duration-fast) ease-standard',
        selected
          ? 'bg-linear-to-br from-action-primary to-action-primary-end text-text-on-action'
          : 'bg-bg-surface text-text-primary hover:bg-bg-sunken',
      )}
    >
      {children}
    </button>
  );
}

interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Where the label goes. The whole row is the click target either way. */
  labelPosition?: 'before' | 'after';
}

/** On/off setting. States: off, on, focused, disabled. */
export function Switch({
  label,
  checked,
  onChange,
  disabled,
  labelPosition = 'before',
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'inline-flex min-h-12 items-center gap-3 rounded-full text-body-strong text-text-primary',
        'disabled:cursor-not-allowed disabled:text-text-disabled',
        labelPosition === 'after' && 'flex-row-reverse',
      )}
    >
      {label}
      <span
        aria-hidden="true"
        className={cx(
          'inline-flex h-8 w-14 shrink-0 items-center rounded-full p-1',
          'transition-colors duration-(--vl-duration-fast) ease-standard',
          checked
            ? 'justify-end bg-linear-to-br from-action-primary to-action-primary-end'
            : 'justify-start bg-border-default',
        )}
      >
        <span className="size-6 rounded-full bg-bg-surface shadow-sm" />
      </span>
    </button>
  );
}

type SearchFieldProps = {
  /** Accessible name; also shown as the placeholder. */
  label: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<ComponentProps<'input'>, 'className' | 'value' | 'onChange' | 'type' | 'aria-label'>;

/** Search box of a list screen. */
export function SearchField({ label, value, onChange, ...input }: SearchFieldProps) {
  return (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-text-secondary"
      />
      <input
        type="search"
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 w-full rounded-full bg-bg-surface py-2 pr-4 pl-12 text-body text-text-primary shadow-sm placeholder:text-text-secondary"
        {...input}
      />
    </div>
  );
}
