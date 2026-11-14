import { z } from 'zod';

import {
  deriveShopPrefix,
  isShopPrefix,
  type LanguageCode,
  LIMITS,
  type Shop,
  SUPPORTED_LANGUAGES,
} from '@/domain';

import { getShop } from './selectors';
import {
  ChangeSet,
  changedColumns,
  DomainError,
  newMutableColumns,
  type ShopData,
  type WriteContext,
} from './shop-data';
import { cleanName, normalizePhone } from './text';

// The shop profile and the starter products offered when an account is created on the web.

export const SHOP_TYPES = [
  'grocery',
  'wholesale',
  'pharmacy',
  'hardware',
  'clothing',
  'other',
] as const;
export type ShopType = (typeof SHOP_TYPES)[number];

type Localized = Record<LanguageCode, string>;

interface TemplateProduct {
  name: Localized;
  unit: Localized;
}

const kg: Localized = { en: 'kg', bn: 'কেজি' };
const bag: Localized = { en: 'bag', bn: 'বস্তা' };
const piece: Localized = { en: 'piece', bn: 'পিস' };
const litre: Localized = { en: 'litre', bn: 'লিটার' };
const packet: Localized = { en: 'packet', bn: 'প্যাকেট' };
const strip: Localized = { en: 'strip', bn: 'পাতা' };
const bottle: Localized = { en: 'bottle', bn: 'বোতল' };

const product = (en: string, bn: string, unit: Localized): TemplateProduct => ({
  name: { en, bn },
  unit,
});

/**
 * Starter products per shop type, as data. Each has a name and unit in every supported
 * language; the product is created in the shop's language and the other names become aliases,
 * so it is recognised when spoken or typed in either language.
 */
export const SHOP_TEMPLATES: Readonly<Record<ShopType, readonly TemplateProduct[]>> = {
  grocery: [
    product('Rice', 'চাল', kg),
    product('Flour', 'আটা', kg),
    product('Lentils', 'ডাল', kg),
    product('Sugar', 'চিনি', kg),
    product('Salt', 'লবণ', kg),
    product('Soybean oil', 'সয়াবিন তেল', litre),
    product('Potato', 'আলু', kg),
    product('Onion', 'পেঁয়াজ', kg),
    product('Egg', 'ডিম', piece),
    product('Tea', 'চা', packet),
  ],
  wholesale: [
    product('Rice', 'চাল', bag),
    product('Flour', 'আটা', bag),
    product('Sugar', 'চিনি', bag),
    product('Lentils', 'ডাল', bag),
    product('Salt', 'লবণ', bag),
    product('Soybean oil', 'সয়াবিন তেল', { en: 'can', bn: 'টিন' }),
  ],
  pharmacy: [
    product('Paracetamol', 'প্যারাসিটামল', strip),
    product('Antacid', 'অ্যান্টাসিড', strip),
    product('Vitamin C', 'ভিটামিন সি', strip),
    product('Oral saline', 'খাবার স্যালাইন', packet),
    product('Cough syrup', 'কফ সিরাপ', bottle),
    product('Bandage', 'ব্যান্ডেজ', piece),
  ],
  hardware: [
    product('Cement', 'সিমেন্ট', bag),
    product('Rod', 'রড', kg),
    product('Nails', 'পেরেক', kg),
    product('Paint', 'রং', litre),
    product('Pipe', 'পাইপ', piece),
    product('Wire', 'তার', { en: 'metre', bn: 'মিটার' }),
  ],
  clothing: [
    product('Shirt', 'শার্ট', piece),
    product('Pant', 'প্যান্ট', piece),
    product('Saree', 'শাড়ি', piece),
    product('Lungi', 'লুঙ্গি', piece),
    product('Three-piece', 'থ্রি-পিস', { en: 'set', bn: 'সেট' }),
    product('Fabric', 'কাপড়', { en: 'yard', bn: 'গজ' }),
  ],
  other: [],
};

export interface NewShopInput {
  name: string;
  currencyCode: string;
  language: LanguageCode;
  shopType: ShopType;
}

/** The account's shop as sent to `POST /auth/register`. */
export function newShopIdentity(shopId: string, input: NewShopInput) {
  const name = cleanName(input.name);
  return {
    id: shopId,
    name,
    currencyCode: input.currencyCode,
    defaultLanguage: input.language,
    invoicePrefix: deriveShopPrefix(name),
  };
}

export interface ShopIdentity {
  id: string;
  name: string;
  currencyCode: string;
  defaultLanguage: string;
  invoicePrefix: string;
}

/** The synced shop record for an account's shop, as other devices will receive it. */
export function shopRecord(ctx: WriteContext, identity: ShopIdentity): Shop {
  const language = SUPPORTED_LANGUAGES.find((code) => code === identity.defaultLanguage) ?? 'en';
  return {
    ...newMutableColumns(ctx),
    id: identity.id,
    name: identity.name,
    address: null,
    phone: null,
    logo: null,
    currencyCode: identity.currencyCode,
    defaultLanguage: language,
    invoicePrefix: identity.invoicePrefix,
  };
}

/** Starter products of a shop type, in the shop's language, with the other names as aliases. */
export function starterProducts(
  ctx: WriteContext,
  shopType: ShopType,
  language: LanguageCode,
): ChangeSet {
  const changes = new ChangeSet();
  const otherLanguages = SUPPORTED_LANGUAGES.filter((code) => code !== language);
  for (const template of SHOP_TEMPLATES[shopType]) {
    const record = {
      ...newMutableColumns(ctx),
      name: template.name[language],
      unit: template.unit[language],
      defaultPrice: null,
      stockQty: null,
      isArchived: false,
    };
    changes.put('products', record);
    for (const other of otherLanguages) {
      changes.put('productAliases', {
        ...newMutableColumns(ctx),
        productId: record.id,
        alias: template.name[other],
        languageCode: other,
      });
    }
  }
  return changes;
}

export const shopProfileInputSchema = z.object({
  name: z.string().trim().min(1, 'required').max(LIMITS.name, 'tooLong'),
  /** As typed; may be empty. */
  phone: z.string().max(40, 'invalidPhone'),
  address: z.string().trim().max(LIMITS.address, 'tooLong'),
  invoicePrefix: z.string().trim(),
});
export type ShopProfileInput = z.infer<typeof shopProfileInputSchema>;

/** Changes the shop's name, phone, address and invoice-number prefix. */
export function updateShopProfile(
  data: ShopData,
  ctx: WriteContext,
  input: ShopProfileInput,
): { changes: ChangeSet; result: Shop } {
  const parsed = shopProfileInputSchema.parse(input);
  const current = getShop(data);
  if (!current) throw new DomainError('noShop');
  const phone = parsed.phone.trim() === '' ? null : normalizePhone(parsed.phone);
  if (parsed.phone.trim() !== '' && phone === null) throw new DomainError('invalidPhone', 'phone');
  const invoicePrefix = parsed.invoicePrefix.toUpperCase();
  if (!isShopPrefix(invoicePrefix)) throw new DomainError('invalidPrefix', 'invoicePrefix');

  const shop: Shop = {
    ...current,
    ...changedColumns(ctx),
    name: cleanName(parsed.name),
    phone,
    address: parsed.address === '' ? null : parsed.address,
    invoicePrefix,
  };
  return { changes: new ChangeSet().put('shops', shop), result: shop };
}
