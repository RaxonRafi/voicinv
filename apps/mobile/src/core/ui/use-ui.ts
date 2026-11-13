import { scriptOf, useLanguage } from '@/core/i18n';
import { type Script, type Theme, useTheme } from '@/core/theme';

/** Theme and writing system for the current render; the base of every design-system component. */
export function useUi(): { theme: Theme; script: Script } {
  const theme = useTheme();
  const script = scriptOf(useLanguage());
  return { theme, script };
}
