// Build-time public configuration. next.config.ts validates these variables and always defines
// them, so the fallbacks below only apply outside a Next.js build (unit tests).

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
export const CONTACT_EMAIL: string | undefined = process.env.NEXT_PUBLIC_CONTACT_EMAIL || undefined;

/** Free plan allowance shown on the pricing page (AGENTS.md §11). */
export const FREE_INVOICES_PER_MONTH = 30;

/** Date the privacy policy and terms were last changed (`YYYY-MM-DD`). */
export const LEGAL_UPDATED_ON = '2026-11-12';
