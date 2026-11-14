# VoiceLedger (working name)

Offline-first, voice-first invoicing and customer credit ledger for small shops.
A shopkeeper says _"two bags of rice to Karim, paid half"_ and the app creates the
invoice, updates Karim's balance, and lets the user share or print it.

This README is the source of truth for AI coding agents working on this repo.
Read **§1 Hard constraints**, **§5 Repository structure**, **§6 Modular architecture rules**,
**§7 Design system** and **§16 Agent rules** before writing any code.

> **Three standalone apps.** The backend (`apps/api`), the landing site (`apps/web`) and the
> mobile app (`apps/mobile`) are deployed separately. Each one is a self-contained project that
> can be copied out of this repo and built alone. There are **no shared workspace packages**;
> code that two apps need is duplicated into each (see §5 and `docs/adr/0002`).

---

## 1. Hard constraints (never violate)

1. **The mobile app's core loop works fully offline**: voice → invoice → ledger → share/print.
   No feature in that loop may require a network connection.
2. **No third-party APIs for product features.** No AI/LLM APIs, no cloud speech
   recognition, no WhatsApp API, no Firebase, no third-party analytics, ads or trackers.
3. **Allowed network use only:**
   - Our own backend (`apps/api`) for optional accounts, cloud backup, sync and entitlements
   - Google Play Billing / Apple In-App Purchase, including server-side purchase verification
   - Play Asset Delivery (or our own API) for downloading voice model packs
4. **Voice processing always happens on the device.** Audio never leaves the phone.
5. **Accounts are optional.** A user who never signs up loses nothing in the core loop.
6. **Sharing uses the OS share sheet.** The user picks WhatsApp/Messenger/SMS/email and taps send.
7. **Money is an integer in minor units** (paisa/cents). Never use floating point for money,
   on any platform. Use the `Money` utilities in the app's `src/shared`.
8. **Financial records are append-only.** Ledger entries, payments and invoice revisions are
   never updated or deleted; corrections are new records.
9. **Local data is encrypted at rest** (SQLCipher). Cloud backups are encrypted on the device
   before upload; the server never sees plaintext backup content.

---

## 2. Product summary

- **Users:** small shop owners and wholesalers, often on low-end Android phones,
  often more comfortable speaking than typing.
- **Core loop:** speak → review draft on confirmation screen → save → share/print.
- **Languages (v1):** English, Bengali (Bangla) and code-mixed English + Bengali.
  New languages must be a **data-only change** (language pack files), never new code branches.
- **Platforms:** Android first; iOS supported by the same codebase, released later.
- **Business model:** free tier with limits + Pro subscription via store billing.

---

## 3. System architecture

```
┌──────────────────────────── Mobile app (Expo / React Native) ───────────────────────────┐
│  UI (feature modules)                                                                   │
│     │                                                                                   │
│  Domain (use cases, src/parser, src/shared)                                             │
│     │                                                                                   │
│  Local data: SQLite + SQLCipher (source of truth on device)  ←→  Sync engine (optional) │
│  On-device: speech recognition, TTS, PDF, Bluetooth printing                            │
└──────────────────────────────────────────────┬──────────────────────────────────────────┘
                                               │ HTTPS (only when signed in + online)
┌──────────────────────────────────────────────▼──────────────────────────────────────────┐
│  API (NestJS)  → auth · devices · sync · backups · billing · waitlist · app-config      │
│  PostgreSQL (TypeORM)            Encrypted backup storage (disk volume / self-hosted)   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  Landing site (Next.js, static) → marketing pages, pricing, download, waitlist form     │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Tech stack

### Every app (each app owns its own copy of this tooling)

| Area               | Choice                                                                    |
| ------------------ | ------------------------------------------------------------------------- |
| Package manager    | pnpm, one independent project per app (own `package.json` and lockfile)   |
| Language           | TypeScript (strict mode everywhere)                                       |
| Lint / format      | ESLint + Prettier, configured inside each app                             |
| Validation schemas | Zod (sync contracts and entities, duplicated in the API and mobile app)   |
| CI                 | One job per app: format, lint, typecheck, tests, build; plus mirror check |

### Backend — `apps/api`

| Area       | Choice                                                                                 |
| ---------- | -------------------------------------------------------------------------------------- |
| Framework  | NestJS                                                                                 |
| Database   | PostgreSQL                                                                             |
| ORM        | TypeORM (migrations only, `synchronize: false`)                                        |
| Runtime    | Node.js 24.7 or newer (Argon2 comes from Node's built-in `crypto`)                     |
| Auth       | JWT access + rotating refresh tokens (stored hashed), Argon2id password hashing        |
| Validation | `class-validator` DTOs + global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`) |
| Config     | `@nestjs/config` with schema validation at startup                                     |
| Docs       | `@nestjs/swagger` (OpenAPI)                                                            |
| Security   | Helmet, CORS allow-list, `@nestjs/throttler` rate limiting                             |
| Logging    | Structured JSON logs (pino)                                                            |
| Testing    | Jest unit tests, Supertest e2e against a test Postgres                                 |
| Deployment | Docker image + docker-compose (api + postgres)                                         |

