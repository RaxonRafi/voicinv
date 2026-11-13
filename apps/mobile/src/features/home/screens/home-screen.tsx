import { Redirect, router } from 'expo-router';
import { type ReactNode } from 'react';

import { useTranslation } from '@/core/i18n';
import { useCurrentShop } from '@/core/services';
import {
  Box,
  Button,
  Card,
  Divider,
  Icon,
  IconButton,
  type IconName,
  ListItem,
  Screen,
  ScreenHeader,
  SectionHeader,
  Spinner,
} from '@/core/ui';

type ShortcutHref = '/invoices' | '/customers' | '/products' | '/reports' | '/settings';

interface Shortcut {
  icon: IconName;
  label: string;
  href: ShortcutHref;
  testID: string;
}

interface HomeScreenProps {
  /** Shown first: the voice entry point and today's summary, supplied by those features. */
  children?: ReactNode;
  /** Whether the reports area exists yet. */
  showReports?: boolean;
}

/**
 * The app's hub. Before a shop exists it sends the user to onboarding; afterwards it offers
 * the two everyday actions as large buttons and every area of the app as a labelled row.
 */
export function HomeScreen({ children, showReports = false }: HomeScreenProps) {
  const { t } = useTranslation();
  const current = useCurrentShop();

  if (current.status === 'loading') {
    return (
      <Screen>
        <ScreenHeader title={t('common.appName')} />
        <Spinner label={t('common.loading')} />
      </Screen>
    );
  }
  if (current.status === 'none') return <Redirect href="/onboarding" />;

  const shortcuts: Shortcut[] = [
    { icon: 'invoice', label: t('home.invoices'), href: '/invoices', testID: 'home-invoices' },
    { icon: 'customers', label: t('home.customers'), href: '/customers', testID: 'home-customers' },
    { icon: 'product', label: t('home.products'), href: '/products', testID: 'home-products' },
    ...(showReports
      ? [
          {
            icon: 'chart',
            label: t('home.reports'),
            href: '/reports',
            testID: 'home-reports',
          } as const,
        ]
      : []),
    { icon: 'settings', label: t('home.settings'), href: '/settings', testID: 'home-settings' },
  ];

  return (
    <Screen testID="home-screen">
      <ScreenHeader
        title={current.shop.name}
        right={
          <IconButton
            icon="settings"
            accessibilityLabel={t('home.settings')}
            onPress={() => router.push('/settings')}
          />
        }
      />
      {children}
      <Box gap="sm">
        <Button
          label={t('home.newInvoice')}
          icon="invoice"
          onPress={() => router.push('/invoices/new')}
          testID="home-new-invoice"
        />
        <Button
          label={t('home.takePayment')}
          icon="cash"
          variant="secondary"
          onPress={() => router.push('/payments/new')}
          testID="home-take-payment"
        />
      </Box>
      <SectionHeader title={t('home.shortcuts')} />
      <Card padding="none" gap="none">
        {shortcuts.map((shortcut, index) => (
          <Box key={shortcut.href}>
            {index > 0 ? <Divider /> : null}
            <ListItem
              title={shortcut.label}
              leading={<Icon name={shortcut.icon} tone="secondary" />}
              onPress={() =>
                router.push(shortcut.href as unknown as Parameters<typeof router.push>[0])
              }
              showChevron
              testID={shortcut.testID}
            />
          </Box>
        ))}
      </Card>
    </Screen>
  );
}
