import { and, asc, eq, inArray, isNull, like, or } from 'drizzle-orm';

import { type Orm, productAliases, type ProductRow, products, type Tx } from '@/core/db';

// All database access of the products feature.

export interface ProductFilter {
  /** Matches the name or any alias. */
  search?: string;
  includeArchived?: boolean;
}

export async function listProducts(orm: Orm, filter: ProductFilter = {}): Promise<ProductRow[]> {
  const term = filter.search?.trim();
  const pattern = term ? `%${term}%` : undefined;
  const matchingAlias = pattern
    ? orm
        .select({ id: productAliases.productId })
        .from(productAliases)
        .where(and(isNull(productAliases.deletedAt), like(productAliases.alias, pattern)))
    : undefined;

  return orm
    .select()
    .from(products)
    .where(
      and(
        isNull(products.deletedAt),
        filter.includeArchived ? undefined : eq(products.isArchived, false),
        pattern && matchingAlias
          ? or(like(products.name, pattern), inArray(products.id, matchingAlias))
          : undefined,
      ),
    )
    .orderBy(asc(products.name));
}

export async function findProduct(orm: Orm, id: string): Promise<ProductRow | null> {
  const rows = await orm
    .select()
    .from(products)
    .where(and(eq(products.id, id), isNull(products.deletedAt)));
  return rows[0] ?? null;
}

/** Name of every live product, for duplicate checks. */
export async function listProductNames(orm: Orm): Promise<{ id: string; name: string }[]> {
  return orm
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(isNull(products.deletedAt));
}

export async function listProductAliases(
  orm: Orm,
  productId: string,
): Promise<{ id: string; alias: string }[]> {
  return orm
    .select({ id: productAliases.id, alias: productAliases.alias })
    .from(productAliases)
    .where(and(eq(productAliases.productId, productId), isNull(productAliases.deletedAt)))
    .orderBy(asc(productAliases.createdAt));
}

export async function insertProduct(tx: Tx, row: typeof products.$inferInsert): Promise<void> {
  await tx.orm.insert(products).values(row);
  tx.touch('products');
}

export async function updateProduct(
  tx: Tx,
  id: string,
  changes: Partial<typeof products.$inferInsert>,
): Promise<void> {
  await tx.orm.update(products).set(changes).where(eq(products.id, id));
  tx.touch('products');
}

export async function insertProductAliases(
  tx: Tx,
  rows: (typeof productAliases.$inferInsert)[],
): Promise<void> {
  if (rows.length === 0) return;
  await tx.orm.insert(productAliases).values(rows);
  tx.touch('productAliases');
}

export async function updateProductAliases(
  tx: Tx,
  ids: readonly string[],
  changes: Partial<typeof productAliases.$inferInsert>,
): Promise<void> {
  if (ids.length === 0) return;
  await tx.orm
    .update(productAliases)
    .set(changes)
    .where(inArray(productAliases.id, [...ids]));
  tx.touch('productAliases');
}