### Landing page — `apps/web`

| Area      | Choice                                                          |
| --------- | --------------------------------------------------------------- |
| Framework | Next.js (App Router), static generation for all marketing pages |
| Styling   | Tailwind CSS generated from the app's own `design-tokens/`      |
| i18n      | English + Bengali                                               |
| Analytics | None by default; self-hosted only, and only after approval      |

### Mobile — `apps/mobile`

| Area           | Choice                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Framework      | React Native with Expo (development builds / prebuild, not Expo Go)                                |
| Navigation     | Expo Router                                                                                        |
| Local DB       | SQLite via op-sqlite with SQLCipher + Drizzle ORM                                                  |
| State          | Zustand for UI state; DB is the source of truth for data                                           |
| Forms          | react-hook-form + Zod                                                                              |
| i18n           | i18next                                                                                            |
| Speech-to-text | Platform on-device recognizer (e.g. expo-speech-recognition with on-device mode); whisper.rn later |
| Text-to-speech | expo-speech (on-device)                                                                            |
| PDF            | expo-print (HTML templates with bundled Noto fonts)                                                |
| Share          | expo-sharing                                                                                       |
| Printing       | Bluetooth ESC/POS native module; receipts rendered to bitmap (react-native-view-shot)              |
| Security       | expo-local-authentication (biometric/PIN), expo-secure-store (DB key, tokens)                      |
| Billing        | react-native-iap, verified by `apps/api`                                                           |
| Testing        | Jest + React Native Testing Library; Maestro for E2E flows                                         |

**Library rule:** before adding any mobile library, confirm it is maintained, compatible with
the current Expo SDK and React Native New Architecture, and makes no network calls of its own.

---

## 5. Repository structure

```
.
├── apps/
│   ├── api/                  # NestJS backend            — standalone, deployed on its own
│   │   └── src/shared/       #   Money, IDs, Zod schemas, sync contracts   (mirrored ↔ mobile)
│   ├── web/                  # Next.js landing site      — standalone, deployed on its own
│   │   └── design-tokens/    #   token source + generator                  (mirrored ↔ mobile)
│   └── mobile/               # Expo React Native app     — standalone, deployed on its own
│       ├── design-tokens/    #   token source + generator                  (mirrored ↔ web)
│       ├── src/shared/       #   Money, IDs, Zod schemas, sync contracts   (mirrored ↔ api)
│       └── src/parser/       #   Voice text → DraftInvoice (pure TS, no platform APIs)
├── tools/mirror.mjs          # checks that mirrored folders are identical; can copy one over the other
├── docs/                     # ADRs (architecture decision records), diagrams
└── AGENTS.md
```

There is no root `package.json`, no workspace and no `packages/` folder. Rules:

- **An app never depends on anything outside its own folder**: no `workspace:*` dependencies and
  no imports from another app. Each app has its own `package.json`, `pnpm-lock.yaml`,
  `pnpm-workspace.yaml` (pnpm settings only), ESLint, TypeScript and Prettier config,
  `.env.example` and `.gitignore`. Run every command from inside the app folder.
