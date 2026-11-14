import {
  AlignLeft,
  ArrowLeft,
  Ban,
  Banknote,
  Bluetooth,
  BookUser,
  Box,
  Calendar,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Clock,
  Cloud,
  CloudOff,
  Crown,
  Download,
  FileText,
  Fingerprint,
  Globe,
  House,
  ImagePlus,
  Info,
  Languages,
  Lock,
  LogOut,
  type LucideIcon,
  Mic,
  MicOff,
  Minus,
  Moon,
  Pencil,
  Phone,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  SquareUserRound,
  Store,
  Sun,
  Trash2,
  TriangleAlert,
  Upload,
  UserRound,
  UsersRound,
  Volume2,
  Wallet,
  WifiOff,
  X,
} from 'lucide-react-native';

import { type TextTone, toneColor } from './text';
import { useUi } from './use-ui';

// One icon set across web and mobile: Lucide (AGENTS.md §7.2 rule 6). Features refer to icons
// by these names, so the set can be changed here without touching feature code.
const ICONS = {
  add: Plus,
  alert: TriangleAlert,
  back: ArrowLeft,
  ban: Ban,
  bluetooth: Bluetooth,
  calendar: Calendar,
  cash: Banknote,
  chart: ChartColumn,
  check: Check,
  checkCircle: CircleCheck,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  clock: Clock,
  close: X,
  cloud: Cloud,
  cloudOff: CloudOff,
  customer: UserRound,
  contacts: SquareUserRound,
  customers: UsersRound,
  device: Smartphone,
  download: Download,
  edit: Pencil,
  error: CircleAlert,
  fingerprint: Fingerprint,
  globe: Globe,
  help: CircleHelp,
  home: House,
  image: ImagePlus,
  info: Info,
  invoice: ReceiptText,
  languages: Languages,
  ledger: BookUser,
  lock: Lock,
  logout: LogOut,
  mic: Mic,
  micOff: MicOff,
  minus: Minus,
  moon: Moon,
  offline: WifiOff,
  paper: AlignLeft,
  phone: Phone,
  printer: Printer,
  pro: Crown,
  product: Box,
  refresh: RefreshCw,
  report: FileText,
  search: Search,
  settings: Settings,
  share: Share2,
  shield: ShieldCheck,
  shop: Store,
  sliders: SlidersHorizontal,
  speaker: Volume2,
  sun: Sun,
  trash: Trash2,
  upload: Upload,
  wallet: Wallet,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tone?: TextTone;
}

/**
 * Decorative icon. It is hidden from screen readers, so it must always sit next to text or
 * inside a control that has an accessible label.
 */
export function Icon({ name, size = 'lg', tone = 'primary' }: IconProps) {
  const { theme } = useUi();
  const Glyph = ICONS[name];
  return (
    <Glyph
      size={theme.size.icon[size]}
      color={toneColor(theme, tone)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
