# ADR 0002: Every app is standalone; shared code is duplicated

- **Status:** accepted
- **Date:** 2026-11-12
- **Supersedes:** the monorepo layout of milestone M0 (pnpm workspace, Turborepo, `packages/*`)

## Context

The backend (`apps/api`), the landing site (`apps/web`) and the mobile app (`apps/mobile`) are
deployed separately, by different means: a server, a static host and the app stores. The owner
wants each app to be fully independent, so that any one of them can be copied out of this
repository and built alone, for example into its own repository.

The original layout shared code through workspace packages (`packages/shared`, `design-tokens`,
`parser`, `config`). With that layout no app can be built from its own folder, and a change to a
shared package changes all apps at once.

## Decision

1. There is no root workspace. Each app is an independent pnpm project with its own
   `package.json`, lockfile, pnpm settings, ESLint, TypeScript and Prettier configuration,
   environment example and `.gitignore`. No app has a `workspace:*` dependency.
2. No app imports from another app. Each app's ESLint config forbids it.
3. Code that two apps need is **duplicated** into a mirrored folder in each:

   | Mirrored folder  | Copies                                                 | Contents                                          |
   | ---------------- | ------------------------------------------------------ | ------------------------------------------------- |
   | `shared`         | `apps/api/src/shared`, `apps/mobile/src/shared`        | Money, UUIDv7, formatters, Zod schemas, sync contracts |
   | `design-tokens`  | `apps/web/design-tokens`, `apps/mobile/design-tokens`  | `tokens.json`, generator, theme, token tests      |

   The voice parser is used only by the mobile app and lives in `apps/mobile/src/parser`.
   The landing site keeps its own small formatters and waitlist validation.

4. While the apps share this repository, `tools/mirror.mjs check` (run in CI) fails when the
   copies of a mirrored folder differ, and `tools/mirror.mjs sync` copies one app's version over
   the other. The only tolerated difference is the `.js` suffix on relative imports, which the
   API needs because it runs as native ESM.
5. Services an app needs for development live with that app (`apps/api/docker-compose.yml`).

## Consequences

- Each app builds, tests and deploys from its own folder with no knowledge of the others.
- Duplicated code can drift. The mirror check prevents this only while the apps stay in one
  repository. After a split, the API and the mobile app must keep their sync contracts
  compatible by hand; the API's sync end-to-end tests are then the contract's safety net.
- A change to shared logic is made once and synced, which is one extra command.
- Dependency versions are no longer aligned automatically across apps.
- The old workspace files were moved to `_legacy-monorepo/` (git-ignored) and can be deleted.
