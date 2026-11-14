import { CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { type ReactNode } from 'react';

import { cx } from './cx';

const TONE = {
  success: { box: 'bg-status-success-bg text-status-success', Glyph: CircleCheck },
  danger: { box: 'bg-status-danger-bg text-status-danger', Glyph: TriangleAlert },
  warning: { box: 'bg-status-warning-bg text-status-warning', Glyph: TriangleAlert },
  info: { box: 'bg-status-info-bg text-status-info', Glyph: Info },
} as const;

interface NoticeProps {
  tone: keyof typeof TONE;
  title?: string;
  children: ReactNode;
  /** A button or link offered with the message, e.g. "Try again". */
  action?: ReactNode;
}

/**
 * Inline message about the result of an action or the state of the page. Tones differ by icon
 * and wording, not only by color.
 */
export function Notice({ tone, title, children, action }: NoticeProps) {
  const { box, Glyph } = TONE[tone];
  return (
    <div className={cx('flex gap-3 rounded-xl p-4', box)}>
      <Glyph aria-hidden="true" className="size-6 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className="text-body-strong text-text-primary">{title}</p> : null}
        <p className="text-body text-text-primary">{children}</p>
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    </div>
  );
}
