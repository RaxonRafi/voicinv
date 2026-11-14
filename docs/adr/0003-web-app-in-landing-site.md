# ADR 0003: The web app lives in the landing site and owns its code

- **Status:** accepted
- **Date:** 2026-11-14
- **Milestone:** M12b

## Context

Shop owners asked for every feature of the phone app on the web, too. The website is launched
before the phone app and is deployed on its own. The user asked that the website **not use the
shared code** of the other apps: it must run independently.

## Decision

1. The signed-in web app is part of `apps/web`, under `/<locale>/app/`. It is still a static
   export: screens are client-rendered, record IDs travel in the query string
   (`/en/app/invoices/view/?id=…`).
2. It is **online only**. It signs in to `apps/api`, registers the browser as a device
   (platform `web`, its own device code, so invoice numbers never clash), pulls every record
   into memory and saves through `POST /sync/push`. Nothing is shown as saved until the server
   stored it. The shop's records are never written to browser storage; only the session tokens
   and a few display settings (theme, paper size, device ID) are.
3. Business rules (`src/dashboard/data`) mirror the phone's use cases: append-only ledger,
   cancel = `CANCELLED` + revision + `REVERSAL`, edit = revision + `ADJUSTMENT`, balances summed
   from entries, money only through `Money`.
4. The website **owns its copies** of the domain code (`src/domain`: Money, IDs, formatters,
   schemas, sync contracts) and of the voice parser (`src/parser`, with its fixtures). They are
   not listed in `tools/mirror.mjs` and may evolve separately; the sync contracts must be kept
   compatible with the API by hand. Only `design-tokens/` stays mirrored with the mobile app.
5. Voice on the web uses the browser's speech recognition **only with `processLocally`**
   (on-device). Browsers that cannot promise on-device recognition get the text box, which
   runs the same offline parser. Spoken answers use local voices only.
6. Printing and PDFs use the browser's print dialog; sharing uses the Web Share API (the OS
   share sheet) or copies the text. Backups use the phone's `VLBK` format via WebCrypto, so
   files move between web and phone. Restoring on the web only adds missing records.

## Consequences

- The landing site now talks to the API for the web app (the waitlist form was removed on
  2026-11-14; its calls to action open account creation instead); the API's `CORS_ORIGINS`
  must list the site's origin.
- A fix in the phone's parser or domain code is not copied to the web automatically (and the
  other way round). Example: the web parser normalises language-pack phrases before matching,
  which fixes "অর্ধেক দিয়েছে" (paid half) never matching; the phone still has that bug.
- Not on the web: Bluetooth thermal printing (the browser prints to any printer instead),
  contact import, biometric lock, the free-plan limit and Pro features (billing, M13, is not
  built; web invoices carry the free-plan watermark).
