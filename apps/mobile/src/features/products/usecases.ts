import {
  changedColumns,
  deletedColumns,
  newMutableColumns,
  type Orm,
  type ProductRow,
  type WriteContext,
} from '@/core/db';
import { cleanName, diffAliases, DomainError, languageOf, nameKey } from '@/core/utils';

import {
  findProduct,
  insertProduct,
  insertProductAliases,
  listProductAliases,
  listProductNames,
  updateProduct,
  updateProductAliases,
} from './repository';
import { type ProductDetails, type ProductInput, productInputSchema } from './types';

// Business rules of the products feature. Platform-free: runs unchanged in Node tests.

async function assertNameIsFree(orm: Orm, name: string, exceptId?: string): Promise<void> {
  const key = nameKey(name);
  const names = await listProductNames(orm);
  if (names.some((row) => row.id !== exceptId && nameKey(row.name) === key)) {
    throw new DomainError('duplicateName', 'name');
  }
}

/** Aliases that add something: not blank, not the product's own name, no repeats. */
function usefulAliases(name: string, aliases: readonly string[]): string[] {
  const seen = new Set([nameKey(name)]);
  const result: string[] = [];
  for (const alias of aliases) {
    const key = nameKey(alias);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    result.push(cleanName(alias));
  }
  return result;
}

export async function createProduct(ctx: WriteContext, input: ProductInput): Promise<ProductRow> {
  const data = productInputSchema.parse(input);
  const name = cleanName(data.name);
  return ctx.db.write(async (tx) => {
    await assertNameIsFree(tx.orm, name);
    const row: ProductRow = {
      ...newMutableColumns(ctx),
      name,
      unit: cleanName(data.unit),
      defaultPrice: data.defaultPrice,
      stockQty: null,
      isArchived: false,
    };
    await insertProduct(tx, row);
    await insertProductAliases(
      tx,
      usefulAliases(name, data.aliases).map((alias) => ({
        ...newMutableColumns(ctx),
        productId: row.id,
        alias,
        languageCode: languageOf(alias),
      })),
    );
    return row;
  });
}

export async function editProduct(
  ctx: WriteContext,
  id: string,
  input: ProductInput,
): Promise<void> {
  const data = productInputSchema.parse(input);
  const name = cleanName(data.name);
  await ctx.db.write(async (tx) => {
    const existing = await findProduct(tx.orm, id);
    if (!existing) throw new DomainError('notFound');
    await assertNameIsFree(tx.orm, name, id);

    await updateProduct(tx, id, {
      ...changedColumns(ctx),
      name,
      unit: cleanName(data.unit),
      defaultPrice: data.defaultPrice,
    });

    const { removeIds, add } = diffAliases(
      await listProductAliases(tx.orm, id),
      usefulAliases(name, data.aliases),
    );
    await updateProductAliases(tx, removeIds, deletedColumns(ctx));
    await insertProductAliases(
      tx,
      add.map((alias) => ({
        ...newMutableColumns(ctx),
        productId: id,
        alias,
        languageCode: languageOf(alias),
      })),
    );
  });
}

/** Archived products are hidden from lists and voice matching but stay on old invoices. */
export async function setProductArchived(
  ctx: WriteContext,
  id: string,
  isArchived: boolean,
): Promise<void> {
  await ctx.db.write(async (tx) => {
    if (!(await findProduct(tx.orm, id))) throw new DomainError('notFound');
    await updateProduct(tx, id, { ...changedColumns(ctx), isArchived });
  });
}

export async function getProductDetails(orm: Orm, id: string): Promise<ProductDetails | null> {
  const product = await findProduct(orm, id);
  if (!product) return null;
  const aliases = await listProductAliases(orm, id);
  return { product, aliases: aliases.map((row) => row.alias) };
}
