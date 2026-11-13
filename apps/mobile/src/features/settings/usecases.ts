import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { changedColumns, type Database, setValue, shops, type WriteContext } from '@/core/db';
import { SETTINGS } from '@/core/services';
import { cleanName, DomainError, normalizePhone } from '@/core/utils';
import { isShopPrefix, type LanguageCode, LIMITS } from '@/shared';

export const shopProfileInputSchema = z.object({
  name: z.string().trim().min(1, 'required').max(LIMITS.name, 'tooLong'),
  /** As typed; may be empty. */
  phone: z.string().max(40, 'invalidPhone'),
  address: z.string().trim().max(LIMITS.address, 'tooLong'),
  invoicePrefix: z
    .string()
    .trim()
    .refine((value) => isShopPrefix(value.toUpperCase()), 'invalidPrefix'),
});

export type ShopProfileInput = z.infer<typeof shopProfileInputSchema>;

/**
 * Updates the shop's details. Changing the invoice prefix affects new invoice numbers only;
 * existing invoices keep the number they were issued with.
 */
export async function updateShopProfile(ctx: WriteContext, input: ShopProfileInput): Promise<void> {
  const data = shopProfileInputSchema.parse(input);
  const phone = data.phone.trim() === '' ? null : normalizePhone(data.phone);
  if (data.phone.trim() !== '' && phone === null) throw new DomainError('invalidPhone', 'phone');

  await ctx.db.write(async (tx) => {
    await tx.orm
      .update(shops)
      .set({
        ...changedColumns(ctx),
        name: cleanName(data.name),
        phone,
        address: data.address === '' ? null : data.address,
        invoicePrefix: data.invoicePrefix.toUpperCase(),
      })
      .where(eq(shops.id, ctx.shopId));
    tx.touch('shops');
  });
}

/** Remembers the interface language on this device. */
export async function saveLanguage(db: Database, language: LanguageCode): Promise<void> {
  await db.write((tx) => setValue(tx, SETTINGS.language, language));
}
