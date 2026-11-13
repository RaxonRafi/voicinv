import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect, useState } from 'react';

import { useTranslation } from '@/core/i18n';
import { AutoSync } from '@/core/sync';
import { type AppServices, AppServicesProvider } from '@/core/services';
import { fontFamily, useTheme } from '@/core/theme';
import { Button, EmptyState, Screen, ToastHost } from '@/core/ui';

import { bootstrap } from './bootstrap';

// Keep the native splash screen up until the database is open, so the app never flashes an
// empty screen.
void SplashScreen.preventAutoHideAsync();

type BootState =
  { status: 'starting' } | { status: 'ready'; services: AppServices } | { status: 'failed' };

function StartupFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Screen footer={<Button label={t('common.retry')} icon="refresh" onPress={onRetry} />}>
      <EmptyState icon="error" title={t('startup.failedTitle')} body={t('startup.failedBody')} />
    </Screen>
  );
}

/** Navigation colors derived from the design tokens, for headers and screen backgrounds. */
function useNavigationTheme() {
  const theme = useTheme();
  const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.colors.action.primary,
      background: theme.colors.bg.canvas,
      card: theme.colors.bg.surface,
      text: theme.colors.text.primary,
      border: theme.colors.border.default,
      notification: theme.colors.status.danger,
    },
  };
}

/**
 * Root of the app: runs startup, then provides services, navigation theme and toasts to the
 * screens. While starting, the splash screen stays visible; a failed start can be retried.
 */
export function AppRoot({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BootState>({ status: 'starting' });
  const [attempt, setAttempt] = useState(0);
  const navigationTheme = useNavigationTheme();

  useEffect(() => {
    let active = true;
    bootstrap()
      .then(
        (services) => {
          if (active) setState({ status: 'ready', services });
        },
        (error: unknown) => {
          console.error('Startup failed', error);
          if (active) setState({ status: 'failed' });
        },
      )
      .finally(() => SplashScreen.hide());
    return () => {
      active = false;
    };
  }, [attempt]);

  if (state.status === 'starting') return null;

  return (
    <ThemeProvider value={navigationTheme}>
      {state.status === 'ready' ? (
        <AppServicesProvider services={state.services}>
          <AutoSync />
          {children}
        </AppServicesProvider>
      ) : (
        <StartupFailed
          onRetry={() => {
            setState({ status: 'starting' });
            setAttempt((current) => current + 1);
          }}
        />
      )}
      <ToastHost />
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

/** Header look shared by every stack screen. */
export function useStackScreenOptions() {
  const theme = useTheme();
  const { i18n } = useTranslation();
  const script = i18n.language === 'bn' ? 'bengali' : 'latin';
  return {
    headerStyle: { backgroundColor: theme.colors.bg.surface },
    headerTintColor: theme.colors.text.primary,
    headerTitleStyle: {
      fontFamily: fontFamily(theme.typography.heading.fontWeight, script),
      fontSize: theme.typography.heading.fontSize,
    },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: theme.colors.bg.canvas },
  } as const;
}
