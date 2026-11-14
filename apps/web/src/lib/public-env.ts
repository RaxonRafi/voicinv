export interface PublicEnv {
  /** Base URL of the VoiceLedger API, without a trailing slash. */
  apiUrl: string;
  /** Public URL of this site, without a trailing slash. */
  siteUrl: string;
  /** Contact address shown on the site, when configured. */
  contactEmail: string | undefined;
}

const DEV_API_URL = 'http://localhost:4000';
const DEV_SITE_URL = 'http://localhost:3000';

function origin(name: string, value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/\s]+$/.test(trimmed)) {
    throw new Error(`${name} must be an origin like https://example.com, received "${value}"`);
  }
  return trimmed;
}

/**
 * Validates the public (build-time) configuration of the landing site.
 *
 * The site is a static export, so these values are baked into the generated files. A production
 * build therefore refuses to run without an explicit API URL instead of silently shipping a
 * web app that talks to localhost.
 */
export function resolvePublicEnv(
  env: Readonly<Record<string, string | undefined>>,
  nodeEnv: string | undefined,
): PublicEnv {
  const apiUrl = env.NEXT_PUBLIC_API_URL?.trim();
  const siteUrl = env.NEXT_PUBLIC_SITE_URL?.trim();
  const contactEmail = env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();

  if (!apiUrl && nodeEnv === 'production') {
    throw new Error(
      'NEXT_PUBLIC_API_URL must be set for production builds of the landing site. ' +
        'See apps/web/.env.example.',
    );
  }
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    throw new Error(`NEXT_PUBLIC_CONTACT_EMAIL is not an email address: "${contactEmail}"`);
  }

  return {
    apiUrl: origin('NEXT_PUBLIC_API_URL', apiUrl || DEV_API_URL),
    siteUrl: origin('NEXT_PUBLIC_SITE_URL', siteUrl || DEV_SITE_URL),
    contactEmail: contactEmail || undefined,
  };
}
