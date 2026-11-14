import {
  BookUser,
  ChartColumn,
  Languages,
  type LucideIcon,
  Mic,
  Printer,
  ReceiptText,
  Share2,
  ShieldCheck,
  Smartphone,
  UserRound,
  WifiOff,
} from 'lucide-react';

import { type IconName } from '@/content';

import { cx } from './cx';

// One icon set across web and mobile: Lucide (AGENTS.md §7.2 rule 6).
const ICONS: Readonly<Record<IconName, LucideIcon>> = {
  mic: Mic,
  offline: WifiOff,
  invoice: ReceiptText,
  ledger: BookUser,
  share: Share2,
  print: Printer,
  reports: ChartColumn,
  shield: ShieldCheck,
  phone: Smartphone,
  languages: Languages,
  account: UserRound,
};

const SIZE = { md: 'size-5', lg: 'size-6' } as const;

interface IconProps {
  name: IconName;
  size?: keyof typeof SIZE;
  className?: string;
}

/** Decorative icon chosen by content. Always paired with text, so it is hidden from readers. */
export function Icon({ name, size = 'lg', className }: IconProps) {
  const Glyph = ICONS[name];
  return <Glyph aria-hidden="true" className={cx(SIZE[size], 'shrink-0', className)} />;
}

/** Icon on a tinted tile, used to lead feature cards. */
export function IconTile({ name }: { name: IconName }) {
  return (
    <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-status-success-bg text-status-success">
      <Icon name={name} />
    </span>
  );
}
