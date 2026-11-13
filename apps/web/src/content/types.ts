/** Icons a piece of content may ask for. Mapped to Lucide icons by the `Icon` primitive. */
export type IconName =
  | 'mic'
  | 'offline'
  | 'invoice'
  | 'ledger'
  | 'share'
  | 'print'
  | 'reports'
  | 'shield'
  | 'phone'
  | 'languages'
  | 'account';

export interface Highlight {
  icon: IconName;
  title: string;
  body: string;
}

export interface FeatureGroup extends Highlight {
  points: readonly string[];
}

export interface Step {
  title: string;
  body: string;
}

export interface Plan {
  name: string;
  tagline: string;
  /** Price line. May contain no amount at all (e.g. "Free"). */
  price: string;
  /** Feature lines. `{count}` is replaced with the free plan's monthly invoice allowance. */
  features: readonly string[];
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface LegalSection {
  heading: string;
  paragraphs: readonly string[];
}

export interface LegalDocument {
  title: string;
  description: string;
  intro: string;
  sections: readonly LegalSection[];
}

/**
 * Every user-facing string of the landing site, for one language. English and Bengali both
 * implement this interface, so a missing translation is a compile error (AGENTS.md §7.2 rule 8).
 */
export interface SiteContent {
  meta: {
    siteName: string;
    /** Default page description for search engines and link previews. */
    description: string;
  };
  nav: {
    /** Accessible name of the main navigation landmark. */
    mainLabel: string;
    /** Accessible name of the footer navigation landmark. */
    footerLabel: string;
    home: string;
    features: string;
    pricing: string;
    download: string;
    faq: string;
    privacy: string;
    terms: string;
    joinWaitlist: string;
    skipToContent: string;
    /** Accessible name of the language link. `{language}` is the target language's own name. */
    switchLanguage: string;
  };
  home: {
    title: string;
    hero: {
      eyebrow: string;
      title: string;
      subtitle: string;
      primaryCta: string;
      secondaryCta: string;
      points: readonly string[];
    };
    demo: {
      /** Accessible description of the whole illustration. */
      caption: string;
      youSay: string;
      spoken: string;
      draftTitle: string;
      customerLabel: string;
      customerName: string;
      itemName: string;
      itemQuantity: string;
      totalLabel: string;
      paidLabel: string;
      dueLabel: string;
      status: string;
    };
    steps: {
      title: string;
      items: readonly Step[];
    };
    highlights: {
      title: string;
      items: readonly Highlight[];
      allFeatures: string;
    };
  };
  features: {
    title: string;
    description: string;
    intro: string;
    groups: readonly FeatureGroup[];
  };
  pricing: {
    title: string;
    description: string;
    intro: string;
    free: Plan;
    pro: Plan;
    note: string;
  };
  download: {
    title: string;
    description: string;
    status: string;
    intro: string;
    body: string;
    points: readonly string[];
  };
  faq: {
    title: string;
    description: string;
    intro: string;
    items: readonly FaqItem[];
  };
  privacy: LegalDocument;
  terms: LegalDocument;
  legal: {
    /** `{date}` is the formatted date of the last change. */
    updated: string;
    contactHeading: string;
    /** Shown before the contact email address. */
    contactBody: string;
  };
  waitlist: {
    title: string;
    body: string;
    contactLabel: string;
    contactHint: string;
    nameLabel: string;
    shopTypeLabel: string;
    shopTypePlaceholder: string;
    shopTypes: {
      grocery: string;
      wholesale: string;
      pharmacy: string;
      hardware: string;
      clothing: string;
      other: string;
    };
    optional: string;
    submit: string;
    submitting: string;
    privacyNote: string;
    successTitle: string;
    successBody: string;
    errors: {
      contactRequired: string;
      contactInvalid: string;
      rateLimited: string;
      unavailable: string;
    };
  };
  footer: {
    tagline: string;
  };
  notFound: {
    title: string;
    body: string;
    home: string;
  };
}
