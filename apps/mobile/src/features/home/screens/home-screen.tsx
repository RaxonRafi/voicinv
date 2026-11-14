import { Redirect, router } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useLiveQuery } from '@/core/db';
import { useTranslation } from '@/core/i18n';
import { useCurrentShop, useShopContext } from '@/core/services';
import { useUi } from '@/core/ui/use-ui';
import {
  Badge,
  Button,
  IconButton,
  IconTile,
  ListItem,
  Screen,
  ScreenHeader,
  Spinner,
  Text,
} from '@/core/ui';
import { listInvoices } from '@/features/invoices/repository';
import { getSettledAmounts, invoiceBadgeStatus } from '@/features/invoices/usecases';
import { calculateDateRange, getSalesSummary } from '@/features/reports';

interface HomeScreenProps {
  /** Shown first: the voice entry point supplied by features/voice. */
  children?: ReactNode;
  showReports?: boolean;
}

export function HomeScreen({ children }: HomeScreenProps) {
  const { t } = useTranslation();
  const { theme } = useUi();
  const current = useCurrentShop();
  const app = useShopContext();
  const isDark = theme.scheme === 'dark';

  const query = useLiveQuery(
    'home-data',
    ['invoices', 'customers', 'payments'],
    async (orm) => {
      const todayRange = calculateDateRange('today');
      const [todaySummary, recentInvoices, settled] = await Promise.all([
        getSalesSummary(orm, todayRange.start, todayRange.end),
        listInvoices(orm, { limit: 5 }),
        getSettledAmounts(orm),
      ]);
      return { todaySummary, recentInvoices, settled };
    },
  );

  if (current.status === 'loading') {
    return (
      <Screen>
        <ScreenHeader title={t('common.appName')} />
        <Spinner label={t('common.loading')} />
      </Screen>
    );
  }
  if (current.status === 'none') return <Redirect href="/onboarding" />;

  const todaySummary = query.status === 'ready' ? query.data.todaySummary : { totalSales: 0, totalPaid: 0, totalDue: 0, invoiceCount: 0 };
  const recentInvoices = query.status === 'ready' ? query.data.recentInvoices : [];
  const settled = query.status === 'ready' ? query.data.settled : new Map<string, number>();

  const todayDateString = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <Screen testID="home-screen">
      <ScreenHeader
        title={current.shop.name}
        eyebrow={todayDateString}
        right={
          <IconButton
            icon="sliders"
            variant="surface"
            accessibilityLabel={t('home.settings')}
            onPress={() => router.push('/settings')}
          />
        }
      />

      {/* Sales Today Banner Card */}
      <View
        style={{
          borderRadius: theme.radius['2xl'],
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
          backgroundColor: isDark ? '#1F532D' : '#D9F99D',
          backgroundImage: isDark
            ? 'linear-gradient(135deg, #1A472A 0%, #2D5A27 100%)'
            : 'linear-gradient(135deg, #BBF7D0 0%, #ECFCCB 100%)',
        }}
      >
        <Text variant="label" tone={isDark ? 'primary' : 'secondary'} style={isDark ? { color: 'rgba(255, 255, 255, 0.8)' } : undefined}>
          {t('home.salesToday')}
        </Text>
        <Text variant="hero" style={isDark ? { color: '#FFFFFF' } : undefined}>
          {app ? app.format.money(todaySummary.totalSales) : `৳${todaySummary.totalSales}`}
        </Text>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
          {/* Collected */}
          <View
            style={{
              flex: 1,
              backgroundColor: isDark ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.7)',
              borderRadius: theme.radius.xl,
              paddingVertical: theme.spacing.md,
              paddingHorizontal: theme.spacing.md,
              gap: 2,
            }}
          >
            <Text variant="caption" tone={isDark ? 'disabled' : 'secondary'} style={isDark ? { color: 'rgba(255, 255, 255, 0.7)' } : undefined}>
              {t('home.collected')}
            </Text>
            <Text variant="bodyStrong" style={isDark ? { color: '#FFFFFF' } : undefined}>
              {app ? app.format.money(todaySummary.totalPaid) : `৳${todaySummary.totalPaid}`}
            </Text>
          </View>

          {/* Due */}
          <View
            style={{
              flex: 1,
              backgroundColor: isDark ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.7)',
              borderRadius: theme.radius.xl,
              paddingVertical: theme.spacing.md,
              paddingHorizontal: theme.spacing.md,
              gap: 2,
            }}
          >
            <Text variant="caption" tone={isDark ? 'disabled' : 'secondary'} style={isDark ? { color: 'rgba(255, 255, 255, 0.7)' } : undefined}>
              {t('home.due')}
            </Text>
            <Text variant="bodyStrong" style={isDark ? { color: '#FFFFFF' } : undefined}>
              {app ? app.format.money(todaySummary.totalDue) : `৳${todaySummary.totalDue}`}
            </Text>
          </View>

          {/* Invoices count */}
          <View
            style={{
              flex: 1,
              backgroundColor: isDark ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.7)',
              borderRadius: theme.radius.xl,
              paddingVertical: theme.spacing.md,
              paddingHorizontal: theme.spacing.md,
              gap: 2,
            }}
          >
            <Text variant="caption" tone={isDark ? 'disabled' : 'secondary'} style={isDark ? { color: 'rgba(255, 255, 255, 0.7)' } : undefined}>
              {t('home.invoices')}
            </Text>
            <Text variant="bodyStrong" style={isDark ? { color: '#FFFFFF' } : undefined}>
              {todaySummary.invoiceCount}
            </Text>
          </View>
        </View>
      </View>

      {/* Voice section: Hold to talk */}
      {children}

      {/* Action buttons: New invoice & Take payment */}
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <View style={{ flex: 1 }}>
          <Button
            label={t('home.newInvoice')}
            icon="add"
            onPress={() => router.push('/invoices/new')}
            testID="home-new-invoice"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={t('home.takePayment')}
            icon="cash"
            variant="secondary"
            onPress={() => router.push('/payments/new')}
            testID="home-take-payment"
          />
        </View>
      </View>

      {/* Recent Invoices List */}
      <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="title">{t('home.recent')}</Text>
          <Pressable onPress={() => router.push('/invoices')}>
            <Text variant="bodyStrong" tone="link">
              {t('home.seeAll')}
            </Text>
          </Pressable>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          {recentInvoices.map(({ invoice, customerName }) => {
            const status = invoiceBadgeStatus(invoice, settled.get(invoice.id) ?? 0);
            return (
              <ListItem
                key={invoice.id}
                title={customerName ?? t('common.walkIn')}
                subtitle={`${invoice.invoiceNumber} · ${app ? app.format.date(invoice.date) : ''}`}
                leading={<IconTile icon="invoice" />}
                trailing={
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text variant="bodyStrong">
                      {app ? app.format.money(invoice.total) : `৳${invoice.total}`}
                    </Text>
                    <Badge tone={status === 'PAID' ? 'paid' : status === 'DUE' ? 'due' : 'partlyPaid'} label={status === 'PAID' ? t('status.paid') : status === 'DUE' ? t('status.due') : t('status.partlyPaid')} />
                  </View>
                }
                group="only"
                onPress={() => router.push({ pathname: '/invoices/[id]', params: { id: invoice.id } })}
              />
            );
          })}
        </View>
      </View>
    </Screen>
  );
}
