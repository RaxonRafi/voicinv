import { getValue, kv, productAliases, products, shops } from '@/core/db';
import { findCurrentShop, SETTINGS } from '@/core/services';
import { createTestApp, type TestApp } from '@/core/testing/harness';
import { shopSchema } from '@/shared';

import { SHOP_TEMPLATES, SHOP_TYPES } from '../templates';
import { completeOnboarding, type OnboardingContext, type OnboardingInput } from '../usecases';

const input = (overrides: Partial<OnboardingInput> = {}): OnboardingInput => ({
  shopName: 'Rahim Store',
  phone: '',
  address: '',
  language: 'bn',
  currencyCode: 'BDT',
  shopType: 'grocery',
  ...overrides,
});

describe('completeOnboarding', () => {
  let app: TestApp;
  let ctx: OnboardingContext;

  beforeEach(async () => {
    app = await createTestApp();
    ctx = {
      db: app.db,
      now: app.clock.now,
      newId: app.services.newId,
      deviceId: app.services.device.deviceId,
    };
  });

  afterEach(() => app.close());

  it('creates the shop without any account or network', async () => {
    const shop = await completeOnboarding(
      ctx,
      input({ shopName: '  Rahim   Store ', phone: '০১৭১২ ৩৪৫৬৭৮', address: 'Station Road' }),
    );

    expect(shop).toMatchObject({
      name: 'Rahim Store',
      phone: '01712345678',
      address: 'Station Road',
      currencyCode: 'BDT',
      defaultLanguage: 'bn',
      invoicePrefix: 'RS',
      deviceId: app.services.device.deviceId,
      isDirty: true,
    });
    expect(shop.shopId).toBe(shop.id);
    expect(await findCurrentShop(app.db.orm)).toEqual(shop);
    expect(await getValue(app.db.orm, SETTINGS.language)).toBe('bn');

    // The stored shop is a valid sync entity (minus the local dirty flag).
    const { isDirty: _isDirty, ...entity } = shop;
    expect(shopSchema.safeParse(entity).success).toBe(true);
  });

  it('adds starter products in the shop language, with the other language as aliases', async () => {
    const shop = await completeOnboarding(ctx, input({ language: 'bn', shopType: 'wholesale' }));

    const rows = await app.db.orm.select().from(products);
    expect(rows).toHaveLength(SHOP_TEMPLATES.wholesale.length);
    expect(rows.map((row) => row.name)).toContain('চাল');
    expect(rows.every((row) => row.shopId === shop.id && row.defaultPrice === null)).toBe(true);
    expect(rows.find((row) => row.name === 'চাল')?.unit).toBe('বস্তা');

    const aliases = await app.db.orm.select().from(productAliases);
    expect(aliases).toHaveLength(rows.length);
    expect(aliases.every((alias) => alias.languageCode === 'en')).toBe(true);
    expect(aliases.map((alias) => alias.alias)).toContain('Rice');
  });

  it('uses English names for an English shop', async () => {
    await completeOnboarding(ctx, input({ language: 'en', shopType: 'grocery' }));
    const rows = await app.db.orm.select().from(products);
    expect(rows.map((row) => row.name)).toEqual(expect.arrayContaining(['Rice', 'Egg', 'Onion']));
    const aliases = await app.db.orm.select().from(productAliases);
    expect(aliases.map((alias) => alias.alias)).toEqual(expect.arrayContaining(['চাল', 'ডিম']));
  });

  it('starts with no products for the "other" shop type', async () => {
    await completeOnboarding(ctx, input({ shopType: 'other' }));
    expect(await app.db.orm.select().from(products)).toEqual([]);
  });

  it('falls back to the default invoice prefix for a name without Latin letters', async () => {
    const shop = await completeOnboarding(ctx, input({ shopName: 'করিম স্টোর' }));
    expect(shop.invoicePrefix).toBe('INV');
  });

  it('refuses a second shop on the same device', async () => {
    await completeOnboarding(ctx, input());
    await expect(completeOnboarding(ctx, input({ shopName: 'Another' }))).rejects.toMatchObject({
      code: 'shopExists',
    });
    expect(await app.db.orm.select().from(shops)).toHaveLength(1);
  });

  it.each([
    [input({ shopName: '   ' })],
    [input({ phone: 'abc' })],
    [input({ currencyCode: 'taka' })],
  ])('creates nothing for invalid input %#', async (invalid) => {
    await expect(completeOnboarding(ctx, invalid)).rejects.toThrow();
    expect(await app.db.orm.select().from(shops)).toEqual([]);
    expect(await app.db.orm.select().from(products)).toEqual([]);
    const keys = (await app.db.orm.select().from(kv)).map((row) => row.key);
    expect(keys).not.toContain(SETTINGS.language);
  });

  it('has complete, distinct template data for every shop type and language', () => {
    for (const type of SHOP_TYPES) {
      const names = { en: new Set<string>(), bn: new Set<string>() };
      for (const product of SHOP_TEMPLATES[type]) {
        for (const language of ['en', 'bn'] as const) {
          expect(product.name[language].trim()).not.toBe('');
          expect(product.unit[language].trim()).not.toBe('');
          expect(names[language].has(product.name[language])).toBe(false);
          names[language].add(product.name[language]);
        }
        expect(product.name.bn).toMatch(/[ঀ-৿]/);
        expect(product.name.en).not.toMatch(/[ঀ-৿]/);
      }
    }
  });
});
