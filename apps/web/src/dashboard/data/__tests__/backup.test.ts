import { createUuidV7Generator, isEncryptedBackup } from '@/domain';

import { createCustomer } from '../catalog';
import { createInvoice } from '../invoices';
import {
  BackupError,
  createBackupFile,
  decryptBackup,
  encryptBackup,
  restoreChanges,
} from '../backup';
import { applyChanges, emptyShopData, type ShopData, type WriteContext } from '../shop-data';

const SHOP_ID = '0192f0c0-0000-7000-8000-00000000000a';
const OTHER_SHOP = '0192f0c0-0000-7000-8000-00000000000c';
const ctx: WriteContext = {
  shopId: SHOP_ID,
  deviceId: '0192f0c0-0000-7000-8000-00000000000b',
  now: Date.now,
  newId: createUuidV7Generator(),
};
const FAST = { iterations: 100_000 };

function shopWithSale(): ShopData {
  let data = emptyShopData();
  const karim = createCustomer(data, ctx, {
    name: 'Karim',
    phone: '',
    notes: '',
    creditLimit: null,
    aliases: ['করিম'],
  });
  data = applyChanges(data, karim.changes.build(), SHOP_ID);
  const sale = createInvoice(
    data,
    ctx,
    {
      customerId: karim.result.id,
      items: [{ productId: null, name: 'Rice', unit: 'bag', qtyMilli: 2000, unitPrice: 250_000 }],
      discount: 0,
      payment: { type: 'NONE' },
      sourceText: null,
    },
    'TS-A-000001',
  );
  return applyChanges(data, sale.changes.build(), SHOP_ID);
}

describe('encrypted backups', () => {
  it('round-trips through the shared container and refuses a wrong password', async () => {
    const plain = new TextEncoder().encode('hello বাংলা');
    const file = await encryptBackup(plain, 'correct horse', FAST);
    expect(isEncryptedBackup(file)).toBe(true);
    expect(new TextDecoder().decode(await decryptBackup(file, 'correct horse'))).toBe(
      'hello বাংলা',
    );
    await expect(decryptBackup(file, 'wrong horse')).rejects.toMatchObject({
      code: 'WRONG_PASSWORD',
    });
    const altered = file.slice();
    altered[altered.length - 1] = (altered[altered.length - 1] ?? 0) ^ 1;
    await expect(decryptBackup(altered, 'correct horse')).rejects.toBeInstanceOf(BackupError);
    await expect(encryptBackup(plain, 'short')).rejects.toMatchObject({
      code: 'PASSWORD_TOO_SHORT',
    });
  });

  it('restores only what the account is missing: export → wipe → restore gives the same records', async () => {
    const data = shopWithSale();
    const file = await createBackupFile(
      data,
      SHOP_ID,
      ctx.deviceId,
      'correct horse',
      Date.now(),
      FAST,
    );
    const decrypted = await decryptBackup(file, 'correct horse');

    const restored = applyChanges(
      emptyShopData(),
      restoreChanges(emptyShopData(), SHOP_ID, decrypted),
      SHOP_ID,
    );
    for (const table of [
      'customers',
      'customerAliases',
      'invoices',
      'invoiceItems',
      'ledgerEntries',
    ] as const) {
      expect([...restored[table].values()]).toEqual([...data[table].values()]);
    }
    // Nothing to add when every record is already there.
    expect(restoreChanges(data, SHOP_ID, decrypted)).toEqual({});
  });

  it('accepts a phone backup (local isDirty column) and refuses another shop’s file', async () => {
    const data = shopWithSale();
    const payload = {
      version: 1,
      exportedAt: 0,
      shopId: SHOP_ID,
      deviceId: ctx.deviceId,
      tables: {
        shops: [],
        customers: [...data.customers.values()].map((row) => ({ ...row, isDirty: true })),
        customerAliases: [],
        products: [],
        productAliases: [],
        invoices: [],
        invoiceItems: [],
        invoiceRevisions: [],
        payments: [],
        ledgerEntries: [],
        corrections: [{ id: 'local', heardText: 'x', correctedText: 'y' }],
      },
    };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    expect(restoreChanges(emptyShopData(), SHOP_ID, bytes).customers?.updated).toHaveLength(1);
    expect(() => restoreChanges(emptyShopData(), OTHER_SHOP, bytes)).toThrow(/OTHER_SHOP/);
    expect(() => restoreChanges(emptyShopData(), SHOP_ID, new TextEncoder().encode('{}'))).toThrow(
      /NOT_A_BACKUP/,
    );
  });
});
