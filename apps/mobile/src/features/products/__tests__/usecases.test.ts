import { eq } from 'drizzle-orm';

import { productAliases, products } from '@/core/db';
import { createTestShopApp, type TestShopApp } from '@/core/testing/harness';

import { listProducts } from '../repository';
import { createProduct, editProduct, getProductDetails, setProductArchived } from '../usecases';

describe('products', () => {
  let app: TestShopApp;

  beforeEach(async () => {
    app = await createTestShopApp();
  });

  afterEach(() => app.close());

  const rice = { name: 'Rice', unit: 'bag', defaultPrice: 250_000, aliases: ['চাল', 'chal'] };

  it('creates a product with its aliases, marked for sync', async () => {
    const product = await createProduct(app.ctx, rice);

    expect(product).toMatchObject({
      shopId: app.shopId,
      name: 'Rice',
      unit: 'bag',
      defaultPrice: 250_000,
      isArchived: false,
      isDirty: true,
      deletedAt: null,
      createdAt: app.clock.now(),
    });
    const aliases = await app.db.orm.select().from(productAliases);
    expect(aliases.map((row) => [row.alias, row.languageCode, row.productId])).toEqual([
      ['চাল', 'bn', product.id],
      ['chal', 'en', product.id],
    ]);
  });

  it('cleans names and ignores aliases that repeat the name or each other', async () => {
    const product = await createProduct(app.ctx, {
      name: '  Basmati   Rice ',
      unit: ' kg ',
      defaultPrice: null,
      aliases: ['basmati rice', 'বাসমতি', ' বাসমতি ', 'Basmati'],
    });

    expect(product).toMatchObject({ name: 'Basmati Rice', unit: 'kg', defaultPrice: null });
    expect((await getProductDetails(app.db.orm, product.id))?.aliases).toEqual([
      'বাসমতি',
      'Basmati',
    ]);
  });

  it('rejects a second product with the same name, whatever the case', async () => {
    await createProduct(app.ctx, rice);
    await expect(createProduct(app.ctx, { ...rice, name: ' rice ' })).rejects.toMatchObject({
      code: 'duplicateName',
      field: 'name',
    });
    expect(await app.db.orm.select().from(products)).toHaveLength(1);
  });

  it.each([
    [{ name: '', unit: 'kg', defaultPrice: 100, aliases: [] }],
    [{ name: 'Oil', unit: '', defaultPrice: 100, aliases: [] }],
    [{ name: 'Oil', unit: 'litre', defaultPrice: -1, aliases: [] }],
    [{ name: 'Oil', unit: 'litre', defaultPrice: 99.5, aliases: [] }],
    [{ name: 'x'.repeat(121), unit: 'kg', defaultPrice: null, aliases: [] }],
  ])('rejects invalid input %#', async (input) => {
    await expect(createProduct(app.ctx, input)).rejects.toThrow();
    expect(await app.db.orm.select().from(products)).toEqual([]);
  });

  it('edits a product and replaces its aliases without deleting rows', async () => {
    const product = await createProduct(app.ctx, rice);
    app.clock.advance(60_000);
    await app.db.write((tx) => tx.orm.update(products).set({ isDirty: false }));

    await editProduct(app.ctx, product.id, {
      name: 'Miniket Rice',
      unit: 'bag',
      defaultPrice: 270_000,
      aliases: ['চাল', 'miniket'],
    });

    const details = await getProductDetails(app.db.orm, product.id);
    expect(details?.product).toMatchObject({
      name: 'Miniket Rice',
      defaultPrice: 270_000,
      updatedAt: app.clock.now(),
      createdAt: product.createdAt,
      isDirty: true,
    });
    expect(details?.aliases).toEqual(['চাল', 'miniket']);

    // The removed alias is soft-deleted so the removal can sync to other devices.
    const removed = await app.db.orm
      .select()
      .from(productAliases)
      .where(eq(productAliases.alias, 'chal'));
    expect(removed[0]).toMatchObject({ deletedAt: app.clock.now(), isDirty: true });
  });

  it('lets a product keep its own name when edited, but not take another one’s', async () => {
    const oil = await createProduct(app.ctx, {
      name: 'Oil',
      unit: 'litre',
      defaultPrice: null,
      aliases: [],
    });
    await createProduct(app.ctx, rice);

    await expect(
      editProduct(app.ctx, oil.id, {
        name: 'OIL',
        unit: 'litre',
        defaultPrice: 18_000,
        aliases: [],
      }),
    ).resolves.toBeUndefined();
    await expect(
      editProduct(app.ctx, oil.id, {
        name: 'Rice',
        unit: 'litre',
        defaultPrice: 18_000,
        aliases: [],
      }),
    ).rejects.toMatchObject({ code: 'duplicateName' });
    await expect(editProduct(app.ctx, 'missing', rice)).rejects.toMatchObject({ code: 'notFound' });
  });

  it('lists products by name and finds them by alias in either language', async () => {
    await createProduct(app.ctx, rice);
    await createProduct(app.ctx, {
      name: 'Oil',
      unit: 'litre',
      defaultPrice: null,
      aliases: ['তেল'],
    });
    await createProduct(app.ctx, { name: 'Dal', unit: 'kg', defaultPrice: 14_000, aliases: [] });

    const names = async (search?: string) =>
      (await listProducts(app.db.orm, { search })).map((product) => product.name);

    expect(await names()).toEqual(['Dal', 'Oil', 'Rice']);
    expect(await names('ri')).toEqual(['Rice']);
    expect(await names('তেল')).toEqual(['Oil']);
    expect(await names('chal')).toEqual(['Rice']);
    expect(await names('zzz')).toEqual([]);
  });

  it('hides archived products from the default list and can restore them', async () => {
    const product = await createProduct(app.ctx, rice);
    await setProductArchived(app.ctx, product.id, true);

    expect(await listProducts(app.db.orm)).toEqual([]);
    expect(await listProducts(app.db.orm, { includeArchived: true })).toHaveLength(1);

    await setProductArchived(app.ctx, product.id, false);
    expect(await listProducts(app.db.orm)).toHaveLength(1);
  });

  it('notifies screens showing products after a change', async () => {
    const changed: string[][] = [];
    app.db.subscribe((tables) => changed.push([...tables].sort()));
    await createProduct(app.ctx, rice);
    expect(changed).toEqual([['productAliases', 'products']]);
  });
});
