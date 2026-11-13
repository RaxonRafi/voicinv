import { type LanguageCode } from '@/shared';

// Starter products per shop type, as data. Each has a name and unit in every supported
// language; the product is created in the shop's language and the other names become aliases,
// so it is recognised when spoken in either language.

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

export interface TemplateProduct {
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
