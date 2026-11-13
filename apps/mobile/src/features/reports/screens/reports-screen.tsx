import { useState } from 'react';

import { useLiveQuery } from '@/core/db';
import { useTranslation } from '@/core/i18n';
import { useShopContext } from '@/core/services';
import {
  Box,
  Button,
  Card,
  Divider,
  EmptyState,
  Icon,
  ListItem,
  Row,
  Screen,
  ScreenHeader,
  SectionHeader,
  showToast,
  Spinner,
  Text,
} from '@/core/ui';

import { type ReportPeriod } from '../types';
import { exportReport, loadReportData } from '../usecases';

export function ReportsScreen() {
  const { t } = useTranslation();
  const app = useShopContext();
  const [period, setPeriod] = useState<ReportPeriod>('today');
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);

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
        <ScreenHeader title={t('reports.title')} />
        <Spinner label={t('common.loading')} />
      </Screen>
    );
  }

  if (report.status === 'error') {
    return (
      <Screen>
        <ScreenHeader title={t('reports.title')} />
        <EmptyState icon="error" title={t('common.somethingWrong')} />
      </Screen>
    );
  }

  const { summary, topProducts, topDebtors } = report.data;

  return (
    <Screen
      testID="reports-screen"
      footer={
        <Row gap="sm">
          <Box flex>
            <Button
              variant="secondary"
              label={t('reports.exportCsv')}
              icon="report"
              onPress={() => void handleExport('csv')}
              loading={exporting === 'csv'}
              testID="reports-export-csv"
            />
          </Box>
          <Box flex>
            <Button
              label={t('reports.exportPdf')}
              icon="report"
              onPress={() => void handleExport('pdf')}
              loading={exporting === 'pdf'}
              testID="reports-export-pdf"
            />
          </Box>
        </Row>
      }
    >
      <ScreenHeader title={t('reports.title')} />

      <Row gap="xs" justify="between">
        <Box flex>
          <Button
            variant={period === 'today' ? 'primary' : 'ghost'}
            label={t('reports.today')}
            onPress={() => setPeriod('today')}
            testID="reports-tab-today"
          />
        </Box>
        <Box flex>
          <Button
            variant={period === 'week' ? 'primary' : 'ghost'}
            label={t('reports.thisWeek')}
            onPress={() => setPeriod('week')}
            testID="reports-tab-week"
          />
        </Box>
        <Box flex>
          <Button
            variant={period === 'month' ? 'primary' : 'ghost'}
            label={t('reports.thisMonth')}
            onPress={() => setPeriod('month')}
            testID="reports-tab-month"
          />
        </Box>
      </Row>

      <SectionHeader title={t('reports.summary')} />
      <Card padding="md" gap="sm">
        <Row justify="between">
          <Text tone="secondary">{t('reports.totalSales')}</Text>
          <Text variant="amount">{app.format.money(summary.totalSales)}</Text>
        </Row>
        <Divider />
        <Row justify="between">
          <Text tone="secondary">{t('reports.totalPaid')}</Text>
          <Text variant="amount" tone="paid">
            {app.format.money(summary.totalPaid)}
          </Text>
        </Row>
        <Divider />
        <Row justify="between">
          <Text tone="secondary">{t('reports.totalDue')}</Text>
          <Text variant="amount" tone="due">
            {app.format.money(summary.totalDue)}
          </Text>
        </Row>
        <Divider />
        <Row justify="between">
          <Text tone="secondary">{t('reports.invoiceCount')}</Text>
          <Text variant="bodyStrong">{summary.invoiceCount}</Text>
        </Row>
      </Card>

      <SectionHeader title={t('reports.topProducts')} />
      {topProducts.length === 0 ? (
        <Card padding="md">
          <Text tone="secondary" align="center">
            {t('reports.noData')}
          </Text>
        </Card>
      ) : (
        <Card padding="none" gap="none">
          {topProducts.map((p, idx) => (
            <Box key={p.name}>
              {idx > 0 ? <Divider /> : null}
              <ListItem
                title={p.name}
                subtitle={t('reports.soldQuantity', {
                  quantity: (p.qtyMilli / 1000).toFixed(1),
                  unit: p.unit,
                })}
                leading={<Icon name="product" tone="secondary" />}
                trailing={<Text variant="amount">{app.format.money(p.revenue)}</Text>}
                testID={`reports-top-product-${idx}`}
              />
            </Box>
          ))}
        </Card>
      )}

      <SectionHeader title={t('reports.topDebtors')} />
      {topDebtors.length === 0 ? (
        <Card padding="md">
          <Text tone="secondary" align="center">
            {t('reports.noData')}
          </Text>
        </Card>
      ) : (
        <Card padding="none" gap="none">
          {topDebtors.map((d, idx) => (
            <Box key={d.customerId}>
              {idx > 0 ? <Divider /> : null}
              <ListItem
                title={d.name}
                subtitle={d.phone || undefined}
                leading={<Icon name="customer" tone="secondary" />}
                trailing={
                  <Text variant="amount" tone="due">
                    {app.format.money(d.balance)}
                  </Text>
                }
                testID={`reports-top-debtor-${idx}`}
              />
            </Box>
          ))}
        </Card>
      )}
    </Screen>
  );
}
