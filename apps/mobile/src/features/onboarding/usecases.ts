import { z } from 'zod';

import { type Database, productAliases, products, setValue, type ShopRow, shops } from '@/core/db';
import { findCurrentShop, SETTINGS } from '@/core/services';
import { cleanName, DomainError, normalizePhone } from '@/core/utils';
import {
  currencyCodeSchema,
  deriveShopPrefix,
  languageCodeSchema,
  LIMITS,
  SUPPORTED_LANGUAGES,
} from '@/shared';

import { SHOP_TEMPLATES, SHOP_TYPES } from './templates';

export const onboardingInputSchema = z.object({
  shopName: z.string().trim().min(1, 'required').max(LIMITS.name, 'tooLong'),
  /** As typed; may be empty. */
  phone: z.string().max(40, 'invalidPhone'),
  address: z.string().trim().max(LIMITS.address, 'tooLong'),
  language: languageCodeSchema,
  currencyCode: currencyCodeSchema,
  shopType: z.enum(SHOP_TYPES),
});

export type OnboardingInput = z.infer<typeof onboardingInputSchema>;

/** What onboarding needs. There is no shop yet, so this is not a full WriteContext. */
export interface OnboardingContext {
  db: Database;
  now: () => number;
  newId: () => string;
  deviceId: string;
}

/**
 * Creates the shop on this device, with starter products for its type, and saves the chosen
 * language. No account and no network are involved (AGENTS.md §1 rule 5).
 */
export async function completeOnboarding(
  ctx: OnboardingContext,
  input: OnboardingInput,
): Promise<ShopRow> {
  const data = onboardingInputSchema.parse(input);
  const phone = data.phone.trim() === '' ? null : normalizePhone(data.phone);
  if (data.phone.trim() !== '' && phone === null) throw new DomainError('invalidPhone', 'phone');

  return ctx.db.write(async (tx) => {
    if (await findCurrentShop(tx.orm)) throw new DomainError('shopExists');

    const timestamp = ctx.now();
    const shopId = ctx.newId();
    const columns = () => ({
      id: ctx.newId(),
      shopId,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      deviceId: ctx.deviceId,
      isDirty: true,
    });

    const name = cleanName(data.shopName);
    const shop: ShopRow = {
      ...columns(),
      id: shopId,
      name,
      address: data.address === '' ? null : data.address,
      phone,
      logo: null,
      currencyCode: data.currencyCode,
      defaultLanguage: data.language,
      invoicePrefix: deriveShopPrefix(name),
    };
    await tx.orm.insert(shops).values(shop);

    const otherLanguages = SUPPORTED_LANGUAGES.filter((language) => language !== data.language);
    for (const template of SHOP_TEMPLATES[data.shopType]) {
      const product = {
        ...columns(),
        name: template.name[data.language],
        unit: template.unit[data.language],
        defaultPrice: null,
        stockQty: null,
        isArchived: false,
      };
      await tx.orm.insert(products).values(product);
      await tx.orm.insert(productAliases).values(
        otherLanguages.map((language) => ({
          ...columns(),
          productId: product.id,
          alias: template.name[language],
          languageCode: language,
        })),
      );
    }

    await setValue(tx, SETTINGS.language, data.language);
    tx.touch('shops', 'products', 'productAliases');
    return shop;
  });
}
