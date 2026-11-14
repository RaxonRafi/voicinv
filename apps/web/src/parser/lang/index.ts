import { type LanguageCode } from '@/domain';

import bnCurrency from './bn/currency.json';
import bnFractions from './bn/fractions.json';
import bnIntentPhrases from './bn/intent_phrases.json';
import bnNumbers from './bn/numbers.json';
import bnPaymentPhrases from './bn/payment_phrases.json';
import bnTranslit from './bn/translit.json';
import bnUnits from './bn/units.json';
import enCurrency from './en/currency.json';
import enFractions from './en/fractions.json';
import enIntentPhrases from './en/intent_phrases.json';
import enNumbers from './en/numbers.json';
import enPaymentPhrases from './en/payment_phrases.json';
import enTranslit from './en/translit.json';
import enUnits from './en/units.json';
import { type LanguagePack } from '../types';

// Suffixes and fillers for English and Bengali.
// These match suffixes.txt and fillers.txt in each pack folder.
const EN_SUFFIXES = ["'s", "s'"];
const EN_FILLERS = [
  'uh',
  'um',
  'ah',
  'er',
  'please',
  'like',
  'hey',
  'hello',
  'okay',
  'ok',
  'so',
  'just',
  'well',
];

const BN_SUFFIXES = [
  '-এর',
  '-ের',
  '-কে',
  '-রে',
  '-তে',
  '-এ',
  '-টায়',
  '-টা',
  '-টি',
  '-র',
  'এর',
  'ের',
  'কে',
  'রে',
  'তে',
  'র',
  'এ',
];
const BN_FILLERS = [
  'আরে',
  'মানে',
  'এই',
  'হুম',
  'একটু',
  'দয়া করে',
  'দয়া করে',
  'প্লিজ',
  'ভাই',
  'আচ্ছা',
  'ঠিক আছে',
  'যাই হোক',
  'শুনেন',
  'শোনো',
  'বুঝলে',
  'বুঝলা',
];

export const EN_PACK: LanguagePack = {
  code: 'en',
  numbers: enNumbers as LanguagePack['numbers'],
  fractions: enFractions as LanguagePack['fractions'],
  units: enUnits as LanguagePack['units'],
  paymentPhrases: enPaymentPhrases as LanguagePack['paymentPhrases'],
  currency: enCurrency,
  intentPhrases: enIntentPhrases as LanguagePack['intentPhrases'],
  suffixes: EN_SUFFIXES,
  fillers: EN_FILLERS,
  translit: enTranslit as LanguagePack['translit'],
};

export const BN_PACK: LanguagePack = {
  code: 'bn',
  numbers: bnNumbers as LanguagePack['numbers'],
  fractions: bnFractions as LanguagePack['fractions'],
  units: bnUnits as LanguagePack['units'],
  paymentPhrases: bnPaymentPhrases as LanguagePack['paymentPhrases'],
  currency: bnCurrency,
  intentPhrases: bnIntentPhrases as LanguagePack['intentPhrases'],
  suffixes: BN_SUFFIXES,
  fillers: BN_FILLERS,
  translit: bnTranslit as LanguagePack['translit'],
};

const PACKS: Record<LanguageCode, LanguagePack> = {
  en: EN_PACK,
  bn: BN_PACK,
};

export function getLanguagePack(code: LanguageCode = 'bn'): LanguagePack {
  return PACKS[code] ?? BN_PACK;
}

export function getAllLanguagePacks(): readonly LanguagePack[] {
  return [BN_PACK, EN_PACK];
}
