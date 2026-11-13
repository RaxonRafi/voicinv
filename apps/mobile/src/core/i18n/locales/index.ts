import bnCore from './bn/core.json';
import bnCustomers from './bn/customers.json';
import bnHome from './bn/home.json';
import bnInvoices from './bn/invoices.json';
import bnLedger from './bn/ledger.json';
import bnOnboarding from './bn/onboarding.json';
import bnProducts from './bn/products.json';
import bnSettings from './bn/settings.json';
import bnVoice from './bn/voice.json';
import enCore from './en/core.json';
import enCustomers from './en/customers.json';
import enHome from './en/home.json';
import enInvoices from './en/invoices.json';
import enLedger from './en/ledger.json';
import enOnboarding from './en/onboarding.json';
import enProducts from './en/products.json';
import enSettings from './en/settings.json';
import enVoice from './en/voice.json';

// One JSON file per feature and language. `core.json` holds the groups shared by every screen
// (common, ui, status, errors, startup). The English object is the type of all translations,
// so a key missing from Bengali is a compile error and a test compares both trees.

export const en = {
  ...enCore,
  onboarding: enOnboarding,
  home: enHome,
  products: enProducts,
  customers: enCustomers,
  invoices: enInvoices,
  ledger: enLedger,
  settings: enSettings,
  voice: enVoice,
};

export const bn: typeof en = {
  ...bnCore,
  onboarding: bnOnboarding,
  home: bnHome,
  products: bnProducts,
  customers: bnCustomers,
  invoices: bnInvoices,
  ledger: bnLedger,
  settings: bnSettings,
  voice: bnVoice,
};
