/**
 * Every user-facing string of the signed-in web app, for one language. English and Bengali both
 * implement this interface, so a missing translation is a compile error (AGENTS.md §7.2 rule 8).
 * `{name}` placeholders are filled with `fill` from `@/lib/format`.
 */
export interface AppContent {
  common: {
    save: string;
    cancel: string;
    close: string;
    back: string;
    edit: string;
    retry: string;
    optional: string;
    loading: string;
    walkIn: string;
    somethingWrong: string;
    copy: string;
    copied: string;
    today: string;
    yesterday: string;
  };
  nav: {
    /** Accessible name of the app's navigation landmark. */
    label: string;
    home: string;
    invoices: string;
    customers: string;
    products: string;
    reports: string;
    settings: string;
  };
  status: {
    paid: string;
    partlyPaid: string;
    due: string;
    cancelled: string;
  };
  errors: {
    required: string;
    tooLong: string;
    invalidPhone: string;
    invalidAmount: string;
    invalidQuantity: string;
    invalidPrefix: string;
    invalidIdentifier: string;
    duplicateName: string;
    passwordTooShort: string;
    passwordMismatch: string;
    invalid: string;
    notFound: string;
    alreadyCancelled: string;
    walkInDue: string;
    invalidTotals: string;
    /** Messages for error codes of the API and its client. */
    api: {
      INVALID_CREDENTIALS: string;
      IDENTIFIER_TAKEN: string;
      CONFLICT: string;
      INVALID_RECOVERY_CODE: string;
      NETWORK: string;
      RATE_LIMITED: string;
      VALIDATION_FAILED: string;
      SIGNED_OUT: string;
      APPEND_ONLY_VIOLATION: string;
      generic: string;
    };
  };
  shell: {
    loading: string;
    loadFailedTitle: string;
    loadFailedBody: string;
    offline: string;
    syncFailed: string;
    /** Link from the app back to the public pages. */
    aboutLink: string;
  };
  auth: {
    subtitle: string;
    /** Accessible name of the sign-in / create-account switch. */
    modeLabel: string;
    modeSignIn: string;
    modeCreate: string;
    forgot: string;
    backToSignIn: string;
    recoverTitle: string;
    identifier: string;
    identifierHint: string;
    password: string;
    newPassword: string;
    /** `{min}` is the minimum length. */
    passwordHint: string;
    recoveryCode: string;
    recoveryCodeHint: string;
    shopName: string;
    shopNameHint: string;
    shopType: string;
    shopTypeHint: string;
    shopTypes: {
      grocery: string;
      wholesale: string;
      pharmacy: string;
      hardware: string;
      clothing: string;
      other: string;
    };
    currency: string;
    signInButton: string;
    createButton: string;
    recoverButton: string;
    recoveryTitle: string;
    recoveryMessage: string;
    recoveryDone: string;
    passwordChanged: string;
    /** Name this browser is registered under as a device of the shop. */
    deviceName: string;
    privacyNote: string;
  };
  home: {
    salesToday: string;
    collected: string;
    due: string;
    invoices: string;
    newInvoice: string;
    takePayment: string;
    recent: string;
    seeAll: string;
    emptyTitle: string;
    emptyBody: string;
  };
  voice: {
    title: string;
    hint: string;
    /** Accessible name and placeholder of the text box. */
    inputLabel: string;
    submit: string;
    micHold: string;
    micListening: string;
    micProcessing: string;
    /** Shown when the browser cannot recognise speech on the device. */
    micUnavailable: string;
    micDownload: string;
    micDownloading: string;
    unrecognized: string;
    /** `{name}`, `{balance}`. */
    queryBalance: string;
    /** `{name}`. */
    queryBalanceZero: string;
    /** `{name}`, `{balance}`. */
    queryAdvance: string;
    queryCustomerNotFound: string;
    /** `{total}`. */
    querySales: string;
    querySalesZero: string;
    answerTitle: string;
    repeatAnswer: string;
    dismiss: string;
    /** `{text}` is what was said or typed. */
    heard: string;
    checkThis: string;
    confirmTitle: string;
    errors: {
      PERMISSION_DENIED: string;
      NO_SPEECH: string;
      NOT_AVAILABLE: string;
      UNKNOWN: string;
    };
  };
  invoices: {
    title: string;
    new: string;
    edit: string;
    invoice: string;
    searchLabel: string;
    /** Accessible name of the status filter. */
    filterLabel: string;
    filters: {
      all: string;
      paid: string;
      due: string;
      partial: string;
    };
    emptyTitle: string;
    emptyBody: string;
    /** `{query}`. */
    noResults: string;
    notFound: string;
    date: string;
    customer: string;
    tapToChange: string;
    chooseCustomer: string;
    chooseProduct: string;
    items: string;
    noItems: string;
    addProduct: string;
    typeItem: string;
    itemName: string;
    unit: string;
    quantity: string;
    price: string;
    /** `{name}`. */
    removeItem: string;
    discount: string;
    payment: string;
    pay: {
      full: string;
      partial: string;
      credit: string;
    };
    amountPaid: string;
    subtotal: string;
    total: string;
    paid: string;
    due: string;
    change: string;
    paidLater: string;
    save: string;
    /** `{number}`. */
    saved: string;
    updated: string;
    problems: {
      noItems: string;
      itemName: string;
      itemQuantity: string;
      itemPrice: string;
      discountTooBig: string;
      walkInDue: string;
    };
    /** `{name}`, `{limit}`. */
    overLimit: string;
    reason: string;
    reasonHint: string;
    paperSize: string;
    formats: {
      a4: string;
      thermal58: string;
      thermal80: string;
    };
    print: string;
    share: string;
    /** Message handed to the share sheet. `{number}`, `{shop}`, `{total}`, `{due}`. */
    shareText: string;
    cancel: string;
    cancelTitle: string;
    cancelMessage: string;
    cancelReason: string;
    keep: string;
    cancelled: string;
    history: string;
    picker: {
      searchCustomers: string;
      searchProducts: string;
      noCustomers: string;
      noProducts: string;
      newCustomer: string;
    };
    document: {
      item: string;
      quantity: string;
      price: string;
      amount: string;
      phone: string;
      watermark: string;
    };
    /** `{qty}`, `{unit}`, `{price}`. */
    lineSummary: string;
  };
  customers: {
    title: string;
    add: string;
    new: string;
    edit: string;
    searchLabel: string;
    emptyTitle: string;
    emptyBody: string;
    /** `{query}`. */
    noResults: string;
    notFound: string;
    name: string;
    phone: string;
    notes: string;
    creditLimit: string;
    creditLimitHint: string;
    aliases: string;
    aliasesHint: string;
    hidden: string;
    hide: string;
    hideDescription: string;
    showHidden: string;
    saved: string;
    toCollect: string;
    advanceHeld: string;
    /** `{count}`; singular and plural forms. */
    countOne: string;
    countOther: string;
    due: string;
    advance: string;
    settled: string;
    noPhone: string;
  };
  ledger: {
    balance: string;
    takePayment: string;
    newInvoice: string;
    sendReminder: string;
    printStatement: string;
    history: string;
    noHistory: string;
    entries: {
      INVOICE_DUE: string;
      PAYMENT: string;
      REVERSAL: string;
      ADJUSTMENT: string;
    };
    /** `{balance}`. */
    balanceAfter: string;
    /** `{limit}`. */
    overLimit: string;
    /** `{customer}`, `{shop}`, `{amount}`. */
    reminder: string;
    payment: {
      title: string;
      customer: string;
      chooseCustomer: string;
      noCustomers: string;
      amount: string;
      note: string;
      save: string;
      /** `{balance}`. */
      saved: string;
    };
    statement: {
      /** `{name}`. */
      title: string;
      date: string;
      description: string;
      amount: string;
      balance: string;
      closing: string;
    };
  };
  products: {
    title: string;
    add: string;
    new: string;
    edit: string;
    searchLabel: string;
    emptyTitle: string;
    emptyBody: string;
    /** `{query}`. */
    noResults: string;
    name: string;
    unit: string;
    unitHint: string;
    price: string;
    priceHint: string;
    aliases: string;
    aliasesHint: string;
    /** `{unit}`. */
    perUnit: string;
    priceAtSale: string;
    hidden: string;
    hide: string;
    hideDescription: string;
    showHidden: string;
    saved: string;
    /** `{count}`; singular and plural forms. */
    countOne: string;
    countOther: string;
  };
  reports: {
    title: string;
    /** Accessible name of the period switch. */
    periodLabel: string;
    today: string;
    thisWeek: string;
    thisMonth: string;
    totalSales: string;
    /** `{count}`; singular and plural forms. */
    invoiceCountOne: string;
    invoiceCountOther: string;
    /** `{amount}`. */
    collected: string;
    /** `{amount}`. */
    due: string;
    topProducts: string;
    topDebtors: string;
    /** `{quantity}`, `{unit}`. */
    sold: string;
    noSales: string;
    noDuesTitle: string;
    noDuesBody: string;
    exportCsv: string;
    exportPdf: string;
    exported: string;
    /** `{date}`. */
    generatedAt: string;
    columns: {
      period: string;
      summary: string;
      totalPaid: string;
      totalDue: string;
      invoices: string;
      product: string;
      unit: string;
      quantity: string;
      revenue: string;
      customer: string;
      phone: string;
      outstanding: string;
    };
  };
  settings: {
    title: string;
    shop: string;
    shopProfile: string;
    shopProfileHint: string;
    shopName: string;
    shopPhone: string;
    shopAddress: string;
    invoicePrefix: string;
    /** `{example}`. */
    invoicePrefixHint: string;
    language: string;
    appearance: string;
    themes: {
      light: string;
      dark: string;
      system: string;
    };
    account: string;
    /** `{identifier}`. */
    signedInAs: string;
    /** `{time}`. */
    lastSynced: string;
    syncNow: string;
    syncing: string;
    signOut: string;
    signOutTitle: string;
    signOutMessage: string;
    receipts: string;
    paperWidth: string;
    paperWidthHint: string;
    backups: string;
    createBackup: string;
    createBackupHint: string;
    restoreBackup: string;
    restoreBackupHint: string;
    saved: string;
  };
  backup: {
    exportTitle: string;
    exportMessage: string;
    exportConfirm: string;
    passwordLabel: string;
    /** `{min}`. */
    passwordHint: string;
    repeatPasswordLabel: string;
    /** `{min}`. */
    passwordTooShort: string;
    passwordMismatch: string;
    exportSuccess: string;
    restoreTitle: string;
    restoreMessage: string;
    fileLabel: string;
    restoreConfirm: string;
    /** `{count}`. */
    restoreSuccess: string;
    restoreNothing: string;
    invalidFile: string;
    wrongPassword: string;
    otherShop: string;
  };
}
