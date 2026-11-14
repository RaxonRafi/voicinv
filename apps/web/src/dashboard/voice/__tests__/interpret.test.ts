import { getAppContent } from '@/content';
import { createUuidV7Generator } from '@/domain';

import { createCustomer, createProduct } from '../../data/catalog';
import {
  applyChanges,
  emptyShopData,
  type ShopData,
  type WriteContext,
} from '../../data/shop-data';
import { createFormatters } from '../../format';
import { answerQuery, interpret } from '../interpret';

const appEn = getAppContent('en');
const appBn = getAppContent('bn');

const SHOP_ID = '0192f0c0-0000-7000-8000-00000000000a';
const ctx: WriteContext = {
  shopId: SHOP_ID,
  deviceId: '0192f0c0-0000-7000-8000-00000000000b',
  now: Date.now,
  newId: createUuidV7Generator(),
};

function shop(): ShopData {
  let data = emptyShopData();
  const save = (write: { changes: { build(): never } }) => {
    data = applyChanges(data, write.changes.build(), SHOP_ID);
  };
  save(
    createCustomer(data, ctx, {
      name: 'Karim',
      phone: '',
      notes: '',
      creditLimit: null,
      aliases: ['করিম'],
    }) as never,
  );
  save(
    createProduct(data, ctx, {
      name: 'Rice',
      unit: 'bag',
      defaultPrice: 250_000,
      aliases: ['চাল'],
    }) as never,
  );
  return data;
}

// The examples printed on screen must do what they promise.
describe('examples shown in the voice box', () => {
  it.each([
    ['en', 'Two bags of rice to Karim, paid half'],
    ['bn', 'করিমকে দুই বস্তা চাল, অর্ধেক দিয়েছে'],
  ] as const)('%s sale example becomes a half-paid invoice for Karim', (language, sentence) => {
    expect(sentence).toBe(language === 'en' ? appEn.voice.inputLabel : appBn.voice.inputLabel);
    const result = interpret(shop(), sentence, language);
    expect(result.intent).toBe('SALE');
    if (result.intent !== 'SALE') return;
    expect(result.customer?.name).toBe('Karim');
    expect(result.items).toMatchObject([{ name: 'Rice', qtyMilli: 2000, unitPrice: 250_000 }]);
    expect(result.payment).toMatchObject({ type: 'FRACTION', numerator: 1, denominator: 2 });
  });

  it.each([
    ['en', 'How much does Karim owe?'],
    ['bn', 'করিমের কত বাকি?'],
  ] as const)('%s balance question is answered from the ledger', (language, sentence) => {
    const result = interpret(shop(), sentence, language);
    expect(result).toMatchObject({ intent: 'QUERY', queryType: 'CUSTOMER_BALANCE' });
    if (result.intent !== 'QUERY') return;
    const t = language === 'en' ? appEn : appBn;
    expect(answerQuery(shop(), result, t, createFormatters(language, 'BDT'), Date.now())).toBe(
      t.voice.queryBalanceZero.replace('{name}', 'Karim'),
    );
  });
});
