import { type SiteContent } from './types';

export const en: SiteContent = {
  meta: {
    siteName: 'VoiceLedger',
    description:
      'Say the sale out loud. VoiceLedger writes the invoice, keeps each customer’s due up to date and works without internet.',
  },
  nav: {
    mainLabel: 'Main',
    footerLabel: 'Footer',
    home: 'Home',
    features: 'Features',
    pricing: 'Pricing',
    download: 'Download',
    faq: 'FAQ',
    privacy: 'Privacy',
    terms: 'Terms',
    joinWaitlist: 'Join waitlist',
    skipToContent: 'Skip to content',
    switchLanguage: 'Switch language to {language}',
  },
  home: {
    title: 'Voice invoicing and credit ledger for small shops',
    hero: {
      eyebrow: 'For shops and wholesalers',
      title: 'Say the sale. The invoice writes itself.',
      subtitle:
        'Speak in Bangla, English or a mix of both. VoiceLedger makes the invoice, keeps each customer’s due up to date, and works with no internet.',
      primaryCta: 'Join the waitlist',
      secondaryCta: 'See how it works',
      points: ['Works fully offline', 'Your voice never leaves the phone', 'No account needed'],
    },
    demo: {
      caption:
        'Example: the shopkeeper says a sale out loud and VoiceLedger prepares the invoice with the total, the amount paid and the amount due.',
      youSay: 'You say',
      spoken: '“Two bags of rice to Karim, paid half.”',
      draftTitle: 'Invoice ready to check',
      customerLabel: 'Customer',
      customerName: 'Karim',
      itemName: 'Rice',
      itemQuantity: '2 bags',
      totalLabel: 'Total',
      paidLabel: 'Paid',
      dueLabel: 'Due',
      status: 'Partly paid',
    },
    steps: {
      title: 'Three steps, a few seconds',
      items: [
        {
          title: 'Speak',
          body: 'Hold the mic button and say what you sold, to whom, and how much they paid.',
        },
        {
          title: 'Check',
          body: 'The invoice appears on screen. Anything the app is unsure about is highlighted so you can fix it.',
        },
        {
          title: 'Save and send',
          body: 'Save it, then share it through WhatsApp, Messenger, SMS or email, or print it.',
        },
      ],
    },
    highlights: {
      title: 'Built for the way your shop works',
      items: [
        {
          icon: 'offline',
          title: 'Works without internet',
          body: 'Billing, the customer ledger, sharing and printing all work offline.',
        },
        {
          icon: 'languages',
          title: 'Bangla and English, even mixed',
          body: 'Speak the way you already talk in your shop.',
        },
        {
          icon: 'ledger',
          title: 'Customer credit ledger',
          body: 'Every customer’s due and payment history, always up to date.',
        },
        {
          icon: 'share',
          title: 'Share or print',
          body: 'Send a PDF or image with any app on your phone, or print on a Bluetooth thermal printer.',
        },
        {
          icon: 'shield',
          title: 'Private by design',
          body: 'Your voice is processed on your phone, and your records are encrypted on it.',
        },
        {
          icon: 'phone',
          title: 'Made for everyday phones',
          body: 'Designed for low-cost Android phones, with large buttons and clear text.',
        },
      ],
      allFeatures: 'See all features',
    },
  },
  features: {
    title: 'Features',
    description:
      'Voice billing, invoices, a customer credit ledger, reports and encrypted backups — all working offline.',
    intro: 'Everything a small shop needs to bill customers and track credit, without typing.',
    groups: [
      {
        icon: 'mic',
        title: 'Voice billing',
        body: 'Hold the mic and say the sale. The app fills in the invoice for you.',
        points: [
          'Understands Bangla, English and mixed sentences',
          'Sales, payments and questions like “How much does Karim owe?”',
          'Highlights anything it is unsure about before you save',
          'Learns the names and items you correct',
          'You can always type instead',
        ],
      },
      {
        icon: 'invoice',
        title: 'Invoices',
        body: 'Clean invoices your customers can read, on paper or on their phone.',
        points: [
          'PDF or image, in A4 or thermal receipt size',
          'Share with any app on your phone',
          'Print on a Bluetooth thermal printer, in Bangla too',
          'Invoice numbers never clash, even across several phones',
          'Edit or cancel with a full history of changes',
        ],
      },
      {
        icon: 'ledger',
        title: 'Customer credit ledger',
        body: 'Know who owes you and how much, at any moment.',
        points: [
          'Balance and history for every customer',
          'Record payments by voice',
          'Send a polite reminder message',
          'Share a statement as a PDF',
          'Warning when a customer passes their credit limit',
        ],
      },
      {
        icon: 'reports',
        title: 'Reports',
        body: 'See how the shop is doing without a calculator.',
        points: [
          'Today’s sales at a glance',
          'Daily, weekly and monthly totals',
          'Top-selling items and biggest dues',
          'Export as PDF or CSV',
        ],
      },
      {
        icon: 'shield',
        title: 'Privacy and safety',
        body: 'Your business records belong to you and stay with you.',
        points: [
          'Voice is processed on the phone; audio is never uploaded',
          'Records are encrypted on the device',
          'Fingerprint or PIN lock',
          'Automatic daily backups on the phone',
          'No ads and no trackers',
        ],
      },
      {
        icon: 'account',
        title: 'Optional account',
        body: 'You never need to sign up. An account only adds extras.',
        points: [
          'Encrypted cloud backup — only you can read it',
          'Use the same shop on several phones',
          'Everything else works without an account',
        ],
      },
    ],
  },
  pricing: {
    title: 'Pricing',
    description:
      'Start free with {count} invoices a month. Upgrade to Pro when your shop needs more.',
    intro: 'Start free. Upgrade when your shop needs more.',
    free: {
      name: 'Free',
      tagline: 'For getting started',
      price: 'No cost',
      features: [
        '{count} invoices every month',
        'Voice billing in Bangla and English',
        'Customer credit ledger',
        'Share invoices as PDF or image',
        'Works fully offline',
        'Small VoiceLedger watermark on invoices',
      ],
    },
    pro: {
      name: 'Pro',
      tagline: 'For busy shops',
      price: 'Price announced at launch',
      features: [
        'Unlimited invoices',
        'No watermark',
        'Your shop logo on invoices',
        'All invoice templates',
        'Bluetooth thermal printing',
        'Full reports',
        'Encrypted cloud backup and sync between phones',
      ],
    },
    note: 'Pro is a subscription paid through the app store. Join the waitlist and we will tell you the price before launch.',
  },
  download: {
    title: 'Download',
    description:
      'VoiceLedger is coming to Android first. Join the waitlist to hear when it is ready.',
    status: 'Coming soon',
    intro: 'VoiceLedger is coming to Android first. An iPhone version will follow.',
    body: 'The app is not in the store yet. Join the waitlist and we will let you know the day it is ready.',
    points: [
      'Android first, iPhone later',
      'Designed for low-cost phones',
      'Free to start, no account needed',
    ],
  },
  faq: {
    title: 'Questions and answers',
    description:
      'Common questions about VoiceLedger: offline use, languages, privacy, accounts and pricing.',
    intro: 'Short answers to what shop owners ask us most.',
    items: [
      {
        question: 'Does it work without internet?',
        answer:
          'Yes. Speaking a sale, making the invoice, updating the customer’s balance, sharing and printing all work with no connection. Internet is only used if you choose cloud backup or sync.',
      },
      {
        question: 'Is my voice sent anywhere?',
        answer:
          'No. Your voice is turned into text on your own phone. The audio never leaves the device.',
      },
      {
        question: 'Which languages can I speak?',
        answer:
          'Bangla, English, or both mixed in one sentence — the way people really talk in a shop.',
      },
      {
        question: 'Do I need to create an account?',
        answer:
          'No. You can use billing and the ledger without signing up. An account is only needed for cloud backup and for using several phones together.',
      },
      {
        question: 'How do I send an invoice to a customer?',
        answer:
          'Tap share and pick the app you already use — WhatsApp, Messenger, SMS or email. You choose the customer and press send. You can also print it.',
      },
      {
        question: 'Is my data safe?',
        answer:
          'Your records are encrypted on your phone and can be locked with a fingerprint or PIN. Cloud backups are encrypted on the phone before upload, so we cannot read them.',
      },
      {
        question: 'What if the app hears me wrong?',
        answer:
          'You always see the invoice before it is saved. Anything the app is unsure about is highlighted, and you can correct it by tapping. The app remembers your corrections.',
      },
      {
        question: 'How much does it cost?',
        answer:
          'There is a free plan with {count} invoices a month. Pro removes the limit and adds printing, reports and cloud backup. The Pro price will be announced at launch.',
      },
      {
        question: 'When can I get it?',
        answer:
          'We are getting the Android app ready now. Join the waitlist and we will contact you when it is available.',
      },
    ],
  },
  privacy: {
    title: 'Privacy policy',
    description: 'How VoiceLedger handles your information, in plain language.',
    intro:
      'VoiceLedger is built so that your business records stay with you. This page explains what we collect and what we do not.',
    sections: [
      {
        heading: 'The short version',
        paragraphs: [
          'Your invoices, customers and ledger live on your phone. Your voice is processed on your phone. We do not show ads, we do not use trackers, and we do not sell information.',
        ],
      },
      {
        heading: 'This website',
        paragraphs: [
          'This website does not use analytics, advertising cookies or third-party trackers.',
          'Our server keeps short-lived technical logs, such as IP addresses, to keep the service secure and to stop abuse.',
        ],
      },
      {
        heading: 'The waitlist',
        paragraphs: [
          'If you join the waitlist we store the phone number or email address you give us, plus your name, shop type and language if you add them.',
          'We use these details only to tell you about the launch of VoiceLedger. We do not share them with anyone else. You can ask us to delete them at any time.',
        ],
      },
      {
        heading: 'The app: what stays on your phone',
        paragraphs: [
          'Invoices, customers, products, payments and balances are stored on your phone and encrypted there. You can use the app without creating an account, and in that case none of this information reaches us.',
          'When you speak to the app, your voice is turned into text on the phone itself. Audio is never uploaded.',
        ],
      },
      {
        heading: 'Optional account, backup and sync',
        paragraphs: [
          'If you choose to create an account, we store your login details so you can sign in.',
          'Cloud backups are encrypted on your phone before they are uploaded, so we cannot read what is inside them.',
          'If you turn on sync between phones, your shop records are stored on our server so your devices can stay up to date.',
          'Subscriptions are paid through the app store. We receive confirmation of the purchase, not your card details.',
        ],
      },
      {
        heading: 'Changes to this policy',
        paragraphs: ['If this policy changes, we will update this page and the date at the top.'],
      },
    ],
  },
  terms: {
    title: 'Terms of use',
    description: 'The terms for using the VoiceLedger website and waitlist.',
    intro:
      'These terms cover this website and the waitlist. Terms for the app itself will be published here before the app is released.',
    sections: [
      {
        heading: 'About VoiceLedger',
        paragraphs: [
          'VoiceLedger is an invoicing and customer credit ledger app for small shops. The app is still being prepared, so features described on this website may change before release.',
        ],
      },
      {
        heading: 'The waitlist',
        paragraphs: [
          'Joining the waitlist is free and does not oblige you to buy or use anything. It does not guarantee access by a particular date.',
          'Please give contact details that belong to you. You can ask to be removed at any time.',
        ],
      },
      {
        heading: 'Plans and payment',
        paragraphs: [
          'The app will have a free plan and a paid Pro plan. Prices and the exact features of each plan will be confirmed before launch. Payments will be handled by the app store.',
        ],
      },
      {
        heading: 'Using this website',
        paragraphs: [
          'Please do not misuse the website, for example by sending automated signups or trying to disrupt the service.',
        ],
      },
      {
        heading: 'No warranty',
        paragraphs: [
          'This website is provided as it is. We work to keep the information correct, but we cannot promise that it is free of errors.',
        ],
      },
      {
        heading: 'Changes to these terms',
        paragraphs: ['If these terms change, we will update this page and the date at the top.'],
      },
    ],
  },
  legal: {
    updated: 'Last updated: {date}',
    contactHeading: 'Contact',
    contactBody: 'Questions or requests about your information? Write to us at',
  },
  waitlist: {
    title: 'Be first to try VoiceLedger',
    body: 'Leave your phone number or email and we will tell you when the app is ready.',
    contactLabel: 'Phone number or email',
    contactHint: 'For example 01712345678 or name@example.com',
    nameLabel: 'Your name',
    shopTypeLabel: 'Type of shop',
    shopTypePlaceholder: 'Choose one',
    shopTypes: {
      grocery: 'Grocery',
      wholesale: 'Wholesale',
      pharmacy: 'Pharmacy',
      hardware: 'Hardware',
      clothing: 'Clothing',
      other: 'Other',
    },
    optional: 'optional',
    submit: 'Join the waitlist',
    submitting: 'Sending…',
    privacyNote: 'We only use this to tell you about the launch.',
    successTitle: 'You are on the list',
    successBody: 'Thank you. We will contact you when VoiceLedger is ready.',
    errors: {
      contactRequired: 'Enter your phone number or email.',
      contactInvalid: 'Enter a valid phone number or email address.',
      rateLimited: 'Too many attempts. Please wait a minute and try again.',
      unavailable: 'We could not send your details. Check your internet and try again.',
    },
  },
  footer: {
    tagline: 'Voice invoicing and credit ledger for small shops. Works offline.',
  },
  notFound: {
    title: 'Page not found',
    body: 'The page you are looking for does not exist.',
    home: 'Go to the home page',
  },
};
