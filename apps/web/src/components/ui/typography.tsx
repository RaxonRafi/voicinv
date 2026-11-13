import { type ReactNode } from 'react';

import { cx } from './cx';

const HEADING_SIZE = {
  display: 'text-display',
  title: 'text-title',
  heading: 'text-heading',
  bodyStrong: 'text-body-strong',
} as const;

interface HeadingProps {
  /** Document outline level. Chosen for structure, independent of the visual size. */
  level: 1 | 2 | 3;
  size?: keyof typeof HEADING_SIZE;
  id?: string;
  className?: string;
  children: ReactNode;
}

const DEFAULT_SIZE = { 1: 'display', 2: 'title', 3: 'heading' } as const;

/** Heading using the token type scale. `text-balance` avoids one-word last lines. */
export function Heading({ level, size, id, className, children }: HeadingProps) {
  const Tag = `h${level}` as const;
  return (
    <Tag
      id={id}
      className={cx(
        HEADING_SIZE[size ?? DEFAULT_SIZE[level]],
        'text-balance text-text-primary',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

interface TextProps {
  tone?: 'primary' | 'secondary';
  size?: 'body' | 'label' | 'caption';
  className?: string;
  children: ReactNode;
}

const TEXT_SIZE = { body: 'text-body', label: 'text-label', caption: 'text-caption' } as const;

/** Paragraph text. Body size is 16px, the accessibility minimum for running text. */
export function Text({ tone = 'secondary', size = 'body', className, children }: TextProps) {
  return (
    <p
      className={cx(
        TEXT_SIZE[size],
        tone === 'primary' ? 'text-text-primary' : 'text-text-secondary',
        className,
      )}
    >
      {children}
    </p>
  );
}