- **Mirrored folders** hold code that two apps need. The copies must stay identical (apart from
  the `.js` import suffix the API's native ESM needs). After changing one copy run
  `node tools/mirror.mjs sync <group> <app you edited>`; CI runs `node tools/mirror.mjs check`.
- The landing site shares nothing with the other apps except the design tokens. It keeps its own
  copies of the domain code and parser (`apps/web/src/domain`, `apps/web/src/parser`), which are
  not mirrored (`docs/adr/0003`).

---

## 6. Modular architecture rules

### 6.1 Rules for every app and package

1. **Organize by feature, not by file type.** Each feature is a self-contained module.
2. **Each module has a public API** (`index.ts` on mobile/web, exported providers in NestJS).
   Other modules may import **only** from that public API, never from internal files.
3. **Dependency direction:** `features → core → shared` (the app's own `src/shared`). Nothing
   imports from another app. Features never import other features' internals.
4. **No circular dependencies, no cross-app imports.** Enforced by each app's ESLint config
   (`no-restricted-imports`) in CI.
5. **Business rules live in pure functions or use cases**, not in UI components or controllers.
6. **Logic needed by two apps is duplicated** into a mirrored folder in each (§5), never moved
   to a shared package.

### 6.2 Backend (NestJS) module layout

```
apps/api/src/
├── main.ts
├── app.module.ts
├── config/                   # typed config + validation schema
├── common/                   # guards, interceptors, filters, decorators, pipes
├── database/                 # data source, migrations, base entity, transformers
└── modules/
    ├── auth/
    ├── users/
    ├── shops/
    ├── devices/
    ├── sync/
    ├── backups/
    ├── billing/
    ├── waitlist/
    └── app-config/
```

Each module:

```
modules/<name>/
├── <name>.module.ts
├── <name>.controller.ts      # HTTP only: parse, validate, call service, map response
├── <name>.service.ts         # business logic
├── <name>.repository.ts      # all TypeORM access for this module
├── entities/
├── dto/                      # request/response DTOs (class-validator)
└── __tests__/
```

Backend rules:

- Controllers contain no business logic and never touch repositories directly.
- A module accesses **only its own entities/repositories**. Cross-module needs go through the
  other module's exported service, or through domain events (`@nestjs/event-emitter`).
- Every query is scoped to the authenticated user's shop via a tenant guard; never trust a
  `shopId` sent by the client without checking ownership.
- Multi-step writes (e.g. sync push) run inside a single database transaction.
- TypeORM: `synchronize: false`; every schema change is a migration, reviewed and tested.
- Postgres `bigint` columns (money) use a transformer that returns an integer and throws if a
  value exceeds `Number.MAX_SAFE_INTEGER`. Never let money arrive as a float.
- Errors use a global exception filter returning `{ code, message, details? }`.
- API is versioned: all routes under `/api/v1`.

### 6.3 Mobile module layout

```
apps/mobile/src/
├── app/                      # Expo Router routes (thin: compose feature screens only)
├── core/
│   ├── db/                   # connection, SQLCipher key, Drizzle schema, migrations
│   ├── i18n/
│   ├── theme/                # consumes the app's design-tokens/
│   ├── ui/                   # design system components (see §7)
│   ├── sync/                 # sync engine (optional, only when signed in)
│   └── utils/
└── features/
    ├── onboarding/
    ├── invoices/
    ├── customers/
    ├── products/
    ├── ledger/
    ├── voice/
    ├── reports/
    ├── printing/
    ├── backup/
    ├── billing/
    └── settings/
```

Each feature:

```
features/<name>/
├── index.ts                  # public API (screens, hooks, types)
├── screens/
├── components/               # feature-specific components built from core/ui
├── hooks/
├── usecases/                 # business logic (pure where possible)
├── repository.ts             # all DB access for this feature
├── types.ts
└── __tests__/
```

Mobile rules:

- Route files in `app/` only render feature screens; no logic.
- Components never call the database directly; they use hooks → use cases → repository.
- Use cases are platform-free TypeScript so they can be unit tested in Node.

### 6.4 Web (Next.js) layout

```
apps/web/src/
├── app/[locale]/(site)/      # public pages: home, features, pricing, download, faq, privacy, terms
├── app/[locale]/app/         # signed-in web app (M12b): one route file per screen
├── components/               # sections and design-system primitives (components/ui)
├── content/                  # copy per locale (en, bn): site and app
├── dashboard/                # the web app: API client, data/use cases, screens, voice, documents
├── domain/                   # the site's own Money, IDs, formatters, schemas, sync contracts
├── parser/                   # the site's own copy of the voice parser and language packs
└── lib/
```

Web rules: static generation for all pages; no client-side tracking; images optimized. Public
pages call only the waitlist (`POST /api/v1/waitlist`). The signed-in web app (`/<locale>/app/`)
calls the auth, devices and sync endpoints, keeps records in memory only (never in browser
storage) and uses speech recognition only on the device (`processLocally`); see `docs/adr/0003`.

---

## 7. Design system

### 7.1 Tokens (`design-tokens/` in `apps/web` and `apps/mobile`, mirrored)

One `tokens.json` generates CSS variables + Tailwind theme (web) and a typed theme (mobile). The
folder is duplicated in both apps and the copies are kept identical.

- **Color:** primitive palette → **semantic tokens**. Feature code uses semantic tokens only:
  `bg.canvas`, `bg.surface`, `bg.raised`, `text.primary`, `text.secondary`, `text.inverse`,
  `border.default`, `action.primary`, `action.primaryPressed`,
  `status.success`, `status.warning`, `status.danger`, `status.info`,
  `money.paid`, `money.due`, `money.cancelled`, `confidence.low`.
- **Typography:** Noto Sans + Noto Sans Bengali (bundled, also used in PDFs and receipts).
  Scale: `display`, `title`, `heading`, `body`, `bodyStrong`, `label`, `caption`, `amount`.
  Amounts use tabular figures.
- **Spacing:** 4-point scale (`0, 4, 8, 12, 16, 24, 32, 48, 64`).
- **Radius:** `sm 6`, `md 10`, `lg 16`, `full`.
- **Elevation, motion, z-index:** defined as tokens; durations 150–250 ms; respect reduced motion.
- **Themes:** light and dark from the same semantic tokens.

### 7.2 Rules

1. **No hard-coded colors, font sizes, spacing or radii in feature code.** Lint rule fails CI
   on raw hex values or numeric style literals outside `core/ui` and `design-tokens/`.
2. **Feature code builds UI from design-system components only.** If a component is missing,
   add it to `core/ui` (mobile) or the web primitives first, then use it.
3. **Accessibility (minimum):** WCAG AA contrast; touch targets ≥ 48×48 dp; body text ≥ 16;
   every interactive element has an accessible label; never use color alone to convey status
   (Paid/Due badges include text or icons).
4. **Large-text safe:** layouts must work at 200% system font size.
5. **Numbers and money** are always formatted through the shared formatter
   (locale numerals, currency, grouping). Never format money with string concatenation.
6. **Icons:** one icon set across web and mobile (Lucide).
7. **Every component documents its states:** default, pressed/hover, focused, disabled,
   loading, error, and empty where relevant.
8. **Copy:** short, plain language; every string goes through i18n with English and Bengali.

### 7.3 Core component inventory (mobile `core/ui`)

`Screen`, `Text`, `Button`, `IconButton`, `MicButton` (hold-to-talk, listening state),
`TextField`, `AmountField`, `QuantityField`, `Select`, `Card`, `ListItem`, `Badge`
(Paid / Partly paid / Due / Cancelled), `Avatar`, `BottomSheet`, `Dialog`, `Toast`,
`EmptyState`, `Skeleton`, `SectionHeader`, `ConfidenceHighlight` (marks uncertain voice fields),
`Banner` (offline / backup reminders).

---

## 8. Data model and sync

### 8.1 Common columns (every syncable table, mobile and server)

`id` (UUIDv7, generated on the device), `shopId`, `createdAt`, `updatedAt`, `deletedAt`
(soft delete, mutable entities only), `deviceId`, `serverSeq` (server-assigned, server only).

### 8.2 Entities

- **Shop** — name, address, phone, logo, currencyCode, defaultLanguage
- **Device** — shopId, deviceCode (short code, e.g. `A`, `B`), name, lastSyncAt
- **Customer** — name, phone, notes, creditLimit (nullable), isArchived
- **CustomerAlias** — customerId, alias, languageCode
- **Product** — name, unit, defaultPrice, stockQty (nullable, later), isArchived
- **ProductAlias** — productId, alias, languageCode
- **Invoice** — invoiceNumber, customerId (nullable = walk-in), date, subtotal, discount,
  total, paidAmount, dueAmount, status (`ACTIVE` | `CANCELLED`), sourceText
- **InvoiceItem** — invoiceId, productId (nullable), nameSnapshot, qtyMilli (qty × 1000),
  unit, unitPrice, lineTotal
- **Payment** — customerId, amount, date, note, invoiceId (nullable) — _append-only_
- **LedgerEntry** — customerId, type (`INVOICE_DUE` | `PAYMENT` | `REVERSAL` | `ADJUSTMENT`),
  amount (signed), refId — _append-only_
- **InvoiceRevision** — invoiceId, previousJson, reason — _append-only_
- **Correction** — heardText, correctedText, fieldType, languageCode, count (device-local, not synced)
- Server only: **User**, **RefreshToken**, **Backup** (metadata; blob stored encrypted),
  **Entitlement**, **WaitlistEntry**

### 8.3 Ledger rules

- Customer balance = sum of the customer's `LedgerEntry.amount`. Cached balances must be
  rebuildable from entries.
- Cancel invoice → status `CANCELLED` + `REVERSAL` entry. Edit invoice → `InvoiceRevision` +
  `ADJUSTMENT` entry for the difference.

### 8.4 Invoice numbering across devices

Numbers must never collide when several devices work offline. Format:
`<shopPrefix>-<deviceCode>-<sequence>` (e.g. `RS-A-000123`). Each device owns its own sequence.
Unregistered (no account) devices use device code `A`.

### 8.5 Sync protocol (only when signed in)

- `GET /api/v1/sync/pull?cursor=<serverSeq>` → changes since cursor, grouped by table:
  `{ created, updated, deleted }`, plus the new cursor. Cursor is server-assigned, never a
  client clock.
- `POST /api/v1/sync/push` → local changes since last successful push; applied in one transaction.
- **Append-only tables:** server accepts inserts only; updates or deletes are rejected.
- **Mutable tables** (customer, product, shop, aliases): last write wins by server receive order;
  the server returns the winning version on conflict.
- Sync is idempotent: re-pushing the same record ID is a no-op.
- Contracts (Zod schemas) live in `src/shared/sync` of both the API and the mobile app (mirrored).

---

## 9. Voice pipeline

```
mic → SpeechEngine (on device) → transcript
    → parser (src/parser): normalize → tokenize → numbers → entity match → intent → DraftInvoice
    → Confirmation screen (user edits) → save → Correction learning
```

- **SpeechEngine interface** (`features/voice`): `isAvailable(lang)`, `transcribe(lang)` →
  `{ text, alternatives, confidence? }`. Implementations: platform on-device recognizer first;
  whisper.rn engine later. Engines must be verified to work in airplane mode.
- **Parser** (`apps/mobile/src/parser`): pure TypeScript, no platform APIs, fully unit tested in Node.
  - Normalizer: Unicode NFC, Bengali character variants, Bengali digits → ASCII, filler removal.
  - Numbers: full Bengali 0–99 lookup table; multipliers (শ/শো, হাজার, লাখ); fractions
    (আধা/অর্ধেক, দেড়, আড়াই, সোয়া, পৌনে; half, one and a half, quarter); mixed digits and words.
  - Entity matching: only against the shop's customers, products and aliases; strip suffixes
    (-কে, -এর, -র, -রে, 's); transliteration table (Karim ↔ করিম); Jaro-Winkler scoring;
    learned corrections checked first; return top 3 candidates.
  - Intents: `SALE`, `PAYMENT`, `QUERY` (balance, today's sales).
  - Payment phrases: paid half, paid X, full/cash, all due (বাকি).
  - Every draft field has a confidence 0–1; fields < 0.75 are highlighted on the confirmation screen.
- **Language packs:** `apps/mobile/src/parser/lang/<code>/` with `numbers.json`, `fractions.json`,
  `units.json`, `payment_phrases.json`, `intent_phrases.json`, `suffixes.txt`, `fillers.txt`,
  `translit.json`. Adding a language = new folder + fixtures, no code changes.

---

## 10. API endpoints (`/api/v1`)

| Method | Path                   | Purpose                                                                    |
| ------ | ---------------------- | -------------------------------------------------------------------------- |
| POST   | `/auth/register`       | Create account (phone or email + password); returns one-time recovery code |
| POST   | `/auth/login`          | Login, returns access + refresh tokens                                     |
| POST   | `/auth/refresh`        | Rotate refresh token                                                       |
| POST   | `/auth/logout`         | Revoke refresh token                                                       |
| POST   | `/auth/recover`        | Reset password with recovery code (no SMS/email provider needed)           |
| GET    | `/me`                  | Current user + shop                                                        |
| POST   | `/devices`             | Register device, receive `deviceCode`                                      |
| GET    | `/sync/pull`           | Pull changes since cursor                                                  |
| POST   | `/sync/push`           | Push local changes                                                         |
| POST   | `/backups`             | Upload client-encrypted backup                                             |
| GET    | `/backups`             | List backups                                                               |
| GET    | `/backups/:id`         | Download backup                                                            |
| POST   | `/billing/verify`      | Verify store purchase, update entitlement                                  |
| GET    | `/billing/entitlement` | Current plan                                                               |
| POST   | `/waitlist`            | Landing page waitlist signup                                               |
| GET    | `/app-config`          | Minimum supported app version, feature flags                               |
| GET    | `/health`              | Health check                                                               |

All responses follow `{ data }` or `{ error: { code, message, details? } }`.
OpenAPI docs served at `/api/docs` in non-production environments.

---

## 11. Features

### v1 (MVP)

- **Onboarding:** no account required; shop profile; language; shop-type product templates;
  optional contacts import; add products by voice.
- **Voice billing:** hold-to-talk; on-device STT; sale/payment/query intents; confirmation screen
  with confidence highlights; learning from corrections; walk-in sales; typing fallback.
- **Invoices:** collision-free numbering; PDF/image; A4 and thermal (58/80 mm) templates; share
  sheet; Bluetooth printing (bitmap rendering for Bengali); edit/cancel with audit trail.
- **Customer ledger:** balances and history; voice payments; shareable reminder text; statement
  PDF; credit limit warning; spoken balance answers (TTS).
- **Reports:** today's summary; daily/weekly/monthly totals; top items; top debtors; PDF/CSV export.
- **Data & security:** SQLCipher; biometric/PIN lock; local encrypted backup export/restore;
  daily automatic local backups (keep last 7).
- **Account (optional):** sign up/login, encrypted cloud backup, multi-device sync.
- **Plans:** Free = 30 invoices/month + watermark. Pro = unlimited, no watermark, logo, all
  templates, printing, full reports, cloud backup and sync. Entitlement cached for offline use.
- **Landing site:** home, features, pricing, download, FAQ, privacy, terms, waitlist; en + bn.

### Later (do not build unless asked)

Supplier ledger; expenses and profit view; stock tracking; barcode scanning; staff roles;
multiple shops; more languages; whisper.rn engine; iOS release.

### Out of scope

Automatic WhatsApp sending; online payment collection; any third-party AI or speech API.

---

## 12. Environment and running locally

Each app is run from its own folder:

```
# backend
cd apps/api && pnpm install
docker compose up -d postgres          # apps/api/docker-compose.yml
pnpm migration:run && pnpm dev

# landing site
cd apps/web && pnpm install && pnpm dev

# mobile app
cd apps/mobile && pnpm install && pnpm start
```

- **Android builds on Windows:** `pnpm android` (in `apps/mobile`) builds and installs the app on
  a running emulator or connected phone. Two settings keep the C++ build inside Windows'
  260-character path limit; do not remove them: `nodeLinker: hoisted` in
  `apps/mobile/pnpm-workspace.yaml`, and the `plugins/with-short-native-build-dir.cjs` Expo
  config plugin, which puts CMake build folders in `C:\vl-cxx` (override with
  `VOICELEDGER_CXX_DIR`; safe to delete).
- Each app has `.env.example`; never commit real `.env` files.
- API config is validated at startup; the app refuses to start with missing variables.

---

## 13. Milestones (build in this order)

- [x] **M0** Repository: standalone apps, per-app tooling, CI (lint, typecheck, test, build)
- [x] **M1** design tokens + landing site with waitlist (`waitlist` API module, Postgres, migrations)
- [x] **M2** `shared` module: Money, UUIDv7, formatters, Zod schemas (`src/shared`, mirrored)
- [x] **M3** Mobile skeleton: Expo Router, theme from tokens, `core/ui` components, i18n,
      encrypted SQLite + Drizzle migrations
- [x] **M4** Shop profile, onboarding, products and customers (with aliases)
- [x] **M5** Manual invoice creation, numbering, PDF, share sheet
- [x] **M6** Ledger: payments, balances from entries, cancel/edit with audit trail, statements
- [x] **M7** `parser` module with language packs and fixtures (Node tests only)
- [x] **M8** Voice feature: SpeechEngine, confirmation screen, corrections, TTS answers
- [x] **M9** Reports, CSV/PDF export, local backup/restore, biometric lock
      (still open: daily automatic local backups, keep last 7)
- [x] **M10** Bluetooth thermal printing
- [x] **M11** API: auth, users, shops, devices, app-config
- [ ] **M12** Sync engine + encrypted cloud backups
      (done: API sync/backups with e2e tests; mobile API client, optional account, sync engine
      and auto-sync. Open: cloud backup upload/restore in the mobile backup screen)
- [x] **M12b** Web app (asked for on 2026-11-13; on 2026-11-14 widened to every app feature):
      signed-in, online-only, in `apps/web` under `/<locale>/app/`. Invoices (voice/typed, edit,
      cancel, print/PDF, share), ledger and payments, customers, products, reports with CSV/PDF,
      settings, encrypted backup export/restore. Not on web: Bluetooth printing, contact import,
      biometric lock (`docs/adr/0003`).
- [ ] **M13** Billing: store purchases, server verification, entitlements, free-tier limits
- [ ] **M14** (optional) whisper.rn engine with downloadable model packs

Manual invoicing comes before voice on purpose: voice only fills a draft that the manual flow
already knows how to save. Tick boxes here as milestones complete.

---

## 14. Testing requirements

- **Parser fixtures:** `apps/mobile/src/parser/fixtures/<lang>/*.json`
  ```json
  {
    "input": "two bags of rice to karim paid half",
    "customers": ["Karim", "Rahim"],
    "products": [{ "name": "Rice", "unit": "bag", "price": 250000 }],
    "expected": {
      "intent": "SALE",
      "customer": "Karim",
      "items": [{ "product": "Rice", "qtyMilli": 2000, "unit": "bag" }],
      "payment": { "type": "FRACTION", "value": 0.5 }
    }
  }
  ```
  At least 100 cases per v1 language, including code-mixed sentences, fractions, suffixed names,
  misheard names and missing prices. Target ≥ 90% fully correct; money math 100% correct.
- **Ledger:** after any sequence of create/pay/edit/cancel, balances equal the sum of entries
  (property-based tests).
- **Sync:** idempotent push, append-only enforcement, conflict resolution, cursor correctness
  (API e2e tests against real Postgres).
- **Backup:** export → wipe → restore yields identical data.
- **Offline:** Maestro E2E of the full core loop with networking disabled.
- **API:** unit tests per service; e2e per controller; tenant isolation tests (user A can never
  read user B's data).

---

## 15. Conventions

- Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).
- File names: `kebab-case`; React components `PascalCase`; hooks `useSomething`.
- No `any`; no non-null assertions without a comment explaining why.
- Dates stored as UTC ISO strings / epoch ms; displayed in the device's locale and time zone.
- Architecture decisions recorded as ADRs in `docs/adr/`.

---

## 16. Agent rules

1. Follow §1 Hard constraints. If a task seems to require breaking one, stop and ask.
2. Do not add any third-party service, SDK or library that makes network calls.
3. Ask before adding any new dependency; check maintenance status and Expo/RN compatibility.
4. Respect module boundaries (§6). Never import another module's internal files, and never
   import from another app or add a `workspace:*` dependency: every app is standalone (§5).
5. Use design tokens and `core/ui` components only (§7). No raw colors, sizes or spacing.
6. Never use floating point for money; always use the `Money` utilities in `src/shared`.
7. Never update or delete append-only records.
8. Every DB change (TypeORM or Drizzle) needs a migration and a migration test.
9. Keep parser behavior data-driven via language packs; no language-specific `if` chains.
10. Write or update tests in the same change as the code.
11. Work one milestone at a time in small, reviewable changes; update this README's checklist.
12. All user-facing strings go through i18n with English and Bengali.
13. After editing a mirrored folder, sync the other copy and run `node tools/mirror.mjs check`.
