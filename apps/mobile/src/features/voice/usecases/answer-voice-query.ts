import { type TFunction } from 'i18next';

import { type Orm } from '@/core/db';
import { type ParsedQuery } from '@/parser';
import { type LanguageCode, type MinorUnits } from '@/shared';

import { getCustomerBalance, getTodaySalesTotal } from '../repository';
import { type QueryAnswer, type TTSEngine } from '../types';

export interface AnswerQueryOptions {
  orm: Orm;
  query: ParsedQuery;
  language: LanguageCode;
  tts: TTSEngine;
  formatMoney: (amount: MinorUnits) => string;
  translate: TFunction;
  now?: () => number;
}

export async function answerVoiceQuery({
  orm,
  query,
  language,
  tts,
  formatMoney,
  translate: t,
  now = Date.now,
}: AnswerQueryOptions): Promise<QueryAnswer> {
  let answerText: string;
  let amount: MinorUnits | null = null;

  switch (query.queryType) {
    case 'CUSTOMER_BALANCE': {
      if (query.customer?.id) {
        const balance = await getCustomerBalance(orm, query.customer.id);
        amount = balance;
        if (balance > 0) {
          answerText = t('voice.queryBalance', {
            name: query.customer.name,
            balance: formatMoney(balance),
          });
        } else {
          answerText = t('voice.queryBalanceZero', { name: query.customer.name });
        }
      } else {
        answerText = t('voice.queryCustomerNotFound');
      }
      break;
    }
    case 'TODAYS_SALES': {
      const current = new Date(now());
      const startOfDay = new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate(),
        0,
        0,
        0,
        0,
      ).getTime();
      const endOfDay = new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate(),
        23,
        59,
        59,
        999,
      ).getTime();

      const total = await getTodaySalesTotal(orm, startOfDay, endOfDay);
      amount = total;
      if (total > 0) {
        answerText = t('voice.querySales', { total: formatMoney(total) });
      } else {
        answerText = t('voice.querySalesZero');
      }
      break;
    }
    case 'UNKNOWN':
    default: {
      answerText = t('voice.unrecognized');
      break;
    }
  }

  await tts.speak(answerText, language);

  return {
    text: answerText,
    spoken: true,
    customer: query.customer,
    amount,
  };
}
