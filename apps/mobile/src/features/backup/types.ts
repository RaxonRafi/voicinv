import {
  type CorrectionRow,
  type CustomerAliasRow,
  type CustomerRow,
  type InvoiceItemRow,
  type InvoiceRevisionRow,
  type InvoiceRow,
  type LedgerEntryRow,
  type PaymentRow,
  type ProductAliasRow,
  type ProductRow,
  type ShopRow,
} from '@/core/db';

export interface BackupTableData {
  shops: ShopRow[];
  customers: CustomerRow[];
  customerAliases: CustomerAliasRow[];
  products: ProductRow[];
  productAliases: ProductAliasRow[];
  invoices: InvoiceRow[];
  invoiceItems: InvoiceItemRow[];
  invoiceRevisions: InvoiceRevisionRow[];
  payments: PaymentRow[];
  ledgerEntries: LedgerEntryRow[];
  corrections: CorrectionRow[];
}

export interface BackupPayload {
  version: 1;
  exportedAt: number;
  shopId: string;
  deviceId: string;
  tables: BackupTableData;
}

export interface EncryptedBackupEnvelope {
  magic: 'VOICELEDGER_BACKUP';
  version: 1;
  createdAt: number;
  shopId: string;
  checksum: string;
  data: string; // Base64 or serialized JSON payload
}
