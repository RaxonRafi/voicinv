import { useState } from 'react';
import { View } from 'react-native';

import { useLiveQuery } from '@/core/db';
import { useTranslation } from '@/core/i18n';
import { useShopContext } from '@/core/services';
import { useUi } from '@/core/ui/use-ui';
import {
  Button,
  Card,
  Icon,
  IconTile,
  ListItem,
  Screen,
  ScreenHeader,
  SegmentedControl,
  showToast,
  Spinner,
  Text,
} from '@/core/ui';

import { type ReportPeriod } from '../types';
import { exportReport, loadReportData } from '../usecases';

export function ReportsScreen() {
  const { t } = useTranslation();
  const { theme } = useUi();
  const app = useShopContext();
  const [period, setPeriod] = useState<ReportPeriod>('today');
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);
  const isDark = theme.scheme === 'dark';

  const report = useLiveQuery(
    `reports:${period}`,
    ['invoices', 'invoiceItems', 'ledgerEntries', 'customers'],
    (orm) => loadReportData(orm, period),
  );

  const handleExport = async (format: 'csv' | 'pdf') => {
    if (!app || report.status !== 'ready') return;
    setExporting(format);
    try {
      await exportReport(report.data, format, app.shop, app.format.money, {
        title: t('reports.title'),
        today: t('reports.today'),
        week: t('reports.thisWeek'),
        month: t('reports.thisMonth'),
        summary: t('reports.summary'),
        totalSales: t('reports.totalSales'),
        totalPaid: t('reports.totalPaid'),
        totalDue: t('reports.totalDue'),
        invoiceCount: t('reports.invoiceCount'),
        topProducts: t('reports.topProducts'),
        topDebtors: t('reports.topDebtors'),
      });
      showToast(t('reports.exported'), 'success');
    } catch {
      showToast(t('common.somethingWrong'), 'danger');
    } finally {
      setExporting(null);
    }
  };

  if (!app || report.status === 'loading') {
    return (
      <Screen>
        <ScreenHeader title={t('reports.title')} large />
        <Spinner label={t('common.loading')} />
      </Screen>
    );
  }

  const { summary, topProducts, topDebtors } =
    report.status === 'ready'
      ? report.data
      : {
          summary: { totalSales: 0, totalPaid: 0, totalDue: 0, invoiceCount: 0 },
          topProducts: [],
          topDebtors: [],
        };

  const periodOptions = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This week' },
    { value: 'month', label: 'This month' },
  ] as const;

  const totalSales = summary.totalSales || 1;
  const collectedPct = Math.min(100, Math.max(0, (summary.totalPaid / totalSales) * 100));

  return (
    <Screen
      testID="reports-screen"
      footer={
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <View style={{ flex: 1 }}>
            <Button
              variant="secondary"
              label="Export CSV"
              icon="download"
              onPress={() => void handleExport('csv')}
              loading={exporting === 'csv'}
              testID="reports-export-csv"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Export PDF"
              icon="download"
              onPress={() => void handleExport('pdf')}
              loading={exporting === 'pdf'}
              testID="reports-export-pdf"
            />
          </View>
        </View>
      }
    >
      <ScreenHeader title={t('reports.title')} large />

      {/* Period SegmentedControl */}
      <SegmentedControl
        accessibilityLabel="Report period"
        value={period}
        options={periodOptions}
        onChange={setPeriod}
        testID="reports-period-segments"
      />

      {/* Summary Card with progress bar */}
      <View
        style={{
          borderRadius: theme.radius['2xl'],
          padding: theme.spacing.xl,
          gap: theme.spacing.md,
          backgroundColor: isDark ? '#1F532D' : '#D9F99D',
          backgroundImage: isDark
            ? 'linear-gradient(135deg, #1A472A 0%, #2D5A27 100%)'
            : 'linear-gradient(135deg, #BBF7D0 0%, #ECFCCB 100%)',
        }}
      >
        <Text variant="caption" tone={isDark ? 'primary' : 'secondary'} style={isDark ? { color: 'rgba(255, 255, 255, 0.8)' } : undefined}>
          {t('reports.totalSales')}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text variant="hero" style={isDark ? { color: '#FFFFFF' } : undefined}>
            {app.format.money(summary.totalSales)}
          </Text>
          <Text variant="label" tone={isDark ? 'primary' : 'secondary'} style={isDark ? { color: 'rgba(255, 255, 255, 0.8)' } : undefined}>
            {`${summary.invoiceCount} ${summary.invoiceCount === 1 ? 'invoice' : 'invoices'}`}
          </Text>
        </View>

        {/* Progress Bar */}
        <View
          style={{
            height: 8,
            borderRadius: theme.radius.full,
            backgroundColor: isDark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(20, 83, 45, 0.2)',
            overflow: 'hidden',
            marginVertical: 4,
          }}
        >
          <View
            style={{
              width: `${collectedPct}%`,
              height: 8,
              borderRadius: theme.radius.full,
              backgroundColor: isDark ? '#FFFFFF' : '#14532D',
            }}
          />
        </View>

        {/* Legend */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: isDark ? '#FFFFFF' : '#14532D' }} />
            <Text variant="bodyStrong" style={isDark ? { color: '#FFFFFF' } : undefined}>{`Collected ${app.format.money(summary.totalPaid)}`}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: isDark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(20, 83, 45, 0.2)' }} />
            <Text variant="bodyStrong" style={isDark ? { color: 'rgba(255, 255, 255, 0.7)' } : undefined}>{`Due ${app.format.money(summary.totalDue)}`}</Text>
          </View>
        </View>
      </View>

      {/* Top Products */}
      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="overline" tone="secondary">
          TOP PRODUCTS
        </Text>
        {topProducts.length === 0 ? (
          <Card padding="md">
            <Text tone="secondary" align="center">
              {t('reports.noData')}
            </Text>
          </Card>
        ) : (
          topProducts.map((p, idx) => (
            <View
              key={p.name}
              style={{
                backgroundColor: theme.colors.bg.surface,
                borderRadius: theme.radius.xl,
                padding: theme.spacing.md,
                gap: theme.spacing.sm,
                boxShadow: isDark ? undefined : '0 2px 8px rgba(0,0,0,0.05)',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                  <IconTile letter={p.name} />
                  <View>
                    <Text variant="bodyStrong">{p.name}</Text>
                    <Text variant="caption" tone="secondary">
                      {`${Math.round(p.qtyMilli / 1000)} ${p.unit} sold`}
                    </Text>
                  </View>
                </View>
                <Text variant="bodyStrong">{app.format.money(p.revenue)}</Text>
              </View>
              {/* Green indicator bar */}
              <View
                style={{
                  height: 4,
                  borderRadius: theme.radius.full,
                  backgroundColor: theme.colors.action.primary,
                }}
              />
            </View>
          ))
        )}
      </View>

      {/* Top Debtors */}
      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="overline" tone="secondary">
          TOP DEBTORS
        </Text>
        {topDebtors.length === 0 ? (
          <Card padding="lg">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: theme.radius.full,
                  backgroundColor: isDark ? 'rgba(74, 222, 128, 0.15)' : '#DCFCE7',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="check" tone="success" size="lg" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">No dues for today</Text>
                <Text variant="caption" tone="secondary">
                  Customers who owe you will appear here
                </Text>
              </View>
            </View>
          </Card>
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            {topDebtors.map((d, idx) => (
              <ListItem
                key={d.customerId}
                title={d.name}
                subtitle={d.phone || undefined}
                leading={<IconTile letter={d.name} />}
                trailing={
                  <Text variant="bodyStrong" tone="due">
                    {app.format.money(d.balance)}
                  </Text>
                }
                group="only"
                testID={`reports-top-debtor-${idx}`}
              />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}
