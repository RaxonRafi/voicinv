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

export type BackupErrorCode =
  /** The file is not a VoiceLedger backup, or its decrypted content is not valid. */
  | 'NOT_A_BACKUP'
  /** The password is wrong, or the file was altered after it was made. */
  | 'WRONG_PASSWORD'
  | 'PASSWORD_TOO_SHORT';

/** A backup problem the user can act on; `code` selects the message shown. */
export class BackupError extends Error {
  constructor(readonly code: BackupErrorCode) {
    super(`Backup error: ${code}`);
    this.name = 'BackupError';
  }
}
