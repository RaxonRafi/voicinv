import { CircleCheck, TriangleAlert } from 'lucide-react';
import { type ReactNode } from 'react';

import { cx } from './cx';

const TONE = {
  success: { box: 'bg-status-success-bg text-status-success', Glyph: CircleCheck },
  danger: { box: 'bg-status-danger-bg text-status-danger', Glyph: TriangleAlert },
} as const;

interface NoticeProps {
  tone: keyof typeof TONE;
  title?: string;
  children: ReactNode;
}

/**
 * Inline message about the result of an action. Success and failure differ by icon and wording,
 * not only by color.
 */
export function Notice({ tone, title, children }: NoticeProps) {
  const { box, Glyph } = TONE[tone];
  return (
    <div className={cx('flex gap-3 rounded-md p-4', box)}>
      <Glyph aria-hidden="true" className="size-6 shrink-0" />
      <div className="flex flex-col gap-1">
        {title ? <p className="text-body-strong text-text-primary">{title}</p> : null}
        <p className="text-body text-text-primary">{children}</p>
      </div>
    </div>
  );
}
