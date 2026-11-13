import { type Tx } from '@/core/db';
import { type InvoiceDraftShape } from '@/parser';
import { type LanguageCode } from '@/shared';

import { recordCorrection } from '../repository';

export async function detectAndSaveCorrections(
  tx: Tx,
  initialDraft: InvoiceDraftShape,
  finalDraft: InvoiceDraftShape,
  language: LanguageCode,
  newId: () => string,
  now: () => number,
): Promise<number> {
  let count = 0;

  // 1. Check customer correction
  const initialCustomer = initialDraft.customerName?.trim();
  const finalCustomer = finalDraft.customerName?.trim();
  if (
    initialCustomer &&
    finalCustomer &&
    initialCustomer.toLowerCase() !== finalCustomer.toLowerCase()
  ) {
    await recordCorrection(
      tx,
      {
        heardText: initialCustomer,
        correctedText: finalCustomer,
        fieldType: 'customer',
        languageCode: language,
      },
      newId,
      now,
    );
    count += 1;
  }

  // 2. Check product item corrections
  const minItems = Math.min(initialDraft.items.length, finalDraft.items.length);
  for (let i = 0; i < minItems; i++) {
    const initialItem = initialDraft.items[i];
    const finalItem = finalDraft.items[i];
    if (!initialItem || !finalItem) continue;

    const initialName = initialItem.name.trim();
    const finalName = finalItem.name.trim();

    if (initialName && finalName && initialName.toLowerCase() !== finalName.toLowerCase()) {
      await recordCorrection(
        tx,
        {
          heardText: initialName,
          correctedText: finalName,
          fieldType: 'product',
          languageCode: language,
        },
        newId,
        now,
      );
      count += 1;
    }
  }

  return count;
}
