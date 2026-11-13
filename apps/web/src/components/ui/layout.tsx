import { type ReactNode } from 'react';

import { cx } from './cx';

interface ContainerProps {
  children: ReactNode;
  /** `narrow` keeps long-form text (FAQ, legal pages) at a readable line length. */
  width?: 'wide' | 'narrow';
  className?: string;
}

/** Centers page content and applies the horizontal page gutter. */
export function Container({ children, width = 'wide', className }: ContainerProps) {
  return (
    <div
      className={cx(
        'mx-auto w-full px-4 sm:px-6',
        width === 'wide' ? 'max-w-5xl' : 'max-w-3xl',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface SectionProps {
  children: ReactNode;
  id?: string;
  /** `sunken` gives alternating page bands a slightly different background. */
  tone?: 'canvas' | 'sunken';
  /** Id of the heading that names this section, for assistive technology. */
  labelledBy?: string;
  width?: 'wide' | 'narrow';
}

/** A vertical band of the page with consistent spacing. */
export function Section({ children, id, tone = 'canvas', labelledBy, width }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cx('scroll-mt-24 py-12 sm:py-16', tone === 'sunken' && 'bg-bg-sunken')}
    >
      <Container width={width}>{children}</Container>
    </section>
  );
}
