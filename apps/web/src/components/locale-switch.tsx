'use client';

import { Globe } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { LOCALE_NAMES, type Locale, otherLocale } from '@/lib/locales';
import { switchLocalePath } from '@/lib/routes';

interface LocaleSwitchProps {
  locale: Locale;
  /** Accessible name; includes the target language's own name. */
  label: string;
}

/** Link to the same page in the other language. */
export function LocaleSwitch({ locale, label }: LocaleSwitchProps) {
  const pathname = usePathname();
  const target = otherLocale(locale);
  return (
    <Link
      href={switchLocalePath(pathname, target)}
      hrefLang={target}
      lang={target}
      aria-label={label}
      className="inline-flex min-h-12 items-center gap-2 rounded-md px-3 text-body text-text-primary transition-colors duration-(--vl-duration-fast) ease-standard hover:bg-bg-sunken"
    >
      <Globe aria-hidden="true" className="size-5 shrink-0" />
      {LOCALE_NAMES[target]}
    </Link>
  );
}
