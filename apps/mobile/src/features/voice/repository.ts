import { and, desc, eq, gte, isNull, lte } from 'drizzle-orm';

import {
  corrections,
  customerAliases,
  customers,
  invoices,
  ledgerEntries,
  type Orm,
  productAliases,
  products,
  type Tx,
} from '@/core/db';
import {
  type CustomerCandidate,
  type LearnedCorrection,
  type ParserContext,
  type ProductCandidate,
} from '@/parser';
import { type LanguageCode, type MinorUnits } from '@/shared';

export async function getCorrections(
  orm: Orm,
  languageCode: LanguageCode,
): Promise<LearnedCorrection[]> {
  const rows = await orm
    .select()
    .from(corrections)
    .where(eq(corrections.languageCode, languageCode))
    .orderBy(desc(corrections.count));

  return rows.map((r) => ({
    heardText: r.heardText,
    correctedText: r.correctedText,
    fieldType: r.fieldType,
    count: r.count,
  }));
}

export async function recordCorrection(
  tx: Tx,
  correction: {
    heardText: string;
    correctedText: string;
    fieldType: 'customer' | 'product';
    languageCode: LanguageCode;
  },
  newId: () => string,
  now: () => number,
): Promise<void> {
  const trimmedHeard = correction.heardText.trim();
  const trimmedCorrected = correction.correctedText.trim();
  if (!trimmedHeard || !trimmedCorrected || trimmedHeard.toLowerCase() === trimmedCorrected.toLowerCase()) {
    return;
  }

  const existing = await tx.orm
    .select()
    .from(corrections)
    .where(
      and(
        eq(corrections.heardText, trimmedHeard),
        eq(corrections.fieldType, correction.fieldType),
        eq(corrections.languageCode, correction.languageCode),
      ),
    )
    .limit(1);

  const existingRow = existing[0];
  if (existingRow) {
    await tx.orm
      .update(corrections)
      .set({
        count: existingRow.count + 1,
        correctedText: trimmedCorrected,
        updatedAt: now(),
      })
      .where(eq(corrections.id, existingRow.id));
  } else {
    await tx.orm.insert(corrections).values({
      id: newId(),
      heardText: trimmedHeard,
      correctedText: trimmedCorrected,
      fieldType: correction.fieldType,
      languageCode: correction.languageCode,
      count: 1,
      updatedAt: now(),
    });
  }
  tx.touch('corrections');
}

export async function getTodaySalesTotal(
  orm: Orm,
  startOfDay: number,
  endOfDay: number,
): Promise<MinorUnits> {
  const rows = await orm
    .select({ total: invoices.total })
    .from(invoices)
    .where(
      and(
        eq(invoices.status, 'ACTIVE'),
        isNull(invoices.deletedAt),
        gte(invoices.createdAt, startOfDay),
        lte(invoices.createdAt, endOfDay),
      ),
    );

  let sum = 0;
  for (const row of rows) {
    sum += row.total;
  }
  return sum;
}

export async function getCustomerBalance(orm: Orm, customerId: string): Promise<MinorUnits> {
  const rows = await orm
    .select({ amount: ledgerEntries.amount })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.customerId, customerId));

  let balance = 0;
  for (const row of rows) {
    balance += row.amount;
  }
  return balance;
}

export async function loadParserContext(
  orm: Orm,
  languageCode: LanguageCode,
): Promise<ParserContext> {
  const [customerRows, aliasRows, productRows, productAliasRows, learned] = await Promise.all([
    orm
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(isNull(customers.deletedAt), eq(customers.isArchived, false))),
    orm
      .select({ customerId: customerAliases.customerId, alias: customerAliases.alias })
      .from(customerAliases)
      .where(isNull(customerAliases.deletedAt)),
    orm
      .select({
        id: products.id,
        name: products.name,
        unit: products.unit,
        defaultPrice: products.defaultPrice,
      })
      .from(products)
      .where(and(isNull(products.deletedAt), eq(products.isArchived, false))),
    orm
      .select({ productId: productAliases.productId, alias: productAliases.alias })
      .from(productAliases)
      .where(isNull(productAliases.deletedAt)),
    getCorrections(orm, languageCode),
  ]);

  const customerAliasesMap = new Map<string, string[]>();
  for (const alias of aliasRows) {
    const list = customerAliasesMap.get(alias.customerId) ?? [];
    list.push(alias.alias);
    customerAliasesMap.set(alias.customerId, list);
  }

  const productAliasesMap = new Map<string, string[]>();
  for (const alias of productAliasRows) {
    const list = productAliasesMap.get(alias.productId) ?? [];
    list.push(alias.alias);
    productAliasesMap.set(alias.productId, list);
  }

  const customerCandidates: CustomerCandidate[] = customerRows.map((c) => ({
    id: c.id,
    name: c.name,
    aliases: customerAliasesMap.get(c.id) ?? [],
  }));

  const productCandidates: ProductCandidate[] = productRows.map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
    defaultPrice: p.defaultPrice,
    aliases: productAliasesMap.get(p.id) ?? [],
  }));

  return {
    customers: customerCandidates,
    products: productCandidates,
    corrections: learned,
    language: languageCode,
  };
}

