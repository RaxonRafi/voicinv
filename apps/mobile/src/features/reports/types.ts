import { type MinorUnits } from '@/shared';

export type ReportPeriod = 'today' | 'week' | 'month';

export interface SalesSummary {
  totalSales: MinorUnits;
  totalPaid: MinorUnits;
  totalDue: MinorUnits;
  invoiceCount: number;
}

export interface TopProduct {
  name: string;
  qtyMilli: number;
  unit: string;
  revenue: MinorUnits;
}

export interface TopDebtor {
  customerId: string;
  name: string;
  phone: string | null;
  balance: MinorUnits;
}

export interface ReportData {
  period: ReportPeriod;
  dateRange: { start: number; end: number };
  summary: SalesSummary;
  topProducts: TopProduct[];
  topDebtors: TopDebtor[];
}
