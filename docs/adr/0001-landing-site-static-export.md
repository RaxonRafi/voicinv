# ADR 0001: The landing site is a static export, separate from the API

- **Status:** accepted
- **Date:** 2026-11-12
- **Milestone:** M1

## Context

The landing site (`apps/web`), the backend (`apps/api`) and the mobile app (`apps/mobile`) must
stay separate deployables (AGENTS.md §6.1). The site has marketing pages in English and Bengali
and one interactive element, the waitlist form. AGENTS.md §6.4 requires static generation, no
client-side tracking, and exactly one API call (`POST /api/v1/waitlist`).

## Decision

1. `apps/web` is built with Next.js `output: 'export'`. The result (`apps/web/out`) is plain
   files that any static host can serve. There is no Node server for the site in production.
2. The site talks to the API only over HTTP, from the browser, at the origin given by
   `NEXT_PUBLIC_API_URL`. The value is baked in at build time, so a production build fails when
   it is missing. The API must list the site's origin in `CORS_ORIGINS`.
3. Apps never import from each other. Each app's own ESLint config enforces this. (How code
   needed by two apps is handled was later settled by ADR 0002: it is duplicated, not shared.)
4. Every page lives under `app/[locale]/` (`en`, `bn`). The site root (`/`) is a small page that
   forwards the visitor to the language their browser prefers, because a static host cannot
   redirect by `Accept-Language`.
5. Fonts (Noto Sans, Noto Sans Bengali) come from the `@fontsource-variable` npm packages and are
   served from the site itself. Next.js telemetry and its npm-registry version check are both
   disabled in `next.config.ts`, so a build makes no outgoing request, and the built site makes
   no request to any third party.

## Consequences

- The site keeps working when the API is down; only the waitlist form reports an error.
- Server-only Next.js features (redirects, headers, middleware, image optimization) are not
  available. Security headers such as a Content-Security-Policy must be configured on the static
  host.
- The waitlist request body is validated twice: lightly in `apps/web/src/lib/waitlist.ts` for
  immediate feedback, and authoritatively by the API DTO. The two are kept in step by hand; the
  site shares no code with the API (ADR 0002).
- The landing site owns its number and money formatters (`apps/web/src/lib/format.ts`). They
  cover only what the marketing pages show.
