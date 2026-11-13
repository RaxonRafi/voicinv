import type { NextConfig } from 'next';

import { resolvePublicEnv } from './src/lib/public-env';

// AGENTS.md §1/§16: no third-party network calls. Next.js build/dev telemetry is switched off
// here so it holds on every machine and in CI without relying on per-user settings.
process.env.NEXT_TELEMETRY_DISABLED = '1';

// Fails the build early when a required public variable is missing or malformed.
const publicEnv = resolvePublicEnv(process.env, process.env.NODE_ENV);

const nextConfig: NextConfig = {
  // Fully static site (apps/web/out): deployable on any static host, independent of the API.
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_API_URL: publicEnv.apiUrl,
    NEXT_PUBLIC_SITE_URL: publicEnv.siteUrl,
    NEXT_PUBLIC_CONTACT_EMAIL: publicEnv.contactEmail ?? '',
  },
  experimental: {
    // The root layout lives under app/[locale], so unmatched URLs need a standalone 404 page.
    globalNotFound: true,
    // Next.js otherwise asks the npm registry for newer versions during every build and dev
    // start. Builds stay offline; dependency updates go through normal review instead.
    agentUpgrade: false,
  },
};

export default nextConfig;
